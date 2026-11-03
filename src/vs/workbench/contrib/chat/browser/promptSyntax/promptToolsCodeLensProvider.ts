/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { matchesFuzzy } from '../../../../../base/common/filters.js';
import { Event } from '../../../../../base/common/event.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { CodeLens, CodeLensList, CodeLensProvider } from '../../../../../editor/common/languages.js';
import { IEditorModel } from '../../../../../editor/common/editorCommon.js';
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
import { parseCommaSeparatedList, PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { getTarget, isVSCodeOrDefaultTarget } from '../../common/promptSyntax/languageProviders/promptFileAttributes.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { getEffectiveAgentFileToolAvailability, IAgentFileTool, resolveAgentFileTools } from '../../common/promptSyntax/languageProviders/promptToolResolver.js';
import { IQuickInputService, IQuickTreeItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';

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
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();


		this._register(this.languageService.codeLensProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));

		this._register(CommandsRegistry.registerCommand(this.cmdId, (_accessor, ...args) => {
			const model = args[0] as IEditorModel;
			if (isITextModel(model)) {
				return this.updateTools(model);
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
		if (toolsAttr.value.type !== 'scalar' && toolsAttr.value.type !== 'sequence') {
			return undefined;
		}

		const codeLens: CodeLens = {
			range: toolsAttr.range.collapseToStart(),
			command: {
				title: localize('configure-tools.capitalized.ellipsis', "Configure Tools..."),
				id: this.cmdId,
				arguments: [model]
			}
		};
		return { lenses: [codeLens] };
	}

	private async updateTools(model: ITextModel): Promise<void> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		const header = this.promptsService.getParsedPromptFile(model).header;
		const toolsAttr = header?.getAttribute(PromptHeaderAttributes.tools);
		if (!promptType || !header || !toolsAttr) {
			return;
		}
		const value = toolsAttr.value.type === 'scalar' ? parseCommaSeparatedList(toolsAttr.value) : toolsAttr.value;
		if (value.type !== 'sequence') {
			return;
		}
		const selectedTools = value.items.filter(item => item.type === 'scalar').map(item => item.value);
		const version = model.getVersionId();
		const target = getTarget(promptType, header, this.customizationHarnessService.getActiveDescriptor().customAgentTarget);
		if (target === Target.GitHubCopilot) {
			const picked = await this.pickAgentTools(model, selectedTools);
			if (!this.canRewrite(model, version) || !picked) {
				return;
			}
			this.instantiationService.createInstance(PromptFileRewriter).rewriteToolNames(model, picked, toolsAttr.value.range, toolsAttr.value.type === 'scalar');
			return;
		}
		if (!isVSCodeOrDefaultTarget(target)) {
			return;
		}
		const selectedToolsNow = () => this.languageModelToolsService.toToolAndToolSetEnablementMap(selectedTools, undefined);
		const newSelectedAfter = await this.instantiationService.invokeFunction(showToolsPicker, localize('placeholder', "Select tools"), 'codeLens', undefined, selectedToolsNow);
		if (!this.canRewrite(model, version) || !newSelectedAfter) {
			return;
		}
		this.instantiationService.createInstance(PromptFileRewriter).rewriteTools(model, newSelectedAfter, toolsAttr.value.range, toolsAttr.value.type === 'scalar');
	}

	private canRewrite(model: ITextModel, version: number): boolean {
		if (model.isDisposed()) {
			return false;
		}
		if (model.getVersionId() !== version) {
			this.notificationService.warn(localize('toolsFileChanged', "The file changed. Run Configure Tools again to update its tools."));
			return false;
		}
		return true;
	}

	private async pickAgentTools(model: ITextModel, selectedTools: readonly string[]): Promise<string[] | undefined> {
		const store = new DisposableStore();
		try {
			const tokenSource = store.add(new CancellationTokenSource());
			const picker = store.add(this.quickInputService.createQuickTree<IAgentToolTreeItem>());
			picker.title = localize('configureTools', "Configure Tools");
			picker.placeholder = localize('placeholder', "Select tools");
			picker.matchOnLabel = false;
			picker.matchOnDescription = false;
			picker.sortByLabel = false;
			picker.busy = true;
			picker.enabled = false;
			store.add(picker.onDidHide(() => tokenSource.cancel()));
			store.add(Event.once(model.onWillDispose)(() => picker.hide()));
			store.add(Event.once(listener => model.onDidChangeContent(listener))(() => picker.hide()));
			const hidden = Event.toPromise(picker.onDidHide, store);
			let result: string[] | undefined;
			let ready = false;
			let unlistedTools: string[] = [];
			const selectableTools: IAgentToolTreeItem[] = [];
			store.add(picker.onDidAccept(() => {
				if (!ready) {
					return;
				}
				const checked = selectableTools.filter(item => item.checked === true).map(item => item.id);
				if (!checked.length && !unlistedTools.length) {
					picker.severity = Severity.Warning;
					picker.validationMessage = localize('toolsEmptySelection', "Select at least one tool, or select All Tools. An empty tools list allows all tools in Copilot.");
					return;
				}
				const wildcards = checked.filter(name => name.endsWith('/*'));
				const individualTools = checked.filter(name => !wildcards.some(wildcard => name !== wildcard && name.startsWith(wildcard.slice(0, -1))));
				result = checked.includes('*') ? ['*'] : [...unlistedTools, ...individualTools];
				picker.hide();
			}));
			picker.show();
			const catalogue = await resolveAgentFileTools(Target.GitHubCopilot, this.customizationHarnessService, this.logService, tokenSource.token);
			if (tokenSource.token.isCancellationRequested) {
				return undefined;
			}
			picker.busy = false;
			picker.enabled = true;
			if (!catalogue.isResolved) {
				picker.severity = Severity.Warning;
				picker.validationMessage = localize('toolsInventoryUnavailable', "The Copilot tool inventory is unavailable. Open a Copilot session and run Configure Tools again.");
				await hidden;
				return undefined;
			}
			const toolsByName = new Map<string, IAgentFileTool[]>();
			for (const tool of catalogue.tools) {
				const matches = toolsByName.get(tool.name) ?? [];
				matches.push(tool);
				toolsByName.set(tool.name, matches);
			}
			const groups = new Map<string, IAgentToolTreeItem & { children: IAgentToolTreeItem[] }>();
			const allTools: IAgentToolTreeItem = {
				id: '*',
				label: localize('allTools', "All Tools"),
				description: localize('allToolsDescription', "Allow every tool, including tools added later"),
				// Copilot treats an empty tool list as unrestricted.
				checked: !selectedTools.length || selectedTools.includes('*'),
			};
			const leaves: IAgentToolTreeItem[] = [];
			for (const [name, matches] of toolsByName) {
				if (name === '*' || getEffectiveAgentFileToolAvailability(matches) !== 'available') {
					continue;
				}
				const separator = name.indexOf('/');
				const namespace = separator === -1 ? '' : name.substring(0, separator);
				let group = groups.get(namespace);
				if (!group) {
					group = { id: `group:${namespace}`, label: namespace || localize('builtIn', "Built-In"), children: [] };
					groups.set(namespace, group);
				}
				const description = matches.find(tool => tool.description)?.description;
				const item: IAgentToolTreeItem = {
					id: name,
					label: name.substring(separator + 1),
					ariaLabel: description ? localize('agentToolAriaLabel', "{0}, {1}", name, description) : name,
					description,
					checked: allTools.checked === true || selectedTools.includes(name) || selectedTools.some(wildcard => wildcard.endsWith('/*') && name.startsWith(wildcard.slice(0, -1))),
				};
				leaves.push(item);
				group.children.push(item);
			}
			unlistedTools = selectedTools.filter(name => name !== '*' && !leaves.some(item => item.id === name));
			selectableTools.push(allTools, ...leaves);
			const render = () => {
				const query = picker.value.trim();
				if (!query) {
					picker.setItemTree([allTools, ...groups.values()]);
					return;
				}
				const matches = (text: string | undefined) => !!text && !!matchesFuzzy(query, text);
				const filteredGroups = [...groups.values()].flatMap(group => {
					const children = matches(group.label) ? group.children : group.children.filter(item => matches(item.id) || matches(item.description));
					return children.length ? [{ ...group, children }] : [];
				});
				picker.setItemTree(matches(allTools.label) || matches(allTools.description) || matches(allTools.id) ? [allTools, ...filteredGroups] : filteredGroups);
			};
			store.add(picker.onDidChangeValue(render));
			store.add(picker.onDidChangeCheckboxState(changed => {
				picker.validationMessage = undefined;
				if (changed === allTools) {
					for (const item of leaves) {
						item.checked = allTools.checked;
					}
				} else {
					allTools.checked = false;
					for (const wildcard of leaves.filter(item => item.id.endsWith('/*'))) {
						const prefix = wildcard.id.slice(0, -1);
						if (changed === wildcard) {
							for (const item of leaves.filter(item => item.id.startsWith(prefix))) {
								item.checked = wildcard.checked;
							}
						} else if (leaves.some(item => item.id !== wildcard.id && item.id.startsWith(prefix) && item.checked !== true)) {
							wildcard.checked = false;
						}
					}
				}
				render();
			}));
			ready = true;
			render();
			await hidden;
			return result;
		} finally {
			store.dispose();
		}
	}
}
