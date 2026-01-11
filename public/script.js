const socket = io();

// DOM Elements - Global scope
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
    result: document.getElementById('result-view'),
    votePerson: document.getElementById('vote-person-view')
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
const choicePhotoBtn = document.getElementById('choice-photo-btn');
const choiceVotePersonBtn = document.getElementById('choice-vote-person-btn');
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
const timerSeconds = document.getElementById('timer-seconds');
const timerText = document.getElementById('timer-text');
const resultTimerContainer = document.getElementById('result-timer-container');
const selectedQuestionText = document.getElementById('selected-question-text');
const answerDisplay = document.getElementById('answer-display');
const creatorNameDisplay = document.getElementById('creator-name-display');
const resultMessage = document.getElementById('result-message');
const waitingText = document.getElementById('waiting-text');
const creatorTargetsDisplay = document.getElementById('creator-targets-display');
const votersProgressContainer = document.getElementById('voters-progress-container');

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
let currentSettings = { maxPlayers: 2, mode: 'mixed', allowedModes: ['dilemma', 'question'], createTimerMinutes: null };
let currentDilemma = null;
let selectedChoice = null;
let players = [];
let slideshowInterval = null;
let photoData = { 1: null, 2: null };
let createTimerInterval = null;
let createTimerSeconds = null;
let pageVisibilityTimeout = null;
let selectedVotePerson = null;
let turnId = null;
let currentCropImage = null;
let currentCropTarget = null;
let cropBox = null;
let isCropping = false;
let cropStartX = 0;
let cropStartY = 0;
let cropBoxX = 0;
let cropBoxY = 0;
let cropBoxSize = 200;
let initialCropBoxX = 0;
let initialCropBoxY = 0;

// Socket Init
socket.on('connect', () => {
    myId = socket.id;
    console.log('Connected:', myId);
});

// Page Visibility API - Track activity
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentRoom) {
        socket.emit('player-activity', currentRoom);
        if (pageVisibilityTimeout) {
            clearTimeout(pageVisibilityTimeout);
            pageVisibilityTimeout = null;
        }
    }
});

// Send activity updates periodically while in game (reduced frequency to allow inactivity)
setInterval(() => {
    if (currentRoom && !document.hidden) {
        socket.emit('player-activity', currentRoom);
    }
}, 60000); // Every 60 seconds instead of 30

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
if (createInitBtn) {
    createInitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Create party button clicked');
        if (validateName()) {
            console.log('Name validated, showing settings');
            showScreen('settings');
        } else {
            console.log('Name validation failed');
        }
    });
} else {
    console.error('createInitBtn is null! Button not found in DOM.');
}

backSettingsBtn.addEventListener('click', () => {
    showScreen('landing');
});

// Settings Toggles (Allowed Modes) - FIXED
document.querySelectorAll('.toggle-switch').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (toggle.id === 'rare-round-toggle') {
            toggle.classList.toggle('active');
            const rareRoundSettings = document.getElementById('rare-round-settings');
            if (rareRoundSettings) {
                rareRoundSettings.style.display = toggle.classList.contains('active') ? 'block' : 'none';
            }
        } else if (toggle.id === 'random-turn-order-toggle') {
            // Random turn order can be toggled independently
            toggle.classList.toggle('active');
        } else {
            toggle.classList.toggle('active');
            const active = document.querySelectorAll('.toggle-switch.active:not(#rare-round-toggle):not(#random-turn-order-toggle)');
            if (active.length === 0) {
                toggle.classList.add('active');
            }
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
    const allowed = [];
    document.querySelectorAll('.toggle-switch.active').forEach(t => {
        const mode = t.dataset.mode;
        if (mode && mode !== 'rare-round' && ['dilemma', 'question', 'photo', 'vote-person'].includes(mode)) {
            allowed.push(mode);
        }
    });
    
    if (allowed.length === 0) {
        showAlert('Fout', 'Selecteer minimaal één spelmodus!');
        createConfirmBtn.disabled = false;
        createConfirmBtn.textContent = 'Start Lobby';
        return;
    }
    
    if (!myName || myName.trim().length === 0) {
        if (!validateName()) {
            createConfirmBtn.disabled = false;
            createConfirmBtn.textContent = 'Start Lobby';
            return;
        }
    }

    const timerValue = parseInt(document.getElementById('timer-select').value) || 0;
    const timerMinutes = timerValue === 0 ? null : timerValue;
    
    // Aantal rondes removed - always infinite now
    
    const rareRoundToggle = document.getElementById('rare-round-toggle');
    const rareRoundEnabled = rareRoundToggle && rareRoundToggle.classList.contains('active');
    const rareRoundFrequency = rareRoundEnabled ? parseInt(document.getElementById('rare-round-frequency')?.value) || 5 : null;
    
    const randomTurnOrderToggle = document.getElementById('random-turn-order-toggle');
    const randomTurnOrder = randomTurnOrderToggle && randomTurnOrderToggle.classList.contains('active');

    createConfirmBtn.disabled = true; 
    createConfirmBtn.textContent = 'Bezig...';

    console.log('Creating room with:', { playerName: myName, maxPlayers: currentSettings.maxPlayers, allowedModes: allowed });

    socket.emit('create-room', {
        playerName: myName,
        maxPlayers: currentSettings.maxPlayers,
        allowedModes: allowed,
        createTimerMinutes: timerMinutes,
        maxRounds: null, // Always infinite
        rareRoundEnabled: rareRoundEnabled,
        rareRoundFrequency: rareRoundFrequency,
        randomTurnOrder: randomTurnOrder || false
    });
    
    setTimeout(() => {
        createConfirmBtn.disabled = false;
        createConfirmBtn.textContent = 'Start Lobby';
    }, 5000);
});

// Input monitoring for auto-submit detection
let lastInputTime = Date.now();
let inputMonitoringInterval = null;

function startInputMonitoring() {
    if (inputMonitoringInterval) return;
    lastInputTime = Date.now();
}

