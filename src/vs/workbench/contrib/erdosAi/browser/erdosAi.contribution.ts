/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ErdosAiViewPane } from './erdosAiView.js';
import { ErdosAiService } from './erdosAiService.js';
import { IErdosAiService, POISSON_AI_VIEW_ID } from '../common/erdosAiService.js';
import { IJupytextService, JupytextService } from './services/jupytextService.js';
import { IAutoAcceptService, AutoAcceptService } from './services/autoAcceptService.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from '../../../common/contributions.js';
import { Extensions as ViewContainerExtensions, IViewsRegistry, IViewContainersRegistry, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';

// Register the Erdos AI service.
registerSingleton(IErdosAiService, ErdosAiService, InstantiationType.Delayed);

// Register the Jupytext service.
registerSingleton(IJupytextService, JupytextService, InstantiationType.Delayed);

// R Function Parser now integrated into existing help service

// Register the Auto Accept service.
registerSingleton(IAutoAcceptService, AutoAcceptService, InstantiationType.Delayed);

// Register Erdos AI configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'erdosAi',
	title: nls.localize('erdosAiConfigurationTitle', "Erdos AI"),
	type: 'object',
	properties: {
		'erdosAi.temperature': {
			type: 'number',
			default: 0.5,
			minimum: 0.0,
			maximum: 1.0,
			description: nls.localize('erdosAi.temperature', "Controls the AI model temperature (creativity vs determinism). 0.0 = deterministic, 1.0 = highly creative."),
			order: 1
		},
		'erdosAi.securityMode': {
			type: 'string',
			default: 'improve',
			enum: ['secure', 'improve'],
			enumDescriptions: [
				nls.localize('erdosAi.securityMode.secure', "Secure mode (recommended) - prioritizes privacy and security"),
				nls.localize('erdosAi.securityMode.improve', "Improve service mode - allows data to be used for service improvement")
			],
			description: nls.localize('erdosAi.securityMode', "Controls the security and data usage mode for AI interactions."),
			order: 2
		},
		'erdosAi.webSearchEnabled': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.webSearchEnabled', "Enable web search capabilities for the AI assistant."),
			order: 3
		},
		'erdosAi.autoAcceptEdits': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoAcceptEdits', "Automatically accept AI-proposed file edits without manual confirmation."),
			order: 4
		},
		'erdosAi.autoAcceptConsole': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoAcceptConsole', "Automatically accept R console commands if all functions are in the allow list."),
			order: 5
		},
		'erdosAi.autoRunFiles': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoRunFiles', "Automatically run AI-proposed files on the allow list."),
			order: 7
		},
		'erdosAi.autoDeleteFiles': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoDeleteFiles', "Automatically delete AI-proposed files on the allow list."),
			order: 8
		},

		'erdosAi.autoRunFilesAllowAnything': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoRunFilesAllowAnything', "Allow automatic running of any file (unsafe)."),
			order: 11
		},
		'erdosAi.autoDeleteFilesAllowAnything': {
			type: 'boolean',
			default: false,
			description: nls.localize('erdosAi.autoDeleteFilesAllowAnything', "Allow automatic deletion of any file (unsafe)."),
			order: 12
		},

		'erdosAi.runFilesAutomationList': {
			type: 'array',
			items: { type: 'string' },
			default: [],
			description: nls.localize('erdosAi.runFilesAutomationList', "List of file paths allowed for automation."),
			order: 15
		},
		'erdosAi.deleteFilesAutomationList': {
			type: 'array',
			items: { type: 'string' },
			default: [],
			description: nls.localize('erdosAi.deleteFilesAutomationList', "List of file paths allowed for deletion automation."),
			order: 16
		},
		'erdosAi.userRules': {
			type: 'array',
			items: {
				type: 'string'
			},
			default: [],
			description: nls.localize('erdosAi.userRules', "Custom rules and instructions for AI behavior."),
			order: 17
		},
		'erdosAi.selectedModel': {
			type: 'string',
			default: 'claude-sonnet-4-20250514',
			enum: [
				'claude-sonnet-4-20250514',
				'gpt-5-mini'
			],
			enumDescriptions: [
				nls.localize('erdosAi.selectedModel.claude', "claude-sonnet-4-20250514 (Superior coding and analysis - recommended)"),
				nls.localize('erdosAi.selectedModel.gpt5', "gpt-5-mini (Reasoning tier)")
			],
			description: nls.localize('erdosAi.selectedModel', "Select the AI model to use for interactions."),
			order: 18
		},
		'erdosAi.workingDirectory': {
			type: 'string',
			default: '',
			description: nls.localize('erdosAi.workingDirectory', "Default working directory for AI operations."),
			order: 19,
			scope: ConfigurationScope.WINDOW
		}
	}
});

// Constants
const POISSON_AI_CONTAINER_ID = 'workbench.view.erdos-ai';

// The Erdos AI view icon.
const erdosAiViewIcon = registerIcon('erdos-ai-view-icon', Codicon.sparkle, nls.localize('erdosAiViewIcon', 'View icon of the Erdos AI view.'));

// Register the Erdos AI view container in the sidebar
const erdosAiViewContainer: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: POISSON_AI_CONTAINER_ID,
	title: nls.localize2('erdos.ai.viewContainer.label', "Erdos AI"),
	icon: erdosAiViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [POISSON_AI_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: POISSON_AI_CONTAINER_ID,
	hideIfEmpty: false,
	order: 7, // Position after Testing (6) but before others
	openCommandActionDescriptor: {
		id: 'workbench.action.toggleErdosAi',
		mnemonicTitle: nls.localize({ key: 'miToggleErdosAi', comment: ['&& denotes a mnemonic'] }, "&&Erdos AI"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP
		},
		order: 7,
	}
}, ViewContainerLocation.Sidebar, { isDefault: false, doNotRegisterOpenCommand: false });

// Register the Erdos AI view in the sidebar container
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews(
	[
		{
			id: POISSON_AI_VIEW_ID,
			name: {
				value: nls.localize('erdos.ai.view.name', "Erdos AI"),
				original: 'Erdos AI'
			},
			ctorDescriptor: new SyncDescriptor(ErdosAiViewPane),
			canToggleVisibility: false,
			canMoveView: true,
			containerIcon: erdosAiViewIcon,
		}
	],
	erdosAiViewContainer
);

class ErdosAiContribution extends Disposable implements IWorkbenchContribution {
	constructor() {
		super();

		// Register Erdos AI actions
		this.registerActions();
	}

	private registerActions(): void {
		// Register new conversation action
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'erdos.ai.newConversation',
					title: nls.localize2('erdos.ai.newConversation', 'New Conversation'),
					category: nls.localize2('erdos.ai.category', 'Erdos AI'),
					f1: true
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const erdosAiService = accessor.get(IErdosAiService);
				await erdosAiService.newConversation();
			}
		});

		// Register open settings action
		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'erdos.ai.openSettings',
					title: nls.localize2('erdos.ai.openSettings', 'Open Erdos AI Settings'),
					category: nls.localize2('erdos.ai.category', 'Erdos AI'),
					f1: true
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const preferencesService = accessor.get(IPreferencesService);
				await preferencesService.openSettings({ query: 'erdosAi' });
			}
		});



	}
}

// Register the contribution
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ErdosAiContribution,
	LifecyclePhase.Restored
);
