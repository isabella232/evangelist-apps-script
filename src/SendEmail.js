const { SHEET_NAMES } = require('./Code.js');
const {
  loadAll,
} = require('./Code.js');
const {
  compareDatabaseAndSalesforce,
  databaseTestBrigadeURLs,
} = require('./BrigadeDatabase.js');

// eslint-di
function sendEmail() {
  loadAll();
  compareDatabaseAndSalesforce();
  databaseTestBrigadeURLs();

  const contents = SpreadsheetApp
    .getActive()
    .getSheetByName(SHEET_NAMES.todo)
    .getDataRange()
    .getValues();

  const idxMissingSalesforce = contents[0].indexOf('Missing from Salesforce');
  const idxMissingBrigadeInfo = contents[0].indexOf('Missing from brigade-information');
  const idxMissingPrimaryContact = contents[0].indexOf('Missing Primary Contact');
  const idxAddBrigadeLeads = contents[0].indexOf('Add to brigadeleads@');
  const idxMissingMeetupUserId = contents[0].indexOf('Missing Meetup User ID');

  contents.shift(); // remove header row

  let body = '<p>Missing from Salesforce:</p><ul>';
  contents.forEach((row) => {
    if (row[idxMissingSalesforce] && row[idxMissingSalesforce].length) {
      body += `<li>${row[idxMissingSalesforce]}</li>`;
    }
  });
  body += '</ul>';

  body += '<p>Missing from brigade-information repo:</p><ul>';
  contents.forEach((row) => {
    if (row[idxMissingBrigadeInfo] && row[idxMissingBrigadeInfo].length) {
      body += `<li>${row[idxMissingBrigadeInfo]}</li>`;
    }
  });
  body += '</ul>';

  body += '<p>Missing Primary Contact in Salesforce:</p><ul>';
  contents.forEach((row) => {
    if (row[idxMissingPrimaryContact] && row[idxMissingPrimaryContact].length) {
      body += `<li>${row[idxMissingPrimaryContact]}</li>`;
    }
  });
  body += '</ul>';

  body += '<p>Primary Contact needs added to brigadeleads@:</p><ul>';
  contents.forEach((row) => {
    if (row[idxAddBrigadeLeads] && row[idxAddBrigadeLeads].length) {
      body += `<li>${row[idxAddBrigadeLeads]}</li>`;
    }
  });
  body += '</ul>';

  body += '<p>Missing Meetup User ID in Salesforce:</p><ul>';
  contents.forEach((row) => {
    if (row[idxMissingMeetupUserId] && row[idxMissingMeetupUserId].length) {
      body += `<li>${row[idxMissingMeetupUserId]}</li>`;
    }
  });

  body += `<p>Other Log Output:</p><pre>${Logger.getLog()}</pre>`;

  MailApp.sendEmail({
    to: 'tdooner@codeforamerica.org',
    subject: 'Weekly Network Data Inconsistencies',
    htmlBody: body,
  });
}

module.exports = {
  sendEmail,
};