function stopInputMonitoring() {
    if (inputMonitoringInterval) {
        clearInterval(inputMonitoringInterval);
        inputMonitoringInterval = null;
    }
}

// Track input on option fields
if (option1Input) {
    option1Input.addEventListener('input', () => {
        lastInputTime = Date.now();
    });
}

if (option2Input) {
    option2Input.addEventListener('input', () => {
        lastInputTime = Date.now();
    });
}

// Track photo uploads
['file-input-1', 'file-input-2'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
        input.addEventListener('change', () => {
            lastInputTime = Date.now();
        });
    }
});

// Track vote person question input
const votePersonQuestionInput = document.getElementById('vote-person-question-input');
if (votePersonQuestionInput) {
    votePersonQuestionInput.addEventListener('input', () => {
        lastInputTime = Date.now();
    });
}

// Track photo question input  
const photoQuestionInput = document.getElementById('photo-question-input');
if (photoQuestionInput) {
    photoQuestionInput.addEventListener('input', () => {
        lastInputTime = Date.now();
    });
}

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
socket.on('room-created', ({ code, players: pList, settings }) => {
    createConfirmBtn.disabled = false;
    createConfirmBtn.textContent = 'Start Lobby';
    
    currentRoom = code;
    currentSettings = settings || currentSettings;
    updatePlayerList(pList);
    roomCodeDisplay.textContent = code;
    updateLobbySettings(settings);
    showScreen('waiting');
});

function updateLobbySettings(settings) {
    const settingsDisplay = document.getElementById('lobby-settings-display');
    if (!settingsDisplay) return;
    
    let html = '';
    html += `<div class="setting-item"><span>Spelers:</span> <strong>${settings.maxPlayers || 2}</strong></div>`;
    html += `<div class="setting-item"><span>Modi:</span> <strong>${(settings.allowedModes || []).join(', ')}</strong></div>`;
    const timerText = settings.createTimerMinutes ? `${settings.createTimerMinutes} min` : 'Oneindig';
    html += `<div class="setting-item"><span>Timer:</span> <strong>${timerText}</strong></div>`;
    
    settingsDisplay.innerHTML = html;
}

socket.on('join-success', ({ code, players: pList, settings }) => {
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join';
    
    currentRoom = code;
    currentSettings = settings || currentSettings; 
    updatePlayerList(pList);
    roomCodeDisplay.textContent = code;
    updateLobbySettings(settings);
    showScreen('waiting');
});

socket.on('player-update', (pList) => {
    updatePlayerList(pList);
});

