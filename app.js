// ==========================================
// HỆ THỐNG ÂM THANH & RUNG PHẢN HỒI (SOUND & HAPTIC)
// ==========================================
class FeedbackEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) this.ctx = new AudioContextClass();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  vibrate(pattern) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }
  }

  playTone(freq, type, duration, gainVal = 0.1) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play error', e);
    }
  }

  tick() {
    this.playTone(800, 'sine', 0.08, 0.05);
    this.vibrate(40);
  }

  yourTurn() {
    this.init();
    if (!this.muted && this.ctx) {
      this.playTone(523.25, 'triangle', 0.1, 0.15);
      setTimeout(() => this.playTone(659.25, 'triangle', 0.15, 0.15), 100);
    }
    this.vibrate([120, 80, 120]);
  }

  success() {
    this.init();
    if (!this.muted && this.ctx) {
      this.playTone(587.33, 'triangle', 0.12, 0.15);
      setTimeout(() => this.playTone(880, 'triangle', 0.25, 0.2), 100);
    }
    this.vibrate([80, 60, 160]);
  }

  fail() {
    this.init();
    if (!this.muted && this.ctx) {
      this.playTone(220, 'sawtooth', 0.2, 0.15);
      setTimeout(() => this.playTone(174.61, 'sawtooth', 0.35, 0.15), 150);
    }
    this.vibrate(250);
  }

  pop() {
    this.playTone(400, 'sine', 0.05, 0.08);
  }

  victory() {
    this.init();
    if (!this.muted && this.ctx) {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        setTimeout(() => this.playTone(freq, 'triangle', 0.3, 0.15), idx * 120);
      });
    }
    this.vibrate([100, 50, 100, 50, 200]);
  }
}

const sound = new FeedbackEngine();

// ==========================================
// KHỞI TẠO BIẾN TRẠNG THÁI & LOCAL/SESSION STORAGE
// ==========================================
const STORAGE_KEY_PRESETS = 'whoami_selected_preset_keys_v4';
const STORAGE_KEY_CUSTOM = 'whoami_custom_character_list_v4';
const STORAGE_KEY_NOTEPAD = 'whoami_private_notepad_content';
const SESSION_STORAGE_KEY = 'whoami_active_p2p_session';

let selectedPresetKeys = ['SHOWBIZ'];
let customCharacters = [];
let currentCharacterPool = [];
let currentThemeName = 'Showbiz';
let searchQuery = '';

let hostTimerEnabled = true;
let hostTimerDuration = 45;

let myPeer = null;
let myId = null;
let myName = '';
let isHost = false;
let currentRoomCode = '';
let hasVotedCurrentQuestion = false;
let selectedVoteOption = null;

const connectionsMap = new Map();
let serverState = null;
let hostConnection = null;

let localTimerInterval = null;
let hostAuthoritativeTimer = null;
let lastTickedSecond = null;
let lastRenderedQuestionKey = '';
let previousActivePlayerId = null;
let lastReactionTimestamp = 0;

// ==========================================
// QUẢN LÝ PHIÊN (SESSION PERSISTENCE)
// ==========================================
function saveSession(data) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
}

function getSession() {
  const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch (e) {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

// ==========================================
// QUẢN LÝ KHO NHÂN VẬT & PRESET
// ==========================================
function loadCharacterPool() {
  const savedPresets = localStorage.getItem(STORAGE_KEY_PRESETS);
  const savedCustom = localStorage.getItem(STORAGE_KEY_CUSTOM);

  if (savedPresets) {
    try {
      const parsed = JSON.parse(savedPresets);
      if (Array.isArray(parsed) && parsed.length > 0) selectedPresetKeys = parsed;
    } catch (e) {
      selectedPresetKeys = ['SHOWBIZ'];
    }
  }

  if (savedCustom) {
    try {
      const parsed = JSON.parse(savedCustom);
      if (Array.isArray(parsed)) customCharacters = parsed;
    } catch (e) {
      customCharacters = [];
    }
  }

  rebuildCharacterPool();
}

function rebuildCharacterPool() {
  const combined = [];

  selectedPresetKeys.forEach(key => {
    if (window.PRESET_THEMES && window.PRESET_THEMES[key]) {
      combined.push(...window.PRESET_THEMES[key].list);
    }
  });

  combined.push(...customCharacters);

  const seen = new Set();
  currentCharacterPool = combined.filter(name => {
    const lower = name.trim().toLowerCase();
    if (!lower || seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });

  const names = selectedPresetKeys.map(k => window.PRESET_THEMES[k]?.shortName).filter(Boolean);
  if (customCharacters.length > 0) names.push('Tự chọn');

  if (names.length === 0) {
    currentThemeName = 'Trống (Hãy chọn chủ đề)';
  } else if (names.length <= 2) {
    currentThemeName = names.join(' + ');
  } else {
    currentThemeName = `${names.slice(0, 2).join(' + ')} (+${names.length - 2})`;
  }

  saveCharacterPool();
}

function saveCharacterPool() {
  localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(selectedPresetKeys));
  localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(customCharacters));
  updateCharacterVaultUI();
}

window.togglePresetTheme = function(presetKey) {
  if (!window.PRESET_THEMES[presetKey]) return;

  const idx = selectedPresetKeys.indexOf(presetKey);
  if (idx > -1) {
    if (selectedPresetKeys.length === 1 && customCharacters.length === 0) {
      return showToast('Cần giữ ít nhất 1 chủ đề hoặc nạp nhân vật tùy chọn!');
    }
    selectedPresetKeys.splice(idx, 1);
    showToast(`Đã bỏ chọn gói [${window.PRESET_THEMES[presetKey].shortName}]`);
  } else {
    selectedPresetKeys.push(presetKey);
    showToast(`Đã thêm gói [${window.PRESET_THEMES[presetKey].shortName}]!`);
  }

  sound.pop();
  rebuildCharacterPool();
  renderModalPresetButtons();

  if (isHost && serverState) {
    serverState.currentThemeName = currentThemeName;
    broadcastHostState();
  }
};

window.removeCharacter = function(index) {
  if (currentCharacterPool.length <= 2) {
    return showToast('Cần giữ lại ít nhất 2 nhân vật trong kho!');
  }
  sound.pop();
  const charToRemove = currentCharacterPool[index];
  customCharacters = customCharacters.filter(c => c.toLowerCase() !== charToRemove.toLowerCase());
  currentCharacterPool.splice(index, 1);
  saveCharacterPool();
};

// ==========================================
// TIỆN ÍCH CHUNG, MÃ QR & THOÁT PHÒNG
// ==========================================
function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  if (!toast || !toastMessage) return;

  toastMessage.textContent = msg;
  toast.classList.remove('opacity-0', 'translate-y-[-20px]', 'pointer-events-none');
  toast.classList.add('opacity-100', 'translate-y-0');

  setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-[-20px]', 'pointer-events-none');
  }, 3000);
}

function copyRoomCode() {
  if (!currentRoomCode) return;
  sound.pop();
  navigator.clipboard.writeText(currentRoomCode).then(() => {
    showToast(`Đã sao chép mã phòng: ${currentRoomCode}`);
  }).catch(() => {
    showToast(`Mã phòng: ${currentRoomCode}`);
  });
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

window.leaveRoom = function() {
  if (confirm('Bạn có chắc chắn muốn rời khỏi phòng chơi này?')) {
    clearSession();
    location.reload();
  }
};

// Hiển thị Popup QR Code
function showRoomQRCode() {
  if (!currentRoomCode) return;
  sound.pop();

  const qrImage = document.getElementById('qr-image');
  const qrRoomText = document.getElementById('qr-room-text');
  const modalQrCode = document.getElementById('modal-qr-code');

  const joinUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomCode}`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}&bgcolor=0f172a&color=f59e0b&margin=6`;

  if (qrImage) qrImage.src = qrApiUrl;
  if (qrRoomText) qrRoomText.textContent = currentRoomCode;
  if (modalQrCode) modalQrCode.classList.remove('hidden');
}

// ==========================================
// HỆ THỐNG BIỂU CẢM ĐỘNG (IN-GAME LIVE REACTIONS)
// ==========================================
window.triggerReaction = function(emoji) {
  const now = Date.now();
  if (now - lastReactionTimestamp < 300) return; // Chống spam lag
  lastReactionTimestamp = now;

  sound.pop();
  spawnFloatingEmoji(emoji, 'Bạn');
  sendAction('SEND_REACTION', { emoji, senderName: myName });
};

function spawnFloatingEmoji(emoji, senderName = '') {
  const canvas = document.getElementById('reaction-canvas');
  if (!canvas) return;

  const el = document.createElement('div');
  el.className = 'floating-emoji absolute flex flex-col items-center pointer-events-none select-none z-50';

  // Random tọa độ xuất phát ở đáy màn hình
  const randomLeft = 15 + Math.random() * 70; // 15% - 85%
  el.style.left = `${randomLeft}vw`;
  el.style.bottom = '80px';

  el.innerHTML = `
    <span class="text-3xl sm:text-4xl filter drop-shadow-lg">${emoji}</span>
    ${senderName && senderName !== 'Bạn' ? `<span class="text-[9px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.2 rounded-full border border-slate-700/60 mt-0.5">${senderName}</span>` : ''}
  `;

  canvas.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 1700);
}

// ==========================================
// SỔ GHI CHÚ RIÊNG TƯ & GỢI Ý CÂU HỎI
// ==========================================
function initNotepad() {
  const textareaNotepad = document.getElementById('textarea-notepad');
  if (!textareaNotepad) return;
  const saved = localStorage.getItem(STORAGE_KEY_NOTEPAD) || '';
  textareaNotepad.value = saved;
  updateNotepadUI(saved);
}

