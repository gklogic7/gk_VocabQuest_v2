import { DICTIONARY_WORDS, STARTER_WORD_IDS } from './words.js';
import { EXPANSION_PACKS } from './wordPacks.js';

// Configuration & Default State
const STORAGE_KEY = 'vocabquest_offline_data_v1';
const CUSTOM_WORDS_KEY = 'vocabquest_custom_words_v1';
const REWARD_CONFIG = {
  perCorrect: 10,
  streakBonusCount: 5,
  streakBonusCoins: 20,
  perfectQuizBonus: 50
};

// Custom words imported by user or via word packs
let customWords = [];

// Merged active dictionary getter
export function getActiveDictionary() {
  const map = new Map();
  DICTIONARY_WORDS.forEach(w => map.set(w.id, w));
  customWords.forEach(w => map.set(w.id, w));
  return Array.from(map.values());
}

const ACHIEVEMENTS_DEF = [
  { id: 'first_word', title: 'Curious Explorer', desc: 'Inspect your first dictionary word.', icon: '🔍' },
  { id: 'first_quiz_correct', title: 'First Spark', desc: 'Answer your first quiz question correctly.', icon: '💡' },
  { id: 'first_unlock', title: 'Treasure Hunter', desc: 'Unlock your first word using coins.', icon: '🗝️' },
  { id: 'five_streak', title: 'On Fire', desc: 'Achieve a 5-question correct answer streak.', icon: '🔥' },
  { id: 'ten_unlocked', title: 'Vocabulary Beginner', desc: 'Unlock at least 25 words in your book.', icon: '📚' },
  { id: 'perfect_quiz', title: 'Flawless Mind', desc: 'Score a perfect 10/10 in a quiz session.', icon: '⭐' },
  { id: 'quiz_master', title: 'Quiz Master', desc: 'Complete 10 vocabulary quizzes.', icon: '🏆' },
  { id: 'rich_scholar', title: 'Wealth of Words', desc: 'Accumulate over 250 coins in balance.', icon: '👑' },
  { id: 'audiophile', title: 'Active Listener', desc: 'Listen to 5 word pronunciations.', icon: '🔊' }
];

// App State
let state = {
  coins: 100,
  unlockedWords: [...STARTER_WORD_IDS],
  bookmarks: [],
  pronunciationsCount: 0,
  theme: 'light',
  stats: {
    totalQuizzes: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
    incorrectAnswers: 0,
    totalCoinsEarned: 0,
    totalCoinsSpent: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastActiveDate: new Date().toISOString().slice(0, 10),
    dailyStreak: 1
  },
  quizHistory: [],
  unlockedAchievements: []
};

// Runtime session state
let currentView = 'home';
let currentSearch = '';
let currentLetter = 'ALL';
let currentCategory = 'ALL';
let currentDifficulty = 'ALL';
let bookFilter = 'ALL'; // ALL, UNLOCKED, LOCKED

let activeWordModal = null;
let pendingUnlockWord = null;

// Quiz Runtime State
let activeQuiz = null;

// Load State from LocalStorage
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.coins === 'number') {
        state = {
          ...state,
          ...parsed,
          unlockedWords: Array.from(new Set([...STARTER_WORD_IDS, ...(parsed.unlockedWords || [])])),
          stats: { ...state.stats, ...(parsed.stats || {}) }
        };
      }
    }

    const rawCustom = localStorage.getItem(CUSTOM_WORDS_KEY);
    if (rawCustom) {
      const parsedCustom = JSON.parse(rawCustom);
      if (Array.isArray(parsedCustom)) {
        customWords = parsedCustom;
      }
    }
  } catch (err) {
    console.warn('Could not load saved state, using default', err);
  }
  
  // Calculate daily streak
  checkDailyStreak();
  applyTheme(state.theme);
}

// Function to import words list into application
export function importWords(rawWordsList, autoUnlock = true) {
  if (!Array.isArray(rawWordsList) || rawWordsList.length === 0) {
    showToast('No valid words found to import.', 'error');
    return 0;
  }

  let importedCount = 0;
  const existingMap = new Map();
  getActiveDictionary().forEach(w => existingMap.set(w.id, w));

  const validNewWords = [];
  const newUnlockedIds = [];

  rawWordsList.forEach((item) => {
    if (!item) return;
    const rawWord = item.word || item.name || item.term;
    if (!rawWord || typeof rawWord !== 'string') return;
    const cleanWord = rawWord.trim();
    if (!cleanWord) return;

    const id = (item.id || cleanWord).toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    const wordEntry = {
      id: id,
      word: cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1),
      phonetic: item.phonetic || `/${cleanWord.toLowerCase()}/`,
      pos: item.pos || item.partOfSpeech || 'noun',
      simpleDef: item.simpleDef || item.def || item.definition || 'A defined term in the vocabulary database.',
      detailedDef: item.detailedDef || item.detailed || item.simpleDef || item.definition || 'Comprehensive lexical explanation of word meaning and usage.',
      example: item.example || item.sentence || `The author skillfully utilized the word "${cleanWord}" in context.`,
      synonyms: Array.isArray(item.synonyms) ? item.synonyms : (item.synonyms ? [item.synonyms] : ["equivalent", "similar term"]),
      difficulty: ['easy', 'medium', 'hard'].includes(item.difficulty) ? item.difficulty : 'medium',
      category: item.category || 'Advanced Vocabulary',
      price: typeof item.price === 'number' ? item.price : 40
    };

    if (!existingMap.has(wordEntry.id)) {
      validNewWords.push(wordEntry);
      existingMap.set(wordEntry.id, wordEntry);
      if (autoUnlock) {
        newUnlockedIds.push(wordEntry.id);
      }
      importedCount++;
    }
  });

  if (importedCount === 0) {
    showToast('All words in this pack are already present in your dictionary.', 'info');
    return 0;
  }

  customWords = [...customWords, ...validNewWords];
  try {
    localStorage.setItem(CUSTOM_WORDS_KEY, JSON.stringify(customWords));
  } catch (err) {
    console.error('Failed to save custom words', err);
  }

  if (autoUnlock && newUnlockedIds.length > 0) {
    state.unlockedWords = Array.from(new Set([...state.unlockedWords, ...newUnlockedIds]));
  }

  saveState();
  checkAchievements();

  showToast(`🎉 Successfully imported ${importedCount} words into your dictionary!`, 'success');
  updateImportModalFooter();

  // Re-render active view
  if (currentView === 'home') renderHome();
  else if (currentView === 'dictionary') renderDictionary();
  else if (currentView === 'book') renderBook();
  else if (currentView === 'progress') renderProgress();

  return importedCount;
}

export function parsePastedWordsText(text) {
  text = text.trim();
  if (!text) return [];

  // Try JSON first
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (typeof parsed === 'object') {
        return Object.entries(parsed).map(([word, val]) => {
          if (typeof val === 'string') {
            return { word, simpleDef: val };
          } else if (typeof val === 'object' && val !== null) {
            return { word, ...val };
          }
          return { word, simpleDef: String(val) };
        });
      }
    } catch (e) {
      // Fall through to line parser
    }
  }

  // Parse plain text lines
  const lines = text.split('\n');
  const results = [];

  lines.forEach(line => {
    line = line.trim();
    if (!line) return;

    let sep = line.indexOf(':');
    if (sep === -1) sep = line.indexOf(' - ');
    if (sep === -1) sep = line.indexOf(' = ');

    if (sep !== -1) {
      const word = line.slice(0, sep).trim();
      const def = line.slice(sep + (line[sep] === ':' ? 1 : 3)).trim();
      if (word && def) {
        results.push({ word, simpleDef: def });
      }
    } else {
      const word = line.trim();
      if (word && word.length < 35 && !word.includes(' ')) {
        results.push({ word, simpleDef: `Vocabulary entry for ${word}.` });
      }
    }
  });

  return results;
}

