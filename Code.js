var SHEET_NAMES = {
  todo: 'TODO List',
  brigadeInfo: 'AUTO:brigade-information',
  meetupEvents: 'AUTO:meetup-events',
  meetupMembers: 'AUTO:meetup-members',
  salesforce: 'AUTO:salesforce',
  salesforceDonations: 'AUTO:salesforce-donations',
  brigadeleads: 'AUTO:brigadeleads'
}

function loadAll() {
  createUI();
  loadBrigadeInformation();
  loadMeetupData();
  var brigades = loadSalesforceData();
  loadGroupMembers(brigades);
  slackSignupForm();
}

function loadBrigadeInformation() {
  var infoResponse = UrlFetchApp.fetch("https://raw.githubusercontent.com/codeforamerica/brigade-information/master/organizations.json");
  var info = JSON.parse(infoResponse);
  var brigades = [];
  
  for (var i in info) {
    var brigade = info[i];
    
    // filter to only the official CfA Brigades
    if (brigade['tags'].indexOf('Code for America') === -1 ||
        brigade['tags'].indexOf('Brigade') === -1) {
      continue;
    }
    
    brigades.push([brigade['name']]);
  }
    
  var sheet = SpreadsheetApp.getActive()
    .getSheetByName(SHEET_NAMES.brigadeInfo);
  sheet.clear()
  var range = sheet.getRange(1, 1, brigades.length, brigades[0].length);
  range.setValues(brigades);
};


/*
* Import events from Meetup
*/
var SEVENTY_YEARS_IN_DAYS = 25569; // DATEVALUE("1970/1/1")
function loadMeetupData() {
  var pageUrl = "http://api.codeforamerica.org/api/events/upcoming_events?per_page=200";
  var eventsToAppend = [];
  
  while (pageUrl) {
    var eventResponse = JSON.parse(UrlFetchApp.fetch(pageUrl));
    var events = eventResponse['objects'];
    
    for (var i in events) {
      var event = events[i];
      var start = event['start_time'];
      var startParsed = Date.parse(
        start.substring(0, 10) + "T" + start.substring(11, 19) + start.substring(20, 25)
      ) / 1000 / 86400.0 + SEVENTY_YEARS_IN_DAYS;
      
      eventsToAppend.push([
        event['organization_name'],
        event['name'],
        event['start_time'],
        startParsed,
        event['rsvps']
      ]);
    }
    
    pageUrl = eventResponse.pages.next;
  }

  var sheet = SpreadsheetApp.getActive()
    .getSheetByName(SHEET_NAMES.meetupEvents);
  sheet.clear();
  var range = sheet.getRange(1, 1, eventsToAppend.length, eventsToAppend[0].length);
  range.setValues(eventsToAppend);
};

/*
To set up Salesforce sync, take the following steps:
1. Sign up for a Developer Edition account
2. Create a "Connected App" with the Callback URL set to

   https://script.google.com/macros/d/{script_id}/usercallback
   
   where {script_id} is found in File > Project properties
3. Copy the App's Consumer Key and Consumer Secret into "Script Properties"
   in the "File > Project properties" dialog
4. Run the "salesforceAuthorize" function in the "Salesforce.gs" script
   and click the "Authorize" link that appears in the spreadsheet.
*/
var SALESFORCE_HEADERS = [
  "Name", "Salesforce ID", "Active?", "Website URL", "Meetup Link", "Location",
  "Twitter", "Github URL", "Facebook Page URL", "Primary Contact", "Primary Contact Email",
  "Public Contact Email",
];
var PARTNER_BRIGADES = [ // grandfather these in for now
  "Code for Greensboro", "Code for Kansas City", "Code for Newark", "Northern Illinois University - Tech Bark (Brigade)", "Open Austin", "Sketch City (Houston)"
];
function loadSalesforceData() {
  var salesforceBrigades = salesforceListBrigades();
  var brigades = [];
  
  for (var i in salesforceBrigades) {
    var brigade = salesforceBrigades[i];
    
    var isActiveBrigade = brigade.Brigade_Type__c == 'Brigade' && (
       brigade.Brigade_Status__c == 'Active' ||
       (brigade.Brigade_Status__c == 'MOU in Process' && PARTNER_BRIGADES.indexOf(brigade.Name) !== -1) || // Only allow partner brigades in progress
       brigade.Brigade_Status__c == 'Signed MOU'        // TODO: Remove once the MOU signing process is over
      );
    
    brigades.push([
      brigade.Name,
      brigade.Id,
      isActiveBrigade,
      brigade.Website || brigade.Site_Link__c,
      brigade.MeetUp_Link__c,
      brigade.Brigade_Location__c,
      brigade.Organization_Twitter__c,
      brigade.Github_URL__c,
      brigade.Facebook_Page_URL__c,
      brigade.npe01__One2OneContact__r && brigade.npe01__One2OneContact__r.Name,
      brigade.npe01__One2OneContact__r && brigade.npe01__One2OneContact__r.Email,
      brigade.Brigade_Public_Email__c,
    ]);
  }
  
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.salesforce);
  
  // sanity check, if there is no data let's bail and leave the sheet unchanged
  //   (this happens for example when we hit salesforce API limit)
  if (!brigades.length) {
    Logger.log("ERROR: No brigades returned from salesforce. Bailing.");
    var existingBrigades = sheet.getRange(2, 1, sheet.getLastRow(), SALESFORCE_HEADERS.length).getValues();
    return existingBrigades;
  }

  sheet
    .clear()
    .getRange(1, 1, 1, SALESFORCE_HEADERS.length)
      .setFontWeight("bold")
      .setValues([SALESFORCE_HEADERS])
    .getSheet()
      .getRange(2, 1, brigades.length, SALESFORCE_HEADERS.length)
      .setValues(brigades);

  sheet.setFrozenRows(1);
  return brigades;
}

