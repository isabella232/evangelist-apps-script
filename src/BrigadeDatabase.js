const {
  SHEET_NAMES,
} = require('./Code.js');

const DATABASE_DOC_ID = '1zglhAKDUNnvKindAhb6K_DJaLQ_myRYGKvE2DTYolAQ';
const DATABASE_INTERNAL_DOC_ID = '12o5V69MMiYO6sls5V4FLN1_gtgquVlr3mzrncHvQZzI';
const DATABASE_SHEET_NAME = 'Brigade Contact Info';
const DATABASE_AUTO_SHEET_NAME = 'Brigade Contact Info';

// check fields for equality
const FIELDS = [
  // salesforce column name, database column name
  ['Name', 'Brigade Name'],
  ['Website URL', 'Website'],
  ['Meetup Link', 'Meetup URL'],
  ['Twitter', 'Twitter'],
  ['Facebook Page URL', 'Facebook Page URL'],
  ['Github URL', 'GitHub URL'],
];

function importSalesforceToDirectory(isInternal) {
  const HEADERS = [
    'Brigade Name',
    'City',
    'State',
    'Primary Contact Name',
    (isInternal ? 'Primary Contact Email' : 'Public Contact Email'),
    'Website',
    'Twitter',
    'Facebook Page URL',
    'GitHub URL',
    'Meetup URL',
    // 'Slack Invite URL',
    // 'Active Project Categories',
    // 'Meeting Time(s)',
    // 'Meeting Location',
    'Salesforce Account ID',
  ];

  const database = SpreadsheetApp
    .openById(isInternal ? DATABASE_INTERNAL_DOC_ID : DATABASE_DOC_ID)
    .getSheetByName(DATABASE_AUTO_SHEET_NAME);
  database.clear();
  const descriptionRange = database.getRange(1, 1, 1, 5);
  if (isInternal) {
    descriptionRange.setValues([[
      `Last Updated: ${(new Date()).toDateString()}`,
      'This internal version includes primary contact emails that are not necessarily public.',
      '', '', '',
    ]]);
  } else {
    descriptionRange.setValues([[
      `Last Updated: ${(new Date()).toDateString()}`,
      'Available At:', 'http://c4a.me/brigades',
      '', // spacer
      'See "Instructions" Tab For Editing Instructions',
    ]]);
  }
  database.getRange(2, 1, 1, HEADERS.length)
    .setValues([HEADERS])
    .setFontWeight('bold');
  database.setFrozenRows(2);
  database.setFrozenColumns(1);

  const salesforce = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.salesforce);
  const salesforceHeaders = salesforce.getRange(1, 1, 1, salesforce.getLastColumn()).getValues()[0];
  const salesforceContents = salesforce.getRange(2, 1, salesforce.getLastRow(), salesforce.getLastColumn())
    .getValues();

  const brigadesToAdd = [];

  for (const i in salesforceContents) {
    const brigade = salesforceContents[i];
    const isActive = brigade[salesforceHeaders.indexOf('Active?')];

    if (!isActive) {
      continue;
    }

    var primaryContactEmail;
    // if the brigade has given us an explicit public email address, use that (with no "name")
    //   instead of the primary contact in salesforce.
    if (brigade[salesforceHeaders.indexOf('Public Contact Email')] && !isInternal) {
      var primaryContactEmail = brigade[salesforceHeaders.indexOf('Public Contact Email')];
    } else {
      var primaryContactEmail = brigade[salesforceHeaders.indexOf('Primary Contact Email')];
    }

    const brigadeObject = {
      'Brigade Name': brigade[salesforceHeaders.indexOf('Name')],
      City: brigade[salesforceHeaders.indexOf('Location')].split(', ')[0],
      State: brigade[salesforceHeaders.indexOf('Location')].split(', ')[1],
      'Primary Contact Name': brigade[salesforceHeaders.indexOf('Primary Contact')],
      'Primary Contact Email': primaryContactEmail,
      'Public Contact Email': primaryContactEmail,
      Website: brigade[salesforceHeaders.indexOf('Website URL')],
      Twitter: brigade[salesforceHeaders.indexOf('Twitter')],
      'Facebook Page URL': brigade[salesforceHeaders.indexOf('Facebook Page URL')],
      'GitHub URL': brigade[salesforceHeaders.indexOf('Github URL')],
      'Meetup URL': brigade[salesforceHeaders.indexOf('Meetup Link')],
      'Salesforce Account ID': brigade[salesforceHeaders.indexOf('Salesforce ID')],
    };

    const brigadeRow = [];
    for (const j in HEADERS) {
      brigadeRow.push(brigadeObject[HEADERS[j]] || '');
    }

    brigadesToAdd.push(brigadeRow);
  }

  database.getRange(3, 1, brigadesToAdd.length, HEADERS.length).setValues(brigadesToAdd);
}

function importExternalSalesforceToDirectory() {
  importSalesforceToDirectory(false);
}

function importInternalSalesforceToDirectory() {
  importSalesforceToDirectory(true);
}

