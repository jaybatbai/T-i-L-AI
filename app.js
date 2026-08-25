// ==========================================
// CẤU HÌNH MẠNG P2P TOÀN CẦU (GOOGLE & CLOUDFLARE STUN)
// ==========================================
const PEER_CONFIG = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ],
    iceCandidatePoolSize: 10
  }
};

const ROOM_ID_PREFIX = 'wai-';

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

  playTone(freq, type, duration, gainVal = 0.1, delay = 0) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      setTimeout(() => {
        if (!this.ctx) return;
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
      }, delay);
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
      this.playTone(659.25, 'triangle', 0.15, 0.15, 100);
    }
    this.vibrate([120, 80, 120]);
  }

  success() {
    this.init();
    if (!this.muted && this.ctx) {
      this.playTone(587.33, 'triangle', 0.12, 0.15);
      this.playTone(880, 'triangle', 0.25, 0.2, 100);
    }
    this.vibrate([80, 60, 160]);
  }

  fail() {
    this.init();
    if (!this.muted && this.ctx) {
      this.playTone(220, 'sawtooth', 0.2, 0.15);
      this.playTone(174.61, 'sawtooth', 0.35, 0.15, 150);
    }
    this.vibrate(250);
  }

  pop() {
    this.playTone(400, 'sine', 0.05, 0.08);
  }

  victory(characterName = '') {
    this.init();
    this.vibrate([100, 50, 100, 50, 200]);
    if (this.muted || !this.ctx) return;

    const themeKey = getThemeKeyByCharacter(characterName);

    if (themeKey === 'ANIME') {
      const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51];
      notes.forEach((freq, idx) => {
        this.playTone(freq, 'square', 0.12, 0.1, idx * 80);
      });
    } else if (themeKey === 'HEROES') {
      const notes = [392, 523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        this.playTone(freq, 'sawtooth', 0.25, 0.12, idx * 110);
      });
    } else if (themeKey === 'MEME' || themeKey === 'STREAMER') {
      const notes = [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        this.playTone(freq, 'sine', 0.1, 0.12, idx * 70);
      });
    } else if (themeKey === 'CARTOON') {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      notes.forEach((freq, idx) => {
        this.playTone(freq, 'triangle', 0.22, 0.14, idx * 100);
      });
    } else {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        this.playTone(freq, 'triangle', 0.3, 0.15, idx * 120);
      });
    }
  }
}

const sound = new FeedbackEngine();

function getThemeKeyByCharacter(characterName) {
  if (!characterName) return 'SHOWBIZ';
  if (window.PRESET_THEMES) {
    for (const key of Object.keys(window.PRESET_THEMES)) {
      const list = window.PRESET_THEMES[key].list;
      if (list && list.some(name => name.toLowerCase() === characterName.toLowerCase())) {
        return key;
      }
    }
  }
  return 'SHOWBIZ';
}

// ==========================================
// KHỞI TẠO BIẾN TRẠNG THÁI & STORAGE
// ==========================================
const STORAGE_KEY_PRESETS = 'whoami_selected_preset_keys_v4';
const STORAGE_KEY_CUSTOM = 'whoami_custom_character_list_v4';
const STORAGE_KEY_SHEET_THEMES = 'whoami_sheet_themes_v4';
const STORAGE_KEY_NOTEPAD = 'whoami_private_notepad_content';
const SESSION_STORAGE_KEY = 'whoami_active_p2p_session';

let selectedPresetKeys = ['SHOWBIZ'];
let customCharacters = [];
let sheetThemes = {};
let currentCharacterPool = [];
let currentThemeName = 'Showbiz';
let searchQuery = '';

let hostTimerEnabled = true;
let hostTimerDuration = 45;

let hostMaxQuestionsEnabled = false;
let hostMaxQuestionsCount = 15;

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
let clientRetryTimer = null;
let clientTimeoutTimer = null;
let heartbeatInterval = null;

let localTimerInterval = null;
let hostAuthoritativeTimer = null;
let lastTickedSecond = null;
let lastRenderedQuestionKey = '';
let previousActivePlayerId = null;
let lastReactionTimestamp = 0;
let currentLogFilter = 'ALL';

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
// QUẢN LÝ KHO NHÂN VẬT & PRESET / GOOGLE SHEET THEMES
// ==========================================
function loadCharacterPool() {
  const savedPresets = localStorage.getItem(STORAGE_KEY_PRESETS);
  const savedCustom = localStorage.getItem(STORAGE_KEY_CUSTOM);
  const savedSheetThemes = localStorage.getItem(STORAGE_KEY_SHEET_THEMES);

  if (savedSheetThemes) {
    try {
      const parsed = JSON.parse(savedSheetThemes);
      if (typeof parsed === 'object' && parsed !== null) sheetThemes = parsed;
    } catch (e) {
      sheetThemes = {};
    }
  }

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
    } else if (sheetThemes && sheetThemes[key]) {
      combined.push(...sheetThemes[key].list);
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

  const names = selectedPresetKeys.map(k => {
    if (window.PRESET_THEMES && window.PRESET_THEMES[k]) return window.PRESET_THEMES[k].shortName;
    if (sheetThemes && sheetThemes[k]) return sheetThemes[k].shortName;
    return null;
  }).filter(Boolean);

  if (customCharacters.length > 0) names.push('Tự chọn');

  if (names.length === 0) {
    currentThemeName = 'Trống';
  } else if (names.length === 1) {
    currentThemeName = names[0];
  } else {
    currentThemeName = `${names[0]} (+${names.length - 1})`;
  }

  saveCharacterPool();
}

function saveCharacterPool() {
  localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(selectedPresetKeys));
  localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(customCharacters));
  localStorage.setItem(STORAGE_KEY_SHEET_THEMES, JSON.stringify(sheetThemes));
  updateCharacterVaultUI();
}

window.togglePresetTheme = function(presetKey) {
  const themeObj = (window.PRESET_THEMES && window.PRESET_THEMES[presetKey]) || sheetThemes[presetKey];
  if (!themeObj) return;

  const idx = selectedPresetKeys.indexOf(presetKey);
  if (idx > -1) {
    if (selectedPresetKeys.length === 1 && customCharacters.length === 0) {
      return showToast('Cần giữ ít nhất 1 chủ đề!');
    }
    selectedPresetKeys.splice(idx, 1);
    showToast(`Bỏ gói [${themeObj.shortName}]`);
  } else {
    selectedPresetKeys.push(presetKey);
    showToast(`Thêm gói [${themeObj.shortName}]`);
  }

  sound.pop();
  rebuildCharacterPool();
  renderModalPresetButtons();

  if (isHost && serverState) {
    serverState.currentThemeName = currentThemeName;
    broadcastHostState();
  }
};

