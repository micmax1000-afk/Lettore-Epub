# 📖 EPUB Reader

Web app leggera e open source per leggere file **EPUB** direttamente nel browser.  
Nessun server, nessuna registrazione, privacy totale.

**Demo live** (dopo il deploy su GitHub Pages):  
`https://TUO-USERNAME.github.io/epub-reader/`

---

## ✨ Funzionalità

- Caricamento file `.epub` (pulsante o drag & drop)
- Sommario (TOC) navigabile
- Navigazione a pagine (click, frecce, swipe)
- Controllo dimensione del testo
- Tema chiaro / scuro
- Salvataggio automatico della posizione di lettura (localStorage)
- Responsive (funziona bene su desktop e mobile)
- Completamente client-side (usa [epub.js](https://github.com/futurepress/epub.js))

---

## 🚀 Pubblicare su GitHub Pages

1. Crea un nuovo repository su GitHub (es. `epub-reader`)
2. Carica tutti i file di questa cartella:
   ```
   index.html
   css/style.css
   js/app.js
   README.md
   ```
3. Vai su **Settings → Pages**
4. Seleziona branch `main` (o `master`) e cartella `/ (root)`
5. Salva. Tra qualche minuto l’app sarà online all’indirizzo:
   ```
   https://TUO-USERNAME.github.io/epub-reader/
   ```

### Metodo rapido con Git

```bash
git init
git add .
git commit -m "Primo commit: EPUB Reader"
git branch -M main
git remote add origin https://github.com/TUO-USERNAME/epub-reader.git
git push -u origin main
```

Poi attiva GitHub Pages come descritto sopra.

---

## 🖥️ Uso locale

Apri semplicemente `index.html` con un server locale (necessario per alcune funzionalità dei browser):

```bash
# Python
python -m http.server 8000

# oppure Node
npx serve .
```

Poi vai su `http://localhost:8000`

---

## ⌨️ Scorciatoie da tastiera

| Tasto          | Azione                  |
|----------------|-------------------------|
| ← / →          | Pagina precedente / successiva |
| + / −          | Ingrandisci / riduci testo |
| T              | Cambia tema             |
| Esc            | Chiudi sommario         |

---

## 🛠️ Tecnologie

- [epub.js](https://github.com/futurepress/epub.js) – rendering EPUB
- [JSZip](https://stuk.github.io/jszip/) – gestione archivi
- HTML / CSS / JavaScript vanilla (zero framework)

---

## 📄 Licenza

MIT – usa, modifica e distribuisci liberamente.

---

Fatto con ❤️ per chi ama leggere.
