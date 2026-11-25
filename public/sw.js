/* Service Worker de UTEQGram (versión Angular) */
var CACHE_DYNAMIC_NAME = "uteg-dynamic-v1";
var FIREBASE_URL = "https://pwa2-1a1a8.firebaseio.com/post.json";
var ICON = "/icons/icon-192x192.svg";
var BADGE = "/icons/icon-72x72.svg";

/* ---- IndexedDB mínima (compartida con la app Angular) ---- */
function openDb() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open("post-store", 2);
    request.onupgradeneeded = function () {
      var db = request.result;
      if (!db.objectStoreNames.contains("posts")) {
        db.createObjectStore("posts", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("sync-posts")) {
        db.createObjectStore("sync-posts", { keyPath: "id" });
      }
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

function writeData(storeName, data) {
  return openDb().then(function (db) {
    if (!data || !data.id) { return; }
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(data);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function readAllData(storeName) {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(storeName, "readonly");
      var request = tx.objectStore(storeName).getAll();
      request.onsuccess = function () { resolve(request.result || []); };
      request.onerror = function () { reject(request.error); };
    });
  });
}

function clearAllData(storeName) {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function deleteItemFromData(storeName, id) {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

/* ---- Ciclo de vida ---- */
self.addEventListener("install", function () {
  console.log("[SW] Instalando");
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf("uteg-") === 0 && k !== CACHE_DYNAMIC_NAME;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* ---- Fetch ---- */
self.addEventListener("fetch", function (event) {
  var request = event.request;
  var protocol;
  try { protocol = new URL(request.url).protocol; } catch (e) { return; }
  if ((protocol !== "http:" && protocol !== "https:") || request.method !== "GET") { return; }

  if (request.url.indexOf(FIREBASE_URL) > -1) {
    event.respondWith(
      fetch(request).then(function (res) {
        var clone = res.clone();
        clearAllData("posts")
          .then(function () { return clone.json(); })
          .then(function (data) {
            for (var key in data) {
              var post = data[key];
              if (!post || typeof post !== "object" || !post.title) { continue; }
              if (!post.id) { post.id = key; }
              writeData("posts", post).catch(function (err) {
                console.warn("[SW] Error guardando post", err);
              });
            }
          })
          .catch(function (err) { console.warn("[SW] Error al cachear posts", err); });
        return res;
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match("/ofline.html");
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) { return cached; }
      return fetch(request).then(function (res) {
        if (res && res.ok && res.type === "basic") {
          caches.open(CACHE_DYNAMIC_NAME).then(function (cache) {
            cache.put(request, res.clone());
          });
        }
        return res;
      }).catch(function () {
        return new Response("", { status: 404, statusText: "Not Found" });
      });
    })
  );
});

/* ---- Background sync ---- */
self.addEventListener("sync", function (event) {
  if (event.tag !== "sync-new-posts") { return; }
  event.waitUntil(
    readAllData("sync-posts").then(function (posts) {
      return Promise.all(posts.map(function (post) {
        return fetch(FIREBASE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(post)
        }).then(function (res) {
          if (res.ok) { return deleteItemFromData("sync-posts", post.id); }
        }).catch(function (err) {
          console.warn("[SW] Error al sincronizar post", err);
        });
      }));
    })
  );
});

/* ---- Notificaciones ---- */
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "/";
  var url = new URL(target, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url === url && "focus" in list[i]) { return list[i].focus(); }
      }
      if (clients.openWindow) { return clients.openWindow(url); }
    })
  );
});

self.addEventListener("push", function (event) {
  var payload = { title: "UTEQGram", body: "Tienes una nueva notificación", url: "/" };
  if (event.data) {
    try {
      var data = event.data.json();
      payload.title = data.title || payload.title;
      payload.body = data.body || data.message || payload.body;
      payload.url = data.url || payload.url;
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: ICON,
    badge: BADGE,
    vibrate: [100, 50, 100],
    data: { url: payload.url },
    tag: "uteqgram-push"
  }));
});
