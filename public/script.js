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
    answer: document.getElementById('answer-view'),
    result: document.getElementById('result-view')
};

const roomCodeInput = document.getElementById('room-code-input');
const option1Input = document.getElementById('option1-input');
const option2Input = document.getElementById('option2-input');
const voteBtn1 = document.getElementById('vote-option1');
const voteBtn2 = document.getElementById('vote-option2');
const modal = document.getElementById('confirm-modal');
const roundDisplay = document.getElementById('round-display');
const timerProgress = document.getElementById('timer-progress');

// Mode Selection
const modeSelect = document.getElementById('mode-select');
const instructionText = document.getElementById('instruction-text');
const answerInput = document.getElementById('answer-input');
const submitAnswerBtn = document.getElementById('submit-answer-btn');
const selectedQuestionText = document.getElementById('selected-question-text');
const answerDisplay = document.getElementById('answer-display');
const answerText = document.getElementById('answer-text');

let currentRoom = null;
let myId = null;
let currentMode = 'dilemma'; // dilemma | question
let currentDilemma = null;
let selectedChoice = null;

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

// Mode Selection Logic
modeSelect.addEventListener('change', (e) => {
    setCreatorMode(e.target.value);
});

function setCreatorMode(mode) {
    currentMode = mode;
    
    if (mode === 'dilemma') {
        instructionText.textContent = 'Verzin een lastig dilemma.';
        option1Input.placeholder = 'Optie 1...';
        option2Input.placeholder = 'Optie 2...';
    } else {
        instructionText.textContent = 'Stel twee vragen. De ander kiest er één om te beantwoorden.';
        option1Input.placeholder = 'Vraag 1...';
        option2Input.placeholder = 'Vraag 2...';
    }
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
}

// Game Logic
socket.on('game-start', ({ turn, round }) => {
    currentRoom = roomCodeInput.value.toUpperCase() || currentRoom;
    updateRoomCodeDisplay(currentRoom);
    updateRound(round);
    showScreen('game');
    handleTurn(turn);
});

function updateRound(round) {
    roundDisplay.textContent = round;
}

function handleTurn(turnId) {
    // Clear inputs
    option1Input.value = '';
    option2Input.value = '';
    answerInput.value = '';
    
    // Default to dilemma mode for new turn
    modeSelect.value = 'dilemma';
    setCreatorMode('dilemma');
    
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
            option2: opt2,
            type: currentMode
        });
    } else {
        alert('Vul alles in!');
    }
});

socket.on('waiting-for-vote', () => {
    showView('voterWaiting');
    document.querySelector('#voter-waiting-view h2').textContent = 'Wachten op keuze...';
});

// Voter Logic
socket.on('dilemma-received', ({ option1, option2, type }) => {
    currentDilemma = { option1, option2, type };
    
    voteBtn1.textContent = option1;
    voteBtn2.textContent = option2;
    
    if (type === 'question') {
        document.querySelector('#vote-view h2').textContent = 'Kies een vraag om te beantwoorden';
    } else {
        document.querySelector('#vote-view h2').textContent = 'KIES!';
    }
    
    showView('vote');
});

voteBtn1.addEventListener('click', () => handleVoteChoice(1));
voteBtn2.addEventListener('click', () => handleVoteChoice(2));

function handleVoteChoice(choice) {
    selectedChoice = choice;
    
    if (currentDilemma.type === 'question') {
        // Go to answer view
        const question = choice === 1 ? currentDilemma.option1 : currentDilemma.option2;
        selectedQuestionText.textContent = question;
        showView('answer');
    } else {
        // Submit immediately for dilemma
        submitVote(choice, null);
    }
}

submitAnswerBtn.addEventListener('click', () => {
    const answer = answerInput.value.trim();
    if (answer) {
        submitVote(selectedChoice, answer);
    } else {
        alert('Vul een antwoord in!');
    }
});

function submitVote(choice, answer) {
    socket.emit('vote', {
        roomCode: currentRoom,
        choice: choice,
        answer: answer
    });
}

// Results
socket.on('vote-result', ({ choice, dilemma, answer }) => {
    const r1 = document.getElementById('result-option1');
    const r2 = document.getElementById('result-option2');
    
    r1.textContent = dilemma.option1;
    r2.textContent = dilemma.option2;
    
    // Reset classes
    r1.className = 'result-card';
    r2.className = 'result-card';
    void r1.offsetWidth;

    r1.classList.add(choice === 1 ? 'selected' : 'not-selected');
    r2.classList.add(choice === 2 ? 'selected' : 'not-selected');
    
    let msg = choice === 1 ? `Gekozen: ${dilemma.option1}` : `Gekozen: ${dilemma.option2}`;
    
    if (dilemma.type === 'question' && answer) {
        msg = "Vraag Beantwoord!";
        answerDisplay.style.display = 'block';
        answerText.textContent = answer;
    } else {
        answerDisplay.style.display = 'none';
    }
    
    document.getElementById('result-message').textContent = msg;

    showView('result');
    
    // Longer wait time for question mode
    const duration = (dilemma.type === 'question') ? 12000 : 6000;
    startProgressBar(duration);
});

function startProgressBar(duration) {
    timerProgress.style.transition = 'none';
    timerProgress.style.width = '100%';
    
    void timerProgress.offsetWidth;
    
    timerProgress.style.transition = `width ${duration}ms linear`;
    timerProgress.style.width = '0%';
}

socket.on('new-round', ({ turn, round }) => {
    updateRound(round);
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
    currentDilemma = null;
    currentMode = 'dilemma';
    showScreen('landing');
    roomCodeInput.value = '';
}
