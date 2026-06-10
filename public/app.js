// State Management
let movies = []; // Raw list of parsed movies
let categories = {}; // Movies grouped by category
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');

let activeView = 'home';
let currentCategoryFilter = '';
let hlsInstance = null;

// Smart TV Spatial Navigation State
let currentFocusElement = null;
let navGroup = 'sidebar'; // 'sidebar', 'hero', 'grids', 'search-grid', 'categories-grid', 'player'
let focusedRowIndex = 0;
let focusedColIndex = 0;

// DOM Elements
const sidebarItems = document.querySelectorAll('.nav-item');
const homeView = document.getElementById('home-view');
const searchView = document.getElementById('search-view');
const categoriesView = document.getElementById('categories-view');
const favoritesView = document.getElementById('favorites-view');

const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const categoriesGrid = document.getElementById('categories-grid');
const favoritesGrid = document.getElementById('favorites-grid');
const movieRowsContainer = document.getElementById('movie-rows');

const playerModal = document.getElementById('player-modal');
const videoPlayer = document.getElementById('video-player');
const playerControls = document.getElementById('player-controls');
const btnPlayPause = document.getElementById('btn-play-pause');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');

let osdTimeout = null;

// Parse M3U File
async function loadM3U() {
  try {
    const response = await fetch('/playlist.m3u');
    if (!response.ok) throw new Error('Oynatma listesi sunucudan yüklenemedi.');
    
    const text = await response.text();
    parseM3U(text);
  } catch (error) {
    console.error('Error loading M3U playlist:', error);
    movieRowsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation" style="color: var(--accent);"></i>
        <p>Film arşivi sunucudan yüklenemedi: ${error.message}</p>
        <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 10px;">Tekrar Dene</button>
      </div>
    `;
  }
}

function parseM3U(m3uText) {
  const lines = m3uText.split('\n');
  const parsedMovies = [];
  categories = {};

  console.log('Parsing M3U lines...');

  let currentMovie = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('#EXTINF:')) {
      currentMovie = {};
      
      // Parse Logo/Poster URL
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      currentMovie.poster = logoMatch ? logoMatch[1] : '';

      // Fallback: If tmdb image path is empty, set a placeholder or keep blank
      if (currentMovie.poster && currentMovie.poster.includes('/t/p/w500') && currentMovie.poster.endsWith('.jpg') && currentMovie.poster.length < 50) {
        currentMovie.poster = ''; // Invalid tmdb path
      }

      // Parse Category/Group Title
      const groupMatch = line.match(/group-title="([^"]+)"/);
      currentMovie.category = groupMatch ? groupMatch[1] : 'Diğer';

      // Parse Rating
      const ratingMatch = line.match(/rating="([^"]+)"/);
      currentMovie.rating = ratingMatch ? ratingMatch[1] : '0.0';
      if (currentMovie.rating === '0' || currentMovie.rating === '0.0' || !currentMovie.rating) {
        currentMovie.rating = '?';
      }

      // Parse Movie Title (takes everything after the last comma)
      const commaIndex = line.lastIndexOf(',');
      if (commaIndex !== -1) {
        let titlePart = line.substring(commaIndex + 1).trim();
        // Remove IMDb rating if appended in text (e.g. "| ⭐7.0")
        if (titlePart.includes('|')) {
          titlePart = titlePart.split('|')[0].trim();
        }
        // Extract year from title if present, e.g., "Inception (2010)"
        const yearMatch = titlePart.match(/\((\d{4})\)/);
        currentMovie.year = yearMatch ? yearMatch[1] : 'N/A';
        currentMovie.title = titlePart;
      } else {
        currentMovie.title = 'Bilinmeyen Film';
        currentMovie.year = 'N/A';
      }
    } else if (line.startsWith('http://') || line.startsWith('https://')) {
      if (currentMovie) {
        currentMovie.url = line;
        
        // Extract IMDb ID or ID from url for keying
        const idMatch = line.match(/\/vs\/([a-zA-Z0-9_-]+)/);
        currentMovie.id = idMatch ? idMatch[1] : Math.random().toString(36).substring(7);

        parsedMovies.push(currentMovie);
        
        // Add to categories
        if (!categories[currentMovie.category]) {
          categories[currentMovie.category] = [];
        }
        categories[currentMovie.category].push(currentMovie);
        
        currentMovie = null;
      }
    }
  }

  movies = parsedMovies;
  console.log(`Parsed ${movies.length} movies successfully across ${Object.keys(categories).length} categories!`);

  // Render Home UI Components
  renderFeaturedHero();
  renderCategoryRows();
  renderCategoriesGrid();
}

// Render Top Hero Banner with a premium highly-rated "Son Eklenenler" movie
function renderFeaturedHero() {
  const sonEklenenler = categories['Son Eklenenler'] || movies;
  if (!sonEklenenler || sonEklenenler.length === 0) return;

  // Filter out movies without posters for hero banner
  const eligible = sonEklenenler.filter(m => m.poster && m.rating !== '?');
  const pool = eligible.length > 0 ? eligible : sonEklenenler;
  
  // Pick a random highly rated movie from the pool
  const featured = pool[Math.floor(Math.random() * pool.length)];

  document.getElementById('hero-title').innerText = featured.title;
  document.getElementById('hero-group').innerText = featured.category;
  document.getElementById('hero-rating').innerText = featured.rating;
  document.getElementById('hero-year').innerText = featured.year !== 'N/A' ? featured.year : '2026';
  
  if (featured.poster) {
    document.getElementById('hero-backdrop').style.backgroundImage = `url('${featured.poster}')`;
  }

  // Bind actions
  const playBtn = document.getElementById('hero-play-btn');
  const favBtn = document.getElementById('hero-fav-btn');

  playBtn.onclick = () => playMovie(featured);
  
  const isFav = favorites.some(f => f.id === featured.id);
  updateFavButtonUI(favBtn, isFav);
  favBtn.onclick = () => toggleFavorite(featured, favBtn);
}

// Render dynamic Netflix-style row sliders
function renderCategoryRows() {
  movieRowsContainer.innerHTML = '';
  
  // Select top 8 categories to show on the main page for clean performance
  const priorityCategories = ['Son Eklenenler', 'Aksiyon', 'Popüler', 'Komedi', 'Korku', 'Gerilim', 'Dram', 'Bilim-Kurgu'];
  
  priorityCategories.forEach((catName, rowIndex) => {
    const list = categories[catName];
    if (!list || list.length === 0) return;

    // Create Row element
    const row = document.createElement('div');
    row.className = 'movie-row';
    row.dataset.rowIndex = rowIndex;
    
    row.innerHTML = `
      <div class="row-header">
        <h3 class="row-title">${catName}</h3>
      </div>
      <div class="row-cards" id="row-cards-${rowIndex}"></div>
    `;

    movieRowsContainer.appendChild(row);
    const rowCards = document.getElementById(`row-cards-${rowIndex}`);

    // Render cards (maximum 20 for scrolling speed and smooth TV performance)
    list.slice(0, 25).forEach((movie, colIndex) => {
      const card = createMovieCard(movie);
      card.dataset.rowIndex = rowIndex;
      card.dataset.colIndex = colIndex;
      rowCards.appendChild(card);
    });
  });
}

function createMovieCard(movie) {
  const card = document.createElement('div');
  card.className = 'movie-card nav-target';
  card.dataset.id = movie.id;
  
  const posterUrl = movie.poster || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=350&auto=format&fit=crop';
  
  card.innerHTML = `
    <div class="movie-poster-container">
      <img src="${posterUrl}" class="movie-poster" alt="${movie.title}" loading="lazy">
      <div class="card-gradient"></div>
      <div class="card-rating">
        <i class="fa-solid fa-star"></i>
        <span>${movie.rating}</span>
      </div>
      <div class="card-info">
        <h4 class="card-title">${movie.title}</h4>
        <span class="card-subtitle">${movie.category}</span>
      </div>
    </div>
  `;

  card.onclick = () => playMovie(movie);
  return card;
}

// Render Categories Grid Screen
function renderCategoriesGrid() {
  categoriesGrid.innerHTML = '';
  Object.keys(categories).sort().forEach(catName => {
    const count = categories[catName].length;
    const card = document.createElement('div');
    card.className = 'category-card nav-target';
    
    // Choose icon based on category name
    let iconClass = 'fa-solid fa-clapperboard';
    if (catName.includes('Korku')) iconClass = 'fa-solid fa-ghost';
    else if (catName.includes('Gerilim') || catName.includes('Aksiyon')) iconClass = 'fa-solid fa-burst';
    else if (catName.includes('Komedi')) iconClass = 'fa-solid fa-face-laugh-beam';
    else if (catName.includes('Romantik')) iconClass = 'fa-solid fa-heart';
    else if (catName.includes('Belgesel')) iconClass = 'fa-solid fa-compass';
    else if (catName.includes('Bilim-Kurgu')) iconClass = 'fa-solid fa-user-astronaut';
    else if (catName.includes('Aile') || catName.includes('Çocuk')) iconClass = 'fa-solid fa-child';

    card.innerHTML = `
      <div class="category-card-bg"></div>
      <div class="category-card-content">
        <i class="${iconClass} category-icon"></i>
        <h3 class="category-name">${catName}</h3>
        <span class="category-count">${count} Film</span>
      </div>
    `;

    card.onclick = () => {
      // Filter search page by this category
      switchView('search-view');
      searchInput.value = '';
      currentCategoryFilter = catName;
      document.querySelector('.search-header .section-title').innerText = `${catName} Kategorisi`;
      filterAndRenderSearch(catName);
    };

    categoriesGrid.appendChild(card);
  });
}

// Search & Filter Operations
function filterAndRenderSearch(genreFilter = '') {
  searchResults.innerHTML = '';
  const query = searchInput.value.toLowerCase().trim();
  
  if (!query && !genreFilter) {
    searchResults.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-magnifying-glass animate-bounce"></i>
        <p>Babanızın kolayca izlemesi için yukarıdan arama yapın.</p>
      </div>
    `;
    return;
  }

  let filtered = movies;
  
  if (genreFilter) {
    filtered = categories[genreFilter] || [];
  }
  
  if (query) {
    filtered = filtered.filter(m => 
      m.title.toLowerCase().includes(query) || 
      m.category.toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    searchResults.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-face-frown"></i>
        <p>Aramanıza uygun hiçbir film bulunamadı.</p>
      </div>
    `;
    return;
  }

  // Render max 120 results to maintain super-fast render and scroll speeds
  const maxResults = 120;
  const colCount = Math.floor(searchResults.offsetWidth / 200) || 5;

  filtered.slice(0, maxResults).forEach((movie, index) => {
    const card = createMovieCard(movie);
    card.dataset.colIndex = index % colCount;
    card.dataset.rowIndex = Math.floor(index / colCount);
    searchResults.appendChild(card);
  });
}

// Toggle Favorite Saved in localStorage
function toggleFavorite(movie, btnElement) {
  const index = favorites.findIndex(f => f.id === movie.id);
  let isFav = false;
  
  if (index === -1) {
    favorites.push(movie);
    isFav = true;
  } else {
    favorites.splice(index, 1);
    isFav = false;
  }

  localStorage.setItem('favorites', JSON.stringify(favorites));
  updateFavButtonUI(btnElement, isFav);
  renderFavoritesGrid();
}

function updateFavButtonUI(btn, isFav) {
  if (isFav) {
    btn.innerHTML = `<i class="fa-solid fa-heart" style="color: var(--accent);"></i> Favorilerde`;
    btn.classList.add('active');
  } else {
    btn.innerHTML = `<i class="fa-solid fa-heart-circle-plus"></i> Favoriye Ekle`;
    btn.classList.remove('active');
  }
}

// Render Favorites grid
function renderFavoritesGrid() {
  favoritesGrid.innerHTML = '';
  if (favorites.length === 0) {
    favoritesGrid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-heart-crack"></i>
        <p>Henüz favori listenize film eklemediniz.</p>
      </div>
    `;
    return;
  }

  const colCount = Math.floor(favoritesGrid.offsetWidth / 200) || 5;
  favorites.forEach((movie, index) => {
    const card = createMovieCard(movie);
    card.dataset.colIndex = index % colCount;
    card.dataset.rowIndex = Math.floor(index / colCount);
    favoritesGrid.appendChild(card);
  });
}

// Page View Swapper
function switchView(viewName) {
  activeView = viewName;
  
  // Hide all sections
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
  });

  // Remove active styling on sidebar items
  sidebarItems.forEach(item => {
    item.classList.remove('active');
    if (item.dataset.view === viewName) {
      item.classList.add('active');
    }
  });

  // Show active view
  const activeSection = document.getElementById(`${viewName}`);
  if (activeSection) {
    activeSection.classList.add('active');
  }

  // Handle specific views initialization
  if (viewName === 'home') {
    navGroup = 'hero';
    setFocus(document.getElementById('hero-play-btn'));
  } else if (viewName === 'search-view') {
    currentCategoryFilter = '';
    document.querySelector('.search-header .section-title').innerText = 'Film Ara';
    filterAndRenderSearch();
    navGroup = 'search';
    setFocus(searchInput.parentElement);
  } else if (viewName === 'categories-view') {
    navGroup = 'categories-grid';
    setFocus(categoriesGrid.querySelector('.category-card'));
  } else if (viewName === 'favorites-view') {
    renderFavoritesGrid();
    navGroup = 'favorites-grid';
    setFocus(favoritesGrid.querySelector('.movie-card') || document.querySelector('.sidebar .nav-item.active'));
  }
}

