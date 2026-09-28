// ============================================================
// Abandoned-cart reminder trigger.
//
// Calls Xano's RunReminders endpoint every 5 minutes so the first
// reminder email goes out ~15–20 min after an unpaid hold. This replaces
// the GitHub Actions cron (.github/workflows/reminders.yml), whose free
// scheduled runs were delayed by hours or skipped entirely.
//
// Lives in the same Apps Script project as SyncBookings.gs, as its own
// file. Needs Script Property REMINDER_SECRET (Project Settings → Script
// Properties), equal to the Xano workspace variable of the same name.
//
// Setup: run installReminderTrigger() once by hand. Safe to run again —
// it removes any existing runReminders trigger before adding a new one.
// ============================================================

const RUN_REMINDERS_URL = "https://x8ki-letl-twmt.n7.xano.io/api:KARDPSrJ/RunReminders";

function runReminders() {
  const secret = PropertiesService.getScriptProperties().getProperty("REMINDER_SECRET");

  if (!secret) {
    throw new Error("Missing Script Property REMINDER_SECRET (Project Settings → Script Properties).");
  }

  const response = UrlFetchApp.fetch(RUN_REMINDERS_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ secret: secret }),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const body = response.getContentText();
  Logger.log("RunReminders " + statusCode + ": " + body);

  if (statusCode < 200 || statusCode >= 300 || body.indexOf("Unauthorized") !== -1) {
    throw new Error("RunReminders failed: " + statusCode + " " + body);
  }
}

function installReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "runReminders") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("runReminders")
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log("Installed: runReminders every 5 minutes.");
  runReminders();
}
