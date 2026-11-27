/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { IVoiceSessionController } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { ChatInputPart } from '../../../chat/browser/widget/input/chatInputPart.js';
import '../../browser/agentsVoice.contribution.js';

suite('Voice Mode input ownership', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const source of ['toolbar', 'keybinding', 'agents-chat', 'agents-draft', 'agents-keybinding', 'agents-draft-keybinding']) {
		test(`starts Voice Mode in the originating input (${source})`, async () => {
			const targets: string[] = [];
			const commands: string[] = [];
			const windowIsAgents = source.startsWith('agents-');
			const service = store.add(workbenchInstantiationService(undefined, store));
			const contextWidget = new class extends mock<IChatWidget>() {
				override readonly viewModel = new class extends mock<NonNullable<IChatWidget['viewModel']>>() {
					override readonly sessionResource = URI.parse('vscode-chat:/editor');
				}();
				override readonly input = new class extends mock<ChatInputPart>() {
					override get element() { return document.createElement('div'); }
				}();
				override resolveVoiceTarget() {
					return source === 'agents-draft' ? URI.parse('sessions-voice://new-chat/composer') : this.viewModel.sessionResource;
				}
				override focusInput(): void { targets.push('focus'); }
			}();
			const focusedWidget = new class extends mock<IChatWidget>() {
				override readonly viewModel = new class extends mock<NonNullable<IChatWidget['viewModel']>>() {
					override readonly sessionResource = URI.parse('vscode-chat:/focused');
				}();
				override resolveVoiceTarget() { return this.viewModel.sessionResource; }
			}();
			service.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
				override readonly isSessionsWindow = windowIsAgents;
			}());
			service.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				override readonly lastFocusedWidget = focusedWidget;
			}());
			service.stub(IConfigurationService, new TestConfigurationService({ agents: { voice: { handsFree: false } } }));
			service.stub(IKeybindingService, new class extends mock<IKeybindingService>() {
				override enableKeybindingHoldMode() { return undefined; }
			}());
			service.stub(ICommandService, new class extends mock<ICommandService>() {
				override async executeCommand<T>(id: string): Promise<T> {
					commands.push(id);
					return (source === 'agents-draft-keybinding' ? 'sessions-voice://new-chat/composer' : 'agent-host-copilotcli:/agents') as T;
				}
			}());
			service.stub(IVoiceSessionController, new class extends mock<IVoiceSessionController>() {
				override readonly isConnected = constObservable(false);
				override setActiveWindow(): void { }
				override setTargetSession(resource: URI): void { targets.push(resource.toString()); }
				override setDraftTarget(): void { targets.push('draft'); }
				override activateSession(): void { }
				override async connect(): Promise<void> { targets.push('connect'); }
			}());
			const command = CommandsRegistry.getCommand('agentsVoice.startVoiceInChat');
			assert.ok(command);
			await service.invokeFunction(accessor => command.handler(accessor, source.endsWith('keybinding') ? undefined : { widget: contextWidget }));
			// A toolbar press focuses its input after retargeting; a keybinding leaves focus alone.
			assert.deepStrictEqual({ targets, commands }, {
				targets: [source === 'toolbar' || source === 'agents-chat' ? 'vscode-chat:/editor'
					: source === 'keybinding' ? 'vscode-chat:/focused'
						: source.includes('draft') ? 'draft' : 'agent-host-copilotcli:/agents',
				...source.endsWith('keybinding') ? [] : ['focus'], 'connect'],
				commands: windowIsAgents && source.endsWith('keybinding') ? ['_chat.voice.getCurrentSession'] : [],
			});
		});
	}
});
