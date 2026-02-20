/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IPhononCliService } from '../../../../platform/phonon/common/phononCliService.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ChatEntitlementContextKeys } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IChatAgentService } from '../../chat/common/participants/chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from '../../chat/common/constants.js';
import { ILanguageModelsService } from '../../chat/common/languageModels.js';
import { IPhononService, PHONON_CLAUDE_AGENT_ID, PHONON_CLAUDE_VENDOR } from '../common/phonon.js';
import '../common/phononConfiguration.js';
import { PhononService } from './phononService.js';
import { PhononLanguageModelProvider } from './phononLanguageModel.js';
import { PhononChatAgentImpl } from './phononChatAgent.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';

// --- Singleton registration ---

registerSingleton(IPhononService, PhononService, InstantiationType.Delayed);

// --- Workbench contribution: registers vendor, provider, and agent ---

class PhononContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.phonon';

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IPhononService private readonly phononService: IPhononService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._markChatProviderInstalled();
		this._registerVendorAndProvider();
		this._registerChatAgent();
	}

	private _markChatProviderInstalled(): void {
		// Tell the chat UI that a chat provider is installed (bypasses Copilot extension check).
		ChatEntitlementContextKeys.Setup.installed.bindTo(this.contextKeyService).set(true);
		ChatEntitlementContextKeys.Setup.registered.bindTo(this.contextKeyService).set(true);

		// Enable the chat system. registerDynamicAgent does NOT set this.
		ChatContextKeys.enabled.bindTo(this.contextKeyService).set(true);
		ChatContextKeys.panelParticipantRegistered.bindTo(this.contextKeyService).set(true);
	}

	private _registerVendorAndProvider(): void {
		// Step 1: Register the "phonon" vendor descriptor
		this.languageModelsService.deltaLanguageModelChatProviderDescriptors(
			[{
				vendor: PHONON_CLAUDE_VENDOR,
				displayName: 'Phonon (Claude)',
				configuration: undefined,
				managementCommand: undefined,
				when: undefined,
			}],
			[]
		);

		// Step 2: Create and register the language model provider
		const provider = this.instantiationService.createInstance(PhononLanguageModelProvider);
		this._register(provider);
		this._register(this.languageModelsService.registerLanguageModelProvider(PHONON_CLAUDE_VENDOR, provider));

		// Step 3: Wire CLI service if available (desktop only - uses Max subscription)
		this._wireCliService(provider);

		// Step 4: Trigger model cache population
		provider.triggerInitialModelResolution();
	}

	private _wireCliService(provider: PhononLanguageModelProvider): void {
		// Try to get the CLI service. Only available on desktop (registered via
		// registerMainProcessRemoteService in electron-browser/phononCliService.ts).
		try {
			const cliService = this.instantiationService.invokeFunction(accessor => accessor.get(IPhononCliService));
			provider.setCliService(cliService);

			// Check availability and update PhononService
			cliService.isAvailable().then(available => {
				this.phononService.setCliAvailable(available);
				if (available) {
					this.logService.info('[Phonon] Claude CLI detected - using subprocess mode (Max subscription)');
				} else {
					this.logService.info('[Phonon] Claude CLI not found - using HTTP API mode');
				}
			}).catch(() => {
				this.logService.warn('[Phonon] Failed to check CLI availability');
			});
		} catch {
			// Not on desktop or CLI service not registered - HTTP fallback
			this.logService.info('[Phonon] CLI service not available (web mode?) - using HTTP API mode');
		}
	}

	private _registerChatAgent(): void {
		const agentImpl = this.instantiationService.createInstance(PhononChatAgentImpl);
		this._register(agentImpl);
		this._register(this.chatAgentService.registerDynamicAgent({
			id: PHONON_CLAUDE_AGENT_ID,
			name: 'Claude',
			fullName: 'Claude by Anthropic',
			description: 'Claude AI assistant powered by Anthropic',
			isDefault: true,
			isCore: false,
			modes: [ChatModeKind.Ask, ChatModeKind.Edit, ChatModeKind.Agent],
			slashCommands: [],
			disambiguation: [],
			locations: [
				ChatAgentLocation.Chat,
				ChatAgentLocation.Terminal,
				ChatAgentLocation.EditorInline,
				ChatAgentLocation.Notebook,
			],
			metadata: {},
			extensionId: nullExtensionDescription.identifier,
			extensionVersion: undefined,
			extensionDisplayName: 'Phonon Claude',
			extensionPublisherId: 'phonon',
		}, agentImpl));
	}
}

registerWorkbenchContribution2(PhononContribution.ID, PhononContribution, WorkbenchPhase.BlockRestore);

// --- Commands ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'phonon.setApiKey',
			title: localize2('phonon.setApiKey', "Phonon: Set API Key"),
			category: Categories.Preferences,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const phononService = accessor.get(IPhononService);
		const quickInputService = accessor.get(IQuickInputService);

		const input = await quickInputService.input({
			title: localize('phonon.setApiKey.title', "Enter Anthropic API Key"),
			placeHolder: 'sk-ant-...',
			password: true,
			prompt: localize('phonon.setApiKey.prompt', "Get your API key from console.anthropic.com"),
		});

		if (input) {
			await phononService.setApiKey(input);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'phonon.clearApiKey',
			title: localize2('phonon.clearApiKey', "Phonon: Clear API Key"),
			category: Categories.Preferences,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const phononService = accessor.get(IPhononService);
		await phononService.deleteApiKey();
	}
});
