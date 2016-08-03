/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
var https = require('https');
var fs = require('fs');
var url = require('url');

function getOptions(urlString) {
	var _url = url.parse(urlString);
	return {
		protocol: _url.protocol,
		host: _url.host,
		port: _url.port,
		path: _url.path,
		headers: {
			'User-Agent': 'NodeJS'
		}
	}
}

exports.toFile = function (url, dest) {
  return new Promise((c, e) => {
		var file = fs.createWriteStream(dest);
		var request = https.get(getOptions(url), function (response) {
			response.pipe(file);
			file.on('finish', function () {
				var cb = (err, result) => err ? e(err) : c(result);
				file.close(cb);
			});
		}).on('error', function (err) { // Handle errors
			fs.unlink(dest); // Delete the file async, don't check the result
			e(err.message);
		});
  });
};

exports.toString = function(url) {
  return new Promise((c, e) => {
	  var content = '';
		var request = https.get(getOptions(url), function (response) {
			response.on('data', function (data) {
				content += data.toString();
			}).on('end', function () {
				c(content);
			});
		}).on('error', function (err) {
			e(err.message);
		});
  });
}