function updateNotepadUI(text) {
  const notepadCharCount = document.getElementById('notepad-char-count');
  const notepadStatusDot = document.getElementById('notepad-status-dot');
  if (notepadCharCount) notepadCharCount.textContent = `${text.length} ký tự`;
  if (notepadStatusDot) {
    if (text.trim().length > 0) {
      notepadStatusDot.classList.remove('hidden');
    } else {
      notepadStatusDot.classList.add('hidden');
    }
  }
}

window.insertQuickNote = function(tag) {
  const textareaNotepad = document.getElementById('textarea-notepad');
  if (!textareaNotepad) return;
  sound.pop();
  const current = textareaNotepad.value;
  const separator = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  const updated = current + separator + tag;
  textareaNotepad.value = updated;
  localStorage.setItem(STORAGE_KEY_NOTEPAD, updated);
  updateNotepadUI(updated);
  textareaNotepad.scrollTop = textareaNotepad.scrollHeight;
};

function renderQuestionAssistant() {
  const container = document.getElementById('assistant-categories');
  if (!container || !window.QUESTION_SUGGESTIONS) return;

  container.innerHTML = Object.keys(window.QUESTION_SUGGESTIONS).map(catKey => {
    const cat = window.QUESTION_SUGGESTIONS[catKey];
    return `
      <div class="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5">
        <span class="text-xs font-black uppercase tracking-wider text-indigo-300 block mb-2.5">${cat.name}</span>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${cat.list.map(q => `
            <button onclick="pickSuggestedQuestion('${q.replace(/'/g, "\\'")}')" class="text-left p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500 hover:bg-slate-850 text-xs font-semibold text-slate-200 transition active:scale-98 flex items-start justify-between gap-2 group">
              <span class="leading-relaxed break-words flex-grow">${q}</span>
              <span class="text-indigo-400 opacity-0 group-hover:opacity-100 transition text-sm flex-shrink-0 mt-0.5">➔</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

window.pickSuggestedQuestion = function(questionText) {
  sound.pop();
  const inputQuestion = document.getElementById('input-question');
  const modalQuestionAssistant = document.getElementById('modal-question-assistant');
  if (inputQuestion) {
    inputQuestion.value = questionText;
    inputQuestion.focus();
  }
  if (modalQuestionAssistant) {
    modalQuestionAssistant.classList.add('hidden');
  }
};

// ==========================================
// LOGIC TIMER & HOST CONTROLS
// ==========================================
window.setTimerSeconds = function(seconds) {
  if (!isHost) return;
  sound.pop();
  hostTimerDuration = seconds;
  updateTimerPillsUI();

  if (serverState) {
    serverState.timerDuration = hostTimerDuration;
    broadcastHostState();
  }
};

function updateTimerPillsUI() {
  document.querySelectorAll('.timer-btn').forEach(btn => {
    const sec = parseInt(btn.dataset.sec, 10);
    if (sec === hostTimerDuration) {
      btn.className = 'timer-btn py-2 rounded-xl border text-xs font-extrabold transition bg-amber-500/20 border-amber-400 text-amber-300 ring-1 ring-amber-400/40';
    } else {
      btn.className = 'timer-btn py-2 rounded-xl border text-xs font-extrabold transition bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600';
    }
  });
}

function resetTurnTimerDeadline() {
  if (!serverState) return;
  if (serverState.timerEnabled && serverState.state === 'PLAYING') {
    serverState.turnDeadline = Date.now() + (serverState.timerDuration * 1000);
  } else {
    serverState.turnDeadline = null;
  }
}

function startHostAuthoritativeTimer() {
  if (hostAuthoritativeTimer) clearInterval(hostAuthoritativeTimer);

  hostAuthoritativeTimer = setInterval(() => {
    if (!isHost || !serverState || serverState.state !== 'PLAYING' || !serverState.timerEnabled) return;
    if (!serverState.turnDeadline) return;

    const remainingMs = serverState.turnDeadline - Date.now();
    if (remainingMs <= 0) {
      const activePlayer = serverState.players[serverState.turnIndex];
      sound.fail();

      if (serverState.currentQuestion) {
        serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 text-[10px] font-extrabold mr-1">HẾT GIỜ</span> Biểu quyết kết thúc do hết thời gian.`);
        serverState.currentQuestion = null;
      } else {
        serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 text-[10px] font-extrabold mr-1">HẾT GIỜ</span> <b class="text-amber-400">${activePlayer.name}</b> đã bị tự động bỏ lượt do quá thời gian.`);
      }

      advanceHostTurn();
      broadcastHostState();
    }
  }, 500);
}

// ==========================================
// LOGIC CHỦ PHÒNG (HOST ENGINE)
// ==========================================
function initHost(roomCode, playerName) {
  const peerId = `whoami-${roomCode.toLowerCase()}`;
  myPeer = new Peer(peerId);

  myPeer.on('open', (id) => {
    myId = id;
    isHost = true;
    currentRoomCode = roomCode;

    saveSession({ roomCode, playerName, isHost: true });

    serverState = {
      code: roomCode,
      hostId: id,
      state: 'LOBBY',
      turnIndex: 0,
      currentThemeName: currentThemeName,
      timerEnabled: hostTimerEnabled,
      timerDuration: hostTimerDuration,
      turnDeadline: null,
      currentQuestion: null,
      lastTurnResult: null,
      finishCounter: 0,
      players: [
        {
          id: id,
          name: playerName,
          character: null,
          hasGuessedCorrectly: false,
          questionsAskedCount: 0,
          finishRank: null,
          isSpectator: false
        }
      ],
      logs: [
        `<span class="text-slate-400">Phòng <b class="text-amber-400 font-mono">[${roomCode}]</b> đã tạo bởi <b class="text-slate-200">${playerName}</b>.</span>`
      ]
    };

    enterLobbyUI(roomCode, true);
    broadcastHostState();
  });

  myPeer.on('connection', (conn) => {
    conn.on('open', () => {
      connectionsMap.set(conn.peer, conn);
    });

    conn.on('data', (data) => {
      handleClientAction(conn.peer, data);
    });

    conn.on('close', () => {
      connectionsMap.delete(conn.peer);
      handlePlayerDisconnect(conn.peer);
    });
  });

  myPeer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      showToast('Mã phòng này vừa được sử dụng, vui lòng bấm Tạo phòng lại!');
      clearSession();
    } else {
      showToast('Lỗi kết nối P2P: ' + err.type);
    }
  });
}

function handleClientAction(senderPeerId, data) {
  if (!serverState) return;
  const { type, payload } = data;

  if (type === 'SEND_REACTION') {
    // Phát tán reaction cho toàn bộ phòng
    connectionsMap.forEach((conn) => {
      if (conn && conn.open && conn.peer !== senderPeerId) {
        conn.send({ type: 'BROADCAST_REACTION', payload });
      }
    });
    if (serverState.hostId !== senderPeerId) {
      spawnFloatingEmoji(payload.emoji, payload.senderName);
    }
    return;
  }

  if (type === 'RECONNECT_REQUEST') {
    const existingPlayer = serverState.players.find(p => p.name === payload.name);
    if (existingPlayer) {
      const oldId = existingPlayer.id;
      existingPlayer.id = senderPeerId;
      connectionsMap.delete(oldId);

      serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-bold mr-1">TÁI KẾT NỐI</span> <b class="text-amber-400">${payload.name}</b> đã quay lại phòng.`);
      broadcastHostState();
      return;
    }
  }

  if (type === 'JOIN_REQUEST') {
    const isMidGame = serverState.state !== 'LOBBY';
    const isSpectator = isMidGame;

    serverState.players.push({
      id: senderPeerId,
      name: payload.name || `Người chơi ${serverState.players.length + 1}`,
      character: isSpectator ? 'Khán giả' : null,
      hasGuessedCorrectly: isSpectator,
      questionsAskedCount: 0,
      finishRank: null,
      isSpectator: isSpectator
    });

    sound.pop();
    if (isSpectator) {
      serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 text-[10px] font-bold mr-1">KHÁN GIẢ</span> <b class="text-sky-400">${payload.name}</b> đã vào theo dõi trận đấu.`);
    } else {
      serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-bold mr-1">VÀO PHÒNG</span> <b class="text-amber-400">${payload.name}</b> đã tham gia.`);
    }

    broadcastHostState();
  }

  if (type === 'KICK_PLAYER') {
    if (senderPeerId !== serverState.hostId) return;
    const targetId = payload.targetId;
    if (targetId === serverState.hostId) return;

    const targetPlayer = serverState.players.find(p => p.id === targetId);
    if (!targetPlayer) return;

    const targetConn = connectionsMap.get(targetId);
    if (targetConn && targetConn.open) {
      targetConn.send({ type: 'KICKED', message: 'Bạn đã bị Chủ phòng mời ra khỏi phòng chơi!' });
      targetConn.close();
    }

    connectionsMap.delete(targetId);
    serverState.players = serverState.players.filter(p => p.id !== targetId);
    serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 text-[10px] font-extrabold mr-1">KICK</span> Chủ phòng đã mời <b class="text-rose-300">${targetPlayer.name}</b> ra khỏi phòng.`);

    if (serverState.state === 'PLAYING') {
      if (serverState.turnIndex >= serverState.players.length) {
        serverState.turnIndex = 0;
      }

      if (serverState.currentQuestion) {
        if (serverState.currentQuestion.askedById === targetId) {
          serverState.currentQuestion = null;
          advanceHostTurn();
        } else {
          delete serverState.currentQuestion.answers[targetId];
          checkPendingVoteCompletion();
        }
      }

      const activeMainPlayers = serverState.players.filter(p => !p.isSpectator);
      if (activeMainPlayers.length < 2) {
        serverState.state = 'LOBBY';
        serverState.currentQuestion = null;
        serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold mr-1">HỆ THỐNG</span> Phòng thiếu người chơi, trở về trạng thái phòng chờ.`);
      }
    }

    broadcastHostState();
  }

  if (type === 'ASK_QUESTION') {
    const activePlayer = serverState.players[serverState.turnIndex];
    if (activePlayer.id !== senderPeerId || activePlayer.isSpectator) return;

    activePlayer.questionsAskedCount = (activePlayer.questionsAskedCount || 0) + 1;

    serverState.currentQuestion = {
      type: 'QUESTION',
      text: payload.question,
      askedBy: activePlayer.name,
      askedById: activePlayer.id,
      actualCharacter: activePlayer.character,
      answers: {}
    };
    resetTurnTimerDeadline();
    serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300 text-[10px] font-bold mr-1">HỎI</span> <b class="text-amber-400">${activePlayer.name}</b>: "${payload.question}"`);
    broadcastHostState();
  }

  if (type === 'MAKE_GUESS') {
    const activePlayer = serverState.players[serverState.turnIndex];
    if (activePlayer.id !== senderPeerId || serverState.state !== 'PLAYING' || activePlayer.isSpectator) return;

    activePlayer.questionsAskedCount = (activePlayer.questionsAskedCount || 0) + 1;

    serverState.currentQuestion = {
      type: 'GUESS',
      text: payload.guessedName,
      askedBy: activePlayer.name,
      askedById: activePlayer.id,
      actualCharacter: activePlayer.character,
      answers: {}
    };
    resetTurnTimerDeadline();
    serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-extrabold mr-1">ĐOÁN TÊN</span> <b class="text-amber-400">${activePlayer.name}</b> đoán mình là: <b class="text-white">"${payload.guessedName}"</b>!`);
    broadcastHostState();
  }

  if (type === 'SUBMIT_ANSWER') {
    if (!serverState.currentQuestion) return;
    const activePlayer = serverState.players[serverState.turnIndex];
    if (activePlayer.id === senderPeerId) return;

    serverState.currentQuestion.answers[senderPeerId] = payload.answer;
    checkPendingVoteCompletion();
    broadcastHostState();
  }

  if (type === 'NEXT_TURN') {
    const activePlayer = serverState.players[serverState.turnIndex];
    if (activePlayer.id === senderPeerId || serverState.hostId === senderPeerId) {
      serverState.currentQuestion = null;
      advanceHostTurn();
      broadcastHostState();
    }
  }
}

