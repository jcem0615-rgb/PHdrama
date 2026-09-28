'use client';

/**
 * Posted episode scripts, in demo mode.
 *
 * The reel performs the script — who speaks, what they say — so the renderer
 * needs the full text, and a five-minute episode's script runs to a couple of
 * kilobytes. The demo store is one signed cookie with roughly 4KB to spend on
 * everything, so a dozen of these would not come close to fitting; the cookie
 * deliberately keeps only title, beat and hook.
 *
 * So the scripts live here instead, written by the browser that posted the
 * story and read by the same browser when it renders. Same per-browser rule as
 * the rendered videos next door, and the same degrade-to-nothing behaviour: a
 * missing script just means the reel plays its three title cards.
 */

const DB_NAME = 'phd-scripts';
const STORE = 'scripts';
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

export async function putEpisodeScript(episodeId: string, script: string): Promise<void> {
  const db = await open();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(script, episodeId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
  db.close();
}

export async function getEpisodeScript(episodeId: string): Promise<string | null> {
  const db = await open();
  if (!db) return null;

  const script = await new Promise<string | null>((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(episodeId);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
    request.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);
  });
  db.close();
  return script;
}
