/********* Birthday Sync - Production Safe Version *********
 * 设计原则：
 * 1. 日常同步默认保守，不自动删字段，不自动批量换码
 * 2. 只有 Mailchimp 写回成功后，才更新 Sheet
 * 3. 生日字段 tag 可配置，并且只接受明确日期格式
 * 4. 高风险动作拆分成单独函数，必须人工执行
 *
 * 2026-10 修改（每年换码）：
 * - 生日前 ROTATE_LEAD_DAYS 天（默认 7 天）自动给当年生日换新码，
 *   这样 Mailchimp 生日当天发邮件时，邮件里已经是新码。
 * - 只在“生日前 N 天内”才换码：刚过完生日、礼物码还在 20 天有效期内的会员不会被换掉。
 * - 换码时清空 Sheet 里的 Redeemed / Staff Name / Redeem Time（原有逻辑）。
 * - 新会员生成的码，CODE_YEAR 记为“下一个生日”所在年份。
 * - AUTO_ROTATE_CODE_IN_SYNC 默认改为 true（可在脚本属性里设 false 关闭）。
 * - 新增 installDailyTrigger()：手动运行一次，每天凌晨 3 点自动同步。
 *
 * 2026-11 修改（一个会员出错不再拖垮整次同步）：
 * - 写回 Mailchimp 时只发要改的字段（CODE / CODE_YEAR / 必要时 BIRTHDAY），
 *   不再把会员全部 merge fields 原样发回去——会员原有的某个字段格式不对，
 *   Mailchimp 会拒绝整个更新（例：roy_nusantara@hotmail.com 的 ADDRESS 只填了一半，
 *   400 "Please enter a complete address"）。
 * - ADDRESS 不完整（缺 addr1 / city / state / zip 任意一项）时，只补空着的部分
 *   （n/a / 0000 / AU），已有的地址内容保留。
 * - 某个会员写回失败：记 Error 日志、跳过这个人（Sheet 保持原来的码），
 *   其他会员照常同步并写入 Sheet。以前是直接抛错，整次同步一个都不写 Sheet。
 * - Sync_Log 新增一列 Patch Failed。
 ***********************************************************/

/********* 0. UTILITIES *********/
function pad2(n) {
  return ('0' + n).slice(-2);
}

function asBool(value, defaultValue) {
  if (value == null || value === '') {
    return defaultValue;
  }

  return String(value).toLowerCase() === 'true';
}

function generateCode(existingCodes) {
  let code;
  do {
    code =
      Date.now().toString(36).slice(-6) +
      Math.random().toString(36).slice(-2);
    code = code.toUpperCase();
  } while (existingCodes.has(code));

  existingCodes.add(code);
  return code;
}

