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

	disablePOIInfoWindow();

	// clearReports();
	// printLocalStorage();

	var mapOpt = {
		center: { lat: 35.681382, lng: 139.766084 }, // Tokyo Station
		zoom: 10,
		mapTypeId: google.maps.MapTypeId.ROADMAP,
		panControl: false,
		zoomControl: true,
		zoomControlOptions: {
			style: google.maps.ZoomControlStyle.LARGE,
			position: google.maps.ControlPosition.RIGHT_CENTER
		},
		streetViewControl: true,
		streetViewControlOptions: {
			position: google.maps.ControlPosition.RIGHT_CENTER
		}
	};
	// http://stackoverflow.com/questions/8483023/uncaught-typeerror-cannot-set-property-position-of-undefined
	googleMap = new google.maps.Map($('#map_canvas')[0], mapOpt); // !!! global
	// http://googlemaps.googlermania.com/google_maps_api_v3/ja/map_example_singleInfoWindow.html
	google.maps.event.addListener(googleMap, 'click', function(event) { closeInfoWindow(); });

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

function moveToCurrentPosition() {
	// https://developer.mozilla.org/ja/docs/Web/API/Geolocation.getCurrentPosition
	navigator.geolocation.getCurrentPosition(function(pos) {
		googleMap.setCenter({lat: pos.coords.latitude, lng: pos.coords.longitude });
		googleMap.setZoom(15);
	}, function(e) {
		console.error({ func: 'moveToCurrentPosition', error: 'failed to move to curernt position', e: e });
	}, { enableHighAccuracy: true });
}

function handleAuthResult(authResult) {
    if (authResult && !authResult.error) {
    	$('#content').off('click');
        gmailList('', maxLoop, [], function(ids) {
        	showMessage('Loading mail ID from Gmail... (' + (maxLoop * maxResults - ids.length) + ')');
        }, function(ids) {
        	var newIds = ids.filter(function(id) { return !isExistReport(id + '_0'); }).reverse(); // sort by time (older first)
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
				var header = response.result[id].result['payload']['headers'];
				var body = response.result[id].result['payload']['parts'][1]['body']['data'];
				var reports = parseMail(id, header, urlsafe_b64_to_utf8(body));
				if (null == reports) {
					console.error({ func: 'handleGmailResult', error: 'failed to parse mail', id: id, result: response.result[id].result });
				} else {
					reports.forEach(function(report) {
						saveReport(report);
					});
				}
			} else {
				console.error({ func: 'handleGmailResult', error: 'failed to get message from Gmail', id: id, result: result });
			}
		} catch (e) {
			console.error({ func: 'handleGmailResult', error: e, id: id, result: result });
		}
	});
}

///
/// Gmail
///
function gmailList(pageToken, loop, ids, progressFunc, doneFunc) {
	if (0 >= loop || null == pageToken) {
		return doneFunc(ids);;
	}
 	gapi.client.gmail.users.messages.list({'userId': userId, 'maxResults': maxResults, 'q': q, 'pageToken': pageToken}).then(function(response) {
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
		batch.add(gapi.client.gmail.users.messages.get({ userId: userId, id: id }), { id: id });
	});
	showMessage('Loading mail body from Gmail... (' + ids.length + ')');
	batch.then(function(response) {
		progressFunc(head, response)
		gmailGet(rest, progressFunc, doneFunc); // recursive!!!
	}, function(response) {
		console.error({ func: 'gmailGet', error: response.result.error.message });
	}, this);
}

function showAllPortals() {
   	if (0 == reportsLength()) {
   		return;
   	}
	showMessage('Loading reports... (' + reportsLength() + ')');
   	var reports = loadAllReports();
   	showMessage('Analyzing reports... (' + reports.length + ')');
   	var portals = analyzeReports(reports);
   	showMessage('Showing portals... (' + portals.length + ')');
   	portals.forEach(showPortal);
   	// printLocalStorage();
}

function showStatus() {
   	showMessage('Ingress Damage Reports Map, Reports: ' + reportsLength() + ', Portals: ' + markers.length + ' (<span style="color: red">UPC: ' + upcCount + '</span>)');
}

