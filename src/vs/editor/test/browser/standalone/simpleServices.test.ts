/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { SimpleConfigurationService, SimpleMessageService, SimpleExtensionService, StandaloneKeybindingService, StandaloneCommandService } from 'vs/editor/browser/standalone/simpleServices';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Keybinding } from 'vs/base/common/keybinding';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';

suite('StandaloneKeybindingService', () => {

	class TestStandaloneKeybindingService extends StandaloneKeybindingService {
		public dispatch(e: IKeyboardEvent): void {
			let shouldPreventDefault = super._dispatch(e.toKeybinding(), e.target);
			if (shouldPreventDefault) {
				e.preventDefault();
			}
		}
	}

	test('issue Microsoft/monaco-editor#167', () => {

		let serviceCollection = new ServiceCollection();
		const instantiationService = new InstantiationService(serviceCollection, true);

		let configurationService = new SimpleConfigurationService();

		let contextKeyService = new ContextKeyService(configurationService);

		let extensionService = new SimpleExtensionService();

		let commandService = new StandaloneCommandService(instantiationService, extensionService);

		let messageService = new SimpleMessageService();

		let domElement = document.createElement('div');

		let keybindingService = new TestStandaloneKeybindingService(contextKeyService, commandService, messageService, domElement);

		let commandInvoked = false;
		keybindingService.addDynamicKeybinding(KeyCode.F9, () => {
			commandInvoked = true;
		}, null);

		keybindingService.dispatch(<any>{
			toKeybinding: () => new Keybinding(KeyCode.F9),
			preventDefault: () => { }
		});

		assert.ok(commandInvoked, 'command invoked');
	});
});
