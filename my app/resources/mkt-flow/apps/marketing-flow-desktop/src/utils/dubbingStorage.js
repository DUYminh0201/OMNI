const DB_NAME = 'mkt_flow_storage';
const STORE_NAME = 'pending_files';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePendingDubbingFile(file) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ file, name: file.name, type: file.type, time: Date.now() }, 'pending_dubbing');
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.warn('[DubbingStorage] save failed:', e);
    return false;
  }
}

export async function getPendingDubbingFile() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get('pending_dubbing');
    return new Promise((resolve) => {
      getReq.onsuccess = () => {
        const val = getReq.result;
        if (val && val.file) {
          store.delete('pending_dubbing');
          resolve(val.file);
        } else {
          resolve(null);
        }
      };
      getReq.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn('[DubbingStorage] get failed:', e);
    return null;
  }
}
