/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Platform } from 'vs/base/common/platform';
import { TerminalLinkHandler, LineColumnInfo } from 'vs/workbench/parts/terminal/electron-browser/terminalLinkHandler';
import { IWorkspace, WorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import URI from 'vs/base/common/uri';
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

class TestURI extends URI {
	constructor(private _fakePath: string) {
		super();
	};

	get fsPath(): string {
		return this._fakePath;
	}
}

class TestWorkspace implements IWorkspace {
	resource: URI;
	constructor(basePath: string) {
		this.resource = new TestURI(basePath);
	}
}

suite('Workbench - TerminalLinkHandler', () => {
	suite('localLinkRegex', () => {
		test('Windows', () => {
			const terminalLinkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Windows, null, null, null);
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

			testLink('c:\\foo', 'c:\\foo');
			testLink('c:/foo', 'c:/foo');
			testLink('.\\foo', '.\\foo');
			testLink('./foo', './foo');
			testLink('..\\foo', '..\\foo');
			testLink('../foo', '../foo');
			testLink('~\\foo', '~\\foo');
			testLink('~/foo', '~/foo');
			testLink('c:/a/long/path', 'c:/a/long/path');
			testLink('c:\\a\\long\\path', 'c:\\a\\long\\path');
			testLink('c:\\mixed/slash\\path', 'c:\\mixed/slash\\path');
			testLink('a/relative/path', 'a/relative/path');

			// With line and column number.
			testLink('c:\\foo:5', 'c:\\foo', '5');
			testLink('c:\\foo:5:3', 'c:\\foo', '5', '3');
			testLink('c:\\foo:line 5', 'c:\\foo', '5');
			testLink('c:\\foo:line 5, column 3', 'c:\\foo', '5', '3');
			testLink('c:\\foo(5)', 'c:\\foo', '5');
			testLink('c:\\foo(5,3)', 'c:\\foo', '5', '3');
			testLink('c:\\foo (5)', 'c:\\foo', '5');
			testLink('c:\\foo (5,3)', 'c:\\foo', '5', '3');
			testLink('c:\\foo on line 5', 'c:\\foo', '5');
			testLink('c:\\foo on line 5, column 3', 'c:\\foo', '5', '3');

			testLink('c:/foo:5', 'c:/foo', '5');
			testLink('c:/foo:5:3', 'c:/foo', '5', '3');
			testLink('c:/foo:line 5', 'c:/foo', '5');
			testLink('c:/foo:line 5, column 3', 'c:/foo', '5', '3');
			testLink('c:/foo(5)', 'c:/foo', '5');
			testLink('c:/foo(5,3)', 'c:/foo', '5', '3');
			testLink('c:/foo (5)', 'c:/foo', '5');
			testLink('c:/foo (5,3)', 'c:/foo', '5', '3');
			testLink('c:/foo on line 5', 'c:/foo', '5');
			testLink('c:/foo on line 5, column 3', 'c:/foo', '5', '3');

			testLink('.\\foo:5', '.\\foo', '5');
			testLink('.\\foo:5:3', '.\\foo', '5', '3');
			testLink('.\\foo:line 5', '.\\foo', '5');
			testLink('.\\foo:line 5, column 3', '.\\foo', '5', '3');
			testLink('.\\foo(5)', '.\\foo', '5');
			testLink('.\\foo(5,3)', '.\\foo', '5', '3');
			testLink('.\\foo (5)', '.\\foo', '5');
			testLink('.\\foo (5,3)', '.\\foo', '5', '3');
			testLink('.\\foo on line 5', '.\\foo', '5');
			testLink('.\\foo on line 5, column 3', '.\\foo', '5', '3');

			testLink('./foo:5', './foo', '5');
			testLink('./foo:5:3', './foo', '5', '3');
			testLink('./foo:line 5', './foo', '5');
			testLink('./foo:line 5, column 3', './foo', '5', '3');
			testLink('./foo(5)', './foo', '5');
			testLink('./foo(5,3)', './foo', '5', '3');
			testLink('./foo (5)', './foo', '5');
			testLink('./foo (5,3)', './foo', '5', '3');
			testLink('./foo on line 5', './foo', '5');
			testLink('./foo on line 5, column 3', './foo', '5', '3');

			testLink('..\\foo:5', '..\\foo', '5');
			testLink('..\\foo:5:3', '..\\foo', '5', '3');
			testLink('..\\foo:line 5', '..\\foo', '5');
			testLink('..\\foo:line 5, column 3', '..\\foo', '5', '3');
			testLink('..\\foo(5)', '..\\foo', '5');
			testLink('..\\foo(5,3)', '..\\foo', '5', '3');
			testLink('..\\foo (5)', '..\\foo', '5');
			testLink('..\\foo (5,3)', '..\\foo', '5', '3');
			testLink('..\\foo on line 5', '..\\foo', '5');
			testLink('..\\foo on line 5, column 3', '..\\foo', '5', '3');

			testLink('../foo:5', '../foo', '5');
			testLink('../foo:5:3', '../foo', '5', '3');
			testLink('../foo:line 5', '../foo', '5');
			testLink('../foo:line 5, column 3', '../foo', '5', '3');
			testLink('../foo(5)', '../foo', '5');
			testLink('../foo(5,3)', '../foo', '5', '3');
			testLink('../foo (5)', '../foo', '5');
			testLink('../foo (5,3)', '../foo', '5', '3');
			testLink('../foo on line 5', '../foo', '5');
			testLink('../foo on line 5, column 3', '../foo', '5', '3');

			testLink('~\\foo:5', '~\\foo', '5');
			testLink('~\\foo:5:3', '~\\foo', '5', '3');
			testLink('~\\foo:line 5', '~\\foo', '5');
			testLink('~\\foo:line 5, column 3', '~\\foo', '5', '3');
			testLink('~\\foo(5)', '~\\foo', '5');
			testLink('~\\foo(5,3)', '~\\foo', '5', '3');
			testLink('~\\foo (5)', '~\\foo', '5');
			testLink('~\\foo (5,3)', '~\\foo', '5', '3');
			testLink('~\\foo on line 5', '~\\foo', '5');
			testLink('~\\foo on line 5, column 3', '~\\foo', '5', '3');

			testLink('~/foo:5', '~/foo', '5');
			testLink('~/foo:5:3', '~/foo', '5', '3');
			testLink('~/foo:line 5', '~/foo', '5');
			testLink('~/foo:line 5, column 3', '~/foo', '5', '3');
			testLink('~/foo(5)', '~/foo', '5');
			testLink('~/foo(5,3)', '~/foo', '5', '3');
			testLink('~/foo (5)', '~/foo', '5');
			testLink('~/foo (5,3)', '~/foo', '5', '3');
			testLink('~/foo on line 5', '~/foo', '5');
			testLink('~/foo on line 5, column 3', '~/foo', '5', '3');

			testLink('c:/a/long/path:5', 'c:/a/long/path', '5');
			testLink('c:/a/long/path:5:3', 'c:/a/long/path', '5', '3');
			testLink('c:/a/long/path:line 5', 'c:/a/long/path', '5');
			testLink('c:/a/long/path:line 5, column 3', 'c:/a/long/path', '5', '3');
			testLink('c:/a/long/path(5)', 'c:/a/long/path', '5');
			testLink('c:/a/long/path(5,3)', 'c:/a/long/path', '5', '3');
			testLink('c:/a/long/path (5)', 'c:/a/long/path', '5');
			testLink('c:/a/long/path (5,3)', 'c:/a/long/path', '5', '3');
			testLink('c:/a/long/path on line 5', 'c:/a/long/path', '5');
			testLink('c:/a/long/path on line 5, column 3', 'c:/a/long/path', '5', '3');

			testLink('c:\\a\\long\\path:5', 'c:\\a\\long\\path', '5');
			testLink('c:\\a\\long\\path:5:3', 'c:\\a\\long\\path', '5', '3');
			testLink('c:\\a\\long\\path:line 5', 'c:\\a\\long\\path', '5');
			testLink('c:\\a\\long\\path:line 5, column 3', 'c:\\a\\long\\path', '5', '3');
			testLink('c:\\a\\long\\path(5)', 'c:\\a\\long\\path', '5');
			testLink('c:\\a\\long\\path(5,3)', 'c:\\a\\long\\path', '5', '3');
			testLink('c:\\a\\long\\path (5)', 'c:\\a\\long\\path', '5');
			testLink('c:\\a\\long\\path (5,3)', 'c:\\a\\long\\path', '5', '3');
			testLink('c:\\a\\long\\path on line 5', 'c:\\a\\long\\path', '5');
			testLink('c:\\a\\long\\path on line 5, column 3', 'c:\\a\\long\\path', '5', '3');

			testLink('c:\\mixed/slash\\path:5', 'c:\\mixed/slash\\path', '5');
			testLink('c:\\mixed/slash\\path:5:3', 'c:\\mixed/slash\\path', '5', '3');
			testLink('c:\\mixed/slash\\path:line 5', 'c:\\mixed/slash\\path', '5');
			testLink('c:\\mixed/slash\\path:line 5, column 3', 'c:\\mixed/slash\\path', '5', '3');
			testLink('c:\\mixed/slash\\path(5)', 'c:\\mixed/slash\\path', '5');
			testLink('c:\\mixed/slash\\path(5,3)', 'c:\\mixed/slash\\path', '5', '3');
			testLink('c:\\mixed/slash\\path (5)', 'c:\\mixed/slash\\path', '5');
			testLink('c:\\mixed/slash\\path (5,3)', 'c:\\mixed/slash\\path', '5', '3');
			testLink('c:\\mixed/slash\\path on line 5', 'c:\\mixed/slash\\path', '5');
			testLink('c:\\mixed/slash\\path on line 5, column 3', 'c:\\mixed/slash\\path', '5', '3');

			testLink('a/relative/path:5', 'a/relative/path', '5');
			testLink('a/relative/path:5:3', 'a/relative/path', '5', '3');
			testLink('a/relative/path:line 5', 'a/relative/path', '5');
			testLink('a/relative/path:line 5, column 3', 'a/relative/path', '5', '3');
			testLink('a/relative/path(5)', 'a/relative/path', '5');
			testLink('a/relative/path(5,3)', 'a/relative/path', '5', '3');
			testLink('a/relative/path (5)', 'a/relative/path', '5');
			testLink('a/relative/path (5,3)', 'a/relative/path', '5', '3');
			testLink('a/relative/path on line 5', 'a/relative/path', '5');
			testLink('a/relative/path on line 5, column 3', 'a/relative/path', '5', '3');
		});

		test('Linux', () => {
			const terminalLinkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Linux, null, null, null);
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

			testLink('/foo', '/foo');
			testLink('~/foo', '~/foo');
			testLink('./foo', './foo');
			testLink('../foo', '../foo');
			testLink('/a/long/path', '/a/long/path');
			testLink('a/relative/path', 'a/relative/path');

			// With line and column number.
			testLink('/foo:5', '/foo', '5');
			testLink('/foo:5:3', '/foo', '5', '3');
			testLink('/foo:line 5', '/foo', '5');
			testLink('/foo:line 5, column 3', '/foo', '5', '3');
			testLink('/foo(5)', '/foo', '5');
			testLink('/foo(5,3)', '/foo', '5', '3');
			testLink('/foo (5)', '/foo', '5');
			testLink('/foo (5,3)', '/foo', '5', '3');
			testLink('/foo on line 5', '/foo', '5');
			testLink('/foo on line 5, column 3', '/foo', '5', '3');

			testLink('~/foo:5', '~/foo', '5');
			testLink('~/foo:5:3', '~/foo', '5', '3');
			testLink('~/foo:line 5', '~/foo', '5');
			testLink('~/foo:line 5, column 3', '~/foo', '5', '3');
			testLink('~/foo(5)', '~/foo', '5');
			testLink('~/foo(5,3)', '~/foo', '5', '3');
			testLink('~/foo (5)', '~/foo', '5');
			testLink('~/foo (5,3)', '~/foo', '5', '3');
			testLink('~/foo on line 5', '~/foo', '5');
			testLink('~/foo on line 5, column 3', '~/foo', '5', '3');

			testLink('./foo:5', './foo', '5');
			testLink('./foo:5:3', './foo', '5', '3');
			testLink('./foo:line 5', './foo', '5');
			testLink('./foo:line 5, column 3', './foo', '5', '3');
			testLink('./foo(5)', './foo', '5');
			testLink('./foo(5,3)', './foo', '5', '3');
			testLink('./foo (5)', './foo', '5');
			testLink('./foo (5,3)', './foo', '5', '3');
			testLink('./foo on line 5', './foo', '5');
			testLink('./foo on line 5, column 3', './foo', '5', '3');

			testLink('../foo:5', '../foo', '5');
			testLink('../foo:5:3', '../foo', '5', '3');
			testLink('../foo:line 5', '../foo', '5');
			testLink('../foo:line 5, column 3', '../foo', '5', '3');
			testLink('../foo(5)', '../foo', '5');
			testLink('../foo(5,3)', '../foo', '5', '3');
			testLink('../foo (5)', '../foo', '5');
			testLink('../foo (5,3)', '../foo', '5', '3');
			testLink('../foo on line 5', '../foo', '5');
			testLink('../foo on line 5, column 3', '../foo', '5', '3');

			testLink('/a/long/path:5', '/a/long/path', '5');
			testLink('/a/long/path:5:3', '/a/long/path', '5', '3');
			testLink('/a/long/path:line 5', '/a/long/path', '5');
			testLink('/a/long/path:line 5, column 3', '/a/long/path', '5', '3');
			testLink('/a/long/path(5)', '/a/long/path', '5');
			testLink('/a/long/path(5,3)', '/a/long/path', '5', '3');
			testLink('/a/long/path (5)', '/a/long/path', '5');
			testLink('/a/long/path (5,3)', '/a/long/path', '5', '3');
			testLink('/a/long/path on line 5', '/a/long/path', '5');
			testLink('/a/long/path on line 5, column 3', '/a/long/path', '5', '3');

			testLink('a/relative/path:5', 'a/relative/path', '5');
			testLink('a/relative/path:5:3', 'a/relative/path', '5', '3');
			testLink('a/relative/path:line 5', 'a/relative/path', '5');
			testLink('a/relative/path:line 5, column 3', 'a/relative/path', '5', '3');
			testLink('a/relative/path(5)', 'a/relative/path', '5');
			testLink('a/relative/path(5,3)', 'a/relative/path', '5', '3');
			testLink('a/relative/path (5)', 'a/relative/path', '5');
			testLink('a/relative/path (5,3)', 'a/relative/path', '5', '3');
			testLink('a/relative/path on line 5', 'a/relative/path', '5');
			testLink('a/relative/path on line 5, column 3', 'a/relative/path', '5', '3');
		});
	});

	suite('preprocessPath', () => {
		test('Windows', () => {
			const linkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Windows, null, null,
				new WorkspaceContextService(new TestWorkspace('C:\\base')));

			let stub = sinon.stub(path, 'join', function (arg1, arg2) {
				return arg1 + '\\' + arg2;
			});
			assert.equal(linkHandler.preprocessPath('./src/file1'), 'C:\\base\\./src/file1');
			assert.equal(linkHandler.preprocessPath('src\\file2'), 'C:\\base\\src\\file2');
			assert.equal(linkHandler.preprocessPath('C:\\absolute\\path\\file3'), 'C:\\absolute\\path\\file3');

			stub.restore();
		});

		test('Linux', () => {
			const linkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Linux, null, null,
				new WorkspaceContextService(new TestWorkspace('/base')));

			let stub = sinon.stub(path, 'join', function (arg1, arg2) {
				return arg1 + '/' + arg2;
			});

			assert.equal(linkHandler.preprocessPath('./src/file1'), '/base/./src/file1');
			assert.equal(linkHandler.preprocessPath('src/file2'), '/base/src/file2');
			assert.equal(linkHandler.preprocessPath('/absolute/path/file3'), '/absolute/path/file3');
			stub.restore();
		});

		test('No Workspace', () => {
			const linkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Linux, null, null, new WorkspaceContextService(null));

			assert.equal(linkHandler.preprocessPath('./src/file1'), null);
			assert.equal(linkHandler.preprocessPath('src/file2'), null);
			assert.equal(linkHandler.preprocessPath('/absolute/path/file3'), '/absolute/path/file3');
		});
	});
});