// Premium Cinematic Player Control Logic
function playMovie(movie) {
  // Self-heal: Ensure movie URL uses the current active website's domain
  let movieUrl = movie.url;
  if (movieUrl.includes('/vs/')) {
    const idMatch = movieUrl.match(/\/vs\/([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      movieUrl = `${window.location.origin}/vs/${idMatch[1]}.m3u8`;
    }
  }

  console.log(`Starting playback for: ${movie.title} via url: ${movieUrl}`);
  playerModal.classList.add('active');
  navGroup = 'player';
  
  document.getElementById('player-title').innerText = movie.title;
  document.getElementById('player-subtitle').innerText = movie.category;

  // Clean up any existing stream first
  destroyHLS();

  // Load and play new stream
  if (Hls.isSupported()) {
    hlsInstance = new Hls({
      xhrSetup: function(xhr, url) {
        xhr.withCredentials = false; // Disable credentials for cross-origin segments
      }
    });
    hlsInstance.loadSource(movieUrl);
    hlsInstance.attachMedia(videoPlayer);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      videoPlayer.play();
    });
  } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl') || videoPlayer.canPlayType('application/x-mpegURL')) {
    // Fallback for native Safari or Smart TV WebOS/Tizen native stream compatibility
    videoPlayer.src = movie.url;
    videoPlayer.play();
  } else {
    alert('Hata: Tarayıcınız HLS yayın formatını desteklemiyor.');
    closePlayer();
  }

  showControlsOSD();
  setFocus(btnPlayPause);
}

