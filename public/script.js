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

// Socket Init
socket.on('connect', () => {
    myId = socket.id;
    console.log('Connected:', myId);
});

// Page Visibility API - Track activity
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentRoom) {
        // Page became visible, send activity update
        socket.emit('player-activity', currentRoom);
        // Clear any pending timeout
        if (pageVisibilityTimeout) {
            clearTimeout(pageVisibilityTimeout);
            pageVisibilityTimeout = null;
        }
    }
});

// Send activity updates periodically while in game
setInterval(() => {
    if (currentRoom && !document.hidden) {
        socket.emit('player-activity', currentRoom);
    }
}, 30000); // Every 30 seconds

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
createInitBtn.addEventListener('click', () => {
    if (validateName()) {
        showScreen('settings');
    }
});

backSettingsBtn.addEventListener('click', () => {
    showScreen('landing');
});

// Settings Toggles (Allowed Modes)
document.querySelectorAll('.toggle-switch').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
        e.target.classList.toggle('active');
        const active = document.querySelectorAll('.toggle-switch.active');
        if (active.length === 0) {
            e.target.classList.add('active');
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
        allowed.push(t.dataset.mode);
    });

    const timerValue = parseInt(document.getElementById('timer-select').value) || 0;
    const timerMinutes = timerValue === 0 ? null : timerValue;

    createConfirmBtn.disabled = true; 
    createConfirmBtn.textContent = 'Bezig...';

    socket.emit('create-room', {
        playerName: myName,
        maxPlayers: currentSettings.maxPlayers,
        allowedModes: allowed,
        createTimerMinutes: timerMinutes
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

// Copy room code functionality
document.getElementById('copy-code-btn')?.addEventListener('click', () => {
    const code = roomCodeDisplay.textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('copy-code-btn');
        const originalText = btn.textContent;
        btn.textContent = '✓ Gekopieerd!';
        btn.style.background = 'var(--success)';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    });
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
    if (slideshowInterval) {
        clearInterval(slideshowInterval);
        slideshowInterval = null;
    }
    
    // Stop create timer if running
    if (createTimerInterval) {
        clearInterval(createTimerInterval);
        createTimerInterval = null;
    }
    createTimerSeconds = null;
    
    // Reset inputs
    option1Input.value = '';
    option2Input.value = '';
    answerInput.value = '';
    selectedChoice = null;
    currentDilemma = null;
    photoData = { 1: null, 2: null };
    document.getElementById('preview-1').hidden = true;
    document.getElementById('preview-2').hidden = true;
    document.querySelectorAll('.remove-photo-btn').forEach(b => b.hidden = true);
    const photoQuestionInput = document.getElementById('photo-question-input');
    if (photoQuestionInput) photoQuestionInput.value = '';
    const votePersonQuestionInput = document.getElementById('vote-person-question-input');
    if (votePersonQuestionInput) votePersonQuestionInput.value = '';
    
    // Reset answer display
    if (answerDisplay) {
        answerDisplay.style.display = 'none';
        answerDisplay.innerHTML = '';
    }
    
    // Hide timer display
    const timerContainer = document.getElementById('timer-display-container');
    if (timerContainer) timerContainer.style.display = 'none';
    
    // Reset vote person selection
    selectedVotePerson = null;
    
    if (turnId === myId) {
        setupCreatorView();
        startCreateTimer();
    } else {
        const creator = players.find(p => p.id === turnId);
        creatorNameDisplay.textContent = creator ? creator.name : 'De ander';
        document.querySelector('#voter-waiting-view h2').innerHTML = `<span>${creatorNameDisplay.textContent}</span> maakt iets...`;
        votersProgressContainer.innerHTML = ''; 
        showView('voterWaiting');
    }
}

function startCreateTimer() {
    const timerMinutes = currentSettings.createTimerMinutes;
    if (!timerMinutes || timerMinutes === 0) {
        // Infinite timer
        return;
    }
    
    createTimerSeconds = timerMinutes * 60;
    const timerContainer = document.getElementById('timer-display-container');
    const timerValue = document.getElementById('timer-value');
    
    if (timerContainer && timerValue) {
        timerContainer.style.display = 'block';
        updateTimerDisplay();
        
        createTimerInterval = setInterval(() => {
            createTimerSeconds--;
            updateTimerDisplay();
            
            if (createTimerSeconds <= 0) {
                clearInterval(createTimerInterval);
                createTimerInterval = null;
                // Auto-submit if user has entered something
                autoSubmitIfReady();
            }
        }, 1000);
    }
}

function updateTimerDisplay() {
    const timerValue = document.getElementById('timer-value');
    if (!timerValue) return;
    
    if (createTimerSeconds === null || createTimerSeconds <= 0) {
        timerValue.textContent = '∞';
        return;
    }
    
    const minutes = Math.floor(createTimerSeconds / 60);
    const seconds = createTimerSeconds % 60;
    timerValue.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Change color when time is running out
    if (createTimerSeconds <= 30) {
        timerValue.style.color = 'var(--danger)';
    } else if (createTimerSeconds <= 60) {
        timerValue.style.color = '#ffa502';
    } else {
        timerValue.style.color = 'var(--primary)';
    }
}

function autoSubmitIfReady() {
    // Check if user has entered something
    const hasTextContent = (currentMode !== 'photo') && 
        (option1Input.value.trim() || option2Input.value.trim());
    const hasPhotoContent = (currentMode === 'photo') && 
        (photoData[1] || photoData[2]);
    
    if (hasTextContent || hasPhotoContent) {
        // Auto submit
        submitDilemmaBtn.click();
    } else {
        // Show warning
        showAlert('Tijd Verlopen', 'De tijd is op! Vul iets in om automatisch te versturen.');
    }
}

// Creator Logic
function setupCreatorView() {
    const allowed = currentSettings.allowedModes || ['dilemma', 'question'];
    
    choiceDilemmaBtn.style.display = allowed.includes('dilemma') ? 'flex' : 'none';
    choiceQuestionBtn.style.display = allowed.includes('question') ? 'flex' : 'none';
    choicePhotoBtn.style.display = allowed.includes('photo') ? 'flex' : 'none';
    if (choiceVotePersonBtn) {
        choiceVotePersonBtn.style.display = allowed.includes('vote-person') ? 'flex' : 'none';
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

// Compress Image Logic
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

// Photo Handling
document.querySelectorAll('.photo-upload-box').forEach(box => {
    box.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') {
            const inputId = box.id.replace('photo-upload-', 'file-input-');
            document.getElementById(inputId).click();
        }
    });
});

