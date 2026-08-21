/*************************************************************
 * Google Sheet「Form responses」→ Mailchimp Audience 同步（完整版）
 * 额外功能：
 *  - 按「store name」自动分发到各个门店 sheet
 *  - 门店 sheet 不存在时自动创建
 *  - 用隐藏辅助列 _SOURCE_ROW_KEY 做去重，避免重复追加
 *
 * 本版修复：10,000,000 cells 上限导致的 syncMailchimp 失败
 *  1) 错误日志写入失败不再中断整个同步（try/catch 包裹）
 *  2) MC_ERROR_LOG 自动裁剪，不再无限增长
 *  3) 自动创建门店 sheet 时裁掉多余空列，减少占用
 *  4) 新增 reportCellUsage / trimAllSheets / resetErrorLog 维护函数
 *************************************************************/

/** ====== 基本配置 ====== */
const SHEET_NAME               = 'Form responses';
const ERROR_SHEET              = 'MC_ERROR_LOG';
const STATIC_TAG               = 'membership system';
const CONSENT_COL              = 'marketing consent';
const CARDTYPE_COL             = 'please select card type';
const STORE_COL                = 'store name';
const BATCH_SIZE               = 400;
const MAX_RETRIES              = 5;
const BASE_BACKOFF             = 500;
const SLEEP_BETWEEN            = 350;
const BIRTHDAY_MODE            = 'birthday'; // 'birthday' -> MM/dd；'date' -> MM/dd/yyyy
const DISTRIBUTE_TO_STORE_TAB  = true;
const STORE_KEY_HEADER         = '_SOURCE_ROW_KEY';
const HIDE_STORE_KEY_COLUMN    = true;
const SKIP_BLANK_STORE_ROWS    = true;
const ERROR_LOG_MAX_ROWS       = 5000; // MC_ERROR_LOG 最多保留多少条数据行

// 源列名 → Mailchimp Merge Tag（请与表头一致）
const FIELD_MAP = {
  'store name'             : 'STORE',
  'full name - first name' : 'FNAME',
  'full name - last name'  : 'LNAME',
  'phone number'           : 'PHONE',
  'date of birth'          : 'BIRTHDAY',
  'membership number'      : 'MEMNO',
  'new card number'        : 'CARDNUM',
  'email'                  : 'EMAIL'
};

/** ====== 入口函数：运行这个即可 ====== */
function syncMailchimp() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log('Another run is in progress. Exiting.');
    return;
  }

  try {
    const props   = PropertiesService.getScriptProperties();
    const API_KEY = props.getProperty('MC_API_KEY');
    const LIST_ID = props.getProperty('MC_LIST_ID');
    if (!API_KEY || !LIST_ID) {
      throw new Error('Missing MC_API_KEY or MC_LIST_ID in Script Properties');
    }

    const DC = API_KEY.split('-')[1];
    const source = getSourceSheetData();

    if (DISTRIBUTE_TO_STORE_TAB) {
      const distribution = distributeRowsToStoreSheets(source);
      Logger.log(
        `Store sheets updated. Added=${distribution.appended}, ` +
        `Skipped=${distribution.skipped}, Sheets=${distribution.sheetCount}`
      );
    }

    const { members, skippedCount } = collectMembersFromData(source);
    Logger.log(`Members ready: ${members.length}, skipped (filtered/invalid/dupe): ${skippedCount}`);

    ensureErrorSheet();
    if (members.length === 0) return;

    const chunks = chunk(members, BATCH_SIZE);
    let created = 0;
    let updated = 0;
    let errorCount = 0;

    chunks.forEach((batch, idx) => {
      if (idx > 0) Utilities.sleep(SLEEP_BETWEEN);

      const url = `https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}`;
      const payload = JSON.stringify({ members: batch, update_existing: true });
      const res = fetchWithRetry(url, {
        method: 'post',
        headers: { Authorization: `apikey ${API_KEY}` },
        contentType: 'application/json',
        payload,
        muteHttpExceptions: true
      });

      const code = res.getResponseCode();
      const body = res.getContentText();
      Logger.log(`Batch ${idx + 1}/${chunks.length} → HTTP ${code}`);

      try {
        const js = JSON.parse(body);
        created += js.total_created || 0;
        updated += js.total_updated || 0;
        errorCount += js.error_count || 0;
        if (Array.isArray(js.errors) && js.errors.length) {
          safeLogErrors(js.errors);
        }
      } catch (e) {
        safeLogErrors([{
          email_address: '',
          code: `HTTP_${code}`,
          error: body.slice(0, 500),
          field: ''
        }]);
      }
    });

    Logger.log(`Done. Created=${created}, Updated=${updated}, Errors=${errorCount}`);
  } finally {
    lock.releaseLock();
  }
}

