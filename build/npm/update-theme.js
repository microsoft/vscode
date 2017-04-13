/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

var path = require('path');
var fs = require('fs');
var plist = require('fast-plist');

var mappings = {
	"ansiBlack": ["terminalAnsiBlack"], "ansiRed": ["terminalAnsiRed"], "ansiGreen": ["terminalAnsiGreen"], "ansiYellow": ["terminalAnsiYellow"], "ansiBlue": ["terminalAnsiBlue"], "ansiMagenta": ["terminalAnsiMagenta"], "ansiCyan": ["terminalAnsiCyan"], "ansiWhite": ["terminalAnsiWhite"], "ansiBrightBlack": ["terminalAnsiBrightBlack"], "ansiBrightRed": ["terminalAnsiBrightRed"], "ansiBrightGreen": ["terminalAnsiBrightGreen"], "ansiBrightYellow": ["terminalAnsiBrightYellow"], "ansiBrightBlue": ["terminalAnsiBrightBlue"], "ansiBrightMagenta": ["terminalAnsiBrightMagenta"], "ansiBrightCyan": ["terminalAnsiBrightCyan"], "ansiBrightWhite": ["terminalAnsiBrightWhite"], "background": ["editorBackground"],
	"hoverHighlight": ["editorHoverHighlight", "editorHoverHighlight"], "linkForeground": ["editorLinkForeground"], "selection": ["editorSelection"], "inactiveSelection": ["editorInactiveSelection"], "selectionHighlightColor": ["editorSelectionHighlight"], "wordHighlight": ["editorWordHighlight"], "wordHighlightStrong": ["editorWordHighlightStrong"], "findMatchHighlight": ["editorFindMatchHighlight", "referencesFindMatchHighlight"], "currentFindMatchHighlight": ["editorFindMatch"], "findRangeHighlight": ["editorFindRangeHighlight"], "referenceHighlight": ["referencesReferenceHighlight"], "lineHighlight": ["editorLineHighlight"], "rangeHighlight": ["editorRangeHighlight"], "caret": ["editorCursor"], "invisibles": ["editorWhitespaces"], "guide": ["editorIndentGuides"]
};

exports.update = function (srcName, destName) {
	try {
		console.log('reading ', srcName);
		let result = {};
		let plistContent = fs.readFileSync(srcName).toString();
		let theme = plist.parse(plistContent);
		let settings = theme.settings;
		if (Array.isArray(settings)) {
			let colorMap = {};
			for (let entry of settings) {
				let scope = entry.scope;
				if (scope) {
					let parts = scope.split(',').map(p => p.trim());
					if (parts.length > 1) {
						entry.scope = parts;
					}
				} else {
					var entrySettings = entry.settings;
					for (let entry in entrySettings) {
						let mapping = mappings[entry];
						if (mapping) {
							for (let newKey of mapping) {
								colorMap[newKey] = entrySettings[entry];
							}
							if (entry !== 'foreground' && entry !== 'background') {
								delete entrySettings[entry];
							}
						}
					}

				}
			}
			result.name = theme.name;
			result.tokenColors = settings;
			result.colors = colorMap;
		}
		fs.writeFileSync(destName, JSON.stringify(result, null, '\t'));
	} catch (e) {
		console.log(e);
	}
};

if (path.basename(process.argv[1]) === 'update-theme.js') {
	exports.update(process.argv[2], process.argv[3]);
}
