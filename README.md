# NagarSeva (MERN-style with SQLite)

NagarSeva is now structured as:
- `M`: replaced with SQLite (instead of MongoDB)
- `E`: Express API (TypeScript)
- `R`: React frontend (TypeScript + Tailwind)
- `N`: Node.js runtime

## Stack
- Backend: Express + TypeScript + `node:sqlite`
- Frontend: React + TypeScript + Tailwind + Vite
- Auth: bcryptjs + token sessions
- Map: React Leaflet + OpenStreetMap tiles

## Project Layout
- `src/server.ts` - Express API + production static hosting
- `src/db.ts` - SQLite schema + seed data
- `client/` - React + Tailwind app

## Run
1. Install root dependencies:
```bash
npm install
```
2. Install frontend dependencies:
```bash
npm --prefix client install
```
3. Start backend + frontend:
```bash
npm run dev
```

## Default Logins
- Citizen:
  - Email: `citizen@nagarseva.com`
  - Password: `citizen123`
- Authority:
  - Email: `admin@nagarseva.gov`
  - Password: `admin123`

## UI Coverage
The React screens are aligned to your references:
- `/` landing hero
- `/login` role-switch login/register
- `/dashboard` feature card dashboard
- `/map` city map with status markers and legend

