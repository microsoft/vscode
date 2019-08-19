/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { TestCodeEditorService } from 'vs/editor/test/browser/editorTestServices';
import { CommandsRegistry, ICommandService, NullCommandService } from 'vs/platform/commands/common/commands';
import { deepClone } from 'vs/base/common/objects';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IProductService } from 'vs/platform/product/common/product';
import { IStorageService } from 'vs/platform/storage/common/storage';

suite('OpenerService', function () {

	const editorService = new TestCodeEditorService();

	let lastCommand: { id: string, args: any[] } | undefined;

	const commandService = new class implements ICommandService {
		_serviceBrand: any;
		onWillExecuteCommand = () => ({ dispose: () => { } });
		onDidExecuteCommand = () => ({ dispose: () => { } });
		executeCommand(id: string, ...args: any[]): Promise<any> {
			lastCommand = { id, args };
			return Promise.resolve(undefined);
		}
	};

	function getStorageService(trustedDomainsSetting: string[]) {
		let _settings = deepClone(trustedDomainsSetting);

		return new class implements IStorageService {
			get = () => JSON.stringify(_settings);
			store = (key: string, val: string) => _settings = JSON.parse(val);

			// Don't care
			_serviceBrand: any;

			onDidChangeStorage = () => ({ dispose: () => { } });
			onWillSaveState = () => ({ dispose: () => { } });

			getBoolean = () => true;
			getNumber = () => 0;
			remove = () => { };
			logStorage = () => { };
		};
	}

	function getDialogService() {
		return new class implements IDialogService {
			_showInvoked = 0;
			show = () => {
				this._showInvoked++;
				return Promise.resolve({} as any);
			}
			get confirmInvoked() { return this._showInvoked; }

			// Don't care
			_serviceBrand: any;
			confirm = () => {
				return Promise.resolve({} as any);
			}
		};
	}

	function getProductService(): IProductService {
		return new class {
			nameShort: 'VS Code';

			_serviceBrand: any;
		} as IProductService;
	}


	setup(function () {
		lastCommand = undefined;
	});

	test('delegate to editorService, scheme:///fff', function () {
		const openerService = new OpenerService(
			editorService,
			NullCommandService,
			getStorageService([]),
			getDialogService(),
			getProductService()
		);
		openerService.open(URI.parse('another:///somepath'));
		assert.equal(editorService.lastInput!.options!.selection, undefined);
	});

	test('delegate to editorService, scheme:///fff#L123', function () {

		const openerService = new OpenerService(
			editorService,
			NullCommandService,
			getStorageService([]),
			getDialogService(),
			getProductService()
		);

		openerService.open(URI.parse('file:///somepath#L23'));
		assert.equal(editorService.lastInput!.options!.selection!.startLineNumber, 23);
		assert.equal(editorService.lastInput!.options!.selection!.startColumn, 1);
		assert.equal(editorService.lastInput!.options!.selection!.endLineNumber, undefined);
		assert.equal(editorService.lastInput!.options!.selection!.endColumn, undefined);
		assert.equal(editorService.lastInput!.resource.fragment, '');

		openerService.open(URI.parse('another:///somepath#L23'));
		assert.equal(editorService.lastInput!.options!.selection!.startLineNumber, 23);
		assert.equal(editorService.lastInput!.options!.selection!.startColumn, 1);

		openerService.open(URI.parse('another:///somepath#L23,45'));
		assert.equal(editorService.lastInput!.options!.selection!.startLineNumber, 23);
		assert.equal(editorService.lastInput!.options!.selection!.startColumn, 45);
		assert.equal(editorService.lastInput!.options!.selection!.endLineNumber, undefined);
		assert.equal(editorService.lastInput!.options!.selection!.endColumn, undefined);
		assert.equal(editorService.lastInput!.resource.fragment, '');
	});

	test('delegate to editorService, scheme:///fff#123,123', function () {

		const openerService = new OpenerService(
			editorService,
			NullCommandService,
			getStorageService([]),
			getDialogService(),
			getProductService()
		);

		openerService.open(URI.parse('file:///somepath#23'));
		assert.equal(editorService.lastInput!.options!.selection!.startLineNumber, 23);
		assert.equal(editorService.lastInput!.options!.selection!.startColumn, 1);
		assert.equal(editorService.lastInput!.options!.selection!.endLineNumber, undefined);
		assert.equal(editorService.lastInput!.options!.selection!.endColumn, undefined);
		assert.equal(editorService.lastInput!.resource.fragment, '');

		openerService.open(URI.parse('file:///somepath#23,45'));
		assert.equal(editorService.lastInput!.options!.selection!.startLineNumber, 23);
		assert.equal(editorService.lastInput!.options!.selection!.startColumn, 45);
		assert.equal(editorService.lastInput!.options!.selection!.endLineNumber, undefined);
		assert.equal(editorService.lastInput!.options!.selection!.endColumn, undefined);
		assert.equal(editorService.lastInput!.resource.fragment, '');
	});

	test('delegate to commandsService, command:someid', function () {

		const openerService = new OpenerService(
			editorService,
			commandService,
			getStorageService([]),
			getDialogService(),
			getProductService()
		);

		const id = `aCommand${Math.random()}`;
		CommandsRegistry.registerCommand(id, function () { });

		openerService.open(URI.parse('command:' + id));
		assert.equal(lastCommand!.id, id);
		assert.equal(lastCommand!.args.length, 0);

		openerService.open(URI.parse('command:' + id).with({ query: '123' }));
		assert.equal(lastCommand!.id, id);
		assert.equal(lastCommand!.args.length, 1);
		assert.equal(lastCommand!.args[0], '123');

		openerService.open(URI.parse('command:' + id).with({ query: JSON.stringify([12, true]) }));
		assert.equal(lastCommand!.id, id);
		assert.equal(lastCommand!.args.length, 2);
		assert.equal(lastCommand!.args[0], 12);
		assert.equal(lastCommand!.args[1], true);
	});

	test('links are protected by dialog.show', function () {
		const dialogService = getDialogService();
		const openerService = new OpenerService(
			editorService,
			commandService,
			getStorageService([]),
			dialogService,
			getProductService()
		);

		openerService.open(URI.parse('https://www.microsoft.com'));
		assert.equal(dialogService.confirmInvoked, 1);
	});

	test('links on the whitelisted domains can be opened without dialog.show', function () {
		const dialogService = getDialogService();
		const openerService = new OpenerService(
			editorService,
			commandService,
			getStorageService(['https://microsoft.com']),
			dialogService,
			getProductService()
		);

		openerService.open(URI.parse('https://microsoft.com'));
		openerService.open(URI.parse('https://microsoft.com/'));
		openerService.open(URI.parse('https://microsoft.com/en-us/'));
		openerService.open(URI.parse('https://microsoft.com/en-us/?foo=bar'));
		openerService.open(URI.parse('https://microsoft.com/en-us/?foo=bar#baz'));

		assert.equal(dialogService.confirmInvoked, 0);
	});

	test('variations of links are protected by dialog confirmation', function () {
		const dialogService = getDialogService();
		const openerService = new OpenerService(
			editorService,
			commandService,
			getStorageService(['https://microsoft.com']),
			dialogService,
			getProductService()
		);

		openerService.open(URI.parse('http://microsoft.com'));
		openerService.open(URI.parse('https://www.microsoft.com'));

		assert.equal(dialogService.confirmInvoked, 2);
	});

	test('* removes all link protection', function () {
		const dialogService = getDialogService();
		const openerService = new OpenerService(
			editorService,
			commandService,
			getStorageService(['*']),
			dialogService,
			getProductService()
		);

		openerService.open(URI.parse('https://code.visualstudio.com/'));
		openerService.open(URI.parse('https://www.microsoft.com'));
		openerService.open(URI.parse('https://www.github.com'));

		assert.equal(dialogService.confirmInvoked, 0);
	});
});
