/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAIAssistantService } from '../common/aiAssistantService.js';
import { AIAssistantService } from './aiAssistantServiceImpl.js';
import { AICompletionProvider } from './aiCompletionProvider.js';
import { AIInlineCompletionProvider } from './aiInlineCompletionProvider.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { MenuId, Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';

// Register the AI Assistant service
registerSingleton(IAIAssistantService, AIAssistantService, true);

// Configuration schema
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'aiAssistant',
	order: 100,
	title: localize('aiAssistantConfiguration', 'AI Assistant'),
	type: 'object',
	properties: {
		'aiAssistant.enabled': {
			type: 'boolean',
			default: true,
			description: localize('aiAssistant.enabled', 'Enable AI Assistant features')
		},
		'aiAssistant.provider': {
			type: 'string',
			enum: ['openai', 'anthropic', 'local'],
			default: 'openai',
			description: localize('aiAssistant.provider', 'AI provider to use')
		},
		'aiAssistant.apiKey': {
			type: 'string',
			default: '',
			description: localize('aiAssistant.apiKey', 'API key for the AI provider')
		},
		'aiAssistant.model': {
			type: 'string',
			default: 'gpt-4',
			description: localize('aiAssistant.model', 'AI model to use')
		},
		'aiAssistant.completion.enabled': {
			type: 'boolean',
			default: true,
			description: localize('aiAssistant.completion.enabled', 'Enable AI-powered code completion')
		},
		'aiAssistant.completion.maxSuggestions': {
			type: 'number',
			default: 3,
			minimum: 1,
			maximum: 10,
			description: localize('aiAssistant.completion.maxSuggestions', 'Maximum number of AI completion suggestions')
		},
		'aiAssistant.completion.contextLines': {
			type: 'number',
			default: 50,
			minimum: 10,
			maximum: 200,
			description: localize('aiAssistant.completion.contextLines', 'Number of lines to include as context for completions')
		},
		'aiAssistant.completion.maxTokens': {
			type: 'number',
			default: 500,
			minimum: 100,
			maximum: 2000,
			description: localize('aiAssistant.completion.maxTokens', 'Maximum tokens for completion requests')
		},
		'aiAssistant.completion.temperature': {
			type: 'number',
			default: 0.3,
			minimum: 0,
			maximum: 1,
			description: localize('aiAssistant.completion.temperature', 'Temperature for completion requests (0 = deterministic, 1 = creative)')
		},
		'aiAssistant.chat.enabled': {
			type: 'boolean',
			default: true,
			description: localize('aiAssistant.chat.enabled', 'Enable AI chat interface')
		},
		'aiAssistant.codeGeneration.enabled': {
			type: 'boolean',
			default: true,
			description: localize('aiAssistant.codeGeneration.enabled', 'Enable AI code generation features')
		},
		'aiAssistant.refactoring.enabled': {
			type: 'boolean',
			default: true,
			description: localize('aiAssistant.refactoring.enabled', 'Enable AI-assisted refactoring')
		},
		'aiAssistant.explanation.enabled': {
			type: 'boolean',
			default: true,
			description: localize('aiAssistant.explanation.enabled', 'Enable AI code explanation features')
		}
	}
});

// AI Assistant Actions
class ExplainCodeAction extends Action2 {
	static readonly ID = 'aiAssistant.explainCode';

