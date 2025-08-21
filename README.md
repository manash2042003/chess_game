## Web Chess Game

Backend: Node.js/Express + Socket.IO. Frontend: Vite + React.

### Prerequisites
- Node.js 18+

### Setup
1) Backend
```
cd server
npm install
```
2) Frontend
```
cd ../client
npm install
```

Optional client config: set `VITE_SERVER_URL` (default `http://localhost:3001`).

### Run
1) Start backend
```
cd server
npm run start
```
2) Start frontend (new terminal)
```
cd client
npm run dev
```
Open the Vite URL (default `http://localhost:5173`).

### Play
- Click Create Game to get a room ID, share it to a friend.
- Friend clicks Join Game and enters the ID.
- Moves sync in realtime and are validated server-side with chess.js.

### Notes
- CORS allows `localhost:5173`.
- Adjust ports in `server/index.js` and `client/vite.config.js` if needed.