function showPortal(portal) {
	var portalName = portal[0][0]
	var latitude = portal[0][1];
	var longitude = portal[0][2];
	var enemies = portal[1][0];
	var localHours = portal[1][1];
	var localDays = portal[1][2];
	var portalImageUrl = portal[1][3];
	var owners = portal[1][4];
	var agentName = portal[1][5];
	var agentFaction = portal[1][6];

	var intelUrl = 'https://www.ingress.com/intel?ll=' + latitude + ',' + longitude + '&pll=' + latitude + ',' + longitude + '&z=19';
	var isUPC = owners.some(function(owner) { return agentName == owner[0]; });
	var color = isUPC ? 'red' : ('RES' == agentFaction ? '#3679B9' : '#428F43');
	var titleText = decodeHTMLEntities(portalName) + (isUPC ? ' (UPC)' : '');
	var enemyTable = '<table><thead><tr><td>Agent</td><td>#</td></tr></thead><tbody><tr><td>' + enemies.map(function(item) { return item[0] + '</td><td class="td_number">' + item[1]; }).join('</td></tr><tr><td>') + '</td></tr></tbody></table>';
	var localHoursTable = '<table><thead><tr><td>Hour</td><td>#</td></tr></thead><tbody><tr><td class="td_number">' + localHours.sort(function(a, b) { return a[0] - b[0]; }).map(function(item) { return item.join('</td><td class="td_number">'); }).join('</td></tr><tr><td class="td_number">') + '</td></tr></tbody></table>';
	var localDaysTable = '<table><thead><tr><td>Day</td><td>#</td></tr></thead><tbody><tr><td>' + localDays.sort(function(a, b) { return a[0] - b[0]; }).map(function(item) { return toWeekDay(item[0]) + '</td><td class="td_number">' + item[1]; }).join('</td></tr><tr><td>') + '</td></tr></tbody></table>';
	var content = $('<div />').append($('<h3 />').html(portalName + (isUPC ? ' (<span style="color: red">UPC</span>)' : ''))).append($('<a />').addClass('portal_info').attr('href', intelUrl).attr('target', '_blank').append($('<img />').attr({ 'src': portalImageUrl }).addClass('portal_img'))).append($('<div />').addClass('portal_info').html(enemyTable)).append($('<div />').addClass('portal_info').html(localHoursTable)).append($('<div />').addClass('portal_info').html(localDaysTable));

	var iconOpt = { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: color, fillOpacity: 0.4, strokeColor: color, strokeWeight: 2 };
	// var iconOpt = 'http://commondatastorage.googleapis.com/ingress.com/img/map_icons/marker_images/hum_8res.png';
	var marker = new google.maps.Marker({ position: new google.maps.LatLng(latitude, longitude), map: googleMap, title: titleText, icon: iconOpt });
	markers.push(marker); // global!!!
	var infoWindow = new google.maps.InfoWindow({ content: content.html(), noSupress: true, maxWidth: 640 });
	infoWindows.push(infoWindow); // global!!!
	if (isUPC) upcCount++; // global!!!
	// https://developers.google.com/maps/documentation/javascript/examples/event-closure?hl=ja
	// http://stackoverflow.com/questions/8909652/adding-click-event-listeners-in-loop
	google.maps.event.addListener(marker, 'click', function(_marker, _infoWindow) { // closure
		return function(event) {
			closeInfoWindow();
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

///
/// reports
///
function reportsLength() {
	return localStorage.length;
}

function isValidReport(report) {
	return report && ('gmailId' in report) && ('string' === typeof report['gmailId']) && 0 < report['gmailId'].length; 
}

var REPORT_FIELDS = [
    'gmailId',
    'time', 'localYear', 'localMonth', 'localDate', 'localHours', 'localMinutes', 'localSeconds', 'localDay', 'localDayString',
    'agentName', 'agentFaction', 'agentLevel',
    'portalName', 'portalImageUrl',
    'latitude', 'longitude',
    'ownerName', 'ownerFaction',
    'enemyName', 'enemyFaction'
];

function compressReport(report) {
	if (null != report && REPORT_FIELDS.every(function(field) { return field in report; })) {
		var compressedReport =  REPORT_FIELDS.map(function(field) { return report[field]; });
		return compressedReport;
	} else {
		console.error({ func: 'compressReport', error: 'invalid value', report: report });
		return null;
	}
}

function uncompressReport(compressedReport) {
	if (REPORT_FIELDS.length == compressedReport.length) {
		var report = {};
		for (var i = 0; i < compressedReport.length; i++) {
			report[REPORT_FIELDS[i]] = compressedReport[i];
		}
		return report;
	} else {
		console.error({ func: 'uncompressReport', error: 'invalid value', compressedReport: compressedReport });
		return null;
	}
}


function saveReport(report) {
	if (!isValidReport(report)) {
		console.error({ func: 'saveReport', error: 'invalid value', report: report });
		return false;
	} else {
		//var dummy = ''; // dummy big data
		//for (var i = 0; i < 500 * 1024; i++) {
		//	dummy += 'x';
		//}
		//report['dummy'] = dummy;

		//var jsonString = JSON.stringify(report);
		var compressedReport = compressReport(report);
		var jsonString = JSON.stringify(compressedReport);
		try {
			localStorage.setItem(report['gmailId'], jsonString);
			return true;
		} catch (e) { // QUOTA_EXCEEDED_ERR
			// http://chrisberkhout.com/blog/localstorage-errors/
			console.error({ func: 'saveReport', error: 'failed to setItem (first)', e: e, gmailId: report['gmailId'], report: report });
			showMessage('Removing old reports... (' + maxResults + ')');
			removeOldReports(maxResults);
			try {
				localStorage.setItem(report['gmailId'], jsonString);
				return true;
			} catch (e) {
				console.error({ func: 'saveReport', error: 'failed to setItem (retry)', e: e, gmailId: report['gmailId'], report: report });
			}
			return false;
		}
	}
}

function removeOldReports(count) {
	count = count < localStorage.length ? count : localStorage.length;
	var keys = range(0, count).map(function(i) { return localStorage.key(i); });
	keys.forEach(function(k) {
		var v = localStorage.getItem(k);
		// console.log({ func: 'removeOldReports', k: k, v: (v ? v.length : v) });
		localStorage.removeItem(k);
	});
}

function loadReport(gmailId) {
	var jsonString = localStorage.getItem(gmailId);
	if (jsonString && ('string' === typeof jsonString)) {
		try {
			var compressedReport = JSON.parse(jsonString);
			return uncompressReport(compressedReport);
		} catch (e) {
			console.error({ func: 'loadReport', error: 'falied to parse JSON', gmailId: gmailId, jsonString: jsonString });
			return null;
		}
	} else {
		console.error({ func: 'loadReport', error: 'invalid value', gmailId: gmailId, jsonString: jsonString });
		return null;
	}
}

function isExistReport(gmailId) {
	var jsonString = localStorage.getItem(gmailId);
	return jsonString && ('string' === typeof jsonString); // FIXME: need more restrict check?
}

function loadAllReports() {
	var reports = [];
	for (var i = 0; i < reportsLength(); i++){
	// for (var i = reportsLength() - 1; i >= 0; i--){
		var id = localStorage.key(i);
		var report = loadReport(id);
		if (null != report) {
			reports.push(report);
		} else {
			localStorage.removeItem(id);
		}
	}
	return reports;
}

function clearReports() {
	localStorage.clear();
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

function analyzeReports(reports) {
	return mapReduce(reports, function(report) {
		return [[report['portalName'], report['latitude'], report['longitude']], [report['enemyName'], report['localHours'], report['localDay'], report['portalImageUrl'], report['ownerName'], report['agentName'], report['agentFaction']]];
	}, function(k, v) {
		var enemyNames = v.map(function(item) { return item[0]; });
		var localHours = v.map(function(item) { return item[1]; });
		var localDays = v.map(function(item) { return item[2]; });
		var portalImageUrls = v.map(function(item) { return item[3]; });
		var ownerNames = v.map(function(item) { return item[4]; });
		var agentNames = v.map(function(item) { return item[5]; });
		var agentFactions = v.map(function(item) { return item[6]; });
		return [k, [sortByValue(freq(enemyNames)), sortByValue(freq(localHours)), sortByValue(freq(localDays)), sortByValue(freq(portalImageUrls))[0][0], sortByValue(freq(ownerNames)), sortByValue(freq(agentNames))[0][0], sortByValue(freq(agentFactions))[0][0]]];
	});
}

function showMessage(mesg) {
	console.log(mesg);
	$('#content').html(mesg + '<br />');
}

///
/// mail parser
///
function parseMail(id, header, body) {
	var head = parseHeader(header);
	if (parserDebug) { console.log(['parseMail', head['Subject'], head['Date']]); }
	var bodies = parseBody(body);
	if (null != head && null != bodies && 0 != bodies.length) {
		var local = new Date(head['Date']);
		return bodies.map(function(b, i) {
			var result = { gmailId: id + '_' + i, time: local.getTime(), localYear: local.getFullYear(), localMonth: local.getMonth() + 1, localDate: local.getDate(), localHours: local.getHours(), localMinutes: local.getMinutes(), localSeconds: local.getSeconds(), localDay: local.getDay(), localDayString: toWeekDay(local.getDay()) };
			result = $.extend(result, b);
			return result;
		});
	} else {
		return null;
	}
}

function toWeekDay(day) {
	var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return days[day];
}

function colorToFaction(color) {
	if ('#428F43;' == color) {
		return 'ENL';
	} else if ('#3679B9;' == color) {
	    return 'RES';
	} else {
		return '';
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

function spanToFaction(span) {
	var style = span.attr('style');
	return style ? colorToFaction(style.substring('color: '.length)) : '';
}

function parseBody(body) {
	var result = [];
	var r = {};
	var agentName = '';
	var agentFaction = '';
	var agentLevel = '';

	// http://stackoverflow.com/questions/15150264/jquery-how-to-stop-auto-load-imges-when-parsehtml
	// replace <img src="..."> to <img no_load_src="..."> to stop auto load image 
	body = body.replace(/<img [^>]*src=['"]([^'"]+)[^>]*>/gi, function(match, capture) { return '<img no_load_src="' + capture + '" />';})
	var div = $.parseHTML(body);
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
			agentName = agentSpan.html();
			agentFaction = spanToFaction(agentSpan);
			agentLevel = $('td > span:contains("Level:") + span', tr).html();
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
				var intel_pat = /^http.*&pll=(.+?),(.+?)&z=\d+$/;
				var m = intel_pat.exec(portal.attr('href'));
				if (null != m) {
					r['latitude'] = m[1]; r['longitude'] = m[2];
				} else {
					console.error({ func: 'parseBodyByDOM', error: 'Unknown format (intel)', href: portal.attr('href'), i: i, tr: $(tr).html() });
				}
				r['portalName'] = $('td > div:eq(0)', tr).html();
				return;
			}

			// <td style="overflow: hidden;"><div style="width:1000px;"><div style="width: auto; height: 160px; float: left; display: inline-block;"><img src="http://example.com/portalimage" alt="Portal - portalNameX" height="160" style="display: block;border: 0;height: auto;line-height: 100%;outline: none;text-decoration: none;"></div><div style="width: auto; height: 160px; float: left; display: inline-block; overflow:hidden;"><img src="http://example.com/mapimage" alt="Map" width="700" height="160" style="display: block;border: 0;height: auto;line-height: 100%;outline: none;text-decoration: none;"></div><div style="clear:both;"></div></div><table cellpadding="0" cellspacing="0" border="0"></table></td>
			var image = $('td > div[style="width:1000px;"] > div[style*="height: 160px"] > img', tr);
			if (2 == image.length) {
				if (parserDebug) { console.log([i, 'image', image.length, $(tr).html()]); }
				// r['portalImageUrl'] = $(image[0]).attr('src');
				r['portalImageUrl'] = $(image[0]).attr('no_load_src');
				// r['mapImageUrl'] = $(image[1]).attr('src');
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
						var enemySpan = $($.parseHTML(m[2]));
						enemies.push([enemySpan.html(), spanToFaction(enemySpan)]);
						dates.push(m[3]);
					} else {
						// TODO: handle other format
						// DAMAGE:
						// No remaining Resonators detected on this Portal.
						// ...
					}
				});
				r['enemyName'] = enemies[0][0]; // FIXME: first only??
				r['enemyFaction'] = enemies[0][1]; // FIXME: first only??

				// STATUS:<br>Level 1<br>Health: 0%<br>Owner: [uncaptured]
				var status = $('td > table[width="700px"] > tbody > tr > td > div:contains("STATUS:")', tr);
				var status_pat = /^STATUS:<br>Level (.*)<br>Health: (.*)<br>Owner: (.*)$/;
				var m = status_pat.exec(status.html());
				if (null != m) {
					var ownerSpan = $($.parseHTML(m[3]));
					r['ownerName'] = ownerSpan.html() ? ownerSpan.html() : ownerSpan.text();
					r['ownerFaction'] = spanToFaction(ownerSpan);
				} else {
					console.error({ func: 'parseBodyByDOM', error: 'Unknown format (status)', status: status.html(), i: i, tr: $(tr).html() });
				}

				result.push(r);
				r = {};
				r['agentName'] = agentName;
				r['agentFaction'] = agentFaction;
				r['agentLevel'] = agentLevel;
				return;
			}

			console.error({ func: 'parseBodyByDOM', error: 'Unknown format (tr)', i: i, tr: $(tr).html() });
		}
	});

	if (parserDebug) { console.log(['parseBodyByDOM', result.length, result]); }
	return result;
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

function sortByValue(seq) {
	// return seq.concat().sort(function(a, b) { return b[1] == a[1] ? (b[0] > a[0] ? -1 : 1) : b[1] - a[1]; }); // copy version
	return seq.sort(function(a, b) { return b[1] == a[1] ? (b[0] > a[0] ? -1 : 1) : b[1] - a[1]; }); // destroy arg!!!
}

///
/// utility
///
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

function urlsafe_b64_to_utf8(str) {
	// https://gist.github.com/jhurliman/1250118
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) {
		str += '=';
	}
	return b64_to_utf8(str);
}

function b64_to_utf8(str) {
	// https://developer.mozilla.org/ja/docs/Web/API/window.btoa
	return decodeURIComponent(escape(window.atob(str)));
}

function decodeHTMLEntities(str) {
	// http://stackoverflow.com/questions/5796718/html-entity-decode
	// FIXME: textarea is XSS safe or not?
	return $('<textarea />').html(str).text();
}

function range(start, end) {
	var result = [];
	for (var i = start; i < end; i++) {
		result.push(i);
	}
	return result;
}