function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function mailchimpRequest_(url, options) {
  const requestOptions = Object.assign(
    {
      muteHttpExceptions: true
    },
    options || {}
  );

  const res = UrlFetchApp.fetch(url, requestOptions);
  const status = res.getResponseCode();
  const body = res.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      'Mailchimp API failed [' + status + '] ' + url + ' :: ' + body
    );
  }

  return body ? JSON.parse(body) : {};
}

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  const MC_API_KEY = props.getProperty('MC_API_KEY');
  const LIST_ID = props.getProperty('LIST_ID');

  if (!MC_API_KEY || !LIST_ID) {
    throw new Error('请先在脚本属性中设置 MC_API_KEY 与 LIST_ID');
  }

  const parts = MC_API_KEY.split('-');
  if (parts.length < 2 || !parts[1]) {
    throw new Error('MC_API_KEY 格式不正确，无法解析数据中心');
  }

  return {
    MC_API_KEY: MC_API_KEY,
    LIST_ID: LIST_ID,
    MC_SERVER: parts[1],
    SHEET_NAME: props.getProperty('SHEET_NAME') || 'Members',
    LOG_SHEET_NAME: props.getProperty('LOG_SHEET_NAME') || 'Sync_Log',
    BIRTHDAY_TAG: props.getProperty('BIRTHDAY_TAG') || 'BIRTHDAY',
    CODE_TAG: props.getProperty('CODE_TAG') || 'CODE',
    CODE_YEAR_TAG: props.getProperty('CODE_YEAR_TAG') || 'CODE_YEAR',
    STORE_TAG: props.getProperty('STORE_TAG') || 'STORE',
    FIRST_NAME_TAG: props.getProperty('FIRST_NAME_TAG') || 'FNAME',
    LAST_NAME_TAG: props.getProperty('LAST_NAME_TAG') || 'LNAME',
    PHONE_TAG: props.getProperty('PHONE_TAG') || 'PHONE',
    WRITE_BACK_BIRTHDAY_IF_EMPTY: asBool(
      props.getProperty('WRITE_BACK_BIRTHDAY_IF_EMPTY'),
      false
    ),
    AUTO_GENERATE_CODE_FOR_NEW_BDAY_MEMBER: asBool(
      props.getProperty('AUTO_GENERATE_CODE_FOR_NEW_BDAY_MEMBER'),
      true
    ),
    AUTO_ROTATE_CODE_IN_SYNC: asBool(
      props.getProperty('AUTO_ROTATE_CODE_IN_SYNC'),
      true
    ),
    ROTATE_LEAD_DAYS: Number(props.getProperty('ROTATE_LEAD_DAYS') || 7),
    STRICT_FIELD_CHECK: asBool(
      props.getProperty('STRICT_FIELD_CHECK'),
      true
    ),
    MEMBER_PAGE_SIZE: Number(props.getProperty('MEMBER_PAGE_SIZE') || 1000),
    FETCH_BATCH_SIZE: Number(props.getProperty('FETCH_BATCH_SIZE') || 8),
    PATCH_BATCH_SIZE: Number(props.getProperty('PATCH_BATCH_SIZE') || 10)
  };
}

/********* 1. MAIN ENTRY *********/
function syncMembersProduction() {
  return withScriptLock_(function() {
    const config = getConfig();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stats = {
      totalMembers: 0,
      skippedNoEmail: 0,
      skippedNoBirthday: 0,
      appended: 0,
      updated: 0,
      codeCreated: 0,
      codeRotated: 0,
      clearedRedeemedFields: 0,
      patchFailed: 0
    };

    validateRequiredMergeFields_(config);

    const members = fetchAllMembers_(config);
    stats.totalMembers = members.length;

    initMembersSheet_(ss, config.SHEET_NAME);
    initLogSheet_(ss, config.LOG_SHEET_NAME);

    const maps = buildExistingMaps_(ss, config.SHEET_NAME);
    syncMembersToSheet_(ss, members, maps, config, stats);

    logSyncSummary_(ss, config.LOG_SHEET_NAME, 'syncMembersProduction', stats);
    Logger.log(JSON.stringify(stats));
    return stats;
  });
}

/********* 2. HIGH-RISK ACTIONS - MANUAL ONLY *********/
function rotateCodesForCurrentCycle() {
  return withScriptLock_(function() {
    const config = getConfig();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stats = {
      totalMembers: 0,
      skippedNoBirthday: 0,
      rotated: 0,
      patchFailed: 0
    };

    validateRequiredMergeFields_(config);
    initMembersSheet_(ss, config.SHEET_NAME);
    initLogSheet_(ss, config.LOG_SHEET_NAME);

    const members = fetchAllMembers_(config);
    const maps = buildExistingMaps_(ss, config.SHEET_NAME);
    stats.totalMembers = members.length;

    members.forEach(function(member) {
      const email = normalizedEmail_(member.email_address);
      if (!email) {
        return;
      }

      const mergeFields = member.merge_fields || {};
      const normBday = normalizeBirthday(mergeFields[config.BIRTHDAY_TAG] || '');
      if (!normBday) {
        stats.skippedNoBirthday++;
        return;
      }

      const info = getUpcomingBirthdayInfo_(normBday);
      const currentYear = String(mergeFields[config.CODE_YEAR_TAG] || '').trim();
      if (!shouldRotate_(info, currentYear, config)) {
        return;
      }

      const nextCode = generateCode(maps.existingCodes);
      try {
        patchMemberFields_(
          member,
          {
            code: nextCode,
            codeYear: String(info.targetYear),
            birthday: null
          },
          config
        );
      } catch (err) {
        // 一个会员失败不影响其他人；这个人的 Sheet 保持原样
        stats.patchFailed++;
        console.error('rotate failed | email=' + email + ' :: ' + err.message);
        return;
      }

      const rowNo = maps.emailsRowMap.get(email);
      if (rowNo) {
        writeMemberRow_(
          ss.getSheetByName(config.SHEET_NAME),
          rowNo,
          buildSheetRow_(member, normBday, nextCode, config)
        );
        ss.getSheetByName(config.SHEET_NAME).getRange(rowNo, 8, 1, 3).clearContent();
      }

      stats.rotated++;
    });

    logSyncSummary_(ss, config.LOG_SHEET_NAME, 'rotateCodesForCurrentCycle', stats);
    Logger.log(JSON.stringify(stats));
    return stats;
  });
}

