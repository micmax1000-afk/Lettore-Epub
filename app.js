document.addEventListener('DOMContentLoaded', function() {
    const viewer = document.getElementById('viewer');
    const fileInput = document.getElementById('file-input');
    const prevBtn = document.getElementById('prev');
    const nextBtn = document.getElementById('next');
    const progressSpan = document.getElementById('progress');
    const tocList = document.getElementById('toc-list');

    let book = null;
    let rendition = null;
    let currentLocation = null;

    // --- Caricamento file ---
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(ev) {
            const arrayBuffer = ev.target.result;
            const blob = new Blob([arrayBuffer], { type: 'application/epub+zip' });
            const url = URL.createObjectURL(blob);
            openBook(url);
        };
        reader.readAsArrayBuffer(file);
    });

    // --- Apertura EPUB ---
    function openBook(url) {
        if (book) {
            book.destroy();
            rendition && rendition.destroy();
        }

        book = ePub(url);
        rendition = book.renderTo('viewer', {
            width: '100%',
            height: '100%',
            spread: 'none',
            flow: 'paginated'
        });

        // Mostra la prima pagina
        rendition.display();

        // Abilita pulsanti
        prevBtn.disabled = false;
        nextBtn.disabled = false;

        // Carica indice
        loadToc();

        // Eventi di navigazione
        rendition.on('rendered', function(section) {
            updateProgress();
            savePosition();
        });

        // Gestione tasti freccia
        document.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                nextPage();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                prevPage();
            }
        });

        // Carica posizione salvata (se presente)
        const saved = localStorage.getItem('epub_location');
        if (saved) {
            try {
                const loc = JSON.parse(saved);
                rendition.display(loc);
            } catch (e) {
                console.warn('Posizione salvata non valida');
            }
        }

        // Pulsanti
        prevBtn.onclick = prevPage;
        nextBtn.onclick = nextPage;

        // Aggiorna progresso al cambiamento
        rendition.on('locationChanged', updateProgress);
    }

    // --- Navigazione ---
    function prevPage() {
        if (rendition) {
            rendition.prev();
        }
    }

    function nextPage() {
        if (rendition) {
            rendition.next();
        }
    }

    // --- Aggiorna progresso ---
    function updateProgress() {
        if (!rendition) return;
        const location = rendition.currentLocation();
        if (location && location.start) {
            const percent = location.start.percentage;
            const pct = Math.round(percent * 100);
            progressSpan.textContent = pct + '%';
            // Salva posizione
            savePosition();
        }
    }

    // --- Salva posizione ---
    function savePosition() {
        if (!rendition) return;
        const location = rendition.currentLocation();
        if (location && location.start) {
            const cfi = location.start.cfi;
            localStorage.setItem('epub_location', JSON.stringify({ cfi: cfi }));
        }
    }

    // --- Carica indice ---
    function loadToc() {
        if (!book) return;
        book.ready.then(() => {
            return book.navigation;
        }).then(nav => {
            tocList.innerHTML = '';
            if (!nav || !nav.toc) return;
            nav.toc.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.label;
                li.dataset.href = item.href;
                li.addEventListener('click', function() {
                    const href = this.dataset.href;
                    if (href && rendition) {
                        rendition.display(href);
                    }
                });
                tocList.appendChild(li);
            });
        }).catch(err => console.warn('Indice non disponibile', err));
    }

    // --- Caricamento drag & drop (opzionale) ---
    document.addEventListener('dragover', function(e) {
        e.preventDefault();
    });
    document.addEventListener('drop', function(e) {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.epub')) {
            fileInput.files = files;
            fileInput.dispatchEvent(new Event('change'));
        }
    });
});