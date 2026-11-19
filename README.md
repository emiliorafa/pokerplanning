# Planning Poker para refinamentos

Planning poker em tempo real, inspirado no planningpokeronline.com e no planning-poker-agile.web.app.
Sem dependências: só precisa de **Python 3.8+**.

## Como rodar

```bash
py server.py
```

(ou dê dois cliques em `iniciar.bat`). O terminal mostra dois endereços:

- `http://localhost:8000`: para você, neste computador
- `http://<seu-ip>:8000`: para o time, se estiver na mesma rede/VPN

## Como usar

1. Na página inicial, crie a sala: nome, seu nome, baralho e, se quiser, os tópicos (um por linha).
2. Clique em **Convidar time** e mande o **link público** (`/r/<id-da-sala>`). Quem abrir o link
   só informa nome ou apelido, sem login.
3. Escolha o tópico na lista lateral (▶). O time vota, você clica em **Revelar cartas**.
4. Sem consenso? Clique em **Nova rodada**: as rodadas anteriores ficam no histórico do tópico.
5. Escolha a **estimativa final** (a sugestão vem destacada). Com a opção marcada, a sala já vai para o próximo tópico.
6. No fim, exporte em **CSV** ou copie o **Resumo** para colar no Jira/Teams.

### Recursos

- Vários tópicos por sala, cada um com título, link do board, descrição, várias rodadas e estimativa final
- Estatísticas por rodada: média, mediana, mín/máx, concordância e distribuição dos votos
- Baralhos: Fibonacci, Fibonacci modificado, camisetas, potências de 2 ou personalizado
- Facilitador (👑): só ele revela, abre rodadas e gerencia tópicos. Dá para liberar para todos nas configurações (⚙)
- Revelação automática quando todos votarem (opcional), timer compartilhado e modo espectador
- Aba **Pessoas**: quem está online, quem já votou, promover a facilitador e remover participante
- **Link de facilitador** (no modal de convite): abre a sala como facilitador em outro computador. Não compartilhe com o time
- Tema claro/escuro e layout para celular

## Link público fora da sua rede

O link só funciona para quem consegue acessar o servidor. Opções:

| Opção | Quando usar |
|---|---|
| **Rede/VPN da empresa** | Todos na mesma rede: use `http://<seu-ip>:8000`. Libere a porta no Firewall do Windows se ele perguntar. |
| **Túnel temporário** | Para uma cerimônia rápida: `cloudflared tunnel --url http://localhost:8000` gera uma URL `https://….trycloudflare.com`. Confira se a política de TI da empresa permite. |
| **Hospedar** (recomendado) | Para ter um link fixo: Render, Railway, Fly.io ou um servidor interno. Comando de start: `python server.py`. A porta vem da variável `PORT`. Há um `Dockerfile` pronto. |

> Em hospedagens gratuitas o disco costuma ser apagado quando o serviço reinicia. As salas ficam em
> `data/rooms.json` (ou em `DATA_DIR`). Monte um volume persistente se quiser manter o histórico.

## Publicar no Railway

O repositório já tem `Dockerfile` e `railway.json` (health check em `/healthz`).

1. Em [railway.com](https://railway.com), **New Project → Deploy from GitHub repo** e escolha este repositório.
2. Em **Settings → Networking**, clique em **Generate Domain** para ganhar o link público `https://….up.railway.app`.
3. Para não perder as salas a cada deploy: no serviço, **Add Volume** com *mount path* `/data`.

A porta é definida pelo próprio Railway (variável `PORT`); não é preciso configurá-la.
Cada `git push` na branch `main` gera um novo deploy.

## Configuração (variáveis de ambiente)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `8000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface de rede |
| `DATA_DIR` | `./data` | Onde as salas são salvas |
| `ROOM_TTL_DAYS` | `30` | Dias sem uso até a sala ser apagada |

## Estrutura

```
server.py          servidor HTTP + tempo real (streaming), regras e persistência
public/index.html  página única
public/app.js      interface (JavaScript puro)
public/styles.css  estilos (tema claro/escuro)
```
