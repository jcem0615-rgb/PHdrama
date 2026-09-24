'use client';

/**
 * Rendered reels in demo mode.
 *
 * Demo mode has no storage bucket, so a locally rendered episode lives in this
 * browser's IndexedDB. Same per-browser rule as the rest of demo mode: what you
 * render, you can watch; nobody else sees it.
 *
 * Every call degrades to a no-op rather than throwing — private windows and
 * blocked site data are normal, and a missing render just means the storyboard
 * overlay plays instead.
 */

const DB_NAME = 'phd-renders';
const STORE = 'videos';
const VERSION = 1;

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function putRenderedVideo(episodeId: string, blob: Blob): Promise<void> {
  const db = await open();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, episodeId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
  db.close();
}

export async function getRenderedVideo(episodeId: string): Promise<Blob | null> {
  const db = await open();
  if (!db) return null;

  const blob = await new Promise<Blob | null>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(episodeId);
    request.onsuccess = () => resolve((request.result as Blob) ?? null);
    request.onerror = () => resolve(null);
  });
  db.close();
  return blob;
}

export async function listRenderedEpisodeIds(): Promise<string[]> {
  const db = await open();
  if (!db) return [];

  const keys = await new Promise<string[]>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAllKeys();
    request.onsuccess = () => resolve((request.result as string[]) ?? []);
    request.onerror = () => resolve([]);
  });
  db.close();
  return keys;
}

export async function clearRenderedVideos(): Promise<void> {
  const db = await open();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}