function destroyHLS() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  videoPlayer.removeAttribute('src');
  videoPlayer.load();
}

function closePlayer() {
  videoPlayer.pause();
  destroyHLS();
  playerModal.classList.remove('active');
  
  // Return focus back to where we were
  if (activeView === 'home') {
    navGroup = 'grids';
    setFocus(document.querySelector('.movie-row[data-row-index="0"] .movie-card'));
  } else {
    navGroup = activeView === 'search-view' ? 'search-grid' : 'favorites-grid';
    setFocus(document.querySelector('.search-results-grid .movie-card'));
  }
}

function togglePlayPause() {
  if (videoPlayer.paused) {
    videoPlayer.play();
    btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
  } else {
    videoPlayer.pause();
    btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i>';
  }
  showControlsOSD();
}

function seek(seconds) {
  videoPlayer.currentTime += seconds;
  showControlsOSD();
}

// Format time from seconds to MM:SS or HH:MM:SS
function formatTime(secs) {
  if (isNaN(secs) || secs < 0) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');
  
  if (h > 0) {
    return `${h}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}

// Synchronize video player progress controls
videoPlayer.ontimeupdate = () => {
  timeCurrent.innerText = formatTime(videoPlayer.currentTime);
  const duration = videoPlayer.duration || 0;
  timeTotal.innerText = formatTime(duration);
  
  if (duration > 0) {
    const percent = (videoPlayer.currentTime / duration) * 100;
    progressBar.style.width = `${percent}%`;
    progressBar.nextElementSibling.style.left = `${percent}%`; // Move handle
  }
};

// Toggle OSD Visibility
function showControlsOSD() {
  playerControls.classList.add('visible');
  clearTimeout(osdTimeout);
  
  // Auto-hide controls after 4 seconds of inactivity if movie is playing
  if (!videoPlayer.paused) {
    osdTimeout = setTimeout(() => {
      playerControls.classList.remove('visible');
      if (navGroup === 'player') {
        // Blur buttons so no focus borders show on dark screen
        if (currentFocusElement) currentFocusElement.classList.remove('focused-item');
      }
    }, 4000);
  }
}

// Listen to mousemove / click to show OSD
document.addEventListener('mousemove', () => {
  if (navGroup === 'player') showControlsOSD();
});
document.addEventListener('click', () => {
  if (navGroup === 'player') showControlsOSD();
});

// Setup click action events
btnPlayPause.onclick = togglePlayPause;
document.getElementById('btn-rewind').onclick = () => seek(-10);
document.getElementById('btn-forward').onclick = () => seek(10);
document.getElementById('player-back-btn').onclick = closePlayer;
document.getElementById('btn-fullscreen').onclick = () => {
  if (!document.fullscreenElement) {
    playerModal.requestFullscreen().catch(err => {
      console.log('Fullscreen failed:', err.message);
    });
  } else {
    document.exitFullscreen();
  }
};

// ==========================================
// SMART TV KEYBOARD & REMOTE CONTROL ENGINE
// ==========================================
function setFocus(element) {
  if (!element) return;
  
  if (currentFocusElement) {
    currentFocusElement.classList.remove('focused-item');
  }
  
  currentFocusElement = element;
  currentFocusElement.classList.add('focused-item');
  
  // Auto scroll focused elements into view
  currentFocusElement.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: 'center'
  });
}

// Spatial Keyboard/Remote Navigation Maps
document.addEventListener('keydown', (e) => {
  const key = e.keyCode || e.which;
  console.log(`Key pressed on Smart TV: ${key}`);

  // Auto show player OSD on any button press
  if (navGroup === 'player') {
    showControlsOSD();
    if (!playerControls.classList.contains('visible')) {
      // Re-focus current item if OSD was hidden
      setFocus(currentFocusElement);
      return;
    }
  }

  switch(key) {
    case 37: // LEFT Arrow
      e.preventDefault();
      navigateLeft();
      break;
    case 38: // UP Arrow
      e.preventDefault();
      navigateUp();
      break;
    case 39: // RIGHT Arrow
      e.preventDefault();
      navigateRight();
      break;
    case 40: // DOWN Arrow
      e.preventDefault();
      navigateDown();
      break;
    case 13: // ENTER / OK Button
      e.preventDefault();
      if (currentFocusElement) {
        currentFocusElement.click();
        
        // Auto focus search input when container is clicked
        if (currentFocusElement === searchInput.parentElement) {
          searchInput.focus();
        }
      }
      break;
    case 8: // BACKSPACE (Return key on some Remotes)
    case 461: // LG WebOS Return Key
    case 10009: // Samsung Tizen Return Key
    case 27: // ESC Key
      e.preventDefault();
      handleBackButton();
      break;
  }
});

function navigateLeft() {
  if (navGroup === 'sidebar') return; // Cannot go further left
  
  if (navGroup === 'hero') {
    if (currentFocusElement.id === 'hero-fav-btn') {
      setFocus(document.getElementById('hero-play-btn'));
    } else {
      // Return to sidebar
      navGroup = 'sidebar';
      setFocus(document.querySelector('.sidebar .nav-item.active'));
    }
  } else if (navGroup === 'grids') {
    const activeRow = document.querySelector(`.movie-row[data-row-index="${focusedRowIndex}"]`);
    const cards = activeRow.querySelectorAll('.movie-card');
    
    if (focusedColIndex > 0) {
      focusedColIndex--;
      setFocus(cards[focusedColIndex]);
    } else {
      // Return to sidebar from first card in row
      navGroup = 'sidebar';
      setFocus(document.querySelector('.sidebar .nav-item.active'));
    }
  } else if (navGroup === 'search-grid' || navGroup === 'favorites-grid') {
    const activeContainer = activeView === 'search-view' ? searchResults : favoritesGrid;
    const cards = activeContainer.querySelectorAll('.movie-card');
    
    if (focusedColIndex > 0) {
      focusedColIndex--;
      // Find card at focusedRowIndex, focusedColIndex
      const nextCard = findGridCard(cards, focusedRowIndex, focusedColIndex);
      if (nextCard) setFocus(nextCard);
    } else {
      // Return to sidebar from leftmost column
      navGroup = 'sidebar';
      setFocus(document.querySelector('.sidebar .nav-item.active'));
    }
  } else if (navGroup === 'categories-grid') {
    const cards = categoriesGrid.querySelectorAll('.category-card');
    if (focusedColIndex > 0) {
      focusedColIndex--;
      const nextCard = findGridCard(cards, focusedRowIndex, focusedColIndex, 4); // assume 4 columns
      if (nextCard) setFocus(nextCard);
    } else {
      navGroup = 'sidebar';
      setFocus(document.querySelector('.sidebar .nav-item.active'));
    }
  } else if (navGroup === 'player') {
    // Navigate OSD player buttons
    if (currentFocusElement.id === 'btn-fullscreen') {
      setFocus(document.getElementById('btn-forward'));
    } else if (currentFocusElement.id === 'btn-forward') {
      setFocus(btnPlayPause);
    } else if (currentFocusElement.id === 'btn-play-pause') {
      setFocus(document.getElementById('btn-rewind'));
    } else if (currentFocusElement.id === 'btn-rewind') {
      setFocus(document.getElementById('player-back-btn'));
    }
  }
}

function navigateRight() {
  if (navGroup === 'sidebar') {
    // Jump from sidebar to main content
    if (activeView === 'home') {
      navGroup = 'hero';
      setFocus(document.getElementById('hero-play-btn'));
    } else if (activeView === 'search-view') {
      navGroup = 'search';
      setFocus(searchInput.parentElement);
    } else if (activeView === 'categories-view') {
      navGroup = 'categories-grid';
      focusedRowIndex = 0;
      focusedColIndex = 0;
      setFocus(categoriesGrid.querySelector('.category-card'));
    } else if (activeView === 'favorites-view') {
      const firstCard = favoritesGrid.querySelector('.movie-card');
      if (firstCard) {
        navGroup = 'favorites-grid';
        focusedRowIndex = 0;
        focusedColIndex = 0;
        setFocus(firstCard);
      }
    }
    return;
  }

  if (navGroup === 'hero') {
    if (currentFocusElement.id === 'hero-play-btn') {
      setFocus(document.getElementById('hero-fav-btn'));
    }
  } else if (navGroup === 'grids') {
    const activeRow = document.querySelector(`.movie-row[data-row-index="${focusedRowIndex}"]`);
    const cards = activeRow.querySelectorAll('.movie-card');
    
    if (focusedColIndex < cards.length - 1) {
      focusedColIndex++;
      setFocus(cards[focusedColIndex]);
    }
  } else if (navGroup === 'search-grid' || navGroup === 'favorites-grid') {
    const activeContainer = activeView === 'search-view' ? searchResults : favoritesGrid;
    const cards = activeContainer.querySelectorAll('.movie-card');
    
    focusedColIndex++;
    const nextCard = findGridCard(cards, focusedRowIndex, focusedColIndex);
    if (nextCard) {
      setFocus(nextCard);
    } else {
      focusedColIndex--; // bounds limit reached
    }
  } else if (navGroup === 'categories-grid') {
    const cards = categoriesGrid.querySelectorAll('.category-card');
    focusedColIndex++;
    const nextCard = findGridCard(cards, focusedRowIndex, focusedColIndex, 4);
    if (nextCard) {
      setFocus(nextCard);
    } else {
      focusedColIndex--;
    }
  } else if (navGroup === 'player') {
    if (currentFocusElement.id === 'player-back-btn') {
      setFocus(document.getElementById('btn-rewind'));
    } else if (currentFocusElement.id === 'btn-rewind') {
      setFocus(btnPlayPause);
    } else if (currentFocusElement.id === 'btn-play-pause') {
      setFocus(document.getElementById('btn-forward'));
    } else if (currentFocusElement.id === 'btn-forward') {
      setFocus(document.getElementById('btn-fullscreen'));
    }
  }
}

function navigateUp() {
  if (navGroup === 'sidebar') {
    const currentIdx = Array.from(sidebarItems).indexOf(currentFocusElement);
    if (currentIdx > 0) {
      setFocus(sidebarItems[currentIdx - 1]);
    }
    return;
  }

  if (navGroup === 'grids') {
    if (focusedRowIndex > 0) {
      focusedRowIndex--;
      const activeRow = document.querySelector(`.movie-row[data-row-index="${focusedRowIndex}"]`);
      const cards = activeRow.querySelectorAll('.movie-card');
      focusedColIndex = Math.min(focusedColIndex, cards.length - 1);
      setFocus(cards[focusedColIndex]);
    } else {
      // Jump up to Hero Banner buttons
      navGroup = 'hero';
      setFocus(document.getElementById('hero-play-btn'));
    }
  } else if (navGroup === 'search-grid' || navGroup === 'favorites-grid') {
    if (focusedRowIndex > 0) {
      focusedRowIndex--;
      const activeContainer = activeView === 'search-view' ? searchResults : favoritesGrid;
      const cards = activeContainer.querySelectorAll('.movie-card');
      const nextCard = findGridCard(cards, focusedRowIndex, focusedColIndex);
      if (nextCard) setFocus(nextCard);
    } else if (activeView === 'search-view') {
      // Jump up to search input box
      navGroup = 'search';
      setFocus(searchInput.parentElement);
    }
  } else if (navGroup === 'search') {
    // Nowhere to go above search box
  } else if (navGroup === 'categories-grid') {
    if (focusedRowIndex > 0) {
      focusedRowIndex--;
      const cards = categoriesGrid.querySelectorAll('.category-card');
      const nextCard = findGridCard(cards, focusedRowIndex, focusedColIndex, 4);
      if (nextCard) setFocus(nextCard);
    }
  } else if (navGroup === 'player') {
    // Jump up to Back Button
    if (currentFocusElement.id !== 'player-back-btn') {
      setFocus(document.getElementById('player-back-btn'));
    }
  }
}

function navigateDown() {
  if (navGroup === 'sidebar') {
    const currentIdx = Array.from(sidebarItems).indexOf(currentFocusElement);
    if (currentIdx < sidebarItems.length - 1) {
      setFocus(sidebarItems[currentIdx + 1]);
    }
    return;
  }

  if (navGroup === 'hero') {
    // Jump down to first slider grid row
    navGroup = 'grids';
    focusedRowIndex = 0;
    focusedColIndex = 0;
    const firstRowCard = document.querySelector('.movie-row[data-row-index="0"] .movie-card');
    if (firstRowCard) setFocus(firstRowCard);
  } else if (navGroup === 'grids') {
    const maxRows = document.querySelectorAll('.movie-row').length;
    if (focusedRowIndex < maxRows - 1) {
      focusedRowIndex++;
      const activeRow = document.querySelector(`.movie-row[data-row-index="${focusedRowIndex}"]`);
      const cards = activeRow.querySelectorAll('.movie-card');
      focusedColIndex = Math.min(focusedColIndex, cards.length - 1);
      setFocus(cards[focusedColIndex]);
    }
  } else if (navGroup === 'search') {
    // Jump down to search results grid
    const firstCard = searchResults.querySelector('.movie-card');
    if (firstCard) {
      navGroup = 'search-grid';
      focusedRowIndex = 0;
      focusedColIndex = 0;
      setFocus(firstCard);
    }
  } else if (navGroup === 'search-grid' || navGroup === 'favorites-grid') {
    const activeContainer = activeView === 'search-view' ? searchResults : favoritesGrid;
    const cards = activeContainer.querySelectorAll('.movie-card');
    
    focusedRowIndex++;
    const nextCard = findGridCard(cards, focusedRowIndex, focusedColIndex);
    if (nextCard) {
      setFocus(nextCard);
    } else {
      focusedRowIndex--; // Limit reached
    }
  } else if (navGroup === 'categories-grid') {
    const cards = categoriesGrid.querySelectorAll('.category-card');
    focusedRowIndex++;
    const nextCard = findGridCard(cards, focusedRowIndex, focusedColIndex, 4);
    if (nextCard) {
      setFocus(nextCard);
    } else {
      focusedRowIndex--;
    }
  } else if (navGroup === 'player') {
    // Jump down to play controls
    if (currentFocusElement.id === 'player-back-btn') {
      setFocus(btnPlayPause);
    }
  }
}

// Utility to find correct geometric element in multi-column grids
function findGridCard(cardsList, row, col, defaultColCount = null) {
  // If not explicitly provided, calculate column count dynamically by element placement width
  let colCount = defaultColCount;
  if (!colCount && cardsList.length > 1) {
    const firstCardX = cardsList[0].getBoundingClientRect().left;
    for (let i = 1; i < cardsList.length; i++) {
      if (cardsList[i].getBoundingClientRect().left === firstCardX) {
        colCount = i;
        break;
      }
    }
  }
  colCount = colCount || 5;
  
  const index = (row * colCount) + col;
  if (index >= 0 && index < cardsList.length) {
    // Double check that we are staying in the correct column bounds
    if (index % colCount === col) {
      return cardsList[index];
    }
  }
  return null;
}

function handleBackButton() {
  if (navGroup === 'player') {
    closePlayer();
  } else if (activeView !== 'home') {
    switchView('home');
  }
}

// Bind Sidebar Item clicks
sidebarItems.forEach(item => {
  item.onclick = () => {
    switchView(item.dataset.view);
  };
});

// Realtime live search bindings
searchInput.oninput = () => {
  filterAndRenderSearch(currentCategoryFilter);
};

document.getElementById('search-clear-btn').onclick = () => {
  searchInput.value = '';
  searchInput.focus();
  filterAndRenderSearch(currentCategoryFilter);
};

// On-demand playlist refresh trigger
document.getElementById('refresh-cache-btn').onclick = async () => {
  const btn = document.getElementById('refresh-cache-btn');
  const icon = btn.querySelector('i');
  
  icon.classList.add('fa-spin');
  btn.style.pointerEvents = 'none';
  
  try {
    const response = await fetch('/playlist.m3u?refresh=true');
    if (response.ok) {
      alert('Arşiv listesi başarıyla güncellendi! Portal yeniden yükleniyor.');
      location.reload();
    } else {
      throw new Error('Yenileme isteği sunucu tarafından reddedildi.');
    }
  } catch (error) {
    alert('Hata: Liste güncellenemedi. ' + error.message);
    icon.classList.remove('fa-spin');
    btn.style.pointerEvents = 'auto';
  }
};

// Initialize Application
window.onload = () => {
  loadM3U();
  // Focus Ana Sayfa sidebar item on startup
  setFocus(sidebarItems[0]);
};
