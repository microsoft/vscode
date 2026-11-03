/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { CodeLens, CodeLensList, CodeLensProvider } from '../../../../../editor/common/languages.js';
import { isITextModel, ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { showToolsPicker } from '../actions/chatToolPicker.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR, getPromptsTypeForLanguageId, PromptsType, Target } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { PromptFileRewriter } from './promptFileRewriter.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IEditorModel } from '../../../../../editor/common/editorCommon.js';
import { parseCommaSeparatedList, PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { isBoolean } from '../../../../../base/common/types.js';
import { getTarget, isVSCodeOrDefaultTarget, knownGithubCopilotToolNamespaces } from '../../common/promptSyntax/languageProviders/promptFileAttributes.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { getEffectiveAgentFileToolAvailability, IAgentFileTool, resolveAgentFileTools } from '../../common/promptSyntax/languageProviders/promptToolResolver.js';
import { IQuickInputService, IQuickTreeItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ILogService } from '../../../../../platform/log/common/log.js';

interface IAgentToolTreeItem extends IQuickTreeItem {
	readonly id: string;
	children?: IAgentToolTreeItem[];
}

export class PromptToolsCodeLensProvider extends Disposable implements CodeLensProvider {

	// `_`-prefix marks this as private command
	private readonly cmdId = `_configure/${generateUuid()}`;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILogService private readonly logService: ILogService,
	) {
		super();


		this._register(this.languageService.codeLensProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));

		this._register(CommandsRegistry.registerCommand(this.cmdId, (_accessor, ...args) => {
			const [modelArg, rangeArg, isStringArg, toolsArg] = args;
			const model = modelArg as IEditorModel;
			if (isITextModel(model) && Range.isIRange(rangeArg) && isBoolean(isStringArg) && Array.isArray(toolsArg)) {
				return this.updateTools(model, Range.lift(rangeArg), isStringArg, toolsArg);
			}
			return undefined;
		}));
	}

	async provideCodeLenses(model: ITextModel, token: CancellationToken): Promise<undefined | CodeLensList> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType || promptType === PromptsType.instructions) {
			// if the model is not a prompt, we don't provide any code actions
			return undefined;
		}

		const promptAST = this.promptsService.getParsedPromptFile(model);
		const header = promptAST.header;
		if (!header) {
			return undefined;
		}

		const target = getTarget(promptType, header, this.customizationHarnessService.getActiveDescriptor().customAgentTarget);
		if (!isVSCodeOrDefaultTarget(target) && target !== Target.GitHubCopilot) {
			return undefined;
		}

		const toolsAttr = header.getAttribute(PromptHeaderAttributes.tools);
		if (!toolsAttr) {
			return undefined;
		}
		let value = toolsAttr.value;
		if (value.type === 'scalar') {
			value = parseCommaSeparatedList(value);
		}
		if (value.type !== 'sequence') {
			return undefined;
		}
		const items = value.items;
		const selectedTools = items.filter(item => item.type === 'scalar').map(item => item.value);

		const codeLens: CodeLens = {
			range: toolsAttr.range.collapseToStart(),
			command: {
				title: localize('configure-tools.capitalized.ellipsis', "Configure Tools..."),
				id: this.cmdId,
				arguments: [model, toolsAttr.value.range, toolsAttr.value.type === 'scalar', selectedTools]
			}
		};
		return { lenses: [codeLens] };
	}

	private async updateTools(model: ITextModel, range: Range, isString: boolean, selectedTools: readonly string[]): Promise<void> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		const header = this.promptsService.getParsedPromptFile(model).header;
		if (!promptType || !header) {
			return;
		}
		const target = getTarget(promptType, header, this.customizationHarnessService.getActiveDescriptor().customAgentTarget);
		if (target === Target.GitHubCopilot) {
			const catalogue = await resolveAgentFileTools(target, this.customizationHarnessService, this.logService, CancellationToken.None);
			const toolsByName = new Map<string, IAgentFileTool[]>();
			for (const tool of catalogue.tools) {
				const matches = toolsByName.get(tool.name) ?? [];
				matches.push(tool);
				toolsByName.set(tool.name, matches);
			}
			const availableTools = new Map<string, { name: string; description?: string }>();
			for (const [name, matches] of toolsByName) {
				if (getEffectiveAgentFileToolAvailability(matches) === 'available') {
					availableTools.set(name, { name, description: matches.find(tool => tool.description)?.description });
				}
			}
			for (const namespace of knownGithubCopilotToolNamespaces) {
				if (!toolsByName.has(namespace.name)) {
					availableTools.set(namespace.name, namespace);
				}
			}
			const picked = await this.pickAgentTools([...availableTools.values()], selectedTools);
			if (picked) {
				// Preserve authored references that the current harness cannot offer for editing.
				const unlistedTools = selectedTools.filter(name => !availableTools.has(name));
				this.instantiationService.createInstance(PromptFileRewriter).rewriteToolNames(model, [...unlistedTools, ...picked], range, isString);
			}
			return;
		}
		if (!isVSCodeOrDefaultTarget(target)) {
			return;
		}
		const selectedToolsNow = () => this.languageModelToolsService.toToolAndToolSetEnablementMap(selectedTools, undefined);
		const newSelectedAfter = await this.instantiationService.invokeFunction(showToolsPicker, localize('placeholder', "Select tools"), 'codeLens', undefined, selectedToolsNow);
		if (!newSelectedAfter) {
			return;
		}
		this.instantiationService.createInstance(PromptFileRewriter).rewriteTools(model, newSelectedAfter, range, isString);
	}

	private async pickAgentTools(tools: readonly { name: string; description?: string }[], selectedTools: readonly string[]): Promise<string[] | undefined> {
		const groups = new Map<string, IAgentToolTreeItem & { children: IAgentToolTreeItem[] }>();
		for (const tool of tools) {
			const separator = tool.name.indexOf('/');
			const namespace = separator === -1 ? '' : tool.name.substring(0, separator);
			let group = groups.get(namespace);
			if (!group) {
				group = {
					id: `group:${namespace}`,
					label: namespace || localize('builtIn', "Built-In"),
					children: [],
				};
				groups.set(namespace, group);
			}
			group.children.push({
				id: tool.name,
				label: tool.name.substring(separator + 1),
				ariaLabel: tool.name,
				description: tool.description,
				checked: selectedTools.includes(tool.name),
			});
		}

		const store = new DisposableStore();
		try {
			const picker = store.add(this.quickInputService.createQuickTree<IAgentToolTreeItem>());
			picker.title = localize('configureTools', "Configure Tools");
			picker.placeholder = localize('placeholder', "Select tools");
			picker.matchOnDescription = true;
			picker.sortByLabel = false;
			picker.setItemTree([...groups.values()]);
			let result: string[] | undefined;
			store.add(picker.onDidAccept(() => {
				result = picker.checkedLeafItems.map(item => item.id);
				picker.hide();
			}));
			const hidden = Event.toPromise(picker.onDidHide, store);
			picker.show();
			await hidden;
			return result;
		} finally {
			store.dispose();
		}
	}
}
