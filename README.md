# 📖 EPUB Reader

Web app / PWA per leggere file **EPUB** direttamente nel browser o come app Android.  
Nessun server, nessuna registrazione, privacy totale.

**Demo:** `https://TUO-USERNAME.github.io/epub-reader/`  
(sostituisci con il tuo URL GitHub Pages)

---

## ✨ Funzionalità

- Caricamento file `.epub` (pulsante o drag & drop)
- Sommario (TOC) navigabile
- Navigazione ottimizzata (scorrimento su mobile, pagine su desktop)
- Controllo dimensione del testo
- Tema chiaro / scuro
- Salvataggio automatico della posizione di lettura
- **PWA installabile** (Android / desktop)
- Completamente client-side ([epub.js](https://github.com/futurepress/epub.js))

---

## 📁 Struttura file

```
epub-reader/
├── index.html
├── manifest.json          ← PWA manifest
├── sw.js                  ← Service Worker
├── css/style.css
├── js/app.js
├── icons/
│   ├── icon-72.png … icon-512.png
│   ├── icon-maskable-192.png
│   └── icon-maskable-512.png
└── README.md
```

---

## 🚀 1. Pubblicare su GitHub Pages

1. Crea un repository (es. `epub-reader`)
2. Carica **tutti** i file di questa cartella
3. **Settings → Pages** → branch `main`, cartella `/ (root)`
4. Attendi 1–2 minuti. URL tipico:
   ```
   https://TUO-USERNAME.github.io/epub-reader/
   ```

---

## 📱 2. Creare l’APK con PWABuilder

1. Assicurati che il sito sia online su **HTTPS** (GitHub Pages va bene)
2. Vai su **[https://www.pwabuilder.com](https://www.pwabuilder.com)**
3. Incolla l’URL della tua app (es. `https://000-afk.github.io/`)
4. Clicca **Start**
5. Se tutto è a posto vedrai il report verde (manifest + service worker + icone)
6. Nella sezione **Package for stores** scegli **Android**
7. Opzioni consigliate:
   - Package ID: `com.tuonome.epubreader` (modifica a piacere)
   - App name: `EPUB Reader`
   - Hosting: **None** (o lascia default)
   - Signing: usa la chiave generata da PWABuilder (per test) oppure la tua
8. Clicca **Generate** / **Download**
9. Scarichi un ZIP con:
   - `app-release-signed.apk` (o simile) → installabile sul telefono
   - progetto Android / bundle per Play Store

### Installare l’APK sul telefono

1. Trasferisci l’APK sul telefono
2. Abilita “Origini sconosciute” / installazione da file
3. Apri l’APK e installa

---

## ✅ Checklist PWABuilder

L’app include già:

| Requisito              | File / valore                          |
|------------------------|----------------------------------------|
| Manifest               | `manifest.json`                        |
| Service Worker         | `sw.js`                                |
| Icone 192 & 512        | `icons/icon-192.png`, `icon-512.png`   |
| Icone maskable         | `icons/icon-maskable-*.png`            |
| `display: standalone`  | sì                                     |
| `theme_color`          | `#1a1a2e`                              |
| HTTPS                  | fornito da GitHub Pages                |

Se PWABuilder segnala problemi:

- Controlla che l’URL termini correttamente (con o senza trailing slash)
- Forza un hard refresh dopo il deploy
- Apri `https://TUO-URL/manifest.json` e `https://TUO-URL/sw.js` nel browser per verificare che siano raggiungibili

---

## ⌨️ Scorciatoie (desktop)

| Tasto   | Azione                         |
|---------|--------------------------------|
| ← →     | Pagina precedente / successiva |
| + −     | Dimensione testo               |
| T       | Cambia tema                    |
| Esc     | Chiude sommario                |

---

## 📄 Licenza

MIT – usa, modifica e distribuisci liberamente.
