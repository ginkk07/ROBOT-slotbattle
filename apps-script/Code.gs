const SESSION_HEADERS = [
  'game_id',
  'owner_id',
  'status',
  'state_json',
  'revision',
  'updated_at',
];

const PROFILE_HEADERS = [
  'player_id',
  'profile_json',
  'revision',
  'updated_at',
];

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    verifySecret_(body.secret);

    let result;
    switch (body.action) {
      case 'createSession':
        result = createSession_(body.state);
        break;
      case 'getSession':
        result = { session: getSession_(body.gameId) };
        break;
      case 'saveSession':
        result = saveSession_(body.state, body.expectedRevision);
        break;
      case 'findActiveSessionByOwner':
        result = { session: findActiveSessionByOwner_(body.ownerId) };
        break;
      case 'getOrCreateProfile':
        result = getOrCreateProfile_(body.playerId, body.defaultProfile);
        break;
      case 'saveProfile':
        result = saveProfile_(body.profile, body.expectedRevision);
        break;
      default:
        throw apiError_('bad_request', '未知的 action');
    }

    return json_({ ok: true, ...result });
  } catch (error) {
    return json_({
      ok: false,
      error: {
        code: error.apiCode || 'internal_error',
        message: error.message || '未知錯誤',
      },
    });
  }
}

function setupSheets() {
  const spreadsheet = spreadsheet_();
  ensureSheet_(spreadsheet, 'slotbattle_sessions', SESSION_HEADERS);
  ensureSheet_(spreadsheet, 'slotbattle_profiles', PROFILE_HEADERS);
}

function createSession_(state) {
  validateState_(state);
  return withLock_(function () {
    const sheet = sessionSheet_();
    if (findRow_(sheet, 1, state.id)) {
      throw apiError_('conflict', '遊戲已存在');
    }
    if (findActiveSessionByOwner_(state.ownerId)) {
      throw apiError_('conflict', '玩家已有進行中的遊戲');
    }

    const updatedAt = new Date().toISOString();
    sheet.appendRow([
      state.id,
      state.ownerId,
      state.status,
      JSON.stringify(state),
      1,
      updatedAt,
    ]);
    return { session: sessionRecord_(state, 1, updatedAt) };
  });
}

function getSession_(gameId) {
  const sheet = sessionSheet_();
  const row = findRow_(sheet, 1, gameId);
  return row ? sessionFromRow_(sheet, row) : null;
}

function saveSession_(state, expectedRevision) {
  validateState_(state);
  return withLock_(function () {
    const sheet = sessionSheet_();
    const row = findRow_(sheet, 1, state.id);
    if (!row) throw apiError_('not_found', '找不到遊戲');

    const currentRevision = Number(sheet.getRange(row, 5).getValue());
    assertRevision_(currentRevision, expectedRevision);
    const revision = currentRevision + 1;
    const updatedAt = new Date().toISOString();
    sheet.getRange(row, 1, 1, SESSION_HEADERS.length).setValues([[
      state.id,
      state.ownerId,
      state.status,
      JSON.stringify(state),
      revision,
      updatedAt,
    ]]);
    return { session: sessionRecord_(state, revision, updatedAt) };
  });
}

function findActiveSessionByOwner_(ownerId) {
  const sheet = sessionSheet_();
  const values = sheet.getDataRange().getValues();
  const matches = values.slice(1).filter(function (row) {
    return String(row[1]) === String(ownerId) && row[2] === 'active';
  });

  if (!matches.length) return null;
  matches.sort(function (left, right) {
    return String(right[5]).localeCompare(String(left[5]));
  });
  return sessionFromValues_(matches[0]);
}

function getOrCreateProfile_(playerId, defaultProfile) {
  if (!playerId || !defaultProfile) throw apiError_('bad_request', '玩家資料不完整');
  if (String(defaultProfile.playerId) !== String(playerId)) {
    throw apiError_('bad_request', '玩家ID不一致');
  }
  return withLock_(function () {
    const sheet = profileSheet_();
    const row = findRow_(sheet, 1, playerId);
    if (row) return { profile: profileFromRow_(sheet, row) };

    const updatedAt = new Date().toISOString();
    sheet.appendRow([playerId, JSON.stringify(defaultProfile), 1, updatedAt]);
    return { profile: profileRecord_(defaultProfile, 1, updatedAt) };
  });
}

function saveProfile_(profile, expectedRevision) {
  if (!profile || !profile.playerId) throw apiError_('bad_request', '玩家資料不完整');
  return withLock_(function () {
    const sheet = profileSheet_();
    const row = findRow_(sheet, 1, profile.playerId);
    if (!row) throw apiError_('not_found', '找不到玩家');

    const currentRevision = Number(sheet.getRange(row, 3).getValue());
    assertRevision_(currentRevision, expectedRevision);
    const revision = currentRevision + 1;
    const updatedAt = new Date().toISOString();
    sheet.getRange(row, 1, 1, PROFILE_HEADERS.length).setValues([[
      profile.playerId,
      JSON.stringify(profile),
      revision,
      updatedAt,
    ]]);
    return { profile: profileRecord_(profile, revision, updatedAt) };
  });
}

function sessionSheet_() {
  return ensureSheet_(spreadsheet_(), 'slotbattle_sessions', SESSION_HEADERS);
}

function profileSheet_() {
  return ensureSheet_(spreadsheet_(), 'slotbattle_profiles', PROFILE_HEADERS);
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const spreadsheet = id
    ? SpreadsheetApp.openById(id)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw apiError_('configuration', '尚未設定 SPREADSHEET_ID');
  return spreadsheet;
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function findRow_(sheet, column, value) {
  if (sheet.getLastRow() < 2) return 0;
  const match = sheet
    .getRange(2, column, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(value))
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : 0;
}

function sessionFromRow_(sheet, row) {
  return sessionFromValues_(sheet.getRange(row, 1, 1, SESSION_HEADERS.length).getValues()[0]);
}

function sessionFromValues_(values) {
  return sessionRecord_(JSON.parse(values[3]), Number(values[4]), String(values[5]));
}

function profileFromRow_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, PROFILE_HEADERS.length).getValues()[0];
  return profileRecord_(JSON.parse(values[1]), Number(values[2]), String(values[3]));
}

function sessionRecord_(state, revision, updatedAt) {
  return { state: state, revision: revision, updatedAt: updatedAt };
}

function profileRecord_(profile, revision, updatedAt) {
  return { profile: profile, revision: revision, updatedAt: updatedAt };
}

function validateState_(state) {
  if (!state || !state.id || !state.ownerId || !state.status) {
    throw apiError_('bad_request', '戰鬥資料不完整');
  }
}

function assertRevision_(actual, expected) {
  if (expected !== undefined && Number(expected) !== actual) {
    throw apiError_('conflict', '資料版本不一致，請重新操作');
  }
}

function verifySecret_(received) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_SECRET');
  if (!expected) throw apiError_('configuration', '尚未設定 API_SECRET');
  if (!received || received !== expected) throw apiError_('unauthorized', '驗證失敗');
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function apiError_(code, message) {
  const error = new Error(message);
  error.apiCode = code;
  return error;
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