function compareDatabaseAndSalesforce() {
  const database = SpreadsheetApp.openById(DATABASE_DOC_ID).getSheetByName(DATABASE_SHEET_NAME);
  const salesforce = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.salesforce);

  const salesforceHeaders = salesforce.getRange(1, 1, 1, salesforce.getLastColumn()).getValues()[0];
  const salesforceContents = salesforce.getRange(2, 1, salesforce.getLastRow(), salesforce.getLastColumn())
    .getValues();

  const databaseHeaders = database.getRange(2, 1, 1, database.getLastColumn()).getValues()[0];
  const databaseContents = database.getRange(3, 1, database.getLastRow(), database.getLastColumn())
    .getValues();

  for (var i in databaseContents) {
    var brigade = databaseContents[i];

    // attempt to find the brigade in the salesforce list
    //   by matching the Salesforce ID
    let brigadeInSalesforce = null;
    for (var j in salesforceContents) {
      var b = salesforceContents[j];
      var salesforceId = b[salesforceHeaders.indexOf('Salesforce ID')];
      var databaseId = brigade[databaseHeaders.indexOf('Salesforce Account ID')];
      var salesforceName = b[salesforceHeaders.indexOf('Name')];
      var databaseName = brigade[databaseHeaders.indexOf('Brigade Name')];

      if (salesforceId === databaseId) {
        brigadeInSalesforce = b;
      } else if (salesforceName === databaseName) {
        brigadeInSalesforce = b;
        Logger.log(`Found by fallback name match: ${salesforceName}`);
      }
    }

    if (!brigadeInSalesforce) {
      Logger.log(`Could not find brigade in salesforce: ${brigade[0]}`);
      continue;
    }

    // field name, salesforce value, database value
    const different = [];
    for (var j in FIELDS) {
      if (brigadeInSalesforce[salesforceHeaders.indexOf(FIELDS[j][0])] !==
        brigade[databaseHeaders.indexOf(FIELDS[j][1])]) {
        different.push([FIELDS[j][0], brigadeInSalesforce[salesforceHeaders.indexOf(FIELDS[j][0])], brigade[databaseHeaders.indexOf(FIELDS[j][1])]]);
      }
    }

    if (different.length) {
      Logger.log(`${brigade[databaseHeaders.indexOf('Brigade Name')]}:`);

      for (var j in different) {
        const difference = different[j];
        if (difference[1] && !difference[2]) {
          Logger.log(`  ${difference[0]} missing in brigade database: ${difference[1]}`);
        } else if (difference[2] && !difference[1]) {
          Logger.log(`  ${difference[0]} missing in salesforce: ${difference[2]}`);
        } else {
          Logger.log(`  ${difference[0]} different: ${difference[1]}/${difference[2]}`);
        }
      }
    }
  }

  // find records that are in salesforce but not the database
  for (var i in salesforceContents) {
    var brigade = salesforceContents[i];
    const isActive = brigade[salesforceHeaders.indexOf('Active?')];

    if (!isActive) {
      continue;
    }

    let brigadeInDatabase = null;
    for (var j in databaseContents) {
      var b = databaseContents[j];
      var salesforceId = brigade[salesforceHeaders.indexOf('Salesforce ID')];
      var databaseId = b[databaseHeaders.indexOf('Salesforce Account ID')];
      var salesforceName = brigade[salesforceHeaders.indexOf('Name')];
      var databaseName = b[databaseHeaders.indexOf('Brigade Name')];

      if (salesforceId === databaseId) {
        brigadeInDatabase = b;
      } else if (salesforceName === databaseName) {
        brigadeInDatabase = b;
      }
    }

    if (!brigadeInDatabase) {
      Logger.log(`Missing Brigade in Database: ${brigade[salesforceHeaders.indexOf('Name')]}`);
    }
  }
}

/*
 * Test all URLs in the directory (database).
 */
function databaseTestBrigadeURLs() {
  const database = SpreadsheetApp.openById(DATABASE_DOC_ID).getSheetByName(DATABASE_SHEET_NAME);

  const databaseHeaders = database.getRange(2, 1, 1, database.getLastColumn()).getValues()[0];
  const databaseContents = database.getRange(3, 1, database.getLastRow(), database.getLastColumn())
    .getValues();

  for (const i in databaseContents) {
    const row = databaseContents[i];
    const brigadeName = row[databaseHeaders.indexOf('Brigade Name')];
    const url = row[databaseHeaders.indexOf('Website')];

    if (!url || !url.length) {
      continue;
    }

    try {
      const resp = UrlFetchApp.fetch(url);
      if (resp.getResponseCode() >= 300) {
        Logger.log(`Brigade Website Error: ${brigadeName}'s website ${url} returned status ${resp.getResponseCode()}`);
      }
    } catch (ex) {
      Logger.log(`Brigade Website Error: ${brigadeName}'s website ${url} returned error ${ex.message}`);
    }
  }
}

module.exports = {
  importExternalSalesforceToDirectory,
  importInternalSalesforceToDirectory,
};