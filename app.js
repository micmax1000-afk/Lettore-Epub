// === DEBUG GLOBALE ===
window.onerror = function(msg, url, line, col, error) {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.textContent = '🚨 ERR: ' + msg.substring(0, 80);
        statusDiv.className = 'status error';
    }
    console.error('GLOBAL ERROR:', msg, error);
    return true;
};

console.log('✅ app.js caricato');

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM ready');
    
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

    function setStatus(msg, type) {
        if (statusDiv) {
            statusDiv.textContent = msg;
            statusDiv.className = 'status ' + (type || '');
        }
        console.log('[STATUS]', msg);
    }

    // === VERIFICA EPUB.JS ===
    if (typeof ePub === 'undefined') {
        setStatus('❌ EPUB.js NON CARICATO!', 'error');
        console.error('❌ EPUB.js non definito!');
        return;
    } else {
        console.log('✅ EPUB.js caricato');
        setStatus('✅ EPUB.js caricato', 'ok');
    }

    // ========== APERTURA FILE ==========
    openBtn.addEventListener('click', function() {
        console.log('🖱️ Click su Carica EPUB');
        fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
        const file = this.files[0];
        if (!file) {
            setStatus('⚠️ Nessun file selezionato', 'info');
            return;
        }

        console.log('📂 FILE SELEZIONATO:', file.name, file.size);
        setStatus('📂 ' + file.name + ' (' + (file.size / 1024 / 1024).toFixed(2) + ' MB)', 'debug');

        if (!file.name.toLowerCase().endsWith('.epub')) {
            setStatus('❌ Deve essere .epub', 'error');
            return;
        }

        // SE FILE TROPPO GRANDE (> 20MB), avvisa
        if (file.size > 20 * 1024 * 1024) {
            setStatus('⚠️ File grande (' + (file.size / 1024 / 1024).toFixed(1) + ' MB), potrebbe richiedere tempo', 'info');
        }

        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const arrayBuffer = ev.target.result;
                console.log('✅ ArrayBuffer letto:', arrayBuffer.byteLength);
                setStatus('✅ Letto ' + (arrayBuffer.byteLength / 1024 / 1024).toFixed(2) + ' MB', 'info');
                
                const blob = new Blob([arrayBuffer], { type: 'application/epub+zip' });
                const url = URL.createObjectURL(blob);
                console.log('🔗 URL creato:', url);
                
                openBook(url);
            } catch (err) {
                console.error('❌ Errore:', err);
                setStatus('❌ ' + err.message, 'error');
            }
        };
        reader.onerror = function(err) {
            console.error('❌ FileReader error:', err);
            setStatus('❌ Errore lettura', 'error');
        };
        reader.readAsArrayBuffer(file);
        this.value = '';
    });

    // ========== APERTURA EPUB (OTTIMIZZATA) ==========
    function openBook(url) {
        console.log('🚀 openBook() URL:', url.substring(0, 60) + '...');
        setStatus('⏳ Caricamento EPUB... (potrebbe richiedere tempo)', 'info');

        if (book) {
            try { book.destroy(); } catch(e) {}
        }
        if (rendition) {
            try { rendition.destroy(); } catch(e) {}
        }

        try {
            // === CONFIGURAZIONE PER RIDURRE LA MEMORIA ===
            console.log('📖 Creazione book con ottimizzazioni...');
            book = ePub(url, {
                openAs: 'epub',
                // Carica solo i metadati iniziali
                requests: {
                    // Limita le richieste contemporanee
                    concurrent: 1
                }
            });
            console.log('✅ Book creato');

            console.log('🎨 Creazione rendition...');
            rendition = book.renderTo('viewer', {
                width: '100%',
                height: '100%',
                spread: 'none',
                flow: 'paginated',
                // Riduci la qualità per risparmiare memoria
                image: {
                    quality: 0.7
                },
                // Layout più semplice
                manager: 'continuous'
            });
            console.log('✅ Rendition creata');

            // === MOSTRA PROGRESSO DI CARICAMENTO ===
            let loadingStart = Date.now();
            const loadingInterval = setInterval(() => {
                const elapsed = Math.round((Date.now() - loadingStart) / 1000);
                setStatus('⏳ Caricamento in corso... ' + elapsed + 's', 'info');
            }, 5000);

            console.log('📄 Chiamata rendition.display()...');
            rendition.display()
                .then(() => {
                    clearInterval(loadingInterval);
                    console.log('✅ display() COMPLETATO!');
                    setStatus('✅ Pronto', 'ok');
                    prevBtn.disabled = false;
                    nextBtn.disabled = false;
                    
                    // Carica indice (dopo un po')
                    setTimeout(() => loadToc(), 500);
                    updateProgress();
                    restorePosition();
                })
                .catch(err => {
                    clearInterval(loadingInterval);
                    console.error('❌ display() fallito:', err);
                    
                    // Gestione specifica per "out of memory"
                    if (err.message && err.message.includes('memory')) {
                        setStatus('❌ Memoria insufficiente. Prova un EPUB più piccolo o usa un browser desktop', 'error');
                    } else {
                        setStatus('❌ Errore display: ' + err.message, 'error');
                    }
                });

            // Eventi
            rendition.on('rendered', function(section) {
                console.log('📄 Rendered:', section);
                updateProgress();
                savePosition();
                // Libera memoria forzando il garbage collector (se disponibile)
                if (window.gc) { try { window.gc(); } catch(e) {} }
            });

            rendition.on('locationChanged', function() {
                updateProgress();
            });

            rendition.on('error', function(err) {
                console.error('❌ Errore rendition:', err);
                setStatus('❌ Errore: ' + err.message, 'error');
            });

            prevBtn.onclick = prevPage;
            nextBtn.onclick = nextPage;

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
            setStatus('❌ Errore: ' + err.message, 'error');
        }
    }

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

    function updateProgress() {
        if (!rendition) return;
        try {
            const location = rendition.currentLocation();
            if (location && location.start) {
                const pct = Math.round(location.start.percentage * 100);
                progressSpan.textContent = pct + '%';
            }
        } catch (e) { /* ignora */ }
    }

    function savePosition() {
        if (!rendition) return;
        try {
            const location = rendition.currentLocation();
            if (location && location.start) {
                localStorage.setItem('epub_location', JSON.stringify({ cfi: location.start.cfi }));
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
            } catch (e) { /* ignora */ }
        }
    }

    function loadToc() {
        if (!book) return;
        console.log('📑 Caricamento indice...');
        book.ready.then(() => {
            return book.navigation;
        }).then(nav => {
            tocList.innerHTML = '';
            if (!nav || !nav.toc || nav.toc.length === 0) {
                tocList.innerHTML = '<li style="color:#888;font-style:italic;">Nessun indice</li>';
                return;
            }
            nav.toc.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.label;
                li.dataset.href = item.href;
                li.addEventListener('click', function() {
                    if (rendition) {
                        rendition.display(this.dataset.href).catch(() => {});
                    }
                });
                tocList.appendChild(li);
            });
            console.log('📑 TOC caricato:', nav.toc.length, 'elementi');
        }).catch(err => {
            console.warn('Indice non disponibile:', err);
            tocList.innerHTML = '<li style="color:#888;font-style:italic;">Indice non disponibile</li>';
        });
    }

    // Drag & drop
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', function(e) {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.epub')) {
            fileInput.files = files;
            fileInput.dispatchEvent(new Event('change'));
        }
    });

    setStatus('📂 Pronto, carica un EPUB', 'info');
});
