const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms[code]); // Ensure unique
    return code;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', ({ playerName, maxPlayers, gameMode }) => {
        // Validate inputs
        if (!playerName || playerName.length > 12) return;
        
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [{
                id: socket.id,
                name: playerName
            }],
            settings: {
                maxPlayers: maxPlayers || 2,
                mode: gameMode || 'mixed'
            },
            turnIndex: 0, // Index of the player whose turn it is
            dilemma: null,
            round: 1,
            votes: {}
        };

        socket.join(roomCode);
        socket.emit('room-created', { code: roomCode, players: rooms[roomCode].players });
    });

    socket.on('join-room', ({ roomCode, playerName }) => {
        const room = rooms[roomCode];
        
        if (!room) {
            socket.emit('error', 'Kamer bestaat niet.');
            return;
        }

        if (room.players.length >= room.settings.maxPlayers) {
            socket.emit('error', 'Kamer is vol!');
            return;
        }

        // Check for duplicate names (optional but good)
        // const nameExists = room.players.some(p => p.name === playerName);

        room.players.push({
            id: socket.id,
            name: playerName
        });
        
        socket.join(roomCode);
        
        // Notify everyone in room of new player list
        io.to(roomCode).emit('player-update', room.players);

        // Start game if enough players? 
        // Logic says:
        // Classic (2): Start when 2.
        // Party (Max 5): The user prompt didn't specify a "Start Game" button for party, 
        // but typically parties wait. However, for simplicity and matching the "Classic" flow,
        // we might start when max is reached OR provide a mechanism. 
        // Given the prompt "je kan ook grotere party selecteren tot max 5", 
        // let's stick to: Classic auto-starts at 2. Party auto-starts at Max? 
        // Or maybe Party also needs 2 to start but allows more?
        // Let's assume auto-start for 2-player classic. 
        // For Party, it's better to have a "Start" button or auto-start at 2+?
        // The prompt says "je kan ook grotere party selecteren tot max 5".
        // Let's auto-start when 2 players join for now to keep it simple, 
        // but allow others to join mid-game? No, that complicates turns.
        // Let's make it so for Party mode, we need a "Start Game" trigger or wait for full?
        // Actually, let's just wait for 2 players to start the loop, but allow others to join?
        // No, simplest is: Classic = Start at 2. Party = Start at `maxPlayers`? 
        // Or Start at 2 and just play?
        // User didn't specify "Start Button".
        // Let's Start when `maxPlayers` is reached.
        
        if (room.players.length === parseInt(room.settings.maxPlayers)) {
            startGame(roomCode);
        } else {
             // If it's a party mode and we have at least 2, maybe we should let them start?
             // But without a start button, we have to wait for max.
             // OR, we change the UI to add a start button for the host.
             // I will implement: Start when max capacity is reached.
             // AND/OR: If it is party mode, maybe add a "Start Now" button?
             // The user didn't ask for a start button.
             // I'll stick to: Start when Max Players reached.
        }
    });

    function startGame(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;

        io.to(roomCode).emit('game-start', { 
            turnId: room.players[room.turnIndex].id,
            round: room.round,
            players: room.players,
            settings: room.settings
        });
    }

    socket.on('submit-dilemma', ({ roomCode, option1, option2, type }) => {
        const room = rooms[roomCode];
        if (room && room.players[room.turnIndex].id === socket.id) {
            room.dilemma = { option1, option2, type };
            
            // Send to everyone EXCEPT the creator (socket.to broadcasts to room excluding sender)
            // But we can just use io.to and let the client decide what to show based on ID
            // Actually, `socket.to(roomCode)` is safer to assume "others".
            socket.to(roomCode).emit('dilemma-received', { 
                option1, option2, type, 
                creatorName: room.players[room.turnIndex].name 
            });
            
            socket.emit('waiting-for-vote');
        }
    });

    socket.on('vote', ({ roomCode, choice, answer }) => {
        const room = rooms[roomCode];
        if (room) {
            // Track votes
            room.votes[socket.id] = { choice, answer };

            // Check if everyone (except creator) has voted
            // Creators don't vote
            const votersCount = room.players.length - 1;
            const currentVotes = Object.keys(room.votes).length;

            if (currentVotes >= votersCount) {
                // All votes in
                finishRound(roomCode);
            }
        }
    });

    function finishRound(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;

        // Calculate results
        // Simple majority or just show all?
        // For 2 players: 1 voter. Simple.
        // For 5 players: 4 voters. 
        // The frontend `vote-result` expects a single `choice`. 
        // We need to aggregate.
        // Or we send back ALL votes?
        // The current frontend highlights the selected card.
        // If multiple people voted different things, how do we show it?
        // "Maak mooi" -> Maybe show percentages or counts?
        // The prompt didn't specify complex voting results.
        // For now, I will modify `vote-result` to handle multiple votes if necessary.
        // But to keep it simple and compatible:
        // I'll send an array of results or the "Winning" choice.
        // Let's send the *winning* choice to highlight, and maybe stats.
        
        let count1 = 0;
        let count2 = 0;
        let answers = []; // For open questions

        Object.values(room.votes).forEach(v => {
            if (v.choice === 1) count1++;
            if (v.choice === 2) count2++;
            if (v.answer) answers.push(v.answer);
        });

        const winningChoice = count1 >= count2 ? 1 : 2; // Tie goes to 1 for now (or random?)
        // Or we can send both counts.

        // For open questions, usually 1 person answers in 2-player.
        // In party mode? "Open vragen...". 
        // Usually Open Question is "Choose a question to answer".
        // If 4 people vote, they choose which question the Creator answers? 
        // Wait, the flow is: Creator makes 2 questions. Voters choose 1. 
        // Then Creator answers? 
        // NO, the original code says: 
        // `if (type === 'question') ... showView('answer') ... submitVote(choice, answer)`
        // So the VOTER answers the question.
        // In Party mode: Who answers?
        // If 4 voters, do they all answer?
        // That would be chaotic to display.
        // Requirement: "je kan ook grotere party selecteren tot max 5".
        // Let's assume for Party mode + Question:
        // Everyone votes on the question. The *winner* (most voted question) is the one EVERYONE has to answer?
        // OR only the creator answers?
        // Let's look at `script.js`:
        // Voter chooses -> `handleVoteChoice` -> `submitVote(choice, answer)`.
        // So the Voter answers.
        // In Party Mode, we will collect all answers.
        // To keep it simple: We pick one random answer to display? Or display all?
        // The prompt is vague on Party Mode mechanics for Questions.
        // I will assume for now: We show the most popular choice, and maybe a random answer if multiple provided.
        // Or list them.
        
        io.to(roomCode).emit('vote-result', { 
            winningChoice,
            stats: { 1: count1, 2: count2 },
            dilemma: room.dilemma,
            answers: answers // Send all answers
        });

        // Reset for next round
        room.votes = {};
        room.dilemma = null;
        room.round++;
        
        // Rotate turn
        room.turnIndex = (room.turnIndex + 1) % room.players.length;

        const delay = (answers.length > 0) ? 12000 : 6000;
        
        setTimeout(() => {
            if (rooms[roomCode]) { // Check if room still exists
                io.to(roomCode).emit('new-round', { 
                    turnId: room.players[room.turnIndex].id,
                    round: room.round
                });
            }
        }, delay);
    }

    socket.on('leave-room', (roomCode) => {
        handleDisconnect(socket, roomCode);
    });

    socket.on('disconnect', () => {
        for (const [code, room] of Object.entries(rooms)) {
            if (room.players.find(p => p.id === socket.id)) {
                handleDisconnect(socket, code);
                break;
            }
        }
    });
});

