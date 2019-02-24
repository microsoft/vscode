/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IFileService, IResourceEncodings, IResolveFileOptions, IFileStat, IResolveFileResult, IResolveContentOptions, IContent, IStreamContent, ITextSnapshot, IUpdateContentOptions, ICreateFileOptions, snapshotToString } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { basename, joinPath } from 'vs/base/common/resources';
import { workspaceResource } from 'vs/workbench/nodeless/services/simpleWorkspaceService';
import { ResourceMap } from 'vs/base/common/map';

const fileMap: ResourceMap<IFileStat> = new ResourceMap();
const contentMap: ResourceMap<IContent> = new ResourceMap();
initFakeFileSystem();

export class SimpleRemoteFileService implements IFileService {

	_serviceBrand: any;

	encoding: IResourceEncodings;

	readonly onFileChanges = Event.None;
	readonly onAfterOperation = Event.None;
	readonly onDidChangeFileSystemProviderRegistrations = Event.None;

	resolveFile(resource: URI, options?: IResolveFileOptions): Promise<IFileStat> {
		return Promise.resolve(fileMap.get(resource));
	}

	resolveFiles(toResolve: { resource: URI, options?: IResolveFileOptions }[]): Promise<IResolveFileResult[]> {
		return Promise.all(toResolve.map(resourceAndOption => this.resolveFile(resourceAndOption.resource, resourceAndOption.options))).then(stats => stats.map(stat => ({ stat, success: true })));
	}

	existsFile(resource: URI): Promise<boolean> {
		return Promise.resolve(fileMap.has(resource));
	}

	resolveContent(resource: URI, _options?: IResolveContentOptions): Promise<IContent> {
		return Promise.resolve(contentMap.get(resource));
	}

	resolveStreamContent(resource: URI, _options?: IResolveContentOptions): Promise<IStreamContent> {
		return Promise.resolve(contentMap.get(resource)).then(content => {
			return {
				resource: content.resource,
				value: {
					on: (event: string, callback: Function): void => {
						if (event === 'data') {
							callback(content.value);
						}

						if (event === 'end') {
							callback();
						}
					}
				},
				etag: content.etag,
				encoding: content.encoding,
				mtime: content.mtime,
				name: content.name
			};
		});
	}

	updateContent(resource: URI, value: string | ITextSnapshot, _options?: IUpdateContentOptions): Promise<IFileStat> {
		return Promise.resolve(fileMap.get(resource)).then(file => {
			const content = contentMap.get(resource);

			if (typeof value === 'string') {
				content.value = value;
			} else {
				content.value = snapshotToString(value);
			}

			return file;
		});
	}

	moveFile(_source: URI, _target: URI, _overwrite?: boolean): Promise<IFileStat> { return Promise.resolve(null!); }

	copyFile(_source: URI, _target: URI, _overwrite?: boolean): Promise<IFileStat> { throw new Error('not implemented'); }

	createFile(_resource: URI, _content?: string, _options?: ICreateFileOptions): Promise<IFileStat> { throw new Error('not implemented'); }

	readFolder(_resource: URI) { return Promise.resolve([]); }

	createFolder(_resource: URI): Promise<IFileStat> { throw new Error('not implemented'); }

	registerProvider(_scheme: string, _provider) { return { dispose() { } }; }

	activateProvider(_scheme: string): Promise<void> { return Promise.resolve(undefined); }

	canHandleResource(resource: URI): boolean { return resource.scheme === 'file'; }

	del(_resource: URI, _options?: { useTrash?: boolean, recursive?: boolean }): Promise<void> { return Promise.resolve(); }

	watchFileChanges(_resource: URI): void { }

	unwatchFileChanges(_resource: URI): void { }

	getWriteEncoding(_resource: URI): string { return 'utf8'; }

	dispose(): void { }
}

