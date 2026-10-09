const DATABASE_NAME = "sleeve-record-gallery";
let connection: Promise<IDBDatabase> | undefined;

export function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(
      new Error("此浏览器无法使用本地存储。请使用支持 IndexedDB 的浏览器。"),
    );
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      let rejected = false;
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (rejected) {
          db.close();
          return;
        }
        db.createObjectStore("albums", { keyPath: "id" });
        db.createObjectStore("assets", { keyPath: "id" });
        db.createObjectStore("settings");
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
      request.onerror = () => {
        rejected = true;
        connection = undefined;
        reject(request.error ?? new Error("无法打开本地存储。"));
      };
      request.onblocked = () => {
        rejected = true;
        connection = undefined;
        reject(
          new Error("本地存储被其他窗口占用，请关闭其他唱片馆窗口后重试。"),
        );
      };
    });
  }
  return connection;
}
export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error("保存失败。请检查浏览器存储空间后重试。"),
      );
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("本地存储操作失败。"));
  });
}
export function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("读取本地数据失败。"));
  });
}
