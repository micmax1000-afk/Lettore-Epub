/**
 * EPUB Reader – Libreria + Segnalibri (IndexedDB)
 */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const libraryEl = $("#library");
  const readerEl = $("#reader");
  const loading = $("#loading");
  const loadingText = $("#loading-text");
  const fileInput = $("#file-input");
  const bookGrid = $("#book-grid");
  const libEmpty = $("#lib-empty");
  const libCount = $("#lib-count");
  const viewer = $("#viewer");
  const tocEl = $("#toc");
  const bookmarksPanel = $("#bookmarks-panel");
  const sidebar = $("#sidebar");
  const sidebarTitle = $("#sidebar-title");
  const bookTitle = $("#book-title");
  const bookAuthor = $("#book-author");
  const locationInfo = $("#location-info");
  const progressBar = $("#progress");
  const toastEl = $("#toast");

  let book = null;
  let rendition = null;
  let currentBookId = null;
  let currentFontSize = 100;
  let currentTheme = localStorage.getItem("epub-theme") || "dark";
  let currentCfi = null;
  let currentPercent = 0;
  let db = null;

  // TTS state
  let ttsUtterance = null;
  let ttsSpeaking = false;
  let ttsPaused = false;
  let ttsQueue = [];
  let ttsIndex = 0;
  let ttsVoices = [];
  let ttsDoc = null;  // iframe document for highlighting


  document.documentElement.setAttribute("data-theme", currentTheme);

  // ---------- IndexedDB ----------
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("epub-reader-db", 1);
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains("books")) {
          database.createObjectStore("books", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("bookmarks")) {
          const store = database.createObjectStore("bookmarks", { keyPath: "id", autoIncrement: true });
          store.createIndex("bookId", "bookId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbPut(store, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function dbGet(store, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbGetAll(store) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function dbDelete(store, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function dbGetBookmarks(bookId) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("bookmarks", "readonly");
      const idx = tx.objectStore("bookmarks").index("bookId");
      const req = idx.getAll(bookId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function dbDeleteBookmarksForBook(bookId) {
    return dbGetBookmarks(bookId).then((list) =>
      Promise.all(list.map((b) => dbDelete("bookmarks", b.id)))
    );
  }

  // ---------- UI helpers ----------
  function showLoading(show, text) {
    loading.classList.toggle("hidden", !show);
    if (text) loadingText.textContent = text;
  }

  function showToast(msg, ms = 2000) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add("hidden"), ms);
  }

  function showLibrary() {
    readerEl.classList.add("hidden");
    libraryEl.classList.remove("hidden");
    destroyReader();
    renderLibrary();
  }

  function showReaderView() {
    libraryEl.classList.add("hidden");
    readerEl.classList.remove("hidden");
  }

  function toggleSidebar(force) {
    sidebar.classList.toggle("open", force);
  }

  function destroyReader() {
    stopTTS();
    if (book) {
      try { book.destroy(); } catch (_) {}
      book = null;
      rendition = null;
    }
    viewer.innerHTML = "";
    tocEl.innerHTML = "";
    bookmarksPanel.innerHTML = "";
    currentBookId = null;
    currentCfi = null;
    const panel = $("#tts-panel");
    if (panel) panel.classList.add("hidden");
    const btn = $("#btn-tts");
    if (btn) btn.classList.remove("tts-active");
  }

  // ---------- Library ----------
  async function renderLibrary() {
    const books = await dbGetAll("books");
    books.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));

    bookGrid.innerHTML = "";
    libCount.textContent = books.length
      ? `${books.length} libr${books.length === 1 ? "o" : "i"}`
      : "";

    if (!books.length) {
      libEmpty.classList.remove("hidden");
      return;
    }
    libEmpty.classList.add("hidden");

    books.forEach((b) => {
      const card = document.createElement("div");
      card.className = "book-card";
      card.dataset.id = b.id;

      let coverHtml;
      if (b.coverUrl) {
        coverHtml = `<img class="book-cover" src="${b.coverUrl}" alt="" loading="lazy" />`;
      } else {
        const short = (b.title || b.filename || "Libro").slice(0, 40);
        coverHtml = `<div class="book-cover-placeholder">${escapeHtml(short)}</div>`;
      }

      const pct = Math.round(b.percent || 0);
      card.innerHTML = `
        ${coverHtml}
        <button class="book-delete" data-id="${b.id}" title="Elimina" aria-label="Elimina">✕</button>
        <div class="book-meta">
          <div class="book-meta-title">${escapeHtml(b.title || b.filename)}</div>
          <div class="book-meta-progress">${pct}%</div>
        </div>
      `;

      card.addEventListener("click", (e) => {
        if (e.target.closest(".book-delete")) return;
        openBookFromLibrary(b.id);
      });

      card.querySelector(".book-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Eliminare "${b.title || b.filename}"?`)) return;
        if (b.coverUrl) URL.revokeObjectURL(b.coverUrl);
        await dbDelete("books", b.id);
        await dbDeleteBookmarksForBook(b.id);
        renderLibrary();
        showToast("Libro eliminato");
      });

      bookGrid.appendChild(card);
    });

    // Add button card
    const addLabel = document.createElement("label");
    addLabel.className = "add-card";
    addLabel.htmlFor = "file-input";
    addLabel.textContent = "+";
    addLabel.title = "Aggiungi libro";
    bookGrid.appendChild(addLabel);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- Import EPUB ----------
  async function importFiles(files) {
    const list = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".epub"));
    if (!list.length) {
      alert("Seleziona uno o più file .epub");
      return;
    }

    showLoading(true, `Importazione 0/${list.length}…`);

    for (let i = 0; i < list.length; i++) {
      loadingText.textContent = `Importazione ${i + 1}/${list.length}…`;
      try {
        await importOneFile(list[i]);
      } catch (err) {
        console.error(err);
        showToast(`Errore: ${list[i].name}`);
      }
    }

    showLoading(false);
    renderLibrary();
    showToast(list.length === 1 ? "Libro aggiunto" : `${list.length} libri aggiunti`);
  }

  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }

  async function importOneFile(file) {
    const data = await readAsArrayBuffer(file);
    const id = "book-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

    // Parse metadata & cover with epub.js (temporary)
    const tmp = ePub(data);
    await tmp.ready;

    let title = file.name.replace(/\.epub$/i, "");
    let author = "";
    try {
      const meta = await tmp.loaded.metadata;
      if (meta.title) title = meta.title;
      if (meta.creator) author = meta.creator;
    } catch (_) {}

    let coverBlob = null;
    try {
      const coverUrl = await tmp.coverUrl();
      if (coverUrl) {
        const res = await fetch(coverUrl);
        coverBlob = await res.blob();
      }
    } catch (_) {}

    tmp.destroy();

    const record = {
      id,
      filename: file.name,
      title,
      author,
      data,
      coverBlob,
      coverUrl: coverBlob ? URL.createObjectURL(coverBlob) : null,
      cfi: null,
      percent: 0,
      lastOpened: Date.now(),
      addedAt: Date.now(),
    };

    // Store without coverUrl (blob URLs aren't persistent)
    const toStore = { ...record, coverUrl: null };
    await dbPut("books", toStore);

    // Keep coverUrl in memory for current session via re-hydrate later
    return record;
  }

  async function hydrateCovers(books) {
    for (const b of books) {
      if (b.coverBlob && !b.coverUrl) {
        b.coverUrl = URL.createObjectURL(b.coverBlob);
      }
    }
    return books;
  }

  // ---------- Open book ----------
  async function openBookFromLibrary(id) {
    showLoading(true, "Apertura libro…");
    const record = await dbGet("books", id);
    if (!record || !record.data) {
      showLoading(false);
      alert("Libro non trovato.");
      return;
    }

    record.lastOpened = Date.now();
    await dbPut("books", { ...record, coverUrl: null });

    currentBookId = id;
    openBookData(record.data, record);
  }

  function openBookData(data, meta) {
    destroyReader();
    currentBookId = meta.id;
    bookTitle.textContent = meta.title || meta.filename || "Libro";
    bookAuthor.textContent = meta.author || "";

    try {
      book = ePub(data);

      book.ready
        .then(() => book.loaded.navigation)
        .then((nav) => {
          tocEl.innerHTML = "";
          renderToc(nav.toc);
        })
        .then(() => {
          const isMobile =
            window.matchMedia("(max-width: 768px)").matches ||
            ("ontouchstart" in window && window.innerWidth < 1024);

          const opts = isMobile
            ? { width: "100%", height: "100%", flow: "scrolled-doc", manager: "default", allowScriptedContent: true }
            : { width: "100%", height: "100%", flow: "paginated", manager: "default", spread: "none", allowScriptedContent: true };

          rendition = book.renderTo("viewer", opts);
          window.__epubIsMobile = isMobile;

          rendition.themes.default({
            html: { margin: "0 !important", padding: "0 !important", width: "100% !important", "max-width": "100% !important", "overflow-x": "hidden !important" },
            body: {
              margin: "0 auto !important",
              padding: isMobile ? "12px 16px 40px !important" : "20px 28px !important",
              width: "100% !important",
              "max-width": "100% !important",
              "box-sizing": "border-box !important",
              "line-height": "1.7 !important",
              "word-wrap": "break-word !important",
              "overflow-wrap": "break-word !important",
              "overflow-x": "hidden !important",
            },
            "p, div, span, li, h1, h2, h3, h4, h5, h6, blockquote": {
              "max-width": "100% !important",
              "word-wrap": "break-word !important",
              "overflow-wrap": "break-word !important",
            },
            "img, svg, video, table": { "max-width": "100% !important", height: "auto !important" },
          });

          applyFontSize();
          applyThemeToBook();

          return rendition.display(meta.cfi || undefined);
        })
        .then(() => {
          showLoading(false);
          showReaderView();
          if (window.__epubIsMobile) {
            const overlay = document.querySelector(".nav-overlay");
            if (overlay) overlay.style.display = "none";
          } else {
            const overlay = document.querySelector(".nav-overlay");
            if (overlay) overlay.style.display = "";
          }
          updateLocation();
          generateLocations();
        })
        .catch((err) => {
          console.error(err);
          showLoading(false);
          alert("Impossibile aprire l'ebook.");
        });

      book.ready.then(() => {
        rendition.on("relocated", (location) => {
          currentCfi = location.start.cfi;
          updateLocation(location);
          highlightToc(location.start.href);
          saveProgress();
        });

        if (!window.__epubIsMobile) {
          rendition.on("click", (e) => {
            if (e.target && (e.target.tagName === "A" || e.target.closest?.("a"))) return;
            const iframe = viewer.querySelector("iframe");
            if (!iframe) return;
            const rect = iframe.getBoundingClientRect();
            const x = e.clientX ?? e.detail?.clientX;
            if (x == null) return;
            const rx = x - rect.left;
            if (rx < rect.width * 0.3) goPrev();
            else if (rx > rect.width * 0.7) goNext();
          });
        }

        rendition.on("keyup", handleKey);
        document.addEventListener("keyup", handleKey);
      });
    } catch (err) {
      console.error(err);
      showLoading(false);
      alert("Errore apertura EPUB.");
    }
  }

  async function saveProgress() {
    if (!currentBookId || !currentCfi) return;
    try {
      const record = await dbGet("books", currentBookId);
      if (!record) return;
      record.cfi = currentCfi;
      record.percent = currentPercent;
      record.lastOpened = Date.now();
      record.coverUrl = null;
      await dbPut("books", record);
    } catch (_) {}
  }

  // ---------- TOC ----------
  function renderToc(items, level = 1) {
    items.forEach((item) => {
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = (item.label || "").trim();
      a.className = `toc-level-${Math.min(level, 3)}`;
      a.dataset.href = item.href;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (rendition) {
          rendition.display(item.href);
          toggleSidebar(false);
        }
      });
      tocEl.appendChild(a);
      if (item.subitems?.length) renderToc(item.subitems, level + 1);
    });
  }

  function highlightToc(href) {
    tocEl.querySelectorAll("a").forEach((a) => {
      a.classList.toggle(
        "active",
        a.dataset.href && href && href.includes(a.dataset.href.split("#")[0])
      );
    });
  }

  // ---------- Bookmarks ----------
  async function addBookmark() {
    if (!currentBookId || !currentCfi) {
      showToast("Posizione non disponibile");
      return;
    }
    const label = prompt("Nome segnalibro (opzionale):", `Segnalibro ${new Date().toLocaleString("it-IT")}`);
    if (label === null) return; // cancelled

    await dbPut("bookmarks", {
      bookId: currentBookId,
      cfi: currentCfi,
      label: label || `Posizione ${Math.round(currentPercent)}%`,
      percent: currentPercent,
      createdAt: Date.now(),
    });
    showToast("Segnalibro salvato");
  }

  async function showBookmarksPanel() {
    tocEl.classList.add("hidden");
    bookmarksPanel.classList.remove("hidden");
    sidebarTitle.textContent = "Segnalibri";
    toggleSidebar(true);

    const list = await dbGetBookmarks(currentBookId);
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    bookmarksPanel.innerHTML = "";

    if (!list.length) {
      bookmarksPanel.innerHTML = '<div class="bm-empty">Nessun segnalibro.<br>Tocca 🔖 per aggiungerne uno.</div>';
      return;
    }

    list.forEach((bm) => {
      const row = document.createElement("div");
      row.className = "bm-item";
      row.innerHTML = `
        <span class="bm-label">${escapeHtml(bm.label || "Segnalibro")}${bm.percent != null ? ` · ${Math.round(bm.percent)}%` : ""}</span>
        <button class="bm-delete" title="Elimina">✕</button>
      `;
      row.querySelector(".bm-label").addEventListener("click", () => {
        if (rendition) rendition.display(bm.cfi);
        toggleSidebar(false);
      });
      row.querySelector(".bm-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        await dbDelete("bookmarks", bm.id);
        showBookmarksPanel();
        showToast("Segnalibro eliminato");
      });
      bookmarksPanel.appendChild(row);
    });
  }

  function showTocPanel() {
    bookmarksPanel.classList.add("hidden");
    tocEl.classList.remove("hidden");
    sidebarTitle.textContent = "Sommario";
    toggleSidebar();
  }

  // ---------- Location ----------
  function updateLocation(location) {
    if (!location && rendition) {
      try { location = rendition.currentLocation(); } catch (_) { return; }
    }
    if (!location?.start) return;

    const page = location.start.displayed?.page || 0;
    const total = location.start.displayed?.total || 0;
    let percentage = 0;

    if (book?.locations && typeof book.locations.length === "function" && book.locations.length()) {
      try {
        percentage = Math.round(book.locations.percentageFromCfi(location.start.cfi) * 100);
      } catch (_) {
        percentage = total ? Math.round((page / total) * 100) : 0;
      }
    } else if (total) {
      percentage = Math.round((page / total) * 100);
    }

    currentPercent = percentage;
    locationInfo.textContent = total > 1 ? `${page}/${total}` : percentage > 0 ? `${percentage}%` : "—";
    progressBar.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
  }

  function generateLocations() {
    if (!book) return;
    try {
      if (book.locations?.length?.()) return;
      book.locations.generate(1600).then(() => updateLocation()).catch(() => {});
    } catch (_) {}
  }

  // ---------- Font / Theme ----------
  function applyFontSize() {
    if (rendition) rendition.themes.fontSize(`${currentFontSize}%`);
  }
  function changeFontSize(d) {
    currentFontSize = Math.max(70, Math.min(180, currentFontSize + d));
    applyFontSize();
  }
  function applyThemeToBook() {
    if (!rendition) return;
    if (currentTheme === "dark") {
      rendition.themes.override("color", "#e8e6e3");
      rendition.themes.override("background", "#121212");
    } else {
      rendition.themes.override("color", "#1a1a1a");
      rendition.themes.override("background", "#f5f5f7");
    }
  }
  function toggleTheme() {
    currentTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", currentTheme);
    localStorage.setItem("epub-theme", currentTheme);
    applyThemeToBook();
  }

  // ---------- Nav ----------
  function goPrev() { if (rendition) rendition.prev(); }
  function goNext() { if (rendition) rendition.next(); }
  function handleKey(e) {
    if (!rendition) return;
    if (e.key === "ArrowLeft" || e.key === "h") goPrev();
    if (e.key === "ArrowRight" || e.key === "l") goNext();
    if (e.key === "+" || e.key === "=") changeFontSize(10);
    if (e.key === "-") changeFontSize(-10);
    if (e.key === "t") toggleTheme();
    if (e.key === "Escape") toggleSidebar(false);
    if (e.key === "b") addBookmark();
  }

  // ---------- Events ----------
  fileInput.addEventListener("change", (e) => {
    if (e.target.files?.length) importFiles(e.target.files);
    fileInput.value = "";
  });

  $("#btn-back").addEventListener("click", async () => {
    await saveProgress();
    showLibrary();
  });
  $("#btn-toc").addEventListener("click", showTocPanel);
  $("#btn-close-toc").addEventListener("click", () => toggleSidebar(false));
  $("#btn-bookmark").addEventListener("click", addBookmark);
  $("#btn-bookmarks-list").addEventListener("click", showBookmarksPanel);
  $("#btn-prev").addEventListener("click", (e) => { e.preventDefault(); goPrev(); });
  $("#btn-next").addEventListener("click", (e) => { e.preventDefault(); goNext(); });
  $("#btn-prev-mobile").addEventListener("click", (e) => { e.preventDefault(); goPrev(); });
  $("#btn-next-mobile").addEventListener("click", (e) => { e.preventDefault(); goNext(); });
  $("#btn-font-inc").addEventListener("click", () => changeFontSize(10));
  $("#btn-font-dec").addEventListener("click", () => changeFontSize(-10));
  $("#btn-theme").addEventListener("click", toggleTheme);
  $("#btn-theme-lib").addEventListener("click", toggleTheme);

  // TTS controls
  $("#btn-tts")?.addEventListener("click", () => {
    const panel = $("#tts-panel");
    if (panel?.classList.contains("hidden")) {
      toggleTTSPanel();
      startTTS();
    } else if (ttsSpeaking || ttsPaused) {
      pauseResumeTTS();
    } else {
      startTTS();
    }
  });
  $("#tts-play")?.addEventListener("click", () => {
    if (!ttsQueue.length) startTTS();
    else pauseResumeTTS();
  });
  $("#tts-stop")?.addEventListener("click", () => stopTTS(true));
  $("#tts-close")?.addEventListener("click", () => stopTTS(true));
  $("#tts-rate")?.addEventListener("input", () => {
    localStorage.setItem("epub-tts-rate", $("#tts-rate").value);
  });
  $("#tts-voice")?.addEventListener("change", () => {
    localStorage.setItem("epub-tts-voice", $("#tts-voice").value);
  });

  // Load voices (Edge/Chrome load async)
  if ("speechSynthesis" in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    const savedRate = localStorage.getItem("epub-tts-rate");
    if (savedRate && $("#tts-rate")) $("#tts-rate").value = savedRate;
  }


  document.addEventListener("click", (e) => {
    if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && e.target !== $("#btn-toc") && e.target !== $("#btn-bookmarks-list")) {
      toggleSidebar(false);
    }
  });

  // Drag & drop on library
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) importFiles(e.dataTransfer.files);
  });

  // Swipe on overlay
  let touchStartX = 0, touchStartY = 0;
  const wrapper = document.querySelector(".viewer-wrapper");
  wrapper.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });
  wrapper.addEventListener("touchend", (e) => {
    if (window.__epubIsMobile) return; // scrolled mode
    const dx = e.changedTouches[0].screenX - touchStartX;
    const dy = e.changedTouches[0].screenY - touchStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) goPrev(); else goNext();
    }
  }, { passive: true });

  // Init
  (async () => {
    try {
      db = await openDB();
      // Re-hydrate cover URLs
      const books = await dbGetAll("books");
      for (const b of books) {
        if (b.coverBlob && !b.coverUrl) {
          // coverUrl is session-only; renderLibrary will create from blob
        }
      }
      await renderLibraryWithCovers();
    } catch (err) {
      console.error(err);
      alert("Errore inizializzazione database locale.");
    }
  })();

  async function renderLibraryWithCovers() {
    const books = await dbGetAll("books");
    // Attach temporary object URLs for display
    for (const b of books) {
      if (b.coverBlob) b.coverUrl = URL.createObjectURL(b.coverBlob);
    }
    // Monkey-patch: store hydrated list for render
    // Simpler: rewrite render to load covers itself
    bookGrid.innerHTML = "";
    libCount.textContent = books.length ? `${books.length} libr${books.length === 1 ? "o" : "i"}` : "";
    if (!books.length) {
      libEmpty.classList.remove("hidden");
      return;
    }
    libEmpty.classList.add("hidden");
    books.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));

    books.forEach((b) => {
      const card = document.createElement("div");
      card.className = "book-card";
      let coverHtml;
      if (b.coverUrl) {
        coverHtml = `<img class="book-cover" src="${b.coverUrl}" alt="" loading="lazy" />`;
      } else {
        coverHtml = `<div class="book-cover-placeholder">${escapeHtml((b.title || b.filename || "Libro").slice(0, 40))}</div>`;
      }
      const pct = Math.round(b.percent || 0);
      card.innerHTML = `
        ${coverHtml}
        <button class="book-delete" data-id="${b.id}" title="Elimina">✕</button>
        <div class="book-meta">
          <div class="book-meta-title">${escapeHtml(b.title || b.filename)}</div>
          <div class="book-meta-progress">${pct}%</div>
        </div>
      `;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".book-delete")) return;
        openBookFromLibrary(b.id);
      });
      card.querySelector(".book-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`Eliminare "${b.title || b.filename}"?`)) return;
        if (b.coverUrl) URL.revokeObjectURL(b.coverUrl);
        await dbDelete("books", b.id);
        await dbDeleteBookmarksForBook(b.id);
        renderLibraryWithCovers();
        showToast("Libro eliminato");
      });
      bookGrid.appendChild(card);
    });

    const addLabel = document.createElement("label");
    addLabel.className = "add-card";
    addLabel.htmlFor = "file-input";
    addLabel.textContent = "+";
    addLabel.title = "Aggiungi libro";
    bookGrid.appendChild(addLabel);
  }


  // ---------- Text-to-Speech (Web Speech API / Edge neural voices) ----------
  function loadVoices() {
    ttsVoices = speechSynthesis.getVoices() || [];
    const sel = $("#tts-voice");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = "";

    // Prefer Microsoft / Edge neural voices, then Italian, then others
    const scored = ttsVoices.map((v, i) => {
      let score = 0;
      const n = (v.name + " " + v.lang).toLowerCase();
      if (n.includes("microsoft") || n.includes("neural") || n.includes("online")) score += 50;
      if (v.lang.toLowerCase().startsWith("it")) score += 30;
      if (n.includes("natural") || n.includes("enhanced")) score += 10;
      if (v.default) score += 5;
      return { v, i, score };
    }).sort((a, b) => b.score - a.score || a.v.name.localeCompare(b.v.name));

    scored.forEach(({ v }) => {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      sel.appendChild(opt);
    });

    // Restore previous or pick best Italian / Microsoft
    if (prev && [...sel.options].some((o) => o.value === prev)) {
      sel.value = prev;
    } else {
      const best = scored.find((s) => s.v.lang.toLowerCase().startsWith("it")) || scored[0];
      if (best) sel.value = best.v.voiceURI;
    }

    const saved = localStorage.getItem("epub-tts-voice");
    if (saved && [...sel.options].some((o) => o.value === saved)) sel.value = saved;
  }

  function getSelectedVoice() {
    const uri = $("#tts-voice")?.value;
    return ttsVoices.find((v) => v.voiceURI === uri) || null;
  }

  function extractTextFromDoc(doc) {
    if (!doc || !doc.body) return "";
    const clone = doc.body.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, svg, img").forEach((el) => el.remove());
    let text = clone.innerText || clone.textContent || "";
    text = text.replace(/\r/g, "\n");
    text = text.replace(/[ \t]+\n/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.trim();
  }

  function splitSentences(text) {
    const parts = text
      .split(/(?<=[.!?…])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const merged = [];
    for (const p of parts) {
      if (merged.length && merged[merged.length - 1].length < 40 && p.length < 80) {
        merged[merged.length - 1] += " " + p;
      } else {
        merged.push(p);
      }
    }
    return merged;
  }

  function getIframeDocument() {
    try {
      const iframe = viewer.querySelector("iframe");
      return iframe?.contentDocument || null;
    } catch (_) {
      return null;
    }
  }

  function injectHighlightStyle(doc) {
    if (!doc) return;
    if (doc.getElementById("tts-highlight-style")) return;
    const style = doc.createElement("style");
    style.id = "tts-highlight-style";
    style.textContent = `
      .tts-highlight {
        background: rgba(255, 213, 74, 0.85) !important;
        color: #111 !important;
        border-radius: 3px;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
        transition: background 0.15s ease;
      }
      [data-theme="dark"] .tts-highlight,
      .tts-highlight {
        background: rgba(255, 200, 50, 0.9) !important;
      }
    `;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function clearTTSHighlight() {
    const doc = ttsDoc || getIframeDocument();
    if (!doc) return;
    doc.querySelectorAll(".tts-highlight").forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    });
  }

  function normalizeForMatch(s) {
    return s.replace(/\s+/g, " ").trim().toLowerCase();
  }

  /** Highlight first occurrence of sentence text inside the iframe document */
  function highlightSentence(sentence) {
    clearTTSHighlight();
    const doc = ttsDoc || getIframeDocument();
    if (!doc || !doc.body || !sentence) return;

    injectHighlightStyle(doc);
    const target = normalizeForMatch(sentence);
    if (target.length < 2) return;

    // Collect text nodes
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (p && /^(script|style|noscript)$/i.test(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    if (!nodes.length) return;

    // Build full text map with offsets
    let full = "";
    const map = []; // { node, start, end }
    for (const node of nodes) {
      const t = node.nodeValue.replace(/\s+/g, " ");
      // keep original for slicing but search on normalized continuous string
      const start = full.length;
      full += node.nodeValue;
      map.push({ node, start, end: full.length });
    }

    const fullNorm = full.replace(/\s+/g, " ").toLowerCase();
    // Map normalized index back is hard; search in collapsed form with approximate locate
    // Simpler approach: search original full with flexible whitespace
    const pattern = sentence
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    let match;
    try {
      match = new RegExp(pattern).exec(full);
    } catch (_) {
      match = null;
    }
    if (!match) {
      // fallback: first 40 chars
      const short = sentence.trim().slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      try {
        match = new RegExp(short).exec(full);
      } catch (_) {}
    }
    if (!match) return;

    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;

    // Find start/end nodes
    let startNode, startOffset, endNode, endOffset;
    for (const m of map) {
      if (startNode == null && matchStart >= m.start && matchStart < m.end) {
        startNode = m.node;
        startOffset = matchStart - m.start;
      }
      if (matchEnd > m.start && matchEnd <= m.end) {
        endNode = m.node;
        endOffset = matchEnd - m.start;
      }
    }
    if (!startNode || !endNode) return;

    try {
      const range = doc.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const span = doc.createElement("span");
      span.className = "tts-highlight";
      range.surroundContents(span);
      // Scroll into view
      span.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch (err) {
      // surroundContents fails if range crosses element boundaries – use extractContents
      try {
        const range = doc.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        const span = doc.createElement("span");
        span.className = "tts-highlight";
        span.appendChild(range.extractContents());
        range.insertNode(span);
        span.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (e2) {
        console.warn("highlight failed", e2);
      }
    }
  }

  async function getCurrentChapterText() {
    ttsDoc = getIframeDocument();
    if (!book || !rendition) return "";
    try {
      if (ttsDoc) return extractTextFromDoc(ttsDoc);
      const loc = rendition.currentLocation();
      const href = loc?.start?.href;
      if (!href) return "";
      const section = book.section(href);
      if (!section) return "";
      await section.load();
      if (section.document) {
        ttsDoc = section.document;
        return extractTextFromDoc(section.document);
      }
    } catch (err) {
      console.warn("TTS text extract:", err);
    }
    ttsDoc = getIframeDocument();
    if (ttsDoc) return extractTextFromDoc(ttsDoc);
    return "";
  }

  function speakNext() {
    if (!ttsQueue.length || ttsIndex >= ttsQueue.length) {
      clearTTSHighlight();
      ttsSpeaking = false;
      ttsPaused = false;
      updateTTSButtons();
      showToast("Lettura completata");
      return;
    }
    const text = ttsQueue[ttsIndex];
    highlightSentence(text);

    const u = new SpeechSynthesisUtterance(text);
    const voice = getSelectedVoice();
    if (voice) u.voice = voice;
    u.rate = parseFloat($("#tts-rate")?.value || "1");
    u.pitch = 1;
    u.lang = voice?.lang || "it-IT";

    u.onend = () => {
      ttsIndex++;
      if (ttsSpeaking && !ttsPaused) speakNext();
      else clearTTSHighlight();
    };
    u.onerror = () => {
      ttsIndex++;
      if (ttsSpeaking && !ttsPaused) speakNext();
      else clearTTSHighlight();
    };

    ttsUtterance = u;
    speechSynthesis.speak(u);
    ttsSpeaking = true;
    ttsPaused = false;
    updateTTSButtons();
  }

  async function startTTS() {
    if (!("speechSynthesis" in window)) {
      alert("Il tuo browser non supporta la sintesi vocale.\nUsa Microsoft Edge o Chrome per le migliori voci.");
      return;
    }
    stopTTS(false);
    showLoading(true, "Preparazione audio…");
    ttsDoc = getIframeDocument();
    injectHighlightStyle(ttsDoc);
    const text = await getCurrentChapterText();
    showLoading(false);
    if (!text || text.length < 5) {
      showToast("Nessun testo da leggere in questo capitolo");
      return;
    }
    ttsQueue = splitSentences(text);
    ttsIndex = 0;
    ttsSpeaking = true;
    ttsPaused = false;
    $("#tts-panel")?.classList.remove("hidden");
    $("#btn-tts")?.classList.add("tts-active");
    speechSynthesis.cancel();
    setTimeout(() => speakNext(), 80);
    showToast("Lettura avviata");
  }

  function pauseResumeTTS() {
    if (!ttsSpeaking && !ttsPaused && ttsQueue.length) {
      ttsSpeaking = true;
      ttsPaused = false;
      speakNext();
      updateTTSButtons();
      return;
    }
    if (ttsPaused) {
      speechSynthesis.resume();
      ttsPaused = false;
      ttsSpeaking = true;
    } else if (ttsSpeaking) {
      speechSynthesis.pause();
      ttsPaused = true;
    }
    updateTTSButtons();
  }

  function stopTTS(hidePanel = true) {
    try { speechSynthesis.cancel(); } catch (_) {}
    clearTTSHighlight();
    ttsSpeaking = false;
    ttsPaused = false;
    ttsUtterance = null;
    ttsQueue = [];
    ttsIndex = 0;
    ttsDoc = null;
    updateTTSButtons();
    if (hidePanel) {
      $("#tts-panel")?.classList.add("hidden");
      $("#btn-tts")?.classList.remove("tts-active");
    }
  }

  function updateTTSButtons() {
    const play = $("#tts-play");
    if (!play) return;
    if (ttsSpeaking && !ttsPaused) play.textContent = "⏸";
    else play.textContent = "▶";
  }

  function toggleTTSPanel() {
    const panel = $("#tts-panel");
    if (!panel) return;
    if (panel.classList.contains("hidden")) {
      panel.classList.remove("hidden");
      loadVoices();
      $("#btn-tts")?.classList.add("tts-active");
    } else if (!ttsSpeaking && !ttsPaused) {
      panel.classList.add("hidden");
      $("#btn-tts")?.classList.remove("tts-active");
    } else {
      // panel open while speaking -> stop
      stopTTS(true);
    }
  }


  // Override renderLibrary to use covers version
  renderLibrary = renderLibraryWithCovers;
})();
