/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyCode } from '../../../../base/common/keyCodes';
import { DisposableStore } from '../../../../base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils';
import { StandaloneCodeEditorService } from '../../browser/standaloneCodeEditorService';
import { StandaloneCommandService, StandaloneConfigurationService, StandaloneKeybindingService, StandaloneNotificationService } from '../../browser/standaloneServices';
import { StandaloneThemeService } from '../../browser/standaloneThemeService';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection';
import { IKeyboardEvent } from '../../../../platform/keybinding/common/keybinding';
import { NullLogService } from '../../../../platform/log/common/log';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils';

suite('StandaloneKeybindingService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	class TestStandaloneKeybindingService extends StandaloneKeybindingService {
		public testDispatch(e: IKeyboardEvent): void {
			super._dispatch(e, null!);
		}
	}

	test('issue microsoft/monaco-editor#167', () => {

		const disposables = new DisposableStore();
		const serviceCollection = new ServiceCollection();
		const instantiationService = new InstantiationService(serviceCollection, true);
		const configurationService = new StandaloneConfigurationService(new NullLogService());
		const contextKeyService = disposables.add(new ContextKeyService(configurationService));
		const commandService = new StandaloneCommandService(instantiationService);
		const notificationService = new StandaloneNotificationService();
		const standaloneThemeService = disposables.add(new StandaloneThemeService());
		const codeEditorService = disposables.add(new StandaloneCodeEditorService(contextKeyService, standaloneThemeService));
		const keybindingService = disposables.add(new TestStandaloneKeybindingService(contextKeyService, commandService, NullTelemetryService, notificationService, new NullLogService(), codeEditorService));

		let commandInvoked = false;
		disposables.add(keybindingService.addDynamicKeybinding('testCommand', KeyCode.F9, () => {
			commandInvoked = true;
		}, undefined));

		keybindingService.testDispatch({
			_standardKeyboardEventBrand: true,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
			metaKey: false,
			altGraphKey: false,
			keyCode: KeyCode.F9,
			code: null!
		});

		assert.ok(commandInvoked, 'command invoked');

		disposables.dispose();
	});
});
