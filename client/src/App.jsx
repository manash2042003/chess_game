import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import './App.css'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

function App() {
  const [socket, setSocket] = useState(null)
  const [roomId, setRoomId] = useState('')
  const [color, setColor] = useState('w')
  const [fen, setFen] = useState(new Chess().fen())
  const [status, setStatus] = useState('')
  const [moves, setMoves] = useState([])
  const [messages, setMessages] = useState([])
  const [name, setName] = useState('')
  const chessRef = useRef(new Chess())

  useEffect(() => {
    // Prefer polling first to avoid websocket handshake issues on some hosts,
    // then upgrade to websocket when available
    const s = io(SERVER_URL, { transports: ['polling', 'websocket'] })
    setSocket(s)
    s.on('connect', () => setStatus('Connected'))
    s.on('connect_error', (err) => setStatus(`Connect error: ${err?.message || err}`))
    s.on('disconnect', () => setStatus('Disconnected'))
    s.on('state', (payload) => {
      if (!payload) return
      const { fen: nextFen, moves: srvMoves = [], messages: srvMessages = [] } = payload
      chessRef.current.load(nextFen)
      setFen(nextFen)
      setMoves(srvMoves)
      setMessages(srvMessages)
    })
    s.on('chatMessage', (msg) => {
      setMessages((prev) => [...prev, msg].slice(-50))
    })
    return () => s.close()
  }, [])

  useEffect(() => {
    const c = chessRef.current
    if (c.isGameOver()) {
      if (c.isCheckmate()) setStatus('Checkmate')
      else if (c.isDraw()) setStatus('Draw')
      else setStatus('Game over')
    } else {
      setStatus(`${c.turn() === 'w' ? 'White' : 'Black'} to move`)
    }
  }, [fen])

  const createGame = () => {
    if (!socket || !socket.connected) {
      alert('Not connected to server')
      return
    }
    socket.emit('createGame', {}, (res) => {
      if (res?.error) return alert(res.error)
      setRoomId(res.roomId)
      setColor(res.color)
      chessRef.current.load(res.state.fen)
      setFen(res.state.fen)
      setMoves(res.state.moves || [])
      setMessages(res.state.messages || [])
    })
  }

  const joinGame = () => {
    const id = prompt('Enter Room ID:')
    if (!id) return
    socket?.emit('joinGame', { roomId: id }, (res) => {
      if (res?.error) return alert(res.error)
      setRoomId(res.roomId)
      setColor(res.color)
      chessRef.current.load(res.state.fen)
      setFen(res.state.fen)
      setMoves(res.state.moves || [])
      setMessages(res.state.messages || [])
    })
  }

  function onDrop(sourceSquare, targetSquare) {
    const c = chessRef.current
    const isMyTurn = c.turn() === color
    if (!isMyTurn) return false
    const move = { from: sourceSquare, to: targetSquare, promotion: 'q' }
    const temp = new Chess(c.fen())
    const result = temp.move(move)
    if (result) {
      socket?.emit('makeMove', { roomId, ...move }, (res) => {
        if (res?.error) alert(res.error)
      })
      return true
    }
    return false
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <h2>Web Chess</h2>
      <div style={{ marginBottom: 12 }}>
        <button onClick={createGame} disabled={!socket || !socket.connected}>Create Game</button>
        <button onClick={joinGame} disabled={!socket} style={{ marginLeft: 8 }}>Join Game</button>
        {roomId && (
          <span style={{ marginLeft: 12 }}>Room: <b>{roomId}</b> — You are <b>{color === 'w' ? 'White' : 'Black'}</b></span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ width: 500 }}>
          <Chessboard position={fen} onPieceDrop={onDrop} boardOrientation={color === 'w' ? 'white' : 'black'} arePiecesDraggable={Boolean(roomId)} />
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ minWidth: 160 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Status</div>
            <div>{status}</div>
            <div style={{ marginTop: 12 }}>
              <button onClick={() => {
                if (!roomId) return
                socket?.emit('requestState', { roomId }, (res) => {
                  if (res?.state?.fen) {
                    chessRef.current.load(res.state.fen)
                    setFen(res.state.fen)
                    setMoves(res.state.moves || [])
                    setMessages(res.state.messages || [])
                  }
                })
              }}>Refresh State</button>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Moves</div>
              <ol style={{ maxHeight: 300, overflowY: 'auto', paddingLeft: 18 }}>
                {moves.map((m, idx) => (
                  <li key={idx}>{m}</li>
                ))}
              </ol>
            </div>
          </div>
          <div style={{ width: 280 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Chat</div>
            <div style={{ marginBottom: 8 }}>
              <input placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8, height: 260, overflowY: 'auto', background: '#fafafa' }}>
              {messages.map((msg, idx) => (
                <div key={idx} style={{ marginBottom: 6 }}>
                  <b>{msg.name || msg.senderId?.slice(0, 6) || 'Anon'}:</b> {msg.text}
                </div>
              ))}
            </div>
            <form onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.elements.namedItem('chatInput')
              const text = input?.value?.trim()
              if (!text || !roomId) return
              socket?.emit('chatMessage', { roomId, text, name })
              input.value = ''
            }} style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <input name="chatInput" placeholder="Type a message" style={{ flex: 1 }} />
              <button type="submit">Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
