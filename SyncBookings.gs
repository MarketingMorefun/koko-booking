const XANO_EXPORT_KEY = "kk9x2mQ7vL4nR8pT1wZ5jY3fH6bC0dS";
const XANO_EXPORT_URL = "https://x8ki-letl-twmt.n7.xano.io/api:KARDPSrJ/BookingSheetExport?key=" + XANO_EXPORT_KEY;
const MASTER_SHEET_NAME = "Booking Master";

const HEADERS = [
  "booking_id",
  "created_at",
  "status",
  "location_name",
  "date",
  "start_time_label",
  "end_time_label",
  "party_room_name",
  "customer_name",
  "customer_phone",
  "customer_email",
  "guests",
  "package_name",
  "addons_summary",
  "package_total_aud",
  "addons_total_aud",
  "grand_total_aud",
  "deposit_paid_aud",
  "balance_due_aud",
  "paid_at",
  "confirmation_email_sent_at",
  "birthday_child_gender",
  "average_age",
  "booking_notes",
  "location_id",
  "party_room_id",
  "package_id",
  "calendar_event_id",
  "calendar_sync_signature"
];

// Matches Xano "Locations" table (id -> name)
const LOCATION_MAP = {
  1: "Town Hall - 614",
  2: "Town Hall - 505",
  3: "Burwood",
  4: "Hurstville",
  5: "Hornsby Level 4",
  6: "Haymarket",
  7: "Chatswood",
  8: "Parramatta",
  9: "North Sydney",
  10: "Bankstown",
  11: "KOKO & Cityheroes Hornsby Level 2"
};

// Matches Xano "party_rooms" table (id -> name)
const ROOM_MAP = {
  3: "Town Hall Grande",
  4: "Town Hall Max",
  5: "Burwood",
  6: "Hurstville",
  7: "Hornsby Level 4",
  8: "KOKO & Cityheroes Hornsby Level 2"
};

// Matches Xano "packages" table (id -> name)
const PACKAGE_MAP = {
  1: "KOKO Party Max",
  2: "KOKO Team Fun 60",
  3: "KOKO Team Max 100",
  5: "KOKO Party Fun",
  6: "Haymarket Package A",
  7: "Haymarket Package B",
  8: "Haymarket Package C",
  9: "Haymarket Package D",
  10: "KOKO Party Joy",
  11: "Previous Hurstville"
};

const STORE_CALENDAR_ID_MAP = {
  "Town Hall - 614": "614partykoko@gmail.com",
  "Haymarket": "haymarketparty@gmail.com",
  "Hornsby Level 4": "hbpartykoko@gmail.com",
  "Hurstville": "hvpartykoko@gmail.com",
  "Burwood": "kokoburwoodpackage@gmail.com",
  "KOKO & Cityheroes Hornsby Level 2":"hbpartykoko@gmail.com"
};

const ADDON_NAME_MAP = {
  1: "Billiards",
  4: "$30 KOKO Card",
  5: "$15 KOKO Card",
  6: "$60 KOKO Card",
  7: "60 mins Party Room",
  8: "Gift Bag",
  9: "Decoration - Fun",
  10: "Decoration - Grande",
  12: "Birthday Box"
};

