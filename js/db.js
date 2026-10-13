// Thin IndexedDB wrapper. All data stays on this device.

const DB_NAME = 'hostess-diary';
const DB_VERSION = 1;
export const STORES = ['guests', 'dishes', 'events'];

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const s of STORES) {
          if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadAll() {
  const db = await open();
  const tx = db.transaction(STORES, 'readonly');
  const out = {};
  await Promise.all(
    STORES.map(
      s =>
        new Promise((resolve, reject) => {
          const req = tx.objectStore(s).getAll();
          req.onsuccess = () => resolve((out[s] = req.result));
          req.onerror = () => reject(req.error);
        }),
    ),
  );
  return out;
}

export async function put(store, record) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(record);
  return done(tx);
}

export async function remove(store, id) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  return done(tx);
}

// Replaces everything in one transaction, so a failed restore leaves the old data intact.
export async function replaceAll(state) {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const os = tx.objectStore(s);
    os.clear();
    for (const r of state[s]) os.put(r);
  }
  return done(tx);
}