window.deleteSheetTheme = function(themeId, event) {
  if (event) event.stopPropagation();
  const themeObj = sheetThemes[themeId];
  if (!themeObj) return;

  if (confirm(`Xóa toàn bộ gói chủ đề Sheet [${themeObj.shortName}]?`)) {
    sound.pop();
    delete sheetThemes[themeId];
    selectedPresetKeys = selectedPresetKeys.filter(k => k !== themeId);
    if (selectedPresetKeys.length === 0 && customCharacters.length === 0) {
      selectedPresetKeys = ['SHOWBIZ'];
    }
    rebuildCharacterPool();
    renderModalPresetButtons();
    showToast(`Đã xóa gói [${themeObj.shortName}]`);
  }
};

window.removeCharacter = function(index) {
  if (currentCharacterPool.length <= 2) {
    return showToast('Cần giữ lại ít nhất 2 nhân vật!');
  }
  sound.pop();
  const charToRemove = currentCharacterPool[index];
  customCharacters = customCharacters.filter(c => c.toLowerCase() !== charToRemove.toLowerCase());
  currentCharacterPool.splice(index, 1);
  saveCharacterPool();
};

// ==========================================
// PARSER CSV ĐA CỘT THÔNG MINH CHO GOOGLE SHEET
// ==========================================
function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentField = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(currentField.trim());
      if (row.some(field => field.length > 0)) {
        lines.push(row);
      }
      row = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField.length > 0 || row.length > 0) {
    row.push(currentField.trim());
    if (row.some(field => field.length > 0)) {
      lines.push(row);
    }
  }
  return lines;
}

// ==========================================
// TIỆN ÍCH CHUNG & TRẠNG THÁI LOADING
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
  }, 3200);
}

function setAuthButtonsLoading(loading, buttonType = 'JOIN', loadingText = '') {
  const btnJoin = document.getElementById('btn-join');
  const btnCreate = document.getElementById('btn-create');
  const inputName = document.getElementById('input-name');
  const inputRoomCode = document.getElementById('input-room-code');

  if (loading) {
    if (buttonType === 'JOIN' && btnJoin) {
      btnJoin.disabled = true;
      btnJoin.innerHTML = `<span class="inline-block animate-spin mr-1">🔄</span> ${loadingText || 'Đang kết nối...'}`;
    }
    if (buttonType === 'CREATE' && btnCreate) {
      btnCreate.disabled = true;
      btnCreate.innerHTML = `<span class="inline-block animate-spin mr-1">🔄</span> ${loadingText || 'Đang tạo phòng...'}`;
    }
    if (inputName) inputName.disabled = true;
    if (inputRoomCode) inputRoomCode.disabled = true;
  } else {
    if (btnJoin) {
      btnJoin.disabled = false;
      btnJoin.innerHTML = 'Vào phòng';
    }
    if (btnCreate) {
      btnCreate.disabled = false;
      btnCreate.innerHTML = 'Tạo phòng mới';
    }
    if (inputName) inputName.disabled = false;
    if (inputRoomCode) inputRoomCode.disabled = false;
  }
}

function copyRoomCode() {
  if (!currentRoomCode) return;
  sound.pop();
  navigator.clipboard.writeText(currentRoomCode).then(() => {
    showToast(`Đã sao chép mã: ${currentRoomCode}`);
  }).catch(() => {
    showToast(`Mã phòng: ${currentRoomCode}`);
  });
}

function generateRoomCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
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
  if (confirm('Bạn muốn rời khỏi phòng này?')) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (clientRetryTimer) clearTimeout(clientRetryTimer);
    if (clientTimeoutTimer) clearTimeout(clientTimeoutTimer);
    if (myPeer) {
      try { myPeer.destroy(); } catch (e) {}
    }
    clearSession();
    location.reload();
  }
};

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
// HỆ THỐNG BIỂU CẢM ĐỘNG (LIVE REACTIONS)
// ==========================================
window.triggerReaction = function(emoji) {
  const now = Date.now();
  if (now - lastReactionTimestamp < 300) return;
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

  const randomLeft = 15 + Math.random() * 70;
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
      <div class="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
        <span class="text-[11px] font-black uppercase tracking-wider text-indigo-300 block mb-2">${cat.name}</span>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          ${cat.list.map(q => `
            <button onclick="pickSuggestedQuestion('${q.replace(/'/g, "\\'")}')" class="text-left p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500 hover:bg-slate-850 text-xs font-semibold text-slate-200 transition active:scale-98 flex items-start justify-between gap-2 group">
              <span class="leading-relaxed break-words flex-grow">${q}</span>
              <span class="text-indigo-400 opacity-0 group-hover:opacity-100 transition text-xs flex-shrink-0 mt-0.5">➔</span>
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
  if (inputQuestion && !inputQuestion.disabled) {
    inputQuestion.value = questionText;
    inputQuestion.focus();
  }
  if (modalQuestionAssistant) {
    modalQuestionAssistant.classList.add('hidden');
  }
};

// ==========================================
// CÀI ĐẶT HOST: TIMER & MAX QUESTIONS
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
      btn.className = 'timer-btn py-1.5 rounded-xl border text-xs font-extrabold transition bg-amber-500/20 border-amber-400 text-amber-300 ring-1 ring-amber-400/40';
    } else {
      btn.className = 'timer-btn py-1.5 rounded-xl border text-xs font-extrabold transition bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600';
    }
  });
}

window.setMaxQuestionsCount = function(count) {
  if (!isHost) return;
  sound.pop();
  hostMaxQuestionsCount = count;
  updateMaxQuestionsPillsUI();

  if (serverState) {
    serverState.maxQuestionsCount = hostMaxQuestionsCount;
    broadcastHostState();
  }
};

function updateMaxQuestionsPillsUI() {
  document.querySelectorAll('.max-q-btn').forEach(btn => {
    const q = parseInt(btn.dataset.q, 10);
    if (q === hostMaxQuestionsCount) {
      btn.className = 'max-q-btn py-1.5 rounded-xl border text-xs font-extrabold transition bg-emerald-500/20 border-emerald-400 text-emerald-300 ring-1 ring-emerald-400/40';
    } else {
      btn.className = 'max-q-btn py-1.5 rounded-xl border text-xs font-extrabold transition bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600';
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
        addHostLog(`⏱️ <b>Hết giờ:</b> Kết thúc lượt biểu quyết`, { involvedIds: [activePlayer.id] });
        serverState.currentQuestion = null;
      } else {
        addHostLog(`⏱️ <b>Hết giờ:</b> <span class="text-amber-400">${activePlayer.name}</span> bị bỏ lượt`, { involvedIds: [activePlayer.id] });
      }

      advanceHostTurn();
      broadcastHostState();
    }
  }, 500);
}

function addHostLog(html, { authorId = null, involvedIds = [] } = {}) {
  if (!serverState) return;
  const logItem = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    html: html,
    authorId: authorId,
    involvedIds: Array.isArray(involvedIds) ? involvedIds : []
  };
  serverState.logs.push(logItem);
}

window.setLogFilter = function(filter) {
  sound.pop();
  currentLogFilter = filter;
  const tabAll = document.getElementById('tab-log-all');
  const tabMine = document.getElementById('tab-log-mine');

  if (filter === 'ALL') {
    if (tabAll) tabAll.className = 'px-2 py-0.5 rounded-lg bg-indigo-600 text-white transition';
    if (tabMine) tabMine.className = 'px-2 py-0.5 rounded-lg text-slate-400 hover:text-slate-200 transition';
  } else {
    if (tabAll) tabAll.className = 'px-2 py-0.5 rounded-lg text-slate-400 hover:text-slate-200 transition';
    if (tabMine) tabMine.className = 'px-2 py-0.5 rounded-lg bg-indigo-600 text-white transition';
  }

  renderLogsUI();
};

function renderLogsUI(logsData = null) {
  const gameLogs = document.getElementById('game-logs');
  if (!gameLogs) return;

  const logs = logsData || (serverState ? serverState.logs : []);
  if (!Array.isArray(logs)) return;

  let filtered = logs;
  if (currentLogFilter === 'MINE') {
    filtered = logs.filter(log => {
      if (typeof log === 'string') return true;
      return log.authorId === myId || (log.involvedIds && log.involvedIds.includes(myId));
    });
  }

  if (filtered.length === 0) {
    gameLogs.innerHTML = `<span class="text-xs text-slate-500 italic p-2 block text-center">Chưa có hoạt động nào...</span>`;
    return;
  }

  gameLogs.innerHTML = filtered.map(log => {
    const content = typeof log === 'string' ? log : log.html;
    return `
      <div class="py-1.5 px-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 leading-relaxed text-xs">
        ${content}
      </div>
    `;
  }).join('');
  gameLogs.scrollTop = gameLogs.scrollHeight;
}

// ==========================================
// LOGIC CHỦ PHÒNG (HOST ENGINE)
// ==========================================
function initHost(roomCode, playerName) {
  if (myPeer) {
    try { myPeer.destroy(); } catch (e) {}
  }
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  const cleanRoomCode = roomCode.trim().toUpperCase();
  const hostPeerId = `${ROOM_ID_PREFIX}${cleanRoomCode.toLowerCase()}`;
  
  myPeer = new Peer(hostPeerId, PEER_CONFIG);

  myPeer.on('open', (id) => {
    myId = id;
    isHost = true;
    currentRoomCode = cleanRoomCode;

    setAuthButtonsLoading(false);
    saveSession({ roomCode: cleanRoomCode, playerName, isHost: true });

    serverState = {
      code: cleanRoomCode,
      hostId: id,
      state: 'LOBBY',
      turnIndex: 0,
      currentThemeName: currentThemeName,
      timerEnabled: hostTimerEnabled,
      timerDuration: hostTimerDuration,
      maxQuestionsEnabled: hostMaxQuestionsEnabled,
      maxQuestionsCount: hostMaxQuestionsCount,
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
      logs: []
    };

    addHostLog(`🏠 <b>Phòng [${cleanRoomCode}]</b> đã tạo bởi <span class="text-amber-400">${playerName}</span>`, { authorId: id });

    enterLobbyUI(cleanRoomCode, true);
    broadcastHostState();
  });

  myPeer.on('connection', (conn) => {
    conn.on('open', () => {
      connectionsMap.set(conn.peer, conn);
      conn.send({ type: 'HANDSHAKE_ACK' });
    });

    conn.on('data', (data) => {
      if (data && data.type === 'PING') {
        conn.send({ type: 'PONG' });
        return;
      }
      handleClientAction(conn.peer, data);
    });

    conn.on('close', () => {
      connectionsMap.delete(conn.peer);
      handlePlayerDisconnect(conn.peer);
    });

    conn.on('error', (err) => {
      console.warn('Host Connection Error:', err);
    });
  });

  myPeer.on('disconnected', () => {
    if (myPeer && !myPeer.destroyed) {
      myPeer.reconnect();
    }
  });

  myPeer.on('error', (err) => {
    setAuthButtonsLoading(false);
    if (err.type === 'unavailable-id') {
      showToast('Mã phòng này đang kẹt tín hiệu, hãy bấm "Tạo phòng mới" lại để lấy mã khác nhé!');
      clearSession();
    } else {
      showToast('Lỗi máy chủ P2P: ' + err.type);
    }
  });
}

function handleClientAction(senderPeerId, data) {
  if (!serverState) return;
  const { type, payload } = data;

  if (type === 'SEND_REACTION') {
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

      addHostLog(`⚡ <b class="text-emerald-400">${payload.name}</b> đã quay lại phòng`, { authorId: senderPeerId });
      broadcastHostState();
      return;
    }
  }

  if (type === 'JOIN_REQUEST') {
    const isMidGame = serverState.state !== 'LOBBY';
    const isSpectator = isMidGame;

    const existingIdx = serverState.players.findIndex(p => p.id === senderPeerId);
    if (existingIdx === -1) {
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
        addHostLog(`👀 <b class="text-sky-400">${payload.name}</b> vào xem trận đấu`, { authorId: senderPeerId });
      } else {
        addHostLog(`👋 <b class="text-amber-400">${payload.name}</b> đã tham gia phòng`, { authorId: senderPeerId });
      }
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
      targetConn.send({ type: 'KICKED', message: 'Bạn đã bị Chủ phòng mời ra khỏi phòng!' });
      targetConn.close();
    }

    connectionsMap.delete(targetId);
    serverState.players = serverState.players.filter(p => p.id !== targetId);
    addHostLog(`🚪 Chủ phòng đã mời <b class="text-rose-400">${targetPlayer.name}</b> ra ngoài.`);

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
        addHostLog(`⚠️ Phòng không đủ người chơi, trở về sảnh chờ.`);
      }
    }

    broadcastHostState();
  }

  if (type === 'ASK_QUESTION') {
    const activePlayer = serverState.players[serverState.turnIndex];
    if (activePlayer.id !== senderPeerId || activePlayer.isSpectator) return;

    if (serverState.maxQuestionsEnabled && activePlayer.questionsAskedCount >= serverState.maxQuestionsCount) {
      return;
    }

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
    addHostLog(`❓ <b class="text-amber-400">${activePlayer.name}</b> hỏi: "${payload.question}"`, { authorId: activePlayer.id });
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
    addHostLog(`🎯 <b class="text-amber-400">${activePlayer.name}</b> đoán mình là: <b class="text-white">"${payload.guessedName}"</b>!`, { authorId: activePlayer.id });
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

        sound.victory(activePlayer.character);
        addHostLog(`🎉 <b>CHÍNH XÁC:</b> <b class="text-amber-400">${activePlayer.name}</b> đã tìm ra <b class="text-emerald-300">"${activePlayer.character}"</b>!`, { authorId: activePlayer.id });
        
        const activeMainPlayers = serverState.players.filter(p => !p.isSpectator);
        if (activeMainPlayers.every(p => p.hasGuessedCorrectly)) {
          serverState.state = 'ENDED';
          serverState.turnDeadline = null;
          addHostLog(`🏆 <b>Ván đấu hoàn tất!</b> Tất cả người chơi đã tìm ra nhân vật.`);
        }
      } else {
        sound.fail();
        addHostLog(`❌ <b>CHƯA ĐÚNG:</b> Câu đoán "${serverState.currentQuestion.text}" không chính xác.`, { authorId: activePlayer.id });
      }

      serverState.lastTurnResult = {
        type: 'GUESS',
        askedBy: activePlayer.name,
        question: `Đoán: "${serverState.currentQuestion.text}" (Nhân vật: ${activePlayer.character})`,
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

      addHostLog(`🗳️ <b>Kết quả [${activePlayer.name}]:</b> ${summary}`, { authorId: activePlayer.id, involvedIds: answeredKeys });
      
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
    addHostLog(`👉 <b>Lượt tiếp theo:</b> <b class="text-amber-400">${nextPlayer.name}</b>`, { authorId: nextPlayer.id });
  }
}

function handlePlayerDisconnect(peerId) {
  if (!serverState) return;

  const leaving = serverState.players.find(p => p.id === peerId);
  if (leaving) {
    addHostLog(`🔌 <b class="text-slate-400">${leaving.name}</b> mất kết nối.`);
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
      maxQuestionsEnabled: serverState.maxQuestionsEnabled,
      maxQuestionsCount: serverState.maxQuestionsCount,
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
// LOGIC THÀNH VIÊN (STABLE CONNECTION LOOP)
// ==========================================
function initClient(roomCode, playerName, isReconnect = false) {
  if (clientRetryTimer) clearTimeout(clientRetryTimer);
  if (clientTimeoutTimer) clearTimeout(clientTimeoutTimer);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (myPeer) {
    try { myPeer.destroy(); } catch (e) {}
  }

  const cleanRoomCode = roomCode.trim().toUpperCase();
  const hostPeerId = `${ROOM_ID_PREFIX}${cleanRoomCode.toLowerCase()}`;
  let attemptCount = 0;
  const maxAttempts = 6;
  let isConnected = false;

  setAuthButtonsLoading(true, 'JOIN', 'Đang kết nối...');

  clientTimeoutTimer = setTimeout(() => {
    if (!isConnected) {
      if (clientRetryTimer) clearTimeout(clientRetryTimer);
      setAuthButtonsLoading(false);
      showToast(`Không tìm thấy phòng [${cleanRoomCode}] hoặc Chủ phòng chưa sẵn sàng!`);
      clearSession();
    }
  }, 12000);

  myPeer = new Peer(PEER_CONFIG);

  myPeer.on('open', (id) => {
    myId = id;
    isHost = false;
    currentRoomCode = cleanRoomCode;

    connectLoop();
  });

  function connectLoop() {
    if (isConnected) return;
    attemptCount++;

    setAuthButtonsLoading(true, 'JOIN', `Đang tìm phòng (${attemptCount}/${maxAttempts})...`);

    if (hostConnection) {
      try { hostConnection.close(); } catch (e) {}
    }

    hostConnection = myPeer.connect(hostPeerId);

    hostConnection.on('open', () => {
      isConnected = true;
      if (clientRetryTimer) clearTimeout(clientRetryTimer);
      if (clientTimeoutTimer) clearTimeout(clientTimeoutTimer);

      setAuthButtonsLoading(false);
      saveSession({ roomCode: cleanRoomCode, playerName, isHost: false });
      showToast('Kết nối phòng thành công!');

      heartbeatInterval = setInterval(() => {
        if (hostConnection && hostConnection.open) {
          hostConnection.send({ type: 'PING' });
        }
      }, 3000);

      const actionType = isReconnect ? 'RECONNECT_REQUEST' : 'JOIN_REQUEST';
      hostConnection.send({
        type: actionType,
        payload: { name: playerName }
      });

      enterLobbyUI(cleanRoomCode, false);
    });

    hostConnection.on('data', (data) => {
      if (data && data.type === 'PONG') return;
      if (data && data.type === 'HANDSHAKE_ACK') {
        const actionType = isReconnect ? 'RECONNECT_REQUEST' : 'JOIN_REQUEST';
        hostConnection.send({
          type: actionType,
          payload: { name: playerName }
        });
        return;
      }

      if (data.type === 'STATE_UPDATE') {
        renderGameState(data.payload);
      } else if (data.type === 'BROADCAST_REACTION') {
        spawnFloatingEmoji(data.payload.emoji, data.payload.senderName);
      } else if (data.type === 'KICKED') {
        clearSession();
        alert(data.message || 'Bạn đã bị mời ra khỏi phòng!');
        location.reload();
      } else if (data.type === 'ERROR') {
        showToast(data.message);
      }
    });

    hostConnection.on('close', () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      showToast('Mất kết nối tới Chủ phòng!');
      clearSession();
      setTimeout(() => location.reload(), 2500);
    });
  }

  myPeer.on('error', (err) => {
    if (err.type === 'peer-unavailable' && !isConnected) {
      if (attemptCount < maxAttempts) {
        clientRetryTimer = setTimeout(() => {
          if (!isConnected && myPeer && !myPeer.destroyed) {
            connectLoop();
          }
        }, 1500);
      } else {
        if (clientTimeoutTimer) clearTimeout(clientTimeoutTimer);
        setAuthButtonsLoading(false);
        showToast(`Không tìm thấy phòng [${cleanRoomCode}], vui lòng kiểm tra lại mã!`);
        clearSession();
      }
    } else {
      if (clientTimeoutTimer) clearTimeout(clientTimeoutTimer);
      setAuthButtonsLoading(false);
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
  if (confirm(`Mời [${targetName}] ra khỏi phòng?`)) {
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
      pendingVoteLabel.className = 'font-black text-xs sm:text-sm ml-1 text-emerald-400';
    }
  } else if (answer === 'NO' || answer === 'WRONG') {
    const btn = document.getElementById(answer === 'NO' ? 'btn-vote-no' : 'btn-guess-wrong');
    if (btn) btn.classList.add('ring-2', 'ring-rose-400');
    if (pendingVoteLabel) {
      pendingVoteLabel.textContent = answer === 'NO' ? 'KHÔNG' : 'SAI RỒI';
      pendingVoteLabel.className = 'font-black text-xs sm:text-sm ml-1 text-rose-400';
    }
  } else {
    const btnVoteUnknown = document.getElementById('btn-vote-unknown');
    if (btnVoteUnknown) btnVoteUnknown.classList.add('ring-2', 'ring-amber-400');
    if (pendingVoteLabel) {
      pendingVoteLabel.textContent = 'KHÔNG RÕ';
      pendingVoteLabel.className = 'font-black text-xs sm:text-sm ml-1 text-slate-300';
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

  if (screenAuth) screenAuth.classList.add('hidden');
  if (screenLobby) screenLobby.classList.remove('hidden');
  if (btnToggleNotepad) btnToggleNotepad.classList.add('hidden');
  if (panelReactions) panelReactions.classList.add('hidden');
  if (lobbyRoomCode) lobbyRoomCode.textContent = roomCode;

  if (amIHost) {
    loadCharacterPool();
    updateCharacterVaultUI();
    updateTimerPillsUI();
    updateMaxQuestionsPillsUI();
    if (hostSettings) hostSettings.classList.remove('hidden');
    if (btnStartGame) btnStartGame.classList.remove('hidden');
    if (waitHostMsg) waitHostMsg.classList.add('hidden');
  } else {
    if (hostSettings) hostSettings.classList.add('hidden');
    if (btnStartGame) btnStartGame.classList.add('hidden');
    if (waitHostMsg) waitHostMsg.classList.remove('hidden');
  }
}

function updateCharacterVaultUI() {
  const lobbyCharCount = document.getElementById('lobby-char-count');
  const modalTotalChars = document.getElementById('modal-total-chars');
  const badgeCurrentTheme = document.getElementById('badge-current-theme');
  const modalCharTags = document.getElementById('modal-char-tags');

  if (lobbyCharCount) lobbyCharCount.textContent = currentCharacterPool.length;
  if (modalTotalChars) modalTotalChars.textContent = currentCharacterPool.length;
  if (badgeCurrentTheme) badgeCurrentTheme.textContent = currentThemeName;

  if (!modalCharTags) return;

  const filtered = currentCharacterPool.filter(c => 
    !searchQuery || c.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (filtered.length === 0) {
    modalCharTags.innerHTML = `<span class="text-xs text-slate-500 italic p-2">Không tìm thấy thẻ nào...</span>`;
    return;
  }

  modalCharTags.innerHTML = filtered.map((char) => {
    const realIndex = currentCharacterPool.indexOf(char);
    return `
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700/80 text-xs font-semibold text-slate-200">
        <span>${char}</span>
        <button onclick="removeCharacter(${realIndex})" class="text-slate-500 hover:text-rose-400 font-bold ml-1">✕</button>
      </span>
    `;
  }).join('');
}

function renderModalPresetButtons() {
  const modalPresetButtons = document.getElementById('modal-preset-buttons');
  if (!modalPresetButtons) return;

  const builtInHtml = window.PRESET_THEMES ? Object.keys(window.PRESET_THEMES).map(key => {
    const preset = window.PRESET_THEMES[key];
    const isSelected = selectedPresetKeys.includes(key);
    return `
      <button onclick="togglePresetTheme('${key}')" class="p-2.5 rounded-xl border text-xs font-bold transition text-left flex flex-col justify-between relative ${
        isSelected 
          ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-1 ring-amber-400/40 shadow-sm' 
          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600 hover:bg-slate-850 hover:text-slate-200'
      }">
        <div class="flex items-center justify-between w-full mb-0.5">
          <span class="truncate font-black text-xs">${preset.name}</span>
          <span class="text-[10px] ${isSelected ? 'text-amber-300' : 'text-transparent'}">✓</span>
        </div>
        <span class="text-[10px] ${isSelected ? 'text-amber-400/80 font-medium' : 'text-slate-500'}">${preset.list.length} tên</span>
      </button>
    `;
  }).join('') : '';

  const sheetKeys = Object.keys(sheetThemes);
  const sheetHtml = sheetKeys.map(key => {
    const theme = sheetThemes[key];
    const isSelected = selectedPresetKeys.includes(key);
    return `
      <button onclick="togglePresetTheme('${key}')" class="p-2.5 rounded-xl border text-xs font-bold transition text-left flex flex-col justify-between relative ${
        isSelected 
          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 ring-1 ring-cyan-400/40 shadow-sm' 
          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-cyan-500/50 hover:bg-slate-850 hover:text-slate-200'
      }">
        <div class="flex items-center justify-between w-full mb-0.5 gap-1">
          <span class="truncate font-black text-xs">${theme.name}</span>
          <div class="flex items-center gap-1 flex-shrink-0">
            <span class="text-[10px] ${isSelected ? 'text-cyan-300' : 'text-transparent'}">✓</span>
            <span onclick="deleteSheetTheme('${key}', event)" title="Xóa gói Sheet này" class="text-slate-500 hover:text-rose-400 font-bold px-1 rounded hover:bg-slate-800 transition">✕</span>
          </div>
        </div>
        <span class="text-[10px] ${isSelected ? 'text-cyan-400/90 font-medium' : 'text-slate-500'}">${theme.list.length} tên</span>
      </button>
    `;
  }).join('');

  modalPresetButtons.innerHTML = builtInHtml + sheetHtml;
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
  const badgeLobbyQuestions = document.getElementById('badge-lobby-questions');
  const screenAuth = document.getElementById('screen-auth');
  const screenLobby = document.getElementById('screen-lobby');
  const screenGame = document.getElementById('screen-game');
  const btnToggleNotepad = document.getElementById('btn-toggle-notepad');
  const panelReactions = document.getElementById('panel-reactions');
  const modalLeaderboard = document.getElementById('modal-leaderboard');
  const lobbyPlayerCount = document.getElementById('lobby-player-count');
  const lobbyPlayerList = document.getElementById('lobby-player-list');

  const gameRoomCode = document.getElementById('game-room-code');
  const gameQuestionsBadge = document.getElementById('game-questions-badge');
  const gameQuestionsText = document.getElementById('game-questions-text');
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
  const inputQuestion = document.getElementById('input-question');
  const btnSendQuestion = document.getElementById('btn-send-question');
  const btnOpenQuestionAssistant = document.getElementById('btn-open-question-assistant');
  const turnLimitWarning = document.getElementById('turn-limit-warning');

  const panelVoteConfirm = document.getElementById('panel-vote-confirm');
  const votePanelTitle = document.getElementById('vote-panel-title');
  const currentQuestionText = document.getElementById('current-question-text');
  const guessVerifyExtra = document.getElementById('guess-verify-extra');
  const guessRealCharName = document.getElementById('guess-real-char-name');
  const votingButtonsRegular = document.getElementById('voting-buttons-regular');
  const votingButtonsGuess = document.getElementById('voting-buttons-guess');
  const voteCounterBadge = document.getElementById('vote-counter-badge');
  const voteResults = document.getElementById('vote-results');

  if (data.currentThemeName && badgeCurrentTheme) {
    badgeCurrentTheme.textContent = data.currentThemeName;
  }

  if (badgeLobbyTimer) {
    if (data.timerEnabled) {
      badgeLobbyTimer.textContent = `⏱️ ${data.timerDuration}s`;
    } else {
      badgeLobbyTimer.textContent = '⏱️ Không giới hạn';
    }
  }

  if (badgeLobbyQuestions) {
    if (data.maxQuestionsEnabled) {
      badgeLobbyQuestions.textContent = `🎯 ${data.maxQuestionsCount} câu`;
    } else {
      badgeLobbyQuestions.textContent = '🎯 ∞ câu';
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
        <div class="bg-slate-950/80 border ${p.isYou ? 'border-indigo-500/80 ring-1 ring-indigo-500/30' : 'border-slate-800'} p-2.5 rounded-2xl flex items-center justify-between">
          <div class="flex items-center gap-1.5 overflow-hidden">
            <span class="font-extrabold text-xs sm:text-sm text-slate-100 truncate">${p.name}</span>
            ${p.isYou ? '<span class="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-bold text-[9px]">Bạn</span>' : ''}
            ${p.id === data.hostId ? '<span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold text-[9px]">Host</span>' : ''}
          </div>

          ${(data.isHost && p.id !== data.hostId) ? `
            <button onclick="kickPlayer('${p.id}', '${p.name}')" class="px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 rounded-lg text-[10px] font-bold transition flex-shrink-0">
              Đá
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

    if (gameQuestionsBadge && gameQuestionsText) {
      if (data.maxQuestionsEnabled && !amISpectator) {
        const used = me?.questionsAskedCount || 0;
        const max = data.maxQuestionsCount || 15;
        gameQuestionsBadge.classList.remove('hidden');
        gameQuestionsBadge.classList.add('flex');
        gameQuestionsText.textContent = `${used}/${max}`;
        if (used >= max) {
          gameQuestionsText.className = 'text-rose-400 font-mono font-black animate-pulse';
        } else {
          gameQuestionsText.className = 'text-emerald-400 font-mono font-black';
        }
      } else {
        gameQuestionsBadge.classList.add('hidden');
        gameQuestionsBadge.classList.remove('flex');
      }
    }

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
        turnBanner.textContent = 'Hoàn tất ván đấu';
        turnBanner.className = 'text-xs font-extrabold px-3 py-1 rounded-full bg-emerald-500 text-slate-950 shadow-md';
      }

      const sortedPlayers = [...data.players].filter(p => !p.isSpectator).sort((a, b) => {
        if (a.finishRank && b.finishRank) return a.finishRank - b.finishRank;
        if (a.finishRank) return -1;
        if (b.finishRank) return 1;
        return a.questionsAskedCount - b.questionsAskedCount;
      });

      if (leaderboardPlayerList) {
        leaderboardPlayerList.innerHTML = sortedPlayers.map((p, idx) => {
          let rankBadge = `<span class="w-5 text-center font-bold text-slate-500 text-xs">#${idx + 1}</span>`;
          if (p.finishRank === 1) rankBadge = `<span class="text-base">🥇</span>`;
          else if (p.finishRank === 2) rankBadge = `<span class="text-base">🥈</span>`;
          else if (p.finishRank === 3) rankBadge = `<span class="text-base">🥉</span>`;

          return `
            <div class="p-2.5 rounded-xl bg-slate-950/80 border ${p.isYou ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800'} flex items-center justify-between">
              <div class="flex items-center gap-2 overflow-hidden">
                ${rankBadge}
                <div class="overflow-hidden">
                  <div class="flex items-center gap-1">
                    <span class="font-black text-xs text-slate-100 truncate">${p.name}</span>
                    ${p.isYou ? '<span class="px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-bold text-[9px]">Bạn</span>' : ''}
                  </div>
                  <span class="text-[11px] text-emerald-400 font-bold block truncate">🎯 ${p.character}</span>
                </div>
              </div>

              <div class="text-right flex-shrink-0">
                <span class="text-xs font-black text-slate-200">${p.questionsAskedCount || 0} câu</span>
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
          turnBanner.textContent = `👀 Đang xem: ${activePlayer?.name || '...'}`;
          turnBanner.className = 'text-xs font-bold px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40';
        } else {
          turnBanner.textContent = isMyTurn ? 'LƯỢT CỦA BẠN' : `Lượt: ${activePlayer?.name || '...'}`;
          turnBanner.className = `text-xs font-bold px-3 py-1 rounded-full transition-all ${
            isMyTurn 
              ? 'bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-400/30' 
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
          <div class="relative border-2 ${cardBorderClass} backdrop-blur-md rounded-2xl p-2.5 sm:p-3 flex flex-col items-center text-center transition-all duration-300">
            
            ${(data.isHost && p.id !== data.hostId) ? `
              <button onclick="kickPlayer('${p.id}', '${p.name}')" title="Mời ra" class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white text-[9px] font-bold flex items-center justify-center transition border border-slate-700">
                ✕
              </button>
            ` : ''}

            <div class="w-full flex items-center justify-center gap-1 mb-1.5 pb-1.5 border-b border-slate-800 pr-3 pl-1">
              <span class="text-xs sm:text-sm font-black text-slate-100 truncate">
                ${p.name}
              </span>
              ${p.isSpectator ? '<span class="px-1 rounded bg-sky-500/20 text-sky-300 text-[8px] font-bold">Xem</span>' : ''}
              ${isSelf ? '<span class="px-1 rounded bg-indigo-500/20 text-indigo-300 text-[8px] font-bold">Bạn</span>' : ''}
              ${p.id === data.hostId ? '<span class="px-1 rounded bg-amber-500/20 text-amber-300 text-[8px] font-bold">Host</span>' : ''}
            </div>

            <div class="w-full py-2 px-1 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-center min-h-[46px] shadow-inner">
              <span class="font-extrabold text-xs sm:text-sm ${p.character === '???' ? 'text-amber-400 font-mono tracking-widest text-base' : (p.isSpectator ? 'text-slate-500 text-xs' : 'text-emerald-400')}">
                ${p.character}
              </span>
            </div>

            <div class="mt-1.5 text-[9px] sm:text-[10px] font-semibold text-slate-400 flex items-center gap-1">
              ${p.isSpectator 
                ? '<span class="text-sky-400">Khán giả</span>'
                : (p.hasGuessedCorrectly 
                  ? `<span class="text-emerald-400 font-bold">Đoán đúng (#${p.finishRank})</span>` 
                  : (p.character === '???' ? `<span class="text-slate-500">${data.maxQuestionsEnabled ? `${p.questionsAskedCount || 0}/${data.maxQuestionsCount} câu` : 'Mọi người thấy'}</span>` : '<span class="text-slate-400">Nhân vật</span>'))
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
          return `<span class="px-2 py-0.5 rounded-lg border ${badgeClass} text-[11px] font-semibold"><b class="text-amber-300">${voter?.name || '...'}:</b> ${label}</span>`;
        }).join('');
      }
    } else if (panelLastResult) {
      panelLastResult.classList.add('hidden');
    }

    if (panelMyTurn) {
      if (isMyTurn && data.state === 'PLAYING') {
        panelMyTurn.classList.remove('hidden');

        const isLimitReached = data.maxQuestionsEnabled && (me?.questionsAskedCount >= data.maxQuestionsCount);
        if (isLimitReached) {
          if (inputQuestion) {
            inputQuestion.disabled = true;
            inputQuestion.placeholder = 'Đã hết câu hỏi! Hãy chốt đoán tên hoặc bỏ lượt.';
          }
          if (btnSendQuestion) btnSendQuestion.disabled = true;
          if (btnOpenQuestionAssistant) btnOpenQuestionAssistant.disabled = true;
          if (turnLimitWarning) {
            turnLimitWarning.textContent = 'Hết lượt hỏi: Hãy chốt đoán tên';
            turnLimitWarning.className = 'text-[11px] text-rose-400 font-extrabold animate-pulse';
          }
        } else {
          if (inputQuestion) {
            inputQuestion.disabled = false;
            inputQuestion.placeholder = 'Hỏi một câu Có/Không (Ví dụ: Tôi có phải là diễn viên không?)...';
          }
          if (btnSendQuestion) btnSendQuestion.disabled = false;
          if (btnOpenQuestionAssistant) btnOpenQuestionAssistant.disabled = false;
          if (turnLimitWarning) {
            turnLimitWarning.textContent = 'Hỏi Có/Không hoặc đoán tên';
            turnLimitWarning.className = 'text-[11px] text-slate-400 font-medium';
          }
        }

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
          votePanelTitle.textContent = 'Biểu quyết câu đoán tên';
          votePanelTitle.className = 'text-xs font-black text-amber-400 uppercase tracking-wider animate-pulse';
        }
        if (currentQuestionText) {
          currentQuestionText.innerHTML = `<span class="text-slate-400 text-xs block mb-0.5"><b class="text-amber-400 font-bold">${data.currentQuestion.askedBy}</b> đoán mình là:</span> <span class="text-base sm:text-lg font-black text-white">"${data.currentQuestion.text}"</span>`;
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

      if (voteCounterBadge) voteCounterBadge.textContent = `${answerKeys.length}/${Math.max(1, totalVoters)} đã trả lời`;

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
            return `<span class="px-2 py-0.5 rounded-lg border ${badgeClass} text-[11px] font-semibold"><b class="text-amber-300">${voter?.name || '...'}:</b> ${label}</span>`;
          }).join('');
        } else {
          voteResults.innerHTML = '<span class="text-slate-500 italic text-[11px]">Đang chờ mọi người nhấn biểu quyết...</span>';
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

    renderLogsUI(data.logs);
  }
}

