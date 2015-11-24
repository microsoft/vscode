var es = require('event-stream');
var fs = require('fs');
var path = require('path');

var copyright = [
	'/*---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Microsoft Corporation. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------*/'
].join('\n');


exports.copyrights = function () {
	return es.mapSync(function (file) {
		if (file.contents) {
			var contents = file.contents.toString('utf8');

			if (contents.indexOf(copyright) !== 0) {
				throw new Error('File ' + file.path + ' does not contain copyright statement.');
			}
		}
	});
};

exports.insertCopyrights = function() {
	return es.mapSync(function (file) {
		if (file.contents) {
			var contents = file.contents.toString('utf8');

			if (contents.indexOf(copyright) !== 0) {
				contents = copyright + '\n\n' + contents;
				fs.writeFileSync(file.path, contents, 'utf8');
			}
		}
	});
}