function checkPendingVoteCompletion() {
  if (!serverState || !serverState.currentQuestion) return;
  const activePlayer = serverState.players[serverState.turnIndex];
  
  const votersNeeded = serverState.players.filter(p => p.id !== activePlayer.id && !p.isSpectator);
  const answeredKeys = Object.keys(serverState.currentQuestion.answers).filter(id => {
    return votersNeeded.some(v => v.id === id);
  });

  if (answeredKeys.length >= votersNeeded.length && votersNeeded.length > 0) {
    if (serverState.currentQuestion.type === 'GUESS') {
      const correctVotes = answeredKeys.filter(id => serverState.currentQuestion.answers[id] === 'CORRECT').length;
      const wrongVotes = answeredKeys.filter(id => serverState.currentQuestion.answers[id] === 'WRONG').length;
      const isGuessedRight = correctVotes >= wrongVotes && correctVotes > 0;

      if (isGuessedRight) {
        activePlayer.hasGuessedCorrectly = true;
        serverState.finishCounter = (serverState.finishCounter || 0) + 1;
        activePlayer.finishRank = serverState.finishCounter;

        sound.victory();
        serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-emerald-900/80 text-emerald-300 text-[10px] font-bold mr-1">CHÍNH XÁC</span> [Hạng ${activePlayer.finishRank}] <b class="text-amber-400">${activePlayer.name}</b> đã tìm ra nhân vật <b class="text-emerald-300">"${activePlayer.character}"</b>!`);
        
        const activeMainPlayers = serverState.players.filter(p => !p.isSpectator);
        if (activeMainPlayers.every(p => p.hasGuessedCorrectly)) {
          serverState.state = 'ENDED';
          serverState.turnDeadline = null;
          serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-extrabold mr-1">KẾT THÚC</span> Tất cả người chơi đã hoàn thành ván đấu.`);
        }
      } else {
        sound.fail();
        serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-rose-900/80 text-rose-300 text-[10px] font-bold mr-1">CHƯA ĐÚNG</span> Mọi người xác nhận câu đoán "${serverState.currentQuestion.text}" chưa chính xác.`);
      }

      serverState.lastTurnResult = {
        type: 'GUESS',
        askedBy: activePlayer.name,
        question: `Đoán: "${serverState.currentQuestion.text}" (Nhân vật thật: ${activePlayer.character})`,
        answers: { ...serverState.currentQuestion.answers }
      };
    } else {
      sound.success();
      const summary = answeredKeys.map(id => {
        const voter = serverState.players.find(p => p.id === id);
        const ans = serverState.currentQuestion.answers[id];
        const ansText = ans === 'YES' ? '<b class="text-emerald-400">CÓ</b>' : (ans === 'NO' ? '<b class="text-rose-400">KHÔNG</b>' : '<b class="text-slate-400">KHÔNG RÕ</b>');
        return `${voter ? voter.name : 'Người chơi'}: ${ansText}`;
      }).join(', ');

      serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold mr-1">KẾT QUẢ</span> <b class="text-amber-400">${activePlayer.name}</b> [${summary}]`);
      
      serverState.lastTurnResult = {
        type: 'QUESTION',
        askedBy: activePlayer.name,
        question: serverState.currentQuestion.text,
        answers: { ...serverState.currentQuestion.answers }
      };
    }

    serverState.currentQuestion = null;
    advanceHostTurn();
  }
}

function advanceHostTurn() {
  let attempts = 0;
  const totalPlayers = serverState.players.length;
  if (totalPlayers === 0) return;

  do {
    serverState.turnIndex = (serverState.turnIndex + 1) % totalPlayers;
    attempts++;
  } while ((serverState.players[serverState.turnIndex].hasGuessedCorrectly || serverState.players[serverState.turnIndex].isSpectator) && attempts < totalPlayers);

  const nextPlayer = serverState.players[serverState.turnIndex];
  resetTurnTimerDeadline();

  if (nextPlayer && serverState.state === 'PLAYING' && !nextPlayer.isSpectator && !nextPlayer.hasGuessedCorrectly) {
    serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold mr-1">LƯỢT MỚI</span> Chuyển tới lượt của <b class="text-amber-400">${nextPlayer.name}</b>.`);
  }
}

function handlePlayerDisconnect(peerId) {
  if (!serverState) return;

  const leaving = serverState.players.find(p => p.id === peerId);
  if (leaving) {
    serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold mr-1">RỜI PHÒNG</span> <b class="text-slate-300">${leaving.name}</b> đã ngắt kết nối tạm thời.`);
  }

  if (serverState.state === 'PLAYING') {
    if (serverState.currentQuestion) {
      if (serverState.currentQuestion.askedById === peerId) {
        serverState.currentQuestion = null;
        advanceHostTurn();
      } else {
        delete serverState.currentQuestion.answers[peerId];
        checkPendingVoteCompletion();
      }
    }
  }

  broadcastHostState();
}

function broadcastHostState() {
  if (!serverState) return;

  serverState.players.forEach(p => {
    const personalizedState = {
      roomCode: serverState.code,
      hostId: serverState.hostId,
      isHost: serverState.hostId === p.id,
      state: serverState.state,
      currentThemeName: serverState.currentThemeName || currentThemeName,
      timerEnabled: serverState.timerEnabled,
      timerDuration: serverState.timerDuration,
      turnDeadline: serverState.turnDeadline,
      turnIndex: serverState.turnIndex,
      activePlayerId: serverState.players[serverState.turnIndex]?.id,
      currentQuestion: serverState.currentQuestion ? {
        ...serverState.currentQuestion,
        actualCharacter: (serverState.currentQuestion.askedById === p.id && !p.hasGuessedCorrectly)
          ? '???'
          : serverState.currentQuestion.actualCharacter
      } : null,
      lastTurnResult: serverState.lastTurnResult,
      logs: serverState.logs,
      players: serverState.players.map(other => ({
        id: other.id,
        name: other.name,
        character: (other.id === p.id && !other.hasGuessedCorrectly && serverState.state !== 'ENDED' && !other.isSpectator)
          ? '???'
          : other.character,
        isYou: other.id === p.id,
        hasGuessedCorrectly: other.hasGuessedCorrectly,
        questionsAskedCount: other.questionsAskedCount || 0,
        finishRank: other.finishRank,
        isSpectator: other.isSpectator
      }))
    };

    if (p.id === myId) {
      renderGameState(personalizedState);
    } else {
      const clientConn = connectionsMap.get(p.id);
      if (clientConn && clientConn.open) {
        clientConn.send({ type: 'STATE_UPDATE', payload: personalizedState });
      }
    }
  });
}

