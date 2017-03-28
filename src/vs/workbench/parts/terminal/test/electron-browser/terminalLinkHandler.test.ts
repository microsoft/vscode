/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Platform } from 'vs/base/common/platform';
import { TerminalLinkHandler } from 'vs/workbench/parts/terminal/electron-browser/terminalLinkHandler';
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
			const regex = new TestTerminalLinkHandler(new TestXterm(), Platform.Windows, null, null).localLinkRegex;
			function testLink(link: string) {
				assert.equal(` ${link} `.match(regex)[1], link);
				assert.equal(`:${link}:`.match(regex)[1], link);
				assert.equal(`;${link};`.match(regex)[1], link);
				assert.equal(`(${link})`.match(regex)[1], link);
			}
			testLink('c:\\foo');
			testLink('c:/foo');
			testLink('.\\foo');
			testLink('./foo');
			testLink('..\\foo');
			testLink('../foo');
			testLink('~\\foo');
			testLink('~/foo');
			testLink('c:/a/long/path');
			testLink('c:\\a\\long\\path');
			testLink('c:\\mixed/slash\\path');
			testLink('a/relative/path');
		});

		test('Linux', () => {
			const regex = new TestTerminalLinkHandler(new TestXterm(), Platform.Linux, null, null).localLinkRegex;
			function testLink(link: string) {
				assert.equal(` ${link} `.match(regex)[1], link);
				assert.equal(`:${link}:`.match(regex)[1], link);
				assert.equal(`;${link};`.match(regex)[1], link);
				assert.equal(`(${link})`.match(regex)[1], link);
			}
			testLink('/foo');
			testLink('~/foo');
			testLink('./foo');
			testLink('../foo');
			testLink('/a/long/path');
			testLink('a/relative/path');
		});
	});

	suite('preprocessPath', () => {
		test('Windows', () => {
			const linkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Windows, null,
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
			const linkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Linux, null,
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
			const linkHandler = new TestTerminalLinkHandler(new TestXterm(), Platform.Linux, null, new WorkspaceContextService(null));

			assert.equal(linkHandler.preprocessPath('./src/file1'), null);
			assert.equal(linkHandler.preprocessPath('src/file2'), null);
			assert.equal(linkHandler.preprocessPath('/absolute/path/file3'), '/absolute/path/file3');
		});
	});
});