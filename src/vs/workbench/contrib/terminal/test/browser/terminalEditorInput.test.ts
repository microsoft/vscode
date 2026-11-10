/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TerminalExitReason, TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ILifecycleService, ShutdownReason } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../test/common/workbenchTestServices.js';
import { ITerminalInstance, ITerminalInstanceService } from '../../browser/terminal.js';
import { TerminalEditorInput } from '../../browser/terminalEditorInput.js';

suite('TerminalEditorInput', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createInput(shouldPersist: boolean, calls: string[]) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const lifecycleService = disposables.add(new TestLifecycleService());
		instantiationService.stub(ILifecycleService, lifecycleService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [TerminalSettingId.EnablePersistentSessions]: true }));
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() { }());
		instantiationService.stub(ITerminalInstanceService, new class extends mock<ITerminalInstanceService>() { }());
		const instance = new class extends mock<ITerminalInstance>() {
			override readonly shouldPersist = shouldPersist;
			override readonly onExit = Event.None;
			override readonly onDisposed = Event.None;
			override readonly onTitleChanged = Event.None;
			override readonly onIconChanged = Event.None;
			override readonly onDidFocus = Event.None;
			override readonly onDidBlur = Event.None;
			override readonly statusList = new class extends mock<ITerminalInstance['statusList']>() { override readonly onDidChangePrimaryStatus = Event.None; }();
			override dispose(reason?: TerminalExitReason) { calls.push(`dispose:${reason}`); }
			override async detachProcessAndDispose(reason: TerminalExitReason) { calls.push(`detach:${reason}`); }
		}();
		const input = disposables.add(instantiationService.createInstance(TerminalEditorInput, URI.parse('vscode-terminal:/1/1'), instance));
		return { input, lifecycleService };
	}

	test('on reload, keeps the process of a terminal that persists to reattach to, and ends one that does not persist, such as of an agent host terminal, as the panel does', () => {
		const persisting: string[] = [];
		const notPersisting: string[] = [];
		createInput(true, persisting).lifecycleService.fireShutdown(ShutdownReason.RELOAD);
		createInput(false, notPersisting).lifecycleService.fireShutdown(ShutdownReason.RELOAD);

		assert.deepStrictEqual({ persisting, notPersisting }, {
			persisting: [`detach:${TerminalExitReason.Shutdown}`],
			notPersisting: [`dispose:${TerminalExitReason.Shutdown}`],
		});
	});
});
