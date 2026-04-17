# Tidsrapport

Webbaserad tidsrapporteringsapp för anställda inom Handels-avtalet. Hanterar tidsregistrering, OB-tillägg, övertid, löneuträkning och semesterersättning.

## Demo

Prova appen live: **[demotidrapport.mecloud.win](https://demotidrapport.mecloud.win)**

| Konto | E-post | Lösenord |
|-------|--------|----------|
| Admin | admin@example.com | admin123 |
| Användare | anna@example.com | user123 |

Demo-databasen återställs automatiskt varje natt kl 03:00.

---

## Funktioner

- **Tidsregistrering** — Stämpla in/ut med start- och sluttid, rast och projektval
- **Löpande tidtagning** — Realtidstimer som sparas i webbläsaren
- **Löneuträkning** — Automatisk beräkning av bruttolön, OB, övertid och skatt per månad
- **Skattetabeller** — Stöd för kommunal skattetabell (tabell 29–42) eller fast procentsats
- **Semesterersättning** — Spårning av intjänandeår, semesterpott och uttag med dagersättning
- **Semesterdagar** — Registrera semesterdagar i kalendern; semesterlön beräknas automatiskt från föregående års pott
- **Veckoschema** — A/B- eller A/B/C/D-veckosystem med förhandsvisning
- **Arbetsmallar** — Återanvändbara pass-mallar
- **Statistik** — Diagram och sammanfattningar per period
- **CSV/PDF-export** — Exportera rapporter
- **PWA** — Installerbar som app på mobil med hårdladdningsknapp för att tvinga uppdatering
- **AI-bildanalys** — Importera schema från foto via Anthropic API (valfritt)
- **Flerbrukarstöd** — Varje användare ser bara sin egen data; admin hanterar konton

## Stack

- **Next.js 14** (App Router, standalone output)
- **SQLite** via better-sqlite3 + Drizzle ORM
- **NextAuth v4** (JWT-sessioner)
- **Tailwind CSS**
- **Docker** — multi-stage build, stöd för `amd64` och `arm64`

---

## Snabbstart med Docker (rekommenderat)

### Krav

- Docker och Docker Compose
- En domän eller lokal IP att nå appen på

### 1. Klona repot och konfigurera miljövariabler

```bash
git clone https://github.com/tjelite1986/tidsrapport.git
cd tidsrapport
cp .env.example .env
```

Öppna `.env` och fyll i åtminstone `NEXTAUTH_SECRET` och `NEXTAUTH_URL`:

```bash
# Generera en säker nyckel
openssl rand -base64 32
```

### 2. Starta

```bash
docker compose up -d
```

Appen är nu tillgänglig på [http://localhost:3000](http://localhost:3000) (eller den URL du angav i `NEXTAUTH_URL`).

### 3. Skapa första admin-användaren

Vid första uppstarten skapas databasen automatiskt. Kör sedan seed-skriptet för att skapa en admin-användare:

```bash
docker exec tidsrapport npx tsx scripts/seed.ts
```

Seed skapar:
- Admin: `admin@example.com` / `admin123`
- Testanvändare: `anna@example.com` / `user123`

**Byt lösenord direkt efter första inloggning.**

---

## Miljövariabler

Se `.env.example` för alla tillgängliga variabler.

| Variabel | Obligatorisk | Beskrivning |
|----------|:---:|-------------|
| `NEXTAUTH_SECRET` | Ja | Hemlig nyckel för JWT-signering. Generera med `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Ja | Appens fullständiga URL, t.ex. `https://tidrapport.example.com` |
| `ANTHROPIC_API_KEY` | Nej | API-nyckel för Anthropic Claude — krävs bara för AI-schemaigenkänning |

---

## Tillgängliga taggar

| Tagg | Beskrivning |
|------|-------------|
| `latest` | Senaste stabila bygget från `master` |
| `sha-<commit>` | Specifikt commit-bygge |
| `v1.0.0` | Semantisk versionstagg (vid release) |

Stöd för `linux/amd64` och `linux/arm64` (t.ex. Raspberry Pi).

---

## Bakom en reverse proxy med Traefik

Använd den medföljande `docker-compose.traefik.yml` istället för standard `docker-compose.yml`.

Se [docs/traefik-setup.md](docs/traefik-setup.md) för en komplett guide om hur du sätter upp Traefik med TLS-certifikat (Let's Encrypt / Cloudflare DNS-challenge), skapar `acme.json` och konfigurerar `traefik.yml`.

### Snabbstart (förutsätter att Traefik redan körs)

Fyll i Traefik-specifika variabler i `.env`:

```env
NEXTAUTH_URL=https://tidrapport.example.com
DOMAIN=tidrapport.example.com
CERT_RESOLVER=letsencrypt   # eller cloudflare, beroende på din Traefik-config
```

Starta med Traefik-compose-filen:

```bash
docker compose -f docker-compose.traefik.yml up -d
```

**Förutsättningar:**
- Traefik måste köra på samma Docker-nätverk (externt nätverk vid namn `traefik`)
- En HTTP→HTTPS redirect-middleware måste finnas definierad i Traefik (refereras som `https-redirect@docker` — justera namnet om din middleware heter något annat)
- TLS-certifikat hanteras av Traefik via den certresolver du anger

---

## Databasmigrering

Databasen uppgraderas med versionerade migreringsscript. Vid uppgradering till en ny version av appen kan migrering krävas — se release-noterna för vilken version som gäller.

```bash
docker exec tidsrapport npx tsx scripts/migrate-v13.ts /app/data/tidsrapport.db
```

Migreringarna körs i ordning: v2 → v3 → ... → v13. Kör bara de versioner som är nyare än din nuvarande installation.

---

## Uppgradering

```bash
docker compose pull
docker compose up -d
# Kör eventuell ny migration (se release-noterna)
docker exec tidsrapport npx tsx scripts/migrate-vX.ts /app/data/tidsrapport.db
```

---

## Bygga från källkod

### Krav

- Node.js 20+
- npm

```bash
git clone https://github.com/tjelite1986/tidsrapport.git
cd tidsrapport
npm install
npm run build
```

### Köra lokalt (utveckling)

```bash
cp .env.example .env.local
# Redigera .env.local med dina värden
npm run dev
```

### Bygga Docker-imagen lokalt

```bash
docker build -t tidsrapport .
```

---

## Databassäkerhetskopiering

SQLite-databasen lagras i Docker-volymen `tidsrapport_data` på sökvägen `/app/data/tidsrapport.db`. Ta backup med:

```bash
docker exec tidsrapport sqlite3 /app/data/tidsrapport.db ".backup '/app/data/backup.db'"
docker cp tidsrapport:/app/data/backup.db ./tidsrapport-backup.db
```

---

## CI/CD

GitHub Actions bygger och pushar Docker-imagen automatiskt till `ghcr.io` vid varje push till `master` och vid publicering av en release. Stöd för `linux/amd64` och `linux/arm64`.

---

## Licens

ISC
