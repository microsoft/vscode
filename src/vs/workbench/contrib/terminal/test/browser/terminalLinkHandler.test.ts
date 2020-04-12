/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { OperatingSystem } from 'vs/base/common/platform';
import { TerminalLinkHandler, LineColumnInfo, XtermLinkMatcherHandler, convertLinkRangeToBuffer } from 'vs/workbench/contrib/terminal/browser/terminalLinkHandler';
import * as strings from 'vs/base/common/strings';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { Event } from 'vs/base/common/event';
import { ITerminalConfigHelper } from 'vs/workbench/contrib/terminal/common/terminal';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IBufferLine, IBufferCell } from 'xterm';

class TestTerminalLinkHandler extends TerminalLinkHandler {
	public get localLinkRegex(): RegExp {
		return this._localLinkRegex;
	}
	public get gitDiffLinkPreImageRegex(): RegExp {
		return this._gitDiffPreImageRegex;
	}
	public get gitDiffLinkPostImageRegex(): RegExp {
		return this._gitDiffPostImageRegex;
	}
	public preprocessPath(link: string): string | null {
		return this._preprocessPath(link);
	}
	protected _isLinkActivationModifierDown(event: MouseEvent): boolean {
		return true;
	}
	public wrapLinkHandler(handler: (link: string) => void): XtermLinkMatcherHandler {
		TerminalLinkHandler._LINK_INTERCEPT_THRESHOLD = 0;
		return this._wrapLinkHandler(handler);
	}
}

class TestXterm {
	public loadAddon() { }
	public registerLinkMatcher() { }
}

class MockTerminalInstanceService implements ITerminalInstanceService {
	onRequestDefaultShellAndArgs?: Event<any> | undefined;
	getDefaultShellAndArgs(): Promise<{ shell: string; args: string | string[] | undefined; }> {
		throw new Error('Method not implemented.');
	}
	_serviceBrand: undefined;
	getXtermConstructor(): Promise<any> {
		throw new Error('Method not implemented.');
	}
	getXtermSearchConstructor(): Promise<any> {
		throw new Error('Method not implemented.');
	}
	getXtermUnicode11Constructor(): Promise<any> {
		throw new Error('Method not implemented.');
	}
	async getXtermWebLinksConstructor(): Promise<any> {
		return (await import('xterm-addon-web-links')).WebLinksAddon;
	}
	getXtermWebglConstructor(): Promise<any> {
		throw new Error('Method not implemented.');
	}
	createWindowsShellHelper(): any {
		throw new Error('Method not implemented.');
	}
	createTerminalProcess(): any {
		throw new Error('Method not implemented.');
	}
	getMainProcessParentEnv(): any {
		throw new Error('Method not implemented.');
	}
}

interface LinkFormatInfo {
	urlFormat: string;
	line?: string;
	column?: string;
}

const testConfigHelper: ITerminalConfigHelper = <any>{
	config: {
		enableFileLinks: true
	}
};

