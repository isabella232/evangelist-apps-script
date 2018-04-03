var MEETUP_API_KEY = PropertiesService.getScriptProperties().getProperty("MEETUP_API_KEY");
/*
 * Due to Google Sheet's 2 million cell limit, we need to separate this into its own
 * spreadsheet. (It also helps with performance.)
 */
var MEETUP_MEMBERSHIP_SPREADSHEET_ID = '1SXzEeKQAHXB22lmXQvf9G2aVmyY9x4zkYG7fRCAw30c';

/*
Given a header like:
  Link: <https://api.meetup.com/pro/brigade/members?page=200&offset=1>; rel="next"
this will return:
  { url: "https://api.meetup.com/pro/brigade/members?page=200&offset=1", rel: "next" }
*/
var LINK_REGEXP = new RegExp('<([^>]+)>; rel="([a-zA-Z]+)"');
function _meetupParseLinkHeader(header) {
  var match = LINK_REGEXP.exec(header),
      url = match ? match[1] : null,
      rel = match ? match[2] : null;

  return {
    url: url,
    rel: rel
  }
}




function meetupRequest(url) {
  console.log("Beginning request for: " + url);
  if (url.indexOf('?') !== -1) {
    url = url + '&key=' + MEETUP_API_KEY;
  } else {
    url = url + '?key=' + MEETUP_API_KEY;
  }
  
  var response;
  var retry = true, retries = 1;
  while (retry && retries > 0) {
    try {
      response = UrlFetchApp.fetch(url);
      retry = false;
    } catch (e) {
      if (e.message.match(/Address unavailable/) && response && response.getResponseCode() === 200) {
        console.log("  Got error: " + e.message + " but response was 200. Swallowing exception and continuing.");
      } else if (retries-- >= 1) {
        console.log("  Got error: " + e.message + ". Retrying in 1000 ms.");
        Utilities.sleep(1000);
      } else {
        console.log("Throwing: " + e);
        throw e;
      }
    }
  }

  var headers = response.getAllHeaders();
  var links = {};
  var responseBytes = response.getContent().length;
  console.log("  Got response (Status: " + response.getResponseCode() + "; Size: " + responseBytes + "b; Ratelimit: " + headers['x-ratelimit-remaining'] + "/" + headers['x-ratelimit-limit'] + "; Reset in " + headers['x-ratelimit-reset'] + ")");
  
  if (typeof headers['Link'] === 'string') {
    var parsedHeader = _meetupParseLinkHeader(headers['Link']);
    if (parsedHeader.rel) {
      links[parsedHeader.rel] = parsedHeader.url;
    } else {
      console.eror("Could not parse link header: " + headers['Link']);
    }
  } else if (typeof headers['Link'] === 'object') {
    for (var i in headers['Link']) {
      var parsedHeader = _meetupParseLinkHeader(headers['Link'][i]);
      if (parsedHeader.rel) {
        links[parsedHeader.rel] = parsedHeader.url;
      } else {
        console.error("Could not parse link header: " + headers['Link'][i]);
      }
    }
  }

  if (parseInt(headers['x-ratelimit-remaining']) >= 10) {
   var recommendedSleepMs = 0;
  } else {
    var recommendedSleepMs = 1000 * (parseInt(headers['x-ratelimit-remaining']) <= 1 ?
    parseInt(headers['x-ratelimit-reset']) :
    parseFloat(headers['x-ratelimit-reset']) / parseInt(headers['x-ratelimit-limit']));
  }

  return {
    response: JSON.parse(response.getContentText()),
    links: links,
    recommendedSleepMs: recommendedSleepMs
  };
}

// converts a time like 1520367649000 to "2018-03-06 20:20:49"
function _convertMeetupTime(datetime) {
  var d = new Date(datetime);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()].join('-') +
    ' ' + [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].join(':');
}

function meetupProSyncMembersIncremental() {
  meetupProSyncMembers(true);
}
      
function meetupProSyncMembersAll() {
  meetupProSyncMembers(false);
}

function meetupProSyncMembers(incremental) {
  incremental = incremental || false;

  var sheet = SpreadsheetApp.openById(MEETUP_MEMBERSHIP_SPREADSHEET_ID).getSheetByName(SHEET_NAMES.meetupMembers);
  var sheetHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  if (incremental) {
    var mostRecentId = parseInt(sheet.getRange(2, sheetHeaders.indexOf('Meetup ID') + 1, 1, 1).getValues()[0][0]);
  } else {
    var mostRecentId = -1; // fake value that no member ID will ever be equal too
  }
  
  var currentPageRequest = meetupRequest('https://api.meetup.com/pro/brigade/members?page=200');
  var currentPageMembers = currentPageRequest.response;
  var currentMember = currentPageMembers.shift();
  var membersToAppend = [];
  while (currentMember.member_id !== mostRecentId) {
    // iterate through the member list beginning to end and add members as necessary
    membersToAppend.push({
      "Meetup ID": currentMember.member_id,
      "Full Name": currentMember.member_name,
      "Email Address": currentMember.email,
      "Events Attended": currentMember.events_attended,
      "Chapters": JSON.stringify(currentMember.chapters),
      "Join Time": currentMember.join_time,
      "Last Access Time": currentMember.last_access_time
    });
    
    if (currentPageMembers.length === 0) {
      if (currentPageRequest.links.next) {
        if (currentPageRequest.recommendedSleepMs > 0) {
          console.info("Throttling for " + currentPageRequest.recommendedSleepMs + " ms before next request.");
        }

        Utilities.sleep(currentPageRequest.recommendedSleepMs);
        currentPageRequest = meetupRequest(currentPageRequest.links.next);
        currentPageMembers = currentPageRequest.response;
      } else {
        break;
      }
    }
    
    currentMember = currentPageMembers.shift();
  }
  
  console.log("Done fetching Meetup members -- found " + membersToAppend.length + (incremental ? " to append" : " total"));
  if (membersToAppend.length === 0) {
    return; // nothing left to do here!
  }
  
  if (incremental) {
    // prepend rows
    sheet.insertRowsBefore(2, membersToAppend.length);
  } else {
    // replace all rows
    sheet.getRange(2, 1, sheet.getLastRow(), sheet.getLastColumn()).clear();
  }
  
  var rowsToAppend = [];
  for (var i in membersToAppend) {
    var row = [];
    for (var j in sheetHeaders) {
      var value = membersToAppend[i][sheetHeaders[j]];
      row.push(typeof value !== 'undefined' ? value : '');
    }
    rowsToAppend.push(row);
  }
  sheet.getRange(2, 1, rowsToAppend.length, sheet.getLastColumn())
    .setValues(rowsToAppend);
}