function ensureCodeFieldsManually() {
  return withScriptLock_(function() {
    const config = getConfig();
    const fields = fetchMergeFields_(config);

    ensureTextMergeFieldSafe_(fields, config.CODE_TAG, config);
    ensureTextMergeFieldSafe_(fields, config.CODE_YEAR_TAG, config);
  });
}

/********* 3. MAILCHIMP *********/
function fetchAllMembers_(config) {
  const pageSize = Math.min(Math.max(config.MEMBER_PAGE_SIZE || 1000, 1), 1000);
  const firstPage = mailchimpRequest_(buildMembersListUrl_(config, pageSize, 0), {
    headers: {
      Authorization: 'apikey ' + config.MC_API_KEY
    }
  });

  const all = (firstPage.members || []).slice();
  const totalItems = firstPage.total_items || all.length;
  if (all.length >= totalItems) {
    return all;
  }

  const requests = [];
  for (let offset = pageSize; offset < totalItems; offset += pageSize) {
    requests.push({
      url: buildMembersListUrl_(config, pageSize, offset),
      headers: {
        Authorization: 'apikey ' + config.MC_API_KEY
      },
      muteHttpExceptions: true
    });
  }

  const batchSize = Math.max(config.FETCH_BATCH_SIZE || 8, 1);
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const responses = UrlFetchApp.fetchAll(batch);
    responses.forEach(function(res, idx) {
      const status = res.getResponseCode();
      const body = res.getContentText();
      if (status < 200 || status >= 300) {
        throw new Error(
          'Mailchimp API failed [' +
            status +
            '] ' +
            batch[idx].url +
            ' :: ' +
            body
        );
      }

      const json = body ? JSON.parse(body) : {};
      all.push.apply(all, json.members || []);
    });
  }

  return all;
}

function buildMembersListUrl_(config, count, offset) {
  return (
    'https://' +
    config.MC_SERVER +
    '.api.mailchimp.com/3.0/lists/' +
    config.LIST_ID +
    '/members?count=' +
    count +
    '&offset=' +
    offset
  );
}

function fetchMergeFields_(config) {
  const url =
    'https://' +
    config.MC_SERVER +
    '.api.mailchimp.com/3.0/lists/' +
    config.LIST_ID +
    '/merge-fields';

  const json = mailchimpRequest_(url, {
    headers: {
      Authorization: 'apikey ' + config.MC_API_KEY
    }
  });

  return json.merge_fields || [];
}

function listMergeFieldsProduction() {
  const config = getConfig();
  fetchMergeFields_(config).forEach(function(field) {
    Logger.log(
      'merge_id=' +
        field.merge_id +
        ' | tag=' +
        field.tag +
        ' | name=' +
        field.name +
        ' | type=' +
        field.type
    );
  });
}

