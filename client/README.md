# Web Chess Game (client)

This is the Vite + React frontend for the Web Chess game.

## Setup
```bash
npm install
```

Optionally configure the backend URL (defaults to `http://localhost:3001`) by setting `VITE_SERVER_URL` in your environment or `.env` file.

## Run
```bash
npm run dev
```

Open the URL shown by Vite (default `http://localhost:5173`).

## Features
- Create and join game rooms
- Real-time move sync via Socket.IO
- Server-side move validation with `chess.js`
