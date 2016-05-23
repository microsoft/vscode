var fs = require('fs');
var path = require('path');

toString(path.join(__dirname, 'lib.d.ts'), path.join(__dirname, 'lib-ts.js'));
toString(path.join(__dirname, 'lib.es6.d.ts'), path.join(__dirname, 'lib-es6-ts.js'));

function toString(source, dest) {

	var contents = fs.readFileSync(source).toString();

	fs.writeFileSync(dest,
`/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is a generated file from ${path.basename(source)}

define([], { contents: "${escapeText(contents)}"});

`)
}

/**
 * Escape text such that it can be used in a javascript string enclosed by double quotes (")
 */
function escapeText(text) {
	// http://www.javascriptkit.com/jsref/escapesequence.shtml
	// \b	Backspace.
	// \f	Form feed.
	// \n	Newline.
	// \O	Nul character.
	// \r	Carriage return.
	// \t	Horizontal tab.
	// \v	Vertical tab.
	// \'	Single quote or apostrophe.
	// \"	Double quote.
	// \\	Backslash.
	// \ddd	The Latin-1 character specified by the three octal digits between 0 and 377. ie, copyright symbol is \251.
	// \xdd	The Latin-1 character specified by the two hexadecimal digits dd between 00 and FF.  ie, copyright symbol is \xA9.
	// \udddd	The Unicode character specified by the four hexadecimal digits dddd. ie, copyright symbol is \u00A9.
	var _backspace = '\b'.charCodeAt(0);
	var _formFeed = '\f'.charCodeAt(0);
	var _newLine = '\n'.charCodeAt(0);
	var _nullChar = 0;
	var _carriageReturn = '\r'.charCodeAt(0);
	var _tab = '\t'.charCodeAt(0);
	var _verticalTab = '\v'.charCodeAt(0);
	var _backslash = '\\'.charCodeAt(0);
	var _doubleQuote = '"'.charCodeAt(0);

	var startPos = 0, chrCode, replaceWith = null, resultPieces = [];

	for (var i = 0, len = text.length; i < len; i++) {
		chrCode = text.charCodeAt(i);
		switch (chrCode) {
			case _backspace:
				replaceWith = '\\b';
				break;
			case _formFeed:
				replaceWith = '\\f';
				break;
			case _newLine:
				replaceWith = '\\n';
				break;
			case _nullChar:
				replaceWith = '\\0';
				break;
			case _carriageReturn:
				replaceWith = '\\r';
				break;
			case _tab:
				replaceWith = '\\t';
				break;
			case _verticalTab:
				replaceWith = '\\v';
				break;
			case _backslash:
				replaceWith = '\\\\';
				break;
			case _doubleQuote:
				replaceWith = '\\"';
				break;
		}
		if (replaceWith !== null) {
			resultPieces.push(text.substring(startPos, i));
			resultPieces.push(replaceWith);
			startPos = i + 1;
			replaceWith = null;
		}
	}
	resultPieces.push(text.substring(startPos, len));
	return resultPieces.join('');
}