function debugMemberBirthdayProduction(emailToFind) {
  const config = getConfig();
  const target = normalizedEmail_(emailToFind);
  const members = fetchAllMembers_(config);

  const member = members.find(function(item) {
    return normalizedEmail_(item.email_address) === target;
  });

  if (!member) {
    Logger.log('Member not found: ' + emailToFind);
    return;
  }

  Logger.log('email=' + member.email_address);
  Logger.log('configured BIRTHDAY_TAG=' + config.BIRTHDAY_TAG);
  Logger.log('merge_fields=' + JSON.stringify(member.merge_fields || {}));
}

function validateRequiredMergeFields_(config) {
  if (!config.STRICT_FIELD_CHECK) {
    return;
  }

  const fields = fetchMergeFields_(config);
  validateTextMergeField_(fields, config.CODE_TAG);
  validateTextMergeField_(fields, config.CODE_YEAR_TAG);
}

function validateTextMergeField_(fields, tag) {
  const field = fields.find(function(item) {
    return item.tag === tag;
  });

  if (!field) {
    throw new Error(
      'Mailchimp 缺少字段 [' + tag + ']。请先手动创建，或执行 ensureCodeFieldsManually()'
    );
  }

  if (field.type !== 'text') {
    throw new Error(
      'Mailchimp 字段 [' +
        tag +
        '] 类型为 [' +
        field.type +
        ']，生产版不会自动删除重建。请手动修正后再执行。'
    );
  }
}

function ensureTextMergeFieldSafe_(fields, tag, config) {
  const existing = fields.find(function(item) {
    return item.tag === tag;
  });

  if (existing && existing.type === 'text') {
    Logger.log('Field exists: ' + tag + ' (text)');
    return;
  }

  if (existing && existing.type !== 'text') {
    throw new Error(
      '字段 [' +
        tag +
        '] 已存在但类型为 [' +
        existing.type +
        ']。生产版不会自动删除，请手动处理。'
    );
  }

  const url =
    'https://' +
    config.MC_SERVER +
    '.api.mailchimp.com/3.0/lists/' +
    config.LIST_ID +
    '/merge-fields';

  mailchimpRequest_(url, {
    method: 'post',
    headers: {
      Authorization: 'apikey ' + config.MC_API_KEY
    },
    contentType: 'application/json',
    payload: JSON.stringify({
      tag: tag,
      name: tag,
      type: 'text',
      required: false,
      public: false
    })
  });

  Logger.log('Created text merge field: ' + tag);
}

function patchMemberFields_(member, updates, config) {
  const request = buildPatchMemberRequest_(member, updates, config);
  mailchimpRequest_(request.url, request.options);
}

/**
 * ADDRESS 不完整时返回补全后的地址（只填空着的部分），完整时返回 null（不动它）。
 * Mailchimp 对“填了一半的地址”会拒绝整个更新："Please enter a complete address"；
 * ADDRESS 设为必填时，空地址也会被拒——所以空的也补成 n/a。
 */
function completeAddress_(addr) {
  const a = addr && typeof addr === 'object' ? addr : {};
  const isComplete = a.addr1 && a.city && a.state && a.zip;
  if (isComplete) {
    return null;
  }

  return {
    addr1: a.addr1 || 'n/a',
    addr2: a.addr2 || '',
    city: a.city || 'n/a',
    state: a.state || 'n/a',
    zip: a.zip || '0000',
    country: a.country || 'AU'
  };
}