/** 错误日志写入失败时，绝不能中断整个同步 */
function safeLogErrors(errors) {
  try {
    logErrorsToSheet(errors);
  } catch (logErr) {
    Logger.log(`Could not write to ${ERROR_SHEET}: ${logErr.message}`);
  }
}

/** 仅按门店拆分到各个 sheet，不推送 Mailchimp */
function splitRowsToStoreSheetsOnly() {
  const source = getSourceSheetData();
  const distribution = distributeRowsToStoreSheets(source);
  Logger.log(
    `Store sheets updated. Added=${distribution.appended}, ` +
    `Skipped=${distribution.skipped}, Sheets=${distribution.sheetCount}`
  );
}

/** ====== 读取源表 ====== */
function getSourceSheetData() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error(`Sheet "${SHEET_NAME}" not found`);

  const values = sh.getDataRange().getValues();
  if (values.length === 0) {
    throw new Error(`Sheet "${SHEET_NAME}" is empty`);
  }

  const headers = values[0];
  const rows = values.slice(1);
  const idx = createHeaderIndexer(headers);

  if (idx('email') === -1) throw new Error('Header "email" not found');
  if (idx(CONSENT_COL) === -1) throw new Error(`Header "${CONSENT_COL}" not found`);
  if (idx(STORE_COL) === -1) throw new Error(`Header "${STORE_COL}" not found`);

  return { sheet: sh, headers, rows, idx };
}

/** ====== 分发到门店 sheet ====== */
function distributeRowsToStoreSheets(source) {
  const ss = SpreadsheetApp.getActive();
  const storeIdx = source.idx(STORE_COL);
  const timestampIdx = source.idx('timestamp');
  const emailIdx = source.idx('email');
  const memnoIdx = source.idx('membership number');
  const cardnoIdx = source.idx('new card number');

  const buckets = {};
  let skipped = 0;

  source.rows.forEach(row => {
    const rawStore = row[storeIdx];
    const storeName = sanitizeSheetName(rawStore);

    if (!storeName) {
      if (SKIP_BLANK_STORE_ROWS) skipped++;
      return;
    }

    const rowKey = buildSourceRowKey(row, {
      timestampIdx,
      emailIdx,
      memnoIdx,
      cardnoIdx,
      storeIdx
    });

    if (!buckets[storeName]) buckets[storeName] = [];
    buckets[storeName].push({ row, rowKey });
  });

  let appended = 0;
  const storeNames = Object.keys(buckets);

  storeNames.forEach(storeName => {
    const sh = findOrCreateSheetByName_(ss, storeName, source.headers.length + 1);
    const keyCol = ensureStoreSheetHeader(sh, source.headers);
    const existingKeys = getExistingSourceKeys_(sh, keyCol);

    const rowsToAppend = [];
    buckets[storeName].forEach(item => {
      if (existingKeys.has(item.rowKey)) return;
      rowsToAppend.push(item.row.concat(item.rowKey));
      existingKeys.add(item.rowKey);
    });

    if (rowsToAppend.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length)
        .setValues(rowsToAppend);
      appended += rowsToAppend.length;
    }
  });

  return {
    appended,
    skipped,
    sheetCount: storeNames.length
  };
}

