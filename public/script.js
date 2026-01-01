const socket = io();

// DOM Elements
const screens = {
    landing: document.getElementById('landing-screen'),
    settings: document.getElementById('settings-screen'),
    waiting: document.getElementById('waiting-screen'),
    game: document.getElementById('game-screen')
};

const views = {
    creatorChoice: document.getElementById('creator-choice-view'),
    creatorInput: document.getElementById('creator-input-view'),
    voterWaiting: document.getElementById('voter-waiting-view'),
    vote: document.getElementById('vote-view'),
    answer: document.getElementById('answer-view'),
    result: document.getElementById('result-view')
};

// Inputs
const usernameInput = document.getElementById('username-input');
const roomCodeInput = document.getElementById('room-code-input');
const option1Input = document.getElementById('option1-input');
const option2Input = document.getElementById('option2-input');
const answerInput = document.getElementById('answer-input');

// Buttons
const createInitBtn = document.getElementById('create-init-btn');
const joinBtn = document.getElementById('join-btn');
const backSettingsBtn = document.getElementById('back-settings-btn');
const createConfirmBtn = document.getElementById('create-confirm-btn');
const leaveBtn = document.getElementById('leave-btn');
const leaveGameBtn = document.getElementById('leave-game-btn');
const choiceDilemmaBtn = document.getElementById('choice-dilemma-btn');
const choiceQuestionBtn = document.getElementById('choice-question-btn');
const backChoiceBtn = document.getElementById('back-choice-btn');
const submitDilemmaBtn = document.getElementById('submit-dilemma-btn');
const voteBtn1 = document.getElementById('vote-option1');
const voteBtn2 = document.getElementById('vote-option2');
const submitAnswerBtn = document.getElementById('submit-answer-btn');
const backVoteBtn = document.getElementById('back-vote-btn');
const hostStartBtn = document.getElementById('host-start-btn');

// Display Elements
const roomCodeDisplay = document.getElementById('room-code-display');
const playerList = document.getElementById('player-list');
const playerCountIndicator = document.getElementById('player-count-indicator');
const opponentsDisplay = document.getElementById('opponents-display');
const roundDisplay = document.getElementById('round-display');
const timerProgress = document.getElementById('timer-progress');
const selectedQuestionText = document.getElementById('selected-question-text');
const answerDisplay = document.getElementById('answer-display');
const answerText = document.getElementById('answer-text');
const creatorNameDisplay = document.getElementById('creator-name-display');
const resultMessage = document.getElementById('result-message');
const waitingText = document.getElementById('waiting-text');
const creatorTargetsDisplay = document.getElementById('creator-targets-display');

// Modals
const confirmModal = document.getElementById('confirm-modal');
const alertModal = document.getElementById('alert-modal');
const alertTitle = document.getElementById('alert-title');
const alertMessage = document.getElementById('alert-message');
const alertOkBtn = document.getElementById('alert-ok-btn');

// State
let myId = null;
let myName = "";
let currentRoom = null;
let currentMode = 'dilemma'; 
let currentSettings = { maxPlayers: 2, mode: 'mixed' };
let currentDilemma = null;
let selectedChoice = null;
let players = [];
let slideshowInterval = null;

// Socket Init
socket.on('connect', () => {
    myId = socket.id;
    console.log('Connected:', myId);
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

function showAlert(title, msg, onOk = null) {
    alertTitle.textContent = title;
    alertMessage.textContent = msg;
    alertModal.classList.add('active');
    
    alertOkBtn.onclick = () => {
        alertModal.classList.remove('active');
        if (onOk) onOk();
    };
}

// Input Validation
usernameInput.addEventListener('input', (e) => {
    // Remove spaces and keep max 12
    e.target.value = e.target.value.replace(/\s/g, '').slice(0, 12);
});

function validateName() {
    const name = usernameInput.value.trim();
    if (!name) {
        showAlert('Fout', 'Vul eerst een naam in!');
        return false;
    }
    if (name.length > 12) {
        showAlert('Fout', 'Naam te lang (max 12)!');
        return false;
    }
    myName = name;
    return true;
}

// Create Flow
createInitBtn.addEventListener('click', () => {
    if (validateName()) {
        showScreen('settings');
    }
});

backSettingsBtn.addEventListener('click', () => {
    showScreen('landing');
});

// Settings Toggles
document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const parent = e.target.parentElement;
        parent.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        if (parent.id === 'mode-options') {
            currentSettings.mode = e.target.dataset.value;
        }
    });
});