function updateImportModalFooter() {
  const countEl = document.getElementById('import-modal-current-count');
  if (countEl) {
    const total = getActiveDictionary().length;
    countEl.textContent = `Active Dictionary: ${total} words (${DICTIONARY_WORDS.length} built-in, ${customWords.length} custom imported)`;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save state to localStorage', err);
  }
  updateHeaderStats();
}

function checkDailyStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (!state.stats.lastActiveDate) {
    state.stats.lastActiveDate = today;
    state.stats.dailyStreak = 1;
    return;
  }
  
  if (state.stats.lastActiveDate !== today) {
    const lastDate = new Date(state.stats.lastActiveDate);
    const currentDate = new Date(today);
    const diffDays = Math.round((currentDate - lastDate) / (1000 * 3600 * 24));
    
    if (diffDays === 1) {
      state.stats.dailyStreak += 1;
    } else if (diffDays > 1) {
      state.stats.dailyStreak = 1;
    }
    state.stats.lastActiveDate = today;
  }
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const themeText = document.getElementById('theme-toggle-text');
  if (themeText) {
    themeText.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  }
}

// Notification Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️'}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

// Achievement Checker
function checkAchievements() {
  const newUnlocks = [];
  
  function grant(id) {
    if (!state.unlockedAchievements.includes(id)) {
      state.unlockedAchievements.push(id);
      const def = ACHIEVEMENTS_DEF.find(a => a.id === id);
      if (def) {
        newUnlocks.push(def);
      }
    }
  }

  if (state.stats.correctAnswers >= 1) grant('first_quiz_correct');
  if (state.stats.totalCoinsSpent > 0) grant('first_unlock');
  if (state.stats.bestStreak >= 5) grant('five_streak');
  if (state.unlockedWords.length >= 25) grant('ten_unlocked');
  if (state.stats.totalQuizzes >= 10) grant('quiz_master');
  if (state.coins >= 250) grant('rich_scholar');
  if (state.pronunciationsCount >= 5) grant('audiophile');

  if (newUnlocks.length > 0) {
    saveState();
    newUnlocks.forEach(ach => {
      showToast(`🏆 Achievement Unlocked: ${ach.title}!`, 'success');
    });
  }
}

// Web Speech API Voice Initialization & Pronunciation Controller
let preferredVoice = null;
let currentSpeakingText = null;

function initVoices() {
  if (!('speechSynthesis' in window)) return;
  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;
    // Find natural English voice if possible
    preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Karen') || v.name.includes('Oliver')))
      || voices.find(v => v.lang === 'en-US')
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0];
  };

  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}
initVoices();

function clearSpeakingState() {
  currentSpeakingText = null;
  document.querySelectorAll('.is-speaking').forEach(el => el.classList.remove('is-speaking'));
}

// Pronunciation with Web Speech API
function speakWord(text, triggerEl = null) {
  if (!('speechSynthesis' in window)) {
    showToast('Web Speech API is not supported in this browser.', 'info');
    return;
  }

  // If already speaking the same text, toggle off
  if (window.speechSynthesis.speaking && currentSpeakingText === text) {
    window.speechSynthesis.cancel();
    clearSpeakingState();
    return;
  }

  window.speechSynthesis.cancel();
  clearSpeakingState();

  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.88; // Clear, deliberate speed ideal for vocabulary study
  utterance.pitch = 1.0;

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  } else {
    initVoices();
    if (preferredVoice) utterance.voice = preferredVoice;
  }

  currentSpeakingText = text;

  // Add animated visual feedback to the triggering button and any matching buttons
  const applySpeakingClass = () => {
    if (triggerEl) triggerEl.classList.add('is-speaking');
    document.querySelectorAll(`[data-speak-text="${CSS.escape(text)}"]`).forEach(el => {
      el.classList.add('is-speaking');
    });
  };

  applySpeakingClass();

  utterance.onstart = () => {
    applySpeakingClass();
  };

  const finishSpeaking = () => {
    clearSpeakingState();
  };

  utterance.onend = finishSpeaking;
  utterance.onerror = finishSpeaking;

  window.speechSynthesis.speak(utterance);

  state.pronunciationsCount = (state.pronunciationsCount || 0) + 1;
  checkAchievements();
  saveState();
}