function updatePlayerList(pList) {
    players = pList;
    playerList.innerHTML = '';
    
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

    if (isHost && pList.length >= 2) {
        hostStartBtn.style.display = 'flex';
    } else {
        hostStartBtn.style.display = 'none';
    }

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

function handleTurn(newTurnId) {
    turnId = newTurnId;
    if (slideshowInterval) {
        clearInterval(slideshowInterval);
        slideshowInterval = null;
    }
    
    // Reset timer first
    resetTimer();
    
    option1Input.value = '';
    option2Input.value = '';
    answerInput.value = '';
    selectedChoice = null;
    currentDilemma = null;
    photoData = { 1: null, 2: null };
    document.getElementById('preview-1').hidden = true;
    document.getElementById('preview-2').hidden = true;
    document.querySelectorAll('.remove-photo-btn').forEach(b => b.hidden = true);
    // Remove visual indicators
    document.getElementById('photo-upload-1')?.classList.remove('has-image');
    document.getElementById('photo-upload-2')?.classList.remove('has-image');
    const photoQuestionInput = document.getElementById('photo-question-input');
    if (photoQuestionInput) photoQuestionInput.value = '';
    const votePersonQuestionInput = document.getElementById('vote-person-question-input');
    if (votePersonQuestionInput) votePersonQuestionInput.value = '';
    
    if (answerDisplay) {
        answerDisplay.style.display = 'none';
        answerDisplay.innerHTML = '';
    }
    
    const timerContainer = document.getElementById('timer-display-container');
    if (timerContainer) timerContainer.style.display = 'none';
    
    selectedVotePerson = null;
    
    // Check for rare round
    if (currentSettings.isRareRound && currentSettings.rareRoundQuestion) {
        // Rare round: show question and let current player create dilemma based on it
        // TODO: Implement rare round UI
        console.log('Rare round! Question:', currentSettings.rareRoundQuestion);
    }
    
    if (turnId === myId) {
        setupCreatorView();
        startInputMonitoring();
        if (currentSettings.createTimerMinutes && currentSettings.createTimerMinutes > 0) {
            setTimeout(() => {
                socket.emit('start-create-timer', currentRoom);
            }, 100);
        }
    } else {
        stopInputMonitoring();
        const creator = players.find(p => p.id === turnId);
        creatorNameDisplay.textContent = creator ? creator.name : 'De ander';
        document.querySelector('#voter-waiting-view h2').innerHTML = `<span>${creatorNameDisplay.textContent}</span> maakt iets...`;
        votersProgressContainer.innerHTML = ''; 
        showView('voterWaiting');
    }
}

socket.on('create-timer-update', ({ remainingSeconds, totalSeconds }) => {
    const timerContainer = document.getElementById('timer-display-container');
    const timerValue = document.getElementById('timer-value');
    
    if (timerContainer && timerValue) {
        timerContainer.style.display = 'block';
        
        if (remainingSeconds <= 0) {
            timerValue.textContent = '0:00';
            timerValue.style.color = 'var(--danger)';
        } else {
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            timerValue.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            if (remainingSeconds <= 30) {
                timerValue.style.color = 'var(--danger)';
            } else if (remainingSeconds <= 60) {
                timerValue.style.color = '#ffa502';
            } else {
                timerValue.style.color = 'var(--primary)';
            }
        }
    }
    
    const voterWaitingView = document.querySelector('#voter-waiting-view');
    if (voterWaitingView && voterWaitingView.classList.contains('active')) {
        const waitingText = document.querySelector('#voter-waiting-view h2');
        if (waitingText && remainingSeconds > 0) {
            const minutes = Math.floor(remainingSeconds / 60);
            const secs = remainingSeconds % 60;
            const creatorName = creatorNameDisplay ? creatorNameDisplay.textContent : 'De speler';
            waitingText.innerHTML = `<span>${creatorName}</span> maakt iets... <br><small style="color: var(--primary); font-size: 0.8em; margin-top: 10px; display: block;">${minutes}:${secs.toString().padStart(2, '0')}</small>`;
        }
    }
});

socket.on('create-timer-stopped', () => {
    const timerContainer = document.getElementById('timer-display-container');
    if (timerContainer) {
        timerContainer.style.display = 'none';
    }
});

socket.on('timer-expired', ({ message }) => {
    const creatorInputView = document.getElementById('creator-input-view');
    const isCreatorActive = creatorInputView && creatorInputView.classList.contains('active');
    
    if (isCreatorActive && turnId === myId) {
        attemptAutoSubmit();
    } else {
        const waitingView = document.querySelector('#voter-waiting-view h2');
        if (waitingView) {
            waitingView.textContent = message || 'Timer verlopen!';
        }
    }
});

socket.on('timer-expired-check', ({ message }) => {
    attemptAutoSubmit();
});

socket.on('round-skipped', ({ message }) => {
    showAlert('Ronde Overgeslagen', message);
});

function attemptAutoSubmit() {
    let canSubmit = false;
    let payload = {
        roomCode: currentRoom,
        type: currentMode
    };

    if (currentMode === 'photo') {
        const hasBoth = photoData[1] && photoData[2];
        if (hasBoth) {
            canSubmit = true;
            payload.option1 = photoData[1];
            payload.option2 = photoData[2];
            const photoQuestion = document.getElementById('photo-question-input')?.value.trim();
            if (photoQuestion) {
                payload.question = photoQuestion;
            }
        }
    } else if (currentMode === 'vote-person') {
        const question = document.getElementById('vote-person-question-input')?.value.trim();
        if (question) {
            canSubmit = true;
            payload.question = question;
            payload.option1 = 'vote-person';
            payload.option2 = 'vote-person';
        }
    } else {
        const opt1 = option1Input.value.trim();
        const opt2 = option2Input.value.trim();
        
        if (opt1 && opt2 && opt1.length > 0 && opt2.length > 0) {
            canSubmit = true;
            payload.option1 = opt1;
            payload.option2 = opt2;
        }
    }

    if (canSubmit) {
        payload.isAutoSubmit = true;
        socket.emit('submit-dilemma', payload);
    }
}

function setupCreatorView() {
    const allowed = currentSettings.allowedModes || ['dilemma', 'question'];
    
    choiceDilemmaBtn.style.display = allowed.includes('dilemma') ? 'flex' : 'none';
    choiceQuestionBtn.style.display = allowed.includes('question') ? 'flex' : 'none';
    choicePhotoBtn.style.display = allowed.includes('photo') ? 'flex' : 'none';
    if (choiceVotePersonBtn) {
        const canUseVotePerson = allowed.includes('vote-person') && players.length >= 3;
        choiceVotePersonBtn.style.display = canUseVotePerson ? 'flex' : 'none';
    }

    if (creatorTargetsDisplay) {
        const targets = players
            .filter(p => p.id !== myId)
            .map(p => `<span class="target-badge">${p.name}</span>`)
            .join('');
        creatorTargetsDisplay.innerHTML = targets ? `Voor: ${targets}` : `Wachten...`;
    }

    showView('creatorChoice');
    document.getElementById('back-choice-btn').style.display = 'none';
}

choiceDilemmaBtn.addEventListener('click', () => {
    setCreatorMode('dilemma');
    showView('creatorInput');
    document.getElementById('back-choice-btn').style.display = 'block';
});

choiceQuestionBtn.addEventListener('click', () => {
    setCreatorMode('question');
    showView('creatorInput');
    document.getElementById('back-choice-btn').style.display = 'block';
});

choicePhotoBtn.addEventListener('click', () => {
    setCreatorMode('photo');
    showView('creatorInput');
    document.getElementById('back-choice-btn').style.display = 'block';
});

choiceVotePersonBtn?.addEventListener('click', () => {
    setCreatorMode('vote-person');
    showView('creatorInput');
    document.getElementById('back-choice-btn').style.display = 'block';
});

backChoiceBtn.addEventListener('click', () => {
    showView('creatorChoice');
});

function setCreatorMode(mode) {
    currentMode = mode;
    const title = document.getElementById('input-title');
    const instruction = document.getElementById('instruction-text');
    const textInputs = document.getElementById('text-inputs');
    const photoInputs = document.getElementById('photo-inputs');
    const votePersonInputs = document.getElementById('vote-person-inputs');
    
    textInputs.style.display = 'block';
    photoInputs.style.display = 'none';
    if (votePersonInputs) votePersonInputs.style.display = 'none';

    if (mode === 'dilemma') {
        title.textContent = 'Nieuw Dilemma';
        instruction.textContent = 'Verzin een lastig dilemma.';
        option1Input.placeholder = 'Optie 1...';
        option2Input.placeholder = 'Optie 2...';
    } else if (mode === 'question') {
        title.textContent = 'Nieuwe Vragen';
        instruction.textContent = 'Stel twee vragen. De anderen kiezen er één.';
        option1Input.placeholder = 'Vraag 1...';
        option2Input.placeholder = 'Vraag 2...';
    } else if (mode === 'photo') {
        title.textContent = 'Foto Battle';
        instruction.textContent = 'Upload twee fotos voor de strijd.';
        textInputs.style.display = 'none';
        photoInputs.style.display = 'flex';
    } else if (mode === 'vote-person') {
        title.textContent = 'Vote de Persoon';
        instruction.textContent = 'Stel een vraag en laat anderen stemmen op wie er het beste bij past.';
        textInputs.style.display = 'none';
        photoInputs.style.display = 'none';
        if (votePersonInputs) votePersonInputs.style.display = 'block';
    }
}

function openCropModal(file) {
    try {
        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            showAlert('Fout', 'Foto is te groot! Maximaal 10MB.');
            return;
        }
        
        const reader = new FileReader();
        
        reader.onerror = () => {
            showAlert('Fout', 'Kon foto niet laden. Probeer een andere foto.');
            // Reset file input
            if (currentCropTarget) {
                const input = document.getElementById(`file-input-${currentCropTarget}`);
                if (input) input.value = '';
            }
        };
        
        reader.onload = (e) => {
            try {
                const img = new Image();
                
                img.onerror = () => {
                    showAlert('Fout', 'Foto is beschadigd of niet ondersteund.');
                    // Reset file input
                    if (currentCropTarget) {
                        const input = document.getElementById(`file-input-${currentCropTarget}`);
                        if (input) input.value = '';
                    }
                };
                
                img.onload = () => {
                    try {
                        currentCropImage = img;
                        const canvas = document.getElementById('crop-canvas');
                        if (!canvas) {
                            showAlert('Fout', 'Crop canvas niet gevonden.');
                            return;
                        }
                        
                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            showAlert('Fout', 'Kon canvas context niet laden.');
                            return;
                        }
                        
                        const maxSize = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.6, 500);
                        let canvasWidth = img.width;
                        let canvasHeight = img.height;
                        
                        if (canvasWidth > maxSize || canvasHeight > maxSize) {
                            const ratio = maxSize / Math.max(canvasWidth, canvasHeight);
                            canvasWidth = Math.floor(canvasWidth * ratio);
                            canvasHeight = Math.floor(canvasHeight * ratio);
                        }
                        
                        canvas.width = canvasWidth;
                        canvas.height = canvasHeight;
                        
                        ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
                        
                        cropBoxSize = Math.min(canvasWidth, canvasHeight) * 0.6;
                        cropBoxX = (canvasWidth - cropBoxSize) / 2;
                        cropBoxY = (canvasHeight - cropBoxSize) / 2;
                        
                        updateCropBox();
                        const cropModal = document.getElementById('crop-modal');
                        if (cropModal) {
                            cropModal.classList.add('active');
                        }
                    } catch (err) {
                        console.error('Error processing image:', err);
                        showAlert('Fout', 'Kon foto niet verwerken. Probeer een andere foto.');
                        // Reset file input
                        if (currentCropTarget) {
                            const input = document.getElementById(`file-input-${currentCropTarget}`);
                            if (input) input.value = '';
                        }
                    }
                };
                
                img.src = e.target.result;
            } catch (err) {
                console.error('Error creating image:', err);
                showAlert('Fout', 'Kon foto niet laden. Probeer een andere foto.');
                // Reset file input
                if (currentCropTarget) {
                    const input = document.getElementById(`file-input-${currentCropTarget}`);
                    if (input) input.value = '';
                }
            }
        };
        
        reader.readAsDataURL(file);
    } catch (err) {
        console.error('Error reading file:', err);
        showAlert('Fout', 'Kon foto niet lezen. Probeer een andere foto.');
        // Reset file input
        if (currentCropTarget) {
            const input = document.getElementById(`file-input-${currentCropTarget}`);
            if (input) input.value = '';
        }
    }
}

