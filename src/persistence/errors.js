export class StoreConflictError extends Error {
  constructor(message = '資料已被其他操作更新') {
    super(message);
    this.name = 'StoreConflictError';
    this.code = 'conflict';
  }
}

export class StoreNotFoundError extends Error {
  constructor(message = '找不到資料') {
    super(message);
    this.name = 'StoreNotFoundError';
    this.code = 'not_found';
  }
}