// Number Selector Logic
document.querySelectorAll('.num-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const parent = e.target.parentElement;
        parent.querySelectorAll('.num-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const target = e.currentTarget; 
        currentSettings.maxPlayers = parseInt(target.dataset.value);
    });
});


createConfirmBtn.addEventListener('click', () => {
    createConfirmBtn.disabled = true; 
    createConfirmBtn.textContent = 'Bezig...';

    socket.emit('create-room', {
        playerName: myName,
        maxPlayers: currentSettings.maxPlayers,
        gameMode: currentSettings.mode
    });
    
    setTimeout(() => {
        createConfirmBtn.disabled = false;
        createConfirmBtn.textContent = 'Start Lobby';
    }, 5000);
});

// Join Flow
joinBtn.addEventListener('click', () => {
    if (!validateName()) return;
    
    const code = roomCodeInput.value.toUpperCase();
    if (code.length === 6) {
        joinBtn.disabled = true;
        joinBtn.textContent = '...';
        
        socket.emit('join-room', { roomCode: code, playerName: myName });
    } else {
        showAlert('Fout', 'Code moet 6 letters zijn!');
    }
});

// Socket Events: Room Setup
socket.on('room-created', ({ code, players: pList }) => {
    createConfirmBtn.disabled = false;
    createConfirmBtn.textContent = 'Start Lobby';
    
    currentRoom = code;
    updatePlayerList(pList);
    roomCodeDisplay.textContent = code;
    showScreen('waiting');
});

socket.on('join-success', ({ code, players: pList, settings }) => {
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join';
    
    currentRoom = code;
    currentSettings = settings; 
    updatePlayerList(pList);
    roomCodeDisplay.textContent = code;
    showScreen('waiting');
});

socket.on('player-update', (pList) => {
    updatePlayerList(pList);
});

function updatePlayerList(pList) {
    players = pList;
    playerList.innerHTML = '';
    
    // Check if I am the host
    const isHost = pList.length > 0 && pList[0].id === myId;
    
    pList.forEach((p, index) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        
        const isMe = p.id === myId;
        const nameText = p.name + (isMe ? ' (Jij)' : '');
        const roleText = index === 0 ? '<span class="role-badge">Host</span>' : '';
        
        div.innerHTML = `<span>${nameText}</span> ${roleText}`;
        playerList.appendChild(div);
    });

    if (pList.length > 0) {
        if (currentSettings.maxPlayers) {
             playerCountIndicator.textContent = `${pList.length} / ${currentSettings.maxPlayers}`;
        } else {
             playerCountIndicator.textContent = `${pList.length} Spelers`;
        }
    }

    // Show/Hide start button for host
    if (isHost && pList.length >= 2) {
        hostStartBtn.style.display = 'flex';
    } else {
        hostStartBtn.style.display = 'none';
    }

    // Update opponents text for game screen
    const opponentNames = pList
        .filter(p => p.id !== myId)
        .map(p => p.name)
        .join(', ');
    opponentsDisplay.textContent = opponentNames || 'Wachten...';
}

hostStartBtn.addEventListener('click', () => {
    socket.emit('start-game-request', currentRoom);
});

socket.on('error', (msg) => {
    showAlert('Fout', msg);
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join';
    createConfirmBtn.disabled = false;
    createConfirmBtn.textContent = 'Start Lobby';
});

// Game Start
socket.on('game-start', ({ turnId, round, players: pList, settings }) => {
    currentSettings = settings;
    updatePlayerList(pList);
    updateRound(round);
    showScreen('game');
    handleTurn(turnId);
});

function updateRound(r) {
    roundDisplay.textContent = r;
}