function syncBookingsFromXano() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MASTER_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(MASTER_SHEET_NAME);
  }

  const existingBookingMap = getExistingBookingMap(sheet);

  const response = UrlFetchApp.fetch(XANO_EXPORT_URL, {
    method: "get",
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const body = response.getContentText();

  Logger.log("Xano status code: " + statusCode);
  Logger.log("Xano raw body: " + body);

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error("Xano API failed: " + statusCode + " " + body);
  }

  let data;

  try {
    data = JSON.parse(body);
  } catch (err) {
    throw new Error("Xano returned invalid JSON: " + body);
  }

  if (!data) {
    throw new Error("Xano returned empty/null data. Raw body: " + body);
  }

  const bookings = Array.isArray(data)
    ? data
    : Array.isArray(data.bookings)
      ? data.bookings
      : Array.isArray(data.data)
        ? data.data
        : [];

  if (!bookings.length) {
    Logger.log("No bookings found. Raw Xano response: " + body);
  }

  const rows = bookings.map(function (b) {
    const bookingId = String(b.id || "");
    const existingBooking = existingBookingMap[bookingId] || {};

    const packageTotalAud = centsToAud(b.package_total_cents);
    const addonsTotalAud = centsToAud(b.addons_total_cents);
    const grandTotalAud = centsToAud(b.grand_total_cents);

    const depositPaidAud = getDepositPaidAud(b);
    const balanceDueAud = getBalanceDueAud(b, grandTotalAud, depositPaidAud);

    return [
      bookingId,
      formatDateTimeFromTimestamp(b.created_at),
      normaliseStatus(b.status),
      LOCATION_MAP[b.location_id] || b.location_id || "",
      b.date || "",
      formatTimeFromTimestamp(b.start_ts),
      formatTimeFromTimestamp(b.end_ts),
      ROOM_MAP[b.party_room_id] || b.party_room_id || "",
      b.customer_name || "",
      formatPhone(b.customer_phone),
      b.customer_email || "",
      b.guests || "",
      PACKAGE_MAP[b.package_id] || b.package_id || "",
      formatAddons(b.addons_json),
      packageTotalAud,
      addonsTotalAud,
      grandTotalAud,
      depositPaidAud,
      balanceDueAud,
      formatDateTimeFromTimestamp(b.paid_at),
      formatDateTimeFromTimestamp(b.confirmation_email_sent_at),
      b.birthday_child_gender || "",
      b.average_age || "",
      b.booking_notes || "",
      b.location_id || "",
      b.party_room_id || "",
      b.package_id || "",
      existingBooking.calendarEventId || "",
      existingBooking.calendarSyncSignature || ""
    ];
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }

  syncCalendarEventsFromRows(sheet, rows, existingBookingMap);
}

function getExistingBookingMap(sheet) {
  const map = {};
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return map;
  }

  const headers = values[0];
  const bookingIdCol = headers.indexOf("booking_id");
  const locationNameCol = headers.indexOf("location_name");
  const calendarEventIdCol = headers.indexOf("calendar_event_id");
  const calendarSyncSignatureCol = headers.indexOf("calendar_sync_signature");
  const statusCol = headers.indexOf("status");

  if (bookingIdCol === -1) {
    return map;
  }

  for (let i = 1; i < values.length; i++) {
    const bookingId = values[i][bookingIdCol];

    if (!bookingId) {
      continue;
    }

    map[String(bookingId)] = {
      locationName: locationNameCol === -1 ? "" : values[i][locationNameCol],
      calendarEventId: calendarEventIdCol === -1 ? "" : values[i][calendarEventIdCol],
      calendarSyncSignature: calendarSyncSignatureCol === -1 ? "" : values[i][calendarSyncSignatureCol],
      status: statusCol === -1 ? "" : values[i][statusCol]
    };
  }

  return map;
}

function syncCalendarEventsFromBookingMaster(previousBookingMap) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(MASTER_SHEET_NAME);

  if (!sheet) {
    throw new Error("Sheet not found: " + MASTER_SHEET_NAME);
  }

  const range = sheet.getDataRange();
  const values = range.getValues();
  const displayValues = range.getDisplayValues();

  if (displayValues.length < 2) {
    Logger.log("No bookings in sheet. Cleaning up old calendar events if needed.");
    deleteRemovedBookingEvents(previousBookingMap, {});
    return;
  }

  const headers = displayValues[0];
  const index = buildHeaderIndex(headers);

  if (index.calendarEventIdCol === -1) {
    throw new Error("Missing column: calendar_event_id. Please add it to HEADERS.");
  }

  if (index.calendarSyncSignatureCol === -1) {
    throw new Error("Missing column: calendar_sync_signature. Please add it to HEADERS.");
  }

  const currentBookingMap = {};

  for (let i = 1; i < displayValues.length; i++) {
    const row = displayValues[i];
    const rawRow = values[i];
    const bookingId = String(row[index.bookingIdCol] || "");

    if (!bookingId) {
      continue;
    }

    currentBookingMap[bookingId] = {
      locationName: row[index.locationNameCol] || "",
      calendarEventId: row[index.calendarEventIdCol] || "",
      calendarSyncSignature: row[index.calendarSyncSignatureCol] || "",
      status: row[index.statusCol] || ""
    };

    let syncResult;
    try {
      syncResult = upsertCalendarEventForRow({
        sheet: sheet,
        rowIndex: i + 1,
        row: row,
        rawRow: rawRow,
        index: index,
        previousBooking: previousBookingMap[bookingId] || null
      });
    } catch (err) {
      Logger.log("Calendar sync FAILED for booking " + bookingId + " (" + currentBookingMap[bookingId].locationName + "): " + err + " — skipping this booking, continuing with the rest.");
      continue;
    }

    if (syncResult.calendarEventId !== undefined) {
      sheet.getRange(i + 1, index.calendarEventIdCol + 1).setValue(syncResult.calendarEventId);
      currentBookingMap[bookingId].calendarEventId = syncResult.calendarEventId;
    }

    if (syncResult.calendarSyncSignature !== undefined) {
      sheet.getRange(i + 1, index.calendarSyncSignatureCol + 1).setValue(syncResult.calendarSyncSignature);
      currentBookingMap[bookingId].calendarSyncSignature = syncResult.calendarSyncSignature;
    }
  }

  deleteRemovedBookingEvents(previousBookingMap, currentBookingMap);
}

