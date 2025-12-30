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
            round: 1,
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
                turn: room.turn,
                round: room.round
            });
        } else {
            socket.emit('error', 'Kamer is vol of bestaat niet.');
        }
    });

    socket.on('submit-dilemma', ({ roomCode, option1, option2, type }) => {
        const room = rooms[roomCode];
        if (room && room.turn === socket.id) {
            room.dilemma = { option1, option2, type };
            socket.to(roomCode).emit('dilemma-received', { option1, option2, type });
            socket.emit('waiting-for-vote');
        }
    });

    socket.on('vote', ({ roomCode, choice, answer }) => {
        const room = rooms[roomCode];
        if (room) {
            // Send result to both
            io.to(roomCode).emit('vote-result', { 
                choice, 
                dilemma: room.dilemma,
                answer: answer || null
            });
            
            // Switch turn
            const otherPlayer = room.players.find(id => id !== room.turn);
            room.turn = otherPlayer;
            const isQuestionMode = room.dilemma.type === 'question';
            room.dilemma = null;
            room.round++;
            
            // Start next round after a delay
            // Longer delay if it was a question mode (to read the answer)
            const delay = isQuestionMode ? 12000 : 6000;
            
            setTimeout(() => {
                io.to(roomCode).emit('new-round', { 
                    turn: room.turn,
                    round: room.round
                });
            }, delay);
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
