/**
 * Direct saving into the game's map_templates folder via the File System
 * Access API (Chromium only). The user picks the folder once; the directory
 * handle is persisted in IndexedDB, so later sessions write in one click
 * (the browser may re-ask for permission after a restart).
 */

type PermissionMode = { mode: 'read' | 'readwrite' };

interface DirectoryHandle {
  readonly name: string;
  queryPermission(descriptor: PermissionMode): Promise<PermissionState>;
  requestPermission(descriptor: PermissionMode): Promise<PermissionState>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  keys(): AsyncIterableIterator<string>;
}

interface FileHandle {
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: PermissionMode & { id?: string }) => Promise<DirectoryHandle>;
  }
}

const DB_NAME = 'oe-rmg-editor-fs';
const STORE = 'handles';
const KEY = 'gameFolder';

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(): Promise<DirectoryHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as DirectoryHandle) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(handle: DirectoryHandle | null): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      const request = handle ? store.put(handle, KEY) : store.delete(KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Persisting the handle is best-effort: without it the user just picks
    // the folder again next session.
  }
}

/** Opens the directory picker; null when the user cancels. */
export async function pickGameFolder(): Promise<DirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    const handle = await window.showDirectoryPicker!({ mode: 'readwrite', id: 'oe-map-templates' });
    await idbSet(handle);
    return handle;
  } catch {
    // AbortError — the user closed the dialog
    return null;
  }
}

export async function getSavedGameFolder(): Promise<DirectoryHandle | null> {
  return idbGet();
}

export async function forgetGameFolder(): Promise<void> {
  await idbSet(null);
}

/** True when readwrite access is granted (asking the user if necessary). */
export async function ensurePermission(handle: DirectoryHandle): Promise<boolean> {
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

/** Soft sanity check: the picked folder should already hold .rmg.json files. */
export async function looksLikeTemplatesFolder(handle: DirectoryHandle): Promise<boolean> {
  try {
    let inspected = 0;
    for await (const name of handle.keys()) {
      if (name.endsWith('.rmg.json')) return true;
      if (++inspected >= 200) break;
    }
  } catch {
    // An unreadable folder gets the warning too
  }
  return false;
}

export async function fileExistsInFolder(handle: DirectoryHandle, name: string): Promise<boolean> {
  try {
    await handle.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

export async function writeFileToFolder(handle: DirectoryHandle, name: string, content: string): Promise<void> {
  const file = await handle.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}