function updateCropBox() {
    if (!cropBox) {
        cropBox = document.getElementById('crop-box');
        if (!cropBox) return;
    }
    const canvas = document.getElementById('crop-canvas');
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;
    
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    
    cropBox.style.width = (cropBoxSize * scaleX) + 'px';
    cropBox.style.height = (cropBoxSize * scaleY) + 'px';
    cropBox.style.left = (canvasRect.left - containerRect.left + (cropBoxX * scaleX)) + 'px';
    cropBox.style.top = (canvasRect.top - containerRect.top + (cropBoxY * scaleY)) + 'px';
}

function cropImage() {
    if (!currentCropImage || !currentCropTarget) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const sourceCanvas = document.getElementById('crop-canvas');
    if (!sourceCanvas) return;
    
    const scaleX = currentCropImage.width / sourceCanvas.width;
    const scaleY = currentCropImage.height / sourceCanvas.height;
    
    const cropX = cropBoxX * scaleX;
    const cropY = cropBoxY * scaleY;
    const cropSize = cropBoxSize * Math.min(scaleX, scaleY);
    
    canvas.width = 800;
    canvas.height = 800;
    
    ctx.drawImage(
        currentCropImage,
        cropX, cropY, cropSize, cropSize,
        0, 0, 800, 800
    );
    
    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const num = currentCropTarget;
    photoData[num] = croppedDataUrl;
    
    const img = document.getElementById(`preview-${num}`);
    if (img) {
        img.src = croppedDataUrl;
        img.hidden = false;
    }
    const removeBtn = document.querySelector(`.remove-photo-btn[data-target="${num}"]`);
    if (removeBtn) {
        removeBtn.hidden = false;
    }
    
    // Add visual indicator that image is uploaded
    const uploadBox = document.getElementById(`photo-upload-${num}`);
    if (uploadBox) {
        uploadBox.classList.add('has-image');
    }
    
    closeCropModal();
}

function closeCropModal() {
    document.getElementById('crop-modal')?.classList.remove('active');
    currentCropImage = null;
    currentCropTarget = null;
}

if (document.getElementById('crop-confirm-btn')) {
    document.getElementById('crop-confirm-btn').addEventListener('click', cropImage);
}
if (document.getElementById('crop-cancel-btn')) {
    document.getElementById('crop-cancel-btn').addEventListener('click', closeCropModal);
}

let isDragging = false;
let dragHandle = null;

function setupCropDrag() {
    const cropBoxElement = document.getElementById('crop-box');
    if (!cropBoxElement) return;
    cropBoxElement.addEventListener('mousedown', handleCropMouseDown);
    cropBoxElement.addEventListener('touchstart', handleCropTouchStart, { passive: false });
}