// Navigation View Handler
function switchView(viewName) {
  currentView = viewName;
  
  // Update view containers
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  // Update nav buttons
  document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Render view content
  if (viewName === 'home') renderHome();
  else if (viewName === 'dictionary') renderDictionary();
  else if (viewName === 'book') renderBook();
  else if (viewName === 'quiz') renderQuizSetup();
  else if (viewName === 'progress') renderProgress();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Update Header Badges
function updateHeaderStats() {
  const coinBadges = document.querySelectorAll('.header-coin-val');
  coinBadges.forEach(el => el.textContent = state.coins.toLocaleString());

  const streakBadges = document.querySelectorAll('.header-streak-val');
  streakBadges.forEach(el => el.textContent = `${state.stats.dailyStreak}d`);
}

// --- VIEW 1: HOME ---
function renderHome() {
  const container = document.getElementById('home-content');
  if (!container) return;

  const allWords = getActiveDictionary();
  const totalWords = allWords.length;
  const unlockedCount = state.unlockedWords.length;
  const accuracy = state.stats.questionsAnswered > 0 
    ? Math.round((state.stats.correctAnswers / state.stats.questionsAnswered) * 100) 
    : 0;

  // Pick Word of the Day (seeded by date for consistency)
  const todayNum = new Date().getDate();
  const wotd = allWords[todayNum % allWords.length] || allWords[0];
  const isWotdUnlocked = state.unlockedWords.includes(wotd.id);

  // Recently unlocked words
  const recentUnlocked = state.unlockedWords.slice(-4).reverse().map(id => allWords.find(w => w.id === id)).filter(Boolean);

  container.innerHTML = `
    <div class="dashboard-grid">
      <div class="dash-left-column">
        <!-- Hero: Word of the Day -->
        <div class="hero-card">
          <span class="hero-tag">🌟 Word of the Day</span>
          <h2 class="hero-word-title">${wotd.word}</h2>
          <p class="hero-phonetic">${wotd.phonetic} · <span style="text-transform: capitalize;">${wotd.pos}</span></p>
          <p class="hero-def">${isWotdUnlocked ? wotd.simpleDef : '🔒 This word is locked in your dictionary book. Unlock it or test your knowledge in the quiz!'}</p>
          <div class="hero-actions">
            <button class="btn-white speaker-hero-btn" data-speak-text="${wotd.word}" id="home-wotd-speak" aria-label="Listen to pronunciation of ${wotd.word}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path class="sound-wave sound-wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                <path class="sound-wave sound-wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
              </svg>
              <span>Pronounce</span>
            </button>
            <button class="btn-outline-white" id="home-wotd-view">
              ${isWotdUnlocked ? 'View Full Entry' : `Unlock (${wotd.price} Coins)`}
            </button>
          </div>
        </div>

        <!-- Quick Stats Row -->
        <div class="dash-stats-row">
          <div class="stat-card">
            <span class="stat-card-label">Unlocked Words</span>
            <div class="stat-card-val">${unlockedCount} <span style="font-size: 1rem; color: var(--text-muted); font-weight: 500;">/ ${totalWords}</span></div>
            <div class="stat-card-sub">${Math.round((unlockedCount / totalWords) * 100)}% of Dictionary unlocked</div>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">Quiz Accuracy</span>
            <div class="stat-card-val">${accuracy}%</div>
            <div class="stat-card-sub">${state.stats.correctAnswers} correct of ${state.stats.questionsAnswered} answered</div>
          </div>
          <div class="stat-card">
            <span class="stat-card-label">Daily Streak</span>
            <div class="stat-card-val">${state.stats.dailyStreak} <span style="font-size: 1rem; color: var(--text-muted); font-weight: 500;">days</span></div>
            <div class="stat-card-sub">Best Streak: ${state.stats.bestStreak} in a row</div>
          </div>
        </div>

        <!-- Quick Action Cards -->
        <div class="quick-cards-grid">
          <div class="action-card">
            <div>
              <h3>Vocabulary Quiz</h3>
              <p>Test your memory, earn coins, and test 4 question types with immediate rewards.</p>
            </div>
            <button class="btn-primary" id="home-start-quiz-btn">Start Random Quiz</button>
          </div>
          <div class="action-card">
            <div>
              <h3>Dictionary Book</h3>
              <p>Explore your locked treasure words and invest coins to unlock full definitions.</p>
            </div>
            <button class="btn-secondary" id="home-open-book-btn">Open Word Book</button>
          </div>
        </div>
      </div>

      <!-- Right Column: Learning Progress & Recent -->
      <div class="dash-right-column">
        <!-- Daily Challenge Card -->
        <div class="side-card">
          <h3 class="side-card-title">
            <span>🎯 Daily Challenge</span>
            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">Active</span>
          </h3>
          <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 12px;">Answer 5 quiz questions today to sharpen your vocabulary and earn bonus coins!</p>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${Math.min(100, (state.stats.questionsAnswered % 10) * 10)}%;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.775rem; color: var(--text-muted); margin-top: 6px;">
            <span>Target: 10 Questions</span>
            <span>+30 Bonus Coins</span>
          </div>
        </div>

        <!-- Collection Progress -->
        <div class="side-card">
          <h3 class="side-card-title">Book Completion</h3>
          <div class="progress-track" style="height: 10px;">
            <div class="progress-fill" style="width: ${(unlockedCount / totalWords) * 100}%;"></div>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px;">
            ${unlockedCount} words unlocked · ${totalWords - unlockedCount} words remaining in the vault
          </p>
        </div>

        <!-- Recently Unlocked -->
        <div class="side-card">
          <h3 class="side-card-title">Recently Unlocked</h3>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${recentUnlocked.map(w => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: var(--bg-subtle); border-radius: var(--radius-md); font-size: 0.875rem; cursor: pointer;" onclick="window.viewWordModal('${w.id}')">
                <span style="font-weight: 600;">${w.word}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">${w.category}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach Home events
  const wotdSpeakBtn = document.getElementById('home-wotd-speak');
  wotdSpeakBtn?.addEventListener('click', () => speakWord(wotd.word, wotdSpeakBtn));
  document.getElementById('home-wotd-view')?.addEventListener('click', () => {
    if (isWotdUnlocked) {
      openWordDetailModal(wotd);
    } else {
      promptUnlockWord(wotd);
    }
  });
  document.getElementById('home-start-quiz-btn')?.addEventListener('click', () => switchView('quiz'));
  document.getElementById('home-open-book-btn')?.addEventListener('click', () => switchView('book'));
}

// --- VIEW 2: DICTIONARY ---
function renderDictionary() {
  const container = document.getElementById('dictionary-content');
  if (!container) return;

  const allWords = getActiveDictionary();

  // Filter words
  let filtered = allWords.filter(w => {
    // Search query matches word or synonym
    const matchesSearch = !currentSearch || 
      w.word.toLowerCase().includes(currentSearch.toLowerCase()) || 
      w.synonyms.some(s => s.toLowerCase().includes(currentSearch.toLowerCase()));
    
    // Letter filter
    const matchesLetter = currentLetter === 'ALL' || w.word.toUpperCase().startsWith(currentLetter);

    // Category filter
    const matchesCat = currentCategory === 'ALL' || w.category === currentCategory;

    // Difficulty filter
    const matchesDiff = currentDifficulty === 'ALL' || w.difficulty === currentDifficulty;

    return matchesSearch && matchesLetter && matchesCat && matchesDiff;
  });

  const categories = Array.from(new Set(allWords.map(w => w.category)));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Dictionary</h2>
        <p class="section-desc">Search, browse, and master words. Locked words require unlocking in the Book.</p>
      </div>
      <div style="font-size: 0.875rem; color: var(--text-muted); font-weight: 600;">
        Showing ${filtered.length} of ${allWords.length} words
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="filter-group">
        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Category:</label>
        <select class="select-control" id="dict-category-select">
          <option value="ALL">All Categories</option>
          ${categories.map(c => `<option value="${c}" ${currentCategory === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        
        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted); margin-left: 8px;">Difficulty:</label>
        <select class="select-control" id="dict-difficulty-select">
          <option value="ALL" ${currentDifficulty === 'ALL' ? 'selected' : ''}>All Difficulties</option>
          <option value="easy" ${currentDifficulty === 'easy' ? 'selected' : ''}>Easy</option>
          <option value="medium" ${currentDifficulty === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="hard" ${currentDifficulty === 'hard' ? 'selected' : ''}>Hard</option>
        </select>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" id="dict-reset-filters">Reset Filters</button>
      </div>
    </div>

    <!-- Alphabet Bar -->
    <div class="alphabet-bar">
      <button class="letter-btn ${currentLetter === 'ALL' ? 'active' : ''}" data-letter="ALL">ALL</button>
      ${letters.map(l => `<button class="letter-btn ${currentLetter === l ? 'active' : ''}" data-letter="${l}">${l}</button>`).join('')}
    </div>

    <!-- Words Grid -->
    ${filtered.length === 0 ? `
      <div class="empty-state">
        <h3>No words found</h3>
        <p>No dictionary entries match your active filters or search terms.</p>
        <button class="btn-secondary" id="empty-clear-btn">Clear Filters</button>
      </div>
    ` : `
      <div class="words-grid">
        ${filtered.map(w => {
          const isUnlocked = state.unlockedWords.includes(w.id);
          const isBookmarked = state.bookmarks.includes(w.id);
          return `
            <div class="word-card ${isUnlocked ? '' : 'locked'}">
              <div>
                <div class="word-card-top">
                  <span class="diff-tag diff-${w.difficulty}">${w.difficulty.toUpperCase()}</span>
                  ${isUnlocked ? `
                    <button class="bookmark-icon-btn ${isBookmarked ? 'active' : ''}" title="Bookmark" onclick="window.toggleBookmark('${w.id}')">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                    </button>
                  ` : `
                    <span style="font-size: 0.75rem; color: #b47a08; font-weight: 700;">🔒 LOCKED</span>
                  `}
                </div>
                <div class="word-card-title">
                  <span>${w.word}</span>
                  ${isUnlocked ? `
                    <button class="speaker-icon-btn" data-speak-text="${w.word}" title="Listen to pronunciation of ${w.word}" aria-label="Listen to pronunciation of ${w.word}" onclick="event.stopPropagation(); window.speakWord('${w.word}', this)">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path class="sound-wave sound-wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        <path class="sound-wave sound-wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                      </svg>
                    </button>
                  ` : ''}
                </div>
                <div class="word-meta-row">
                  <span>${w.pos}</span> · <span>${w.category}</span>
                </div>
                ${isUnlocked ? `
                  <div class="word-card-phonetic">${w.phonetic}</div>
                  <div class="word-card-def">${w.simpleDef}</div>
                ` : `
                  <div class="word-card-def" style="font-style: italic; color: var(--text-faint);">
                    Definition locked. Unlock this word in your Dictionary Book to reveal its meaning, pronunciation, and examples.
                  </div>
                `}
              </div>
              <div class="word-card-footer">
                ${isUnlocked ? `
                  <button class="btn-secondary" style="width: 100%; justify-content: center;" onclick="window.viewWordModal('${w.id}')">View Details</button>
                ` : `
                  <button class="locked-price-btn" onclick="window.promptUnlock('${w.id}')">
                    <span>Unlock for</span>
                    <span class="coin-icon">¢</span>
                    <span>${w.price} Coins</span>
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;

  // Attach Dictionary Events
  document.getElementById('dict-category-select')?.addEventListener('change', e => {
    currentCategory = e.target.value;
    renderDictionary();
  });

  document.getElementById('dict-difficulty-select')?.addEventListener('change', e => {
    currentDifficulty = e.target.value;
    renderDictionary();
  });

  document.getElementById('dict-reset-filters')?.addEventListener('click', () => {
    currentCategory = 'ALL';
    currentDifficulty = 'ALL';
    currentLetter = 'ALL';
    currentSearch = '';
    const topInput = document.getElementById('global-search-input');
    if (topInput) topInput.value = '';
    renderDictionary();
  });

  document.getElementById('empty-clear-btn')?.addEventListener('click', () => {
    currentCategory = 'ALL';
    currentDifficulty = 'ALL';
    currentLetter = 'ALL';
    currentSearch = '';
    renderDictionary();
  });

  document.querySelectorAll('.letter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentLetter = btn.dataset.letter;
      renderDictionary();
    });
  });
}

// --- VIEW 3: DICTIONARY BOOK (UNLOCK SYSTEM) ---
function renderBook() {
  const container = document.getElementById('book-content');
  if (!container) return;

  const allWords = getActiveDictionary();
  const totalWords = allWords.length;
  const unlockedCount = state.unlockedWords.length;

  let filtered = allWords.filter(w => {
    const isUnlocked = state.unlockedWords.includes(w.id);
    if (bookFilter === 'UNLOCKED') return isUnlocked;
    if (bookFilter === 'LOCKED') return !isUnlocked;
    return true;
  });

  if (currentSearch) {
    filtered = filtered.filter(w => w.word.toLowerCase().includes(currentSearch.toLowerCase()));
  }

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Dictionary Book & Unlock Vault</h2>
        <p class="section-desc">Earn coins in the quiz arena to permanently unlock new vocabulary entries.</p>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn-secondary ${bookFilter === 'ALL' ? 'active' : ''}" id="book-tab-all" style="font-size: 0.85rem;">All (${totalWords})</button>
        <button class="btn-secondary ${bookFilter === 'UNLOCKED' ? 'active' : ''}" id="book-tab-unlocked" style="font-size: 0.85rem;">Unlocked (${unlockedCount})</button>
        <button class="btn-secondary ${bookFilter === 'LOCKED' ? 'active' : ''}" id="book-tab-locked" style="font-size: 0.85rem;">Locked (${totalWords - unlockedCount})</button>
      </div>
    </div>

    <div class="filter-bar" style="margin-bottom: 20px;">
      <div style="font-size: 0.9rem; font-weight: 600;">
        Current Coin Balance: <span style="color: var(--accent-coin); font-weight: 800;">${state.coins} Coins</span>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-muted);">
        Unlock prices: Easy = 20-25 ¢ · Medium = 35-45 ¢ · Hard = 60-70 ¢
      </div>
    </div>

    <div class="words-grid">
      ${filtered.map(w => {
        const isUnlocked = state.unlockedWords.includes(w.id);
        return `
          <div class="word-card ${isUnlocked ? '' : 'locked'}">
            <div>
              <div class="word-card-top">
                <span class="diff-tag diff-${w.difficulty}">${w.difficulty.toUpperCase()}</span>
                <span style="font-size: 0.775rem; font-weight: 700; color: ${isUnlocked ? 'var(--success)' : '#b47a08'};">
                  ${isUnlocked ? '✓ UNLOCKED' : '🔒 LOCKED'}
                </span>
              </div>
              <div class="word-card-title">
                ${isUnlocked ? `
                  <span>${w.word}</span>
                  <button class="speaker-icon-btn" data-speak-text="${w.word}" title="Listen to pronunciation of ${w.word}" aria-label="Listen to pronunciation of ${w.word}" onclick="event.stopPropagation(); window.speakWord('${w.word}', this)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path class="sound-wave sound-wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                      <path class="sound-wave sound-wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                    </svg>
                  </button>
                ` : `<span>${w.word.charAt(0)}${'•'.repeat(w.word.length - 2)}${w.word.slice(-1)}</span>`}
              </div>
              <div class="word-meta-row">
                <span>${w.category}</span> · <span>${w.pos}</span>
              </div>
              <div class="word-card-def">
                ${isUnlocked ? w.simpleDef : `Locked entry. Redeem ${w.price} coins to unlock full definitions, phonetics, and usage.`}
              </div>
            </div>
            <div class="word-card-footer">
              ${isUnlocked ? `
                <button class="btn-secondary" style="width: 100%; justify-content: center;" onclick="window.viewWordModal('${w.id}')">Read Entry</button>
              ` : `
                <button class="locked-price-btn" onclick="window.promptUnlock('${w.id}')">
                  <span>Unlock for</span>
                  <span class="coin-icon">¢</span>
                  <span>${w.price} Coins</span>
                </button>
              `}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  document.getElementById('book-tab-all')?.addEventListener('click', () => { bookFilter = 'ALL'; renderBook(); });
  document.getElementById('book-tab-unlocked')?.addEventListener('click', () => { bookFilter = 'UNLOCKED'; renderBook(); });
  document.getElementById('book-tab-locked')?.addEventListener('click', () => { bookFilter = 'LOCKED'; renderBook(); });
}

// Prompt Unlock Dialog
function promptUnlockWord(word) {
  pendingUnlockWord = word;
  const modal = document.getElementById('unlock-modal');
  const detailsEl = document.getElementById('unlock-modal-details');
  const confirmBtn = document.getElementById('unlock-confirm-btn');

  const canAfford = state.coins >= word.price;

  detailsEl.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 2.5rem; margin-bottom: 8px;">🗝️</div>
      <h3 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 6px;">Unlock "${word.word}"</h3>
      <p style="font-size: 0.9rem; color: var(--text-muted);">${word.category} · Difficulty: ${word.difficulty}</p>
    </div>
    
    <div style="background: var(--bg-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem;">
        <span style="color: var(--text-muted);">Unlock Cost:</span>
        <span style="font-weight: 700; color: #b47a08;">${word.price} Coins</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem;">
        <span style="color: var(--text-muted);">Current Balance:</span>
        <span style="font-weight: 700;">${state.coins} Coins</span>
      </div>
      <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 8px; font-size: 0.9rem;">
        <span style="color: var(--text-muted);">Remaining Balance:</span>
        <span style="font-weight: 700; color: ${canAfford ? 'var(--success)' : 'var(--error)'};">
          ${canAfford ? state.coins - word.price : 'Insufficient Coins'}
        </span>
      </div>
    </div>

    ${!canAfford ? `
      <div style="background: var(--error-bg); border: 1px solid var(--error-border); color: #991b1b; padding: 10px 14px; border-radius: var(--radius-md); font-size: 0.85rem; margin-bottom: 16px; text-align: center;">
        You need ${word.price - state.coins} more coins. Complete quizzes to earn more coins!
      </div>
    ` : ''}
  `;

  confirmBtn.disabled = !canAfford;
  confirmBtn.textContent = canAfford ? `Confirm Unlock (-${word.price} Coins)` : 'Not Enough Coins';

  modal.classList.add('active');
}

function executeUnlock() {
  if (!pendingUnlockWord) return;
  const word = pendingUnlockWord;

  if (state.unlockedWords.includes(word.id)) {
    showToast('Word is already unlocked!', 'info');
    closeAllModals();
    return;
  }

  if (state.coins < word.price) {
    showToast('Insufficient coins balance.', 'error');
    return;
  }

  // Deduct coins & record unlock
  state.coins -= word.price;
  state.stats.totalCoinsSpent += word.price;
  state.unlockedWords.push(word.id);

  saveState();
  checkAchievements();
  closeAllModals();

  showToast(`🎉 Successfully unlocked "${word.word}"!`, 'success');

  // Re-render current view
  if (currentView === 'book') renderBook();
  else if (currentView === 'dictionary') renderDictionary();
  else if (currentView === 'home') renderHome();

  // Open the newly unlocked word
  setTimeout(() => {
    openWordDetailModal(word);
  }, 300);
}

// --- VIEW 4: RANDOM QUIZ SYSTEM ---
let quizSelectedDifficulty = 'medium';

function renderQuizSetup() {
  const container = document.getElementById('quiz-content');
  if (!container) return;

  activeQuiz = null;

  container.innerHTML = `
    <div class="quiz-container">
      <div class="quiz-setup-card">
        <div style="font-size: 2.8rem; margin-bottom: 12px;">🧠</div>
        <h2 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 8px;">Vocabulary Quiz Challenge</h2>
        <p style="font-size: 0.95rem; color: var(--text-muted); max-width: 500px; margin: 0 auto;">
          Earn coins to expand your dictionary book! 10 questions per quiz. +10 coins for correct answers, +20 streak bonus, and +50 perfect score bonus.
        </p>

        <div class="difficulty-picker">
          <button class="diff-choice-btn ${quizSelectedDifficulty === 'easy' ? 'selected' : ''}" data-diff="easy">
            <div class="diff-choice-title" style="color: var(--success);">Easy</div>
            <div class="diff-choice-desc">Everyday terms, direct definitions & accessible questions</div>
          </button>
          <button class="diff-choice-btn ${quizSelectedDifficulty === 'medium' ? 'selected' : ''}" data-diff="medium">
            <div class="diff-choice-title" style="color: #d97706;">Medium</div>
            <div class="diff-choice-desc">Intermediate vocabulary, sentence fill-ins & synonyms</div>
          </button>
          <button class="diff-choice-btn ${quizSelectedDifficulty === 'hard' ? 'selected' : ''}" data-diff="hard">
            <div class="diff-choice-title" style="color: var(--error);">Hard</div>
            <div class="diff-choice-desc">Advanced vocabulary, subtle nuances & scholarly definitions</div>
          </button>
        </div>

        <button class="btn-primary" id="quiz-start-btn" style="padding: 14px 36px; font-size: 1.05rem;">
          Start 10-Question Quiz
        </button>
      </div>
    </div>
  `;

  document.querySelectorAll('.diff-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      quizSelectedDifficulty = btn.dataset.diff;
      document.querySelectorAll('.diff-choice-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  document.getElementById('quiz-start-btn')?.addEventListener('click', () => {
    startNewQuiz(quizSelectedDifficulty);
  });
}

function startNewQuiz(difficulty) {
  const allWords = getActiveDictionary();
  // Filter pool by difficulty (fallback to all if pool is too small)
  let pool = allWords.filter(w => w.difficulty === difficulty);
  if (pool.length < 10) pool = allWords;

  // Shuffle pool to pick 10 unique target words
  const shuffledWords = [...pool].sort(() => 0.5 - Math.random()).slice(0, 10);

  const questions = shuffledWords.map(targetWord => {
    // Pick question type among 4 variants
    const typeIndex = Math.floor(Math.random() * 4);
    let qType = 'word_to_def';
    let questionText = '';
    let correctAnswer = '';
    let wrongPool = allWords.filter(w => w.id !== targetWord.id);
    let options = [];

    if (typeIndex === 0) {
      // Word -> choose definition
      qType = 'Word → Definition';
      questionText = `What is the correct definition of the word "${targetWord.word}"?`;
      correctAnswer = targetWord.simpleDef;
      const wrongOptions = [...wrongPool].sort(() => 0.5 - Math.random()).slice(0, 3).map(w => w.simpleDef);
      options = [correctAnswer, ...wrongOptions].sort(() => 0.5 - Math.random());
    } else if (typeIndex === 1) {
      // Definition -> choose word
      qType = 'Definition → Word';
      questionText = `Which word means: "${targetWord.simpleDef}"?`;
      correctAnswer = targetWord.word;
      const wrongOptions = [...wrongPool].sort(() => 0.5 - Math.random()).slice(0, 3).map(w => w.word);
      options = [correctAnswer, ...wrongOptions].sort(() => 0.5 - Math.random());
    } else if (typeIndex === 2) {
      // Synonym -> choose word
      qType = 'Synonym Match';
      const syn = targetWord.synonyms[0] || 'equivalent';
      questionText = `Which word is a synonym of "${syn}"?`;
      correctAnswer = targetWord.word;
      const wrongOptions = [...wrongPool].sort(() => 0.5 - Math.random()).slice(0, 3).map(w => w.word);
      options = [correctAnswer, ...wrongOptions].sort(() => 0.5 - Math.random());
    } else {
      // Fill in the blank in example sentence
      qType = 'Fill in the Blank';
      const regex = new RegExp(`\\b${targetWord.word}\\b`, 'i');
      const sentenceWithBlank = targetWord.example.replace(regex, '________');
      questionText = `Complete the sentence: "${sentenceWithBlank}"`;
      correctAnswer = targetWord.word;
      const wrongOptions = [...wrongPool].sort(() => 0.5 - Math.random()).slice(0, 3).map(w => w.word);
      options = [correctAnswer, ...wrongOptions].sort(() => 0.5 - Math.random());
    }

    return {
      targetWord,
      qType,
      questionText,
      correctAnswer,
      options,
      selectedAnswer: null,
      isCorrect: null,
      coinsRewarded: 0
    };
  });

  activeQuiz = {
    difficulty,
    currentIndex: 0,
    questions,
    consecutiveCorrect: 0,
    totalCoinsEarnedThisSession: 0,
    isCompleted: false,
    bonusClaimed: false
  };

  renderQuizQuestion();
}

function renderQuizQuestion() {
  const container = document.getElementById('quiz-content');
  if (!container || !activeQuiz) return;

  const currentQ = activeQuiz.questions[activeQuiz.currentIndex];
  const qNum = activeQuiz.currentIndex + 1;
  const totalQ = activeQuiz.questions.length;
  const isAnswered = currentQ.selectedAnswer !== null;

  container.innerHTML = `
    <div class="quiz-container">
      <div class="quiz-play-card">
        <!-- Progress track -->
        <div class="quiz-top-info">
          <span>Question ${qNum} of ${totalQ} (${activeQuiz.difficulty.toUpperCase()})</span>
          <span>Coins Won: +${activeQuiz.totalCoinsEarnedThisSession} ¢</span>
        </div>
        
        <div class="progress-track" style="margin-bottom: 20px;">
          <div class="progress-fill" style="width: ${(qNum / totalQ) * 100}%;"></div>
        </div>

        <div class="quiz-question-type">${currentQ.qType}</div>
        <div class="quiz-question-text">${currentQ.questionText}</div>

        <!-- Options -->
        <div class="quiz-options-list">
          ${currentQ.options.map((opt, idx) => {
            let stateClass = '';
            if (isAnswered) {
              if (opt === currentQ.correctAnswer) stateClass = 'correct';
              else if (opt === currentQ.selectedAnswer) stateClass = 'incorrect';
            }
            return `
              <button class="quiz-option-btn ${stateClass}" data-opt="${encodeURIComponent(opt)}" ${isAnswered ? 'disabled' : ''}>
                <span class="quiz-option-marker">${String.fromCharCode(65 + idx)}</span>
                <span>${opt}</span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Feedback & Next Button -->
        ${isAnswered ? `
          <div class="quiz-feedback-box ${currentQ.isCorrect ? 'correct' : 'incorrect'}">
            <div>
              <div style="font-weight: 700; margin-bottom: 2px;">
                ${currentQ.isCorrect ? '🎉 Correct Answer!' : '❌ Not Quite Right'}
              </div>
              <div style="font-size: 0.85rem;">
                ${currentQ.isCorrect 
                  ? `+${currentQ.coinsRewarded} Coins awarded.` 
                  : `Correct answer was: <strong>${currentQ.correctAnswer}</strong>`}
              </div>
            </div>
            <button class="btn-primary" id="quiz-next-btn">
              ${qNum === totalQ ? 'View Results' : 'Next Question →'}
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Attach option clicks
  if (!isAnswered) {
    document.querySelectorAll('.quiz-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = decodeURIComponent(btn.dataset.opt);
        handleQuizAnswer(chosen);
      });
    });
  } else {
    document.getElementById('quiz-next-btn')?.addEventListener('click', () => {
      if (activeQuiz.currentIndex + 1 < activeQuiz.questions.length) {
        activeQuiz.currentIndex += 1;
        renderQuizQuestion();
      } else {
        finishQuiz();
      }
    });
  }
}

function handleQuizAnswer(selectedOption) {
  if (!activeQuiz) return;
  const currentQ = activeQuiz.questions[activeQuiz.currentIndex];
  if (currentQ.selectedAnswer !== null) return; // Prevent double answer

  currentQ.selectedAnswer = selectedOption;
  const isCorrect = selectedOption === currentQ.correctAnswer;
  currentQ.isCorrect = isCorrect;

  // Stats update
  state.stats.questionsAnswered += 1;

  if (isCorrect) {
    state.stats.correctAnswers += 1;
    state.stats.currentStreak += 1;
    activeQuiz.consecutiveCorrect += 1;

    if (state.stats.currentStreak > state.stats.bestStreak) {
      state.stats.bestStreak = state.stats.currentStreak;
    }

    let coinsToAdd = REWARD_CONFIG.perCorrect;

    // 5 consecutive streak bonus
    if (activeQuiz.consecutiveCorrect === REWARD_CONFIG.streakBonusCount) {
      coinsToAdd += REWARD_CONFIG.streakBonusCoins;
      showToast(`🔥 5-Streak Bonus! +${REWARD_CONFIG.streakBonusCoins} Coins!`, 'success');
    }

    currentQ.coinsRewarded = coinsToAdd;
    activeQuiz.totalCoinsEarnedThisSession += coinsToAdd;
    state.coins += coinsToAdd;
    state.stats.totalCoinsEarned += coinsToAdd;
  } else {
    state.stats.incorrectAnswers += 1;
    state.stats.currentStreak = 0;
    activeQuiz.consecutiveCorrect = 0;
  }

  saveState();
  checkAchievements();
  renderQuizQuestion();
}

function finishQuiz() {
  if (!activeQuiz) return;
  activeQuiz.isCompleted = true;

  const correctCount = activeQuiz.questions.filter(q => q.isCorrect).length;
  const totalQuestions = activeQuiz.questions.length;

  // Perfect 10-question bonus check (only claim once)
  let perfectBonusAwarded = false;
  if (correctCount === totalQuestions && !activeQuiz.bonusClaimed) {
    activeQuiz.bonusClaimed = true;
    perfectBonusAwarded = true;
    state.coins += REWARD_CONFIG.perfectQuizBonus;
    state.stats.totalCoinsEarned += REWARD_CONFIG.perfectQuizBonus;
    activeQuiz.totalCoinsEarnedThisSession += REWARD_CONFIG.perfectQuizBonus;
    showToast(`🏆 Perfect Quiz Bonus: +${REWARD_CONFIG.perfectQuizBonus} Coins!`, 'success');
  }

  state.stats.totalQuizzes += 1;

  // Record into history
  state.quizHistory.unshift({
    date: new Date().toLocaleDateString(),
    difficulty: activeQuiz.difficulty,
    score: `${correctCount}/${totalQuestions}`,
    coins: activeQuiz.totalCoinsEarnedThisSession
  });
  if (state.quizHistory.length > 20) state.quizHistory.pop();

  saveState();
  checkAchievements();
  renderQuizResults(correctCount, totalQuestions, perfectBonusAwarded);
}

function renderQuizResults(correctCount, totalQuestions, perfectBonusAwarded) {
  const container = document.getElementById('quiz-content');
  if (!container || !activeQuiz) return;

  const scorePct = Math.round((correctCount / totalQuestions) * 100);

  container.innerHTML = `
    <div class="quiz-container">
      <div class="quiz-result-card">
        <div class="result-badge">
          <span style="font-size: 2.2rem;">${scorePct >= 80 ? '🌟' : scorePct >= 50 ? '👍' : '📖'}</span>
        </div>
        <h2 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 6px;">Quiz Completed!</h2>
        <p style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 24px;">
          You scored <strong>${correctCount}</strong> out of <strong>${totalQuestions}</strong> correct (${scorePct}%).
        </p>

        <div style="background: var(--bg-subtle); border-radius: var(--radius-lg); padding: 20px; max-width: 400px; margin: 0 auto 28px auto; text-align: left;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.95rem;">
            <span>Coins Won:</span>
            <span style="font-weight: 800; color: #b47a08;">+${activeQuiz.totalCoinsEarnedThisSession} Coins</span>
          </div>
          ${perfectBonusAwarded ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.85rem; color: var(--success); font-weight: 600;">
              <span>Perfect 10/10 Bonus:</span>
              <span>+${REWARD_CONFIG.perfectQuizBonus} Coins</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
            <span>Current Coin Balance:</span>
            <span style="font-weight: 800;">${state.coins} Coins</span>
          </div>
        </div>

        <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
          <button class="btn-primary" id="quiz-again-btn">Play Another Quiz</button>
          <button class="btn-secondary" id="quiz-goto-book-btn">Unlock Words in Book</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('quiz-again-btn')?.addEventListener('click', () => {
    startNewQuiz(activeQuiz.difficulty);
  });

  document.getElementById('quiz-goto-book-btn')?.addEventListener('click', () => {
    switchView('book');
  });
}

// --- VIEW 5: PROGRESS & ACHIEVEMENTS ---
function renderProgress() {
  const container = document.getElementById('progress-content');
  if (!container) return;

  const totalWords = getActiveDictionary().length;
  const accuracy = state.stats.questionsAnswered > 0 
    ? Math.round((state.stats.correctAnswers / state.stats.questionsAnswered) * 100) 
    : 0;

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2 class="section-title">Progress & Statistics</h2>
        <p class="section-desc">Track your learning journey, quiz achievements, and data backup options.</p>
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="btn-primary" id="progress-open-import-btn" style="font-size: 0.85rem;">+ Import Words</button>
        <button class="btn-secondary" id="progress-export-btn">Export Data (JSON)</button>
        <button class="btn-secondary" id="progress-import-btn">Import Data</button>
        <button class="btn-secondary" style="color: var(--error);" id="progress-reset-btn">Reset All</button>
      </div>
    </div>

    <!-- Big Stat Cards Grid -->
    <div class="dash-stats-row">
      <div class="stat-card">
        <span class="stat-card-label">Total Coins Earned</span>
        <div class="stat-card-val">${state.stats.totalCoinsEarned.toLocaleString()} ¢</div>
        <div class="stat-card-sub">Spent on unlocks: ${state.stats.totalCoinsSpent.toLocaleString()} ¢</div>
      </div>
      <div class="stat-card">
        <span class="stat-card-label">Questions Answered</span>
        <div class="stat-card-val">${state.stats.questionsAnswered}</div>
        <div class="stat-card-sub">${state.stats.correctAnswers} correct · ${state.stats.incorrectAnswers} incorrect</div>
      </div>
      <div class="stat-card">
        <span class="stat-card-label">Overall Accuracy</span>
        <div class="stat-card-val">${accuracy}%</div>
        <div class="stat-card-sub">${state.stats.totalQuizzes} quizzes completed</div>
      </div>
      <div class="stat-card">
        <span class="stat-card-label">Words Unlocked</span>
        <div class="stat-card-val">${state.unlockedWords.length} <span style="font-size: 1rem; color: var(--text-muted);">/ ${totalWords}</span></div>
        <div class="stat-card-sub">${state.bookmarks.length} words bookmarked</div>
      </div>
    </div>

    <!-- Achievements Section -->
    <div style="margin-top: 32px;">
      <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Achievements</h3>
      <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 16px;">
        Unlocked ${state.unlockedAchievements.length} of ${ACHIEVEMENTS_DEF.length} badges
      </p>

      <div class="achievements-grid">
        ${ACHIEVEMENTS_DEF.map(ach => {
          const isUnlocked = state.unlockedAchievements.includes(ach.id);
          return `
            <div class="achievement-card ${isUnlocked ? '' : 'locked'}">
              <div class="achievement-icon">${ach.icon}</div>
              <div class="achievement-info">
                <h4>${ach.title}</h4>
                <p>${ach.desc}</p>
                <span style="font-size: 0.725rem; font-weight: 700; color: ${isUnlocked ? 'var(--success)' : 'var(--text-faint)'}; display: inline-block; margin-top: 4px;">
                  ${isUnlocked ? '✓ UNLOCKED' : 'LOCKED'}
                </span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Recent Quiz History -->
    <div style="margin-top: 36px;">
      <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 12px;">Recent Quiz Sessions</h3>
      ${state.quizHistory.length === 0 ? `
        <div style="padding: 24px; text-align: center; background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); font-size: 0.875rem; color: var(--text-muted);">
          No quiz history yet. Complete a quiz challenge to view records here!
        </div>
      ` : `
        <div class="history-list">
          ${state.quizHistory.map(item => `
            <div class="history-item">
              <div>
                <span style="font-weight: 700; text-transform: uppercase; font-size: 0.8rem; margin-right: 8px;" class="diff-${item.difficulty}">${item.difficulty}</span>
                <span>${item.date}</span>
              </div>
              <div style="display: flex; gap: 16px; align-items: center;">
                <span style="font-weight: 600;">Score: ${item.score}</span>
                <span style="color: #b47a08; font-weight: 700;">+${item.coins} ¢</span>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;

  // Progress Action Handlers
  document.getElementById('progress-export-btn')?.addEventListener('click', exportProgressData);
  document.getElementById('progress-import-btn')?.addEventListener('click', promptImportData);
  document.getElementById('progress-reset-btn')?.addEventListener('click', promptResetData);
}

// Data Export / Import / Reset
function exportProgressData() {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `vocabquest_backup_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('Progress exported to JSON file!', 'success');
}

function promptImportData() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (typeof parsed.coins === 'number' && Array.isArray(parsed.unlockedWords)) {
          state = {
            ...state,
            ...parsed,
            unlockedWords: Array.from(new Set([...STARTER_WORD_IDS, ...parsed.unlockedWords]))
          };
          saveState();
          showToast('Data imported successfully!', 'success');
          renderProgress();
        } else {
          showToast('Invalid backup file format.', 'error');
        }
      } catch (err) {
        showToast('Failed to parse backup file.', 'error');
      }
    };
    reader.readAsText(file);
  };
  fileInput.click();
}

function promptResetData() {
  const modal = document.getElementById('reset-modal');
  modal.classList.add('active');
}

function executeResetData() {
  state = {
    coins: 100,
    unlockedWords: [...STARTER_WORD_IDS],
    bookmarks: [],
    pronunciationsCount: 0,
    theme: state.theme,
    stats: {
      totalQuizzes: 0,
      questionsAnswered: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      totalCoinsEarned: 0,
      totalCoinsSpent: 0,
      currentStreak: 0,
      bestStreak: 0,
      lastActiveDate: new Date().toISOString().slice(0, 10),
      dailyStreak: 1
    },
    quizHistory: [],
    unlockedAchievements: []
  };

  saveState();
  closeAllModals();
  showToast('Progress has been reset to starter state (100 Coins).', 'info');
  switchView('home');
}

// Word Detail Modal
function openWordDetailModal(word) {
  activeWordModal = word;
  const modal = document.getElementById('word-modal');
  const content = document.getElementById('word-modal-content');

  const isBookmarked = state.bookmarks.includes(word.id);
  const escapedExample = word.example.replace(/"/g, '&quot;').replace(/'/g, "\\'");

  content.innerHTML = `
    <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; gap: 12px; flex-wrap: wrap;">
      <div>
        <span class="diff-tag diff-${word.difficulty}" style="font-size: 0.8rem; font-weight: 700;">${word.difficulty.toUpperCase()}</span>
        <h2 style="font-size: 2rem; font-weight: 800; margin-top: 4px; display: flex; align-items: center; gap: 10px;">
          <span>${word.word}</span>
          <button class="speaker-icon-btn" data-speak-text="${word.word}" title="Listen to pronunciation of ${word.word}" aria-label="Listen to pronunciation of ${word.word}" onclick="window.speakWord('${word.word}', this)">
            <svg class="speaker-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path class="sound-wave sound-wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path class="sound-wave sound-wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
          </button>
        </h2>
        <div style="font-size: 0.95rem; color: var(--text-muted); font-style: italic; margin-top: 2px;">
          ${word.phonetic} · <span style="text-transform: capitalize;">${word.pos}</span> · <span>${word.category}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="speaker-btn speaker-btn-lg" data-speak-text="${word.word}" title="Listen to pronunciation" aria-label="Listen to pronunciation of ${word.word}" onclick="window.speakWord('${word.word}', this)">
          <svg class="speaker-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path class="sound-wave sound-wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            <path class="sound-wave sound-wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          </svg>
          <span>Pronounce</span>
        </button>
        <button class="bookmark-icon-btn ${isBookmarked ? 'active' : ''}" style="padding: 8px;" title="Bookmark word" aria-label="Bookmark word" onclick="window.toggleBookmarkModal('${word.id}')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        </button>
      </div>
    </div>

    <div style="margin: 18px 0; border-top: 1px solid var(--border-subtle); padding-top: 16px;">
      <h4 style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 4px;">Definition</h4>
      <p style="font-size: 1.05rem; line-height: 1.5; margin-bottom: 8px;">${word.simpleDef}</p>
      <p style="font-size: 0.925rem; color: var(--text-muted); line-height: 1.45;">${word.detailedDef}</p>
    </div>

    <div style="background: var(--bg-subtle); border-radius: var(--radius-md); padding: 14px 18px; margin-bottom: 18px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <h4 style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">Example In Context</h4>
        <button class="speaker-btn-inline" data-speak-text="${escapedExample}" title="Hear sentence pronunciation" aria-label="Hear sentence pronunciation" onclick="window.speakWord('${escapedExample}', this)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
          <span>Hear sentence</span>
        </button>
      </div>
      <p style="font-style: italic; font-size: 0.95rem; color: var(--text-main);">"${word.example}"</p>
    </div>

    <div>
      <h4 style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 8px;">Synonyms</h4>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        ${word.synonyms.map(s => `<span style="background: var(--bg-subtle); border: 1px solid var(--border-subtle); padding: 4px 10px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 500;">${s}</span>`).join('')}
      </div>
    </div>
  `;

  modal.classList.add('active');
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

// Window Globals for inline HTML event bindings
window.viewWordModal = function(id) {
  const word = getActiveDictionary().find(w => w.id === id);
  if (word) openWordDetailModal(word);
};

window.speakWord = function(text, btnEl = null) {
  speakWord(text, btnEl);
};

window.promptUnlock = function(id) {
  const word = getActiveDictionary().find(w => w.id === id);
  if (word) promptUnlockWord(word);
};

window.toggleBookmark = function(id) {
  if (state.bookmarks.includes(id)) {
    state.bookmarks = state.bookmarks.filter(b => b !== id);
    showToast('Bookmark removed', 'info');
  } else {
    state.bookmarks.push(id);
    showToast('Word added to bookmarks', 'success');
  }
  saveState();
  if (currentView === 'dictionary') renderDictionary();
};

window.toggleBookmarkModal = function(id) {
  window.toggleBookmark(id);
  const word = getActiveDictionary().find(w => w.id === id);
  if (word) openWordDetailModal(word);
};

window.importPresetPack = function(packKey) {
  if (packKey === 'all') {
    const allPackWords = [
      ...EXPANSION_PACKS.gre,
      ...EXPANSION_PACKS.science,
      ...EXPANSION_PACKS.literature
    ];
    importWords(allPackWords, true);
  } else if (EXPANSION_PACKS[packKey]) {
    importWords(EXPANSION_PACKS[packKey], true);
  }
};

window.clearCustomWords = function() {
  if (customWords.length === 0) {
    showToast('No custom words to remove.', 'info');
    return;
  }
  if (window.confirm(`Remove ${customWords.length} custom imported words? Built-in dictionary words will be kept.`)) {
    customWords = [];
    try {
      localStorage.removeItem(CUSTOM_WORDS_KEY);
    } catch (e) {}
    showToast('Custom imported words removed.', 'info');
    updateImportModalFooter();
    if (currentView === 'home') renderHome();
    else if (currentView === 'dictionary') renderDictionary();
    else if (currentView === 'book') renderBook();
    else if (currentView === 'progress') renderProgress();
  }
};

function openImportWordsModal() {
  const modal = document.getElementById('import-words-modal');
  if (modal) {
    updateImportModalFooter();
    modal.classList.add('active');
  }
}

// Global Search Event
function handleGlobalSearch(query) {
  currentSearch = query.trim();
  if (currentView !== 'dictionary' && currentView !== 'book') {
    switchView('dictionary');
  } else if (currentView === 'dictionary') {
    renderDictionary();
  } else if (currentView === 'book') {
    renderBook();
  }
}

// Initial Setup & DOM Bindings
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // Navigation clicks
  document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) switchView(view);
    });
  });

  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle-btn');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      saveState();
    });
  }

  // Top Search Input
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      handleGlobalSearch(e.target.value);
    });
  }

  // Import Words Triggers
  document.getElementById('top-import-words-btn')?.addEventListener('click', openImportWordsModal);
  document.getElementById('progress-open-import-btn')?.addEventListener('click', openImportWordsModal);

  // Import Modal Tabs
  const tabPacksBtn = document.getElementById('import-tab-btn-packs');
  const tabCustomBtn = document.getElementById('import-tab-btn-custom');
  const tabPacksContent = document.getElementById('import-tab-packs');
  const tabCustomContent = document.getElementById('import-tab-custom');

  tabPacksBtn?.addEventListener('click', () => {
    tabPacksBtn.classList.add('active');
    tabCustomBtn?.classList.remove('active');
    if (tabPacksContent) tabPacksContent.style.display = 'block';
    if (tabCustomContent) tabCustomContent.style.display = 'none';
  });

  tabCustomBtn?.addEventListener('click', () => {
    tabCustomBtn.classList.add('active');
    tabPacksBtn?.classList.remove('active');
    if (tabCustomContent) tabCustomContent.style.display = 'block';
    if (tabPacksContent) tabPacksContent.style.display = 'none';
  });

  // Custom Text Import Submit
  document.getElementById('import-custom-submit-btn')?.addEventListener('click', () => {
    const textEl = document.getElementById('import-custom-text');
    const autoUnlockEl = document.getElementById('import-auto-unlock');
    if (!textEl) return;
    const text = textEl.value.trim();
    if (!text) {
      showToast('Please enter words or paste JSON data.', 'info');
      return;
    }
    const parsed = parsePastedWordsText(text);
    if (!parsed || parsed.length === 0) {
      showToast('Could not parse any valid words from input.', 'error');
      return;
    }
    const autoUnlock = autoUnlockEl ? autoUnlockEl.checked : true;
    const count = importWords(parsed, autoUnlock);
    if (count > 0) {
      textEl.value = '';
      closeAllModals();
    }
  });

  // File Upload Button in Import Modal
  document.getElementById('import-upload-file-btn')?.addEventListener('click', () => {
    const autoUnlockEl = document.getElementById('import-auto-unlock');
    const autoUnlock = autoUnlockEl ? autoUnlockEl.checked : true;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json,text/plain';
    fileInput.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const content = ev.target.result;
          const parsed = parsePastedWordsText(content);
          if (parsed && parsed.length > 0) {
            importWords(parsed, autoUnlock);
            closeAllModals();
          } else {
            showToast('No recognizable words found in file.', 'error');
          }
        } catch (err) {
          showToast('Failed to read file.', 'error');
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  });

  // Modal Closers
  document.querySelectorAll('.modal-close-trigger').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeAllModals();
    });
  });

  // Unlock confirm
  document.getElementById('unlock-confirm-btn')?.addEventListener('click', executeUnlock);

  // Reset confirm
  document.getElementById('reset-confirm-btn')?.addEventListener('click', executeResetData);

  // Keyboard shortcut ESC to close modals
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });

  // Initial View
  switchView('home');
  updateHeaderStats();
});
