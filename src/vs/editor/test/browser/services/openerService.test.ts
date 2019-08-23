/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { TestCodeEditorService } from 'vs/editor/test/browser/editorTestServices';
import { CommandsRegistry, ICommandService, NullCommandService } from 'vs/platform/commands/common/commands';

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

	setup(function () {
		lastCommand = undefined;
	});

	test('delegate to editorService, scheme:///fff', function () {
		const openerService = new OpenerService(editorService, NullCommandService);
		openerService.open(URI.parse('another:///somepath'));
		assert.equal(editorService.lastInput!.options!.selection, undefined);
	});

	test('delegate to editorService, scheme:///fff#L123', function () {

		const openerService = new OpenerService(editorService, NullCommandService);

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

		const openerService = new OpenerService(editorService, NullCommandService);

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

		const openerService = new OpenerService(editorService, commandService);

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
});
