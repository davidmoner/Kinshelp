# KingsHelp API — Incept

> Node.js · Express · SQLite (better-sqlite3) · JWT  
> MVP backend for the KingsHelp community service-barter platform

---
---

## Health

- `GET /health` (no auth)

```bash
curl.exe -I http://localhost:3000/health

```md
## Tests

Smoke test (verifica que el servidor responde en `/health`).

1) Arranca el server:
```bash
npm run dev
---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env

# 3. Create database tables
npm run migrate

# 4. Seed demo data
npm run seed

# 5. Start dev server (auto-reload)
npm run dev

# — or production —
npm start
```

Server starts at **http://localhost:3000**

---

## Project Structure

```
kingshelp-api/
├── src/
│   ├── app.js                        # Express bootstrap + route mounting
│   ├── config/
│   │   ├── database.js               # better-sqlite3 singleton (WAL mode)
│   │   ├── env.js                    # Typed env vars
│   │   └── constants.js              # Enums, state machine tables, permission map
│   ├── db/
│   │   ├── migrate.js                # DDL: CREATE TABLE / indexes
│   │   └── seed.js                   # Demo users, offers, requests, badges
│   ├── middleware/
│   │   ├── auth.middleware.js        # JWT verify → req.user
│   │   └── error.middleware.js       # Global error + 404 handler
│   └── modules/
│       ├── auth/                     # register · login · /me
│       ├── users/                    # get profile · update profile
│       ├── offers/                   # CRUD service offers
│       ├── requests/                 # CRUD help requests + suggested-providers
│       ├── matches/                  # create · status transitions · ratings
│       ├── points/                   # ledger reads
│       └── badges/                   # list all · list mine · auto-award
├── .env.example
└── package.json
```

---

## API Routes

All routes are prefixed `/api/v1`. Every route except `POST /auth/register` and `POST /auth/login` requires:

```
Authorization: Bearer <token>
```

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Get JWT token |
| GET | `/auth/me` | Current user profile |

### Users
| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/:id` | Public profile |
| PUT | `/users/:id` | Update own profile |

### Offers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/offers` | Feed (filter by category, status) |
| POST | `/offers` | Create offer |
| GET | `/offers/:id` | Single offer |
| PUT | `/offers/:id` | Edit own offer |
| DELETE | `/offers/:id` | Close own offer |

### Requests
| Method | Path | Description |
|--------|------|-------------|
| GET | `/requests` | Feed (filter by category, status) |
| POST | `/requests` | Create request |
| GET | `/requests/:id` | Single request |
| PUT | `/requests/:id` | Edit own request |
| DELETE | `/requests/:id` | Close own request |
| GET | `/requests/:id/suggested-providers` | Premium-first provider suggestions |

### Matches
| Method | Path | Description |
|--------|------|-------------|
| GET | `/matches` | My matches (filter by status) |
| POST | `/matches` | Create match |
| GET | `/matches/:id` | Match detail |
| PATCH | `/matches/:id/status` | Transition status (body: `{ "action": "…" }`) |
| POST | `/matches/:id/ratings` | Submit rating (body: `{ "rating": 1-5, "review": "…" }`) |

**Match actions:**
| Action | Allowed by | From status |
|--------|-----------|-------------|
| `accept` | provider | `pending` |
| `reject` | provider | `pending` |
| `cancel` | seeker | `pending`, `accepted` |
| `done` | provider | `accepted` |

### Points
| Method | Path | Description |
|--------|------|-------------|
| GET | `/points/me` | Own ledger + balance |
| GET | `/points/user/:userId` | Any user's ledger |

### Badges
| Method | Path | Description |
|--------|------|-------------|
| GET | `/badges` | All badges |
| GET | `/badges/mine` | My earned badges |
| GET | `/badges/user/:userId` | Any user's badges |

---

## cURL Examples

### 1 — Register and login

```bash
# Register
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Dave","email":"dave@example.com","password":"secret123"}' | jq .

# Login (returns token)
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123"}' | jq -r '.token')

echo "Token: $TOKEN"
```