function syncCalendarEventsFromRows(sheet, rows, previousBookingMap) {
  if (!rows.length) {
    Logger.log("No bookings in Xano response. Cleaning up old calendar events if needed.");
    deleteRemovedBookingEvents(previousBookingMap, {});
    return;
  }
  const index = buildHeaderIndex(HEADERS);

  if (index.calendarEventIdCol === -1) {
    throw new Error("Missing column: calendar_event_id. Please add it to HEADERS.");
  }

  if (index.calendarSyncSignatureCol === -1) {
    throw new Error("Missing column: calendar_sync_signature. Please add it to HEADERS.");
  }

  const currentBookingMap = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const bookingId = String(row[index.bookingIdCol] || "");

    if (!bookingId) {
      continue;
    }

    currentBookingMap[bookingId] = {
      locationName: row[index.locationNameCol] || "",
      calendarEventId: row[index.calendarEventIdCol] || "",
      calendarSyncSignature: row[index.calendarSyncSignatureCol] || "",
      status: row[index.statusCol] || ""
    };

    let syncResult;
    try {
      syncResult = upsertCalendarEventForRow({
        sheet: sheet,
        rowIndex: i + 2,
        row: row,
        rawRow: row,
        index: index,
        previousBooking: previousBookingMap[bookingId] || null
      });
    } catch (err) {
      Logger.log("Calendar sync FAILED for booking " + bookingId + " (" + currentBookingMap[bookingId].locationName + "): " + err + " — skipping this booking, continuing with the rest.");
      continue;
    }

    if (syncResult.calendarEventId !== undefined) {
      sheet.getRange(i + 2, index.calendarEventIdCol + 1).setValue(syncResult.calendarEventId);
      currentBookingMap[bookingId].calendarEventId = syncResult.calendarEventId;
    }

    if (syncResult.calendarSyncSignature !== undefined) {
      sheet.getRange(i + 2, index.calendarSyncSignatureCol + 1).setValue(syncResult.calendarSyncSignature);
      currentBookingMap[bookingId].calendarSyncSignature = syncResult.calendarSyncSignature;
    }
  }

  deleteRemovedBookingEvents(previousBookingMap, currentBookingMap);
}

