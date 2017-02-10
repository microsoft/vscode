/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { SimpleConfigurationService, SimpleMessageService, StandaloneKeybindingService, StandaloneCommandService } from 'vs/editor/browser/standalone/simpleServices';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SimpleKeybinding, KeyCode } from 'vs/base/common/keyCodes';
import { SimpleKeyPress } from 'vs/platform/keybinding/common/keyPress';

suite('StandaloneKeybindingService', () => {

	class TestStandaloneKeybindingService extends StandaloneKeybindingService {
		public dispatch(keybinding: SimpleKeybinding): void {
			super._dispatch(<SimpleKeyPress>this._keybindingToKeyPress(keybinding), null);
		}
	}

	test('issue Microsoft/monaco-editor#167', () => {

		let serviceCollection = new ServiceCollection();
		const instantiationService = new InstantiationService(serviceCollection, true);

		let configurationService = new SimpleConfigurationService();

		let contextKeyService = new ContextKeyService(configurationService);

		let commandService = new StandaloneCommandService(instantiationService);

		let messageService = new SimpleMessageService();

		let domElement = document.createElement('div');

		let keybindingService = new TestStandaloneKeybindingService(contextKeyService, commandService, messageService, domElement);

		let commandInvoked = false;
		keybindingService.addDynamicKeybinding('testCommand', KeyCode.F9, () => {
			commandInvoked = true;
		}, null);

		keybindingService.dispatch(new SimpleKeybinding(KeyCode.F9));

		assert.ok(commandInvoked, 'command invoked');
	});
});