// ==========================================
// LOGIC THÀNH VIÊN (CLIENT ENGINE)
// ==========================================
function initClient(roomCode, playerName, isReconnect = false) {
  myPeer = new Peer();

  myPeer.on('open', (id) => {
    myId = id;
    isHost = false;
    currentRoomCode = roomCode;

    saveSession({ roomCode, playerName, isHost: false });

    const hostPeerId = `whoami-${roomCode.toLowerCase()}`;
    hostConnection = myPeer.connect(hostPeerId, { reliable: true });

    hostConnection.on('open', () => {
      if (isReconnect) {
        hostConnection.send({
          type: 'RECONNECT_REQUEST',
          payload: { name: playerName }
        });
      } else {
        hostConnection.send({
          type: 'JOIN_REQUEST',
          payload: { name: playerName }
        });
      }
      enterLobbyUI(roomCode, false);
    });

    hostConnection.on('data', (data) => {
      if (data.type === 'STATE_UPDATE') {
        renderGameState(data.payload);
      } else if (data.type === 'BROADCAST_REACTION') {
        spawnFloatingEmoji(data.payload.emoji, data.payload.senderName);
      } else if (data.type === 'KICKED') {
        clearSession();
        alert(data.message || 'Bạn đã bị Chủ phòng mời ra khỏi phòng!');
        location.reload();
      } else if (data.type === 'ERROR') {
        showToast(data.message);
      }
    });

    hostConnection.on('close', () => {
      showToast('Phòng đã bị đóng hoặc mất kết nối tới Chủ phòng!');
      clearSession();
      setTimeout(() => location.reload(), 2500);
    });
  });

  myPeer.on('error', (err) => {
    if (err.type === 'peer-unavailable') {
      showToast('Không tìm thấy phòng với mã này! Hãy kiểm tra lại.');
      clearSession();
    } else {
      showToast('Lỗi kết nối P2P: ' + err.type);
    }
  });
}

function sendAction(type, payload = {}) {
  if (isHost) {
    handleClientAction(myId, { type, payload });
  } else if (hostConnection && hostConnection.open) {
    hostConnection.send({ type, payload });
  }
}

window.kickPlayer = function(targetId, targetName) {
  if (!isHost) return;
  sound.pop();
  if (confirm(`Bạn có chắc chắn muốn mời [${targetName}] ra khỏi phòng không?`)) {
    sendAction('KICK_PLAYER', { targetId });
  }
};

// ==========================================
// BIỂU QUYẾT 2 BƯỚC (TWO-STEP VOTE)
// ==========================================
window.selectVoteOption = function(answer) {
  if (hasVotedCurrentQuestion) return;
  sound.pop();
  selectedVoteOption = answer;

  document.querySelectorAll('.vote-opt-btn').forEach(btn => {
    btn.classList.remove('ring-2', 'ring-amber-400', 'ring-emerald-400', 'ring-rose-400', 'bg-slate-700');
  });

  const pendingVoteLabel = document.getElementById('pending-vote-label');
  const panelVoteConfirm = document.getElementById('panel-vote-confirm');

  if (answer === 'YES' || answer === 'CORRECT') {
    const btn = document.getElementById(answer === 'YES' ? 'btn-vote-yes' : 'btn-guess-correct');
    if (btn) btn.classList.add('ring-2', 'ring-emerald-400');
    if (pendingVoteLabel) {
      pendingVoteLabel.textContent = answer === 'YES' ? 'CÓ' : 'ĐÚNG RỒI';
      pendingVoteLabel.className = 'font-black text-sm ml-1 text-emerald-400';
    }
  } else if (answer === 'NO' || answer === 'WRONG') {
    const btn = document.getElementById(answer === 'NO' ? 'btn-vote-no' : 'btn-guess-wrong');
    if (btn) btn.classList.add('ring-2', 'ring-rose-400');
    if (pendingVoteLabel) {
      pendingVoteLabel.textContent = answer === 'NO' ? 'KHÔNG' : 'SAI RỒI';
      pendingVoteLabel.className = 'font-black text-sm ml-1 text-rose-400';
    }
  } else {
    const btnVoteUnknown = document.getElementById('btn-vote-unknown');
    if (btnVoteUnknown) btnVoteUnknown.classList.add('ring-2', 'ring-amber-400');
    if (pendingVoteLabel) {
      pendingVoteLabel.textContent = 'KHÔNG RÕ';
      pendingVoteLabel.className = 'font-black text-sm ml-1 text-slate-300';
    }
  }

  if (panelVoteConfirm) panelVoteConfirm.classList.remove('hidden');
};

function setVoteButtonsDisabled(disabled) {
  document.querySelectorAll('.vote-opt-btn').forEach(btn => {
    btn.disabled = disabled;
    if (disabled) {
      btn.classList.add('opacity-40', 'cursor-not-allowed');
    } else {
      btn.classList.remove('opacity-40', 'cursor-not-allowed', 'ring-2', 'ring-amber-400', 'ring-emerald-400', 'ring-rose-400');
    }
  });
}

// ==========================================
// RENDER GIAO DIỆN CHUNG & CLIENT TIMER LOOP
// ==========================================
function enterLobbyUI(roomCode, amIHost) {
  const screenAuth = document.getElementById('screen-auth');
  const screenLobby = document.getElementById('screen-lobby');
  const btnToggleNotepad = document.getElementById('btn-toggle-notepad');
  const panelReactions = document.getElementById('panel-reactions');
  const lobbyRoomCode = document.getElementById('lobby-room-code');
  const hostSettings = document.getElementById('host-settings');
  const btnStartGame = document.getElementById('btn-start-game');
  const waitHostMsg = document.getElementById('wait-host-msg');
  const badgeRole = document.getElementById('badge-role');

  if (screenAuth) screenAuth.classList.add('hidden');
  if (screenLobby) screenLobby.classList.remove('hidden');
  if (btnToggleNotepad) btnToggleNotepad.classList.add('hidden');
  if (panelReactions) panelReactions.classList.add('hidden');
  if (lobbyRoomCode) lobbyRoomCode.textContent = roomCode;

  if (amIHost) {
    loadCharacterPool();
    updateCharacterVaultUI();
    updateTimerPillsUI();
    if (hostSettings) hostSettings.classList.remove('hidden');
    if (btnStartGame) btnStartGame.classList.remove('hidden');
    if (waitHostMsg) waitHostMsg.classList.add('hidden');
    if (badgeRole) {
      badgeRole.textContent = '👑 Chủ phòng';
      badgeRole.className = 'px-3.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold rounded-full';
    }
  } else {
    if (hostSettings) hostSettings.classList.add('hidden');
    if (btnStartGame) btnStartGame.classList.add('hidden');
    if (waitHostMsg) waitHostMsg.classList.remove('hidden');
    if (badgeRole) {
      badgeRole.textContent = 'Thành viên';
      badgeRole.className = 'px-3.5 py-1 bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold rounded-full';
    }
  }
}