function handleCropMouseDown(e) {
    if (e.target.classList.contains('crop-handle')) {
        isDragging = true;
        dragHandle = e.target.classList[1];
        const canvas = document.getElementById('crop-canvas');
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            cropStartX = (e.clientX - rect.left) * scaleX;
            cropStartY = (e.clientY - rect.top) * scaleY;
        } else {
            cropStartX = e.clientX;
            cropStartY = e.clientY;
        }
        initialCropBoxX = cropBoxX;
        initialCropBoxY = cropBoxY;
        initialCropBoxSize = cropBoxSize;
    } else {
        isDragging = true;
        dragHandle = 'move';
        const canvas = document.getElementById('crop-canvas');
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            cropStartX = (e.clientX - rect.left) * scaleX - cropBoxX;
            cropStartY = (e.clientY - rect.top) * scaleY - cropBoxY;
        } else {
            cropStartX = e.clientX - cropBoxX;
            cropStartY = e.clientY - cropBoxY;
        }
    }
    e.preventDefault();
    document.addEventListener('mousemove', handleCropMouseMove);
    document.addEventListener('mouseup', handleCropMouseUp);
}

function handleCropTouchStart(e) {
    if (e.target.classList.contains('crop-handle')) {
        isDragging = true;
        dragHandle = e.target.classList[1];
        const canvas = document.getElementById('crop-canvas');
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            cropStartX = (e.touches[0].clientX - rect.left) * scaleX;
            cropStartY = (e.touches[0].clientY - rect.top) * scaleY;
        } else {
            cropStartX = e.touches[0].clientX;
            cropStartY = e.touches[0].clientY;
        }
        initialCropBoxX = cropBoxX;
        initialCropBoxY = cropBoxY;
        initialCropBoxSize = cropBoxSize;
    } else {
        isDragging = true;
        dragHandle = 'move';
        const canvas = document.getElementById('crop-canvas');
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            cropStartX = (e.touches[0].clientX - rect.left) * scaleX - cropBoxX;
            cropStartY = (e.touches[0].clientY - rect.top) * scaleY - cropBoxY;
        } else {
            cropStartX = e.touches[0].clientX - cropBoxX;
            cropStartY = e.touches[0].clientY - cropBoxY;
        }
    }
    e.preventDefault();
    document.addEventListener('touchmove', handleCropTouchMove, { passive: false });
    document.addEventListener('touchend', handleCropTouchEnd);
}

function handleCropMouseMove(e) {
    if (!isDragging) return;
    updateCropPosition(e.clientX, e.clientY);
}

function handleCropTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    if (e.touches.length > 0) {
        updateCropPosition(e.touches[0].clientX, e.touches[0].clientY);
    }
}

function updateCropPosition(clientX, clientY) {
    const canvas = document.getElementById('crop-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    if (dragHandle === 'move') {
        cropBoxX = Math.max(0, Math.min(canvas.width - cropBoxSize, canvasX - cropStartX));
        cropBoxY = Math.max(0, Math.min(canvas.height - cropBoxSize, canvasY - cropStartY));
    } else if (dragHandle) {
        const centerX = initialCropBoxX + initialCropBoxSize / 2;
        const centerY = initialCropBoxY + initialCropBoxSize / 2;
        const deltaX = Math.abs(canvasX - centerX);
        const deltaY = Math.abs(canvasY - centerY);
        const newSize = Math.max(50, Math.min(Math.min(canvas.width, canvas.height), Math.max(deltaX, deltaY) * 2));
        cropBoxSize = newSize;
        cropBoxX = Math.max(0, Math.min(canvas.width - cropBoxSize, centerX - cropBoxSize / 2));
        cropBoxY = Math.max(0, Math.min(canvas.height - cropBoxSize, centerY - cropBoxSize / 2));
    }

    updateCropBox();
}

function handleCropMouseUp() {
    isDragging = false;
    dragHandle = null;
    document.removeEventListener('mousemove', handleCropMouseMove);
    document.removeEventListener('mouseup', handleCropMouseUp);
}

function handleCropTouchEnd() {
    isDragging = false;
    dragHandle = null;
    document.removeEventListener('touchmove', handleCropTouchMove);
    document.removeEventListener('touchend', handleCropTouchEnd);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupCropDrag);
} else {
    setupCropDrag();
}

function compressImage(file, maxWidth, quality, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', quality));
        };
    };
}

document.querySelectorAll('.photo-upload-box').forEach(box => {
    box.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') {
            const inputId = box.id.replace('photo-upload-', 'file-input-');
            document.getElementById(inputId).click();
        }
    });
});

['file-input-1', 'file-input-2'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
        input.addEventListener('change', (e) => {
            try {
                const file = e.target.files[0];
                if (file) {
                    // Check file type
                    if (!file.type.startsWith('image/')) {
                        showAlert('Fout', 'Alleen afbeeldingen zijn toegestaan.');
                        e.target.value = '';
                        return;
                    }
                    
                    const num = id.split('-')[2];
                    currentCropTarget = num;
                    openCropModal(file);
                    
                    // Update activity
                    if (currentRoom) {
                        socket.emit('player-activity', currentRoom);
                    }
                    lastInputTime = Date.now();
                }
            } catch (err) {
                console.error('Error handling file input:', err);
                showAlert('Fout', 'Kon foto niet verwerken. Probeer opnieuw.');
                e.target.value = '';
            }
        });
    }
});

