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


///
/// global variable
///
var googleMap = null;
var markers = [];
var infoWindows = [];
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
	}, function(error) {
		console.error({ func: 'navigator.geolocation.getCurrentPosition', error: error });
	}, { enableHighAccuracy: true });
}

function handleAuthResult(authResult) {
    if (authResult && !authResult.error) {
    	$('#content').off('click');
        gmailList('', maxLoop, [], function(ids) {
        	showMessage('Loading mail ID from Gmail... (' + (maxLoop * maxResults - ids.length) + ')');
        }, function(ids) {
        	var newIds = ids.filter(function(id) { return !isExistReport(id); }).reverse(); // sort by time (older first)
        	if (!newIds || 0 == newIds.length) {
        	   	showStatus();
        	} else {
        		gmailGet(newIds, handleGmailResult, function(ids, response) {
        			clearAllPortals();
        			showAllPortals();
        		   	showStatus();
        		});
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
	showMessage('Parsing mail... (' + ids.length + ')');
	ids.forEach(function(id) {
		try {
			// FIXME: error handling if headers missing
			var header = response.result[id].result['payload']['headers'];
			var body = response.result[id].result['payload']['parts'][1]['body']['data'];
			var report = parseMail(id, header, urlsafe_b64_to_utf8(body));
			if (null == report) {
				console.error({ func: 'handleGmailResult', error: 'failed to parse mail', id: id, result: response.result[id].result });
			} else {
				saveReport(report);
			}
		} catch (e) {
			console.error({ func: 'handleGmailResult', error: e, id: id, result: response.result[id].result });
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
 		response.result.messages.forEach(function(mesg) {
 			ids.push(mesg['id']);
 		});
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
   	showMessage('Ingress Damage Reports Map (Reports: ' + reportsLength() + ', Portals: ' + markers.length + ')');
}


function showPortal(portal) {
	var name = portal[0][0]
	var lat = portal[0][1];
	var lng = portal[0][2];
	var enemies = portal[1][0];
	var img = portal[1][1];
	var intel = portal[1][2];
	var owners = portal[1][3];
	var agent = portal[1][4];
	var faction = portal[1][5];
	var isUPC = owners.some(function(owner) { return agent == owner[0]; });
	var color = isUPC ? 'red' : ('RES' == faction ? '#3679B9' : '#428F43');
	var titleText = decodeHTMLEntities(name) + (isUPC ? ' (UPC)' : '');
	var enemyTable = '<p><table><thead><tr><td>Agent</td><td>Reports</a></thead><tbody><tr><td>' + enemies.map(function(item) { return item.join('</td><td>'); }).join('</td></tr><tr><td>') + '</td></tr></tbody></table></p>';
	var content = $('<div />').append($('<h3 />').html(name)).append($('<a />').attr('href', intel).attr('target', '_blank').append($('<img />').attr({ 'src': img, 'style': 'max-height: 120px; max-width: 120px' }))).append($('<div />').html(enemyTable)).append($('<div />').html(isUPC ? 'UPC' : ''));
	var iconOpt = { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: color, fillOpacity: 0.4, strokeColor: color, strokeWeight: 2 };
	// var iconOpt = 'http://commondatastorage.googleapis.com/ingress.com/img/map_icons/marker_images/hum_8res.png';
	var marker = new google.maps.Marker({ position: new google.maps.LatLng(lat, lng), map: googleMap, title: titleText, icon: iconOpt });
	markers.push(marker); // global!!!
	var infoWindow = new google.maps.InfoWindow({ content: content.html(), noSupress: true, maxWidth: 160 });
	infoWindows.push(infoWindow); // global!!!
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
    'localDateString', 'localYear', 'localMonth', 'localDate', 'localHours', 'localMinutes', 'localSeconds', 'localDay', 'localDayString',
    'agentName', 'agentFaction', 'agentLevel',
    'portalName', 'intelUrl', 'portalImageUrl',
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
		return [[report['portalName'], report['latitude'], report['longitude']], [report['enemyName'], report['portalImageUrl'], report['intelUrl'], report['ownerName'], report['agentName'], report['agentFaction']]];
	}, function(k, v) {
		var enemies = v.map(function(item) { return item[0]; });
		var imgs = v.map(function(item) { return item[1]; });
		var intels = v.map(function(item) { return item[2]; });
		var owners = v.map(function(item) { return item[3]; });
		var agents = v.map(function(item) { return item[4]; });
		var factions = v.map(function(item) { return item[5]; });
		return [k, [sortByValue(freq(enemies)), sortByValue(freq(imgs))[0][0], sortByValue(freq(intels))[0][0], sortByValue(freq(owners)), sortByValue(freq(agents))[0][0], sortByValue(freq(factions))[0][0]]];
	});
}

function showMessage(mesg) {
	console.log(mesg);
	$('#content').html(mesg + '<br />');
}

///
/// mail parser
///
// FIXME: refine RE or DOM based
var ag_pat = /<tr><td.*><span.*>Agent Name:<\/span>(.*?)<br \/><span.*>Faction:<\/span><span.*>(.*?)<\/span><br \/><span.*>Current Level:<\/span><span>(.*?)<\/span><\/td><\/tr>/;
var dmgrep_pat = /<tr><td.*><div>DAMAGE REPORT<\/div><\/td><\/tr><tr><td .*?><div>(.*?)<\/div><div><a target="_blank" href="(.*?)" .*?>(.*?)<\/a><\/div><\/td><\/tr><tr><td .*?><table .*?><div .*?><div .*?><img src="(.*?)" .*?><\/div><div .*?><img src="(.*?)" .*?><\/div><div .*?><\/div><\/table><\/td><\/tr>/;
var dmg_pat = /<td.*><div>DAMAGE:<br>(.*?)<\/div><\/td><td><div>STATUS:<br>(.*?)<br>Health: (.*?)<br>Owner: (.*?)<\/div><\/td>/;
var dmg_line_pat = /^(.*?) destroyed by (.*?) at (.*?)$/;
var name_pat = /^<span style="color: (.*?)">(.*?)<\/span>$/;
var intel_pat = /^http.*&pll=([\d\+.]+?),([\d\+.]+?)&z=\d+$/;

function parseMail(id, header, body) {
	var head = parseHeader(header);
	var body = parseBody(body);
	if (null != head && null != body) {
		var local = new Date(head['Date']);
		// var result = { gmailId: id, utcDateString: head['Date'], from: head['From'], to: head['To'] , localDateString: local.toString(), localYear: local.getFullYear(), localMonth: local.getMonth() + 1, localDate: local.getDate(), localHours: local.getHours(), localMinutes: local.getMinutes(), localSeconds: local.getSeconds(), localDay: local.getDay(), localDayString: toWeekDay(local.getDay()) };
		var result = { gmailId: id, localDateString: local.toString(), localYear: local.getFullYear(), localMonth: local.getMonth() + 1, localDate: local.getDate(), localHours: local.getHours(), localMinutes: local.getMinutes(), localSeconds: local.getSeconds(), localDay: local.getDay(), localDayString: toWeekDay(local.getDay()) };
		result = $.extend(result, body);
		return result;
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

function parseName(name) {
	var m = name_pat.exec(name);
	return null != m ? [m[2], colorToFaction(m[1])] : [name, ''];
}

function parseDamageLine(lines) {
	var targets = [];
	var enemies = [];
	var dates = [];
	var l = lines.split('<br>');
	for (var i in l) {
		var line = l[i]; 
		m = dmg_line_pat.exec(line)
		if (null != m) {
			targets.push(m[1]);
			enemies.push(parseName(m[2]));
			dates.push(m[3]);
	    } else {
	    	// unknown format
	    }
	}
	return [targets, enemies, dates];
}

function parseBody(body) {
	// console.log(body);
	var result = {};

	var m = ag_pat.exec(body);
	if (null == m) return null;
	var agent = parseName(m[1]);
	result['agentName'] = agent[0]; result['agentFaction'] = agent[1]; result['agentLevel'] = m[3]; // result['agentFactionName'] = m[2]; 

	var m = dmgrep_pat.exec(body);
	if (null == m) return null;
	result['portalName'] = m[1]; result['intelUrl'] = m[2]; result['portalImageUrl'] = m[4]; // result['portalAddress'] = m[3]; result['portalMapUrl'] = m[5];

	var m = intel_pat.exec(result['intelUrl']);
	if (null == m) return null;
	result['latitude'] = m[1]; result['longitude'] = m[2];

	var m = dmg_pat.exec(body);
	if (null == m) return null;
	var owner = parseName(m[4]);
	result['ownerName'] = owner[0]; result['ownerFaction'] = owner[1]; // result['status'] = m[2]; result['health'] = m[3];
	var damageHtml = m[1]; 
	var dmg = parseDamageLine(damageHtml);
	// result['targetList'] = dmg[0]; result['enemyList'] = dmg[1]; result['damageDateList'] = dmg[2];
	result['enemyName'] = dmg[1][0][0]; result['enemyFaction'] = dmg[1][0][1]; // FIXME: first only??  

	//console.log(result);
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
				console.warn('This InfoWindow is supressed. To enable it, set "noSupress" option to true');
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