['file-input-1', 'file-input-2'].forEach(id => {
    document.getElementById(id).addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            compressImage(file, 800, 0.7, (compressedDataUrl) => {
                const num = id.split('-')[2];
                photoData[num] = compressedDataUrl;
                const img = document.getElementById(`preview-${num}`);
                img.src = compressedDataUrl;
                img.hidden = false;
                document.querySelector(`.remove-photo-btn[data-target="${num}"]`).hidden = false;
            });
        }
    });
});

document.querySelectorAll('.remove-photo-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        const num = btn.dataset.target;
        photoData[num] = null;
        document.getElementById(`preview-${num}`).hidden = true;
        document.getElementById(`file-input-${num}`).value = '';
        btn.hidden = true;
    });
});

submitDilemmaBtn.addEventListener('click', () => {
    let payload = {
        roomCode: currentRoom,
        type: currentMode
    };

    if (currentMode === 'photo') {
        if (!photoData[1] || !photoData[2]) {
            showAlert('Let op', 'Upload beide fotos!');
            return;
        }
        payload.option1 = photoData[1];
        payload.option2 = photoData[2];
        
        // Add question if provided
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
        payload.option1 = 'vote-person'; // Placeholder
        payload.option2 = 'vote-person'; // Placeholder
    } else {
        const opt1 = option1Input.value.trim();
        const opt2 = option2Input.value.trim();
        if (!opt1 || !opt2) {
            showAlert('Let op', 'Vul beide opties in!');
            return;
        }
        payload.option1 = opt1;
        payload.option2 = opt2;
    }

    // Stop timer
    if (createTimerInterval) {
        clearInterval(createTimerInterval);
        createTimerInterval = null;
    }
    
    socket.emit('submit-dilemma', payload);
});

socket.on('waiting-for-vote', () => {
    showView('voterWaiting');
    document.querySelector('#voter-waiting-view h2').innerHTML = 'Wachten op antwoorden...';
    votersProgressContainer.innerHTML = '';
});

// Broadcast status update
socket.on('update-vote-status', (statusList) => {
    if (votersProgressContainer) {
        votersProgressContainer.innerHTML = '';
        statusList.forEach(s => {
            const chip = document.createElement('span');
            chip.className = 'voter-chip' + (s.voted ? ' voted' : '');
            chip.textContent = s.name + (s.voted ? ' ✓' : '');
            votersProgressContainer.appendChild(chip);
        });
    }
});

// Voter Logic
socket.on('dilemma-received', ({ option1, option2, type, creatorName, question }) => {
    currentDilemma = { option1, option2, type, question };
    
    const textOptions = document.getElementById('text-vote-options');
    const photoOptions = document.getElementById('photo-vote-options');
    const votePersonView = document.getElementById('vote-person-view');
    const title = document.querySelector('#vote-view h2');

    if (type === 'vote-person') {
        // Show vote person view
        textOptions.style.display = 'none';
        photoOptions.style.display = 'none';
        if (votePersonView) {
            showView('votePerson');
            setupVotePersonList(question, creatorName);
        }
        return;
    } else if (type === 'photo') {
        textOptions.style.display = 'none';
        photoOptions.style.display = 'flex';
        if (votePersonView) votePersonView.style.display = 'none';
        document.getElementById('vote-img-1').src = option1;
        document.getElementById('vote-img-2').src = option2;
        
        document.getElementById('vote-photo-1').onclick = () => handleVoteChoice(1);
        document.getElementById('vote-photo-2').onclick = () => handleVoteChoice(2);
        
        // Show question if provided
        if (question) {
            title.textContent = `${creatorName}: ${question}`;
        } else {
            title.textContent = `${creatorName}: Welke foto wint?`;
        }
    } else {
        textOptions.style.display = 'flex';
        photoOptions.style.display = 'none';
        if (votePersonView) votePersonView.style.display = 'none';
        voteBtn1.textContent = option1;
        voteBtn2.textContent = option2;
        
        if (type === 'question') {
            title.textContent = `${creatorName} stelt vragen. Kies er één!`;
        } else {
            title.textContent = `${creatorName} stelt een dilemma!`;
        }
    }
    
    showView('vote');
});

