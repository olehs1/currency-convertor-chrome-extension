export function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] as T | undefined);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export function storageSet<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    } catch (error) {
      reject(error);
    }
  });
}


