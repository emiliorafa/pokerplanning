/* Planning Poker — front-end (JavaScript puro, sem build). */
(() => {
  'use strict';

  // ------------------------------------------------------------------ utilidades
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem storage */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* sem storage */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ok */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ok */ } },
  };
  const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  const rand = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, (b) => ALPHA[b & 63]).join(''); };
  const toNum = (v) => {
    if (v == null || v === '') return null;
    if (v === '½') return 0.5;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const hue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const linkify = (escaped) => escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sala';

  const DECKS = {
    fibonacci: { label: 'Fibonacci', cards: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'] },
    modified: { label: 'Fibonacci modificado', cards: ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '☕'] },
    tshirt: { label: 'Camisetas (P/M/G)', cards: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕'] },
    powers: { label: 'Potências de 2', cards: ['0', '1', '2', '4', '8', '16', '32', '64', '?', '☕'] },
    custom: { label: 'Personalizado', cards: [] },
  };

  const ICON = {
    logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="7" width="15" height="21" rx="3.5" fill="var(--primary-300)" transform="rotate(-12 10.5 17.5)"/><rect x="12" y="4" width="16" height="23" rx="3.5" fill="var(--primary)"/><text x="20" y="20.5" font-size="11" font-weight="800" fill="#fff" text-anchor="middle" font-family="Inter,Arial,sans-serif">5</text></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    crown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l-2-10-5 4-2-6-2 6-5-4z" fill="currentColor" stroke="none"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 4v6h6"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/></svg>',
  };

  const app = $('#app');

  // ------------------------------------------------------------------ tema
  function currentTheme() {
    return document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('pp:theme', next);
    $$('[data-action="theme"]').forEach((b) => { b.innerHTML = themeIcon(); });
  }
  const themeIcon = () => (currentTheme() === 'dark' ? ICON.sun : ICON.moon);
  const themeBtn = () => `<button class="icon-btn" data-action="theme" title="Alternar tema claro/escuro" aria-label="Alternar tema">${themeIcon()}</button>`;

  // ------------------------------------------------------------------ toasts, modais, clipboard
  function toast(msg, kind = 'info') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fallback abaixo */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  let modalOnClose = null;
  function openModal(html, { wide = false, onClose = null } = {}) {
    closeModal();
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-backdrop" data-close-modal>
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    modalOnClose = onClose;
    const first = $('[autofocus]', root) || $('input, textarea, select, button.btn-primary', root);
    if (first) setTimeout(() => first.focus(), 30);
    return $('.modal', root);
  }
  function closeModal() {
    const root = $('#modal-root');
    if (root && root.innerHTML) {
      root.innerHTML = '';
      const cb = modalOnClose; modalOnClose = null;
      if (cb) cb();
    }
  }
  function modalHead(title, sub = '') {
    return `<div class="modal-head"><div><h3>${title}</h3>${sub ? `<p class="muted">${sub}</p>` : ''}</div>
      <button class="icon-btn" data-close-modal aria-label="Fechar">${ICON.close}</button></div>`;
  }
  function confirmDialog(text, okLabel = 'Confirmar', danger = false) {
    return new Promise((resolve) => {
      let answered = false;
      const modal = openModal(`${modalHead('Tem certeza?')}
        <p class="modal-text">${text}</p>
        <div class="modal-actions"><button class="btn" data-close-modal>Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${okLabel}</button></div>`,
      { onClose: () => { if (!answered) resolve(false); } });
      $('#confirm-ok', modal).addEventListener('click', () => { answered = true; closeModal(); resolve(true); });
    });
  }

  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('modal-backdrop')) { closeModal(); return; }
    if (e.target.closest('.modal [data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ------------------------------------------------------------------ API
  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* sem corpo */ }
    if (!res.ok) { const err = new Error(data.error || 'Falha na comunicação com o servidor.'); err.status = res.status; throw err; }
    return data;
  }

  // ================================================================== HOME
  function renderHome() {
    document.title = 'Planning Poker';
    const profile = store.get('pp:profile', {});
    const recent = store.get('pp:recent', []).slice(0, 6);
    app.innerHTML = `
      <header class="topbar"><a class="brand" href="/">${ICON.logo}<span>Planning Poker</span></a>
        <div class="topbar-actions">${themeBtn()}</div></header>
      <main class="home">
        <section class="hero">
          <span class="eyebrow">Para cerimônias de refinamento</span>
          <h1>Estime em equipe,<br><span class="hl">em tempo real.</span></h1>
          <p class="lead">Crie uma sala, organize os tópicos e mande um link para o time. Os devs entram só com nome ou apelido — sem cadastro, sem login.</p>
          <ul class="hero-points">
            <li><b>Tópicos separados</b> com estimativa final e histórico</li>
            <li><b>Várias rodadas</b> por tópico, quando não houver consenso</li>
            <li><b>Link público</b> para votar de qualquer lugar</li>
            <li><b>Média, mediana e concordância</b> calculadas na hora</li>
          </ul>
          <div class="hero-cards" aria-hidden="true">
            <span class="hc" style="--r:-14deg">3</span><span class="hc hc-on" style="--r:-4deg">5</span><span class="hc" style="--r:7deg">8</span><span class="hc" style="--r:16deg">13</span>
          </div>
          ${recent.length ? `<div class="recent"><h4>Salas recentes</h4>${recent.map((r) => `
            <a class="recent-item" href="/r/${esc(r.id)}"><span>${esc(r.name)}</span>${r.admin ? '<span class="tag tag-primary">Facilitador</span>' : '<span class="tag">Participante</span>'}</a>`).join('')}</div>` : ''}
        </section>
        <form class="panel create-form" id="create-form" autocomplete="off">
          <h2>Criar nova sala</h2>
          <label class="field"><span>Nome da sala</span>
            <input name="name" maxlength="60" required placeholder="Ex.: Refinamento – Sprint 42"></label>
          <label class="field"><span>Seu nome (facilitador)</span>
            <input name="facilitator" maxlength="30" required placeholder="Como o time te chama" value="${esc(profile.name || '')}"></label>
          <div class="field"><span>Baralho</span>
            <div class="deck-options">${Object.entries(DECKS).map(([k, d], i) => `
              <label class="deck-opt"><input type="radio" name="deckType" value="${k}" ${i === 0 ? 'checked' : ''}>
                <span class="deck-opt-box"><b>${d.label}</b><small>${k === 'custom' ? 'Defina as suas cartas' : esc(d.cards.join(' · '))}</small></span></label>`).join('')}
            </div>
            <input name="customDeck" class="custom-deck hidden" maxlength="200" placeholder="Separe por vírgula. Ex.: 1, 2, 3, 5, 8, ?">
          </div>
          <label class="field"><span>Tópicos <em class="muted">(opcional — um por linha; links são detectados)</em></span>
            <textarea name="topics" rows="4" placeholder="PROJ-101 Tela de login com SSO&#10;PROJ-102 Exportar relatório em CSV https://jira/PROJ-102"></textarea></label>
          <div class="checks">
            <label class="check"><input type="checkbox" name="spectator"> <span>Vou só facilitar (não voto)</span></label>
            <label class="check"><input type="checkbox" name="autoReveal"> <span>Revelar automaticamente quando todos votarem</span></label>
          </div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">Criar sala e convidar o time</button>
        </form>
      </main>`;

    const form = $('#create-form');
    form.addEventListener('change', () => {
      $('.custom-deck', form).classList.toggle('hidden', form.deckType.value !== 'custom');
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      const fd = new FormData(form);
      const facilitator = String(fd.get('facilitator') || '').trim();
      btn.disabled = true; btn.textContent = 'Criando…';
      try {
        const created = await api('/api/rooms', {
          name: fd.get('name'),
          deckType: fd.get('deckType'),
          customDeck: fd.get('customDeck'),
          topics: parseTopicLines(String(fd.get('topics') || '')),
          autoReveal: !!fd.get('autoReveal'),
        });
        const ident = { pid: rand(16), secret: rand(32), adminToken: created.adminToken };
        store.set(`pp:room:${created.id}`, ident);
        await api(`/api/rooms/${created.id}/action`, {
          type: 'join', pid: ident.pid, secret: ident.secret, adminToken: ident.adminToken,
          name: facilitator, spectator: !!fd.get('spectator'),
        });
        store.set('pp:profile', { name: facilitator });
        rememberRoom(created.id, String(fd.get('name') || 'Refinamento'), true);
        session.set('pp:justCreated', created.id);
        location.href = `/r/${created.id}`;
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Criar sala e convidar o time';
      }
    });
  }

  function parseTopicLines(text) {
    return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const url = (line.match(/https?:\/\/\S+/) || [])[0] || '';
      const title = line.replace(url, '').replace(/[\s|–-]+$/, '').trim() || url;
      return { title, link: url };
    });
  }

  function rememberRoom(id, name, admin) {
    const list = store.get('pp:recent', []).filter((r) => r.id !== id);
    const prev = store.get('pp:recent', []).find((r) => r.id === id);
    list.unshift({ id, name, admin: admin || !!(prev && prev.admin), at: Date.now() });
    store.set('pp:recent', list.slice(0, 12));
  }

  // ================================================================== SALA
  const R = {
    id: null, ident: null, info: null, state: null, view: null, offset: 0,
    conn: 'connecting', ctrl: null, retry: 0, kicked: false, gone: false, lastData: 0,
    ui: {
      tab: 'topics', filter: 'all', expanded: new Set(), sidebarOpen: false,
      descOpen: false, autoAdvance: true, revealKey: null, flipUntil: 0, timerDoneFor: null,
    },
  };
  const narrowMq = matchMedia('(max-width: 640px)');

  function saveIdent() { store.set(`pp:room:${R.id}`, R.ident); }
  const S = () => R.state;
  const me = () => (R.state ? R.state.me : {});
  const canControl = () => !!(R.state && R.state.me.joined && (R.state.me.isAdmin || !R.state.room.settings.facilitatorOnly));
  const curTopic = () => (R.state ? R.state.topics.find((t) => t.id === R.state.room.currentTopicId) || null : null);
  const curRound = () => { const t = curTopic(); return t && t.rounds.length ? t.rounds[t.rounds.length - 1] : null; };

  async function act(type, payload = {}) {
    try {
      return await api(`/api/rooms/${R.id}/action`, {
        type, pid: R.ident.pid, secret: R.ident.secret, adminToken: R.ident.adminToken || undefined, ...payload,
      });
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  }

  async function initRoom(id) {
    R.id = id;
    R.ident = store.get(`pp:room:${id}`) || {};
    const hm = location.hash.match(/admin=([A-Za-z0-9_-]{8,64})/);
    if (hm) { R.ident.adminToken = hm[1]; history.replaceState(null, '', location.pathname); }
    if (!R.ident.pid || !R.ident.secret) { R.ident.pid = rand(16); R.ident.secret = rand(32); }
    saveIdent();
    renderCenter('<div class="spinner"></div><p class="muted">Conectando à sala…</p>');
    try {
      R.info = await api(`/api/rooms/${id}`);
    } catch (err) {
      if (err.status === 404) return renderGone();
      return renderCenter(`<h2>Não foi possível conectar</h2><p class="muted">${esc(err.message)}</p>
        <button class="btn btn-primary" onclick="location.reload()">Tentar novamente</button>`);
    }
    document.title = `${R.info.name} · Planning Poker`;
    connect();
    setInterval(tick, 500);
    narrowMq.addEventListener('change', () => { if (R.view === 'room') { const ta = $('#table-area'); if (ta) ta._html = null; updateRoom(); } });
  }

  function renderCenter(inner) {
    app.innerHTML = `<header class="topbar"><a class="brand" href="/">${ICON.logo}<span>Planning Poker</span></a>
      <div class="topbar-actions">${themeBtn()}</div></header><main class="center-screen"><div class="panel center-card">${inner}</div></main>`;
  }
  function renderGone() {
    R.gone = true;
    if (R.ctrl) R.ctrl.abort();
    renderCenter(`<div class="big-emoji">🃏</div><h2>Sala não encontrada</h2>
      <p class="muted">O link pode estar errado ou a sala expirou por falta de uso.</p>
      <a class="btn btn-primary" href="/">Criar uma nova sala</a>`);
  }

  // -- streaming em tempo real (fetch + text/event-stream)
  async function connect() {
    if (R.gone || R.kicked) return;
    const ctrl = new AbortController();
    R.ctrl = ctrl;
    setConn(R.state ? 'reconnecting' : 'connecting');
    try {
      const res = await fetch(`/api/rooms/${R.id}/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: ctrl.signal,
        body: JSON.stringify({ pid: R.ident.pid, secret: R.ident.secret }),
      });
      if (res.status === 404) return renderGone();
      if (!res.ok || !res.body) throw new Error('stream');
      R.lastData = Date.now();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        R.lastData = Date.now();
        R.retry = 0;
        if (R.conn !== 'online') setConn('online');
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const data = chunk.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
          if (data) { try { onMessage(JSON.parse(data)); } catch (e) { console.error(e); } }
        }
      }
    } catch (e) {
      if (ctrl.signal.aborted && (R.gone || R.kicked)) return;
    }
    if (R.ctrl !== ctrl || R.gone || R.kicked) return;
    setConn('reconnecting');
    R.retry = Math.min(R.retry + 1, 6);
    setTimeout(connect, 600 * R.retry);
  }
  // se a conexão "morrer" silenciosamente (sem pings), reconecta
  setInterval(() => {
    if (R.ctrl && R.conn === 'online' && Date.now() - R.lastData > 40000) R.ctrl.abort();
  }, 5000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && R.ctrl && Date.now() - R.lastData > 20000) R.ctrl.abort();
  });

  function setConn(c) {
    R.conn = c;
    const el = $('#conn');
    if (el) {
      el.className = `conn conn-${c}`;
      el.title = c === 'online' ? 'Conectado em tempo real' : 'Reconectando…';
      el.innerHTML = c === 'online' ? '' : '<span>Reconectando…</span>';
    }
  }

  function onMessage(msg) {
    if (msg.type === 'kicked') {
      R.kicked = true;
      if (R.ctrl) R.ctrl.abort();
      closeModal();
      R.view = 'kicked';
      renderCenter(`<div class="big-emoji">👋</div><h2>Você foi removido da sala</h2>
        <p class="muted">O facilitador removeu você desta sessão.</p>
        <button class="btn btn-primary" data-action="rejoin">Entrar novamente</button>`);
      return;
    }
    if (msg.type === 'deleted') return renderGone();
    if (msg.type !== 'state') return;

    const prev = R.state;
    R.state = msg;
    R.offset = msg.serverNow - Date.now();

    // claim de facilitador (abriu o link de facilitador já estando na sala)
    if (msg.me.joined && !msg.me.isAdmin && R.ident.adminToken && !R.claimTried) {
      R.claimTried = true;
      act('claim_admin').then((r) => { if (!r) { delete R.ident.adminToken; saveIdent(); } });
    }
    const remKey = `${msg.room.name}|${msg.me.isAdmin}`;
    if (msg.me.joined && R.remembered !== remKey) { R.remembered = remKey; rememberRoom(R.id, msg.room.name, msg.me.isAdmin); }

    const view = msg.me.joined ? 'room' : 'join';
    if (R.view !== view) {
      R.view = view;
      if (view === 'room') mountRoom(); else renderJoin();
    }
    if (view === 'room') {
      detectReveal(prev);
      updateRoom();
      if (session.get('pp:justCreated') === R.id) { session.del('pp:justCreated'); openInvite(true); }
    } else {
      const cnt = $('#join-online');
      if (cnt) cnt.textContent = onlineText();
    }
    document.title = `${msg.room.name} · Planning Poker`;
  }

  function onlineText() {
    const n = R.state ? R.state.players.filter((p) => p.online).length : (R.info ? R.info.online : 0);
    return n ? `${plural(n, 'pessoa', 'pessoas')} na sala agora` : 'Ninguém na sala ainda — seja o primeiro!';
  }

  function detectReveal(prev) {
    const t = curTopic(); const r = curRound();
    if (!t || !r) return;
    const key = `${t.id}:${r.n}`;
    const wasRevealed = prev && (() => {
      const pt = prev.topics.find((x) => x.id === t.id);
      const pr = pt && pt.rounds.find((x) => x.n === r.n);
      return pr && pr.revealed;
    })();
    if (r.revealed && prev && !wasRevealed && R.ui.revealKey !== key) {
      R.ui.revealKey = key;
      R.ui.flipUntil = Date.now() + 900;
      setTimeout(() => updateRoom(), 950);
      if (r.stats && r.stats.consensus && r.stats.total > 1) confetti();
    }
  }

  // -- tela de entrada (link público)
  function renderJoin() {
    const profile = store.get('pp:profile', {});
    const room = R.state ? R.state.room : R.info;
    app.innerHTML = `
      <header class="topbar"><a class="brand" href="/">${ICON.logo}<span>Planning Poker</span></a>
        <div class="topbar-actions">${themeBtn()}</div></header>
      <main class="center-screen">
        <form class="panel center-card join-card" id="join-form" autocomplete="off">
          <div class="join-cards" aria-hidden="true"><span>1</span><span class="on">3</span><span>8</span></div>
          <span class="eyebrow">Você foi convidado para</span>
          <h1 class="join-title">${esc(room.name)}</h1>
          <p class="muted" id="join-online">${esc(onlineText())}</p>
          <label class="field"><span>Seu nome ou apelido</span>
            <input name="name" maxlength="30" required autofocus placeholder="Ex.: Ana, Dev Backend, 🦊" value="${esc(profile.name || '')}"></label>
          <label class="check"><input type="checkbox" name="spectator"> <span>Entrar como espectador (só acompanhar, sem votar)</span></label>
          <button class="btn btn-primary btn-lg btn-block" type="submit">Entrar na sala</button>
          <p class="fine">Sem cadastro: seu nome fica salvo apenas neste navegador.</p>
        </form>
      </main>`;
    const form = $('#join-form');
    setTimeout(() => form.name.focus(), 30);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      if (!name) return;
      const btn = $('button[type=submit]', form);
      btn.disabled = true; btn.textContent = 'Entrando…';
      const ok = await act('join', { name, spectator: form.spectator.checked });
      if (ok) store.set('pp:profile', { name });
      else { btn.disabled = false; btn.textContent = 'Entrar na sala'; }
    });
  }

  // -- esqueleto da sala
  function mountRoom() {
    app.innerHTML = `
      <header class="topbar room-top">
        <div class="brand-wrap"><a class="brand brand-compact" href="/" title="Início">${ICON.logo}</a>
          <div class="room-title" id="room-title"></div><span id="conn" class="conn"></span></div>
        <div class="topbar-actions" id="top-actions"></div>
      </header>
      <div class="room-layout">
        <main class="stage">
          <section id="topic-bar" class="topic-bar"></section>
          <section id="table-area" class="table-area"></section>
          <section id="bottom-area" class="bottom-area"></section>
        </main>
        <aside id="sidebar" class="sidebar" aria-label="Tópicos e participantes"></aside>
        <div class="scrim" data-action="close-sidebar"></div>
      </div>`;
    setConn(R.conn);
  }

  // Atualiza uma região só se o HTML mudou, preservando foco e campos digitados.
  function patch(el, html) {
    if (!el || el._html === html) return;
    const active = document.activeElement;
    const focusId = active && active.id && el.contains(active) ? active.id : null;
    let sel = null;
    if (focusId) { try { sel = [active.selectionStart, active.selectionEnd]; } catch (e) { sel = null; } }
    const kept = {};
    $$('[data-keep][id]', el).forEach((i) => { kept[i.id] = i.value; });
    const scroll = $$('[data-scroll-keep]', el).map((n) => n.scrollTop);
    el.innerHTML = html;
    el._html = html;
    Object.entries(kept).forEach(([k, v]) => { const n = document.getElementById(k); if (n) n.value = v; });
    $$('[data-scroll-keep]', el).forEach((n, i) => { if (scroll[i] != null) n.scrollTop = scroll[i]; });
    if (focusId) {
      const n = document.getElementById(focusId);
      if (n) { n.focus(); if (sel && sel[0] != null) { try { n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ok */ } } }
    }
  }

  function updateRoom() {
    if (R.view !== 'room' || !R.state) return;
    patch($('#room-title'), renderRoomTitle());
    patch($('#top-actions'), renderTopActions());
    patch($('#topic-bar'), renderTopicBar());
    patch($('#table-area'), renderTable());
    patch($('#bottom-area'), renderBottom());
    patch($('#sidebar'), renderSidebar());
    $('#sidebar').classList.toggle('open', R.ui.sidebarOpen);
    $('.scrim').classList.toggle('show', R.ui.sidebarOpen);
    tick();
  }

  function renderRoomTitle() {
    const s = S();
    return `<span class="room-name" title="${esc(s.room.name)}">${esc(s.room.name)}</span>
      ${s.me.isAdmin ? `<button class="icon-btn icon-sm" data-action="settings" title="Configurações da sala" aria-label="Configurações">${ICON.gear}</button>` : ''}`;
  }

  function renderTopActions() {
    const s = S();
    const timer = s.room.timer;
    const pending = s.topics.filter((t) => !t.finalEstimate).length;
    const timerHtml = timer
      ? `<button class="timer-chip" data-action="${canControl() ? 'timer-stop' : 'noop'}" title="${canControl() ? 'Parar timer' : 'Timer'}">${ICON.clock}<span id="timer-text">--:--</span></button>`
      : (canControl() ? `<button class="icon-btn" data-action="timer" title="Iniciar timer" aria-label="Timer">${ICON.clock}</button>` : '');
    return `${timerHtml}
      <button class="btn btn-primary btn-sm" data-action="invite">${ICON.link}<span class="hide-xs">Convidar time</span></button>
      <button class="icon-btn only-mobile badge-btn" data-action="open-sidebar" title="Tópicos" aria-label="Tópicos">${ICON.list}${pending ? `<i>${pending}</i>` : ''}</button>
      ${themeBtn()}
      <button class="me-chip" data-action="profile" title="Seu perfil">
        <span class="avatar" style="--h:${hue(s.me.name)}">${esc(initials(s.me.name))}</span>
        <span class="me-name hide-xs">${esc(s.me.name)}</span></button>`;
  }

  function renderTopicBar() {
    const s = S(); const t = curTopic(); const r = curRound();
    if (!t) return '';
    const idx = s.topics.indexOf(t) + 1;
    const long = t.description && (t.description.length > 220 || t.description.split('\n').length > 3);
    return `<div class="topic-meta">
        <span class="pill">Tópico ${idx} de ${s.topics.length}</span>
        ${r ? `<span class="pill pill-primary">Rodada ${r.n}</span>` : ''}
        ${t.finalEstimate ? `<span class="pill pill-success">Estimativa final: <b>${esc(t.finalEstimate)}</b></span>` : ''}
        ${canControl() ? `<span class="topic-tools">
          <button class="icon-btn icon-sm" data-action="edit-topic" data-id="${t.id}" title="Editar tópico">${ICON.edit}</button>
          ${s.topics.length > 1 ? `<button class="btn btn-ghost btn-sm" data-action="next-topic" title="Ir para o próximo tópico pendente">Próximo ${ICON.next}</button>` : ''}
        </span>` : ''}
      </div>
      <h2 class="topic-title">${esc(t.title)}</h2>
      ${t.description ? `<div class="topic-desc ${long && !R.ui.descOpen ? 'clamped' : ''}">${linkify(esc(t.description))}</div>
        ${long ? `<button class="link-btn" data-action="toggle-desc">${R.ui.descOpen ? 'ver menos' : 'ver mais'}</button>` : ''}` : ''}
      ${t.link ? `<a class="topic-link" href="${esc(t.link)}" target="_blank" rel="noopener noreferrer">${ICON.ext} Abrir item no board</a>` : ''}`;
  }

  // -- mesa com os participantes ao redor
  function seatSides(players) {
    const sides = { top: [], bottom: [], left: [], right: [] };
    if (narrowMq.matches) {
      players.forEach((p, i) => (i % 2 === 0 ? sides.bottom : sides.top).push(p));
      return sides;
    }
    const order = ['bottom', 'top', 'left', 'right'];
    let alt = 0;
    players.forEach((p, i) => {
      let side = order[i % 4];
      if ((side === 'left' || side === 'right') && sides[side].length >= 2) side = (alt++ % 2 === 0) ? 'bottom' : 'top';
      sides[side].push(p);
    });
    return sides;
  }

  function seat(p, round) {
    const s = S();
    const revealed = round && round.revealed;
    let cls = 'empty'; let inner = '';
    if (p.spectator) { cls = 'spectator'; inner = ICON.eye; }
    else if (revealed && p.voted) { cls = `face ${Date.now() < R.ui.flipUntil ? 'flip' : ''}`; inner = esc(p.vote); }
    else if (p.voted) { cls = 'back'; }
    const isMe = p.id === s.me.id;
    return `<div class="seat ${p.online ? '' : 'offline'} ${isMe ? 'me' : ''}" title="${esc(p.name)}${p.spectator ? ' (espectador)' : ''}${p.online ? '' : ' (offline)'}">
      <div class="pcard ${cls}">${inner}</div>
      <div class="seat-name">${p.isAdmin ? `<span class="crown" title="Facilitador">${ICON.crown}</span>` : ''}${esc(p.name)}</div>
    </div>`;
  }

  function renderTable() {
    const s = S(); const t = curTopic(); const r = curRound();
    // offline só aparece se votou nesta rodada
    const players = s.players.filter((p) => p.online || p.voted || p.id === s.me.id);
    const sides = seatSides(players);
    const voters = players.filter((p) => !p.spectator);
    const voted = voters.filter((p) => p.voted).length;
    let center = '';
    if (!t) {
      center = canControl()
        ? `<p class="table-msg">Nenhum tópico em votação</p>
           <div class="table-actions"><button class="btn btn-primary" data-action="add-topics">${ICON.plus} Adicionar tópicos</button>
           <button class="btn" data-action="quick-round">Votação rápida</button></div>`
        : '<p class="table-msg">Aguardando o facilitador escolher um tópico…</p>';
    } else if (!r.revealed) {
      if (voted === 0) center = '<p class="table-msg">Escolham suas cartas!</p>';
      else if (canControl()) center = `<button class="btn btn-primary btn-lg" data-action="reveal">Revelar cartas</button>`;
      else center = '<p class="table-msg">Aguardando a revelação…</p>';
      center += `<div class="vote-progress"><div class="vp-bar"><span style="width:${voters.length ? (voted / voters.length) * 100 : 0}%"></span></div>
        <small>${voted} de ${voters.length} votaram</small></div>`;
    } else {
      center = `<p class="table-avg">${r.stats && r.stats.average != null ? `Média <b>${fmt(r.stats.average)}</b>` : 'Cartas reveladas'}</p>`;
      center += canControl()
        ? `<div class="table-actions"><button class="btn" data-action="new-round">${ICON.redo} Nova rodada</button>
           ${s.topics.some((x) => x !== t && !x.finalEstimate) ? `<button class="btn btn-primary" data-action="next-topic">Próximo tópico ${ICON.next}</button>` : ''}</div>`
        : '<small class="muted">Aguardando o facilitador…</small>';
    }
    const side = (name) => `<div class="side side-${name}">${sides[name].map((p) => seat(p, r)).join('')}</div>`;
    return `${side('top')}${side('left')}<div class="poker-table">${center}</div>${side('right')}${side('bottom')}`;
  }

  // -- baralho / resultados
  function renderBottom() {
    const s = S(); const t = curTopic(); const r = curRound();
    if (!t || !r) return '';
    if (!r.revealed) {
      if (s.me.spectator) {
        return `<div class="spectator-note">${ICON.eye} Você está como espectador.
          <button class="link-btn" data-action="toggle-spectator">Quero votar</button></div>`;
      }
      return `<div class="deck-label">${s.myVote != null ? `Seu voto: <b>${esc(s.myVote)}</b> — clique de novo para desfazer` : 'Escolha sua carta 👇'}</div>
        <div class="deck" role="group" aria-label="Cartas">${s.room.deck.map((c) => `
          <button class="dcard ${s.myVote === c ? 'sel' : ''}" data-action="vote" data-value="${esc(c)}" aria-pressed="${s.myVote === c}">${esc(c)}</button>`).join('')}
        </div>`;
    }
    const st = r.stats || { distribution: [], total: 0 };
    const maxCount = Math.max(1, ...st.distribution.map((d) => d.count));
    const dist = st.distribution.map((d) => `
      <div class="dist-col ${st.suggestion === d.value ? 'is-sug' : ''}">
        <div class="dist-bar"><span style="height:${(d.count / maxCount) * 100}%"></span></div>
        <div class="mini-card">${esc(d.value)}</div>
        <div class="dist-count">${plural(d.count, 'voto', 'votos')}</div>
      </div>`).join('');
    const stats = `
      <div class="stats">
        <div class="stat"><span>Média</span><strong>${fmt(st.average)}</strong></div>
        <div class="stat"><span>Mediana</span><strong>${fmt(st.median)}</strong></div>
        ${st.min != null ? `<div class="stat"><span>Mín – Máx</span><strong>${fmt(st.min)} – ${fmt(st.max)}</strong></div>` : ''}
        <div class="stat stat-ring"><div class="ring" style="--p:${st.agreement}"><b>${st.agreement}%</b></div><span>Concordância</span></div>
      </div>
      ${st.consensus && st.total > 1 ? '<div class="consensus">🎉 Consenso! Todo mundo votou igual.</div>' : ''}`;
    let finalHtml;
    if (canControl()) {
      const opts = s.room.deck.filter((c) => c !== '?' && c !== '☕');
      finalHtml = `<div class="final">
        <div class="final-head"><b>Estimativa final</b>${st.suggestion ? `<small>Sugestão: <b>${esc(st.suggestion)}</b></small>` : ''}</div>
        <div class="final-opts">${opts.map((c) => `
          <button class="fopt ${t.finalEstimate === c ? 'sel' : ''} ${st.suggestion === c ? 'sug' : ''}" data-action="set-final" data-value="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="final-row"><input id="final-custom" data-keep maxlength="12" placeholder="Outro valor">
          <button class="btn btn-sm" data-action="set-final-custom">Salvar</button></div>
        <label class="check check-sm"><input type="checkbox" data-action="auto-advance" ${R.ui.autoAdvance ? 'checked' : ''}> <span>Ir para o próximo tópico ao salvar</span></label>
        ${t.finalEstimate ? `<button class="link-btn danger" data-action="clear-final">Remover estimativa final</button>` : ''}
      </div>`;
    } else {
      finalHtml = `<div class="final final-readonly">${t.finalEstimate
        ? `<span>Estimativa final</span><div class="final-big">${esc(t.finalEstimate)}</div>`
        : '<span class="muted">Aguardando o facilitador definir a estimativa final…</span>'}</div>`;
    }
    return `<div class="results">
      <div class="results-main"><div class="dist">${dist || '<p class="muted">Sem votos.</p>'}</div>${stats}</div>
      ${finalHtml}
    </div>`;
  }

  // -- barra lateral
  function renderSidebar() {
    const s = S();
    const online = s.players.filter((p) => p.online).length;
    const tabs = `<div class="side-tabs">
      <button class="stab ${R.ui.tab === 'topics' ? 'on' : ''}" data-action="tab" data-tab="topics">${ICON.list} Tópicos <b>${s.topics.length}</b></button>
      <button class="stab ${R.ui.tab === 'people' ? 'on' : ''}" data-action="tab" data-tab="people">${ICON.users} Pessoas <b>${online}</b></button>
      <button class="icon-btn icon-sm only-mobile" data-action="close-sidebar" aria-label="Fechar">${ICON.close}</button></div>`;
    return tabs + (R.ui.tab === 'topics' ? renderTopicsTab() : renderPeopleTab());
  }

  function renderTopicsTab() {
    const s = S();
    const done = s.topics.filter((t) => t.finalEstimate);
    const total = done.reduce((acc, t) => acc + (toNum(t.finalEstimate) || 0), 0);
    const hasNumeric = done.some((t) => toNum(t.finalEstimate) != null);
    const pct = s.topics.length ? Math.round((done.length / s.topics.length) * 100) : 0;
    const f = R.ui.filter;
    const list = s.topics
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => f === 'all' || (f === 'pending' ? !t.finalEstimate : !!t.finalEstimate));
    return `<div class="side-summary">
        <div class="sum-row"><span><b>${done.length}</b> de ${s.topics.length} estimados</span>${hasNumeric ? `<span class="sum-pts">Σ <b>${fmt(total)}</b> pts</span>` : ''}</div>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div class="side-actions">
          ${canControl() ? `<button class="btn btn-primary btn-sm" data-action="add-topics">${ICON.plus} Adicionar</button>` : ''}
          <button class="btn btn-sm" data-action="export-csv" ${s.topics.length ? '' : 'disabled'} title="Baixar planilha CSV">${ICON.download} CSV</button>
          <button class="btn btn-sm" data-action="copy-summary" ${s.topics.length ? '' : 'disabled'} title="Copiar resumo em texto">${ICON.copy} Resumo</button>
        </div>
        <div class="filters">${[['all', 'Todos'], ['pending', 'Pendentes'], ['done', 'Estimados']].map(([k, l]) => `
          <button class="chip ${f === k ? 'on' : ''}" data-action="filter" data-filter="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="topic-list" data-scroll-keep>
        ${list.length ? list.map(({ t, i }) => topicItem(t, i)).join('') : `<div class="empty-list">
          ${s.topics.length ? 'Nenhum tópico neste filtro.' : (canControl() ? 'Adicione os itens que serão refinados hoje.' : 'O facilitador ainda não adicionou tópicos.')}</div>`}
      </div>`;
  }

  function topicItem(t, i) {
    const s = S();
    const isCur = t.id === s.room.currentTopicId;
    const open = R.ui.expanded.has(t.id);
    const revealedRounds = t.rounds.filter((r) => r.revealed);
    const sub = isCur ? '<span class="live"><i></i>Votando agora</span>'
      : (revealedRounds.length ? plural(revealedRounds.length, 'rodada', 'rodadas') : 'Ainda não votado');
    const ctl = canControl();
    return `<div class="topic-item ${isCur ? 'current' : ''} ${t.finalEstimate ? 'done' : ''} ${open ? 'open' : ''}">
      <div class="ti-row">
        <button class="ti-main" data-action="toggle-topic" data-id="${t.id}" aria-expanded="${open}">
          <span class="ti-num">${i + 1}</span>
          <span class="ti-body"><span class="ti-title">${esc(t.title)}</span><span class="ti-sub">${sub}</span></span>
        </button>
        ${ctl && !isCur ? `<button class="icon-btn icon-sm ti-play" data-action="select-topic" data-id="${t.id}" title="Votar este tópico agora">${ICON.play}</button>` : ''}
        <span class="ti-est ${t.finalEstimate ? '' : 'empty'}" title="Estimativa final">${t.finalEstimate ? esc(t.finalEstimate) : '–'}</span>
      </div>
      ${open ? `<div class="ti-details">
        ${t.description ? `<div class="ti-desc">${linkify(esc(t.description))}</div>` : ''}
        ${t.link ? `<a class="topic-link" href="${esc(t.link)}" target="_blank" rel="noopener noreferrer">${ICON.ext} Abrir item</a>` : ''}
        ${revealedRounds.length ? `<div class="hist">${revealedRounds.map((r) => `
          <div class="hist-round"><div class="hist-head"><b>Rodada ${r.n}</b>
            <span>média ${fmt(r.stats && r.stats.average)} · ${r.stats ? r.stats.agreement : 0}% concordância</span></div>
            <div class="hist-votes">${r.votes.map((v) => `<span class="hv"><b>${esc(v.value)}</b>${esc(v.name)}</span>`).join('')}</div></div>`).join('')}</div>`
          : '<p class="muted small">Nenhuma rodada revelada ainda.</p>'}
        ${ctl ? `<div class="ti-actions">
          ${isCur ? '' : `<button class="btn btn-primary btn-sm" data-action="select-topic" data-id="${t.id}">${ICON.play} ${t.rounds.length ? 'Abrir votação' : 'Votar agora'}</button>`}
          <button class="icon-btn icon-sm" data-action="edit-topic" data-id="${t.id}" title="Editar">${ICON.edit}</button>
          <button class="icon-btn icon-sm" data-action="move-topic" data-dir="-1" data-id="${t.id}" title="Mover para cima" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
          <button class="icon-btn icon-sm" data-action="move-topic" data-dir="1" data-id="${t.id}" title="Mover para baixo" ${i === s.topics.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
          <button class="icon-btn icon-sm danger" data-action="delete-topic" data-id="${t.id}" title="Excluir">${ICON.trash}</button>
        </div>` : ''}
      </div>` : ''}
    </div>`;
  }

  function renderPeopleTab() {
    const s = S();
    const people = [...s.players].sort((a, b) => (b.online - a.online) || (b.isAdmin - a.isAdmin));
    const isAdmin = s.me.isAdmin;
    return `<div class="side-summary">
        <button class="btn btn-primary btn-sm btn-block" data-action="invite">${ICON.link} Copiar link de convite</button>
      </div>
      <div class="people" data-scroll-keep>${people.map((p) => `
        <div class="person ${p.online ? '' : 'offline'}">
          <span class="avatar" style="--h:${hue(p.name)}">${esc(initials(p.name))}<i class="dot ${p.online ? 'on' : ''}"></i></span>
          <span class="person-body"><span class="person-name">${esc(p.name)}${p.id === s.me.id ? ' <em>(você)</em>' : ''}</span>
            <span class="person-tags">${p.isAdmin ? '<span class="tag tag-primary">Facilitador</span>' : ''}${p.spectator ? '<span class="tag">Espectador</span>' : ''}${p.online ? '' : '<span class="tag">Offline</span>'}${p.voted && !p.spectator && curRound() && !curRound().revealed ? '<span class="tag tag-success">Votou</span>' : ''}</span></span>
          ${isAdmin && p.id !== s.me.id ? `<span class="person-actions">
            <button class="icon-btn icon-sm" data-action="toggle-admin" data-id="${p.id}" data-value="${p.isAdmin ? '0' : '1'}" title="${p.isAdmin ? 'Remover facilitador' : 'Tornar facilitador'}">${ICON.crown}</button>
            <button class="icon-btn icon-sm danger" data-action="kick" data-id="${p.id}" title="Remover da sala">${ICON.close}</button></span>` : ''}
        </div>`).join('')}</div>`;
  }

  // -- timer
  function tick() {
    const el = $('#timer-text');
    const timer = R.state && R.state.room.timer;
    if (!el || !timer) return;
    const left = Math.max(0, timer.endsAt - (Date.now() + R.offset));
    const sec = Math.ceil(left / 1000);
    el.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    const chip = el.closest('.timer-chip');
    chip.classList.toggle('warn', sec <= 10 && sec > 0);
    chip.classList.toggle('done', sec === 0);
    if (sec === 0 && R.ui.timerDoneFor !== timer.endsAt) {
      R.ui.timerDoneFor = timer.endsAt;
      toast('⏰ Tempo esgotado!', 'warn');
    }
  }

  // -- confete para consenso
  function confetti() {
    const box = $('#confetti');
    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = `${Math.random() * 0.4}s`;
      p.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
      p.style.setProperty('--x', `${(Math.random() - 0.5) * 240}px`);
      p.style.setProperty('--rot', `${Math.random() * 720}deg`);
      box.appendChild(p);
      setTimeout(() => p.remove(), 3500);
    }
  }

  // -- modais da sala
  function inviteLink() { return `${location.origin}/r/${R.id}`; }

  function openInvite(fresh = false) {
    const s = S();
    const adminLink = s.me.isAdmin && R.ident.adminToken ? `${inviteLink()}#admin=${R.ident.adminToken}` : null;
    const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
    const modal = openModal(`${modalHead(fresh ? 'Sala criada! Convide o time 🎉' : 'Convidar o time',
      'Quem abrir o link só precisa informar nome ou apelido — sem login.')}
      <label class="field"><span>Link público para votar</span>
        <div class="copy-row"><input id="invite-input" readonly value="${esc(inviteLink())}">
        <button class="btn btn-primary" data-copy="${esc(inviteLink())}">${ICON.copy} Copiar</button></div></label>
      ${local ? `<div class="note warn">Você está acessando por <b>${esc(location.host)}</b>. Para outras pessoas abrirem o link,
        use o endereço da sua máquina na rede (mostrado no terminal ao iniciar o servidor) ou publique o servidor — veja o README.</div>` : ''}
      ${adminLink ? `<details class="admin-link"><summary>Link de facilitador (não compartilhe com o time)</summary>
        <p class="muted small">Abre a sala com permissões de facilitador — útil para usar em outro computador ou passar a facilitação.</p>
        <div class="copy-row"><input readonly value="${esc(adminLink)}"><button class="btn" data-copy="${esc(adminLink)}">${ICON.copy}</button></div></details>` : ''}
      <div class="modal-actions"><button class="btn" data-close-modal>Fechar</button></div>`);
    const input = $('#invite-input', modal);
    input.addEventListener('focus', () => input.select());
  }

  function openTopicForm(topic = null) {
    const editing = !!topic;
    const modal = openModal(`${modalHead(editing ? 'Editar tópico' : 'Adicionar tópicos')}
      ${editing ? '' : `<div class="seg"><button class="seg-btn on" data-seg="one">Um tópico</button><button class="seg-btn" data-seg="many">Vários de uma vez</button></div>`}
      <form id="topic-form" autocomplete="off">
        <div data-pane="one">
          <label class="field"><span>Título</span><input name="title" maxlength="200" placeholder="Ex.: PROJ-123 Login com SSO" value="${esc(topic ? topic.title : '')}" autofocus></label>
          <label class="field"><span>Link <em class="muted">(Jira, Azure DevOps, Trello…)</em></span><input name="link" maxlength="500" placeholder="https://" value="${esc(topic ? topic.link : '')}"></label>
          <label class="field"><span>Descrição / critérios de aceite</span><textarea name="description" rows="5" maxlength="4000" placeholder="Contexto para o time durante a votação">${esc(topic ? topic.description : '')}</textarea></label>
        </div>
        ${editing ? '' : `<div data-pane="many" class="hidden">
          <label class="field"><span>Um tópico por linha <em class="muted">(links na linha viram o link do tópico)</em></span>
            <textarea name="bulk" rows="9" placeholder="PROJ-101 Tela de login&#10;PROJ-102 Exportar relatório https://jira/PROJ-102&#10;PROJ-103 Ajustar cache da API"></textarea></label>
        </div>`}
        <div class="modal-actions"><button type="button" class="btn" data-close-modal>Cancelar</button>
          <button type="submit" class="btn btn-primary">${editing ? 'Salvar' : 'Adicionar'}</button></div>
      </form>`);
    let mode = 'one';
    $$('[data-seg]', modal).forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.seg;
      $$('[data-seg]', modal).forEach((x) => x.classList.toggle('on', x === b));
      $$('[data-pane]', modal).forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== mode));
      const f = $(mode === 'one' ? '[name=title]' : '[name=bulk]', modal); if (f) f.focus();
    }));
    $('#topic-form', modal).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      let ok;
      if (editing) {
        ok = await act('edit_topic', { topicId: topic.id, title: f.title.value, link: f.link.value, description: f.description.value });
      } else if (mode === 'one') {
        if (!f.title.value.trim()) { f.title.focus(); return; }
        ok = await act('add_topics', { topics: [{ title: f.title.value, link: f.link.value, description: f.description.value }] });
      } else {
        const items = parseTopicLines(f.bulk.value);
        if (!items.length) { f.bulk.focus(); return; }
        ok = await act('add_topics', { topics: items });
      }
      if (ok) {
        closeModal();
        if (!editing) { toast(ok.created > 1 ? `${ok.created} tópicos adicionados` : 'Tópico adicionado', 'success'); R.ui.tab = 'topics'; updateRoom(); }
      }
    });
  }

  function openProfile() {
    const s = S();
    const modal = openModal(`${modalHead('Seu perfil')}
      <form id="profile-form" autocomplete="off">
        <label class="field"><span>Nome ou apelido</span><input name="name" maxlength="30" required value="${esc(s.me.name)}" autofocus></label>
        <label class="check"><input type="checkbox" name="spectator" ${s.me.spectator ? 'checked' : ''}> <span>Espectador (não voto)</span></label>
        <div class="modal-actions split"><button type="button" class="btn btn-danger-ghost" id="leave-btn">Sair da sala</button>
          <span><button type="button" class="btn" data-close-modal>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button></span></div>
      </form>`);
    $('#profile-form', modal).addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      const ok = await act('update_me', { name, spectator: e.target.spectator.checked });
      if (ok) { store.set('pp:profile', { name }); closeModal(); }
    });
    $('#leave-btn', modal).addEventListener('click', async () => {
      if (!(await confirmDialog('Você sairá da sala. Pode voltar depois pelo mesmo link.', 'Sair', true))) return;
      if (await act('leave')) { location.href = '/'; }
    });
  }

  function openSettings() {
    const s = S();
    const cur = s.room.deckType;
    const modal = openModal(`${modalHead('Configurações da sala')}
      <form id="settings-form" autocomplete="off">
        <label class="field"><span>Nome da sala</span><input name="name" maxlength="60" value="${esc(s.room.name)}"></label>
        <label class="field"><span>Baralho</span><select name="deckType">${Object.entries(DECKS).map(([k, d]) => `
          <option value="${k}" ${k === cur ? 'selected' : ''}>${d.label}</option>`).join('')}</select></label>
        <input name="customDeck" class="custom-deck ${cur === 'custom' ? '' : 'hidden'}" maxlength="200" placeholder="Separe por vírgula. Ex.: 1, 2, 3, 5, 8, ?" value="${cur === 'custom' ? esc(s.room.deck.join(', ')) : ''}">
        <p class="muted small">Trocar o baralho limpa os votos da rodada em andamento.</p>
        <label class="check"><input type="checkbox" name="facilitatorOnly" ${s.room.settings.facilitatorOnly ? 'checked' : ''}>
          <span>Só facilitadores controlam a votação <em class="muted">(revelar, nova rodada, tópicos, timer)</em></span></label>
        <label class="check"><input type="checkbox" name="autoReveal" ${s.room.settings.autoReveal ? 'checked' : ''}>
          <span>Revelar automaticamente quando todos os presentes votarem</span></label>
        <div class="modal-actions"><button type="button" class="btn" data-close-modal>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button></div>
      </form>`);
    const f = $('#settings-form', modal);
    f.deckType.addEventListener('change', () => { f.customDeck.classList.toggle('hidden', f.deckType.value !== 'custom'); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = await act('update_settings', {
        name: f.name.value, deckType: f.deckType.value, customDeck: f.customDeck.value,
        settings: { facilitatorOnly: f.facilitatorOnly.checked, autoReveal: f.autoReveal.checked },
      });
      if (ok) { closeModal(); toast('Configurações salvas', 'success'); }
    });
  }

  function openTimer() {
    const modal = openModal(`${modalHead('Timer da rodada', 'Todos veem a contagem regressiva.')}
      <div class="timer-presets">${[[30, '30 s'], [60, '1 min'], [120, '2 min'], [180, '3 min'], [300, '5 min'], [600, '10 min']].map(([v, l]) => `
        <button class="btn" data-seconds="${v}">${l}</button>`).join('')}</div>
      <form id="timer-form" class="final-row"><input name="min" type="number" min="1" max="60" placeholder="Minutos"><button class="btn btn-primary" type="submit">Iniciar</button></form>`);
    const start = async (sec) => { if (await act('timer_start', { seconds: sec })) closeModal(); };
    $$('[data-seconds]', modal).forEach((b) => b.addEventListener('click', () => start(Number(b.dataset.seconds))));
    $('#timer-form', modal).addEventListener('submit', (e) => { e.preventDefault(); const m = Number(e.target.min.value); if (m > 0) start(Math.round(m * 60)); });
  }

  // -- exportação
  function exportCsv() {
    const s = S();
    const rows = [['#', 'Tópico', 'Estimativa final', 'Rodadas', 'Média (última rodada)', 'Concordância (última rodada)', 'Votos (última rodada)', 'Link', 'Descrição']];
    s.topics.forEach((t, i) => {
      const revealed = t.rounds.filter((r) => r.revealed);
      const last = revealed[revealed.length - 1];
      rows.push([i + 1, t.title, t.finalEstimate || '', revealed.length,
        last && last.stats && last.stats.average != null ? fmt(last.stats.average) : '',
        last && last.stats ? `${last.stats.agreement}%` : '',
        last ? last.votes.map((v) => `${v.name}: ${v.value}`).join(', ') : '', t.link, t.description]);
    });
    const csv = rows.map((r) => r.map((c) => {
      const v = String(c == null ? '' : c);
      return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(s.room.name)}-estimativas.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function copySummary() {
    const s = S();
    const lines = [s.room.name, ''];
    let total = 0;
    s.topics.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.title} — ${t.finalEstimate ? t.finalEstimate : '(sem estimativa)'}${t.link ? ` (${t.link})` : ''}`);
      total += toNum(t.finalEstimate) || 0;
    });
    if (total) lines.push('', `Total: ${fmt(total)} pontos`);
    toast((await copyText(lines.join('\n'))) ? 'Resumo copiado!' : 'Não foi possível copiar', 'success');
  }

  // ------------------------------------------------------------------ ações (delegação)
  document.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      const ok = await copyText(copyBtn.dataset.copy);
      toast(ok ? 'Link copiado!' : 'Selecione e copie manualmente', ok ? 'success' : 'warn');
      return;
    }
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const a = el.dataset.action;
    const id = el.dataset.id;
    const s = S();
    switch (a) {
      case 'theme': toggleTheme(); break;
      case 'noop': break;
      case 'rejoin': R.kicked = false; R.view = null; renderCenter('<div class="spinner"></div>'); connect(); break;
      case 'invite': openInvite(); break;
      case 'profile': openProfile(); break;
      case 'settings': openSettings(); break;
      case 'timer': openTimer(); break;
      case 'timer-stop': act('timer_stop'); break;
      case 'open-sidebar': R.ui.sidebarOpen = true; updateRoom(); break;
      case 'close-sidebar': R.ui.sidebarOpen = false; updateRoom(); break;
      case 'tab': R.ui.tab = el.dataset.tab; updateRoom(); break;
      case 'filter': R.ui.filter = el.dataset.filter; updateRoom(); break;
      case 'toggle-desc': R.ui.descOpen = !R.ui.descOpen; updateRoom(); break;
      case 'toggle-topic':
        if (R.ui.expanded.has(id)) R.ui.expanded.delete(id); else R.ui.expanded.add(id);
        updateRoom(); break;
      case 'vote': {
        const value = s.myVote === el.dataset.value ? null : el.dataset.value;
        const prev = s.myVote;
        s.myVote = value; // otimista
        updateRoom();
        const ok = await act('vote', { value });
        if (!ok) { s.myVote = prev; updateRoom(); }
        break;
      }
      case 'toggle-spectator': act('update_me', { spectator: !s.me.spectator }); break;
      case 'reveal': act('reveal'); break;
      case 'new-round': act('new_round'); break;
      case 'next-topic': if (await act('next_topic')) R.ui.descOpen = false; break;
      case 'quick-round': act('quick_round'); break;
      case 'add-topics': openTopicForm(); break;
      case 'edit-topic': openTopicForm(s.topics.find((t) => t.id === id)); break;
      case 'select-topic':
        if (await act('select_topic', { topicId: id })) { R.ui.descOpen = false; R.ui.sidebarOpen = false; updateRoom(); }
        break;
      case 'move-topic': act('move_topic', { topicId: id, direction: Number(el.dataset.dir) }); break;
      case 'delete-topic': {
        const t = s.topics.find((x) => x.id === id);
        if (t && await confirmDialog(`Excluir o tópico <b>${esc(t.title)}</b> e todo o histórico de votos dele?`, 'Excluir', true)) {
          act('delete_topic', { topicId: id });
        }
        break;
      }
      case 'set-final': {
        const t = curTopic();
        if (t) await act('set_final', { topicId: t.id, value: el.dataset.value, advance: R.ui.autoAdvance });
        break;
      }
      case 'set-final-custom': {
        const t = curTopic(); const input = $('#final-custom');
        const value = input ? input.value.trim() : '';
        if (t && value) { if (await act('set_final', { topicId: t.id, value, advance: R.ui.autoAdvance })) input.value = ''; }
        break;
      }
      case 'clear-final': { const t = curTopic(); if (t) act('set_final', { topicId: t.id, value: null }); break; }
      case 'auto-advance': R.ui.autoAdvance = el.checked; break;
      case 'export-csv': exportCsv(); break;
      case 'copy-summary': copySummary(); break;
      case 'toggle-admin': act('set_admin', { targetId: id, value: el.dataset.value === '1' }); break;
      case 'kick': {
        const p = s.players.find((x) => x.id === id);
        if (p && await confirmDialog(`Remover <b>${esc(p.name)}</b> da sala?`, 'Remover', true)) act('kick', { targetId: id });
        break;
      }
      default: break;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.id === 'final-custom') {
      e.preventDefault();
      const btn = $('[data-action="set-final-custom"]'); if (btn) btn.click();
    }
  });

  // ------------------------------------------------------------------ roteamento
  const route = location.pathname.match(/^\/r\/([a-z0-9]{4,32})\/?$/);
  if (route) initRoom(route[1]); else renderHome();
})();