/** ====== 组装 Mailchimp members ====== */
function collectMembersFromData(source) {
  const seen = new Set();
  const members = [];
  let skipped = 0;

  source.rows.forEach(row => {
    const emailRaw = (row[source.idx('email')] || '').toString().trim().toLowerCase();
    if (!validEmail(emailRaw) || seen.has(emailRaw)) {
      skipped++;
      return;
    }

    const consentRaw = (row[source.idx(CONSENT_COL)] || '').toString().trim().toLowerCase();
    const consentOk = /email\s*subscription|consent|agree|yes|允许|同意/.test(consentRaw);
    if (!consentOk) {
      skipped++;
      return;
    }

    seen.add(emailRaw);

    const merge = {};
    Object.entries(FIELD_MAP).forEach(([col, tag]) => {
      if (tag === 'EMAIL') return;

      const columnIndex = source.idx(col);
      let value = columnIndex === -1 ? '' : row[columnIndex];

      if (tag === 'BIRTHDAY') value = fmtBirthday(value);
      if (tag === 'PHONE') value = normPhone(value);

      merge[tag] = value == null ? '' : value;
    });

    const tIdx = source.idx(CARDTYPE_COL);
    merge.TIER = tIdx === -1 ? '' : ((row[tIdx] || '').toString().split(':')[0]).trim();

    members.push({
      email_address: emailRaw,
      status_if_new: 'subscribed',
      status: 'subscribed',
      merge_fields: merge,
      tags: [STATIC_TAG]
    });
  });

  return { members, skippedCount: skipped };
}

/** ====== 工具函数区 ====== */

function createHeaderIndexer(headers) {
  const normalize = value => value.toString().toLowerCase().replace(/[\s–—-]+/g, '');
  return label => headers.findIndex(header => header && normalize(header) === normalize(label));
}

function sanitizeSheetName(value) {
  const name = (value || '').toString().trim().replace(/[\[\]\*\/\\\?\:]/g, ' ');
  return name.slice(0, 100).trim();
}

function buildSourceRowKey(row, indexes) {
  const parts = [
    safeKeyPart_(row[indexes.timestampIdx]),
    safeKeyPart_(row[indexes.storeIdx]),
    safeKeyPart_(row[indexes.emailIdx]).toLowerCase(),
    safeKeyPart_(row[indexes.memnoIdx]),
    safeKeyPart_(row[indexes.cardnoIdx])
  ].filter(Boolean);

  if (parts.length === 0) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(row));
  }

  return parts.join('||');
}

function safeKeyPart_(value) {
  if (value == null) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }
  return value.toString().trim();
}

/**
 * 找到或创建门店 sheet。
 * 新建时把默认 1000×26 的网格裁到刚好够用，避免每个 sheet 白白占用上万空单元格。
 */
function findOrCreateSheetByName_(ss, targetName, neededCols) {
  const targetNorm = targetName.toLowerCase();
  const found = ss.getSheets().find(sheet => sheet.getName().trim().toLowerCase() === targetNorm);
  if (found) return found;

  const sh = ss.insertSheet(targetName);
  const keepCols = Math.max(neededCols || 1, 1);
  if (sh.getMaxColumns() > keepCols) {
    sh.deleteColumns(keepCols + 1, sh.getMaxColumns() - keepCols);
  }
  return sh;
}

function ensureStoreSheetHeader(sh, sourceHeaders) {
  const expectedHeaders = sourceHeaders.concat(STORE_KEY_HEADER);
  const lastRow = sh.getLastRow();

  if (lastRow === 0) {
    sh.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    sh.setFrozenRows(1);
  } else {
    const currentHeaders = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), expectedHeaders.length)).getValues()[0];
    const existingSourceHeaders = currentHeaders.slice(0, sourceHeaders.length);
    const headersMatch = sourceHeaders.every((header, index) => (existingSourceHeaders[index] || '') === header);

    if (!headersMatch) {
      throw new Error(
        `Sheet "${sh.getName()}" header does not match "${SHEET_NAME}". ` +
        'Please keep the first row aligned with the source sheet headers.'
      );
    }

    if (currentHeaders[sourceHeaders.length] !== STORE_KEY_HEADER) {
      sh.getRange(1, sourceHeaders.length + 1).setValue(STORE_KEY_HEADER);
    }
  }

  const keyCol = sourceHeaders.length + 1;
  if (HIDE_STORE_KEY_COLUMN) {
    sh.hideColumns(keyCol);
  }
  return keyCol;
}