function handleTurn(turnId) {
    // Stop any existing slideshows
    if (slideshowInterval) clearInterval(slideshowInterval);
    
    // Reset inputs
    option1Input.value = '';
    option2Input.value = '';
    answerInput.value = '';
    
    if (turnId === myId) {
        setupCreatorView();
    } else {
        const creator = players.find(p => p.id === turnId);
        creatorNameDisplay.textContent = creator ? creator.name : 'De ander';
        // Ensure explicit text when waiting for creator
        document.querySelector('#voter-waiting-view h2').innerHTML = `<span>${creatorNameDisplay.textContent}</span> maakt iets...`;
        showView('voterWaiting');
    }
}

// Creator Logic
function setupCreatorView() {
    if (creatorTargetsDisplay) {
        const targets = players
            .filter(p => p.id !== myId)
            .map(p => `<span class="target-badge">${p.name}</span>`)
            .join('');
        
        if (targets) {
            creatorTargetsDisplay.innerHTML = `Voor: ${targets}`;
        } else {
            creatorTargetsDisplay.innerHTML = `Wachten...`;
        }
    }

    const mode = currentSettings.mode; 
    
    if (mode === 'dilemma-only') {
        setCreatorMode('dilemma');
        showView('creatorInput');
        document.getElementById('back-choice-btn').style.display = 'none'; 
    } else if (mode === 'question-only') {
        setCreatorMode('question');
        showView('creatorInput');
        document.getElementById('back-choice-btn').style.display = 'none';
    } else {
        showView('creatorChoice');
        document.getElementById('back-choice-btn').style.display = 'block';
    }
}

choiceDilemmaBtn.addEventListener('click', () => {
    setCreatorMode('dilemma');
    showView('creatorInput');
});

choiceQuestionBtn.addEventListener('click', () => {
    setCreatorMode('question');
    showView('creatorInput');
});

backChoiceBtn.addEventListener('click', () => {
    showView('creatorChoice');
});

function setCreatorMode(mode) {
    currentMode = mode;
    const title = document.getElementById('input-title');
    const instruction = document.getElementById('instruction-text');
    
    if (mode === 'dilemma') {
        title.textContent = 'Nieuw Dilemma';
        instruction.textContent = 'Verzin een lastig dilemma.';
        option1Input.placeholder = 'Optie 1...';
        option2Input.placeholder = 'Optie 2...';
    } else {
        title.textContent = 'Nieuwe Vragen';
        instruction.textContent = 'Stel twee vragen. De anderen kiezen er één.';
        option1Input.placeholder = 'Vraag 1...';
        option2Input.placeholder = 'Vraag 2...';
    }
}

submitDilemmaBtn.addEventListener('click', () => {
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
        showAlert('Let op', 'Vul beide opties in!');
    }
});

socket.on('waiting-for-vote', () => {
    showView('voterWaiting');
    // Ensure explicit text when waiting for votes
    document.querySelector('#voter-waiting-view h2').innerHTML = 'Wachten op antwoorden...';
});

// Voter Logic
socket.on('dilemma-received', ({ option1, option2, type, creatorName }) => {
    currentDilemma = { option1, option2, type };
    
    voteBtn1.textContent = option1;
    voteBtn2.textContent = option2;
    
    const title = document.querySelector('#vote-view h2');
    if (type === 'question') {
        title.textContent = `${creatorName} stelt vragen. Kies er één!`;
    } else {
        title.textContent = `${creatorName} stelt een dilemma!`;
    }
    
    showView('vote');
});

voteBtn1.addEventListener('click', () => handleVoteChoice(1));
voteBtn2.addEventListener('click', () => handleVoteChoice(2));

function handleVoteChoice(choice) {
    selectedChoice = choice;
    
    if (currentDilemma.type === 'question') {
        const question = choice === 1 ? currentDilemma.option1 : currentDilemma.option2;
        selectedQuestionText.textContent = question;
        showView('answer');
    } else {
        submitVote(choice, null);
        showView('voterWaiting');
        document.querySelector('#voter-waiting-view h2').textContent = 'Wachten op de rest...';
    }
}

backVoteBtn.addEventListener('click', () => {
    showView('vote');
});