### 2 — Browse the feed

```bash
# All active offers
curl -s "http://localhost:3000/api/v1/offers" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Filter by category
curl -s "http://localhost:3000/api/v1/offers?category=tech" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### 3 — Post a help request

```bash
curl -s -X POST http://localhost:3000/api/v1/requests \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Need someone to fix my CSS",
    "category": "tech",
    "points_offered": 50,
    "expires_at": "2026-04-01T00:00:00Z"
  }' | jq .
```

### 4 — Create a match

```bash
# Get an offer ID first
OFFER_ID=$(curl -s "http://localhost:3000/api/v1/offers" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

# Get your own user ID
MY_ID=$(curl -s "http://localhost:3000/api/v1/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.id')

# Get the provider ID from the offer
PROVIDER_ID=$(curl -s "http://localhost:3000/api/v1/offers/$OFFER_ID" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.provider_id')

# Create match (log in as seeker — carol@example.com)
TOKEN_SEEKER=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carol@example.com","password":"password123"}' | jq -r '.token')

SEEKER_ID=$(curl -s http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN_SEEKER" | jq -r '.id')

MATCH_ID=$(curl -s -X POST http://localhost:3000/api/v1/matches \
  -H "Authorization: Bearer $TOKEN_SEEKER" \
  -H "Content-Type: application/json" \
  -d "{
    \"offer_id\": \"$OFFER_ID\",
    \"provider_id\": \"$PROVIDER_ID\",
    \"seeker_id\": \"$SEEKER_ID\",
    \"points_agreed\": 80,
    \"initiated_by\": \"seeker\"
  }" | jq -r '.id')

echo "Match ID: $MATCH_ID"
```

### 5 — Accept, complete, rate

```bash
# Alice (provider) accepts — log in as provider first
TOKEN_ALICE=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123"}' | jq -r '.token')

# Accept
curl -s -X PATCH "http://localhost:3000/api/v1/matches/$MATCH_ID/status" \
  -H "Authorization: Bearer $TOKEN_ALICE" \
  -H "Content-Type: application/json" \
  -d '{"action":"accept"}' | jq .status

# Mark done
curl -s -X PATCH "http://localhost:3000/api/v1/matches/$MATCH_ID/status" \
  -H "Authorization: Bearer $TOKEN_ALICE" \
  -H "Content-Type: application/json" \
  -d '{"action":"done"}' | jq .status

# Alice rates seeker
curl -s -X POST "http://localhost:3000/api/v1/matches/$MATCH_ID/ratings" \
  -H "Authorization: Bearer $TOKEN_ALICE" \
  -H "Content-Type: application/json" \
  -d '{"rating":5,"review":"Great to work with!"}' | jq .
```

### 6 — Suggested providers (premium-first)

```bash
# Get a request ID
REQ_ID=$(curl -s "http://localhost:3000/api/v1/requests" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

curl -s "http://localhost:3000/api/v1/requests/$REQ_ID/suggested-providers" \
  -H "Authorization: Bearer $TOKEN" | jq '.suggested_providers[].premium_tier'
```

### 7 — Points ledger

```bash
curl -s "http://localhost:3000/api/v1/points/me" \
  -H "Authorization: Bearer $TOKEN_ALICE" | jq '{balance: .balance, entries: (.ledger | length)}'
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | `development` | Environment flag |
| `JWT_SECRET` | *(required)* | Secret for signing JWTs |
| `JWT_EXPIRES_IN` | `7d` | JWT expiry |
| `DB_PATH` | `./kingshelp.db` | SQLite file path |

---

## Seed Demo Accounts

| Email | Password | Tier | Balance |
|-------|----------|------|---------|
| alice@example.com | password123 | 🥇 Gold | 500 pts |
| bob@example.com | password123 | 🥈 Silver | 200 pts |
| carol@example.com | password123 | Free | 50 pts |

---

*Next: implement background expiry job, add pagination metadata, WebSocket chat.*