var SALESFORCE_DONATION_HEADERS = [
  'Date', 'Name', 'Email', 'Amount', 'Description', 'Brigade Designation'
];
function loadSalesforceDonationData() {
  var salesforceDonations = salesforceListDonations();
  var donations = [];

  for (var i in salesforceDonations) {
    var donation = salesforceDonations[i];

    donations.push([
      donation.CloseDate,
      // name: (use contact name if possible, fall back on account name otherwise)
      donation.Account.npe01__One2OneContact__r ? donation.Account.npe01__One2OneContact__r.Name : donation.Account.Name,
      // email: (use contact email if possible, can't fall back because Accounts don't have email)
      donation.Account.npe01__One2OneContact__r ? donation.Account.npe01__One2OneContact__r.Email : '',
      donation.Amount,
      donation.Description,
      donation.Brigade_Designation_lookup__r.Name
    ]);
  }

  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAMES.salesforceDonations);

  // sanity check, if there is no data let's bail and leave the sheet unchanged
  //   (this happens for example when we hit salesforce API limit)
  if (!donations.length) {
    Logger.log("ERROR: No donations returned from salesforce. Bailing.");
    var existingDonations = sheet.getRange(2, 1, sheet.getLastRow(), SALESFORCE_DONATION_HEADERS.length).getValues();
    return existingDonations;
  }

  sheet
    .clear()
    .getRange(1, 1, 1, SALESFORCE_DONATION_HEADERS.length)
      .setFontWeight("bold")
      .setValues([SALESFORCE_DONATION_HEADERS])
    .getSheet()
      .getRange(2, 1, donations.length, SALESFORCE_DONATION_HEADERS.length)
      .setValues(donations);

  sheet.setFrozenRows(1);
  return donations;
}

/*
Note: the GroupsApp service does not expose an API for checking the list of
all subscribed addresses, only the subscribed addresses _with a Google Account_.
It appears that the `hasUser` method returns true/false regardless of whether the
address is associated with a Google Account, though, so we can just iterate
through that list.

Also, for some reason, "captains@codefortulsa.org" returns an error message
that the "email is invalid".
*/
var MANUAL_OVERRIDE_ADD_MEMBER = [
  'captains@codefortulsa.org'
];
function loadGroupMembers(brigadeResults) {
  brigadeResults = brigadeResults || loadSalesforceData();
  var group = GroupsApp.getGroupByEmail("brigadeleads@codeforamerica.org");
  
  // First, populate a list of emails to check
  var activeColumn = SALESFORCE_HEADERS.indexOf("Active?");
  var primaryContactEmail = SALESFORCE_HEADERS.indexOf("Primary Contact Email");
  var emails = []
  for (var i in brigadeResults) {
    if (brigadeResults[i] && brigadeResults[i][activeColumn]) { // remove missing primary contact & inactive
      emails.push(brigadeResults[i][primaryContactEmail]);
    }
  }
  
  // Now, loop over the emails and check each one to see if it's subscribed
  var usersToAppend = []; 
  for (var i in emails) {
    var groupHasUser;
    
    if (!MANUAL_OVERRIDE_ADD_MEMBER.indexOf(emails[i])) {
      try {
        groupHasUser = group.hasUser(emails[i]);
      } catch (e) {
        Logger.log("ERROR: Could not check group membership for " + emails[i] + ": "  + e.message);
        Logger.log("  ...assuming that email is a member of the group.");
        groupHasUser = true;
      }
    } else {
      groupHasUser = true;
    }
    
    usersToAppend.push([
      emails[i],
      groupHasUser
    ]);
    Utilities.sleep(250);
  }
  
  var SHEET_HEADERS = ["Primary Contact Email", "Is Subscribed To brigadeleads@"];
  var sheet = SpreadsheetApp.getActive()
    .getSheetByName(SHEET_NAMES.brigadeleads);  

  sheet
    .clear()
    .getRange(1, 1, 1, SHEET_HEADERS.length)
      .setFontWeight("bold")
      .setValues([SHEET_HEADERS])
    .getSheet()
      .getRange(2, 1, usersToAppend.length, usersToAppend[0].length)
      .setValues(usersToAppend);
  
  sheet.setFrozenRows(1);
}

function createUI() {
  try {
    var ui = SpreadsheetApp.getUi()
    ui.createMenu('Update Data')
      .addItem('Update All', 'loadAll')
      .addSeparator()
      .addItem('Update Salesforce Data', 'loadSalesforceData')
      .addItem('Update brigade-information', 'loadBrigadeInformation')
      .addItem('Update Meetup Data', 'loadMeetupData')
      .addItem('Update brigadeleads@', 'loadGroupMembers')
      .addSeparator()
      .addItem('Send Email Update', 'sendEmail')
      .addItem('Pull Contact Database from Salesforce', 'importSalesforceToDirectory')
      .addToUi();
  } catch (e) {}
}