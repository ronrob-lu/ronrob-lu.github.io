/**
 * RonRob Luanti Mods - Voxel World Interactive Engine
 * Handles 3D Voxel Canvas, Web Audio API sound synthesis,
 * real-time mod filtering/search, and Minetest formspec modal interactions.
 */

(function () {
  'use strict';

  // State Management
  const state = {
    mods: typeof VOXEL_MODS_DATA !== 'undefined' ? VOXEL_MODS_DATA : [],
    filteredMods: [],
    currentCategory: 'all',
    searchQuery: '',
    sortBy: 'name-asc',
    soundEnabled: true,
    theme: 'day', // 'day', 'sunset', 'night'
    dioramaScene: 'island', // 'island', 'castle', 'monolith'
    dioramaAutoSpin: true
  };

  // ==========================================================================
  // WEB AUDIO API - RETRO 8-BIT SOUND SYNTHESIS
  // ==========================================================================
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
    }
  }

  function playTone(freq, type, duration, gainLevel = 0.05) {
    if (!state.soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = type; // 'square', 'sine', 'triangle'
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(gainLevel, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Audio might be blocked by browser policy until gesture
    }
  }

  const sfx = {
    click: () => playTone(600, 'square', 0.04, 0.03),
    openModal: () => {
      playTone(440, 'square', 0.06, 0.04);
      setTimeout(() => playTone(880, 'square', 0.08, 0.04), 50);
    },
    closeModal: () => playTone(280, 'square', 0.06, 0.04),
    tabSwitch: () => playTone(520, 'triangle', 0.05, 0.05),
    copy: () => {
      playTone(523.25, 'sine', 0.06, 0.05); // C5
      setTimeout(() => playTone(659.25, 'sine', 0.06, 0.05), 60); // E5
      setTimeout(() => playTone(783.99, 'sine', 0.1, 0.05), 120); // G5
    }
  };

  // ==========================================================================
  // THREE.JS 3D VOXEL DIORAMA ENGINE
  // ==========================================================================
  let scene, camera, renderer, dioramaGroup;
  let isDragging = false;
  let prevMousePos = { x: 0, y: 0 };

  function initThreeVoxelWorld() {
    const canvas = document.getElementById('voxelCanvas');
    if (!canvas || typeof THREE === 'undefined') return;

    // Scene & Camera
    scene = new THREE.Scene();

    const width = canvas.clientWidth || 400;
    const height = canvas.clientHeight || 300;

    // Isometric-feel Perspective Camera
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(18, 14, 18);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: false // Crisp pixel/voxel look
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 0.9);
    dirLight.position.set(20, 30, 15);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x7fb5ff, 0.35);
    fillLight.position.set(-20, -10, -20);
    scene.add(fillLight);

    // Voxel Root Group
    dioramaGroup = new THREE.Group();
    scene.add(dioramaGroup);

    buildVoxelScene(state.dioramaScene);

    // Mouse / Touch Interaction
    setupDioramaInteractions(canvas);

    // Resize Observer
    window.addEventListener('resize', onWindowResize);

    // Animation Loop
    animate();
  }

  function getVoxelMaterial(color, roughness = 0.9) {
    return new THREE.MeshLambertMaterial({ color: color });
  }

  function buildVoxelScene(type) {
    // Clear previous voxels
    while (dioramaGroup.children.length > 0) {
      const obj = dioramaGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      dioramaGroup.remove(obj);
    }

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const matGrass = getVoxelMaterial(0x59982f);
    const matGrassTop = getVoxelMaterial(0x7bc342);
    const matDirt = getVoxelMaterial(0x583c27);
    const matStone = getVoxelMaterial(0x707073);
    const matWater = new THREE.MeshLambertMaterial({ color: 0x2489da, transparent: true, opacity: 0.8 });
    const matSand = getVoxelMaterial(0xd8c37d);
    const matWood = getVoxelMaterial(0x775533);
    const matLeaves = getVoxelMaterial(0x448822);
    const matGold = getVoxelMaterial(0xffcc00);
    const matIron = getVoxelMaterial(0xd0d0d5);
    const matRed = getVoxelMaterial(0xdd3333);

    function addVoxel(x, y, z, mat) {
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(x, y, z);
      dioramaGroup.add(mesh);
      return mesh;
    }

    if (type === 'island') {
      // 9x9 Voxel Floating Island with tree, cabin & waterway
      for (let x = -4; x <= 4; x++) {
        for (let z = -4; z <= 4; z++) {
          const dist = Math.sqrt(x * x + z * z);
          if (dist > 4.6) continue;

          // Water strip
          if (x === 2 || (x === 1 && z >= 0)) {
            addVoxel(x, 0, z, matWater);
            addVoxel(x, -1, z, matSand);
          } else {
            // Dirt and grass layer
            addVoxel(x, 0, z, matGrassTop);
            addVoxel(x, -1, z, matDirt);
            if (dist < 3.2) {
              addVoxel(x, -2, z, matDirt);
            }
            if (dist < 2.0) {
              addVoxel(x, -3, z, matStone);
            }
          }
        }
      }

      // Voxel Tree
      const tx = -2, tz = -2;
      for (let ty = 1; ty <= 4; ty++) addVoxel(tx, ty, tz, matWood);
      // Leaves canopy
      for (let lx = -3; lx <= -1; lx++) {
        for (let lz = -3; lz <= -1; lz++) {
          addVoxel(lx, 4, lz, matLeaves);
          addVoxel(lx, 5, lz, matLeaves);
        }
      }
      addVoxel(tx, 6, tz, matLeaves);

      // Mini Voxel Robot / Builder Drone
      addVoxel(1, 1, -1, matIron);
      addVoxel(1, 2, -1, matGold);
      addVoxel(1, 2.5, -1, matRed); // antenna

    } else if (type === 'castle') {
      // Ancient Greco-Roman / Ephesus Portico diorama
      for (let x = -4; x <= 4; x++) {
        for (let z = -4; z <= 4; z++) {
          addVoxel(x, -1, z, matStone);
          if (x === -4 || x === 4 || z === -4 || z === 4) {
            addVoxel(x, 0, z, matStone);
          }
        }
      }
      // Columns
      const cols = [[-3, -3], [-3, 3], [3, -3], [3, 3], [0, -3], [0, 3]];
      cols.forEach(([cx, cz]) => {
        for (let y = 1; y <= 4; y++) addVoxel(cx, y, cz, matIron);
      });
      // Roof beam
      for (let x = -3; x <= 3; x++) {
        addVoxel(x, 5, -3, matIron);
        addVoxel(x, 5, 3, matIron);
        addVoxel(x, 6, 0, matGold);
      }
    } else {
      // Airplane & Waypoint Monolith
      for (let x = -3; x <= 3; x++) {
        for (let z = -3; z <= 3; z++) {
          addVoxel(x, -1, z, matGrass);
        }
      }
      // Waypoint tower
      for (let y = 0; y <= 5; y++) {
        addVoxel(0, y, 0, y % 2 === 0 ? matRed : matIron);
      }
      // Miniature Airliner flying above
      const py = 5;
      for (let pz = -2; pz <= 2; pz++) addVoxel(2, py, pz, matIron);
      addVoxel(1, py, 0, matIron);
      addVoxel(3, py, 0, matIron);
      addVoxel(2, py + 1, -2, matRed); // tail
    }
  }

  function setupDioramaInteractions(canvas) {
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging || !dioramaGroup) return;
      const deltaX = e.clientX - prevMousePos.x;
      const deltaY = e.clientY - prevMousePos.y;

      dioramaGroup.rotation.y += deltaX * 0.01;
      camera.position.y = Math.max(5, Math.min(25, camera.position.y - deltaY * 0.05));
      camera.lookAt(0, 0, 0);

      prevMousePos = { x: e.clientX, y: e.clientY };
    });

    // Touch support for mobile
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDragging = false;
    });

    window.addEventListener('touchmove', (e) => {
      if (!isDragging || !dioramaGroup || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - prevMousePos.x;
      dioramaGroup.rotation.y += deltaX * 0.01;
      prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
  }

  function onWindowResize() {
    const canvas = document.getElementById('voxelCanvas');
    if (!canvas || !camera || !renderer) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function animate() {
    requestAnimationFrame(animate);
    if (state.dioramaAutoSpin && dioramaGroup && !isDragging) {
      dioramaGroup.rotation.y += 0.007;
    }
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // ==========================================================================
  // MOD CATALOG RENDERING & FILTERING
  // ==========================================================================
  function filterAndSortMods() {
    let result = [...state.mods];

    // Category Filter
    if (state.currentCategory !== 'all') {
      result = result.filter(m => m.category === state.currentCategory);
    }

    // Search Query Filter
    if (state.searchQuery.trim() !== '') {
      const q = state.searchQuery.toLowerCase().trim();
      result = result.filter(m => {
        const title = (m.title || '').toLowerCase();
        const name = (m.name || '').toLowerCase();
        const desc = (m.description || '').toLowerCase();
        const deps = (m.depends || []).join(' ').toLowerCase();
        const optDeps = (m.optional_depends || []).join(' ').toLowerCase();
        const cat = (m.category_name || '').toLowerCase();
        return title.includes(q) || name.includes(q) || desc.includes(q) || deps.includes(q) || optDeps.includes(q) || cat.includes(q);
      });
    }

    // Sorting
    switch (state.sortBy) {
      case 'name-asc':
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'name-desc':
        result.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'recent':
        result.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        break;
      case 'category':
        result.sort((a, b) => a.category_name.localeCompare(b.category_name));
        break;
      default:
        break;
    }

    state.filteredMods = result;
    renderModCards();
  }

  function renderModCards() {
    const container = document.getElementById('modsGrid');
    const resultsCountEl = document.getElementById('resultsCount');
    if (!container) return;

    if (resultsCountEl) {
      resultsCountEl.textContent = `Showing ${state.filteredMods.length} of ${state.mods.length} mods`;
    }

    if (state.filteredMods.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⛏️</div>
          <h3>NO VOXEL MODS FOUND</h3>
          <p>No mods matched your search query or filter. Try another keyword or switch category tab.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.filteredMods.map(mod => {
      const icon = mod.category_icon || '📦';
      const depsPreview = (mod.depends || []).slice(0, 3).map(d => `<span class="dep-badge required">${escapeHtml(d)}</span>`).join('');
      const optPreview = (mod.optional_depends || []).slice(0, 2).map(d => `<span class="dep-badge">${escapeHtml(d)}</span>`).join('');

      return `
        <article class="mod-card" data-id="${escapeHtml(mod.id)}" tabindex="0" role="button" aria-label="${escapeHtml(mod.title)}">
          <div>
            <div class="mod-card-top">
              <div class="mod-icon-box" title="${escapeHtml(mod.category_name)}">
                <span>${icon}</span>
              </div>
              <div class="mod-card-header">
                <h4 class="mod-card-title">${escapeHtml(mod.title)}</h4>
                <div class="mod-card-meta">
                  <span>${escapeHtml(mod.name)}</span>
                  <span>&bull;</span>
                  <span>${escapeHtml(mod.language || 'Lua')}</span>
                </div>
              </div>
            </div>
            <p class="mod-card-desc">${escapeHtml(mod.description)}</p>
          </div>
          <div class="mod-card-footer">
            <div class="mod-deps-list">
              <span class="dep-badge category">${icon} ${escapeHtml(mod.category_name.split(' ')[0])}</span>
              ${depsPreview}
              ${optPreview}
            </div>
            <div class="card-action-hint">
              <span>FORMSPEC &gt;</span>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Attach click listeners to cards
    container.querySelectorAll('.mod-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        openModModal(id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const id = card.getAttribute('data-id');
          openModModal(id);
        }
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // MODAL / FORMSPEC DIALOG
  // ==========================================================================
  const modalOverlay = document.getElementById('modModalOverlay');

  function openModModal(id) {
    const mod = state.mods.find(m => m.id === id);
    if (!mod || !modalOverlay) return;

    sfx.openModal();

    // Fill data
    document.getElementById('modalCategoryIcon').textContent = mod.category_icon || '📦';
    document.getElementById('modalModTitle').textContent = mod.title;
    document.getElementById('modalRepoName').textContent = `ronrob-lu / ${mod.name}`;
    document.getElementById('modalFullDescription').textContent = mod.description;
    document.getElementById('modalCategoryVal').textContent = mod.category_name;
    document.getElementById('modalLanguageVal').textContent = mod.language || 'Lua';
    document.getElementById('modalAuthorVal').textContent = mod.author || 'ronrob-lu';
    document.getElementById('modalUpdatedVal').textContent = mod.updated_at || mod.created_at || '2026';

    // Install snippet
    document.getElementById('modalInstallCode').textContent = `git clone ${mod.clone_url}`;

    // GitHub link
    const ghBtn = document.getElementById('modalGithubBtn');
    if (ghBtn) ghBtn.href = mod.github_url;

    // Fallback or icon preview
    const iconDisplay = document.getElementById('modalIconDisplay');
    iconDisplay.innerHTML = `<span>${mod.category_icon || '📦'}</span>`;

    // Dependencies
    const depsContainer = document.getElementById('modalDependenciesList');
    const allDeps = [];
    if (mod.depends && mod.depends.length > 0) {
      mod.depends.forEach(d => allDeps.push(`<span class="dep-badge required">Required: ${escapeHtml(d)}</span>`));
    }
    if (mod.optional_depends && mod.optional_depends.length > 0) {
      mod.optional_depends.forEach(d => allDeps.push(`<span class="dep-badge">Optional: ${escapeHtml(d)}</span>`));
    }
    if (allDeps.length === 0) {
      depsContainer.innerHTML = '<span class="dep-badge">Standalone (Zero dependencies)</span>';
    } else {
      depsContainer.innerHTML = allDeps.join('');
    }

    // Readme overview
    const readmeContainer = document.getElementById('modalReadmeContainer');
    const readmeText = document.getElementById('modalReadmeText');
    if (mod.readme_snippet && mod.readme_snippet.trim()) {
      readmeText.textContent = mod.readme_snippet;
      readmeContainer.style.display = 'block';
    } else {
      readmeContainer.style.display = 'none';
    }

    // Show modal
    modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModModal() {
    if (!modalOverlay) return;
    sfx.closeModal();
    modalOverlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ==========================================================================
  // EVENT LISTENERS & INITIALIZATION
  // ==========================================================================
  function setupEventListeners() {
    // Category Tabs
    const tabsContainer = document.getElementById('categoryTabs');
    if (tabsContainer) {
      tabsContainer.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          sfx.tabSwitch();
          tabsContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.currentCategory = btn.getAttribute('data-cat');
          filterAndSortMods();
        });
      });
    }

    // Featured strip buttons
    document.querySelectorAll('.featured-tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const modId = btn.getAttribute('data-mod');
        openModModal(modId);
      });
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        filterAndSortMods();
      });
    }

    // Sort select
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sfx.click();
        state.sortBy = e.target.value;
        filterAndSortMods();
      });
    }

    // Modal close buttons
    const closeBtn = document.getElementById('modalCloseBtn');
    const closeFooterBtn = document.getElementById('modalCloseFooterBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeModModal);
    if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeModModal);

    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModModal();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('open')) {
        closeModModal();
      }
    });

    // Copy install command
    const copyBtn = document.getElementById('copyInstallBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const text = document.getElementById('modalInstallCode').textContent;
        navigator.clipboard.writeText(text).then(() => {
          sfx.copy();
          const orig = copyBtn.textContent;
          copyBtn.textContent = 'COPIED TO CLIPBOARD!';
          setTimeout(() => {
            copyBtn.textContent = orig;
          }, 2000);
        }).catch(() => {
          // Fallback
        });
      });
    }

    // Theme Toggle (Day -> Sunset -> Night -> Day)
    const themeBtn = document.getElementById('themeCycleBtn');
    const themeIcon = document.getElementById('themeIcon');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        sfx.click();
        if (state.theme === 'day') {
          state.theme = 'sunset';
          themeBtn.innerHTML = '<span id="themeIcon">🌅</span> SUNSET';
        } else if (state.theme === 'sunset') {
          state.theme = 'night';
          themeBtn.innerHTML = '<span id="themeIcon">🌙</span> NIGHT';
        } else {
          state.theme = 'day';
          themeBtn.innerHTML = '<span id="themeIcon">☀️</span> DAY';
        }
        document.documentElement.setAttribute('data-theme', state.theme);
      });
    }

    // Audio Toggle
    const audioBtn = document.getElementById('audioToggleBtn');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        state.soundEnabled = !state.soundEnabled;
        if (state.soundEnabled) {
          audioBtn.innerHTML = '<span id="audioIcon">🔊</span> SOUND: ON';
          sfx.click();
        } else {
          audioBtn.innerHTML = '<span id="audioIcon">🔇</span> SOUND: OFF';
        }
      });
    }

    // Diorama Preset Cycle
    const presetBtn = document.getElementById('dioramaPresetBtn');
    if (presetBtn) {
      presetBtn.addEventListener('click', () => {
        sfx.click();
        if (state.dioramaScene === 'island') {
          state.dioramaScene = 'castle';
          presetBtn.textContent = 'SCENE: EPHESUS';
        } else if (state.dioramaScene === 'castle') {
          state.dioramaScene = 'airliner';
          presetBtn.textContent = 'SCENE: AIRLINER';
        } else {
          state.dioramaScene = 'island';
          presetBtn.textContent = 'SCENE: ISLAND';
        }
        buildVoxelScene(state.dioramaScene);
      });
    }

    // Diorama Spin Toggle
    const spinBtn = document.getElementById('dioramaSpinBtn');
    if (spinBtn) {
      spinBtn.addEventListener('click', () => {
        sfx.click();
        state.dioramaAutoSpin = !state.dioramaAutoSpin;
        spinBtn.textContent = state.dioramaAutoSpin ? 'AUTO-SPIN: ON' : 'AUTO-SPIN: OFF';
      });
    }
  }

  // Update dynamic count tags
  function updateCategoryCounts() {
    const counts = {
      all: state.mods.length,
      ai_llm: 0,
      vehicles_transport: 0,
      mobs_creatures: 0,
      structures_cities: 0,
      worldgen_maps: 0,
      props_blocks: 0
    };

    state.mods.forEach(m => {
      if (counts[m.category] !== undefined) {
        counts[m.category]++;
      }
    });

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('countAll', counts.all);
    setEl('countAi', counts.ai_llm);
    setEl('countVehicles', counts.vehicles_transport);
    setEl('countMobs', counts.mobs_creatures);
    setEl('countStructures', counts.structures_cities);
    setEl('countWorldgen', counts.worldgen_maps);
    setEl('countProps', counts.props_blocks);

    setEl('statTotalMods', counts.all);
    setEl('statAiMods', counts.ai_llm);
    setEl('statVehicles', counts.vehicles_transport);
    setEl('statCreatures', counts.mobs_creatures);
  }

  // Initial Load
  document.addEventListener('DOMContentLoaded', () => {
    updateCategoryCounts();
    filterAndSortMods();
    setupEventListeners();
    initThreeVoxelWorld();
  });

})();