function getExistingSourceKeys_(sh, keyCol) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return new Set();

  const values = sh.getRange(2, keyCol, lastRow - 1, 1).getValues();
  const set = new Set();
  values.forEach(item => {
    const key = (item[0] || '').toString().trim();
    if (key) set.add(key);
  });
  return set;
}

function validEmail(s) {
  if (!s) return false;
  if (!s.includes('@')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function fmtBirthday(d) {
  if (!d) return '';
  const tz = Session.getScriptTimeZone();
  const dateObj = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '';
  return BIRTHDAY_MODE === 'birthday'
    ? Utilities.formatDate(dateObj, tz, 'MM/dd')
    : Utilities.formatDate(dateObj, tz, 'MM/dd/yyyy');
}

function normPhone(raw) {
  if (!raw) return '';
  let digits = raw.toString().replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = '61' + digits.slice(1);
  if (!digits.startsWith('61')) digits = '61' + digits;
  return '+' + digits;
}

function fetchWithRetry(url, options) {
  let attempt = 0;
  while (true) {
    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    if ((code >= 200 && code < 300) || (code >= 400 && code < 500 && code !== 429)) {
      return res;
    }

    attempt++;
    if (attempt > MAX_RETRIES) return res;

    const backoff = BASE_BACKOFF * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
    Logger.log(`Transient HTTP ${code}. Retry ${attempt}/${MAX_RETRIES} in ${backoff}ms`);
    Utilities.sleep(backoff);
  }
}

function ensureErrorSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ERROR_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ERROR_SHEET);
    sh.getRange(1, 1, 1, 7).setValues([['timestamp', 'email', 'code', 'field', 'message', 'row_json', 'notes']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * 写入错误日志前先裁剪旧数据行，避免 MC_ERROR_LOG 无限增长撑爆工作簿。
 */
function logErrorsToSheet(errors) {
  const sh = SpreadsheetApp.getActive().getSheetByName(ERROR_SHEET) || ensureErrorSheet();

  const dataRows = sh.getLastRow() - 1; // 减去表头
  if (dataRows > ERROR_LOG_MAX_ROWS) {
    sh.deleteRows(2, dataRows - ERROR_LOG_MAX_ROWS);
  }

  const ts = new Date();
  const rows = errors.map(e => [
    ts,
    e.email_address || '',
    e.code || '',
    e.field || '',
    e.error || '',
    e.row ? JSON.stringify(e.row) : '',
    ''
  ]);
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** ====== 维护 / 诊断函数（手动运行）====== */

/** 列出每个 sheet 占用的单元格数，找出谁撑爆了 10,000,000 上限 */
function reportCellUsage() {
  const ss = SpreadsheetApp.getActive();
  let total = 0;
  const rows = ss.getSheets().map(sh => {
    const cells = sh.getMaxRows() * sh.getMaxColumns();
    total += cells;
    return { name: sh.getName(), rows: sh.getMaxRows(), cols: sh.getMaxColumns(), cells };
  }).sort((a, b) => b.cells - a.cells);

  rows.forEach(r => Logger.log(`${r.cells}  (${r.rows}×${r.cols})  ${r.name}`));
  Logger.log(`TOTAL = ${total} / 10000000`);
}

/** 把每个 sheet 多余的空行 / 空列删掉，回收单元格 */
function trimAllSheets() {
  SpreadsheetApp.getActive().getSheets().forEach(sh => {
    const lastRow = Math.max(sh.getLastRow(), 1);
    const lastCol = Math.max(sh.getLastColumn(), 1);
    if (sh.getMaxRows()    > lastRow) sh.deleteRows(lastRow + 1, sh.getMaxRows() - lastRow);
    if (sh.getMaxColumns() > lastCol) sh.deleteColumns(lastCol + 1, sh.getMaxColumns() - lastCol);
  });
  Logger.log('Trimmed all sheets.');
}

/** 如果 MC_ERROR_LOG 太大，直接删掉重建（错误每次同步都会重新记录）*/
function resetErrorLog() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(ERROR_SHEET);
  if (sh) ss.deleteSheet(sh);
  ensureErrorSheet();
  Logger.log('Error log reset.');
}