function updateCharacterVaultUI() {
  const lobbyCharCount = document.getElementById('lobby-char-count');
  const modalTotalChars = document.getElementById('modal-total-chars');
  const badgeCurrentTheme = document.getElementById('badge-current-theme');
  const modalCharTags = document.getElementById('modal-char-tags');

  if (lobbyCharCount) lobbyCharCount.textContent = currentCharacterPool.length;
  if (modalTotalChars) modalTotalChars.textContent = currentCharacterPool.length;
  if (badgeCurrentTheme) badgeCurrentTheme.textContent = `Chủ đề: ${currentThemeName}`;

  if (!modalCharTags) return;

  const filtered = currentCharacterPool.filter(c => 
    !searchQuery || c.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (filtered.length === 0) {
    modalCharTags.innerHTML = `<span class="text-xs text-slate-500 italic p-2">Không tìm thấy nhân vật nào phù hợp...</span>`;
    return;
  }

  modalCharTags.innerHTML = filtered.map((char) => {
    const realIndex = currentCharacterPool.indexOf(char);
    return `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-semibold text-slate-200">
        <span>${char}</span>
        <button onclick="removeCharacter(${realIndex})" class="text-slate-500 hover:text-rose-400 font-bold ml-1 text-sm">✕</button>
      </span>
    `;
  }).join('');
}

function renderModalPresetButtons() {
  const modalActiveThemePill = document.getElementById('modal-active-theme-pill');
  const modalPresetButtons = document.getElementById('modal-preset-buttons');
  if (!modalActiveThemePill || !modalPresetButtons || !window.PRESET_THEMES) return;

  modalActiveThemePill.textContent = `${selectedPresetKeys.length} gói đang chọn`;
  modalPresetButtons.innerHTML = Object.keys(window.PRESET_THEMES).map(key => {
    const preset = window.PRESET_THEMES[key];
    const isSelected = selectedPresetKeys.includes(key);
    return `
      <button onclick="togglePresetTheme('${key}')" class="p-3 rounded-2xl border text-xs font-bold transition text-left flex flex-col justify-between relative group ${
        isSelected 
          ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-2 ring-amber-400/40 shadow-lg shadow-amber-500/10' 
          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600 hover:bg-slate-850 hover:text-slate-200'
      }">
        <div class="flex items-center justify-between w-full mb-1">
          <span class="truncate font-black text-[13px]">${preset.name}</span>
          <span class="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black border ${
            isSelected 
              ? 'bg-amber-400 text-slate-950 border-amber-300' 
              : 'border-slate-700 text-transparent group-hover:border-slate-500'
          }">✓</span>
        </div>
        <span class="text-[10px] ${isSelected ? 'text-amber-400/80 font-semibold' : 'text-slate-500'}">${preset.list.length} nhân vật</span>
      </button>
    `;
  }).join('');
}

function handleClientTimer(data) {
  if (localTimerInterval) clearInterval(localTimerInterval);

  const gameTimerContainer = document.getElementById('game-timer-container');
  const gameTimerText = document.getElementById('game-timer-text');
  const timerProgressBarWrap = document.getElementById('timer-progress-bar-wrap');
  const timerProgressBar = document.getElementById('timer-progress-bar');

  if (!data.timerEnabled || data.state !== 'PLAYING' || !data.turnDeadline) {
    if (gameTimerContainer) {
      gameTimerContainer.classList.add('hidden');
      gameTimerContainer.classList.remove('flex');
    }
    if (timerProgressBarWrap) timerProgressBarWrap.classList.add('hidden');
    return;
  }

  if (gameTimerContainer) {
    gameTimerContainer.classList.remove('hidden');
    gameTimerContainer.classList.add('flex');
  }
  if (timerProgressBarWrap) timerProgressBarWrap.classList.remove('hidden');

  const totalDurationSec = data.timerDuration || 45;

  const updateVisual = () => {
    const remainingMs = data.turnDeadline - Date.now();
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    const progressPct = Math.max(0, Math.min(100, (remainingMs / (totalDurationSec * 1000)) * 100));

    if (gameTimerText) gameTimerText.textContent = `${remainingSec}s`;
    if (timerProgressBar) timerProgressBar.style.width = `${progressPct}%`;

    if (remainingSec <= 10) {
      if (gameTimerText) gameTimerText.className = 'text-rose-400 font-black tracking-wider animate-urgent';
      if (timerProgressBar) timerProgressBar.className = 'bg-rose-500 h-full transition-all duration-200';
      
      if (remainingSec <= 5 && remainingSec > 0 && lastTickedSecond !== remainingSec) {
        lastTickedSecond = remainingSec;
        sound.tick();
      }
    } else {
      if (gameTimerText) gameTimerText.className = 'text-amber-400 font-black tracking-wider';
      if (timerProgressBar) timerProgressBar.className = 'bg-amber-400 h-full transition-all duration-200';
    }
  };

  updateVisual();
  localTimerInterval = setInterval(updateVisual, 250);
}

function renderGameState(data) {
  currentRoomCode = data.roomCode;
  
  const badgeCurrentTheme = document.getElementById('badge-current-theme');
  const badgeLobbyTimer = document.getElementById('badge-lobby-timer');
  const screenAuth = document.getElementById('screen-auth');
  const screenLobby = document.getElementById('screen-lobby');
  const screenGame = document.getElementById('screen-game');
  const btnToggleNotepad = document.getElementById('btn-toggle-notepad');
  const panelReactions = document.getElementById('panel-reactions');
  const modalLeaderboard = document.getElementById('modal-leaderboard');
  const lobbyPlayerCount = document.getElementById('lobby-player-count');
  const lobbyPlayerList = document.getElementById('lobby-player-list');

  const gameRoomCode = document.getElementById('game-room-code');
  const turnBanner = document.getElementById('turn-banner');
  const btnRestartGame = document.getElementById('btn-restart-game');
  const leaderboardPlayerList = document.getElementById('leaderboard-player-list');
  const btnLeaderboardRestart = document.getElementById('btn-leaderboard-restart');
  const leaderboardWaitMsg = document.getElementById('leaderboard-wait-msg');
  const playersGrid = document.getElementById('players-grid');

  const panelLastResult = document.getElementById('panel-last-result');
  const lastResultText = document.getElementById('last-result-text');
  const lastResultBadges = document.getElementById('last-result-badges');

  const panelMyTurn = document.getElementById('panel-my-turn');
  const panelVoteConfirm = document.getElementById('panel-vote-confirm');
  const votePanelTitle = document.getElementById('vote-panel-title');
  const currentQuestionText = document.getElementById('current-question-text');
  const guessVerifyExtra = document.getElementById('guess-verify-extra');
  const guessRealCharName = document.getElementById('guess-real-char-name');
  const votingButtonsRegular = document.getElementById('voting-buttons-regular');
  const votingButtonsGuess = document.getElementById('voting-buttons-guess');
  const voteCounterBadge = document.getElementById('vote-counter-badge');
  const voteResults = document.getElementById('vote-results');
  const gameLogs = document.getElementById('game-logs');

  if (data.currentThemeName && badgeCurrentTheme) {
    badgeCurrentTheme.textContent = `Chủ đề: ${data.currentThemeName}`;
  }

  if (badgeLobbyTimer) {
    if (data.timerEnabled) {
      badgeLobbyTimer.textContent = `⏱️ ${data.timerDuration}s / lượt`;
      badgeLobbyTimer.className = 'px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-full';
    } else {
      badgeLobbyTimer.textContent = '⏱️ Không giới hạn giờ';
      badgeLobbyTimer.className = 'px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold rounded-full';
    }
  }

  const me = data.players.find(p => p.isYou);
  const amISpectator = me?.isSpectator || false;

  if (data.state === 'LOBBY') {
    if (screenAuth) screenAuth.classList.add('hidden');
    if (screenLobby) screenLobby.classList.remove('hidden');
    if (screenGame) screenGame.classList.add('hidden');
    if (btnToggleNotepad) btnToggleNotepad.classList.add('hidden');
    if (panelReactions) panelReactions.classList.add('hidden');
    if (modalLeaderboard) modalLeaderboard.classList.add('hidden');
    previousActivePlayerId = null;
    handleClientTimer(data);

    if (lobbyPlayerCount) lobbyPlayerCount.textContent = data.players.length;
    if (lobbyPlayerList) {
      lobbyPlayerList.innerHTML = data.players.map(p => `
        <div class="bg-slate-950/80 border ${p.isYou ? 'border-indigo-500/80 ring-1 ring-indigo-500/30' : 'border-slate-800'} p-3 rounded-2xl flex items-center justify-between">
          <div class="flex items-center gap-2 overflow-hidden">
            <span class="font-extrabold text-sm text-slate-100 truncate">${p.name}</span>
            ${p.isYou ? '<span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold text-[10px]">Bạn</span>' : ''}
            ${p.id === data.hostId ? '<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">Host</span>' : ''}
          </div>

          ${(data.isHost && p.id !== data.hostId) ? `
            <button onclick="kickPlayer('${p.id}', '${p.name}')" class="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold transition flex-shrink-0">
              ✕ Đá
            </button>
          ` : ''}
        </div>
      `).join('');
    }
  } else if (data.state === 'PLAYING' || data.state === 'ENDED') {
    if (screenLobby) screenLobby.classList.add('hidden');
    if (screenGame) screenGame.classList.remove('hidden');
    if (panelReactions) panelReactions.classList.remove('hidden');

    if (btnToggleNotepad) {
      if (amISpectator) btnToggleNotepad.classList.add('hidden');
      else btnToggleNotepad.classList.remove('hidden');
    }

    handleClientTimer(data);

    if (gameRoomCode) gameRoomCode.textContent = data.roomCode;
    const activePlayer = data.players.find(p => p.id === data.activePlayerId);
    const isMyTurn = data.activePlayerId === myId && !amISpectator;

    if (data.state === 'PLAYING' && isMyTurn && previousActivePlayerId !== data.activePlayerId) {
      sound.yourTurn();
    }
    previousActivePlayerId = data.activePlayerId;

    if (btnRestartGame) {
      if (data.state === 'ENDED' && data.isHost) {
        btnRestartGame.classList.remove('hidden');
      } else {
        btnRestartGame.classList.add('hidden');
      }
    }

    if (data.state === 'ENDED') {
      if (turnBanner) {
        turnBanner.textContent = 'Trò chơi đã kết thúc';
        turnBanner.className = 'text-xs sm:text-sm font-extrabold px-4 py-1.5 rounded-full bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20';
      }

      const sortedPlayers = [...data.players].filter(p => !p.isSpectator).sort((a, b) => {
        if (a.finishRank && b.finishRank) return a.finishRank - b.finishRank;
        if (a.finishRank) return -1;
        if (b.finishRank) return 1;
        return a.questionsAskedCount - b.questionsAskedCount;
      });

      if (leaderboardPlayerList) {
        leaderboardPlayerList.innerHTML = sortedPlayers.map((p, idx) => {
          let rankBadge = `<span class="w-6 text-center font-bold text-slate-500">#${idx + 1}</span>`;
          if (p.finishRank === 1) rankBadge = `<span class="text-xl">🥇</span>`;
          else if (p.finishRank === 2) rankBadge = `<span class="text-xl">🥈</span>`;
          else if (p.finishRank === 3) rankBadge = `<span class="text-xl">🥉</span>`;

          return `
            <div class="p-3 rounded-2xl bg-slate-950/80 border ${p.isYou ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800'} flex items-center justify-between">
              <div class="flex items-center gap-2.5 overflow-hidden">
                ${rankBadge}
                <div class="overflow-hidden">
                  <div class="flex items-center gap-1.5">
                    <span class="font-black text-sm text-slate-100 truncate">${p.name}</span>
                    ${p.isYou ? '<span class="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-bold text-[9px]">Bạn</span>' : ''}
                  </div>
                  <span class="text-[11px] text-emerald-400 font-bold block truncate">🎯 Nhân vật: ${p.character}</span>
                </div>
              </div>

              <div class="text-right flex-shrink-0">
                <span class="text-xs font-black text-slate-200">${p.questionsAskedCount || 0} câu</span>
                <span class="block text-[10px] text-slate-500 font-medium">${p.hasGuessedCorrectly ? 'Đã hoàn thành' : 'Chưa đoán ra'}</span>
              </div>
            </div>
          `;
        }).join('');
      }

      if (btnLeaderboardRestart && leaderboardWaitMsg) {
        if (data.isHost) {
          btnLeaderboardRestart.classList.remove('hidden');
          leaderboardWaitMsg.classList.add('hidden');
        } else {
          btnLeaderboardRestart.classList.add('hidden');
          leaderboardWaitMsg.classList.remove('hidden');
        }
      }

      if (modalLeaderboard) modalLeaderboard.classList.remove('hidden');
    } else {
      if (modalLeaderboard) modalLeaderboard.classList.add('hidden');
      if (turnBanner) {
        if (amISpectator) {
          turnBanner.textContent = `👀 Bạn đang xem (${activePlayer?.name || '...'})`;
          turnBanner.className = 'text-xs sm:text-sm font-bold px-4 py-1.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40';
        } else {
          turnBanner.textContent = isMyTurn ? 'ĐANG LÀ LƯỢT CỦA BẠN' : `Lượt của: ${activePlayer?.name || '...'}`;
          turnBanner.className = `text-xs sm:text-sm font-bold px-4 py-1.5 rounded-full transition-all ${
            isMyTurn 
              ? 'bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-400/30 animate-bounce' 
              : 'bg-slate-800 text-slate-300 border border-slate-700'
          }`;
        }
      }
    }

    if (playersGrid) {
      playersGrid.innerHTML = data.players.map(p => {
        const isCurrentTurn = p.id === data.activePlayerId;
        const isSelf = p.isYou;

        let cardBorderClass = 'border-slate-800/80 bg-slate-900/90';
        if (isCurrentTurn) {
          cardBorderClass = 'border-amber-400 glow-active-turn bg-slate-900/95';
        } else if (isSelf) {
          cardBorderClass = 'border-indigo-500/60 bg-indigo-950/20';
        }

        return `
          <div class="relative border-2 ${cardBorderClass} backdrop-blur-md rounded-2xl p-3.5 flex flex-col items-center text-center transition-all duration-300">
            
            ${(data.isHost && p.id !== data.hostId) ? `
              <button onclick="kickPlayer('${p.id}', '${p.name}')" title="Mời người này ra" class="absolute top-2 right-2 w-5 h-5 rounded-full bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white text-[10px] font-bold flex items-center justify-center transition border border-slate-700">
                ✕
              </button>
            ` : ''}

            <div class="w-full flex items-center justify-center gap-1.5 mb-2.5 pb-2 border-b border-slate-800 pr-4 pl-1">
              <span class="text-sm font-black text-slate-100 truncate tracking-wide">
                ${p.name}
              </span>
              ${p.isSpectator ? '<span class="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[9px] font-extrabold">Khán giả</span>' : ''}
              ${isSelf ? '<span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-extrabold">Bạn</span>' : ''}
              ${p.id === data.hostId ? '<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-extrabold">Host</span>' : ''}
            </div>

            <div class="w-full py-3 px-2 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-center min-h-[52px] shadow-inner">
              <span class="font-extrabold text-sm sm:text-base ${p.character === '???' ? 'text-amber-400 font-mono tracking-widest text-lg' : (p.isSpectator ? 'text-slate-400 text-xs' : 'text-emerald-400')}">
                ${p.character}
              </span>
            </div>

            <div class="mt-2 text-[10px] font-semibold text-slate-400 flex items-center gap-1">
              ${p.isSpectator 
                ? '<span class="text-sky-400 font-bold">👀 Đang xem</span>'
                : (p.hasGuessedCorrectly 
                  ? `<span class="text-emerald-400 font-bold">✓ Đã đoán đúng (#${p.finishRank})</span>` 
                  : (p.character === '???' ? '<span class="text-slate-500">Mọi người thấy bạn</span>' : '<span class="text-slate-400">Nhân vật</span>'))
              }
            </div>
          </div>
        `;
      }).join('');
    }

    if (data.lastTurnResult && panelLastResult) {
      panelLastResult.classList.remove('hidden');
      if (lastResultText) lastResultText.textContent = `"${data.lastTurnResult.question}" (bởi ${data.lastTurnResult.askedBy})`;
      
      const answers = data.lastTurnResult.answers || {};
      const answerKeys = Object.keys(answers);
      if (lastResultBadges) {
        lastResultBadges.innerHTML = answerKeys.map(pId => {
          const voter = data.players.find(p => p.id === pId);
          const ans = answers[pId];
          let badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
          let label = ans;
          if (ans === 'YES' || ans === 'CORRECT') {
            badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
            label = ans === 'YES' ? 'CÓ' : 'ĐÚNG';
          } else if (ans === 'NO' || ans === 'WRONG') {
            badgeClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
            label = ans === 'NO' ? 'KHÔNG' : 'SAI';
          } else if (ans === 'UNKNOWN') {
            label = 'KHÔNG RÕ';
          }
          return `<span class="px-2.5 py-1 rounded-xl border ${badgeClass} font-semibold"><b class="text-amber-300">${voter?.name || '...'}:</b> ${label}</span>`;
        }).join('');
      }
    } else if (panelLastResult) {
      panelLastResult.classList.add('hidden');
    }

    if (panelMyTurn) {
      if (isMyTurn && data.state === 'PLAYING') {
        panelMyTurn.classList.remove('hidden');
      } else {
        panelMyTurn.classList.add('hidden');
      }
    }

    if (data.currentQuestion) {
      const currentKey = `${data.currentQuestion.type}_${data.currentQuestion.text}`;
      if (currentKey !== lastRenderedQuestionKey) {
        lastRenderedQuestionKey = currentKey;
        hasVotedCurrentQuestion = false;
        selectedVoteOption = null;
        if (panelVoteConfirm) panelVoteConfirm.classList.add('hidden');
        setVoteButtonsDisabled(false);
      }

      if (data.currentQuestion.type === 'GUESS') {
        if (votePanelTitle) {
          votePanelTitle.textContent = 'Bình chọn câu đoán nhân vật';
          votePanelTitle.className = 'text-xs font-black text-amber-400 uppercase tracking-wider animate-pulse';
        }
        if (currentQuestionText) {
          currentQuestionText.innerHTML = `<span class="text-slate-400 text-xs block mb-1">Người chơi <b class="text-amber-400 font-bold">${data.currentQuestion.askedBy}</b> đoán mình là:</span> <span class="text-lg font-black text-white">"${data.currentQuestion.text}"</span>`;
        }
        
        if (!isMyTurn) {
          if (guessVerifyExtra) guessVerifyExtra.classList.remove('hidden');
          if (guessRealCharName) guessRealCharName.textContent = data.currentQuestion.actualCharacter;
        } else {
          if (guessVerifyExtra) guessVerifyExtra.classList.add('hidden');
        }

        if (votingButtonsRegular) votingButtonsRegular.classList.add('hidden');
        if (votingButtonsGuess) {
          if (!isMyTurn && data.state === 'PLAYING' && !amISpectator) {
            votingButtonsGuess.classList.remove('hidden');
          } else {
            votingButtonsGuess.classList.add('hidden');
          }
        }

      } else {
        if (votePanelTitle) {
          votePanelTitle.textContent = 'Câu hỏi trên bàn';
          votePanelTitle.className = 'text-xs font-bold text-indigo-400 uppercase tracking-wider';
        }
        if (currentQuestionText) {
          currentQuestionText.textContent = `"${data.currentQuestion.text}" (bởi ${data.currentQuestion.askedBy})`;
        }
        if (guessVerifyExtra) guessVerifyExtra.classList.add('hidden');

        if (votingButtonsGuess) votingButtonsGuess.classList.add('hidden');
        if (votingButtonsRegular) {
          if (!isMyTurn && data.state === 'PLAYING' && !amISpectator) {
            votingButtonsRegular.classList.remove('hidden');
          } else {
            votingButtonsRegular.classList.add('hidden');
          }
        }
      }

      const answers = data.currentQuestion.answers || {};
      const answerKeys = Object.keys(answers);
      const totalVoters = data.players.filter(p => !p.isSpectator).length - 1;

      if (voteCounterBadge) voteCounterBadge.textContent = `${answerKeys.length}/${Math.max(1, totalVoters)} người đã trả lời`;

      if (voteResults) {
        if (answerKeys.length > 0) {
          voteResults.innerHTML = answerKeys.map(pId => {
            const voter = data.players.find(p => p.id === pId);
            const ans = answers[pId];
            let badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
            let label = ans;
            if (ans === 'YES' || ans === 'CORRECT') {
              badgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
              label = ans === 'YES' ? 'CÓ' : 'ĐÚNG';
            } else if (ans === 'NO' || ans === 'WRONG') {
              badgeClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
              label = ans === 'NO' ? 'KHÔNG' : 'SAI';
            } else if (ans === 'UNKNOWN') {
              label = 'KHÔNG RÕ';
            }
            return `<span class="px-2.5 py-1 rounded-xl border ${badgeClass} font-semibold"><b class="text-amber-300">${voter?.name || '...'}:</b> ${label}</span>`;
          }).join('');
        } else {
          voteResults.innerHTML = '<span class="text-slate-500 italic">Đang chờ mọi người nhấn biểu quyết...</span>';
        }
      }
    } else {
      lastRenderedQuestionKey = '';
      hasVotedCurrentQuestion = false;
      selectedVoteOption = null;
      if (panelVoteConfirm) panelVoteConfirm.classList.add('hidden');
      setVoteButtonsDisabled(false);
      if (currentQuestionText) currentQuestionText.textContent = 'Chưa có câu hỏi nào trong lượt này...';
      if (guessVerifyExtra) guessVerifyExtra.classList.add('hidden');
      if (votingButtonsRegular) votingButtonsRegular.classList.add('hidden');
      if (votingButtonsGuess) votingButtonsGuess.classList.add('hidden');
      if (voteResults) voteResults.innerHTML = '';
      if (voteCounterBadge) voteCounterBadge.textContent = '';
    }

    if (gameLogs) {
      gameLogs.innerHTML = data.logs.map(log => `
        <div class="py-1.5 px-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 leading-relaxed text-xs">
          ${log}
        </div>
      `).join('');
      gameLogs.scrollTop = gameLogs.scrollHeight;
    }
  }
}

// ==========================================
// BINDING SỰ KIỆN DOM SAU KHI TẢI TRANG
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadCharacterPool();
  initNotepad();
  renderQuestionAssistant();

  // Tự động bắt tham số ?room= trên URL (quét mã QR)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  const inputRoomCode = document.getElementById('input-room-code');
  const inputName = document.getElementById('input-name');

  if (roomParam && inputRoomCode) {
    inputRoomCode.value = roomParam.toUpperCase();
    if (inputName) inputName.focus();
    showToast(`Đã nhận diện mã phòng [${roomParam.toUpperCase()}] từ liên kết!`);
  }

  // Khôi phục phiên tự động nếu F5 trang
  const existingSession = getSession();
  if (existingSession && existingSession.roomCode && existingSession.playerName) {
    showToast(`Đang kết nối lại phòng [${existingSession.roomCode}]...`);
    if (existingSession.isHost) {
      initHost(existingSession.roomCode, existingSession.playerName);
    } else {
      initClient(existingSession.roomCode, existingSession.playerName, true);
    }
  }

  const btnToggleSound = document.getElementById('btn-toggle-sound');
  const soundIcon = document.getElementById('sound-icon');
  const soundText = document.getElementById('sound-text');

  const btnToggleNotepad = document.getElementById('btn-toggle-notepad');
  const panelNotepad = document.getElementById('panel-notepad');
  const btnCloseNotepad = document.getElementById('btn-close-notepad');
  const btnClearNotepad = document.getElementById('btn-clear-notepad');
  const textareaNotepad = document.getElementById('textarea-notepad');

  const btnOpenQuestionAssistant = document.getElementById('btn-open-question-assistant');
  const modalQuestionAssistant = document.getElementById('modal-question-assistant');
  const btnCloseAssistantModal = document.getElementById('btn-close-assistant-modal');

  const btnOpenQrLobby = document.getElementById('btn-open-qr-lobby');
  const modalQrCode = document.getElementById('modal-qr-code');
  const btnCloseQrModal = document.getElementById('btn-close-qr-modal');

  const btnCreate = document.getElementById('btn-create');
  const btnJoin = document.getElementById('btn-join');

  const btnCopyCodeLobby = document.getElementById('btn-copy-code-lobby');
  const btnCopyCodeGame = document.getElementById('btn-copy-code-game');
  const toggleTurnTimer = document.getElementById('toggle-turn-timer');
  const timerOptionsContainer = document.getElementById('timer-options-container');

  const btnOpenCharModal = document.getElementById('btn-open-char-modal');
  const modalCharManager = document.getElementById('modal-char-manager');
  const btnCloseCharModal = document.getElementById('btn-close-char-modal');
  const btnSaveCharModal = document.getElementById('btn-save-char-modal');
  const btnSelectAllPresets = document.getElementById('btn-select-all-presets');
  const btnDeselectAllPresets = document.getElementById('btn-deselect-all-presets');

  const inputSheetUrl = document.getElementById('input-sheet-url');
  const btnSyncSheet = document.getElementById('btn-sync-sheet');
  const inputAddChar = document.getElementById('input-add-char');
  const btnAddChar = document.getElementById('btn-add-char');
  const inputSearchChar = document.getElementById('input-search-char');
  const btnExportChars = document.getElementById('btn-export-chars');
  const btnResetDefaultChars = document.getElementById('btn-reset-default-chars');

  const btnStartGame = document.getElementById('btn-start-game');
  const btnRestartGame = document.getElementById('btn-restart-game');
  const btnLeaderboardRestart = document.getElementById('btn-leaderboard-restart');

  const inputQuestion = document.getElementById('input-question');
  const btnSendQuestion = document.getElementById('btn-send-question');
  const inputGuessName = document.getElementById('input-guess-name');
  const btnMakeGuess = document.getElementById('btn-make-guess');
  const btnSkipTurn = document.getElementById('btn-skip-turn');

  const panelVoteConfirm = document.getElementById('panel-vote-confirm');
  const btnCancelVote = document.getElementById('btn-cancel-vote');
  const btnConfirmVote = document.getElementById('btn-confirm-vote');

  if (btnOpenQrLobby) btnOpenQrLobby.addEventListener('click', showRoomQRCode);
  if (btnCloseQrModal && modalQrCode) {
    btnCloseQrModal.addEventListener('click', () => {
      sound.pop();
      modalQrCode.classList.add('hidden');
    });
  }

  if (btnToggleSound) {
    btnToggleSound.addEventListener('click', () => {
      sound.muted = !sound.muted;
      if (sound.muted) {
        soundIcon.textContent = '🔇';
        soundText.textContent = 'Tắt âm';
        btnToggleSound.classList.add('text-slate-500');
        btnToggleSound.classList.remove('text-slate-300', 'text-amber-400');
      } else {
        sound.init();
        sound.pop();
        soundIcon.textContent = '🔊';
        soundText.textContent = 'Bật âm';
        btnToggleSound.classList.remove('text-slate-500');
        btnToggleSound.classList.add('text-amber-400');
      }
    });
  }

  if (btnOpenQuestionAssistant && modalQuestionAssistant) {
    btnOpenQuestionAssistant.addEventListener('click', () => {
      sound.pop();
      renderQuestionAssistant();
      modalQuestionAssistant.classList.remove('hidden');
    });
  }

  if (btnCloseAssistantModal && modalQuestionAssistant) {
    btnCloseAssistantModal.addEventListener('click', () => {
      sound.pop();
      modalQuestionAssistant.classList.add('hidden');
    });
  }

  if (textareaNotepad) {
    textareaNotepad.addEventListener('input', (e) => {
      const val = e.target.value;
      localStorage.setItem(STORAGE_KEY_NOTEPAD, val);
      updateNotepadUI(val);
    });
  }

  if (btnClearNotepad) {
    btnClearNotepad.addEventListener('click', () => {
      sound.pop();
      if (confirm('Xóa sạch nội dung trong sổ ghi chú này?')) {
        textareaNotepad.value = '';
        localStorage.removeItem(STORAGE_KEY_NOTEPAD);
        updateNotepadUI('');
      }
    });
  }

  if (btnToggleNotepad && panelNotepad) {
    btnToggleNotepad.addEventListener('click', () => {
      sound.pop();
      const isHidden = panelNotepad.classList.contains('pointer-events-none');
      if (isHidden) {
        panelNotepad.classList.remove('opacity-0', 'translate-y-8', 'pointer-events-none');
        panelNotepad.classList.add('opacity-100', 'translate-y-0');
      } else {
        panelNotepad.classList.remove('opacity-100', 'translate-y-0');
        panelNotepad.classList.add('opacity-0', 'translate-y-8', 'pointer-events-none');
      }
    });
  }

  if (btnCloseNotepad && panelNotepad) {
    btnCloseNotepad.addEventListener('click', () => {
      sound.pop();
      panelNotepad.classList.remove('opacity-100', 'translate-y-0');
      panelNotepad.classList.add('opacity-0', 'translate-y-8', 'pointer-events-none');
    });
  }

  if (btnCopyCodeLobby) btnCopyCodeLobby.addEventListener('click', copyRoomCode);
  if (btnCopyCodeGame) btnCopyCodeGame.addEventListener('click', copyRoomCode);

  if (toggleTurnTimer) {
    toggleTurnTimer.addEventListener('change', (e) => {
      if (!isHost) return;
      sound.pop();
      hostTimerEnabled = e.target.checked;
      
      if (timerOptionsContainer) {
        if (hostTimerEnabled) {
          timerOptionsContainer.classList.remove('opacity-40', 'pointer-events-none');
        } else {
          timerOptionsContainer.classList.add('opacity-40', 'pointer-events-none');
        }
      }

      if (serverState) {
        serverState.timerEnabled = hostTimerEnabled;
        broadcastHostState();
      }
    });
  }

  if (btnSelectAllPresets) {
    btnSelectAllPresets.addEventListener('click', () => {
      sound.pop();
      selectedPresetKeys = Object.keys(window.PRESET_THEMES);
      rebuildCharacterPool();
      renderModalPresetButtons();
      showToast(`Đã chọn tất cả ${selectedPresetKeys.length} gói chủ đề!`);
    });
  }

  if (btnDeselectAllPresets) {
    btnDeselectAllPresets.addEventListener('click', () => {
      sound.pop();
      if (customCharacters.length === 0) {
        selectedPresetKeys = ['SHOWBIZ'];
        showToast('Giữ lại gói Showbiz vì danh sách tự chọn đang trống!');
      } else {
        selectedPresetKeys = [];
        showToast('Đã bỏ chọn tất cả gói mẫu (Đang dùng nhân vật tự chọn)');
      }
      rebuildCharacterPool();
      renderModalPresetButtons();
    });
  }

  if (inputSearchChar) {
    inputSearchChar.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      updateCharacterVaultUI();
    });
  }

  function addCharactersFromInput() {
    if (!inputAddChar) return;
    const val = inputAddChar.value.trim();
    if (!val) return;

    const newNames = val.split(',').map(s => s.trim()).filter(Boolean);
    let addedCount = 0;

    newNames.forEach(name => {
      if (!currentCharacterPool.some(c => c.toLowerCase() === name.toLowerCase())) {
        customCharacters.unshift(name);
        addedCount++;
      }
    });

    inputAddChar.value = '';
    if (addedCount > 0) {
      sound.pop();
      rebuildCharacterPool();
      renderModalPresetButtons();
      showToast(`Đã thêm ${addedCount} nhân vật vào kho!`);
    } else {
      showToast('Nhân vật này đã tồn tại trong kho.');
    }
  }

  if (btnSyncSheet && inputSheetUrl) {
    btnSyncSheet.addEventListener('click', async () => {
      const url = inputSheetUrl.value.trim();
      if (!url) return showToast('Vui lòng dán liên kết Google Sheet!');

      const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) return showToast('Link Google Sheet không đúng định dạng!');

      const sheetId = match[1];
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;

      showToast('Đang tải từ Google Sheet...');

      try {
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error('Không thể tải');
        const text = await response.text();

        const lines = text.split('\n')
          .map(l => l.replace(/^"|"$/g, '').replace(/""/g, '"').trim())
          .filter(l => l && !l.toLowerCase().startsWith('tên') && !l.toLowerCase().startsWith('name') && !l.toLowerCase().startsWith('nhân vật'));

        if (lines.length === 0) return showToast('Không tìm thấy danh sách tên trong bảng!');

        let addedCount = 0;
        lines.forEach(name => {
          if (name.length > 0 && !currentCharacterPool.some(c => c.toLowerCase() === name.toLowerCase())) {
            customCharacters.push(name);
            addedCount++;
          }
        });

        sound.success();
        rebuildCharacterPool();
        renderModalPresetButtons();
        inputSheetUrl.value = '';
        showToast(`Đã đồng bộ thành công ${addedCount} nhân vật từ Google Sheet!`);
      } catch (err) {
        showToast('Lỗi: Hãy đảm bảo Google Sheet đã bật "Bất kỳ ai có liên kết đều xem được"!');
      }
    });
  }

  if (btnAddChar) btnAddChar.addEventListener('click', addCharactersFromInput);
  if (inputAddChar) {
    inputAddChar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addCharactersFromInput();
    });
  }

  if (btnOpenCharModal && modalCharManager) {
    btnOpenCharModal.addEventListener('click', () => {
      sound.pop();
      searchQuery = '';
      if (inputSearchChar) inputSearchChar.value = '';
      renderModalPresetButtons();
      updateCharacterVaultUI();
      modalCharManager.classList.remove('hidden');
    });
  }

  if (btnCloseCharModal && modalCharManager) {
    btnCloseCharModal.addEventListener('click', () => {
      sound.pop();
      modalCharManager.classList.add('hidden');
    });
  }

  if (btnSaveCharModal && modalCharManager) {
    btnSaveCharModal.addEventListener('click', () => {
      sound.pop();
      modalCharManager.classList.add('hidden');
      showToast('Đã lưu thiết lập chủ đề thành công!');
    });
  }

  if (btnExportChars) {
    btnExportChars.addEventListener('click', () => {
      sound.pop();
      const listStr = currentCharacterPool.join(', ');
      navigator.clipboard.writeText(listStr).then(() => {
        showToast('Đã sao chép danh sách nhân vật vào Clipboard!');
      });
    });
  }

  if (btnResetDefaultChars) {
    btnResetDefaultChars.addEventListener('click', () => {
      if (confirm('Khôi phục lại về gói Showbiz mặc định ban đầu?')) {
        sound.pop();
        selectedPresetKeys = ['SHOWBIZ'];
        customCharacters = [];
        searchQuery = '';
        if (inputSearchChar) inputSearchChar.value = '';
        rebuildCharacterPool();
        renderModalPresetButtons();
        showToast('Đã khôi phục gói Showbiz ban đầu.');
      }
    });
  }

  if (btnCreate) {
    btnCreate.addEventListener('click', () => {
      sound.init();
      sound.pop();
      const name = inputName.value.trim();
      if (!name) return showToast('Vui lòng nhập tên của bạn!');
      myName = name;
      const code = generateRoomCode();
      initHost(code, name);
    });
  }

  if (btnJoin) {
    btnJoin.addEventListener('click', () => {
      sound.init();
      sound.pop();
      const name = inputName.value.trim();
      const code = inputRoomCode.value.trim().toUpperCase();
      if (!name) return showToast('Vui lòng nhập tên của bạn!');
      if (!code) return showToast('Vui lòng nhập mã phòng!');
      myName = name;
      initClient(code, name);
    });
  }

  if (inputName) {
    inputName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (inputRoomCode && inputRoomCode.value.trim()) btnJoin.click();
        else btnCreate.click();
      }
    });
  }

  if (inputRoomCode) {
    inputRoomCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnJoin.click();
    });
  }

  if (btnStartGame) {
    btnStartGame.addEventListener('click', () => {
      if (!isHost || !serverState) return;

      serverState.players.forEach(p => {
        p.isSpectator = false;
      });

      if (serverState.players.length < 2) {
        return showToast('Cần ít nhất 2 người chơi để bắt đầu!');
      }

      if (currentCharacterPool.length < serverState.players.length) {
        return showToast(`Kho nhân vật hiện có (${currentCharacterPool.length}) ít hơn số người chơi (${serverState.players.length}). Vui lòng chọn thêm gói chủ đề!`);
      }

      sound.success();
      const shuffled = shuffle(currentCharacterPool);
      serverState.finishCounter = 0;
      serverState.players.forEach((p, idx) => {
        p.character = shuffled[idx % shuffled.length];
        p.hasGuessedCorrectly = false;
        p.questionsAskedCount = 0;
        p.finishRank = null;
      });

      serverState.state = 'PLAYING';
      serverState.turnIndex = 0;
      serverState.currentQuestion = null;
      serverState.lastTurnResult = null;
      resetTurnTimerDeadline();
      startHostAuthoritativeTimer();

      serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-emerald-900/80 text-emerald-300 text-[10px] font-bold mr-1">BẮT ĐẦU</span> Trận đấu bắt đầu! Lượt đầu: <b class="text-amber-400">${serverState.players[0].name}</b>.`);

      broadcastHostState();
    });
  }

  function restartNewGame() {
    if (!isHost || !serverState) return;
    sound.pop();
    serverState.state = 'LOBBY';
    serverState.currentQuestion = null;
    serverState.lastTurnResult = null;
    serverState.turnDeadline = null;
    serverState.finishCounter = 0;
    serverState.players.forEach(p => {
      p.character = null;
      p.hasGuessedCorrectly = false;
      p.questionsAskedCount = 0;
      p.finishRank = null;
      p.isSpectator = false;
    });
    serverState.logs.push(`<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold mr-1">VÁN MỚI</span> Phòng đang ở trạng thái chuẩn bị ván mới.`);
    const modalLeaderboard = document.getElementById('modal-leaderboard');
    if (modalLeaderboard) modalLeaderboard.classList.add('hidden');
    broadcastHostState();
  }

  if (btnRestartGame) btnRestartGame.addEventListener('click', restartNewGame);
  if (btnLeaderboardRestart) btnLeaderboardRestart.addEventListener('click', restartNewGame);

  if (btnSendQuestion && inputQuestion) {
    btnSendQuestion.addEventListener('click', () => {
      const q = inputQuestion.value.trim();
      if (!q) return;
      sound.pop();
      sendAction('ASK_QUESTION', { question: q });
      inputQuestion.value = '';
    });

    inputQuestion.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnSendQuestion.click();
    });
  }

  if (btnMakeGuess && inputGuessName) {
    btnMakeGuess.addEventListener('click', () => {
      const guess = inputGuessName.value.trim();
      if (!guess) return showToast('Vui lòng nhập tên nhân vật bạn muốn đoán!');
      sound.pop();
      sendAction('MAKE_GUESS', { guessedName: guess });
      inputGuessName.value = '';
    });

    inputGuessName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnMakeGuess.click();
    });
  }

  if (btnSkipTurn) {
    btnSkipTurn.addEventListener('click', () => {
      sound.pop();
      sendAction('NEXT_TURN');
    });
  }

  if (btnCancelVote && panelVoteConfirm) {
    btnCancelVote.addEventListener('click', () => {
      sound.pop();
      selectedVoteOption = null;
      document.querySelectorAll('.vote-opt-btn').forEach(btn => {
        btn.classList.remove('ring-2', 'ring-amber-400', 'ring-emerald-400', 'ring-rose-400');
      });
      panelVoteConfirm.classList.add('hidden');
    });
  }

  if (btnConfirmVote && panelVoteConfirm) {
    btnConfirmVote.addEventListener('click', () => {
      if (!selectedVoteOption || hasVotedCurrentQuestion) return;
      sound.pop();
      hasVotedCurrentQuestion = true;
      panelVoteConfirm.classList.add('hidden');
      setVoteButtonsDisabled(true);
      sendAction('SUBMIT_ANSWER', { answer: selectedVoteOption });
    });
  }
});
