const socket = io();

// DOM Elements
const screens = {
    landing: document.getElementById('landing-screen'),
    waiting: document.getElementById('waiting-screen'),
    game: document.getElementById('game-screen')
};

const views = {
    creator: document.getElementById('creator-view'),
    voterWaiting: document.getElementById('voter-waiting-view'),
    vote: document.getElementById('vote-view'),
    result: document.getElementById('result-view')
};

const roomCodeInput = document.getElementById('room-code-input');
const roomCodeDisplays = document.querySelectorAll('.room-display strong');
const option1Input = document.getElementById('option1-input');
const option2Input = document.getElementById('option2-input');
const voteBtn1 = document.getElementById('vote-option1');
const voteBtn2 = document.getElementById('vote-option2');
const modal = document.getElementById('confirm-modal');

let currentRoom = null;
let myId = null;

socket.on('connect', () => {
    myId = socket.id;
    console.log('Connected with ID:', myId);
});

// Navigation
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}

// Landing Page Events
document.getElementById('create-btn').addEventListener('click', () => {
    socket.emit('create-room');
});

document.getElementById('join-btn').addEventListener('click', () => {
    const code = roomCodeInput.value.toUpperCase();
    if (code.length === 6) {
        socket.emit('join-room', code);
    } else {
        alert('Code moet 6 letters zijn!');
    }
});

// Room Events
socket.on('room-created', (code) => {
    currentRoom = code;
    updateRoomCodeDisplay(code);
    showScreen('waiting');
});

socket.on('error', (msg) => {
    alert(msg);
});

function updateRoomCodeDisplay(code) {
    document.getElementById('room-code-display').textContent = code;
    document.getElementById('game-room-code').textContent = code;
}

// Game Logic
socket.on('game-start', ({ turn }) => {
    currentRoom = roomCodeInput.value.toUpperCase() || currentRoom;
    updateRoomCodeDisplay(currentRoom);
    showScreen('game');
    handleTurn(turn);
});

function handleTurn(turnId) {
    // Clear inputs
    option1Input.value = '';
    option2Input.value = '';
    
    if (turnId === socket.id) {
        showView('creator');
    } else {
        showView('voterWaiting');
    }
}

// Creator Logic
document.getElementById('submit-dilemma-btn').addEventListener('click', () => {
    const opt1 = option1Input.value.trim();
    const opt2 = option2Input.value.trim();

    if (opt1 && opt2) {
        socket.emit('submit-dilemma', {
            roomCode: currentRoom,
            option1: opt1,
            option2: opt2
        });
    } else {
        alert('Vul beide opties in!');
    }
});

socket.on('waiting-for-vote', () => {
    // Creator waits for vote
    // We can reuse the voterWaiting view but change text, or just stay on creator view with disabled inputs?
    // Let's create a specific visual state or just reuse voter waiting with custom text
    showView('voterWaiting');
    document.querySelector('#voter-waiting-view h2').textContent = 'Wachten op de stem...';
});

// Voter Logic
socket.on('dilemma-received', ({ option1, option2 }) => {
    voteBtn1.textContent = option1;
    voteBtn2.textContent = option2;
    showView('vote');
});

voteBtn1.addEventListener('click', () => submitVote(1));
voteBtn2.addEventListener('click', () => submitVote(2));

function submitVote(choice) {
    socket.emit('vote', {
        roomCode: currentRoom,
        choice: choice
    });
}

// Results
socket.on('vote-result', ({ choice, dilemma }) => {
    const r1 = document.getElementById('result-option1');
    const r2 = document.getElementById('result-option2');
    
    r1.textContent = dilemma.option1;
    r2.textContent = dilemma.option2;
    
    r1.className = 'result-card ' + (choice === 1 ? 'selected' : 'not-selected');
    r2.className = 'result-card ' + (choice === 2 ? 'selected' : 'not-selected');
    
    document.getElementById('result-message').textContent = 
        choice === 1 ? `Er is gekozen voor: ${dilemma.option1}` : `Er is gekozen voor: ${dilemma.option2}`;

    showView('result');
    startCountdown();
});

function startCountdown() {
    let count = 3;
    const el = document.getElementById('countdown');
    el.textContent = count;
    
    const interval = setInterval(() => {
        count--;
        el.textContent = count;
        if (count <= 0) {
            clearInterval(interval);
        }
    }, 1000);
}

socket.on('new-round', ({ turn }) => {
    // Reset waiting text
    document.querySelector('#voter-waiting-view h2').textContent = 'De andere maakt een dilemma...';
    handleTurn(turn);
});

// Leaving
document.querySelectorAll('#leave-btn, #leave-game-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        modal.classList.add('active');
    });
});

document.getElementById('cancel-leave').addEventListener('click', () => {
    modal.classList.remove('active');
});

document.getElementById('confirm-leave').addEventListener('click', () => {
    modal.classList.remove('active');
    socket.emit('leave-room', currentRoom);
    resetGame();
});

socket.on('player-left', () => {
    alert('De andere speler heeft het spel verlaten.');
    resetGame();
});

function resetGame() {
    currentRoom = null;
    showScreen('landing');
    roomCodeInput.value = '';
}

