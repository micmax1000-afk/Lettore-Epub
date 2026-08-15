// === DEBUG VISIBILE SU MOBILE ===
// Qualsiasi errore JavaScript verrà mostrato nella barra di stato
window.onerror = function(msg, url, line, col, error) {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.textContent = '🚨 ERR: ' + msg.substring(0, 80);
        statusDiv.className = 'status error';
    }
    console.error('Global error:', msg, error);
    return true; // impedisce la visualizzazione dell'errore di default
};

// === INIZIO APP ===
document.addEventListener('DOMContentLoaded', function() {
    const viewer = document.getElementById('viewer');
    const fileInput = document.getElementById('file-input');
    const openBtn = document.getElementById('openFileBtn');
    const prevBtn = document.getElementById('prev');
    const nextBtn = document.getElementById('next');
    const progressSpan = document.getElementById('progress');
    const tocList = document.getElementById('toc-list');
    const statusDiv = document.getElementById('status');

    let book = null;
    let rendition = null;

    // ========== FUNZIONE STATO ==========
    function setStatus(msg, type) {
        if (statusDiv) {
            statusDiv.textContent = msg;
            statusDiv.className = 'status ' + (type || '');
        }
        console.log('[STATUS]', msg);
    }

    // ========== APERTURA FILE PICKER ==========
    openBtn.addEventListener('click', function() {
        fileInput.click();
    });

    // ========== GESTIONE FILE SELEZIONATO ==========
    fileInput.addEventListener('change', function(e) {
        const file = this.files[0];
        if (!file) {
            setStatus('⚠️ Nessun file selezionato', 'info');
            return;
        }

        setStatus('📂 File: ' + file.name + ' (' + file.size + ' bytes)', 'debug');
        console.log('📂 File selezionato:', file.name, file.size);

        // Verifica estensione
        if (!file.name.toLowerCase().endsWith('.epub')) {
            setStatus('❌ Il file deve avere estensione .epub', 'error');
            return;
        }

        // Leggi il file
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const arrayBuffer = ev.target.result;
                setStatus('✅ File letto (' + arrayBuffer.byteLength + ' bytes), apertura EPUB...', 'info');
                console.log('✅ ArrayBuffer letto, dimensione:', arrayBuffer.byteLength);

                const blob = new Blob([arrayBuffer], { type: 'application/epub+zip' });
                const url = URL.createObjectURL(blob);
                console.log('🔗 URL creato:', url);
                openBook(url);
            } catch (err) {
                console.error('❌ Errore elaborazione:', err);
                setStatus('❌ Errore: ' + err.message, 'error');
            }
        };
        reader.onerror = function(err) {
            console.error('❌ FileReader error:', err);
            setStatus('❌ Errore durante la lettura del file', 'error');
        };
        reader.readAsArrayBuffer(file);

        // Resetta il valore dell'input per permettere di ricaricare lo stesso file
        this.value = '';
    });

    // ========== APERTURA EPUB ==========
    function openBook(url) {
        setStatus('⏳ Caricamento EPUB in corso...', 'info');
        console.log('🚀 openBook() chiamato con URL:', url);

        // Distruggi eventuali istanze precedenti
        if (book) {
            try { book.destroy(); } catch(e) {}
        }
        if (rendition) {
            try { rendition.destroy(); } catch(e) {}
        }

        try {
            // Inizializza EPUB.js
            book = ePub(url);
            console.log('📖 EPUB.js inizializzato');

            rendition = book.renderTo('viewer', {
                width: '100%',
                height: '100%',
                spread: 'none',
                flow: 'paginated'
            });
            console.log('🎨 Rendition creata');

            // Mostra la prima pagina
            rendition.display()
                .then(() => {
                    console.log('✅ Prima pagina visualizzata');
                    setStatus('✅ Pronto', 'ok');
                    prevBtn.disabled = false;
                    nextBtn.disabled = false;
                    loadToc();
                    updateProgress();
                    restorePosition();
                })
                .catch(err => {
                    console.error('❌ Errore display():', err);
                    setStatus('❌ Errore visualizzazione: ' + err.message, 'error');
                });

            // Eventi
            rendition.on('rendered', function(section) {
                console.log('📄 Rendered section:', section);
                updateProgress();
                savePosition();
            });

            rendition.on('locationChanged', function() {
                updateProgress();
            });

            // Pulsanti
            prevBtn.onclick = prevPage;
            nextBtn.onclick = nextPage;

            // Tasti freccia
            document.addEventListener('keydown', function(e) {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    nextPage();
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    prevPage();
                }
            });

        } catch (err) {
            console.error('❌ Errore in openBook:', err);
            setStatus('❌ Errore apertura EPUB: ' + err.message, 'error');
        }
    }

    // ========== NAVIGAZIONE ==========
    function prevPage() {
        if (rendition) {
            rendition.prev().catch(err => console.warn('Prev error:', err));
        }
    }

    function nextPage() {
        if (rendition) {
            rendition.next().catch(err => console.warn('Next error:', err));
        }
    }

    // ========== PROGRESSO ==========
    function updateProgress() {
        if (!rendition) return;
        try {
            const location = rendition.currentLocation();
            if (location && location.start) {
                const percent = location.start.percentage;
                const pct = Math.round(percent * 100);
                progressSpan.textContent = pct + '%';
            }
        } catch (e) {
            // ignora
        }
    }

    // ========== SALVA/RIPRISTINA POSIZIONE ==========
    function savePosition() {
        if (!rendition) return;
        try {
            const location = rendition.currentLocation();
            if (location && location.start) {
                const cfi = location.start.cfi;
                localStorage.setItem('epub_location', JSON.stringify({ cfi: cfi }));
            }
        } catch (e) { /* ignora */ }
    }

    function restorePosition() {
        const saved = localStorage.getItem('epub_location');
        if (saved && rendition) {
            try {
                const loc = JSON.parse(saved);
                if (loc.cfi) {
                    console.log('🔄 Ripristino posizione:', loc.cfi);
                    rendition.display(loc.cfi).catch(() => {});
                }
            } catch (e) {
                console.warn('Posizione salvata non valida', e);
            }
        }
    }

    // ========== INDICE (TOC) ==========
    function loadToc() {
        if (!book) return;
        book.ready.then(() => {
            return book.navigation;
        }).then(nav => {
            tocList.innerHTML = '';
            if (!nav || !nav.toc || nav.toc.length === 0) {
                tocList.innerHTML = '<li style="color:#888;font-style:italic;">Nessun indice disponibile</li>';
                return;
            }
            nav.toc.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.label;
                li.dataset.href = item.href;
                li.addEventListener('click', function() {
                    const href = this.dataset.href;
                    if (href && rendition) {
                        rendition.display(href).catch(err => console.warn('TOC error:', err));
                    }
                });
                tocList.appendChild(li);
            });
            console.log('📑 TOC caricato, elementi:', nav.toc.length);
        }).catch(err => {
            console.warn('Indice non disponibile', err);
            tocList.innerHTML = '<li style="color:#888;font-style:italic;">Indice non disponibile</li>';
        });
    }

    // ========== DRAG & DROP ==========
    document.addEventListener('dragover', function(e) {
        e.preventDefault();
    });
    document.addEventListener('drop', function(e) {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.epub')) {
            fileInput.files = files;
            fileInput.dispatchEvent(new Event('change'));
        } else {
            setStatus('📂 Trascina solo file .epub', 'info');
        }
    });

    // Messaggio iniziale
    setStatus('📂 Clicca "Carica EPUB" per selezionare un file', 'info');

    // ========== TEST CON EPUB PUBBLICO (Moby Dick) ==========
    // SCOMMENTA LE RIGHE SOTTO PER TESTARE CON UN EPUB GRATUITO
    /*
    setStatus('⏳ Caricamento EPUB di test (Moby Dick)...', 'info');
    openBook('https://s3.amazonaws.com/epubjs/books/moby-dick.epub');
    */
});
