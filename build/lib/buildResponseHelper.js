
var fs = require('fs'),
	path = require('path'),
	glob = require('glob');

var StartState = 0;
var BundleRead = 1;
var ReadingFiles = 2;

exports.parse = function (content) {

	var state = StartState,
		lines = content.split(/\r\n|\n/),
		bundledModules = {},
		cssModules = {},
		toDelete = {};

	lines.forEach(function (line) {
		line = line.trim();
		switch (state) {
			case StartState:
				if (line.length > 0) {
					if (/.*\.js$/.test(line)) {
						bundledModules[line] = true;
						cssModules[(line.substring(0, line.length - 2) + 'css').toLowerCase()] = true;
					}
					state = BundleRead;
				}
				break;
			case BundleRead:
				if ('----------------' === line) {
					state = ReadingFiles;
				}
				break;
			case ReadingFiles:
				if (line.length === 0) {
					state = StartState;
				} else {
					if (!bundledModules[line]) {
						toDelete[line] = true;
					}
				}
				break;
		}
	});

	return {
		bundledModules: bundledModules,
		cssModules: cssModules,
		toDelete: toDelete
	};
};

//exports.cleanEmptyFolders = function (location) {
//	glob.sync('**/*', {
//		cwd: location
//	}).sort(function (a, b) {
//		if (a === b) {
//			return 0;
//		}
//		if (a > b) {
//			return -1;
//		}
//		return 1;
//	}).forEach(function (file) {
//		
//	});
//	
//	console.log(all);
//	
//}