function buildHeaderIndex(headers) {
  return {
    bookingIdCol: headers.indexOf("booking_id"),
    createdAtCol: headers.indexOf("created_at"),
    statusCol: headers.indexOf("status"),
    locationNameCol: headers.indexOf("location_name"),
    dateCol: headers.indexOf("date"),
    startTimeCol: headers.indexOf("start_time_label"),
    endTimeCol: headers.indexOf("end_time_label"),
    partyRoomCol: headers.indexOf("party_room_name"),
    customerNameCol: headers.indexOf("customer_name"),
    customerPhoneCol: headers.indexOf("customer_phone"),
    customerEmailCol: headers.indexOf("customer_email"),
    guestsCol: headers.indexOf("guests"),
    packageNameCol: headers.indexOf("package_name"),
    addonsCol: headers.indexOf("addons_summary"),
    packageTotalCol: headers.indexOf("package_total_aud"),
    addonsTotalCol: headers.indexOf("addons_total_aud"),
    grandTotalCol: headers.indexOf("grand_total_aud"),
    depositPaidCol: headers.indexOf("deposit_paid_aud"),
    balanceDueCol: headers.indexOf("balance_due_aud"),
    paidAtCol: headers.indexOf("paid_at"),
    confirmationEmailSentAtCol: headers.indexOf("confirmation_email_sent_at"),
    birthdayChildGenderCol: headers.indexOf("birthday_child_gender"),
    averageAgeCol: headers.indexOf("average_age"),
    notesCol: headers.indexOf("booking_notes"),
    locationIdCol: headers.indexOf("location_id"),
    partyRoomIdCol: headers.indexOf("party_room_id"),
    packageIdCol: headers.indexOf("package_id"),
    calendarEventIdCol: headers.indexOf("calendar_event_id"),
    calendarSyncSignatureCol: headers.indexOf("calendar_sync_signature")
  };
}

function upsertCalendarEventForRow(context) {
  const row = context.row;
  const index = context.index;
  const previousBooking = context.previousBooking || {};

  const bookingId = row[index.bookingIdCol];
  const status = row[index.statusCol];
  const locationName = row[index.locationNameCol];
  const calendarId = STORE_CALENDAR_ID_MAP[locationName];
  const existingEventId = row[index.calendarEventIdCol] || previousBooking.calendarEventId || "";
  const existingSignature = row[index.calendarSyncSignatureCol] || previousBooking.calendarSyncSignature || "";
  const previousLocationName = previousBooking.locationName || "";

  if (status !== "deposit paid") {
    if (existingEventId) {
      deleteCalendarEventByLocation(previousLocationName || locationName, existingEventId);
      Logger.log("Deleted event because booking is no longer deposit paid: " + bookingId);
    }

    return {
      calendarEventId: "",
      calendarSyncSignature: ""
    };
  }

  if (!calendarId) {
    Logger.log("No calendar ID found for location: " + locationName);
    return {
      calendarEventId: existingEventId || "",
      calendarSyncSignature: existingSignature || ""
    };
  }

  const calendar = CalendarApp.getCalendarById(calendarId);

  if (!calendar) {
    Logger.log("Cannot access calendar for location: " + locationName + " / " + calendarId);
    return {
      calendarEventId: existingEventId || "",
      calendarSyncSignature: existingSignature || ""
    };
  }

  const bookingDate = row[index.dateCol];
  const startTime = row[index.startTimeCol];
  const endTime = row[index.endTimeCol];

  if (!bookingDate || !startTime || !endTime) {
    Logger.log("Missing date/start/end time for booking: " + bookingId);
    return {
      calendarEventId: existingEventId || "",
      calendarSyncSignature: existingSignature || ""
    };
  }

  const startDateTime = buildSydneyDateTime(bookingDate, startTime);
  const endDateTime = buildSydneyDateTime(bookingDate, endTime);

  const title = buildCalendarTitle({
    bookingId: bookingId,
    customerName: row[index.customerNameCol],
    partyRoom: row[index.partyRoomCol],
    guestCount: row[index.guestsCol],
    averageAge: row[index.averageAgeCol],
    birthdayChildGender: row[index.birthdayChildGenderCol],
    status: status
  });

  const description = buildCalendarDescription({
    bookingId: bookingId,
    status: status,
    locationName: locationName,
    bookingDate: bookingDate,
    startTime: startTime,
    endTime: endTime,
    partyRoom: row[index.partyRoomCol],
    customerName: row[index.customerNameCol],
    customerPhone: row[index.customerPhoneCol],
    customerEmail: row[index.customerEmailCol],
    guestCount: row[index.guestsCol],
    packageName: row[index.packageNameCol],
    addons: row[index.addonsCol],
    birthdayChildGender: row[index.birthdayChildGenderCol],
    averageAge: row[index.averageAgeCol],
    notes: row[index.notesCol],
    packageTotal: row[index.packageTotalCol],
    addonsTotal: row[index.addonsTotalCol],
    grandTotal: row[index.grandTotalCol],
    depositPaid: row[index.depositPaidCol],
    balanceDue: row[index.balanceDueCol],
    createdAt: row[index.createdAtCol],
    paidAt: row[index.paidAtCol],
    confirmationEmailSentAt: row[index.confirmationEmailSentAtCol],
    locationId: row[index.locationIdCol],
    partyRoomId: row[index.partyRoomIdCol],
    packageId: row[index.packageIdCol]
  });
  const nextSignature = buildCalendarSyncSignature({
    bookingId: bookingId,
    status: status,
    locationName: locationName,
    bookingDate: bookingDate,
    startTime: startTime,
    endTime: endTime,
    partyRoom: row[index.partyRoomCol],
    customerName: row[index.customerNameCol],
    customerPhone: row[index.customerPhoneCol],
    customerEmail: row[index.customerEmailCol],
    guestCount: row[index.guestsCol],
    packageName: row[index.packageNameCol],
    addons: row[index.addonsCol],
    birthdayChildGender: row[index.birthdayChildGenderCol],
    averageAge: row[index.averageAgeCol],
    notes: row[index.notesCol],
    packageTotal: row[index.packageTotalCol],
    addonsTotal: row[index.addonsTotalCol],
    grandTotal: row[index.grandTotalCol],
    depositPaid: row[index.depositPaidCol],
    balanceDue: row[index.balanceDueCol],
    createdAt: row[index.createdAtCol],
    paidAt: row[index.paidAtCol],
    confirmationEmailSentAt: row[index.confirmationEmailSentAtCol],
    locationId: row[index.locationIdCol],
    partyRoomId: row[index.partyRoomIdCol],
    packageId: row[index.packageIdCol]
  });

  const eventLocation = "KOKO " + locationName;
  let event = null;

  if (existingEventId) {
    if (previousLocationName && previousLocationName !== locationName) {
      deleteCalendarEventByLocation(previousLocationName, existingEventId);
      event = null;
    } else {
      event = getCalendarEventSafe(calendar, existingEventId);
    }
  }

  if (event && existingSignature === nextSignature) {
    Logger.log("Skipping unchanged booking: " + bookingId);
    return {
      calendarEventId: event.getId(),
      calendarSyncSignature: nextSignature
    };
  }

  Logger.log("Writing to calendar " + calendarId + " for booking " + bookingId + " (" + locationName + ")");

  if (event) {
    event.setTitle(title);
    event.setDescription(description);
    event.setLocation(eventLocation);
    event.setTime(startDateTime, endDateTime);
    ensurePopupReminder(event, 30);
    Logger.log("Updated event for booking: " + bookingId);
    return {
      calendarEventId: event.getId(),
      calendarSyncSignature: nextSignature
    };
  }

  event = calendar.createEvent(title, startDateTime, endDateTime, {
    location: eventLocation,
    description: description
  });
  ensurePopupReminder(event, 30);

  Logger.log("Created event for booking: " + bookingId);
  return {
    calendarEventId: event.getId(),
    calendarSyncSignature: nextSignature
  };
}

