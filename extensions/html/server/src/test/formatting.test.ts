/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { getLanguageModes } from '../modes/languageModes';
import { TextDocument, Range, TextEdit, FormattingOptions } from 'vscode-languageserver-types';

import { format } from '../modes/formatting';

suite('HTML Embedded Formatting', () => {

	function assertFormat(value: string, expected: string, options?: any): void {
		var languageModes = getLanguageModes({ css: true, javascript: true });
		if (options) {
			languageModes.getAllModes().forEach(m => m.configure(options));
		}

		let rangeStartOffset = value.indexOf('|');
		let rangeEndOffset;
		if (rangeStartOffset !== -1) {
			value = value.substr(0, rangeStartOffset) + value.substr(rangeStartOffset + 1);

			rangeEndOffset = value.indexOf('|');
			value = value.substr(0, rangeEndOffset) + value.substr(rangeEndOffset + 1);
		} else {
			rangeStartOffset = 0;
			rangeEndOffset = value.length;
		}
		let document = TextDocument.create('test://test/test.html', 'html', 0, value);
		let range = Range.create(document.positionAt(rangeStartOffset), document.positionAt(rangeEndOffset));
		let formatOptions = FormattingOptions.create(2, true);

		let result = format(languageModes, document, range, formatOptions, { css: true, javascript: true });

		let actual = applyEdits(document, result);
		assert.equal(actual, expected);
	}

	test('HTML only', function (): any {
		assertFormat('<html><body><p>Hello</p></body></html>', '<html>\n\n<body>\n  <p>Hello</p>\n</body>\n\n</html>');
		assertFormat('|<html><body><p>Hello</p></body></html>|', '<html>\n\n<body>\n  <p>Hello</p>\n</body>\n\n</html>');
		assertFormat('<html>|<body><p>Hello</p></body>|</html>', '<html><body>\n  <p>Hello</p>\n</body></html>');
	});

	test('HTML & Scripts', function (): any {
		assertFormat('<html><head><script></script></head></html>', '<html>\n\n<head>\n  <script></script>\n</head>\n\n</html>');
		assertFormat('<html><head><script>var x=1;</script></head></html>', '<html>\n\n<head>\n  <script>\n    var x = 1;\n  </script>\n</head>\n\n</html>');
		assertFormat('<html><head><script>\nvar x=2;\n</script></head></html>', '<html>\n\n<head>\n  <script>\n    var x = 2;\n\n  </script>\n</head>\n\n</html>');
		assertFormat('<html><head>\n  <script>\nvar x=3;\n</script></head></html>', '<html>\n\n<head>\n  <script>\n    var x = 3;\n\n  </script>\n</head>\n\n</html>');
		assertFormat('<html><head>\n  <script>\nvar x=4;\nconsole.log("Hi");\n</script></head></html>', '<html>\n\n<head>\n  <script>\n    var x = 4;\n    console.log("Hi");\n\n  </script>\n</head>\n\n</html>');

		assertFormat('<html><head>\n  |<script>\nvar x=5;\n</script>|</head></html>', '<html><head>\n  <script>\n    var x = 5;\n\n  </script></head></html>');
		assertFormat('<html><head>\n  <script>\n|var x=6;|\n</script></head></html>', '<html><head>\n  <script>\n  var x = 6;\n</script></head></html>');
	});

	test('Script end tag', function (): any {
		assertFormat('<html>\n<head>\n  <script>\nvar x  =  0;\n</script></head></html>', '<html>\n\n<head>\n  <script>\n    var x = 0;\n\n  </script>\n</head>\n\n</html>');
	});

	test('HTML & Multiple Scripts', function (): any {
		assertFormat('<html><head>\n<script>\nif(x){\nbar(); }\n</script><script>\nfunction(x){}\n</script></head></html>', '<html>\n\n<head>\n  <script>\n    if (x) {\n      bar();\n    }\n\n  </script>\n  <script>\n    function(x) { }\n\n  </script>\n</head>\n\n</html>');
	});

	test('HTML & Styles', function (): any {
		assertFormat('<html><head>\n<style>\n.foo{display:none;}\n</style></head></html>', '<html>\n\n<head>\n  <style>\n    .foo {\n      display: none;\n    }\n  </style>\n</head>\n\n</html>');
	});

	test('EndWithNewline', function (): any {
		let options = {
			html: {
				format: {
					endWithNewline: true
				}
			}
		};
		assertFormat('<html><body><p>Hello</p></body></html>', '<html>\n\n<body>\n  <p>Hello</p>\n</body>\n\n</html>\n', options);
		assertFormat('<html>|<body><p>Hello</p></body>|</html>', '<html><body>\n  <p>Hello</p>\n</body></html>', options);
		assertFormat('<html><head><script>\nvar x=1;\n</script></head></html>', '<html>\n\n<head>\n  <script>\n    var x = 1;\n\n  </script>\n</head>\n\n</html>\n', options);
	});

});

function pushAll<T>(to: T[], from: T[]) {
	if (from) {
		for (var i = 0; i < from.length; i++) {
			to.push(from[i]);
		}
	}
}

function applyEdits(document: TextDocument, edits: TextEdit[]): string {
	let text = document.getText();
	let sortedEdits = edits.sort((a, b) => {
		let startDiff = document.offsetAt(b.range.start) - document.offsetAt(a.range.start);
		if (startDiff === 0) {
			return document.offsetAt(b.range.end) - document.offsetAt(a.range.end);
		}
		return startDiff;
	});
	let lastOffset = text.length;
	sortedEdits.forEach(e => {
		let startOffset = document.offsetAt(e.range.start);
		let endOffset = document.offsetAt(e.range.end);
		assert.ok(startOffset <= endOffset);
		assert.ok(endOffset <= lastOffset);
		text = text.substring(0, startOffset) + e.newText + text.substring(endOffset, text.length);
		lastOffset = startOffset;
	});
	return text;
}