suite('Workbench - TerminalLinkHandler', () => {
	suite('localLinkRegex', () => {
		test('Windows', () => {
			const terminalLinkHandler = new TestTerminalLinkHandler(new TestXterm() as any, {
				os: OperatingSystem.Windows,
				userHome: ''
			} as any, testConfigHelper, null!, null!, null!, new MockTerminalInstanceService(), null!, null!);
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
					'a/relative/path',
					'plain/path',
					'plain\\path'
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
					{ urlFormat: '{0} [{1}, {2}]', line: '5', column: '3' },
					{ urlFormat: '"{0}",{1}', line: '5' }
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
			const terminalLinkHandler = new TestTerminalLinkHandler(new TestXterm() as any, {
				os: OperatingSystem.Linux,
				userHome: ''
			} as any, testConfigHelper, null!, null!, null!, new MockTerminalInstanceService(), null!, null!);
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
					{ urlFormat: '{0} on line {1}', line: '5' },
					{ urlFormat: '{0} on line {1}, column {2}', line: '5', column: '3' },
					{ urlFormat: '{0}:line {1}', line: '5' },
					{ urlFormat: '{0}:line {1}, column {2}', line: '5', column: '3' },
					{ urlFormat: '{0}({1})', line: '5' },
					{ urlFormat: '{0} ({1})', line: '5' },
					{ urlFormat: '{0}({1},{2})', line: '5', column: '3' },
					{ urlFormat: '{0} ({1},{2})', line: '5', column: '3' },
					{ urlFormat: '{0}:{1}', line: '5' },
					{ urlFormat: '{0}:{1}:{2}', line: '5', column: '3' },
					{ urlFormat: '{0}[{1}]', line: '5' },
					{ urlFormat: '{0} [{1}]', line: '5' },
					{ urlFormat: '{0}[{1},{2}]', line: '5', column: '3' },
					{ urlFormat: '{0} [{1},{2}]', line: '5', column: '3' },
					{ urlFormat: '"{0}",{1}', line: '5' }
				];

				linkUrls.forEach(linkUrl => {
					supportedLinkFormats.forEach(linkFormatInfo => {
						// console.log('linkFormatInfo: ', linkFormatInfo);
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
			const linkHandler = new TestTerminalLinkHandler(new TestXterm() as any, {
				os: OperatingSystem.Windows,
				userHome: 'C:\\Users\\Me'
			} as any, testConfigHelper, null!, null!, null!, new MockTerminalInstanceService(), null!, null!);
			linkHandler.processCwd = 'C:\\base';

			assert.equal(linkHandler.preprocessPath('./src/file1'), 'C:\\base\\src\\file1');
			assert.equal(linkHandler.preprocessPath('src\\file2'), 'C:\\base\\src\\file2');
			assert.equal(linkHandler.preprocessPath('~/src/file3'), 'C:\\Users\\Me\\src\\file3');
			assert.equal(linkHandler.preprocessPath('~\\src\\file4'), 'C:\\Users\\Me\\src\\file4');
			assert.equal(linkHandler.preprocessPath('C:\\absolute\\path\\file5'), 'C:\\absolute\\path\\file5');
		});
		test('Windows - spaces', () => {
			const linkHandler = new TestTerminalLinkHandler(new TestXterm() as any, {
				os: OperatingSystem.Windows,
				userHome: 'C:\\Users\\M e'
			} as any, testConfigHelper, null!, null!, null!, new MockTerminalInstanceService(), null!, null!);
			linkHandler.processCwd = 'C:\\base dir';

			assert.equal(linkHandler.preprocessPath('./src/file1'), 'C:\\base dir\\src\\file1');
			assert.equal(linkHandler.preprocessPath('src\\file2'), 'C:\\base dir\\src\\file2');
			assert.equal(linkHandler.preprocessPath('~/src/file3'), 'C:\\Users\\M e\\src\\file3');
			assert.equal(linkHandler.preprocessPath('~\\src\\file4'), 'C:\\Users\\M e\\src\\file4');
			assert.equal(linkHandler.preprocessPath('C:\\abso lute\\path\\file5'), 'C:\\abso lute\\path\\file5');
		});

		test('Linux', () => {
			const linkHandler = new TestTerminalLinkHandler(new TestXterm() as any, {
				os: OperatingSystem.Linux,
				userHome: '/home/me'
			} as any, testConfigHelper, null!, null!, null!, new MockTerminalInstanceService(), null!, null!);
			linkHandler.processCwd = '/base';

			assert.equal(linkHandler.preprocessPath('./src/file1'), '/base/src/file1');
			assert.equal(linkHandler.preprocessPath('src/file2'), '/base/src/file2');
			assert.equal(linkHandler.preprocessPath('~/src/file3'), '/home/me/src/file3');
			assert.equal(linkHandler.preprocessPath('/absolute/path/file4'), '/absolute/path/file4');
		});

		test('No Workspace', () => {
			const linkHandler = new TestTerminalLinkHandler(new TestXterm() as any, {
				os: OperatingSystem.Linux,
				userHome: '/home/me'
			} as any, testConfigHelper, null!, null!, null!, new MockTerminalInstanceService(), null!, null!);

			assert.equal(linkHandler.preprocessPath('./src/file1'), null);
			assert.equal(linkHandler.preprocessPath('src/file2'), null);
			assert.equal(linkHandler.preprocessPath('~/src/file3'), '/home/me/src/file3');
			assert.equal(linkHandler.preprocessPath('/absolute/path/file4'), '/absolute/path/file4');
		});
	});

	test('gitDiffLinkRegex', () => {
		// The platform is irrelevant because the links generated by Git are the same format regardless of platform
		const linkHandler = new TestTerminalLinkHandler(new TestXterm() as any, {
			os: OperatingSystem.Linux,
			userHome: ''
		} as any, testConfigHelper, null!, null!, null!, new MockTerminalInstanceService(), null!, null!);

		function assertAreGoodMatches(matches: RegExpMatchArray | null) {
			if (matches) {
				assert.equal(matches.length, 2);
				assert.equal(matches[1], 'src/file1');
			} else {
				assert.fail();
			}
		}

		// Happy cases
		assertAreGoodMatches('--- a/src/file1'.match(linkHandler.gitDiffLinkPreImageRegex));
		assertAreGoodMatches('--- a/src/file1             '.match(linkHandler.gitDiffLinkPreImageRegex));
		assertAreGoodMatches('+++ b/src/file1'.match(linkHandler.gitDiffLinkPostImageRegex));
		assertAreGoodMatches('+++ b/src/file1             '.match(linkHandler.gitDiffLinkPostImageRegex));

		// Make sure /dev/null isn't a match
		assert.equal(linkHandler.gitDiffLinkPreImageRegex.test('--- /dev/null'), false);
		assert.equal(linkHandler.gitDiffLinkPreImageRegex.test('--- /dev/null           '), false);
		assert.equal(linkHandler.gitDiffLinkPostImageRegex.test('+++ /dev/null'), false);
		assert.equal(linkHandler.gitDiffLinkPostImageRegex.test('+++ /dev/null          '), false);
	});

	suite('wrapLinkHandler', () => {
		const nullMouseEvent: any = Object.freeze({ preventDefault: () => { } });

		test('should allow intercepting of links with onBeforeHandleLink', async () => {
			const linkHandler = new TestTerminalLinkHandler(new TestXterm() as any, {
				os: OperatingSystem.Linux,
				userHome: ''
			} as any, testConfigHelper, null!, null!, new TestConfigurationService(), new MockTerminalInstanceService(), null!, null!);
			linkHandler.onBeforeHandleLink(e => {
				if (e.link === 'https://www.microsoft.com') {
					intercepted = true;
					e.resolve(true);
				}
				e.resolve(false);
			});
			const wrappedHandler = linkHandler.wrapLinkHandler(() => defaultHandled = true);

			let defaultHandled = false;
			let intercepted = false;
			await wrappedHandler(nullMouseEvent, 'https://www.visualstudio.com');
			assert.equal(intercepted, false);
			assert.equal(defaultHandled, true);

			defaultHandled = false;
			intercepted = false;
			await wrappedHandler(nullMouseEvent, 'https://www.microsoft.com');
			assert.equal(intercepted, true);
			assert.equal(defaultHandled, false);
		});
	});
	suite('convertLinkRangeToBuffer', () => {
		test('should convert ranges for ascii characters', () => {
			const lines = createBufferLineArray([
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/f/', width: 8 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4, startLineNumber: 1, endColumn: 19, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
				start: { x: 4, y: 1 },
				end: { x: 7, y: 2 }
			});
		});
		test('should convert ranges for wide characters before the link', () => {
			const lines = createBufferLineArray([
				{ text: 'A文 http://', width: 11 },
				{ text: 't.com/f/', width: 9 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4, startLineNumber: 1, endColumn: 19, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
				start: { x: 4 + 1, y: 1 },
				end: { x: 7 + 1, y: 2 }
			});
		});
		test('should convert ranges for wide characters inside the link', () => {
			const lines = createBufferLineArray([
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/文/', width: 8 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4, startLineNumber: 1, endColumn: 19, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
				start: { x: 4, y: 1 },
				end: { x: 7 + 1, y: 2 }
			});
		});
		test('should convert ranges for wide characters before and inside the link', () => {
			const lines = createBufferLineArray([
				{ text: 'A文 http://', width: 11 },
				{ text: 't.com/文/', width: 9 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 4, startLineNumber: 1, endColumn: 19, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
				start: { x: 4 + 1, y: 1 },
				end: { x: 7 + 2, y: 2 }
			});
		});
		test('should convert ranges for ascii characters (link starts on wrapped)', () => {
			const lines = createBufferLineArray([
				{ text: 'AAAAAAAAAAA', width: 11 },
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/f/', width: 8 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
				start: { x: 4, y: 2 },
				end: { x: 7, y: 3 }
			});
		});
		test('should convert ranges for wide characters before the link (link starts on wrapped)', () => {
			const lines = createBufferLineArray([
				{ text: 'AAAAAAAAAAA', width: 11 },
				{ text: 'A文 http://', width: 11 },
				{ text: 't.com/f/', width: 9 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
				start: { x: 4 + 1, y: 2 },
				end: { x: 7 + 1, y: 3 }
			});
		});
		test('should convert ranges for wide characters inside the link (link starts on wrapped)', () => {
			const lines = createBufferLineArray([
				{ text: 'AAAAAAAAAAA', width: 11 },
				{ text: 'AA http://t', width: 11 },
				{ text: '.com/文/', width: 8 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
				start: { x: 4, y: 2 },
				end: { x: 7 + 1, y: 3 }
			});
		});
		test('should convert ranges for wide characters before and inside the link', () => {
			const lines = createBufferLineArray([
				{ text: 'AAAAAAAAAAA', width: 11 },
				{ text: 'A文 http://', width: 11 },
				{ text: 't.com/文/', width: 9 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
			assert.deepEqual(bufferRange, {
				start: { x: 4 + 1, y: 2 },
				end: { x: 7 + 2, y: 3 }
			});
		});
		test('should convert ranges for several wide characters before the link', () => {
			const lines = createBufferLineArray([
				{ text: 'A文文AAAAAA', width: 11 },
				{ text: 'AA文文 http', width: 11 },
				{ text: '://t.com/f/', width: 11 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 30, endLineNumber: 1 }, 0);
			// This test ensures that the start offset is applies to the end before it's counted
			assert.deepEqual(bufferRange, {
				start: { x: 4 + 4, y: 2 },
				end: { x: 7 + 4, y: 3 }
			});
		});
		test('should convert ranges for several wide characters before and inside the link', () => {
			const lines = createBufferLineArray([
				{ text: 'A文文AAAAAA', width: 11 },
				{ text: 'AA文文 http', width: 11 },
				{ text: '://t.com/文', width: 11 },
				{ text: '文/', width: 3 }
			]);
			const bufferRange = convertLinkRangeToBuffer(lines, 11, { startColumn: 15, startLineNumber: 1, endColumn: 31, endLineNumber: 1 }, 0);
			// This test ensures that the start offset is applies to the end before it's counted
			assert.deepEqual(bufferRange, {
				start: { x: 4 + 4, y: 2 },
				end: { x: 2, y: 4 }
			});
		});
	});
});

const TEST_WIDE_CHAR = '文';
const TEST_NULL_CHAR = 'C';

function createBufferLineArray(lines: { text: string, width: number }[]): IBufferLine[] {
	let result: IBufferLine[] = [];
	lines.forEach((l, i) => {
		result.push(new TestBufferLine(
			l.text,
			l.width,
			i + 1 !== lines.length
		));
	});
	return result;
}

class TestBufferLine implements IBufferLine {
	constructor(
		private _text: string,
		public length: number,
		public isWrapped: boolean
	) {

	}
	getCell(x: number): IBufferCell | undefined {
		// Create a fake line of cells and use that to resolve the width
		let cells: string = '';
		let offset = 0;
		for (let i = 0; i <= x - offset; i++) {
			const char = this._text.charAt(i);
			cells += char;
			if (this._text.charAt(i) === TEST_WIDE_CHAR) {
				// Skip the next character as it's width is 0
				cells += TEST_NULL_CHAR;
				offset++;
			}
		}
		return {
			getWidth: () => {
				switch (cells.charAt(x)) {
					case TEST_WIDE_CHAR: return 2;
					case TEST_NULL_CHAR: return 0;
					default: return 1;
				}
			}
		} as any;
	}
	translateToString(): string {
		throw new Error('Method not implemented.');
	}
}