document.querySelectorAll('.remove-photo-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const num = btn.dataset.target;
        photoData[num] = null;
        document.getElementById(`preview-${num}`).hidden = true;
        document.getElementById(`file-input-${num}`).value = '';
        btn.hidden = true;
        
        // Remove visual indicator
        const uploadBox = document.getElementById(`photo-upload-${num}`);
        if (uploadBox) {
            uploadBox.classList.remove('has-image');
        }
    });
});
submitDilemmaBtn.addEventListener('click', () => {
    let payload = {
        roomCode: currentRoom,
        type: currentMode,
        isAutoSubmit: false
    };

    if (currentMode === 'photo') {
        if (!photoData[1] || !photoData[2]) {
            showAlert('Let op', 'Upload beide fotos!');
            return;
        }
        payload.option1 = photoData[1];
        payload.option2 = photoData[2];
        
        const photoQuestion = document.getElementById('photo-question-input')?.value.trim();
        if (photoQuestion) {
            payload.question = photoQuestion;
        }
    } else if (currentMode === 'vote-person') {
        const question = document.getElementById('vote-person-question-input')?.value.trim();
        if (!question) {
            showAlert('Let op', 'Vul een vraag in!');
            return;
        }
        payload.question = question;
        payload.option1 = 'vote-person';
        payload.option2 = 'vote-person';
    } else {
        const opt1 = option1Input.value.trim();
        const opt2 = option2Input.value.trim();
        if (!opt1 || !opt2 || opt1.length === 0 || opt2.length === 0) {
            showAlert('Let op', 'Vul beide opties in!');
            return;
        }
        payload.option1 = opt1;
        payload.option2 = opt2;
    }

    payload.isAutoSubmit = false;
    socket.emit('submit-dilemma', payload);
});

socket.on('waiting-for-vote', () => {
    showView('voterWaiting');
    document.querySelector('#voter-waiting-view h2').innerHTML = 'Wachten op antwoorden...';
    votersProgressContainer.innerHTML = '';
});