function buildPatchMemberRequest_(member, updates, config) {
  const current = member.merge_fields || {};
  // 只发要改的字段：Mailchimp 的 PATCH 不会动没发的字段，
  // 也就不会因为会员其他字段原本格式不对而拒绝整个更新。
  const mergeFields = {};

  if (updates.code != null) {
    mergeFields[config.CODE_TAG] = updates.code;
  }

  if (updates.codeYear != null) {
    mergeFields[config.CODE_YEAR_TAG] = updates.codeYear;
  }

  if (
    updates.birthday &&
    config.WRITE_BACK_BIRTHDAY_IF_EMPTY &&
    !current[config.BIRTHDAY_TAG]
  ) {
    mergeFields[config.BIRTHDAY_TAG] = updates.birthday;
  }

  const fixedAddress = completeAddress_(current.ADDRESS);
  if (fixedAddress) {
    mergeFields.ADDRESS = fixedAddress;
  }

  const url =
    'https://' +
    config.MC_SERVER +
    '.api.mailchimp.com/3.0/lists/' +
    config.LIST_ID +
    '/members/' +
    member.id;

  return {
    url: url,
    options: {
      method: 'patch',
      headers: {
        Authorization: 'apikey ' + config.MC_API_KEY
      },
      contentType: 'application/json',
      payload: JSON.stringify({
        merge_fields: mergeFields
      })
    }
  };
}

/**
 * 批量写回 Mailchimp。不再遇到第一个失败就抛错：
 * 返回失败会员的 email 集合，由调用方把这些人在 Sheet 里保持原样。
 */
function executePatchRequests_(patchJobs, config) {
  const failed = new Set();
  if (!patchJobs.length) {
    return failed;
  }

  const batchSize = Math.max(config.PATCH_BATCH_SIZE || 10, 1);
  for (let i = 0; i < patchJobs.length; i += batchSize) {
    const batch = patchJobs.slice(i, i + batchSize);
    const requests = batch.map(function(job) {
      return Object.assign(
        {
          url: job.request.url,
          muteHttpExceptions: true
        },
        job.request.options
      );
    });

    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function(res, idx) {
      const status = res.getResponseCode();
      const body = res.getContentText();
      if (status < 200 || status >= 300) {
        failed.add(batch[idx].email);
        console.error(
          'Mailchimp patch failed [' +
            status +
            '] email=' +
            batch[idx].email +
            ' :: ' +
            body
        );
      }
    });
  }

  return failed;
}

/********* 4. SHEET *********/
function initMembersSheet_(ss, sheetName) {
  const header = [
    'Email',
    'First',
    'Last',
    'Phone',
    'Birthday (MM/DD)',
    'Code',
    'Store',
    'Redeemed',
    'Staff Name',
    'Redeem Time'
  ];

  let sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
  }

  if (sh.getMaxColumns() < header.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), header.length - sh.getMaxColumns());
  }

  sh.getRange(1, 1, 1, header.length).setValues([header]);
  sh.getRange(1, 5, sh.getMaxRows(), 1).setNumberFormat('@');
}

function initLogSheet_(ss, sheetName) {
  let sh = ss.getSheetByName(sheetName);
  const header = [
    'Timestamp',
    'Action',
    'Total Members',
    'Skipped No Email',
    'Skipped No Birthday',
    'Appended',
    'Updated',
    'Code Created',
    'Code Rotated',
    'Cleared Redeemed Fields',
    'Patch Failed'
  ];

  if (!sh) {
    sh = ss.insertSheet(sheetName);
  }

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, header.length).setValues([header]);
  } else if (!sh.getRange(1, header.length).getValue()) {
    // 旧的 Sync_Log 补上新加的列名
    sh.getRange(1, header.length).setValue(header[header.length - 1]);
  }
}

function buildExistingMaps_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  const lastRow = sh.getLastRow();
  const emailsRowMap = new Map();
  const rowIndexMap = new Map();
  const existingCodes = new Set();
  const existingRows = [];

  if (lastRow > 1) {
    const values = sh.getRange(2, 1, lastRow - 1, 10).getValues();
    values.forEach(function(row) {
      existingRows.push(row);
    });

    values.forEach(function(row, idx) {
      const email = normalizedEmail_(row[0]);
      const code = String(row[5] || '').trim().toUpperCase();

      if (email) {
        emailsRowMap.set(email, idx + 2);
        rowIndexMap.set(email, idx);
      }

      if (code) {
        existingCodes.add(code);
      }
    });
  }

  return {
    emailsRowMap: emailsRowMap,
    rowIndexMap: rowIndexMap,
    existingCodes: existingCodes,
    existingRows: existingRows
  };
}

