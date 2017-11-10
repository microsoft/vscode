/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as assert from 'assert';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEditorService, IResourceInput } from 'vs/platform/editor/common/editor';
import { ICommandService, NullCommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { OpenerService } from 'vs/platform/opener/browser/openerService';

suite('OpenerService', function () {

	let lastInput: IResourceInput;

	const editorService = new class implements IEditorService {
		_serviceBrand: any;
		openEditor(input: IResourceInput): any {
			lastInput = input;
		}
	};

	let lastCommand: { id: string, args: any[] };

	const commandService = new class implements ICommandService {
		_serviceBrand: any;
		onWillExecuteCommand = () => ({ dispose: () => { } });
		executeCommand(id: string, ...args: any[]): TPromise<any> {
			lastCommand = { id, args };
			return TPromise.as(undefined);
		}
	};

	setup(function () {
		lastInput = undefined;
		lastCommand = undefined;
	});

	test('delegate to editorService, scheme:///fff', function () {
		const openerService = new OpenerService(editorService, NullCommandService);
		openerService.open(URI.parse('another:///somepath'));
		assert.equal(lastInput.options.selection, undefined);
	});

	test('delegate to editorService, scheme:///fff#L123', function () {

		const openerService = new OpenerService(editorService, NullCommandService);

		openerService.open(URI.parse('file:///somepath#L23'));
		assert.equal(lastInput.options.selection.startLineNumber, 23);
		assert.equal(lastInput.options.selection.startColumn, 1);
		assert.equal(lastInput.options.selection.endLineNumber, undefined);
		assert.equal(lastInput.options.selection.endColumn, undefined);
		assert.equal(lastInput.resource.fragment, '');

		openerService.open(URI.parse('another:///somepath#L23'));
		assert.equal(lastInput.options.selection.startLineNumber, 23);
		assert.equal(lastInput.options.selection.startColumn, 1);

		openerService.open(URI.parse('another:///somepath#L23,45'));
		assert.equal(lastInput.options.selection.startLineNumber, 23);
		assert.equal(lastInput.options.selection.startColumn, 45);
		assert.equal(lastInput.options.selection.endLineNumber, undefined);
		assert.equal(lastInput.options.selection.endColumn, undefined);
		assert.equal(lastInput.resource.fragment, '');
	});

	test('delegate to editorService, scheme:///fff#123,123', function () {

		const openerService = new OpenerService(editorService, NullCommandService);

		openerService.open(URI.parse('file:///somepath#23'));
		assert.equal(lastInput.options.selection.startLineNumber, 23);
		assert.equal(lastInput.options.selection.startColumn, 1);
		assert.equal(lastInput.options.selection.endLineNumber, undefined);
		assert.equal(lastInput.options.selection.endColumn, undefined);
		assert.equal(lastInput.resource.fragment, '');

		openerService.open(URI.parse('file:///somepath#23,45'));
		assert.equal(lastInput.options.selection.startLineNumber, 23);
		assert.equal(lastInput.options.selection.startColumn, 45);
		assert.equal(lastInput.options.selection.endLineNumber, undefined);
		assert.equal(lastInput.options.selection.endColumn, undefined);
		assert.equal(lastInput.resource.fragment, '');
	});

	test('delegate to commandsService, command:someid', function () {

		const openerService = new OpenerService(editorService, commandService);

		// unknown command
		openerService.open(URI.parse('command:foobar'));
		assert.equal(lastCommand, undefined);
		assert.equal(lastInput.resource.toString(), 'command:foobar');
		assert.equal(lastInput.options.selection, undefined);

		const id = `aCommand${Math.random()}`;
		CommandsRegistry.registerCommand(id, function () { });

		openerService.open(URI.parse('command:' + id));
		assert.equal(lastCommand.id, id);
		assert.equal(lastCommand.args.length, 0);

		openerService.open(URI.parse('command:' + id).with({ query: '123' }));
		assert.equal(lastCommand.id, id);
		assert.equal(lastCommand.args.length, 1);
		assert.equal(lastCommand.args[0], '123');

		openerService.open(URI.parse('command:' + id).with({ query: JSON.stringify([12, true]) }));
		assert.equal(lastCommand.id, id);
		assert.equal(lastCommand.args.length, 2);
		assert.equal(lastCommand.args[0], 12);
		assert.equal(lastCommand.args[1], true);
	});
});