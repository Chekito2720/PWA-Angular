# UTEQGram — versión Angular

Versión independiente de la PWA UTEQGram, reescrita en **Angular 22** (standalone components + signals). Réplica de las funcionalidades de la app vanilla original.

## Características

- **Feed** de momentos leído desde Firebase Realtime Database:
  `https://pwa2-1a1a8.firebaseio.com/post.json`
- **Crear post** con título, ubicación e imagen.
- **Cámara** con `getUserMedia` + canvas (JPEG ≤1024 px) y alternativa por `<input type="file" capture="environment">`.
- **GPS → ciudad** mediante reverse geocoding (BigDataCloud, sin API key), con coordenadas como respaldo.
- **Notificaciones** del sistema (permiso + `registration.showNotification`).
- **Vibración** como feedback háptico.
- **Offline**: Service Worker (`public/sw.js`) con caché dinámica, respaldo en IndexedDB y página `ofline.html`.
- **Background sync** de posts pendientes (`sync-new-posts`).
- PWA instalable (`manifest.webmanifest`, `beforeinstallprompt`).

## Estructura

```
src/
├── app/
│   ├── app.ts / app.html / app.css   # UI principal
│   ├── models/post.model.ts
│   └── services/
│       ├── post.service.ts           # Firebase REST + IndexedDB
│       ├── device.service.ts         # cámara, GPS, ciudad, vibración
│       └── notification.service.ts   # permiso y notificaciones
├── index.html
├── main.ts
└── styles.css
public/
├── sw.js                 # Service Worker
├── manifest.webmanifest
├── ofline.html
├── icons/                # iconos PWA
└── main-image*.jpg
```

## Ejecutar

```bash
npm install
npm start          # http://localhost:4200
```

## Compilar

```bash
npm run build      # genera dist/uteg-angular/browser
```

## Desplegar en Firebase Hosting (opcional)

Desde esta carpeta:

```bash
npm run build
firebase use pwa2-1a1a8
firebase deploy --only hosting
```

> Si se despliega al mismo proyecto/sitio que la app vanilla, **la reemplazará**. Para tener ambas, crea otro sitio de Hosting en el mismo proyecto (u otro proyecto) y ajusta `firebase.json` con el campo `"site"`.