socket.on('update-vote-status', (statusList) => {
    if (votersProgressContainer) {
        votersProgressContainer.innerHTML = '';
        statusList.forEach(s => {
            const chip = document.createElement('span');
            chip.className = 'voter-chip' + (s.voted ? ' voted' : '');
            chip.innerHTML = s.name + (s.voted ? ' <i class="fas fa-check"></i>' : '');
            votersProgressContainer.appendChild(chip);
        });
    }
});
socket.on('dilemma-received', ({ option1, option2, type, creatorName, question }) => {
    try {
        currentDilemma = { option1, option2, type, question };
        const textOptions = document.getElementById('text-vote-options');
        const photoOptions = document.getElementById('photo-vote-options');
        const votePersonView = document.getElementById('vote-person-view');
        const title = document.querySelector('#vote-view h2');
        
        if (!title) {
            console.error('Vote view title not found');
            return;
        }
        
        if (type === 'vote-person') {
            if (textOptions) textOptions.style.display = 'none';
            if (photoOptions) photoOptions.style.display = 'none';
            if (votePersonView) {
                showView('votePerson');
                setupVotePersonList(question || 'Kies een persoon', creatorName);
            }
            return;
        } else if (type === 'photo') {
            if (textOptions) textOptions.style.display = 'none';
            if (photoOptions) photoOptions.style.display = 'flex';
            if (votePersonView) votePersonView.style.display = 'none';
            
            const voteImg1 = document.getElementById('vote-img-1');
            const voteImg2 = document.getElementById('vote-img-2');
            if (voteImg1) voteImg1.src = option1;
            if (voteImg2) voteImg2.src = option2;
            
            const votePhoto1 = document.getElementById('vote-photo-1');
            const votePhoto2 = document.getElementById('vote-photo-2');
            if (votePhoto1) votePhoto1.onclick = () => handleVoteChoice(1);
            if (votePhoto2) votePhoto2.onclick = () => handleVoteChoice(2);
            
            if (question) {
                title.textContent = `${creatorName}: ${question}`;
            } else {
                title.textContent = `${creatorName}: Welke foto wint?`;
            }
        } else {
            if (textOptions) textOptions.style.display = 'flex';
            if (photoOptions) photoOptions.style.display = 'none';
            if (votePersonView) votePersonView.style.display = 'none';
            
            if (voteBtn1) voteBtn1.textContent = option1 || 'Optie 1';
            if (voteBtn2) voteBtn2.textContent = option2 || 'Optie 2';
            
            if (type === 'question') {
                title.textContent = `${creatorName} stelt vragen. Kies er één!`;
            } else {
                title.textContent = `${creatorName} stelt een dilemma!`;
            }
        }
        
        showView('vote');
    } catch (err) {
        console.error('Error handling dilemma-received:', err);
        showAlert('Fout', 'Kon dilemma niet laden. Probeer opnieuw.');
    }
});
function setupVotePersonList(question, creatorName) {
    const votePersonList = document.getElementById('vote-person-list');
    const votePersonQuestionTitle = document.getElementById('vote-person-question-title');
    if (!votePersonList) return;

    if (votePersonQuestionTitle) {
        votePersonQuestionTitle.textContent = question || 'Kies een persoon';
    }

    votePersonList.innerHTML = '';
    selectedVotePerson = null;

    const creator = players.find(p => p.name === creatorName);
    const creatorId = creator ? creator.id : null;

    // In vote-person mode, everyone can vote including creator, but creator cannot vote on themselves
    const playersToShow = players.filter(p => p.id !== myId); // Can't vote on yourself

    playersToShow.forEach(player => {
        const item = document.createElement('div');
        item.className = 'vote-person-item';
        item.textContent = player.name;
        item.dataset.playerId = player.id;
        
        // Show indicator if this is the creator
        if (player.id === creatorId) {
            const badge = document.createElement('span');
            badge.className = 'creator-badge';
            badge.textContent = ' (Vraagmaker)';
            badge.style.cssText = 'font-size: 0.8em; color: var(--accent); margin-left: 5px;';
            item.appendChild(badge);
        }
        
        item.addEventListener('click', () => {
            document.querySelectorAll('.vote-person-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedVotePerson = player.id;
            
            setTimeout(() => {
                submitVotePerson();
            }, 300);
        });
        
        votePersonList.appendChild(item);
    });
}

function submitVotePerson() {
    if (!selectedVotePerson) {
        showAlert('Let op', 'Kies eerst een persoon!');
        return;
    }
    socket.emit('vote', {
        roomCode: currentRoom,
        choice: 1,
        answer: null,
        selectedPersonId: selectedVotePerson
    });

    showView('voterWaiting');
    document.querySelector('#voter-waiting-view h2').textContent = 'Wachten op de rest...';
}
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
socket.on('vote-result', ({ winningChoice, votesByOption, dilemma, answers, votePersonResults, delay }) => {
    const r1 = document.getElementById('result-option1');
    const r2 = document.getElementById('result-option2');
    const textRes = document.getElementById('text-results');
    const photoRes = document.getElementById('photo-results');
    let isPhoto = (dilemma.type === 'photo');
    let isVotePerson = (dilemma.type === 'vote-person');
    
    // Calculate total votes for percentage
    const totalVotes = (votesByOption[1]?.length || 0) + (votesByOption[2]?.length || 0);
    const votes1 = votesByOption[1]?.length || 0;
    const votes2 = votesByOption[2]?.length || 0;
    const percentage1 = totalVotes > 0 ? Math.round((votes1 / totalVotes) * 100) : 0;
    const percentage2 = totalVotes > 0 ? Math.round((votes2 / totalVotes) * 100) : 0;

const votePersonResultsDiv = document.getElementById('vote-person-results');
if (votePersonResultsDiv) votePersonResultsDiv.style.display = 'none';

if (isVotePerson) {
    textRes.style.display = 'none';
    photoRes.style.display = 'none';
    const votePersonResultsList = document.getElementById('vote-person-results-list');
    const votePersonResultsQuestion = document.getElementById('vote-person-results-question');
    
    if (votePersonResultsDiv && votePersonResultsList && votePersonResultsQuestion) {
        votePersonResultsDiv.style.display = 'block';
        votePersonResultsQuestion.textContent = dilemma.question || 'Resultaten';
        
        votePersonResultsList.innerHTML = '';
        
        const resultsArray = [];
        players.forEach(player => {
            const voters = votePersonResults && votePersonResults[player.id] ? votePersonResults[player.id] : [];
            resultsArray.push({
                player: player,
                voters: voters,
                voteCount: voters.length
            });
        });
        
        resultsArray.sort((a, b) => b.voteCount - a.voteCount);
        
        resultsArray.forEach(result => {
            const item = document.createElement('div');
            item.className = 'vote-person-result-item';
            if (result.voteCount > 0) {
                item.style.borderLeft = '4px solid var(--success)';
            }
            
            const playerName = document.createElement('div');
            playerName.className = 'player-name';
            playerName.textContent = result.player.name;
            
            const votedBy = document.createElement('div');
            votedBy.className = 'voted-by';
            if (result.voters.length > 0) {
                votedBy.innerHTML = `<strong style="color: var(--primary);">${result.voteCount}</strong> stem${result.voteCount !== 1 ? 'men' : ''}<br><small style="color: #a4b0be;">${result.voters.join(', ')}</small>`;
            } else {
                votedBy.innerHTML = '<small style="color: #747d8c;">Geen stemmen</small>';
            }
            
            item.appendChild(playerName);
            item.appendChild(votedBy);
            votePersonResultsList.appendChild(item);
        });
        
        resultMessage.textContent = 'Stemmen geteld!';
        answerDisplay.style.display = 'none';
        
        // Use delay from server, or calculate if not provided
        const calculatedDelay = delay || (6000 + (players.length * 2000));
        startProgressBar(calculatedDelay);
    }
} else if (isPhoto) {
    textRes.style.display = 'none';
    photoRes.style.display = 'flex';
    
    document.getElementById('res-img-1').src = dilemma.option1;
    document.getElementById('res-img-2').src = dilemma.option2;
    
    const photoCard1 = document.getElementById('result-photo-1');
    const photoCard2 = document.getElementById('result-photo-2');
    photoCard1.className = 'result-card photo-card';
    photoCard2.className = 'result-card photo-card';
    
    if (winningChoice === 1) photoCard1.classList.add('selected');
    else photoCard1.classList.add('not-selected');
    
    if (winningChoice === 2) photoCard2.classList.add('selected');
    else photoCard2.classList.add('not-selected');

        const ol1 = document.querySelector('#result-photo-1 .overlay-stats');
        const ol2 = document.querySelector('#result-photo-2 .overlay-stats');
        
        if (ol1) {
            ol1.innerHTML = votesByOption[1] && votesByOption[1].length > 0 
                ? `<strong>${votesByOption[1].length} stem${votesByOption[1].length !== 1 ? 'men' : ''} (${percentage1}%)</strong><br><span style="font-size: 0.85em;">${votesByOption[1].join(', ')}</span>`
                : '<strong>0 stemmen (0%)</strong>';
        }
        if (ol2) {
            ol2.innerHTML = votesByOption[2] && votesByOption[2].length > 0
                ? `<strong>${votesByOption[2].length} stem${votesByOption[2].length !== 1 ? 'men' : ''} (${percentage2}%)</strong><br><span style="font-size: 0.85em;">${votesByOption[2].join(', ')}</span>`
                : '<strong>0 stemmen (0%)</strong>';
        }
    
    if (dilemma.question) {
        resultMessage.innerHTML = `<div class="photo-question-display" style="text-align: center; font-size: 1.1rem; font-weight: 600; margin-bottom: 15px; color: var(--accent);">${dilemma.question}</div>`;
    } else {
        resultMessage.textContent = winningChoice === 1 ? `De meerderheid koos: Foto 1` : `De meerderheid koos: Foto 2`;
    }
    
    answerDisplay.style.display = 'none';
    // Use delay from server, or calculate if not provided
    const calculatedDelay = delay || (6000 + (players.length * 2000));
    startProgressBar(calculatedDelay);

} else {
    textRes.style.display = 'flex';
    photoRes.style.display = 'none';
    
    r1.innerHTML = `<span>${dilemma.option1}</span>`;
    r2.innerHTML = `<span>${dilemma.option2}</span>`;
    
    // Add vote display with percentage for option 1
    if (votesByOption[1] && votesByOption[1].length > 0) {
        const list1 = document.createElement('div');
        list1.className = 'voter-names';
        list1.innerHTML = `<strong>${votesByOption[1].length} stem${votesByOption[1].length !== 1 ? 'men' : ''} (${percentage1}%)</strong><br><span style="font-size: 0.9em; opacity: 0.8;">${votesByOption[1].join(', ')}</span>`;
        r1.appendChild(list1);
    } else {
        const list1 = document.createElement('div');
        list1.className = 'voter-names';
        list1.style.color = '#747d8c';
        list1.style.borderColor = 'rgba(116, 125, 140, 0.3)';
        list1.style.background = 'rgba(0, 0, 0, 0.2)';
        list1.innerHTML = `<strong>0 stemmen (0%)</strong>`;
        r1.appendChild(list1);
    }
    
    // Add vote display with percentage for option 2
    if (votesByOption[2] && votesByOption[2].length > 0) {
        const list2 = document.createElement('div');
        list2.className = 'voter-names';
        list2.innerHTML = `<strong>${votesByOption[2].length} stem${votesByOption[2].length !== 1 ? 'men' : ''} (${percentage2}%)</strong><br><span style="font-size: 0.9em; opacity: 0.8;">${votesByOption[2].join(', ')}</span>`;
        r2.appendChild(list2);
    } else {
        const list2 = document.createElement('div');
        list2.className = 'voter-names';
        list2.style.color = '#747d8c';
        list2.style.borderColor = 'rgba(116, 125, 140, 0.3)';
        list2.style.background = 'rgba(0, 0, 0, 0.2)';
        list2.innerHTML = `<strong>0 stemmen (0%)</strong>`;
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
        playAnswerSlideshow(answers, dilemma, delay); // Pass delay to slideshow
    } else {
        answerDisplay.style.display = 'none';
        // Use delay from server, or calculate if not provided
        const calculatedDelay = delay || (dilemma.type === 'dilemma' ? (6000 + (players.length * 2000)) : (6000 + (players.length * 2000)));
        startProgressBar(calculatedDelay);
    }
    
    resultMessage.textContent = msg;
}

    showView('result');
});
function playAnswerSlideshow(answers, dilemma, totalDelay) {
    if (slideshowInterval) clearInterval(slideshowInterval);
    if (!answers || answers.length === 0) {
        return;
    }

    // Calculate time per slide (10 seconds per answer + 2 seconds buffer, divided by number of answers)
    const slideDuration = totalDelay ? Math.floor(totalDelay / answers.length) : 10000;
    
    let currentIndex = 0;

    const showAnswer = () => {
        if (currentIndex >= answers.length) {
            if (slideshowInterval) clearInterval(slideshowInterval);
            slideshowInterval = null;
            return;
        }
        
        const a = answers[currentIndex];
        const questionText = (a.choice === 2) ? dilemma.option2 : dilemma.option1;
        
        let html = `
            <div class="slide-item">
                <span class="slide-name">${a.name}</span>
                <div class="slide-context">${questionText || 'Gekozen Vraag'}</div>
                <div class="slide-answer">&ldquo;${a.text}&rdquo;</div>
            </div>
        `;
        
        answerDisplay.innerHTML = html;
        startProgressBar(slideDuration);
        currentIndex++;
    };

    showAnswer();
    slideshowInterval = setInterval(showAnswer, slideDuration);
}

let timerInterval = null;
let timerRemainingSeconds = 0;

function startProgressBar(duration) {
    // Clear any existing timer first
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // Show timer container
    if (resultTimerContainer) {
        resultTimerContainer.style.display = 'block';
    }
    
    // Calculate seconds
    timerRemainingSeconds = Math.ceil(duration / 1000);
    
    // Update display immediately
    if (timerSeconds) {
        timerSeconds.textContent = timerRemainingSeconds;
    }
    
    // Reset progress bar animation
    if (timerProgress) {
        // Remove any existing transition
        timerProgress.style.transition = 'none';
        timerProgress.style.width = '100%';
        
        // Use requestAnimationFrame to ensure the reset is rendered before starting animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (timerProgress) {
                    // Now set the transition and animate to 0%
                    timerProgress.style.transition = `width ${duration}ms linear`;
                    timerProgress.style.width = '0%';
                }
            });
        });
    }
    
    // Update countdown every second
    timerInterval = setInterval(() => {
        timerRemainingSeconds--;
        if (timerSeconds) {
            timerSeconds.textContent = Math.max(0, timerRemainingSeconds);
        }
        
        if (timerRemainingSeconds <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            if (timerSeconds) {
                timerSeconds.textContent = '0';
            }
            if (timerProgress) {
                timerProgress.style.width = '0%';
            }
            // Hide timer container after animation completes
            setTimeout(() => {
                if (resultTimerContainer) {
                    resultTimerContainer.style.display = 'none';
                }
            }, 500);
        }
    }, 1000);
}

function resetTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerRemainingSeconds = 0;
    if (timerProgress) {
        timerProgress.style.width = '0%';
        timerProgress.style.transition = 'none';
    }
    if (resultTimerContainer) {
        resultTimerContainer.style.display = 'none';
    }
}
socket.on('new-round', ({ turnId, round, settings, isRareRound, rareRoundQuestion }) => {
    updateRound(round);
    if (settings) {
        currentSettings = settings;
    }
    
    // Handle rare round
    if (isRareRound) {
        console.log('Rare round activated!');
        currentSettings.isRareRound = true;
        currentSettings.rareRoundQuestion = rareRoundQuestion;
    } else {
        currentSettings.isRareRound = false;
        currentSettings.rareRoundQuestion = null;
    }
    
    handleTurn(turnId);
});
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
if (slideshowInterval) {
clearInterval(slideshowInterval);
slideshowInterval = null;
}
if (createTimerInterval) {
clearInterval(createTimerInterval);
createTimerInterval = null;
}
if (pageVisibilityTimeout) {
clearTimeout(pageVisibilityTimeout);
pageVisibilityTimeout = null;
}
stopInputMonitoring();
currentRoom = null;
currentDilemma = null;
currentMode = 'dilemma';
players = [];
createTimerSeconds = null;
showScreen('landing');
roomCodeInput.value = '';
joinBtn.disabled = false;
joinBtn.textContent = 'Join';
createConfirmBtn.disabled = false;
createConfirmBtn.textContent = 'Start Lobby';
}