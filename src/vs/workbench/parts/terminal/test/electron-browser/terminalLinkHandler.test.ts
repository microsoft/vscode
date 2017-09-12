/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Platform } from 'vs/base/common/platform';
import { TerminalLinkHandler, LineColumnInfo } from 'vs/workbench/parts/terminal/electron-browser/terminalLinkHandler';
import * as strings from 'vs/base/common/strings';
import * as path from 'path';
import * as sinon from 'sinon';

class TestTerminalLinkHandler extends TerminalLinkHandler {
	public get localLinkRegex(): RegExp {
		return this._localLinkRegex;
	}
	public preprocessPath(link: string): string {
		return this._preprocessPath(link);
	}
}

class TestXterm {
	public setHypertextLinkHandler() { }
	public setHypertextValidationCallback() { }
}

interface LinkFormatInfo {
	urlFormat: string;
	line?: string;
	column?: string;
}

suite('Workbench - TerminalLinkHandler', () => {
	suite('localLinkRegex', () => {
		test('Windows', () => {
			const terminalLinkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Windows, null, null, null, null);
			function testLink(link: string, linkUrl: string, lineNo?: string, columnNo?: string) {
				assert.equal(terminalLinkHandler.extractLinkUrl(link), linkUrl);
				assert.equal(terminalLinkHandler.extractLinkUrl(`:${link}:`), linkUrl);
				assert.equal(terminalLinkHandler.extractLinkUrl(`;${link};`), linkUrl);
				assert.equal(terminalLinkHandler.extractLinkUrl(`(${link})`), linkUrl);

				if (lineNo) {
					const lineColumnInfo: LineColumnInfo = terminalLinkHandler.extractLineColumnInfo(link);
					assert.equal(lineColumnInfo.lineNumber, lineNo);

					if (columnNo) {
						assert.equal(lineColumnInfo.columnNumber, columnNo);
					}
				}
			}

			function generateAndTestLinks() {
				const linkUrls = [
					'c:\\foo',
					'c:/foo',
					'.\\foo',
					'./foo',
					'..\\foo',
					'~\\foo',
					'~/foo',
					'c:/a/long/path',
					'c:\\a\\long\\path',
					'c:\\mixed/slash\\path',
					'a/relative/path'
				];

				const supportedLinkFormats: LinkFormatInfo[] = [
					{ urlFormat: '{0}' },
					{ urlFormat: '{0} on line {1}', line: '5' },
					{ urlFormat: '{0} on line {1}, column {2}', line: '5', column: '3' },
					{ urlFormat: '{0}:line {1}', line: '5' },
					{ urlFormat: '{0}:line {1}, column {2}', line: '5', column: '3' },
					{ urlFormat: '{0}({1})', line: '5' },
					{ urlFormat: '{0} ({1})', line: '5' },
					{ urlFormat: '{0}({1},{2})', line: '5', column: '3' },
					{ urlFormat: '{0} ({1},{2})', line: '5', column: '3' },
					{ urlFormat: '{0}({1}, {2})', line: '5', column: '3' },
					{ urlFormat: '{0} ({1}, {2})', line: '5', column: '3' },
					{ urlFormat: '{0}:{1}', line: '5' },
					{ urlFormat: '{0}:{1}:{2}', line: '5', column: '3' },
					{ urlFormat: '{0}[{1}]', line: '5' },
					{ urlFormat: '{0} [{1}]', line: '5' },
					{ urlFormat: '{0}[{1},{2}]', line: '5', column: '3' },
					{ urlFormat: '{0} [{1},{2}]', line: '5', column: '3' },
					{ urlFormat: '{0}[{1}, {2}]', line: '5', column: '3' },
					{ urlFormat: '{0} [{1}, {2}]', line: '5', column: '3' }
				];

				linkUrls.forEach(linkUrl => {
					supportedLinkFormats.forEach(linkFormatInfo => {
						testLink(
							strings.format(linkFormatInfo.urlFormat, linkUrl, linkFormatInfo.line, linkFormatInfo.column),
							linkUrl,
							linkFormatInfo.line,
							linkFormatInfo.column
						);
					});
				});
			}

			generateAndTestLinks();
		});

		test('Linux', () => {
			const terminalLinkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Linux, null, null, null, null);
			function testLink(link: string, linkUrl: string, lineNo?: string, columnNo?: string) {
				assert.equal(terminalLinkHandler.extractLinkUrl(link), linkUrl);
				assert.equal(terminalLinkHandler.extractLinkUrl(`:${link}:`), linkUrl);
				assert.equal(terminalLinkHandler.extractLinkUrl(`;${link};`), linkUrl);
				assert.equal(terminalLinkHandler.extractLinkUrl(`(${link})`), linkUrl);

				if (lineNo) {
					const lineColumnInfo: LineColumnInfo = terminalLinkHandler.extractLineColumnInfo(link);
					assert.equal(lineColumnInfo.lineNumber, lineNo);

					if (columnNo) {
						assert.equal(lineColumnInfo.columnNumber, columnNo);
					}
				}
			}

			function generateAndTestLinks() {
				const linkUrls = [
					'/foo',
					'~/foo',
					'./foo',
					'../foo',
					'/a/long/path',
					'a/relative/path'
				];

				const supportedLinkFormats: LinkFormatInfo[] = [
					{ urlFormat: '{0}' },
					// { urlFormat: '{0} on line {1}', line: '5' },
					// { urlFormat: '{0} on line {1}, column {2}', line: '5', column: '3' },
					// { urlFormat: '{0}:line {1}', line: '5' },
					// { urlFormat: '{0}:line {1}, column {2}', line: '5', column: '3' },
					{ urlFormat: '{0}({1})', line: '5' },
					{ urlFormat: '{0} ({1})', line: '5' },
					{ urlFormat: '{0}({1},{2})', line: '5', column: '3' },
					{ urlFormat: '{0} ({1},{2})', line: '5', column: '3' },
					{ urlFormat: '{0}:{1}', line: '5' },
					{ urlFormat: '{0}:{1}:{2}', line: '5', column: '3' },
					{ urlFormat: '{0}[{1}]', line: '5' },
					{ urlFormat: '{0} [{1}]', line: '5' },
					{ urlFormat: '{0}[{1},{2}]', line: '5', column: '3' },
					{ urlFormat: '{0} [{1},{2}]', line: '5', column: '3' }
				];

				linkUrls.forEach(linkUrl => {
					supportedLinkFormats.forEach(linkFormatInfo => {
						testLink(
							strings.format(linkFormatInfo.urlFormat, linkUrl, linkFormatInfo.line, linkFormatInfo.column),
							linkUrl,
							linkFormatInfo.line,
							linkFormatInfo.column
						);
					});
				});
			}

			generateAndTestLinks();
		});
	});

	suite('preprocessPath', () => {
		test('Windows', () => {
			const linkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Windows, 'C:\\base', null, null, null);

			let stub = sinon.stub(path, 'join', function (arg1, arg2) {
				return arg1 + '\\' + arg2;
			});
			assert.equal(linkHandler.preprocessPath('./src/file1'), 'C:\\base\\./src/file1');
			assert.equal(linkHandler.preprocessPath('src\\file2'), 'C:\\base\\src\\file2');
			assert.equal(linkHandler.preprocessPath('C:\\absolute\\path\\file3'), 'C:\\absolute\\path\\file3');

			stub.restore();
		});

		test('Linux', () => {
			const linkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Linux, '/base', null, null, null);

			let stub = sinon.stub(path, 'join', function (arg1, arg2) {
				return arg1 + '/' + arg2;
			});

			assert.equal(linkHandler.preprocessPath('./src/file1'), '/base/./src/file1');
			assert.equal(linkHandler.preprocessPath('src/file2'), '/base/src/file2');
			assert.equal(linkHandler.preprocessPath('/absolute/path/file3'), '/absolute/path/file3');
			stub.restore();
		});

		test('No Workspace', () => {
			const linkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Linux, null, null, null, null);

			assert.equal(linkHandler.preprocessPath('./src/file1'), null);
			assert.equal(linkHandler.preprocessPath('src/file2'), null);
			assert.equal(linkHandler.preprocessPath('/absolute/path/file3'), '/absolute/path/file3');
		});
	});
});