function writeMemberRow_(sheet, rowNo, rowData) {
  sheet.getRange(rowNo, 5, 1, 1).setNumberFormat('@');
  sheet.getRange(rowNo, 1, 1, rowData.length).setValues([rowData]);
}

function appendMemberRows_(sheet, rows) {
  if (!rows.length) {
    return;
  }

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 5, rows.length, 1).setNumberFormat('@');
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

function buildSheetRow_(member, normBday, code, config) {
  const mergeFields = member.merge_fields || {};
  return [
    normalizedEmail_(member.email_address),
    mergeFields[config.FIRST_NAME_TAG] || '',
    mergeFields[config.LAST_NAME_TAG] || '',
    mergeFields[config.PHONE_TAG] || '',
    normBday,
    code || '',
    mergeFields[config.STORE_TAG] || '',
    '',
    '',
    ''
  ];
}

function syncMembersToSheet_(ss, members, maps, config, stats) {
  const sh = ss.getSheetByName(config.SHEET_NAME);
  const appendBuf = [];
  const patchJobs = [];
  const plans = [];
  const existingRows = maps.existingRows;
  let hasExistingRowMutation = false;

  // 第一步：决定每个会员要不要生成 / 换码，先只排队写回 Mailchimp
  members.forEach(function(member) {
    const email = normalizedEmail_(member.email_address);
    if (!email) {
      stats.skippedNoEmail++;
      return;
    }

    const mergeFields = member.merge_fields || {};
    const rawBday = mergeFields[config.BIRTHDAY_TAG] || '';
    const normBday = normalizeBirthday(rawBday);

    if (!normBday) {
      stats.skippedNoBirthday++;
      Logger.log(
        'skip no valid birthday | email=' +
          email +
          ' | tag=' +
          config.BIRTHDAY_TAG +
          ' | raw=' +
          rawBday
      );
      return;
    }

    const info = getUpcomingBirthdayInfo_(normBday);
    const oldCode = String(mergeFields[config.CODE_TAG] || '').trim().toUpperCase();
    const codeYear = String(mergeFields[config.CODE_YEAR_TAG] || '').trim();
    let code = oldCode;
    let didRotate = false;
    let didCreate = false;

    if (!code && config.AUTO_GENERATE_CODE_FOR_NEW_BDAY_MEMBER) {
      const updates = {
        code: generateCode(maps.existingCodes),
        codeYear: String(info.targetYear),
        birthday: normBday
      };
      code = updates.code;
      patchJobs.push({
        email: email,
        request: buildPatchMemberRequest_(member, updates, config)
      });
      didCreate = true;
    } else if (
      code &&
      config.AUTO_ROTATE_CODE_IN_SYNC &&
      shouldRotate_(info, codeYear, config)
    ) {
      const rotateUpdates = {
        code: generateCode(maps.existingCodes),
        codeYear: String(info.targetYear),
        birthday: normBday
      };
      code = rotateUpdates.code;
      patchJobs.push({
        email: email,
        request: buildPatchMemberRequest_(member, rotateUpdates, config)
      });
      didRotate = true;
    } else if (!code && !config.AUTO_GENERATE_CODE_FOR_NEW_BDAY_MEMBER) {
      Logger.log('skip no code | email=' + email + ' | birthday=' + normBday);
    }

    plans.push({
      member: member,
      email: email,
      normBday: normBday,
      info: info,
      oldCode: oldCode,
      code: code,
      didCreate: didCreate,
      didRotate: didRotate
    });
  });

  // 第二步：写回 Mailchimp；失败的会员在 Sheet 里保持原来的码
  const failed = executePatchRequests_(patchJobs, config);
  stats.patchFailed = failed.size;

  // 第三步：只有 Mailchimp 写回成功的新码才进 Sheet
  plans.forEach(function(plan) {
    let code = plan.code;
    let didCreate = plan.didCreate;
    let didRotate = plan.didRotate;

    if ((didCreate || didRotate) && failed.has(plan.email)) {
      code = plan.oldCode;
      didCreate = false;
      didRotate = false;
    }

    if (didCreate) {
      stats.codeCreated++;
    }

    if (didRotate) {
      stats.codeRotated++;
    }

    const rowData = buildSheetRow_(plan.member, plan.normBday, code, config);
    const rowIndex = maps.rowIndexMap.get(plan.email);

    if (rowIndex != null) {
      const existingRow = existingRows[rowIndex];
      rowData[7] = existingRow[7];
      rowData[8] = existingRow[8];
      rowData[9] = existingRow[9];

      if (didRotate) {
        rowData[7] = '';
        rowData[8] = '';
        rowData[9] = '';
        stats.clearedRedeemedFields++;
      }

      existingRows[rowIndex] = rowData;
      hasExistingRowMutation = true;
      stats.updated++;
    } else {
      appendBuf.push(rowData);
      stats.appended++;
    }

    if (didCreate) {
      Logger.log('created code | email=' + plan.email + ' | code=' + code);
    }

    if (didRotate) {
      Logger.log(
        'rotated code | email=' +
          plan.email +
          ' | birthday=' +
          plan.normBday +
          ' | targetYear=' +
          plan.info.targetYear +
          ' | daysUntil=' +
          plan.info.daysUntil
      );
    }
  });

  if (hasExistingRowMutation && existingRows.length) {
    sh.getRange(2, 5, existingRows.length, 1).setNumberFormat('@');
    sh.getRange(2, 1, existingRows.length, 10).setValues(existingRows);
  }

  appendMemberRows_(sh, appendBuf);
}

