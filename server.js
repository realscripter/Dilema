const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Game state storage (in-memory for simplicity)
const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', () => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [socket.id],
            turn: socket.id, // Creator starts
            dilemma: null,
            votes: {}
        };
        socket.join(roomCode);
        socket.emit('room-created', roomCode);
    });

    socket.on('join-room', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.players.length < 2) {
            room.players.push(socket.id);
            socket.join(roomCode);
            io.to(roomCode).emit('game-start', { 
                turn: room.turn 
            });
        } else {
            socket.emit('error', 'Kamer is vol of bestaat niet.');
        }
    });

    socket.on('submit-dilemma', ({ roomCode, option1, option2 }) => {
        const room = rooms[roomCode];
        if (room && room.turn === socket.id) {
            room.dilemma = { option1, option2 };
            // Switch turn immediately for next round logic, but first let the other player vote
            // Actually, wait for vote before switching turn
            socket.to(roomCode).emit('dilemma-received', { option1, option2 });
            socket.emit('waiting-for-vote');
        }
    });

    socket.on('vote', ({ roomCode, choice }) => {
        const room = rooms[roomCode];
        if (room) {
            // Send result to both
            io.to(roomCode).emit('vote-result', { 
                choice, 
                dilemma: room.dilemma 
            });
            
            // Switch turn
            const otherPlayer = room.players.find(id => id !== room.turn);
            room.turn = otherPlayer;
            room.dilemma = null;
            
            // Start next round after a delay
            setTimeout(() => {
                io.to(roomCode).emit('new-round', { turn: room.turn });
            }, 3000);
        }
    });

    socket.on('leave-room', (roomCode) => {
        handleDisconnect(socket, roomCode);
    });

    socket.on('disconnect', () => {
        // Find room player was in
        for (const [code, room] of Object.entries(rooms)) {
            if (room.players.includes(socket.id)) {
                handleDisconnect(socket, code);
                break;
            }
        }
    });
});

function handleDisconnect(socket, roomCode) {
    const room = rooms[roomCode];
    if (room) {
        io.to(roomCode).emit('player-left');
        delete rooms[roomCode]; // Clean up room
        // Make everyone in that room leave the socket room
        io.in(roomCode).socketsLeave(roomCode);
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});

