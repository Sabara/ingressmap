/**
 * ingressmap.js
 * 
 * Copyright (C) 2014 Sabara <sabara dot ingress at gmail dot com>
 * 
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

///
/// constants
///
var clientId = '18011919441-dhpckpmlmfsrldtlaorfdp1khba4pgbh.apps.googleusercontent.com';
var scopes = 'https://www.googleapis.com/auth/gmail.readonly';
var userId = 'me';
var maxResults = 100;
var q = 'subject:"Ingress Damage Report: Entities attacked by" from:ingress-support@google.com';
var maxLoop = 100;
var parserDebug = false;
var version = '0.2';
var maxEnemyNames = 20;

///
/// global variable
///
var googleMap = null;
var markers = [];
var infoWindows = [];
var upcCount = 0;
var openedInfoWindow = null;


///
/// main
///
$(document).ready(function() {
	initLocalStorage();

	disablePOIInfoWindow();

	// printLocalStorage();

	// (35.681382, 139.766084) == Tokyo Station
	var mapOpt = { center: { lat: 35.681382, lng: 139.766084 }, zoom: 10, mapTypeId: google.maps.MapTypeId.ROADMAP, panControl: false, zoomControl: true, zoomControlOptions: { style: google.maps.ZoomControlStyle.LARGE, position: google.maps.ControlPosition.RIGHT_CENTER }, streetViewControl: true, streetViewControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER } };
	// http://stackoverflow.com/questions/8483023/uncaught-typeerror-cannot-set-property-position-of-undefined
	googleMap = new google.maps.Map($('#map_canvas')[0], mapOpt); // !!! global
	// http://googlemaps.googlermania.com/google_maps_api_v3/ja/map_example_singleInfoWindow.html
	google.maps.event.addListener(googleMap, 'click', function(event) { closeInfoWindow(); });

	var currentPositionDiv = $('<div />').html('&#9673;').attr('title', 'Go to current position').attr('id', 'current_position'); // &#9673; == http://ja.wikipedia.org/wiki/%E8%9B%87%E3%81%AE%E7%9B%AE
	google.maps.event.addDomListener(currentPositionDiv[0], 'click', moveToCurrentPosition);
	googleMap.controls[google.maps.ControlPosition.RIGHT_TOP].push(currentPositionDiv[0]);

	moveToCurrentPosition();

	showAllPortals();
   	showStatus();
});

$(window).load(function() {
	gapi.client.load('gmail', 'v1').then(function(response) { // sometimes this line got error in $(document).ready
		gapi.auth.authorize({ client_id: clientId, scope: scopes, immediate: true}, handleAuthResult);
	}, function(response) {
		console.error({ func: 'gapi.client.load.then', error: response.result.error.message });
	}, this);
});

function handleAuthResult(authResult) {
	if (authResult && !authResult.error) {
		$('#content').off('click');
		gmailList('', maxLoop, [], function(ids) {
			showMessage('Loading mail ID from Gmail... (' + (maxLoop * maxResults - ids.length) + ')');
		}, function(ids) {
			var newIds = ids.filter(function(id) { return !isExistReport(generateReportId(id, 0)); }).reverse(); // sort by time (older first)
			if (newIds && 0 != newIds.length) {
				gmailGet(newIds, handleGmailResult, function(ids, response) {
					clearAllPortals();
					showAllPortals();
					showStatus();
				});
			} else {
				showStatus();
			}
		});
	} else {
		showMessage('Please click here to authorize Gmail API (OAuth 2.0)');
		$('#content').on('click', function(event) {
			gapi.auth.authorize({ client_id: clientId, scope: scopes, immediate: false }, handleAuthResult);
		});
	}
}

function handleGmailResult(ids, response) {
	ids.forEach(function(id) {
		var result = response.result[id].result;
		try {
			// FIXME: error handling if headers missing
			if (result && !result.error) {
				var header = result['payload']['headers'];
				var body = result['payload']['parts'][1]['body']['data']; // 0 == text part, 1 == HTML part
				var parsedMails = parseMail(id, header, urlsafe_b64_to_utf8(body));
				if (null == parsedMails) {
					console.error({ func: 'handleGmailResult', error: 'failed to parse mail', id: id, result: result });
				} else {
					parsedMails.forEach(function(parsedMail) {
						saveReport(parsedMail['reportId'], parsedMail['time'], parsedMail['latitude'], parsedMail['longitude'], parsedMail['agentName'], parsedMail['agentFaction'], parsedMail['agentLevel'], parsedMail['ownerName'], parsedMail['ownerFaction'], parsedMail['enemyName'], parsedMail['enemyFaction']);
						savePortal(parsedMail['latitude'], parsedMail['longitude'], parsedMail['time'], parsedMail['portalName'], parsedMail['portalImageUrl']);
					});
				}
			} else {
				console.error({ func: 'handleGmailResult', error: 'failed to get message from Gmail', id: id, e: result.error });
			}
		} catch (e) {
			console.error({ func: 'handleGmailResult', error: e, id: id, result: result });
		}
	});
}

function showAllPortals() {
	var len = reportsLength();
   	if (0 == len) {
   		return;
   	}
	showMessage('Loading reports... (' + len + ')');
   	var reports = loadAllReports();
   	showMessage('Analyzing reports... (' + reports.length + ')');
   	var stats = analyzeReports(reports);
   	showMessage('Showing portals... (' + stats.length + ')');
   	stats.forEach(showPortal);
   	// printLocalStorage();
}

function showPortal(stats) {
	var latitude = stats['latitude'];
	var longitude = stats['longitude'];
	var hours = stats['hours'];
	var days = stats['days'];
	var enemyNames = stats['enemyNames'];
	var isLatest = stats['isLatest'];
	var latests = stats['latests'];
	var latestHours = latests.map(function(item) { return item['hours']; });
	var latestDays = latests.map(function(item) { return item['days']; });
	var latestEnemyNames = latests.map(function(item) { return item['enemyName']; });
	var isUPC = stats['isUPC'];
	var damages = stats['damages'];

	var portal = loadPortal(latitude, longitude);
	if (null == portal) { return; }
	var portalName = portal['portalName'];
	var portalImageUrl = portal['portalImageUrl'];

	var intelUrl = 'https://www.ingress.com/intel?ll=' + latitude + ',' + longitude + '&pll=' + latitude + ',' + longitude + '&z=19';
	var color = isUPC ? '#FF0000' : '#3679B9';
	var titleText = portalName + (isUPC ? ' (UPC)' : '');
	var enemyTable = generateEnemyTable(enemyNames, latestEnemyNames);
	var hoursTable = '<table><thead><tr><td>Hour</td><td title="Unique users per hour">U</td><td title="Damages">#</td></tr></thead><tbody>' + hours.sort(function(a, b) { return a[0] - b[0]; }).map(function(item) { return (-1 == latestHours.indexOf(item[0]) ? '<tr>' : '<tr class="tr_highlight">') + '<td class="td_number">' + item.join('</td><td class="td_number">') + '</td></tr>'; }).join('') + '</tbody></table>';
	var daysTable = '<table><thead><tr><td>Day</td><td title="Unique users per hour">U</td><td title="Damages">#</td></tr></thead><tbody>' + days.sort(function(a, b) { return a[0] - b[0]; }).map(function(item) { return (-1 == latestDays.indexOf(item[0]) ? '<tr>' : '<tr class="tr_highlight">') + '<td>' + toWeekDay(item[0]) + '</td><td class="td_number">' + item[1] + '</td><td class="td_number">' + item[2] + '</td></tr>'; }).join('') + '</tbody></table>';
	var content = $('<div />').append($('<h3 />').html(portalName + (isUPC ? ' (<span style="color: red">UPC</span>)' : ''))).append($('<a />').addClass('portal_info').attr('href', intelUrl).attr('target', '_blank').append($('<img />').attr({ 'no_load_src': portalImageUrl }).addClass('portal_img'))).append($('<div />').addClass('portal_info').html(enemyTable)).append($('<div />').addClass('portal_info').html(hoursTable)).append($('<div />').addClass('portal_info').html(daysTable));

	var iconOpt = { path: isLatest ? google.maps.SymbolPath.BACKWARD_CLOSED_ARROW : google.maps.SymbolPath.CIRCLE, scale: isLatest ? 5 : 10, fillColor: color, fillOpacity: 0.4, strokeColor: color, strokeWeight: 2, strokeOpacity: 0.8 };
	// var iconOpt = 'http://commondatastorage.googleapis.com/ingress.com/img/map_icons/marker_images/hum_8res.png';
	var marker = new google.maps.Marker({ position: new google.maps.LatLng(latitude, longitude), map: googleMap, title: titleText, icon: iconOpt, zIndex: 10 });
	markers.push(marker); // global!!!
	var infoWindow = new google.maps.InfoWindow({ content: content.html(), disableAutoPan: false, maxWidth: 640, noSupress: true });
	infoWindows.push(infoWindow); // global!!!
	if (isUPC) upcCount++; // global!!!
	// https://developers.google.com/maps/documentation/javascript/examples/event-closure?hl=ja
	// http://stackoverflow.com/questions/8909652/adding-click-event-listeners-in-loop
	google.maps.event.addListener(marker, 'click', function(_marker, _infoWindow) { // closure
		return function(event) {
			closeInfoWindow();
			_infoWindow.setContent(_infoWindow.getContent().replace(/<img no_load_src=/gi, '<img src=')); // lazy img loading
			_infoWindow.open(googleMap, _marker);
			openedInfoWindow = _infoWindow; };
	}(marker, infoWindow));
}

function clearAllPortals() {
	closeInfoWindow();
	infoWindows.forEach(function(infoWindow) {
		google.maps.event.clearInstanceListeners(infoWindow);
		infoWindow.close();
	});
	infoWindows = []; // global!!!
	markers.forEach(function(marker) {
		google.maps.event.clearInstanceListeners(marker);
		marker.setMap(null);
	});
	markers = []; // global!!!
	upcCount = 0; // global!!!
}

function generateEnemyTable(enemyNames, latestEnemyNames) {
	var enemies = enemyNames.map(function(item) { return [-1 == latestEnemyNames.indexOf(item[0]) ? false : true, anonymize(item[0]), item[1], item[2]]; });
	if (maxEnemyNames < enemies.length) {
		enemies = enemies.slice(0, maxEnemyNames).concat([enemies.slice(maxEnemyNames).reduce(function(a, b) { return [a[0] || b[0], 'etc.', a[2] + b[2], a[3] + b[3]]; }, [false, 'etc.', 0, 0])]);
	}
	return '<table><thead><tr><td>Agent</td><td title="Unique users per hour">U</td><td title="Damages">#</td></tr></thead><tbody>' + enemies.map(function(item) { return '<tr' + (item[0] ? ' class="tr_highlight"' : '') + '><td>' + item[1] + '</td><td class="td_number">' + item[2] + '</td><td class="td_number">' + item[3] + '</td></tr>';  }).join('') + '</tbody></table>';
}

function showMessage(mesg) {
	console.log(mesg);
	$('#content').html(mesg + '<br />');
}

function showStatus() {
   	showMessage('Ingress Damage Reports Map, Reports: ' + reportsLength() + ', Portals: ' + portalsLength() + ' (<span style="color: red">UPC: ' + upcCount + '</span>)');
}

///
/// Gmail
///
function gmailList(pageToken, loop, ids, progressFunc, doneFunc) {
	if (0 >= loop || null == pageToken) {
		return doneFunc(ids);;
	}
	gapi.client.gmail.users.messages.list({ userId: userId, maxResults: maxResults, q: q, pageToken: pageToken, fields: 'nextPageToken,messages/id' }).then(function(response) {
 		if ('messages' in response.result && 0 != response.result.messages.length) {
	 		response.result.messages.forEach(function(mesg) {
	 			ids.push(mesg['id']);
	 		});
 		}
		progressFunc(ids);
		gmailList(response.result.nextPageToken, loop - 1, ids, progressFunc, doneFunc); // recursive!!!
 	}, function(response) {
 		console.error({ func: 'gmailList', error: response.result.error.message });
 	}, this);
}

function gmailGet(ids, progressFunc, doneFunc) {
	if (!ids || 0 == ids.length) {
		doneFunc(ids, null);
		return;
	}
	var head = ids.slice(0, maxResults);
	var rest = ids.slice(maxResults);
	var batch = gapi.client.newBatch();
	head.forEach(function(id) {
		batch.add(gapi.client.gmail.users.messages.get({ userId: userId, id: id, fields: 'payload(headers,parts/body)' }), { id: id });
	});
	showMessage('Loading mail body from Gmail... (' + ids.length + ')');
	batch.then(function(response) {
		progressFunc(head, response)
		gmailGet(rest, progressFunc, doneFunc); // recursive!!!
	}, function(response) {
		console.error({ func: 'gmailGet', error: response.result.error.message });
	}, this);
}

///
/// reports
///
function initLocalStorage() {
	var v = localStorage.getItem(generateConfigId('version'));
	if (v && 'string' === typeof v && v == version) {
		// same version
		// do nothing
	} else {
		showMessage('Updating localStorage... (' + v + ' to ' + version + ')');
		localStorage.clear();
		localStorage.setItem(generateConfigId('version'), version);
	}
}

function reportsLength() {
	var len = 0;
	for (var i = 0; i < localStorage.length; i++){
		if (isReportId(localStorage.key(i))) len++;
	}
	return len;
}

function portalsLength() {
	var len = 0;
	for (var i = 0; i < localStorage.length; i++){
		if (isPortalId(localStorage.key(i))) len++;
	}
	return len;
}

function saveReport(reportId, time, latitude, longitude, agentName, agentFaction, agentLevel, ownerName, ownerFaction, enemyName, enemyFaction) {
	if (isReportId(reportId)) {
		//var dummy = ''; // dummy big data
		//for (var i = 0; i < 500 * 1024; i++) {
		//	dummy += 'x';
		//}
		//report['dummy'] = dummy;
		var jsonString = JSON.stringify([time, reportId, latitude, longitude, agentName, agentFaction, agentLevel, ownerName, ownerFaction, enemyName, enemyFaction]);
		try {
			localStorage.setItem(reportId, jsonString);
			return true;
		} catch (e) { // QUOTA_EXCEEDED_ERR
			// http://chrisberkhout.com/blog/localstorage-errors/
			console.error({ func: 'saveReport', error: 'failed to setItem (first)', e: e, reportId: reportId, jsonString: jsonString });
			showMessage('Removing old reports... (' + maxResults + ')');
			removeOldReports(maxResults);
			try {
				localStorage.setItem(reportId, jsonString);
				return true;
			} catch (e) {
				console.error({ func: 'saveReport', error: 'failed to setItem (retry)', e: e, reportId: reportId, jsonString: jsonString });
			}
			return false;
		}
		return true;
	} else {
		console.error({ func: 'saveReport', error: 'invalid value', reportId: reportId });
		return false;
	}
}

function savePortal(latitude, longitude, time, portalName, portalImageUrl) {
	var oldPortal = localStorage.getItem(generatePortalId(latitude, longitude));
	if (oldPortal && 'string' === typeof oldPortal && 0 < oldPortal.length) {
		var portal = JSON.parse(oldPortal);
		if (time < portal[0]) {
			return false;
		}
	}
	var newPortal = JSON.stringify([time, latitude, longitude, portalName, portalImageUrl]);
	try {
		localStorage.setItem(generatePortalId(latitude, longitude), newPortal);
		return true;
	} catch (e) { // QUOTA_EXCEEDED_ERR
		// http://chrisberkhout.com/blog/localstorage-errors/
		console.error({ func: 'savePortal', error: 'failed to setItem (first)', e: e, latitude: latitude, longitude: longitude, newPortal: newPortal });
		showMessage('Removing old reports... (' + maxResults + ')');
		removeOldReports(maxResults);
		try {
			localStorage.setItem(generatePortalId(latitude, longitude), newPortal);
			return true;
		} catch (e) {
			console.error({ func: 'savePortal', error: 'failed to setItem (retry)', e: e, latitude: latitude, longitude: longitude, newPortal: newPortal });
		}
		return false;
	}
	return true;
}

function removeOldReports(count) {
	var keys = range(0, Math.min(count, reportsLength())).map(function(i) { return localStorage.key(i); }).filter(isReportId);
	keys.forEach(function(k) {
		var v = localStorage.getItem(k);
		// console.log({ func: 'removeOldReports', k: k, v: (v ? v.length : v) });
		localStorage.removeItem(k);
	});
}

function loadReport(reportId) {
	var jsonString = localStorage.getItem(reportId);
	if (jsonString && 'string' === typeof jsonString && 0 < jsonString.length) {
		try {
			var r = JSON.parse(jsonString);
			return { time: r[0], reportId: r[1], latitude: r[2], longitude: r[3], agentName: r[4], agentFaction: r[5], agentLevel: r[6], ownerName: r[7], ownerFaction: r[8], enemyName: r[9], enemyFaction: r[10] };
		} catch (e) {
			console.error({ func: 'loadReport', error: 'falied to parse JSON', reportId: reportId, jsonString: jsonString });
			return null;
		}
	} else {
		console.error({ func: 'loadReport', error: 'invalid value', reportId: reportId, jsonString: jsonString });
		return null;
	}
}

function loadPortal(latitude, longitude) {
	var jsonString = localStorage.getItem(generatePortalId(latitude, longitude));
	if (jsonString && 'string' === typeof jsonString && 0 < jsonString.length) {
		try {
			var r = JSON.parse(jsonString);
			return { time: r[0], latitude: r[1], longitude: r[2], portalName: r[3], portalImageUrl: r[4] };
		} catch (e) {
			console.error({ func: 'loadPortal', error: 'falied to parse JSON', latitude: latitude, longitude: longitude, jsonString: jsonString });
			return null;
		}
	} else {
		console.error({ func: 'loadPortal', error: 'invalid value', latitude: latitude, longitude: longitude, jsonString: jsonString });
		return null;
	}
}

function isExistReport(reportId) {
	var jsonString = localStorage.getItem(reportId);
	return jsonString && 'string' === typeof jsonString && 0 < jsonString.length;
}

function generateReportId(gmailId, n) {
	return 'a/' + gmailId + '/' + ('00' + n).substr(-2);
}

function generatePortalId(latitude, longitude) {
	return 'p/' + latitude + ',' + longitude;
}

function generateConfigId(config) {
	return 'z/' + config;
}

function isReportId(id) {
	return id && 'string' === typeof id && 0 == id.indexOf('a/');
}

function isPortalId(id) {
	return id && 'string' === typeof id && 0 == id.indexOf('p/');
}

function isConfigId(id) {
	return id && 'string' === typeof id && 0 == id.indexOf('z/');
}

function loadAllReports() {
	var reports = [];
	for (var i = 0; i < localStorage.length; i++){
		var id = localStorage.key(i);
		if (isReportId(id)) {
			var report = loadReport(id);
			if (null != report) {
				reports.push(report);
			} else {
				localStorage.removeItem(id);
			}
		}
	}
	return reports;
}

function printLocalStorage() {
	for (var i = 0; i < localStorage.length; i++){
	// for (var i = localStorage.length - 1; i >= 0; i--){
		var k = localStorage.key(i);
		var v = localStorage.getItem(k);
		// console.log([i, k, v ? v.length : v]);
		console.log([i, k, v]);
	}
}

function printPortals(pattern) {
	var portals = [];
	for (var i = 0; i < localStorage.length; i++){
		var k = localStorage.key(i);
		if (isPortalId(k)) {
			var v = localStorage.getItem(k);
			if (!pattern || v.match(pattern)) {
				portals.push(JSON.parse(v));
			}
		}
	}
	portals.forEach(function(portal) {
		console.log(portal.map(escapeCSV).join(',') + ',');
	});
}

function printReports(pattern) {
	var reports = [];
	for (var i = 0; i < localStorage.length; i++){
		var k = localStorage.key(i);
		if (isReportId(k)) {
			var v = localStorage.getItem(k);
			if (!pattern || v.match(pattern)) {
				reports.push(JSON.parse(v));
			}
		}
	}
	reports.forEach(function(portal) {
		console.log(portal.map(escapeCSV).join(',') + ',');
	});
}

function escapeCSV(item) {
	if (item && 'string' === typeof item && 0 < item.length) {
		var esc = item.replace(/"/g, '""');
		return esc.match(/[,\n"]/) ? '"' + esc + '"' : esc;
	} else {
		return item;
	}
}

///
/// analyzer
///
function analyzeReports(reports) {
	var now = Date.now();
	var statsPerPortalHourEnemy = mapReduce(reports, function(report) {
		var d = new Date(report['time']);
		var ymdh = d.getFullYear() * 1000000 + (1 + d.getMonth()) * 10000 + d.getDate() * 100 + d.getHours();
		var isLatest = 24.0 > (now - report['time']) / (1000.0 * 60 * 60.0); // latest 24h
		var isUPC = report['ownerName'] == report['agentName'];
		return [[report['latitude'], report['longitude'], ymdh, d.getHours(), d.getDay(), report['enemyName']], [report['time'], isLatest, isUPC]];
	}, function(k, v) {
		var isLatest = v.map(function(item) { return item[1]; }).some(function(item) { return item; });
		var isUPC = v.map(function(item) { return item[2]; }).some(function(item) { return item; });
		return { latitude: k[0], longitude: k[1], ymdh: k[2], hours: k[3], day: k[4], enemyName: k[5], damages: v.length, isLatest: isLatest, isUPC: isUPC };
	});
	var statsPerPortal = mapReduce(statsPerPortalHourEnemy, function(stats) {
		return [[stats['latitude'], stats['longitude']], [stats['hours'], stats['day'], stats['enemyName'], stats['damages'], stats['isLatest'], stats['isUPC']]];
	}, function(k, v) {
		var hoursPerHour = sortByValue(freq(v.map(function(item) { return item[0]; })));
		var daysPerHour = sortByValue(freq(v.map(function(item) { return item[1]; })));
		var enemyNamesPerHour = sortByValue(freq(v.map(function(item) { return item[2]; })));
		var damages = v.map(function(item) { return item[3]; }).reduce(function(a, b) { return a + b; });
		var isLatest = v.map(function(item) { return item[4]; }).some(function(item) { return item; });
		var latests = v.filter(function(item) { return item[4]; }).map(function(item) { return { hours: item[0], days: item[1], enemyName: item[2] }; });
		var isUPC = v.map(function(item) { return item[5]; }).some(function(item) { return item; });
		var hoursTotal = sortByValue(freq(v.map(function(item) { return range(0, item[3]).map(function(i) { return item[0] }); }).reduce(function(a, b) { return a.concat(b); })));
		var daysTotal = sortByValue(freq(v.map(function(item) { return range(0, item[3]).map(function(i) { return item[1] }); }).reduce(function(a, b) { return a.concat(b); })));
		var enemyNamesTotal = sortByValue(freq(v.map(function(item) { return range(0, item[3]).map(function(i) { return item[2] }); }).reduce(function(a, b) { return a.concat(b); })));
		return { latitude: k[0], longitude: k[1], hours: mergeFreqArray(hoursPerHour, hoursTotal), days: mergeFreqArray(daysPerHour, daysTotal), enemyNames: mergeFreqArray(enemyNamesPerHour, enemyNamesTotal), damages: damages, isLatest: isLatest, isUPC: isUPC, latests: latests };
	});
	return statsPerPortal;
}

///
/// mail parser
///
function parseMail(id, header, body) {
	var head = parseHeader(header);
	if (parserDebug) { console.log(['parseMail', head['Subject'], head['Date']]); }
	var bodies = parseBody(body);
	if (null != head && null != bodies && 0 != bodies.length) {
		var d = new Date(head['Date']);
		return bodies.map(function(b, i) {
			var result = { reportId: generateReportId(id , i), time: d.getTime() };
			result = $.extend(result, b);
			return result;
		});
	} else {
		return null;
	}
}

function parseHeader(headers) {
	var names = ['From', 'To', 'Date', 'Subject'];
	var result = {};
	headers.forEach(function(header) {
		names.forEach(function(name) {
			if (name == header['name']) {
				result[name] = header['value'];
			}
		});
	});
	return names.every(function(name) { return name in result }) ? result : null;
}

function parseBody(body) {
	var result = [];
	var r = {};
	var agentName = '';
	var agentFaction = '';
	var agentLevel = '';

	var div = parseHTML(body);
	// console.log(div);

	// table[width="750px"] > tbody > tr:eq(0) == header image (** Ingress - Begin Transmission **)
	// table[width="750px"] > tbody > tr:eq(1) > td > table[width="700px"] > tbody > tr == body
	// table[width="750px"] > tbody > tr:eq(2) == footer image (** Ingress - End Transmission **)
	var trs = $('table[width="750px"] > tbody > tr:eq(1) > td > table[width="700px"] > tbody > tr', div);
	trs.each(function(i, tr) {
		if (0 == i) { // first line must be agent info
			// <td valign="top" style="font-size: 13px; padding-bottom: 1.5em;"><span style="font-weight: normal; margin-right: .3em; font-size: 10px; text-transform: uppercase;">Agent Name:</span><span style="color: #3679B9;">agentNameX</span><br><span style="font-weight: normal; margin-right: .3em; font-size: 10px; text-transform: uppercase;">Faction:</span><span style="color: #3679B9;">Resistance</span><br><span style="font-weight: normal; margin-right: .3em; font-size: 10px; text-transform: uppercase;">Current Level:</span><span>L8</span></td>
			var agentSpan = $('td > span:contains("Agent Name:") + span', tr);
			if (parserDebug) { console.log([i, 'agent', agentSpan.length, $(tr).html()]); }
			agentName = checkAgentName(decodeHTMLEntities(agentSpan.html()));
			agentFaction = checkAgentFaction(spanToFaction(agentSpan));
			agentLevel = checkAgentLevel(decodeHTMLEntities($('td > span:contains("Level:") + span', tr).html()));
			r['agentName'] = agentName;
			r['agentFaction'] = agentFaction;
			r['agentLevel'] = agentLevel;
			return;
		} else {

			// <td style="font-size: 17px; padding-bottom: .2em; border-bottom: 2px solid #403F41;"><div>DAMAGE REPORT</div></td>
			// <td style="font-size: 17px;padding-bottom: .2em;border-bottom: 2px solid #403F41;text-transform: uppercase;"></td>
			var hr = $('td[style*="border-bottom: 2px solid #403F41;"]', tr);
			if (0 != hr.length) {
				if (parserDebug) { console.log([i, 'hr', hr.length, hr.html(), $(tr).html()]); }
				// do nothing
				return;
			}

			// <td style="padding-top: 1em; padding-bottom: 1em;"><div>portalNameX</div><div><a target="_blank" href="https://www.ingress.com/intel?ll=35.000000,139.000000&amp;pll=35.000000,139.000000&amp;z=19" style="color: #D73B8E; border: none; text-decoration: none;">portalAddressX</a></div></td>
			var portal = $('td > div:eq(1) > a[href^="https://www.ingress.com/intel?ll="]', tr);
			if (0 != portal.length) {
				if (parserDebug) { console.log([i, 'portal', portal.length, $(tr).html()]); }
				// r['portalAddress'] = portal.html();
				var intel_pat = /^https:\/\/www\.ingress\.com\/intel\?ll=[\-\.\d]+,[\-\.\d]+&pll=([\-\.\d]+?),([\-\.\d]+?)&z=\d+$/;
				var m = intel_pat.exec(portal.attr('href'));
				if (null != m) {
					r['latitude'] = checkLatLng(m[1]); r['longitude'] = checkLatLng(m[2]);
				} else {
					console.error({ func: 'parseBody', error: 'Unknown format (intel)', href: portal.attr('href'), i: i, tr: $(tr).html() });
				}
				r['portalName'] = checkPortalName(decodeHTMLEntities($('td > div:eq(0)', tr).html()));
				return;
			}

			// <td style="overflow: hidden;"><div style="width:1000px;"><div style="width: auto; height: 160px; float: left; display: inline-block;"><img src="http://example.com/portalimage" alt="Portal - portalNameX" height="160" style="display: block;border: 0;height: auto;line-height: 100%;outline: none;text-decoration: none;"></div><div style="width: auto; height: 160px; float: left; display: inline-block; overflow:hidden;"><img src="http://example.com/mapimage" alt="Map" width="700" height="160" style="display: block;border: 0;height: auto;line-height: 100%;outline: none;text-decoration: none;"></div><div style="clear:both;"></div></div><table cellpadding="0" cellspacing="0" border="0"></table></td>
			var image = $('td > div[style="width:1000px;"] > div[style*="height: 160px"] > img', tr);
			if (2 == image.length) {
				if (parserDebug) { console.log([i, 'image', image.length, $(tr).html()]); }
				var img_pat = /^https?:\/\//;
				var m = img_pat.exec($(image[0]).attr('no_load_src'));
				if (null != m) {
					r['portalImageUrl'] = checkPortalImageUrl($(image[0]).attr('no_load_src'));
					// r['mapImageUrl'] = $(image[1]).attr('no_load_src');
				} else {
					console.error({ func: 'parseBody', error: 'Unknown format (image url)', img: $(image[0]).attr('no_load_src'), i: i, tr: $(tr).html() });
				}
				return;
			}

			// <td style="overflow: hidden;"><div style="width:1000px;"><div style="width: auto; height: 100px; float: left; display: inline-block;"><img src="http://example.com/portalimage" alt="Portal - portalNameX" height="100" style="display: block;border: 0;height: auto;line-height: 100%;outline: none;text-decoration: none;"></div><div style="width: auto; height: 100px; float: left; display: inline-block; overflow:hidden;"><img src="http://example.com/mapimage" alt="Map" width="650" height="100" style="display: block;border: 0;height: auto;line-height: 100%;outline: none;text-decoration: none;"></div><div style="clear:both;"></div></div><table cellpadding="0" cellspacing="0" border="0" width="700px"><tbody><tr><td width="50px" style="line-height: 0; vertical-align: top;"><img src="http://commondatastorage.googleapis.com/ingressemail/damagereport/line_3.png" width="50" height="22"></td></tr></tbody></table></td>
			var linkedImage = $('td > div[style="width:1000px;"] > div[style*="height: 100px"] > img', tr);
			if (2 == linkedImage.length) {
				// TODO: do something
				if (parserDebug) { console.log([i, 'linkedImage', linkedImage.length, $(tr).html()]); }
				return;
			}

			// <td><table cellpadding="0" cellspacing="0" border="0" width="700px"><tbody><tr><td width="50px" style="line-height: 0;"><img src="http://commondatastorage.googleapis.com/ingressemail/damagereport/line_1.png" width="50" height="26"></td><td>LINK DESTROYED</td></tr></tbody></table></td>
			// <td><table cellpadding="0" cellspacing="0" border="0" width="700px"><tbody><tr><td width="50px" style="line-height: 0;"><img src="http://commondatastorage.googleapis.com/ingressemail/damagereport/line_1.png" width="50" height="26"></td><td>LINKS DESTROYED</td></tr></tbody></table></td>
			var linkDestroyed = $('td > table[width="700px"] > tbody > tr > td[width="50px"] + td:contains(" DESTROYED")', tr); // LINK or LINKS
			if (0 != linkDestroyed.length) {
				// TODO: do something
				if (parserDebug) { console.log([i, 'linkDestroyed', linkDestroyed.length, linkDestroyed.html(), $(tr).html()]); }
				return;
			}

			// <td><table cellpadding="0" cellspacing="0" border="0" width="700px"><tbody><tr><td width="50px" style="line-height: 0;"><img src="http://commondatastorage.googleapis.com/ingressemail/damagereport/line_1.png" width="50" height="26"></td><td>portalNameX: <a target="_blank" href="https://www.ingress.com/intel?ll=35.000000,139.000000&amp;pll=35.000000,139.000000&amp;z=19" style="color: #D73B8E; border: none; text-decoration: none;">portalAddressX</a></td></tr></tbody></table></td>
			var linkedPortal = $('td > table[width="700px"] > tbody > tr > td[width="50px"] + td > a[href^="https://www.ingress.com/intel?ll="]', tr);
			if (0 != linkedPortal.length) {
				// TODO: do something
				if (parserDebug) { console.log([i, 'linkedPortal', linkedPortal.length, linkedPortal.html(), $(tr).html()]); }
				return;
			}

			// <td style="padding: 1em 0;"><table cellpadding="0" cellspacing="0" border="0" width="700px"><tbody><tr><td width="400px"><div>DAMAGE:<br>1 Resonator destroyed by <span style="color: #428F43;">enemyNameX</span> at 02:22 hrs GMT<br>No remaining Resonators detected on this Portal.</div></td><td><div>STATUS:<br>Level 1<br>Health: 0%<br>Owner: [uncaptured]</div></td></tr></tbody></table></td>
			var damage = $('td > table[width="700px"] > tbody > tr > td[width="400px"] > div:contains("DAMAGE:")', tr);
			if (0 != damage.length) {
				if (parserDebug) { console.log([i, 'damage', damage.length, $(tr).html()]); }

				// DAMAGE:<br>1 Resonator destroyed by <span style="color: #428F43;">enemyNameX</span> at 02:22 hrs GMT<br>No remaining Resonators detected on this Portal.
				var dmg_pat = /^(.*) destroyed by (.*) at (.*)$/;
				var targets = []; var enemies = []; var dates = [];
				damage.html().split('<br>').forEach(function(line){
					var m = dmg_pat.exec(line);
					if (null != m) {
						targets.push(m[1]);
						var enemySpan = $(parseHTML(m[2]));
						enemies.push([enemySpan.html(), spanToFaction(enemySpan)]);
						dates.push(m[3]);
					} else {
						// TODO: handle other format
						// DAMAGE:
						// No remaining Resonators detected on this Portal.
						// ...
					}
				});
				r['enemyName'] = checkAgentName(enemies[0][0]); // FIXME: first only??
				r['enemyFaction'] = checkAgentFaction(enemies[0][1]); // FIXME: first only??

				// STATUS:<br>Level 1<br>Health: 0%<br>Owner: [uncaptured]
				var status = $('td > table[width="700px"] > tbody > tr > td > div:contains("STATUS:")', tr);
				var status_pat = /^STATUS:<br>Level (.*)<br>Health: (.*)<br>Owner: (.*)$/;
				var m = status_pat.exec(status.html());
				if (null != m) {
					var ownerSpan = $(parseHTML(m[3]));
					r['ownerName'] = checkAgentName(ownerSpan.html() ? ownerSpan.html() : ownerSpan.text());
					r['ownerFaction'] = checkAgentFaction(spanToFaction(ownerSpan));
				} else {
					console.error({ func: 'parseBody', error: 'Unknown format (status)', status: status.html(), i: i, tr: $(tr).html() });
				}

				if (r['agentName'] && r['agentFaction'] && r['agentLevel'] && r['latitude'] && r['longitude'] && r['portalName'] && r['portalImageUrl'] && r['enemyName'] && r['enemyFaction'] && r['ownerName'] && r['ownerFaction'] != undefined) {
					result.push(r);
				} else {
					console.error({ func: 'parseBody', error: 'Invalid value', r: r });
				}
				r = {};
				r['agentName'] = agentName;
				r['agentFaction'] = agentFaction;
				r['agentLevel'] = agentLevel;
				return;
			}

			console.error({ func: 'parseBody', error: 'Unknown format (tr)', i: i, tr: $(tr).html() });
		}
	});

	if (parserDebug) { console.log(['parseBody', result.length, result]); }
	return result;
}

function parseHTML(html) {
	// http://stackoverflow.com/questions/15150264/jquery-how-to-stop-auto-load-imges-when-parsehtml
	// replace <img src="..."> to <img no_load_src="..."> to stop auto load image 
	html = html.replace(/<img [^>]*src=['"]([^'"]+)[^>]*>/gi, function(match, capture) { return '<img no_load_src="' + capture + '" />'; }); // ignore other attributes
	return $.parseHTML(html);
}

function checkAgentName(agentName) {
	if ('[uncaptured]' == agentName || agentName.match(/^[\w\d_]+$/)) {
		return agentName;
	} else {
		console.error({ func: 'checkAgentName', error: 'Unknown format (agent name)', agentName: agentName });
		return '__UNKNOWN__';
	}
}

function checkAgentFaction(agentFaction) {
	if (['RES', 'ENL', ''].some(function(item) { return item == agentFaction; })) {
		return agentFaction;
	} else {
		console.error({ func: 'checkAgentFaction', error: 'Unknown format (agent faction)', agentFaction: agentFaction });
		return '__UNKNOWN__';
	}
}

function checkAgentLevel(agentLevel) {
	if (agentLevel.match(/^L\d+$/)) {
		return agentLevel;
	} else {
		console.error({ func: 'checkAgentLevel', error: 'Unknown format (agent level)', agentLevel: agentLevel });
		return '__UNKNOWN__';
	}
}

function checkLatLng(latlng) {
	if (latlng.match(/^[\-\.\d]+$/)) {
		return latlng;
	} else {
		console.error({ func: 'checkLatLng', error: 'Unknown format (latlng)', latlng: latlng });
		return '__UNKNOWN__';
	}
}

function checkPortalName(portalName) {
	if (portalName.match(/(<script)|(<img)|(<a )|(javascript:)|(http:)|(https:)/ig)) { // TODO: need more check?
		console.error({ func: 'checkPortalName', error: 'Unknown format (portal name)', portalName: portalName });
		return '__UNKNOWN__';
	} else {
		return portalName;
	}
}

function checkPortalImageUrl(portaImageUrl) {
	// http://lh3.ggpht.com/TnshEYjvqAJfcdlAOmUxmdL5mwElFM2siysybBgmYKKrkJvjznPrqLHN4lgXQ8NonzaM1yNJYW3DvioYyaMU
	// http://www.panoramio.com/photos/small/16316863.jpg
	if (portaImageUrl.match(/^http:\/\/lh\d+\.ggpht\.com\/[\w\d\-\_]+$/)) {
		return portaImageUrl;
	} else if (portaImageUrl.match(/^http:\/\/www\.panoramio\.com\/photos\/small\/[\d]+\.jpg$/)) {
		return portaImageUrl;
	} else {
		console.error({ func: 'checkPortalImageUrl', error: 'Unknown format (portal image url)', portalImageUrl: portaImageUrl });
		// return '__UNKNOWN__';
		return portaImageUrl;
	}
}

function toWeekDay(day) {
	var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return days[day];
}

function colorToFaction(color) {
	if ('#3679B9;' == color) {
		return 'RES';
	} else if ('#428F43;' == color) {
		return 'ENL';
	} else {
		return '';
	}
}

function spanToFaction(span) {
	var style = span.attr('style');
	return style ? colorToFaction(style.substring('color: '.length)) : '';
}

///
/// MapReduce
///
function mapReduce(array, mapFunc, reduceFunc) {
	return shuffle(array.map(mapFunc)).map(function(kv) { return reduceFunc(kv[0], kv[1]); });
}

function shuffle(kvArray) {
	// var kvs = kvArray.concat(); // copy array
	var kvs = kvArray; // destroy arg!!!
	kvs.sort(function(a, b) { return a[0] == b[0] ? 0 : (a[0] < b[0] ? -1 : 1); }); // sort by key
	var result = [];
	var key = undefined; // previous key
	for (var i in kvs) {
		var k = kvs[i][0];
		var v = kvs[i][1];
		if (0 != i && isEqualKey(key, k)) {
			result[result.length - 1][1].push(v);
		} else {
			result.push([k, [v]]);
		}
		key = k;
	}
	return result;
}

function isEqualKey(a, b) {
	return a == b ? true : ('function' === typeof a.toString && 'function' === typeof b.toString && a.toString() == b.toString());
}

function freq(seq) {
	return mapReduce(seq, function(item) {
		return [item, 1];
	}, function (k, v) {
		return [k, v.reduce(function(a, b) { return a + b; })];
	});
}

function mergeFreqArray(main, sub) {
	return main.map(function(m) { return m.concat([sub.filter(function(s) { return s[0] == m[0]; })[0][1]]); });
}

function sortByValue(seq) {
	// return seq.concat().sort(function(a, b) { return b[1] == a[1] ? (b[0] > a[0] ? -1 : 1) : b[1] - a[1]; }); // copy version
	return seq.sort(function(a, b) { return b[1] == a[1] ? (b[0] > a[0] ? -1 : 1) : b[1] - a[1]; }); // destroy arg!!!
}

///
/// utility
///
function moveToCurrentPosition() {
	// https://developer.mozilla.org/ja/docs/Web/API/Geolocation.getCurrentPosition
	navigator.geolocation.getCurrentPosition(function(pos) {
		googleMap.setCenter({lat: pos.coords.latitude, lng: pos.coords.longitude });
		googleMap.setZoom(15);
	}, function(e) {
		console.error({ func: 'moveToCurrentPosition', error: 'failed to move to curernt position', e: e });
	}, { enableHighAccuracy: true });
}

function disablePOIInfoWindow() {
	// remove popup bubbles of POI
	// http://stackoverflow.com/questions/7950030/can-i-remove-just-the-popup-bubbles-of-pois-in-google-maps-api-v3/19710396#19710396
	var set = google.maps.InfoWindow.prototype.set;
	google.maps.InfoWindow.prototype.set = function(key, val) {
		if ('map' === key) {
			if (!this.get('noSupress')) {
				// console.warn('This InfoWindow is supressed. To enable it, set "noSupress" option to true');
				return;
			}
		}
		set.apply(this, arguments);
	}
}

function closeInfoWindow() {
	if (openedInfoWindow) { // !!! global
		openedInfoWindow.close();
		openedInfoWindow = null;
	}
}

function decodeHTMLEntities(str) {
	// http://stackoverflow.com/questions/5796718/html-entity-decode
	// FIXME: textarea is XSS safe or not?
	return $('<textarea />').html(str).text();
}

function anonymize(str) {
	var n = 1;
	// return n >= str.length ? str + '*' : str.slice(0, n) + range(0, str.length - n).map(function(i) { return '*'; }).join('');
	return (n >= str.length ? str : str.slice(0, n)) + '*';
}

function range(start, end) {
	var result = [];
	for (var i = start; i < end; i++) {
		result.push(i);
	}
	return result;
}

function b64_to_utf8(str) {
	// https://developer.mozilla.org/ja/docs/Web/API/window.btoa
	return decodeURIComponent(escape(window.atob(str)));
}

function urlsafe_b64_to_utf8(str) {
	// https://gist.github.com/jhurliman/1250118
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) {
		str += '=';
	}
	return b64_to_utf8(str);
}