	constructor() {
		super({
			id: ExplainCodeAction.ID,
			title: localize('explainCode', 'Explain Code'),
			category: localize('aiAssistant', 'AI Assistant'),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE,
				when: EditorContextKeys.hasSelection
			},
			menu: {
				id: MenuId.EditorContext,
				when: ContextKeyExpr.and(
					EditorContextKeys.hasSelection,
					ContextKeyExpr.equals('config.aiAssistant.explanation.enabled', true)
				),
				group: 'aiAssistant',
				order: 1
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const aiService = accessor.get(IAIAssistantService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		const activeEditor = editorService.activeTextEditorControl;
		if (!activeEditor || !('getModel' in activeEditor)) {
			return;
		}

		const model = activeEditor.getModel();
		const selection = activeEditor.getSelection();
		if (!model || !selection) {
			return;
		}

		const selectedText = model.getValueInRange(selection);
		if (!selectedText.trim()) {
			notificationService.warn(localize('noSelection', 'Please select some code to explain'));
			return;
		}

		try {
			const response = await aiService.explainCode({
				code: selectedText,
				language: model.getLanguageId(),
				context: {
					file: model.uri,
					range: selection
				},
				type: 'explain'
			});

			notificationService.info(response.explanation);
		} catch (error) {
			notificationService.error(localize('explainError', 'Failed to explain code: {0}', error instanceof Error ? error.message : String(error)));
		}
	}
}

class GenerateCodeAction extends Action2 {
	static readonly ID = 'aiAssistant.generateCode';

	constructor() {
		super({
			id: GenerateCodeAction.ID,
			title: localize('generateCode', 'Generate Code'),
			category: localize('aiAssistant', 'AI Assistant'),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG
			},
			menu: {
				id: MenuId.EditorContext,
				when: ContextKeyExpr.equals('config.aiAssistant.codeGeneration.enabled', true),
				group: 'aiAssistant',
				order: 2
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		// For now, just show a message
		notificationService.info(localize('generateCodeInfo', 'AI code generation feature is available. Use the AI chat to generate code.'));
	}
}

class RefactorCodeAction extends Action2 {
	static readonly ID = 'aiAssistant.refactorCode';

	constructor() {
		super({
			id: RefactorCodeAction.ID,
			title: localize('refactorCode', 'Refactor Code'),
			category: localize('aiAssistant', 'AI Assistant'),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
				when: EditorContextKeys.hasSelection
			},
			menu: {
				id: MenuId.EditorContext,
				when: ContextKeyExpr.and(
					EditorContextKeys.hasSelection,
					ContextKeyExpr.equals('config.aiAssistant.refactoring.enabled', true)
				),
				group: 'aiAssistant',
				order: 3
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const aiService = accessor.get(IAIAssistantService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);

		const activeEditor = editorService.activeTextEditorControl;
		if (!activeEditor || !('getModel' in activeEditor)) {
			return;
		}

		const model = activeEditor.getModel();
		const selection = activeEditor.getSelection();
		if (!model || !selection) {
			return;
		}

		const selectedText = model.getValueInRange(selection);
		if (!selectedText.trim()) {
			notificationService.warn(localize('noSelection', 'Please select some code to refactor'));
			return;
		}

		try {
			const response = await aiService.refactorCode({
				code: selectedText,
				instruction: 'Improve this code for better readability and performance',
				language: model.getLanguageId(),
				context: {
					file: model.uri,
					range: selection
				}
			});

			// Apply the refactored code
			if ('applyEdits' in activeEditor) {
				(activeEditor as any).applyEdits([{
					range: selection,
					text: response.refactoredCode
				}]);
			}

			if (response.explanation) {
				notificationService.info(response.explanation);
			}
		} catch (error) {
			notificationService.error(localize('refactorError', 'Failed to refactor code: {0}', error instanceof Error ? error.message : String(error)));
		}
	}
}

// Register actions
registerAction2(ExplainCodeAction);
registerAction2(GenerateCodeAction);
registerAction2(RefactorCodeAction);

// Main contribution class
export class AIAssistantContribution extends Disposable implements IWorkbenchContribution {

	private _completionProvider?: AICompletionProvider;
	private _inlineCompletionProvider?: AIInlineCompletionProvider;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IAIAssistantService private readonly aiAssistantService: IAIAssistantService
	) {
		super();
		this._registerCompletionProviders();
	}

	private _registerCompletionProviders(): void {
		// Register AI completion provider for all languages
		this._completionProvider = this.instantiationService.createInstance(AICompletionProvider);
		this._register(this.languageFeaturesService.completionProvider.register('*', this._completionProvider));

		// Register AI inline completion provider
		this._inlineCompletionProvider = this.instantiationService.createInstance(AIInlineCompletionProvider);
		this._register(this.languageFeaturesService.inlineCompletionsProvider.register('*', this._inlineCompletionProvider));

		// Also register for specific languages with higher priority
		const languages = ['typescript', 'javascript', 'python', 'java', 'csharp', 'cpp', 'go', 'rust', 'php'];
		for (const language of languages) {
			this._register(this.languageFeaturesService.completionProvider.register(language, this._completionProvider));
			this._register(this.languageFeaturesService.inlineCompletionsProvider.register(language, this._inlineCompletionProvider));
		}
	}
}

// Register the main contribution
const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(AIAssistantContribution, LifecyclePhase.Restored);