// ==========================================
// BINDING SỰ KIỆN DOM SAU KHI TẢI TRANG
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadCharacterPool();
  initNotepad();
  renderQuestionAssistant();

  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  const inputRoomCode = document.getElementById('input-room-code');
  const inputName = document.getElementById('input-name');

  if (roomParam && inputRoomCode) {
    const cleanParam = roomParam.trim().toUpperCase();
    inputRoomCode.value = cleanParam;
    if (inputName) inputName.focus();
    showToast(`Đã nhận diện phòng [${cleanParam}]`);
  }

  const existingSession = getSession();
  if (existingSession && existingSession.roomCode && existingSession.playerName) {
    showToast(`Đang kết nối lại [${existingSession.roomCode}]...`);
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

  const toggleMaxQuestions = document.getElementById('toggle-max-questions');
  const maxQuestionsOptionsContainer = document.getElementById('max-questions-options-container');

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
      if (confirm('Xóa sạch sổ ghi chú?')) {
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

  if (toggleMaxQuestions) {
    toggleMaxQuestions.addEventListener('change', (e) => {
      if (!isHost) return;
      sound.pop();
      hostMaxQuestionsEnabled = e.target.checked;

      if (maxQuestionsOptionsContainer) {
        if (hostMaxQuestionsEnabled) {
          maxQuestionsOptionsContainer.classList.remove('opacity-40', 'pointer-events-none');
        } else {
          maxQuestionsOptionsContainer.classList.add('opacity-40', 'pointer-events-none');
        }
      }

      if (serverState) {
        serverState.maxQuestionsEnabled = hostMaxQuestionsEnabled;
        broadcastHostState();
      }
    });
  }

  if (btnSelectAllPresets) {
    btnSelectAllPresets.addEventListener('click', () => {
      sound.pop();
      const allBuiltIn = window.PRESET_THEMES ? Object.keys(window.PRESET_THEMES) : [];
      const allSheets = Object.keys(sheetThemes);
      selectedPresetKeys = [...allBuiltIn, ...allSheets];
      rebuildCharacterPool();
      renderModalPresetButtons();
      showToast(`Đã chọn tất cả ${selectedPresetKeys.length} gói!`);
    });
  }

  if (btnDeselectAllPresets) {
    btnDeselectAllPresets.addEventListener('click', () => {
      sound.pop();
      if (customCharacters.length === 0) {
        selectedPresetKeys = ['SHOWBIZ'];
        showToast('Giữ lại gói Showbiz mặc định');
      } else {
        selectedPresetKeys = [];
        showToast('Đang dùng danh sách tự chọn');
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
      showToast(`Đã thêm ${addedCount} tên vào kho!`);
    } else {
      showToast('Nhân vật này đã có sẵn.');
    }
  }

  if (btnSyncSheet && inputSheetUrl) {
    btnSyncSheet.addEventListener('click', async () => {
      const url = inputSheetUrl.value.trim();
      if (!url) return showToast('Vui lòng dán liên kết Google Sheet!');

      const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) return showToast('Link Google Sheet không đúng định dạng!');

      const sheetId = match[1];
      const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
      const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv${gidParam}`;

      showToast('Đang tải các cột chủ đề...');

      try {
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error('Không thể tải');
        const text = await response.text();

        const grid = parseCSV(text);
        if (grid.length === 0) return showToast('Không tìm thấy dữ liệu trong bảng!');

        const headers = grid[0];
        let newThemesCount = 0;
        let totalNamesCount = 0;

        for (let col = 0; col < headers.length; col++) {
          let rawHeader = (headers[col] || '').trim();
          if (!rawHeader) rawHeader = `Chủ đề cột ${col + 1}`;

          const columnNames = [];
          for (let row = 1; row < grid.length; row++) {
            const cell = (grid[row][col] || '').trim();
            if (cell.length > 0 && !columnNames.some(c => c.toLowerCase() === cell.toLowerCase())) {
              columnNames.push(cell);
            }
          }

          if (columnNames.length > 0) {
            const themeKey = `SHEET_${rawHeader.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${col}`;
            sheetThemes[themeKey] = {
              id: themeKey,
              name: `🌐 ${rawHeader}`,
              shortName: rawHeader,
              list: columnNames
            };

            if (!selectedPresetKeys.includes(themeKey)) {
              selectedPresetKeys.push(themeKey);
            }

            newThemesCount++;
            totalNamesCount += columnNames.length;
          }
        }

        if (newThemesCount === 0) {
          return showToast('Không tìm thấy nhân vật nào dưới các cột chủ đề!');
        }

        sound.success();
        rebuildCharacterPool();
        renderModalPresetButtons();
        inputSheetUrl.value = '';
        showToast(`Nhập thành công ${newThemesCount} chủ đề (${totalNamesCount} nhân vật)!`);
      } catch (err) {
        showToast('Lỗi: Hãy đảm bảo Google Sheet đã bật xem công khai!');
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
      showToast('Đã lưu thiết lập kho!');
    });
  }

  if (btnExportChars) {
    btnExportChars.addEventListener('click', () => {
      sound.pop();
      const listStr = currentCharacterPool.join(', ');
      navigator.clipboard.writeText(listStr).then(() => {
        showToast('Đã sao chép danh sách vào Clipboard!');
      });
    });
  }

  if (btnResetDefaultChars) {
    btnResetDefaultChars.addEventListener('click', () => {
      if (confirm('Khôi phục lại gói Showbiz gốc & xóa các gói Sheet?')) {
        sound.pop();
        selectedPresetKeys = ['SHOWBIZ'];
        customCharacters = [];
        sheetThemes = {};
        searchQuery = '';
        if (inputSearchChar) inputSearchChar.value = '';
        rebuildCharacterPool();
        renderModalPresetButtons();
        showToast('Đã khôi phục mặc định.');
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
      setAuthButtonsLoading(true, 'CREATE', 'Đang tạo phòng...');
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
    inputRoomCode.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().trim();
    });
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
        return showToast('Cần ít nhất 2 người để bắt đầu!');
      }

      if (currentCharacterPool.length < serverState.players.length) {
        return showToast(`Kho nhân vật hiện có (${currentCharacterPool.length}) ít hơn số người chơi (${serverState.players.length}). Vui lòng chọn thêm gói!`);
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

      addHostLog(`🚀 <b>Trận đấu bắt đầu!</b> Lượt đầu: <b class="text-amber-400">${serverState.players[0].name}</b>`);

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
    addHostLog(`🔄 <b>Chuẩn bị ván mới</b>`);
    const modalLeaderboard = document.getElementById('modal-leaderboard');
    if (modalLeaderboard) modalLeaderboard.classList.add('hidden');
    broadcastHostState();
  }

  if (btnRestartGame) btnRestartGame.addEventListener('click', restartNewGame);
  if (btnLeaderboardRestart) btnLeaderboardRestart.addEventListener('click', restartNewGame);

  if (btnSendQuestion && inputQuestion) {
    btnSendQuestion.addEventListener('click', () => {
      const q = inputQuestion.value.trim();
      if (!q || inputQuestion.disabled) return;
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
      if (!guess) return showToast('Vui lòng nhập tên muốn đoán!');
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
