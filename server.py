#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Planning Poker — servidor em tempo real, sem dependências externas.

Requer apenas Python 3.8+ (biblioteca padrão).

    python server.py            # sobe em http://0.0.0.0:8000
    PORT=3000 python server.py  # outra porta

Variáveis de ambiente opcionais:
    PORT            porta HTTP (padrão 8000)
    HOST            interface (padrão 0.0.0.0 — acessível na rede)
    DATA_DIR        pasta onde as salas são salvas (padrão ./data)
    ROOM_TTL_DAYS   dias sem uso até a sala ser apagada (padrão 30)
"""
import json
import math
import os
import re
import secrets
import socket
import statistics
import string
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(BASE_DIR, "data"))
DATA_FILE = os.path.join(DATA_DIR, "rooms.json")
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))
ROOM_TTL_DAYS = int(os.environ.get("ROOM_TTL_DAYS", "30"))

MAX_BODY = 512 * 1024
MAX_ROOMS = 5000
MAX_TOPICS = 300
MAX_PLAYERS = 100
PING_SECONDS = 15

DECKS = {
    "fibonacci": ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?", "☕"],
    "modified": ["0", "½", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "☕"],
    "tshirt": ["XS", "S", "M", "L", "XL", "XXL", "?", "☕"],
    "powers": ["0", "1", "2", "4", "8", "16", "32", "64", "?", "☕"],
}
SPECIAL_CARDS = {"?", "☕"}
ROOM_ID_RE = r"[a-z0-9]{4,32}"
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

LOCK = threading.RLock()
ROOMS = {}    # room_id -> room dict (persistido)
CLIENTS = {}  # room_id -> set[Client] (conexões em tempo real)


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# --------------------------------------------------------------------------- utilidades

def now_ms():
    return int(time.time() * 1000)


def new_id(size=10):
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(size))


def valid_token(value):
    if isinstance(value, str) and TOKEN_RE.match(value):
        return value
    return None


def same_secret(a, b):
    return bool(a and b) and secrets.compare_digest(a.encode(), b.encode())


def clean(value, max_len, multiline=False):
    if value is None:
        return ""
    text = str(value)
    if multiline:
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = "".join(ch for ch in text if ch in "\n\t" or ch.isprintable())
        text = re.sub(r"\n{3,}", "\n\n", text)
    else:
        text = " ".join("".join(ch if ch.isprintable() else " " for ch in text).split())
    return text.strip()[:max_len]


def clean_link(value):
    link = clean(value, 500)
    if not link:
        return ""
    if not re.match(r"^https?://", link, re.I):
        if "." in link and " " not in link:
            link = "https://" + link
        else:
            return ""
    return link


def to_number(card):
    if card is None:
        return None
    if card == "½":
        return 0.5
    try:
        number = float(str(card).replace(",", "."))
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def build_deck(deck_type, custom):
    if deck_type in DECKS:
        return deck_type, list(DECKS[deck_type])
    if deck_type == "custom":
        raw = custom if isinstance(custom, list) else str(custom or "").split(",")
        cards = []
        for item in raw:
            card = clean(item, 6)
            if card and card not in cards:
                cards.append(card)
        if len(cards) < 2:
            raise ApiError(400, "O baralho personalizado precisa de pelo menos 2 cartas.")
        return "custom", cards[:24]
    return "fibonacci", list(DECKS["fibonacci"])


def compute_stats(votes, deck):
    values = [v["value"] for v in votes.values() if v.get("value") is not None]
    total = len(values)
    empty = {"total": 0, "distribution": [], "average": None, "median": None, "min": None,
             "max": None, "agreement": 0, "consensus": False, "suggestion": None}
    if not total:
        return empty
    order = {card: i for i, card in enumerate(deck)}
    counts = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    distribution = [{"value": v, "count": c}
                    for v, c in sorted(counts.items(), key=lambda kv: order.get(kv[0], 999))]
    numbers = [n for n in (to_number(v) for v in values) if n is not None]
    average = round(sum(numbers) / len(numbers), 1) if numbers else None
    median = round(statistics.median(numbers), 1) if numbers else None
    top = max(counts.values())

    suggestion = None
    deck_numbers = [(card, to_number(card)) for card in deck if to_number(card) is not None]
    if numbers and deck_numbers:
        # carta do baralho mais próxima da média (em empate, a maior)
        suggestion = min(deck_numbers, key=lambda cn: (abs(cn[1] - average), -cn[1]))[0]
    else:
        candidates = [(v, c) for v, c in counts.items() if v not in SPECIAL_CARDS]
        if candidates:
            suggestion = max(candidates, key=lambda vc: (vc[1], order.get(vc[0], 0)))[0]

    return {
        "total": total,
        "distribution": distribution,
        "average": average,
        "median": median,
        "min": min(numbers) if numbers else None,
        "max": max(numbers) if numbers else None,
        "agreement": round(top * 100 / total),
        "consensus": len(counts) == 1,
        "suggestion": suggestion,
    }


# --------------------------------------------------------------------------- persistência

_save_timer = None


def save_now():
    global _save_timer
    with LOCK:
        _save_timer = None
        payload = json.dumps(ROOMS, ensure_ascii=False)
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(payload)
        os.replace(tmp, DATA_FILE)
    except OSError as exc:
        print("Aviso: não foi possível salvar os dados:", exc, file=sys.stderr)


def schedule_save():
    global _save_timer
    with LOCK:
        if _save_timer is not None:
            return
        _save_timer = threading.Timer(1.0, save_now)
        _save_timer.daemon = True
        _save_timer.start()


def load_rooms():
    try:
        with open(DATA_FILE, encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        return
    except (OSError, ValueError) as exc:
        print("Aviso: não foi possível ler", DATA_FILE, "-", exc, file=sys.stderr)
        return
    if isinstance(data, dict):
        ROOMS.update(data)


def purge_old_rooms():
    cutoff = now_ms() - ROOM_TTL_DAYS * 86_400_000
    with LOCK:
        dead = [rid for rid, room in ROOMS.items()
                if room.get("updatedAt", 0) < cutoff and not CLIENTS.get(rid)]
        for rid in dead:
            del ROOMS[rid]
    if dead:
        schedule_save()


def janitor():
    while True:
        time.sleep(3600)
        purge_old_rooms()


# --------------------------------------------------------------------------- tempo real

class Client:
    """Uma conexão de streaming aberta por um navegador."""

    def __init__(self, room_id, pid, secret):
        self.room_id = room_id
        self.pid = pid
        self.secret = secret
        self.cond = threading.Condition()
        self.pending = []  # [(is_state, message)]
        self.closed = False

    def authed(self, room):
        player = room["players"].get(self.pid)
        return bool(player and same_secret(player["secret"], self.secret))

    def push(self, message, is_state=True):
        with self.cond:
            if is_state:  # só o estado mais recente importa
                self.pending = [m for m in self.pending if not m[0]]
            self.pending.append((is_state, message))
            self.cond.notify()

    def close(self):
        with self.cond:
            self.closed = True
            self.cond.notify()

    def next_message(self, timeout):
        with self.cond:
            if not self.pending and not self.closed:
                self.cond.wait(timeout)
            if self.pending:
                return self.pending.pop(0)[1]
            if self.closed:
                return False
            return None


def online_pids(room_id):
    room = ROOMS.get(room_id)
    if not room:
        return set()
    return {c.pid for c in CLIENTS.get(room_id, ()) if c.authed(room)}


def broadcast(room_id):
    with LOCK:
        room = ROOMS.get(room_id)
        targets = list(CLIENTS.get(room_id, ()))
        if room is None:
            messages = [(c, json.dumps({"type": "deleted"})) for c in targets]
        else:
            online = online_pids(room_id)
            messages = [(c, json.dumps(public_state(room, c.pid, c.authed(room), online),
                                       ensure_ascii=False)) for c in targets]
    for client, message in messages:
        client.push(message)


# --------------------------------------------------------------------------- domínio

def get_room(room_id):
    room = ROOMS.get(room_id)
    if not room:
        raise ApiError(404, "Sala não encontrada. Ela pode ter expirado.")
    return room


def find_topic(room, topic_id):
    for topic in room["topics"]:
        if topic["id"] == topic_id:
            return topic
    raise ApiError(404, "Tópico não encontrado.")


def current_topic(room):
    tid = room.get("currentTopicId")
    for topic in room["topics"]:
        if topic["id"] == tid:
            return topic
    return None


def current_round(room):
    topic = current_topic(room)
    return topic["rounds"][-1] if topic and topic["rounds"] else None


def start_round(topic):
    topic["rounds"].append({
        "n": len(topic["rounds"]) + 1,
        "votes": {},
        "revealed": False,
        "startedAt": now_ms(),
        "revealedAt": None,
        "stats": None,
    })


def make_topic(data):
    if not isinstance(data, dict):
        data = {"title": data}
    title = clean(data.get("title"), 200)
    if not title:
        raise ApiError(400, "Informe o título do tópico.")
    return {
        "id": new_id(8),
        "title": title,
        "description": clean(data.get("description"), 4000, multiline=True),
        "link": clean_link(data.get("link")),
        "finalEstimate": None,
        "rounds": [],
        "createdAt": now_ms(),
    }


def select_topic(room, topic):
    room["currentTopicId"] = topic["id"]
    if not topic["rounds"]:
        start_round(topic)
    room["timer"] = None


def next_pending_topic(room, after=None):
    topics = room["topics"]
    if not topics:
        return None
    ref = after or current_topic(room)
    start = topics.index(ref) + 1 if ref in topics else 0
    for i in range(len(topics)):
        topic = topics[(start + i) % len(topics)]
        if topic is not ref and topic["finalEstimate"] is None:
            return topic
    return None


def reveal(room, rnd):
    rnd["revealed"] = True
    rnd["revealedAt"] = now_ms()
    rnd["stats"] = compute_stats(rnd["votes"], room["deck"])
    room["timer"] = None


def maybe_auto_reveal(room):
    if not room["settings"].get("autoReveal"):
        return
    rnd = current_round(room)
    if not rnd or rnd["revealed"] or not rnd["votes"]:
        return
    online = online_pids(room["id"])
    voters = [p for p in room["players"].values() if not p["spectator"] and p["id"] in online]
    if voters and all(p["id"] in rnd["votes"] for p in voters):
        reveal(room, rnd)


def drop_open_vote(room, pid):
    rnd = current_round(room)
    if rnd and not rnd["revealed"]:
        rnd["votes"].pop(pid, None)


def public_state(room, viewer_pid, viewer_authed, online):
    rnd = current_round(room)
    players = []
    for p in sorted(room["players"].values(), key=lambda pl: pl["joinedAt"]):
        voted = bool(rnd and p["id"] in rnd["votes"])
        players.append({
            "id": p["id"],
            "name": p["name"],
            "spectator": p["spectator"],
            "isAdmin": p["isAdmin"],
            "online": p["id"] in online,
            "voted": voted,
            "vote": rnd["votes"][p["id"]]["value"] if voted and rnd["revealed"] else None,
        })
    topics = []
    for t in room["topics"]:
        rounds = []
        for r in t["rounds"]:
            rounds.append({
                "n": r["n"],
                "revealed": r["revealed"],
                "startedAt": r["startedAt"],
                "revealedAt": r["revealedAt"],
                "voteCount": len(r["votes"]),
                "stats": r["stats"] if r["revealed"] else None,
                "votes": [{"name": v["name"], "value": v["value"]} for v in r["votes"].values()]
                if r["revealed"] else [],
            })
        topics.append({
            "id": t["id"],
            "title": t["title"],
            "description": t["description"],
            "link": t["link"],
            "finalEstimate": t["finalEstimate"],
            "rounds": rounds,
        })
    me = room["players"].get(viewer_pid) if viewer_authed else None
    my_vote = None
    if me and rnd and viewer_pid in rnd["votes"]:
        my_vote = rnd["votes"][viewer_pid]["value"]
    return {
        "type": "state",
        "serverNow": now_ms(),
        "room": {
            "id": room["id"],
            "name": room["name"],
            "deck": room["deck"],
            "deckType": room["deckType"],
            "settings": room["settings"],
            "currentTopicId": room.get("currentTopicId"),
            "timer": room.get("timer"),
        },
        "players": players,
        "topics": topics,
        "me": {
            "joined": bool(me),
            "id": viewer_pid if me else None,
            "name": me["name"] if me else None,
            "isAdmin": bool(me and me["isAdmin"]),
            "spectator": bool(me and me["spectator"]),
        },
        "myVote": my_vote,
    }


def create_room(body):
    with LOCK:
        if len(ROOMS) >= MAX_ROOMS:
            raise ApiError(503, "Limite de salas atingido no servidor.")
        deck_type, deck = build_deck(body.get("deckType"), body.get("customDeck"))
        room_id = new_id(10)
        while room_id in ROOMS:
            room_id = new_id(10)
        room = {
            "id": room_id,
            "name": clean(body.get("name"), 60) or "Refinamento",
            "deckType": deck_type,
            "deck": deck,
            "adminToken": secrets.token_urlsafe(18),
            "settings": {
                "facilitatorOnly": bool(body.get("facilitatorOnly", True)),
                "autoReveal": bool(body.get("autoReveal", False)),
            },
            "players": {},
            "topics": [],
            "currentTopicId": None,
            "timer": None,
            "createdAt": now_ms(),
            "updatedAt": now_ms(),
        }
        for item in (body.get("topics") or [])[:MAX_TOPICS]:
            try:
                room["topics"].append(make_topic(item))
            except ApiError:
                continue
        if room["topics"]:
            select_topic(room, room["topics"][0])
        ROOMS[room_id] = room
    schedule_save()
    return {"id": room_id, "adminToken": room["adminToken"]}


def handle_action(room_id, body):
    kind = body.get("type")
    pid = valid_token(body.get("pid"))
    secret = valid_token(body.get("secret"))
    kicked_pid = None
    result = {"ok": True}

    with LOCK:
        room = get_room(room_id)
        player = room["players"].get(pid) if pid else None
        authed = bool(player and same_secret(player["secret"], secret))
        token = body.get("adminToken")
        token_ok = isinstance(token, str) and same_secret(token, room["adminToken"])

        if kind == "join":
            if not pid or not secret:
                raise ApiError(400, "Identificação inválida. Recarregue a página.")
            if player and not authed:
                raise ApiError(409, "Identificação já em uso. Recarregue a página.")
            name = clean(body.get("name"), 30)
            if not name:
                raise ApiError(400, "Informe seu nome ou apelido.")
            if player is None:
                if len(room["players"]) >= MAX_PLAYERS:
                    raise ApiError(400, "A sala está cheia.")
                player = {"id": pid, "secret": secret, "name": name,
                          "spectator": bool(body.get("spectator")),
                          "isAdmin": token_ok, "joinedAt": now_ms()}
                room["players"][pid] = player
            else:
                player["name"] = name
                player["spectator"] = bool(body.get("spectator"))
                player["isAdmin"] = player["isAdmin"] or token_ok
            if player["spectator"]:
                drop_open_vote(room, pid)
        else:
            if not authed:
                raise ApiError(401, "Entre na sala para participar.")
            if token_ok:
                player["isAdmin"] = True
            is_admin = player["isAdmin"]
            can_control = is_admin or not room["settings"].get("facilitatorOnly", True)

            def need_control():
                if not can_control:
                    raise ApiError(403, "Apenas o facilitador pode fazer isso.")

            def need_admin():
                if not is_admin:
                    raise ApiError(403, "Apenas o facilitador pode fazer isso.")

            rnd = current_round(room)

            if kind == "claim_admin":
                if not token_ok:
                    raise ApiError(403, "Link de facilitador inválido.")

            elif kind == "update_me":
                name = clean(body.get("name"), 30)
                if name:
                    player["name"] = name
                    if rnd and not rnd["revealed"] and pid in rnd["votes"]:
                        rnd["votes"][pid]["name"] = name
                if "spectator" in body:
                    player["spectator"] = bool(body.get("spectator"))
                    if player["spectator"]:
                        drop_open_vote(room, pid)
                maybe_auto_reveal(room)

            elif kind == "leave":
                drop_open_vote(room, pid)
                del room["players"][pid]

            elif kind == "vote":
                if player["spectator"]:
                    raise ApiError(400, "Espectadores não votam.")
                if not rnd:
                    raise ApiError(400, "Nenhuma votação em andamento.")
                if rnd["revealed"]:
                    raise ApiError(400, "As cartas já foram reveladas.")
                value = body.get("value")
                if value is None:
                    rnd["votes"].pop(pid, None)
                else:
                    value = str(value)
                    if value not in room["deck"]:
                        raise ApiError(400, "Carta inválida.")
                    rnd["votes"][pid] = {"name": player["name"], "value": value, "at": now_ms()}
                    maybe_auto_reveal(room)

            elif kind == "reveal":
                need_control()
                if not rnd or rnd["revealed"]:
                    raise ApiError(400, "Não há cartas para revelar.")
                if not rnd["votes"]:
                    raise ApiError(400, "Ninguém votou ainda.")
                reveal(room, rnd)

            elif kind == "new_round":
                need_control()
                topic = current_topic(room)
                if not topic:
                    raise ApiError(400, "Selecione um tópico primeiro.")
                if rnd and not rnd["revealed"]:
                    rnd["votes"] = {}
                    rnd["startedAt"] = now_ms()
                else:
                    start_round(topic)
                room["timer"] = None

            elif kind == "select_topic":
                need_control()
                select_topic(room, find_topic(room, body.get("topicId")))

            elif kind == "next_topic":
                need_control()
                topic = next_pending_topic(room)
                if not topic:
                    raise ApiError(400, "Não há mais tópicos pendentes.")
                select_topic(room, topic)

            elif kind == "quick_round":
                need_control()
                if len(room["topics"]) >= MAX_TOPICS:
                    raise ApiError(400, "Limite de tópicos atingido.")
                count = sum(1 for t in room["topics"] if t["title"].startswith("Votação rápida")) + 1
                topic = make_topic({"title": f"Votação rápida #{count}"})
                room["topics"].append(topic)
                select_topic(room, topic)

            elif kind == "add_topics":
                need_control()
                items = body.get("topics")
                if not isinstance(items, list) or not items:
                    raise ApiError(400, "Nenhum tópico informado.")
                created = []
                for item in items:
                    try:
                        created.append(make_topic(item))
                    except ApiError:
                        continue
                if not created:
                    raise ApiError(400, "Informe o título do tópico.")
                if len(room["topics"]) + len(created) > MAX_TOPICS:
                    raise ApiError(400, f"Limite de {MAX_TOPICS} tópicos por sala.")
                room["topics"].extend(created)
                if not current_topic(room):
                    select_topic(room, created[0])
                result["created"] = len(created)

            elif kind == "edit_topic":
                need_control()
                topic = find_topic(room, body.get("topicId"))
                title = clean(body.get("title"), 200)
                if not title:
                    raise ApiError(400, "Informe o título do tópico.")
                topic["title"] = title
                topic["description"] = clean(body.get("description"), 4000, multiline=True)
                topic["link"] = clean_link(body.get("link"))

            elif kind == "delete_topic":
                need_control()
                topic = find_topic(room, body.get("topicId"))
                was_current = topic is current_topic(room)
                nxt = next_pending_topic(room, after=topic) if was_current else None
                room["topics"].remove(topic)
                if was_current:
                    room["currentTopicId"] = None
                    room["timer"] = None
                    if nxt:
                        select_topic(room, nxt)

            elif kind == "move_topic":
                need_control()
                topic = find_topic(room, body.get("topicId"))
                topics = room["topics"]
                i = topics.index(topic)
                j = i + (1 if body.get("direction", 1) > 0 else -1)
                if 0 <= j < len(topics):
                    topics[i], topics[j] = topics[j], topics[i]

            elif kind == "set_final":
                need_control()
                topic = find_topic(room, body.get("topicId"))
                topic["finalEstimate"] = clean(body.get("value"), 12) or None
                if body.get("advance") and topic["finalEstimate"] is not None:
                    nxt = next_pending_topic(room, after=topic)
                    if nxt:
                        select_topic(room, nxt)
                        result["advanced"] = True

            elif kind == "timer_start":
                need_control()
                try:
                    seconds = int(body.get("seconds", 60))
                except (TypeError, ValueError):
                    seconds = 60
                seconds = max(5, min(3600, seconds))
                room["timer"] = {"endsAt": now_ms() + seconds * 1000, "duration": seconds}

            elif kind == "timer_stop":
                need_control()
                room["timer"] = None

            elif kind == "kick":
                need_admin()
                target = valid_token(body.get("targetId"))
                if not target or target not in room["players"]:
                    raise ApiError(404, "Participante não encontrado.")
                if target == pid:
                    raise ApiError(400, "Use \"Sair da sala\" para sair.")
                drop_open_vote(room, target)
                del room["players"][target]
                kicked_pid = target
                maybe_auto_reveal(room)

            elif kind == "set_admin":
                need_admin()
                target = room["players"].get(valid_token(body.get("targetId")) or "")
                if not target:
                    raise ApiError(404, "Participante não encontrado.")
                value = bool(body.get("value", True))
                if not value and target["id"] == pid and \
                        sum(1 for p in room["players"].values() if p["isAdmin"]) <= 1:
                    raise ApiError(400, "A sala precisa de pelo menos um facilitador.")
                target["isAdmin"] = value

            elif kind == "update_settings":
                need_admin()
                if "name" in body:
                    room["name"] = clean(body.get("name"), 60) or room["name"]
                settings = body.get("settings") or {}
                for key in ("facilitatorOnly", "autoReveal"):
                    if key in settings:
                        room["settings"][key] = bool(settings[key])
                if body.get("deckType"):
                    deck_type, deck = build_deck(body.get("deckType"), body.get("customDeck"))
                    if deck != room["deck"]:
                        room["deck"], room["deckType"] = deck, deck_type
                        if rnd and not rnd["revealed"]:
                            rnd["votes"] = {}
                maybe_auto_reveal(room)

            else:
                raise ApiError(400, "Ação desconhecida.")

        room["updatedAt"] = now_ms()
        kicked_clients = [c for c in CLIENTS.get(room_id, ()) if kicked_pid and c.pid == kicked_pid]

    schedule_save()
    broadcast(room_id)
    for client in kicked_clients:
        client.push(json.dumps({"type": "kicked"}), is_state=False)
    return result


# --------------------------------------------------------------------------- HTTP

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "PlanningPoker/1.0"

    def log_message(self, fmt, *args):  # silencioso; erros são impressos à parte
        pass

    # -- helpers
    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length > MAX_BODY:
            raise ApiError(413, "Conteúdo grande demais.")
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, ValueError):
            raise ApiError(400, "JSON inválido.")
        if not isinstance(data, dict):
            raise ApiError(400, "JSON inválido.")
        return data

    def serve_static(self, path):
        if path == "/" or re.fullmatch(r"/r/" + ROOM_ID_RE + r"/?", path):
            rel = "index.html"
        else:
            rel = path.lstrip("/")
        full = os.path.normpath(os.path.join(PUBLIC_DIR, rel))
        if not full.startswith(PUBLIC_DIR + os.sep) or not os.path.isfile(full):
            body = "Página não encontrada".encode("utf-8")
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        with open(full, "rb") as fh:
            body = fh.read()
        ext = os.path.splitext(full)[1].lower()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    # -- rotas
    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == "/healthz":
                return self.send_json(200, {"ok": True})
            if path == "/api/decks":
                return self.send_json(200, DECKS)
            m = re.fullmatch(r"/api/rooms/(" + ROOM_ID_RE + r")", path)
            if m:
                with LOCK:
                    room = get_room(m.group(1))
                    online = online_pids(room["id"])
                    info = {"id": room["id"], "name": room["name"],
                            "deckType": room["deckType"], "online": len(online)}
                return self.send_json(200, info)
            if path.startswith("/api/"):
                raise ApiError(404, "Rota não encontrada.")
            self.serve_static(path)
        except ApiError as err:
            self.send_json(err.status, {"error": err.message})
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"error": "Erro interno."})

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/rooms":
                return self.send_json(201, create_room(self.read_json()))
            m = re.fullmatch(r"/api/rooms/(" + ROOM_ID_RE + r")/action", path)
            if m:
                return self.send_json(200, handle_action(m.group(1), self.read_json()))
            m = re.fullmatch(r"/api/rooms/(" + ROOM_ID_RE + r")/stream", path)
            if m:
                return self.stream(m.group(1), self.read_json())
            raise ApiError(404, "Rota não encontrada.")
        except ApiError as err:
            self.send_json(err.status, {"error": err.message})
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"error": "Erro interno."})

    def stream(self, room_id, body):
        """Mantém a conexão aberta enviando o estado da sala (formato text/event-stream)."""
        pid = valid_token(body.get("pid")) or ""
        secret = valid_token(body.get("secret")) or ""
        with LOCK:
            get_room(room_id)
            client = Client(room_id, pid, secret)
            CLIENTS.setdefault(room_id, set()).add(client)
        self.close_connection = True
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-transform")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()
            self.wfile.write(b": conectado\n\n")
            self.wfile.flush()
            broadcast(room_id)  # avisa todos (presença) e envia o estado inicial
            while True:
                message = client.next_message(PING_SECONDS)
                if message is False:
                    break
                if message is None:
                    self.wfile.write(b": ping\n\n")
                else:
                    self.wfile.write(b"data: " + message.encode("utf-8") + b"\n\n")
                self.wfile.flush()
        except OSError:
            pass
        finally:
            with LOCK:
                group = CLIENTS.get(room_id)
                if group:
                    group.discard(client)
                    if not group:
                        CLIENTS.pop(room_id, None)
                room = ROOMS.get(room_id)
                if room:
                    maybe_auto_reveal(room)
            broadcast(room_id)


def lan_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("10.255.255.255", 1))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def main():
    try:
        sys.stdout.reconfigure(errors="replace")
    except AttributeError:
        pass
    load_rooms()
    purge_old_rooms()
    threading.Thread(target=janitor, daemon=True).start()
    ThreadingHTTPServer.daemon_threads = True
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print("Planning Poker rodando!")
    print(f"  Neste computador:   http://localhost:{PORT}")
    if HOST in ("0.0.0.0", ""):
        print(f"  Na rede/VPN:        http://{lan_ip()}:{PORT}")
    print("  Ctrl+C para parar.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        save_now()
        httpd.server_close()


if __name__ == "__main__":
    main()