function setupVotePersonList(question, creatorName) {
    const votePersonList = document.getElementById('vote-person-list');
    const votePersonQuestionTitle = document.getElementById('vote-person-question-title');
    
    if (!votePersonList) return;
    
    // Set question
    if (votePersonQuestionTitle) {
        votePersonQuestionTitle.textContent = question || 'Kies een persoon';
    }
    
    // Clear previous list
    votePersonList.innerHTML = '';
    selectedVotePerson = null;
    
    // Get creator ID
    const creator = players.find(p => p.name === creatorName);
    const creatorId = creator ? creator.id : null;
    
    // Get all players except the creator (creator can't vote on themselves)
    const playersToShow = players.filter(p => p.id !== creatorId);
    
    playersToShow.forEach(player => {
        const item = document.createElement('div');
        item.className = 'vote-person-item';
        item.textContent = player.name;
        item.dataset.playerId = player.id;
        
        item.addEventListener('click', () => {
            // Deselect previous
            document.querySelectorAll('.vote-person-item').forEach(i => i.classList.remove('selected'));
            // Select this one
            item.classList.add('selected');
            selectedVotePerson = player.id;
            
            // Auto submit after selection
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
        choice: 1, // Not used for vote-person
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

// Results
socket.on('vote-result', ({ winningChoice, votesByOption, dilemma, answers, votePersonResults }) => {
    const r1 = document.getElementById('result-option1');
    const r2 = document.getElementById('result-option2');
    const textRes = document.getElementById('text-results');
    const photoRes = document.getElementById('photo-results');
    
    let isPhoto = (dilemma.type === 'photo');
    let isVotePerson = (dilemma.type === 'vote-person');

    // Hide vote person results initially
    const votePersonResultsDiv = document.getElementById('vote-person-results');
    if (votePersonResultsDiv) votePersonResultsDiv.style.display = 'none';

    if (isVotePerson) {
        // Show vote person results
        textRes.style.display = 'none';
        photoRes.style.display = 'none';
        const votePersonResultsList = document.getElementById('vote-person-results-list');
        const votePersonResultsQuestion = document.getElementById('vote-person-results-question');
        
        if (votePersonResultsDiv && votePersonResultsList && votePersonResultsQuestion) {
            votePersonResultsDiv.style.display = 'block';
            votePersonResultsQuestion.textContent = dilemma.question || 'Resultaten';
            
            votePersonResultsList.innerHTML = '';
            
            // Create results for each player
            const resultsArray = [];
            players.forEach(player => {
                const voters = votePersonResults && votePersonResults[player.id] ? votePersonResults[player.id] : [];
                resultsArray.push({
                    player: player,
                    voters: voters,
                    voteCount: voters.length
                });
            });
            
            // Sort by vote count (descending)
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
            
            // Calculate delay based on number of players
            const delay = 6000 + (players.length * 2000);
            startProgressBar(delay);
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
        
        ol1.textContent = votesByOption[1].join(', ') || 'Geen stemmen';
        ol2.textContent = votesByOption[2].join(', ') || 'Geen stemmen';
        
        // Show question if it exists
        if (dilemma.question) {
            resultMessage.innerHTML = `<div class="photo-question-display" style="text-align: center; font-size: 1.1rem; font-weight: 600; margin-bottom: 15px; color: var(--accent);">${dilemma.question}</div>`;
        } else {
            resultMessage.textContent = winningChoice === 1 ? `De meerderheid koos: Foto 1` : `De meerderheid koos: Foto 2`;
        }
        
        answerDisplay.style.display = 'none';
        const duration = 6000 + (players.length * 2000);
        startProgressBar(duration);

    } else {
        textRes.style.display = 'flex';
        photoRes.style.display = 'none';
        
        r1.innerHTML = `<span>${dilemma.option1}</span>`;
        r2.innerHTML = `<span>${dilemma.option2}</span>`;
        
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
            playAnswerSlideshow(answers, dilemma);
        } else {
            answerDisplay.style.display = 'none';
            // For dilemma mode, longer delay with more players
            const duration = dilemma.type === 'dilemma' ? (6000 + (players.length * 2000)) : 6000;
            startProgressBar(duration);
        }
        
        resultMessage.textContent = msg;
    }
    
    showView('result');
});

function playAnswerSlideshow(answers, dilemma) {
    if (slideshowInterval) clearInterval(slideshowInterval);
    
    if (!answers || answers.length === 0) {
        return;
    }
    
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
        startProgressBar(10000);
        currentIndex++;
    };
    
    showAnswer();
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
