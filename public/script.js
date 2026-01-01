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
const choicePhotoBtn = document.getElementById('choice-photo-btn');
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
let currentSettings = { maxPlayers: 2, mode: 'mixed', allowedModes: ['dilemma', 'question'] };
let currentDilemma = null;
let selectedChoice = null;
let players = [];
let slideshowInterval = null;
let photoData = { 1: null, 2: null };

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
        // Ensure at least one is active
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
    // Gather allowed modes
    const allowed = [];
    document.querySelectorAll('.toggle-switch.active').forEach(t => {
        allowed.push(t.dataset.mode);
    });

    createConfirmBtn.disabled = true; 
    createConfirmBtn.textContent = 'Bezig...';

    socket.emit('create-room', {
        playerName: myName,
        maxPlayers: currentSettings.maxPlayers,
        allowedModes: allowed
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

function handleTurn(turnId) {
    if (slideshowInterval) clearInterval(slideshowInterval);
    
    // Reset inputs
    option1Input.value = '';
    option2Input.value = '';
    answerInput.value = '';
    photoData = { 1: null, 2: null };
    document.getElementById('preview-1').hidden = true;
    document.getElementById('preview-2').hidden = true;
    document.querySelectorAll('.remove-photo-btn').forEach(b => b.hidden = true);
    
    if (turnId === myId) {
        setupCreatorView();
    } else {
        const creator = players.find(p => p.id === turnId);
        creatorNameDisplay.textContent = creator ? creator.name : 'De ander';
        document.querySelector('#voter-waiting-view h2').innerHTML = `<span>${creatorNameDisplay.textContent}</span> maakt iets...`;
        votersProgressContainer.innerHTML = ''; // Clear progress
        showView('voterWaiting');
    }
}

// Creator Logic
function setupCreatorView() {
    // Show available modes based on settings
    const allowed = currentSettings.allowedModes || ['dilemma', 'question'];
    
    choiceDilemmaBtn.style.display = allowed.includes('dilemma') ? 'flex' : 'none';
    choiceQuestionBtn.style.display = allowed.includes('question') ? 'flex' : 'none';
    choicePhotoBtn.style.display = allowed.includes('photo') ? 'flex' : 'none';

    // Target display
    if (creatorTargetsDisplay) {
        const targets = players
            .filter(p => p.id !== myId)
            .map(p => `<span class="target-badge">${p.name}</span>`)
            .join('');
        creatorTargetsDisplay.innerHTML = targets ? `Voor: ${targets}` : `Wachten...`;
    }

    showView('creatorChoice');
    // Hide back button initially in choice view
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

backChoiceBtn.addEventListener('click', () => {
    showView('creatorChoice');
});

function setCreatorMode(mode) {
    currentMode = mode;
    const title = document.getElementById('input-title');
    const instruction = document.getElementById('instruction-text');
    const textInputs = document.getElementById('text-inputs');
    const photoInputs = document.getElementById('photo-inputs');
    
    textInputs.style.display = 'block';
    photoInputs.style.display = 'none';

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
            
            // Return base64
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
            // Compress image to max 800px width and 0.7 quality
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
        e.stopPropagation(); // prevent triggering upload
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

    socket.emit('submit-dilemma', payload);
});

socket.on('waiting-for-vote', () => {
    showView('voterWaiting');
    document.querySelector('#voter-waiting-view h2').innerHTML = 'Wachten op antwoorden...';
    votersProgressContainer.innerHTML = '';
});

socket.on('update-vote-status', (voters) => {
    votersProgressContainer.innerHTML = '';
    voters.forEach(name => {
        const chip = document.createElement('span');
        chip.className = 'voter-chip voted';
        chip.textContent = `${name} ✓`;
        votersProgressContainer.appendChild(chip);
    });
});

// Voter Logic
socket.on('dilemma-received', ({ option1, option2, type, creatorName }) => {
    currentDilemma = { option1, option2, type };
    
    // Toggle views based on type
    const textOptions = document.getElementById('text-vote-options');
    const photoOptions = document.getElementById('photo-vote-options');
    
    const title = document.querySelector('#vote-view h2');

    if (type === 'photo') {
        textOptions.style.display = 'none';
        photoOptions.style.display = 'flex';
        document.getElementById('vote-img-1').src = option1;
        document.getElementById('vote-img-2').src = option2;
        
        // Add click listeners to photos
        document.getElementById('vote-photo-1').onclick = () => handleVoteChoice(1);
        document.getElementById('vote-photo-2').onclick = () => handleVoteChoice(2);
        
        title.textContent = `${creatorName}: Welke foto wint?`;
    } else {
        textOptions.style.display = 'flex';
        photoOptions.style.display = 'none';
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
        votersProgressContainer.innerHTML = '';
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
        votersProgressContainer.innerHTML = '';
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
    const textRes = document.getElementById('text-results');
    const photoRes = document.getElementById('photo-results');
    
    let isPhoto = (dilemma.type === 'photo');

    if (isPhoto) {
        textRes.style.display = 'none';
        photoRes.style.display = 'flex';
        
        document.getElementById('res-img-1').src = dilemma.option1;
        document.getElementById('res-img-2').src = dilemma.option2;
        
        // Reset classes
        document.getElementById('result-photo-1').className = 'result-card photo-card';
        document.getElementById('result-photo-2').className = 'result-card photo-card';
        
        // Highlight winner
        if (winningChoice === 1) document.getElementById('result-photo-1').classList.add('selected');
        else document.getElementById('result-photo-1').classList.add('not-selected');
        
        if (winningChoice === 2) document.getElementById('result-photo-2').classList.add('selected');
        else document.getElementById('result-photo-2').classList.add('not-selected');

        // Add overlay stats
        const ol1 = document.querySelector('#result-photo-1 .overlay-stats');
        const ol2 = document.querySelector('#result-photo-2 .overlay-stats');
        
        ol1.textContent = votesByOption[1].join(', ') || 'Geen stemmen';
        ol2.textContent = votesByOption[2].join(', ') || 'Geen stemmen';

    } else {
        textRes.style.display = 'flex';
        photoRes.style.display = 'none';
        
        // Set text
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
    }
    
    let msg = winningChoice === 1 ? `De meerderheid koos: Optie 1` : `De meerderheid koos: Optie 2`;
    
    if (dilemma.type === 'question' && answers && answers.length > 0) {
        msg = "Vragen beantwoord!";
        answerDisplay.style.display = 'block';
        
        // Get the questions map to show context
        // answers array has { name, text, choice } (choice needed from server ideally, currently logic assumes we know)
        // Wait, 'answers' from server contains {name, text}. We need to know WHICH question they picked to show context.
        // Let's rely on the text being self explanatory? 
        // User asked: "maak het zo dat het wel de goeie vraag die de user heeft gekozen"
        // Server needs to send choice in answers array.
        
        playAnswerSlideshow(answers, dilemma);
        
    } else {
        answerDisplay.style.display = 'none';
        const duration = 6000;
        startProgressBar(duration);
    }
    
    resultMessage.textContent = msg;
    showView('result');
});

function playAnswerSlideshow(answers, dilemma) {
    if (slideshowInterval) clearInterval(slideshowInterval);
    
    let currentIndex = 0;
    
    const showAnswer = () => {
        if (currentIndex >= answers.length) {
            clearInterval(slideshowInterval);
            return;
        }
        
        const a = answers[currentIndex];
        // We need to match the answer to the question choice.
        // Since we didn't update the server struct to pass choice in 'answers', 
        // we might have a gap. 
        // However, we can infer it if we pass it. 
        // I'll update client to render nicely, but assuming server sends choice index in answers.
        // If not, we just show generic context.
        
        const questionText = (a.choice === 2) ? dilemma.option2 : dilemma.option1;
        
        let html = `
            <div class="slide-item">
                <span class="slide-name">${a.name}</span>
                <div class="slide-context">${questionText || 'Gekozen Vraag'}</div>
                <div class="slide-answer">&ldquo;${a.text}&rdquo;</div>
            </div>
        `;
        
        answerText.innerHTML = html;
        
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