submitAnswerBtn.addEventListener('click', () => {
    const answer = answerInput.value.trim();
    if (answer) {
        submitVote(selectedChoice, answer);
        showView('voterWaiting');
        document.querySelector('#voter-waiting-view h2').textContent = 'Wachten op de rest...';
    } else {
        showAlert('Let op', 'Vul een antwoord in!');
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
socket.on('vote-result', ({ winningChoice, votesByOption, dilemma, answers }) => {
    const r1 = document.getElementById('result-option1');
    const r2 = document.getElementById('result-option2');
    
    // Set text and clear previous voter lists
    r1.innerHTML = `<span>${dilemma.option1}</span>`;
    r2.innerHTML = `<span>${dilemma.option2}</span>`;
    
    // Add voter names
    if (votesByOption[1] && votesByOption[1].length > 0) {
        const list1 = document.createElement('div');
        list1.className = 'voter-names';
        list1.textContent = votesByOption[1].join(', ');
        r1.appendChild(list1);
    }
    if (votesByOption[2] && votesByOption[2].length > 0) {
        const list2 = document.createElement('div');
        list2.className = 'voter-names';
        list2.textContent = votesByOption[2].join(', ');
        r2.appendChild(list2);
    }
    
    r1.className = 'result-card';
    r2.className = 'result-card';
    void r1.offsetWidth;

    if (winningChoice === 1) r1.classList.add('selected');
    else r1.classList.add('not-selected');
    
    if (winningChoice === 2) r2.classList.add('selected');
    else r2.classList.add('not-selected');
    
    let msg = winningChoice === 1 ? `De meerderheid koos: Optie 1` : `De meerderheid koos: Optie 2`;
    
    if (dilemma.type === 'question' && answers && answers.length > 0) {
        msg = "Vragen beantwoord!";
        answerDisplay.style.display = 'block';
        
        // Slideshow logic
        playAnswerSlideshow(answers);
        
    } else {
        answerDisplay.style.display = 'none';
        const duration = 6000;
        startProgressBar(duration);
    }
    
    resultMessage.textContent = msg;
    showView('result');
});

function playAnswerSlideshow(answers) {
    // Clear any existing interval
    if (slideshowInterval) clearInterval(slideshowInterval);
    
    let currentIndex = 0;
    
    // Function to show current answer
    const showAnswer = () => {
        if (currentIndex >= answers.length) {
            clearInterval(slideshowInterval);
            return;
        }
        
        const a = answers[currentIndex];
        answerText.innerHTML = `<strong>${a.name}:</strong><br><br>&ldquo;${a.text}&rdquo;`;
        
        // Reset progress bar for 10s
        startProgressBar(10000);
        
        currentIndex++;
    };
    
    // Show first immediately
    showAnswer();
    
    // Schedule next
    slideshowInterval = setInterval(showAnswer, 10000);
}

function startProgressBar(duration) {
    timerProgress.style.transition = 'none';
    timerProgress.style.width = '100%';
    void timerProgress.offsetWidth;
    timerProgress.style.transition = `width ${duration}ms linear`;
    timerProgress.style.width = '0%';
}

socket.on('new-round', ({ turnId, round }) => {
    updateRound(round);
    handleTurn(turnId);
});

// Leaving Logic
leaveBtn.addEventListener('click', () => confirmModal.classList.add('active'));
leaveGameBtn.addEventListener('click', () => confirmModal.classList.add('active'));
document.getElementById('cancel-leave').addEventListener('click', () => confirmModal.classList.remove('active'));

document.getElementById('confirm-leave').addEventListener('click', () => {
    confirmModal.classList.remove('active');
    socket.emit('leave-room', currentRoom);
    resetGame();
});

socket.on('player-left', ({ name, remaining }) => {
    showAlert('Speler Vertrokken', `${name} heeft het spel verlaten.`);
    updatePlayerList(remaining);
});

socket.on('game-ended', (reason) => {
    showAlert('Spel Afgelopen', reason, () => {
        resetGame();
    });
});

function resetGame() {
    if (slideshowInterval) clearInterval(slideshowInterval);
    currentRoom = null;
    currentDilemma = null;
    currentMode = 'dilemma';
    players = [];
    showScreen('landing');
    roomCodeInput.value = '';
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join';
    createConfirmBtn.disabled = false;
    createConfirmBtn.textContent = 'Start Lobby';
}
