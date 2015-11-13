var es = require('event-stream');
var fs = require('fs');
var path = require('path');

var copyright = [
	'/*---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Microsoft Corporation. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------*/'
].join('\n');

var ignoreList = [
	'/src/vs/languages/typescript/common/lib/lib.d.ts',
	'/src/vs/languages/typescript/common/lib/lib.es6.d.ts',
	'/src/vs/languages/typescript/common/lib/typescriptServices.d.ts',
	'/src/vs/workbench/parts/emmet/node/emmet.d.ts',
	'/src/vs/editor/standalone-languages/swift.ts',
	'/src/vs/workbench/browser/media/octicons/octicons.css',
	'/src/vs/base/test/node/encoding/fixtures/some_utf16be.css',
	'/src/vs/base/test/node/encoding/fixtures/some_utf16le.css',
	'/src/vs/workbench/services/search/test/node/fixtures/site.css',
	'/src/vs/workbench/services/search/test/node/fixtures/some_utf16be.css',
	'/src/vs/workbench/services/search/test/node/fixtures/some_utf16le.css',
	'/src/vs/workbench/services/files/test/node/fixtures/service/some_utf16le.css',
	'/extensions/lib.core.d.ts',
	'/extensions/node.d.ts',
	'/extensions/csharp-o/src/typings/applicationinsights.d.ts',
	'/extensions/typescript/out/lib/lib.core.d.ts',
	'/extensions/typescript/out/lib/lib.core.es6.d.ts',
	'/extensions/typescript/out/lib/lib.d.ts',
	'/extensions/typescript/out/lib/lib.dom.d.ts',
	'/extensions/typescript/out/lib/lib.es6.d.ts',
	'/extensions/typescript/out/lib/lib.scriptHost.d.ts',
	'/extensions/typescript/out/lib/lib.webworker.d.ts',
	'/extensions/typescript/src/lib/lib.core.d.ts',
	'/extensions/typescript/src/lib/lib.core.es6.d.ts',
	'/extensions/typescript/src/lib/lib.d.ts',
	'/extensions/typescript/src/lib/lib.dom.d.ts',
	'/extensions/typescript/src/lib/lib.es6.d.ts',
	'/extensions/typescript/src/lib/lib.scriptHost.d.ts',
	'/extensions/typescript/src/lib/lib.webworker.d.ts',
	'/extensions/csharp-o/src/typings/semver/semver.d.ts'
];

function ignore(filePath) {
	filePath = path.posix.normalize(filePath);

	return ignoreList.some(function(p) {
		return filePath.indexOf(p) !== -1;
	});
}

exports.copyrights = function () {
	return es.mapSync(function (file) {
		if (file.contents) {
			var contents = file.contents.toString('utf8');

			if (contents.indexOf(copyright) !== 0 && !ignore(file.path)) {
				throw new Error('File ' + file.path + ' does not contain copyright statement.');
			}
		}
	});
};

exports.insertCopyrights = function() {
	return es.mapSync(function (file) {
		if (file.contents) {
			var contents = file.contents.toString('utf8');

			if (contents.indexOf(copyright) !== 0 && !ignore(file.path)) {
				contents = copyright + '\n\n' + contents;
				fs.writeFileSync(file.path, contents, 'utf8');
			}
		}
	});
}
