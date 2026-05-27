const DB_NAME = 'TTSVoiceStudioDB';
const STORE_NAME = 'synthesized_audios';
const VERSION = 1;

export class AudioDB {
  private static initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // Store a Blob by its unique audio item ID
  public static async saveAudio(id: string, blob: Blob): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const putRequest = store.put({ id, blob });

        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      });
    } catch (e) {
      console.error('IndexedDB saveAudio failure:', e);
    }
  }

  // Retrieve a stored Blob by its unique ID
  public static async getAudio(id: string): Promise<Blob | null> {
    try {
      const db = await this.initDB();
      return new Promise<Blob | null>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
          if (getRequest.result) {
            resolve(getRequest.result.blob);
          } else {
            resolve(null);
          }
        };
        getRequest.onerror = () => reject(getRequest.error);
      });
    } catch (e) {
      console.error('IndexedDB getAudio failure:', e);
      return null;
    }
  }

  // Delete a recording from IndexedDB
  public static async deleteAudio(id: string): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const deleteRequest = store.delete(id);

        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });
    } catch (e) {
      console.error('IndexedDB deleteAudio failure:', e);
    }
  }

  // Clear all cached recordings
  public static async clearAll(): Promise<void> {
    try {
      const db = await this.initDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const clearRequest = store.clear();

        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
      });
    } catch (e) {
      console.error('IndexedDB clearAll failure:', e);
    }
  }
}