function deleteRemovedBookingEvents(previousBookingMap, currentBookingMap) {
  const previousIds = Object.keys(previousBookingMap || {});

  for (let i = 0; i < previousIds.length; i++) {
    const bookingId = previousIds[i];

    if (currentBookingMap[bookingId]) {
      continue;
    }

    const previousBooking = previousBookingMap[bookingId];

    if (!previousBooking || !previousBooking.calendarEventId) {
      continue;
    }

    try {
      deleteCalendarEventByLocation(previousBooking.locationName, previousBooking.calendarEventId);
      Logger.log("Deleted stale calendar event for removed booking: " + bookingId);
    } catch (err) {
      Logger.log("Failed to delete stale event for booking " + bookingId + " (" + previousBooking.locationName + "): " + err);
    }
  }
}

function deleteCalendarEventByLocation(locationName, eventId) {
  const calendarId = STORE_CALENDAR_ID_MAP[locationName];

  if (!calendarId || !eventId) {
    return;
  }

  const calendar = CalendarApp.getCalendarById(calendarId);

  if (!calendar) {
    Logger.log("Cannot access calendar to delete event: " + locationName + " / " + calendarId);
    return;
  }

  const event = getCalendarEventSafe(calendar, eventId);

  if (!event) {
    Logger.log("Event not found while deleting: " + eventId);
    return;
  }

  event.deleteEvent();
}

