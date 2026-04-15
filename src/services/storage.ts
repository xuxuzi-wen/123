import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface NotebookEntry {
  id?: number;
  originalImage?: string;
  originalQuestion: string;
  options?: string[];
  userAnswer?: string;
  standardAnswer?: string;
  knowledgePoint: string;
  variants: {
    question: string;
    answer: string;
    analysis: string;
  }[];
  createdAt: number;
}

interface NotebookDB extends DBSchema {
  entries: {
    key: number;
    value: NotebookEntry;
    indexes: { 'by-date': number };
  };
}

let dbPromise: Promise<IDBPDatabase<NotebookDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<NotebookDB>('wrong-questions-db', 1, {
      upgrade(db) {
        const store = db.createObjectStore('entries', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by-date', 'createdAt');
      },
    });
  }
  return dbPromise;
}

export const storageService = {
  async saveEntry(entry: NotebookEntry): Promise<number> {
    const db = await getDB();
    return db.add('entries', entry);
  },

  async getAllEntries(): Promise<NotebookEntry[]> {
    const db = await getDB();
    return db.getAllFromIndex('entries', 'by-date');
  },

  async deleteEntry(id: number): Promise<void> {
    const db = await getDB();
    await db.delete('entries', id);
  },

  async deleteEntries(ids: number[]): Promise<void> {
    const db = await getDB();
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    for (const id of ids) {
      await store.delete(id);
    }
    await tx.done;
  }
};