function logSyncSummary_(ss, sheetName, action, stats) {
  const sh = ss.getSheetByName(sheetName);
  sh.appendRow([
    new Date(),
    action,
    stats.totalMembers || 0,
    stats.skippedNoEmail || 0,
    stats.skippedNoBirthday || 0,
    stats.appended || 0,
    stats.updated || 0,
    stats.codeCreated || 0,
    stats.codeRotated || stats.rotated || 0,
    stats.clearedRedeemedFields || 0,
    stats.patchFailed || 0
  ]);
}

/********* 5. BIRTHDAY *********/
function normalizeBirthday(raw) {
  if (raw == null || raw === '') {
    return null;
  }

  if (
    Object.prototype.toString.call(raw) === '[object Date]' &&
    !isNaN(raw)
  ) {
    return pad2(raw.getUTCMonth() + 1) + '/' + pad2(raw.getUTCDate());
  }

  if (typeof raw === 'number') {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const dt = new Date(ms);
    return pad2(dt.getUTCMonth() + 1) + '/' + pad2(dt.getUTCDate());
  }

  if (typeof raw !== 'string') {
    return null;
  }

  let s = raw.trim();
  if (!s) {
    return null;
  }

  s = s
    .replace(/[／⁄年月.\-]/g, '/')
    .replace(/日/g, '')
    .replace(/\s+/g, '');

  let m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    return normalizeMonthDay_(parseInt(m[1], 10), parseInt(m[2], 10));
  }

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    return normalizeMonthDay_(parseInt(m[2], 10), parseInt(m[3], 10));
  }

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/\d{2,4}$/);
  if (m) {
    return normalizeMonthDay_(parseInt(m[1], 10), parseInt(m[2], 10));
  }

  return null;
}

function normalizeMonthDay_(month, day) {
  if (month > 12 && day <= 12) {
    const swap = month;
    month = day;
    day = swap;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > maxDay) {
    return null;
  }

  return pad2(month) + '/' + pad2(day);
}

function getCycleYearFromMMDD(mmdd) {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const year = Number(Utilities.formatDate(now, tz, 'yyyy'));
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const parts = mmdd.split('/');

  let month = parseInt(parts[0], 10);
  let day = parseInt(parts[1], 10);

  if (month === 2 && day === 29) {
    const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    if (!isLeap) {
      month = 3;
      day = 1;
    }
  }

  const birthdayThisYear = Utilities.formatString(
    '%04d-%02d-%02d',
    year,
    month,
    day
  );

  return todayStr >= birthdayThisYear ? year : year - 1;
}