function getCalendarEventSafe(calendar, eventId) {
  try {
    return calendar.getEventById(eventId);
  } catch (err) {
    Logger.log("Failed to fetch event by ID " + eventId + ": " + err);
    return null;
  }
}

function ensurePopupReminder(event, minutesBefore) {
  const reminders = event.getPopupReminders();

  if (reminders.indexOf(minutesBefore) === -1) {
    event.addPopupReminder(minutesBefore);
  }
}

function buildCalendarSyncSignature(info) {
  return JSON.stringify([
    safeText(info.bookingId),
    safeText(info.status),
    safeText(info.locationName),
    safeText(info.bookingDate),
    safeText(info.startTime),
    safeText(info.endTime),
    safeText(info.partyRoom),
    safeText(info.customerName),
    safeText(info.customerPhone),
    safeText(info.customerEmail),
    safeText(info.guestCount),
    safeText(info.packageName),
    safeText(info.addons),
    safeText(info.birthdayChildGender),
    safeText(info.averageAge),
    safeText(info.notes),
    safeText(info.packageTotal),
    safeText(info.addonsTotal),
    safeText(info.grandTotal),
    safeText(info.depositPaid),
    safeText(info.balanceDue),
    safeText(info.createdAt),
    safeText(info.paidAt),
    safeText(info.confirmationEmailSentAt),
    safeText(info.locationId),
    safeText(info.partyRoomId),
    safeText(info.packageId)
  ]);
}

function buildCalendarTitle(info) {
  const paidPrefix = info.status === "deposit paid" ? "💰[PAID] " : "";

  const guestPart = info.guestCount
    ? info.guestCount + " guests"
    : "";

  const agePart = info.averageAge
    ? info.averageAge
    : "";

  const genderPart = info.birthdayChildGender
    ? info.birthdayChildGender
    : "";

  const details = [guestPart, agePart, genderPart]
    .filter(function (item) {
      return item !== "";
    })
    .join(" ");

  return paidPrefix +
    "KOKO Booking #" +
    safeText(info.bookingId) +
    " - " +
    safeText(info.customerName) +
    " - " +
    safeText(info.partyRoom) +
    (details ? " - " + details : "");
}

function buildCalendarDescription(info) {
  return [
    "Booking No: " + safeText(info.bookingId),
    "Status: " + safeText(info.status),
    "",
    "Location: " + safeText(info.locationName),
    "Party Room: " + safeText(info.partyRoom),
    "Date: " + safeText(info.bookingDate),
    "Time: " + safeText(info.startTime) + " - " + safeText(info.endTime),
    "",
    "Customer Name: " + safeText(info.customerName),
    "Phone: " + safeText(info.customerPhone),
    "Email: " + safeText(info.customerEmail),
    "Guests: " + safeText(info.guestCount),
    "Package: " + safeText(info.packageName),
    "Add-ons: " + safeText(info.addons),
    "",
    "Birthday Child Gender: " + safeText(info.birthdayChildGender),
    "Average Age: " + safeText(info.averageAge),
    "Booking Notes: " + safeText(info.notes),
    "",
    "Package Total: " + formatMoneyForCalendar(info.packageTotal),
    "Add-ons Total: " + formatMoneyForCalendar(info.addonsTotal),
    "Grand Total: " + formatMoneyForCalendar(info.grandTotal),
    "Deposit Paid: " + formatMoneyForCalendar(info.depositPaid),
    "Balance Due: " + formatMoneyForCalendar(info.balanceDue),
    "",
    "Created At: " + safeText(info.createdAt),
    "Paid At: " + safeText(info.paidAt),
    "Confirmation Email Sent At: " + safeText(info.confirmationEmailSentAt),
    "",
    "Location ID: " + safeText(info.locationId),
    "Party Room ID: " + safeText(info.partyRoomId),
    "Package ID: " + safeText(info.packageId)
  ].join("\n");
}