function initFakeFileSystem(): void {

	function createFile(parent: IFileStat, name: string, content: string): void {
		const file: IFileStat = {
			resource: joinPath(parent.resource, name),
			etag: Date.now().toString(),
			mtime: Date.now(),
			isDirectory: false,
			name
		};

		parent.children.push(file);

		fileMap.set(file.resource, file);

		contentMap.set(file.resource, {
			resource: joinPath(parent.resource, name),
			etag: Date.now().toString(),
			mtime: Date.now(),
			value: content,
			encoding: 'utf8',
			name
		} as IContent);
	}

	function createFolder(parent: IFileStat, name: string): IFileStat {
		const folder: IFileStat = {
			resource: joinPath(parent.resource, name),
			etag: Date.now().toString(),
			mtime: Date.now(),
			isDirectory: true,
			name,
			children: []
		};

		parent.children.push(folder);

		fileMap.set(folder.resource, folder);

		return folder;
	}

	const root: IFileStat = {
		resource: workspaceResource,
		etag: Date.now().toString(),
		mtime: Date.now(),
		isDirectory: true,
		name: basename(workspaceResource),
		children: []
	};

	fileMap.set(root.resource, root);

	createFile(root, '.gitignore', `out
node_modules
.vscode-test/
*.vsix
`);
	createFile(root, '.vscodeignore', `.vscode/**
.vscode-test/**
out/test/**
src/**
.gitignore
vsc-extension-quickstart.md
**/tsconfig.json
**/tslint.json
**/*.map
**/*.ts`);
	createFile(root, 'CHANGELOG.md', `# Change Log
All notable changes to the "test-ts" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
- Initial release`);
	createFile(root, 'package.json', `{
	"name": "test-ts",
	"displayName": "test-ts",
	"description": "",
	"version": "0.0.1",
	"engines": {
		"vscode": "^1.31.0"
	},
	"categories": [
		"Other"
	],
	"activationEvents": [
		"onCommand:extension.helloWorld"
	],
	"main": "./out/extension.js",
	"contributes": {
		"commands": [
			{
				"command": "extension.helloWorld",
				"title": "Hello World"
			}
		]
	},
	"scripts": {
		"vscode:prepublish": "npm run compile",
		"compile": "tsc -p ./",
		"watch": "tsc -watch -p ./",
		"postinstall": "node ./node_modules/vscode/bin/install",
		"test": "npm run compile && node ./node_modules/vscode/bin/test"
	},
	"devDependencies": {
		"typescript": "^3.3.1",
		"vscode": "^1.1.28",
		"tslint": "^5.12.1",
		"@types/node": "^8.10.25",
		"@types/mocha": "^2.2.42"
	}
}
`);
	createFile(root, 'tsconfig.json', `{
	"compilerOptions": {
		"module": "commonjs",
		"target": "es6",
		"outDir": "out",
		"lib": [
			"es6"
		],
		"sourceMap": true,
		"rootDir": "src",
		"strict": true   /* enable all strict type-checking options */
		/* Additional Checks */
		// "noImplicitReturns": true, /* Report error when not all code paths in function return a value. */
		// "noFallthroughCasesInSwitch": true, /* Report errors for fallthrough cases in switch statement. */
		// "noUnusedParameters": true,  /* Report errors on unused parameters. */
	},
	"exclude": [
		"node_modules",
		".vscode-test"
	]
}
`);
	createFile(root, 'tslint.json', `{
	"rules": {
		"no-string-throw": true,
		"no-unused-expression": true,
		"no-duplicate-variable": true,
		"curly": true,
		"class-name": true,
		"semicolon": [
			true,
			"always"
		],
		"triple-equals": true
	},
	"defaultSeverity": "warning"
}
`);

	const src = createFolder(root, 'src');
	createFile(src, 'extension.ts', `// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
		console.log('Congratulations, your extension "test-ts" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!');
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
`);

	const test = createFolder(src, 'test');

	createFile(test, 'extension.test.ts', `//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as vscode from 'vscode';
// import * as myExtension from '../extension';

// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", function () {

	// Defines a Mocha unit test
	test("Something 1", function() {
		assert.equal(-1, [1, 2, 3].indexOf(5));
		assert.equal(-1, [1, 2, 3].indexOf(0));
	});
});`);

	createFile(test, 'index.ts', `//
// PLEASE DO NOT MODIFY / DELETE UNLESS YOU KNOW WHAT YOU ARE DOING
//
// This file is providing the test runner to use when running extension tests.
// By default the test runner in use is Mocha based.
//
// You can provide your own test runner if you want to override it by exporting
// a function run(testRoot: string, clb: (error:Error) => void) that the extension
// host can call to run the tests. The test runner is expected to use console.log
// to report the results back to the caller. When the tests are finished, return
// a possible error to the callback or null if none.

import * as testRunner from 'vscode/lib/testrunner';

// You can directly control Mocha options by configuring the test runner below
// See https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically#set-options
// for more info
testRunner.configure({
	ui: 'tdd', 		// the TDD UI is being used in extension.test.ts (suite, test, etc.)
	useColors: true // colored output from test results
});

module.exports = testRunner;`);
}