function isLeapYear_(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * 某年的生日（UTC 毫秒）。2/29 在非闰年按 3/1 处理。
 */
function birthdayUtcMs_(mmdd, year) {
  const parts = mmdd.split('/');
  let month = parseInt(parts[0], 10);
  let day = parseInt(parts[1], 10);

  if (month === 2 && day === 29 && !isLeapYear_(year)) {
    month = 3;
    day = 1;
  }

  return Date.UTC(year, month - 1, day);
}

/**
 * 下一个生日（含今天）在哪一年、还有几天。
 * 按脚本时区（项目设置里的时区，应为 Australia/Sydney）计算“今天”。
 */
function getUpcomingBirthdayInfo_(mmdd, todayYmd) {
  const ymd =
    todayYmd ||
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const t = ymd.split('-').map(Number);
  const todayMs = Date.UTC(t[0], t[1] - 1, t[2]);

  let year = t[0];
  let bdayMs = birthdayUtcMs_(mmdd, year);
  if (bdayMs < todayMs) {
    year += 1;
    bdayMs = birthdayUtcMs_(mmdd, year);
  }

  return {
    targetYear: year,
    daysUntil: Math.round((bdayMs - todayMs) / 86400000)
  };
}

/**
 * 只在生日前 ROTATE_LEAD_DAYS 天内、且码还不是当年的才换码。
 */
function shouldRotate_(info, codeYear, config) {
  const lead = Math.max(Number(config.ROTATE_LEAD_DAYS) || 7, 1);
  return info.daysUntil <= lead && String(codeYear) !== String(info.targetYear);
}

/********* 5b. DAILY TRIGGER - 手动运行一次 *********/
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncMembersProduction') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('syncMembersProduction')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();

  Logger.log('已设置：每天凌晨 3 点左右运行 syncMembersProduction');
}

/********* 6. REPAIR / DEBUG *********/
function repairBirthdaysFromMailchimpProduction() {
  return withScriptLock_(function() {
    const config = getConfig();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    initMembersSheet_(ss, config.SHEET_NAME);

    const members = fetchAllMembers_(config);
    const birthdayByEmail = new Map();

    members.forEach(function(member) {
      const email = normalizedEmail_(member.email_address);
      const normBday = normalizeBirthday(
        (member.merge_fields || {})[config.BIRTHDAY_TAG] || ''
      );

      if (email && normBday) {
        birthdayByEmail.set(email, normBday);
      }
    });

    const sh = ss.getSheetByName(config.SHEET_NAME);
    const lastRow = sh.getLastRow();
    let fixed = 0;

    if (lastRow <= 1) {
      Logger.log('No data');
      return 0;
    }

    const values = sh.getRange(2, 1, lastRow - 1, 5).getValues();
    for (let i = 0; i < values.length; i++) {
      const email = normalizedEmail_(values[i][0]);
      const mcBirthday = birthdayByEmail.get(email);
      const currentBirthday = String(values[i][4] || '').trim();

      if (email && mcBirthday && currentBirthday !== mcBirthday) {
        values[i][4] = mcBirthday;
        fixed++;
      }
    }

    if (fixed > 0) {
      sh.getRange(2, 5, values.length, 1).setNumberFormat('@');
      sh.getRange(2, 1, values.length, 5).setValues(values);
    }

    Logger.log('Repaired birthdays: ' + fixed);
    return fixed;
  });
}

function debugBirthdayCellProduction(row) {
  const config = getConfig();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config.SHEET_NAME);
  const value = sh.getRange(row, 5).getValue();
  const display = sh.getRange(row, 5).getDisplayValue();
  const format = sh.getRange(row, 5).getNumberFormat();

  Logger.log(
    'Row ' +
      row +
      ' Birthday cell -> value="' +
      value +
      '" | display="' +
      display +
      '" | format="' +
      format +
      '"'
  );
}

/********* 7. HELPERS *********/
function normalizedEmail_(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}
