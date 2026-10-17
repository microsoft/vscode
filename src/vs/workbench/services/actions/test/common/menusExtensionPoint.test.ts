/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { mock } from '../../../../test/common/workbenchTestServices.js';
import { commandsExtensionPoint } from '../../common/menusExtensionPoint.js';
import { ExtensionMessageCollector, ExtensionPoint } from '../../../extensions/common/extensionsRegistry.js';

suite('CommandsExtensionPoint', () => {

	const extension = new class extends mock<IExtensionDescription>() {
		override readonly identifier = new ExtensionIdentifier('test.command-enablement');
		override readonly name = 'test-command-enablement';
		override readonly extensionLocation = URI.file('/test-extension');
	}();

	function acceptCommand(enablement: unknown): string[] {
		const messages: string[] = [];

		(commandsExtensionPoint as ExtensionPoint<never>).acceptUsers([{
			description: extension,
			value: {
				command: 'test.command',
				title: 'Test Command',
				enablement
			} as never,
			collector: new ExtensionMessageCollector(
				message => messages.push(message.message),
				extension,
				'commands'
			)
		}]);

		return messages;
	}

	teardown(() => {
		(commandsExtensionPoint as ExtensionPoint<never>).acceptUsers([]);
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects non-string falsy enablement values', () => {
		for (const enablement of [false, 0, null]) {
			const messages = acceptCommand(enablement);

			assert.strictEqual(MenuRegistry.getCommand('test.command'), undefined);
			assert.strictEqual(messages.length, 1);
			assert.ok(messages[0].includes('enablement'));
		}
	});

	test('accepts string enablement', () => {
		const messages = acceptCommand('editorTextFocus');

		assert.strictEqual(messages.length, 0);
		assert.ok(MenuRegistry.getCommand('test.command'));

		(commandsExtensionPoint as ExtensionPoint<never>).acceptUsers([]);
	});
});
