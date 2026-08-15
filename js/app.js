/**
 * EPUB Reader – Web App
 * Pure client-side reader using epub.js
 */

(() => {
  "use strict";

  // DOM elements
  const $ = (sel) => document.querySelector(sel);
  const welcome = $("#welcome");
  const reader = $("#reader");
  const loading = $("#loading");
  const fileInput = $("#file-input");
  const viewer = $("#viewer");
  const tocEl = $("#toc");
  const sidebar = $("#sidebar");
  const bookTitle = $("#book-title");
  const bookAuthor = $("#book-author");
  const locationInfo = $("#location-info");
  const progressBar = $("#progress");

  // State
  let book = null;
  let rendition = null;
  let currentFontSize = 100; // %
  let currentTheme = localStorage.getItem("epub-theme") || "light";
  let currentCfi = null;
  let bookKey = null;

  // Apply saved theme
  document.documentElement.setAttribute("data-theme", currentTheme);

  // ---------- UI helpers ----------
  function showLoading(show = true) {
    loading.classList.toggle("hidden", !show);
  }

  function showReader(show = true) {
    welcome.classList.toggle("hidden", show);
    reader.classList.toggle("hidden", !show);
  }

  function toggleSidebar(force) {
    sidebar.classList.toggle("open", force);
  }

  // ---------- File loading ----------
  function loadFile(file) {
    if (!file || !file.name.toLowerCase().endsWith(".epub")) {
      alert("Seleziona un file .epub valido.");
      return;
    }

    showLoading(true);
    const readerFile = new FileReader();

    readerFile.onload = (e) => {
      const arrayBuffer = e.target.result;
      openBook(arrayBuffer, file.name);
    };

    readerFile.onerror = () => {
      showLoading(false);
      alert("Errore durante la lettura del file.");
    };

    readerFile.readAsArrayBuffer(file);
  }

  function openBook(data, filename) {
    // Clean previous book
    if (book) {
      book.destroy();
      book = null;
      rendition = null;
    }
    viewer.innerHTML = "";
    tocEl.innerHTML = "";

    bookKey = "epub-pos-" + filename;

    try {
      book = ePub(data);

      book.ready
        .then(() => {
          // Metadata
          return book.loaded.metadata;
        })
        .then((meta) => {
          bookTitle.textContent = meta.title || filename.replace(/\.epub$/i, "");
          bookAuthor.textContent = meta.creator || "";
        })
        .then(() => book.loaded.navigation)
        .then((nav) => {
          renderToc(nav.toc);
        })
        .then(() => {
          // Render
          rendition = book.renderTo("viewer", {
            width: "100%",
            height: "100%",
            flow: "paginated",
            manager: "default",
            allowScriptedContent: true,
          });

          // Themes
          rendition.themes.default({
            body: {
              "padding": "20px !important",
              "line-height": "1.6 !important",
            },
          });

          applyFontSize();
          applyThemeToBook();

          // Restore position or start
          const saved = localStorage.getItem(bookKey);
          return rendition.display(saved || undefined);
        })
        .then(() => {
          showLoading(false);
          showReader(true);
          updateLocation();
        })
        .catch((err) => {
          console.error(err);
          showLoading(false);
          alert("Impossibile aprire l'ebook. File danneggiato o non supportato.");
        });

      // Events
      book.ready.then(() => {
        rendition.on("relocated", (location) => {
          currentCfi = location.start.cfi;
          localStorage.setItem(bookKey, currentCfi);
          updateLocation(location);
          highlightToc(location.start.href);
        });

        // Keyboard
        rendition.on("keyup", handleKey);
        document.addEventListener("keyup", handleKey);
      });
    } catch (err) {
      console.error(err);
      showLoading(false);
      alert("Errore durante l'apertura del file EPUB.");
    }
  }

  // ---------- TOC ----------
  function renderToc(items, level = 1) {
    items.forEach((item) => {
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = item.label.trim();
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

      if (item.subitems && item.subitems.length) {
        renderToc(item.subitems, level + 1);
      }
    });
  }

  function highlightToc(href) {
    const links = tocEl.querySelectorAll("a");
    links.forEach((a) => {
      a.classList.toggle("active", a.dataset.href && href && href.includes(a.dataset.href.split("#")[0]));
    });
  }

  // ---------- Location & progress ----------
  function updateLocation(location) {
    if (!location && rendition) {
      location = rendition.currentLocation();
    }
    if (!location || !location.start) return;

    const page = location.start.displayed?.page || 0;
    const total = location.start.displayed?.total || 0;
    const percentage = book.locations && book.locations.length
      ? Math.round(book.locations.percentageFromCfi(location.start.cfi) * 100)
      : (total ? Math.round((page / total) * 100) : 0);

    locationInfo.textContent = total
      ? `Pagina ${page} di ${total}`
      : `${percentage}%`;

    progressBar.style.width = `${percentage}%`;
  }

  // Generate locations for better progress (async)
  function generateLocations() {
    if (!book || book.locations.length) return;
    book.locations.generate(1024).then(() => {
      updateLocation();
    });
  }

  // ---------- Font & Theme ----------
  function applyFontSize() {
    if (rendition) {
      rendition.themes.fontSize(`${currentFontSize}%`);
    }
  }

  function changeFontSize(delta) {
    currentFontSize = Math.max(70, Math.min(180, currentFontSize + delta));
    applyFontSize();
  }

  function applyThemeToBook() {
    if (!rendition) return;
    if (currentTheme === "dark") {
      rendition.themes.override("color", "#e8e6e3");
      rendition.themes.override("background", "#1a1a2e");
    } else {
      rendition.themes.override("color", "#1a1a1a");
      rendition.themes.override("background", "#f8f6f1");
    }
  }

  function toggleTheme() {
    currentTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", currentTheme);
    localStorage.setItem("epub-theme", currentTheme);
    applyThemeToBook();
  }

  // ---------- Navigation ----------
  function goPrev() {
    if (rendition) rendition.prev();
  }

  function goNext() {
    if (rendition) rendition.next();
  }

  function handleKey(e) {
    if (!rendition) return;
    if (e.key === "ArrowLeft" || e.key === "h") goPrev();
    if (e.key === "ArrowRight" || e.key === "l") goNext();
    if (e.key === "+" || e.key === "=") changeFontSize(10);
    if (e.key === "-") changeFontSize(-10);
    if (e.key === "t") toggleTheme();
    if (e.key === "Escape") toggleSidebar(false);
  }

  // ---------- Event listeners ----------
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) loadFile(file);
    fileInput.value = ""; // allow re-open same file
  });

  $("#btn-open").addEventListener("click", () => fileInput.click());
  $("#btn-toc").addEventListener("click", () => toggleSidebar());
  $("#btn-close-toc").addEventListener("click", () => toggleSidebar(false));
  $("#btn-prev").addEventListener("click", goPrev);
  $("#btn-next").addEventListener("click", goNext);
  $("#btn-font-inc").addEventListener("click", () => changeFontSize(10));
  $("#btn-font-dec").addEventListener("click", () => changeFontSize(-10));
  $("#btn-theme").addEventListener("click", toggleTheme);

  // Close sidebar when clicking outside
  document.addEventListener("click", (e) => {
    if (sidebar.classList.contains("open") &&
        !sidebar.contains(e.target) &&
        e.target !== $("#btn-toc")) {
      toggleSidebar(false);
    }
  });

  // Drag & drop
  ["dragenter", "dragover"].forEach((ev) => {
    document.addEventListener(ev, (e) => {
      e.preventDefault();
      document.body.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((ev) => {
    document.addEventListener(ev, (e) => {
      e.preventDefault();
      document.body.classList.remove("dragover");
    });
  });

  document.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // Touch swipe (basic)
  let touchStartX = 0;
  viewer.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  viewer.addEventListener("touchend", (e) => {
    const diff = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(diff) > 60) {
      if (diff > 0) goPrev();
      else goNext();
    }
  }, { passive: true });

  // After first display, generate locations for better % progress
  // (done lazily after book is ready)
  setTimeout(() => {
    if (book) generateLocations();
  }, 2000);
})();
