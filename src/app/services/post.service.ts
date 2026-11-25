import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Post } from '../models/post.model';

const FIREBASE_URL = 'https://pwa2-1a1a8.firebaseio.com/post.json';
const DEFAULT_IMAGE =
  'https://firebasestorage.googleapis.com/v0/b/pwa2-1a1a8.firebasestorage.app/o/sf-boat.jpg?alt=media&token=e33adc41-0a87-44fd-8df9-951dda30602f';

@Injectable({ providedIn: 'root' })
export class PostService {
  constructor(private readonly http: HttpClient) {}

  get defaultImage(): string {
    return DEFAULT_IMAGE;
  }

  /** Intenta la red y, si falla, reconstruye el feed desde IndexedDB. */
  async loadPosts(): Promise<Post[]> {
    try {
      const data = await firstValueFrom(
        this.http.get<Record<string, Post>>(FIREBASE_URL),
      );
      const posts = Object.keys(data || {})
        .map((key) => {
          const post = data[key];
          if (!post || typeof post !== 'object' || !post.title) return null;
          return { ...post, id: post.id || key } as Post;
        })
        .filter((post): post is Post => post !== null);

      await this.clearData('posts');
      await Promise.all(posts.map((post) => this.writeData('posts', post)));
      return posts;
    } catch (error) {
      console.warn('[Posts] Red no disponible, usando caché', error);
      return this.readAllData('posts');
    }
  }

  /** Crea un post: con background sync si está disponible, si no, envío directo. */
  async createPost(post: Post): Promise<void> {
    const postWithId: Post = { ...post, id: post.id || new Date().toISOString() };

    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const registration = await navigator.serviceWorker.ready;
      const sync = (registration as ServiceWorkerRegistration & {
        sync: { register: (tag: string) => Promise<void> };
      }).sync;
      await this.writeData('sync-posts', postWithId);
      await sync.register('sync-new-posts');
      return;
    }

    await firstValueFrom(this.http.post(FIREBASE_URL, postWithId));
  }

  /* ---- IndexedDB (misma base que el Service Worker) ---- */
  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('post-store', 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('posts')) {
          db.createObjectStore('posts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sync-posts')) {
          db.createObjectStore('sync-posts', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async writeData(store: string, data: Post): Promise<void> {
    if (!data.id) return;
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async readAllData(store: string): Promise<Post[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const request = tx.objectStore(store).getAll();
      request.onsuccess = () => resolve((request.result as Post[]) || []);
      request.onerror = () => reject(request.error);
    });
  }

  private async clearData(store: string): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
