/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

var path = require('path');
var fs = require('fs');
var https = require('https');
var url = require('url');

function getCommitSha(repoId, repoPath) {
	var commitInfo = 'https://api.github.com/repos/' + repoId + '/commits?path=' + repoPath;
	return download(commitInfo).then(function (content) {
		try {
			let lastCommit = JSON.parse(content)[0];
			return Promise.resolve({
				commitSha: lastCommit.sha,
				commitDate: lastCommit.commit.author.date
			});
		} catch (e) {
			return Promise.resolve(null);
		}
	}, function () {
		console.err('Failed loading ' + commitInfo);
		return Promise.resolve(null);
	});
}

function download(source) {
	if (source.startsWith('.')) {
		return readFile(source);
	}
	return new Promise((c, e) => {
		var _url = url.parse(source);
		var options = { host: _url.host, port: _url.port, path: _url.path, headers: { 'User-Agent': 'NodeJS' }};
		var content = '';
		https.get(options, function (response) {
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

function readFile(fileName) {
	return new Promise((c, e) => {
		fs.readFile(fileName, function(err, data) {
			if (err) {
				e(err);
			} else {
				c(data.toString());
			}
		});
	});
}

function downloadBinary(source, dest) {
	if (source.startsWith('.')) {
		return copyFile(source, dest);
	}

	return new Promise((c, e) => {
		https.get(source, function (response) {
			switch(response.statusCode) {
				case 200:
					var file = fs.createWriteStream(dest);
					response.on('data', function(chunk){
						file.write(chunk);
					}).on('end', function(){
						file.end();
						c(null);
					}).on('error', function (err) {
						fs.unlink(dest);
						e(err.message);
					});
					break;
				case 301:
				case 302:
				case 303:
				case 307:
					console.log('redirect to ' + response.headers.location);
					downloadBinary(response.headers.location, dest).then(c, e);
					break;
				default:
					e(new Error('Server responded with status code ' + response.statusCode));
			}
		});
	});
}

function copyFile(fileName, dest) {
	return new Promise((c, e) => {
		var cbCalled = false;
		function handleError(err) {
			if (!cbCalled) {
				e(err);
				cbCalled = true;
			}
		}
		var rd = fs.createReadStream(fileName);
		rd.on("error", handleError);
		var wr = fs.createWriteStream(dest);
		wr.on("error", handleError);
		wr.on("close", function() {
			if (!cbCalled) {
				c();
				cbCalled = true;
			}
		});
		rd.pipe(wr);
	});
}

function invertColor(color) {
	var res = '#';
	for (var i = 1; i < 7; i+=2) {
		var newVal = 255 - parseInt('0x' + color.substr(i, 2), 16);
		res += newVal.toString(16);
	}
	return res;
}

function getLanguageMappings() {
	var langToExt = {
		'csharp': ['cs', 'csx']
	};

	var allExtensions = fs.readdirSync('..');
	for (var i= 0; i < allExtensions.length; i++) {
		let dirPath = path.join('..', allExtensions[i], 'package.json');
		if (fs.existsSync(dirPath)) {
			let content = fs.readFileSync(dirPath).toString();
			let jsonContent = JSON.parse(content);
			let languages = jsonContent.contributes && jsonContent.contributes.languages;
			if (Array.isArray(languages)) {
				for (var k = 0; k < languages.length; k++) {
					var extensions = languages[k].extensions;
					var languageId = languages[k].id;
					if (Array.isArray(extensions) && languageId) {
						langToExt[languageId] = extensions.map(function (e) { return e.substr(1); });
					}
				}
			}
		}
	}

	return langToExt;
}

//var font = 'https://raw.githubusercontent.com/jesseweed/seti-ui/master/styles/_fonts/seti/seti.woff';
var font = '../../../seti-ui/styles/_fonts/seti/seti.woff';

exports.copyFont = function() {
	return downloadBinary(font, './icons/seti.woff');
};

//var fontMappings = 'https://raw.githubusercontent.com/jesseweed/seti-ui/master/styles/_fonts/seti.less';
//var mappings = 'https://raw.githubusercontent.com/jesseweed/seti-ui/master/styles/icons/mapping.less';
//var colors = 'https://raw.githubusercontent.com/jesseweed/seti-ui/master/styles/ui-variables.less';

var fontMappings = '../../../seti-ui/styles/_fonts/seti.less';
var mappings = '../../../seti-ui/styles/icons/mapping.less';
var colors = '../../../seti-ui/styles/ui-variables.less';

exports.update = function () {

	console.log('Reading from ' + fontMappings);
	var def2Content = {};
	var ext2Def = {};
	var fileName2Def = {};
	var def2ColorId = {};
	var colorId2Value = {};
	var lang2Def = {};

	function writeFileIconContent(info) {
		var iconDefinitions = {};

		for (var def in def2Content) {
			var entry = { fontCharacter: def2Content[def] };
			var colorId = def2ColorId[def];
			if (colorId) {
				var colorValue = colorId2Value[colorId];
				if (colorValue) {
					entry.fontColor = colorValue;

					var entryInverse = { fontCharacter: entry.fontCharacter, fontColor: invertColor(colorValue) };
					iconDefinitions[def + '_light'] = entryInverse;
				}
			}
			iconDefinitions[def] = entry;
		}

		function getInvertSet(input) {
			var result = {};
			for (var assoc in input) {
				let invertDef = input[assoc] + '_light';
				if (iconDefinitions[invertDef]) {
					result[assoc] = invertDef;
				}
			}
			return result;
		}

		var res = {
			fonts: [{
				id: "seti",
				src: [{ "path": "./seti.woff", "format": "woff" }],
				weight: "normal",
				style: "normal",
				size: "150%"
			}],
			iconDefinitions: iconDefinitions,
		//	folder: "_folder",
			file: "_default",
			fileExtensions: ext2Def,
			fileNames: fileName2Def,
			languageIds: lang2Def,
			light: {
				file: "_default_light",
				fileExtensions: getInvertSet(ext2Def),
				languageIds: getInvertSet(lang2Def),
				fileNames: getInvertSet(fileName2Def)
			},
			version: 'https://github.com/jesseweed/seti-ui/commit/' + info.commitSha,
		};

		var path = './icons/vs-seti-icon-theme.json';
		fs.writeFileSync(path, JSON.stringify(res, null, '\t'));
		console.log('written ' + path);
	}


	var match;

	return download(fontMappings).then(function (content) {
		var regex = /@([\w-]+):\s*'(\\E[0-9A-F]+)';/g;
		while ((match = regex.exec(content)) !== null) {
			def2Content['_' + match[1]] = match[2];
		}

		return download(mappings).then(function (content) {
			var regex2 = /\.icon-(?:set|partial)\('([\w-\.]+)',\s*'([\w-]+)',\s*(@[\w-]+)\)/g;
			while ((match = regex2.exec(content)) !== null) {
				let pattern = match[1];
				let def = '_' + match[2];
				let colorId = match[3];
				if (pattern[0] === '.') {
					ext2Def[pattern.substr(1).toLowerCase()] = def;
				} else {
					fileName2Def[pattern.toLowerCase()] = def;
				}
				def2ColorId[def] = colorId;
			}
			// replace extensions for languageId
			var langToExt = getLanguageMappings();
			for (var lang in langToExt) {
				var exts = langToExt[lang];
				var preferredDef = null;
				// use the first file association for the preferred definition
				for (var i1 = 0; i1 < exts.length && !preferredDef; i1++) {
					preferredDef = ext2Def[exts[i1]];
				}
				if (preferredDef) {
					lang2Def[lang] = preferredDef;
					for (var i2 = 0; i2 < exts.length; i2++) {
						// remove the extention association, unless it is different from the preferred
						if (ext2Def[exts[i2]] === preferredDef) {
							delete ext2Def[exts[i2]];
						}
					}
				}
			}


			return download(colors).then(function (content) {
				var regex3 = /(@[\w-]+):\s*(#[0-9a-z]+)/g;
				while ((match = regex3.exec(content)) !== null) {
					colorId2Value[match[1]] =  match[2];
				}
				return getCommitSha('jesseweed/seti-ui', 'styles/_fonts/seti.less').then(function (info) {
					try {
						writeFileIconContent(info);
						if (info) {
							console.log('Updated to jesseweed/seti-ui@' + info.commitSha.substr(0, 7) + ' (' + info.commitDate.substr(0, 10) + ')');
						}

					} catch (e) {
						console.error(e);
					}
				});
			});
		});
	}, console.error);
};

if (path.basename(process.argv[1]) === 'update-icon-theme.js') {
	exports.copyFont().then(() => exports.update());
}