function buildSydneyDateTime(dateValue, timeValue) {
  const dateString = String(dateValue).trim();
  const timeString = String(timeValue).trim();

  const dateParts = dateString.split("-");
  const timeParts = timeString.split(":");

  if (dateParts.length !== 3 || timeParts.length < 2) {
    throw new Error("Invalid date/time: " + dateString + " " + timeString);
  }

  const year = Number(dateParts[0]);
  const month = Number(dateParts[1]) - 1;
  const day = Number(dateParts[2]);
  const hour = Number(timeParts[0]);
  const minute = Number(timeParts[1]);

  return new Date(year, month, day, hour, minute, 0);
}

function formatMoneyForCalendar(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const str = String(value).replace("$", "").trim();
  const n = Number(str);

  if (Number.isNaN(n)) {
    return String(value);
  }

  return "$" + n.toFixed(2);
}

function safeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function centsToAud(cents) {
  if (cents === null || cents === undefined || cents === "" || cents === "/") {
    return "";
  }

  const n = Number(cents);

  if (Number.isNaN(n)) {
    return "";
  }

  return n / 100;
}

function getDepositPaidAud(booking) {
  if (booking.deposit_paid_cents !== null && booking.deposit_paid_cents !== undefined && booking.deposit_paid_cents !== "") {
    return centsToAud(booking.deposit_paid_cents);
  }

  if (booking.deposit_paid_aud !== null && booking.deposit_paid_aud !== undefined && booking.deposit_paid_aud !== "") {
    return Number(booking.deposit_paid_aud);
  }

  if (booking.status === "deposit_paid" || booking.status === "paid") {
    return 50;
  }

  return "";
}

function getBalanceDueAud(booking, grandTotalAud, depositPaidAud) {
  if (booking.balance_due_cents !== null && booking.balance_due_cents !== undefined && booking.balance_due_cents !== "") {
    return centsToAud(booking.balance_due_cents);
  }

  if (booking.balance_due_aud !== null && booking.balance_due_aud !== undefined && booking.balance_due_aud !== "") {
    return Number(booking.balance_due_aud);
  }

  if (grandTotalAud === "" || depositPaidAud === "") {
    return "";
  }

  return Math.max(grandTotalAud - depositPaidAud, 0);
}

function normaliseStatus(status) {
  if (status === "pending_payment") {
    return "waiting payment";
  }

  if (status === "deposit_paid" || status === "paid") {
    return "deposit paid";
  }

  return status || "";
}

function formatDateTimeFromTimestamp(ts) {
  if (!ts || ts === 0) return "";

  const date = new Date(Number(ts));
  return Utilities.formatDate(date, "Australia/Sydney", "yyyy-MM-dd HH:mm:ss");
}

function formatTimeFromTimestamp(ts) {
  if (!ts || ts === 0) return "";

  const date = new Date(Number(ts));
  return Utilities.formatDate(date, "Australia/Sydney", "HH:mm");
}

function formatPhone(phone) {
  if (phone === null || phone === undefined || phone === "") return "";

  const str = String(phone);

  if (str.length === 9 && !str.startsWith("0")) {
    return "0" + str;
  }

  if (str.length === 8 && !str.startsWith("0")) {
    return "0" + str;
  }

  return str;
}

function formatAddons(addonsJson) {
  if (!addonsJson) return "";

  let addons = addonsJson;

  if (typeof addonsJson === "string") {
    try {
      addons = JSON.parse(addonsJson);
    } catch (err) {
      return addonsJson;
    }
  }

  if (!Array.isArray(addons) || !addons.length) {
    return "";
  }

  return addons
    .map(function (item) {
      const addonId = Number(item.addon_id);

      const name =
        item.addon_name ||
        item.name ||
        ADDON_NAME_MAP[addonId] ||
        "Addon ID " + item.addon_id;

      const qty = item.qty || 1;

      const option = item.option_label
        ? " - " + item.option_label
        : "";

      const total = item.line_total_cents
        ? " (" + formatMoneyForCalendar(centsToAud(item.line_total_cents)) + ")"
        : "";

      return name + option + " x " + qty + total;
    })
    .join(", ");
}

function testCalendarAccess() {
  const calendars = CalendarApp.getAllCalendars();

  calendars.forEach(function (calendar) {
    Logger.log("Calendar Name: " + calendar.getName());
    Logger.log("Calendar ID: " + calendar.getId());
    Logger.log("--------------------");
  });
}