function handleDisconnect(socket, roomCode) {
    const room = rooms[roomCode];
    if (room) {
        // Remove player
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        const wasCreator = (playerIndex === room.turnIndex);
        const leavingPlayerName = room.players[playerIndex].name;
        
        room.players.splice(playerIndex, 1);
        socket.leave(roomCode);

        // Notify others
        io.to(roomCode).emit('player-left', { 
            name: leavingPlayerName,
            remaining: room.players 
        });

        // If not enough players, destroy room or reset?
        if (room.players.length < 2 && room.settings.maxPlayers > 1) { // Assuming 1-player test mode isn't a thing
             // For simplicity, if someone leaves a 2-player game, end it.
             // For party, if we drop below 2, end it.
             io.to(roomCode).emit('game-ended', 'Te weinig spelers over.');
             delete rooms[roomCode];
             io.in(roomCode).socketsLeave(roomCode);
        } else {
             // Adjust turn index if needed
             if (wasCreator) {
                 room.turnIndex = room.turnIndex % room.players.length;
                 // Immediate new round or reset turn?
                 // Simple: Restart round logic
                 io.to(roomCode).emit('new-round', {
                     turnId: room.players[room.turnIndex].id,
                     round: room.round
                 });
             } else if (playerIndex < room.turnIndex) {
                 room.turnIndex--;
             }
             
             // Update player list for those remaining
             io.to(roomCode).emit('player-update', room.players);
        }
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
