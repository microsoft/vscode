/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { raceTimeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isPatternInWord } from '../../../../../base/common/filters.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { isCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IWordAtPosition, getWordAtText } from '../../../../../editor/common/core/wordHelper.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList, DocumentSymbol, Location, ProviderResult, SymbolKind, SymbolKinds } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IOutlineModelService } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { localize } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../../common/contributions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { QueryBuilder } from '../../../../services/search/common/queryBuilder.js';
import { ISearchService } from '../../../../services/search/common/search.js';
import { ChatAgentLocation, IChatAgentData, IChatAgentNameService, IChatAgentService, getFullyQualifiedId } from '../../common/chatAgents.js';
import { IChatEditingService } from '../../common/chatEditingService.js';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestTextPart, ChatRequestToolPart, chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from '../../common/chatParserTypes.js';
import { IChatSlashCommandService } from '../../common/chatSlashCommands.js';
import { IDynamicVariable } from '../../common/chatVariables.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { ChatEditingSessionSubmitAction, ChatSubmitAction } from '../actions/chatExecuteActions.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { ChatInputPart } from '../chatInputPart.js';
import { ChatDynamicVariableModel, SelectAndInsertFileAction, SelectAndInsertFolderAction, SelectAndInsertProblemAction, SelectAndInsertSymAction, getTopLevelFolders, searchFolders } from './chatDynamicVariables.js';

class SlashCommandCompletions extends Disposable {
	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatSlashCommandService private readonly chatSlashCommandService: IChatSlashCommandService
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'globalSlashCommands',
			triggerCharacters: ['/'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.viewModel) {
					return null;
				}

				const range = computeCompletionRanges(model, position, /\/\w*/g);
				if (!range) {
					return null;
				}

				if (!isEmptyUpToCompletionWord(model, range)) {
					// No text allowed before the completion
					return;
				}

				const parsedRequest = widget.parsedInput.parts;
				const usedAgent = parsedRequest.find(p => p instanceof ChatRequestAgentPart);
				if (usedAgent) {
					// No (classic) global slash commands when an agent is used
					return;
				}

				const slashCommands = this.chatSlashCommandService.getCommands(widget.location);
				if (!slashCommands) {
					return null;
				}

				return {
					suggestions: slashCommands.map((c, i): CompletionItem => {
						const withSlash = `/${c.command}`;
						return {
							label: withSlash,
							insertText: c.executeImmediately ? '' : `${withSlash} `,
							documentation: c.detail,
							range,
							sortText: c.sortText ?? 'a'.repeat(i + 1),
							kind: CompletionItemKind.Text, // The icons are disabled here anyway,
							command: c.executeImmediately ? { id: widget.location === ChatAgentLocation.EditingSession ? ChatEditingSessionSubmitAction.ID : ChatSubmitAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : undefined,
						};
					})
				};
			}
		}));
		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'globalSlashCommandsAt',
			triggerCharacters: [chatAgentLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.viewModel) {
					return null;
				}

				const range = computeCompletionRanges(model, position, /@\w*/g);
				if (!range) {
					return null;
				}

				if (!isEmptyUpToCompletionWord(model, range)) {
					// No text allowed before the completion
					return;
				}

				const slashCommands = this.chatSlashCommandService.getCommands(widget.location);
				if (!slashCommands) {
					return null;
				}

				return {
					suggestions: slashCommands.map((c, i): CompletionItem => {
						const withSlash = `${chatSubcommandLeader}${c.command}`;
						return {
							label: withSlash,
							insertText: c.executeImmediately ? '' : `${withSlash} `,
							documentation: c.detail,
							range,
							filterText: `${chatAgentLeader}${c.command}`,
							sortText: c.sortText ?? 'z'.repeat(i + 1),
							kind: CompletionItemKind.Text, // The icons are disabled here anyway,
							command: c.executeImmediately ? { id: widget.location === ChatAgentLocation.EditingSession ? ChatEditingSessionSubmitAction.ID : ChatSubmitAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : undefined,
						};
					})
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SlashCommandCompletions, LifecyclePhase.Eventually);

class AgentCompletions extends Disposable {
	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatAgentNameService private readonly chatAgentNameService: IChatAgentNameService,
	) {
		super();


		const subCommandProvider: CompletionItemProvider = {
			_debugDisplayName: 'chatAgentSubcommand',
			triggerCharacters: ['/'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.viewModel) {
					return;
				}

				const range = computeCompletionRanges(model, position, /\/\w*/g);
				if (!range) {
					return null;
				}

				const parsedRequest = widget.parsedInput.parts;
				const usedAgentIdx = parsedRequest.findIndex((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart);
				if (usedAgentIdx < 0) {
					return;
				}

				const usedSubcommand = parsedRequest.find(p => p instanceof ChatRequestAgentSubcommandPart);
				if (usedSubcommand) {
					// Only one allowed
					return;
				}

				for (const partAfterAgent of parsedRequest.slice(usedAgentIdx + 1)) {
					// Could allow text after 'position'
					if (!(partAfterAgent instanceof ChatRequestTextPart) || !partAfterAgent.text.trim().match(/^(\/\w*)?$/)) {
						// No text allowed between agent and subcommand
						return;
					}
				}

				const usedAgent = parsedRequest[usedAgentIdx] as ChatRequestAgentPart;
				return {
					suggestions: usedAgent.agent.slashCommands.map((c, i): CompletionItem => {
						const withSlash = `/${c.name}`;
						return {
							label: withSlash,
							insertText: `${withSlash} `,
							documentation: c.description,
							range,
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
						};
					})
				};
			}
		};
		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, subCommandProvider));

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatAgentAndSubcommand',
			triggerCharacters: [chatAgentLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				const viewModel = widget?.viewModel;
				if (!widget || !viewModel) {
					return;
				}

				const range = computeCompletionRanges(model, position, /(@|\/)\w*/g);
				if (!range) {
					return null;
				}

				if (!isEmptyUpToCompletionWord(model, range)) {
					// No text allowed before the completion
					return;
				}

				const agents = this.chatAgentService.getAgents()
					.filter(a => a.locations.includes(widget.location));

				// When the input is only `/`, items are sorted by sortText.
				// When typing, filterText is used to score and sort.
				// The same list is refiltered/ranked while typing.
				const getFilterText = (agent: IChatAgentData, command: string) => {
					// This is hacking the filter algorithm to make @terminal /explain match worse than @workspace /explain by making its match index later in the string.
					// When I type `/exp`, the workspace one should be sorted over the terminal one.
					const dummyPrefix = agent.id === 'github.copilot.terminalPanel' ? `0000` : ``;
					return `${chatAgentLeader}${dummyPrefix}${agent.name}.${command}`;
				};

				const justAgents: CompletionItem[] = agents
					.filter(a => !a.isDefault)
					.map(agent => {
						const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
						const detail = agent.description;

						return {
							label: isDupe ?
								{ label: agentLabel, description: agent.description, detail: ` (${agent.publisherDisplayName})` } :
								agentLabel,
							documentation: detail,
							filterText: `${chatAgentLeader}${agent.name}`,
							insertText: `${agentLabel} `,
							range,
							kind: CompletionItemKind.Text,
							sortText: `${chatAgentLeader}${agent.name}`,
							command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget } satisfies AssignSelectedAgentActionArgs] },
						};
					});

				return {
					suggestions: justAgents.concat(
						coalesce(agents.flatMap(agent => agent.slashCommands.map((c, i) => {
							if (agent.isDefault && this.chatAgentService.getDefaultAgent(widget.location)?.id !== agent.id) {
								return;
							}

							const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
							const label = `${agentLabel} ${chatSubcommandLeader}${c.name}`;
							const item: CompletionItem = {
								label: isDupe ?
									{ label, description: c.description, detail: isDupe ? ` (${agent.publisherDisplayName})` : undefined } :
									label,
								documentation: c.description,
								filterText: getFilterText(agent, c.name),
								commitCharacters: [' '],
								insertText: label + ' ',
								range,
								kind: CompletionItemKind.Text, // The icons are disabled here anyway
								sortText: `x${chatAgentLeader}${agent.name}${c.name}`,
								command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget } satisfies AssignSelectedAgentActionArgs] },
							};

							if (agent.isDefault) {
								// default agent isn't mentioned nor inserted
								const label = `${chatSubcommandLeader}${c.name}`;
								item.label = label;
								item.insertText = `${label} `;
								item.documentation = c.description;
							}

							return item;
						}))))
				};
			}
		}));

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatAgentAndSubcommand',
			triggerCharacters: [chatSubcommandLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				const viewModel = widget?.viewModel;
				if (!widget || !viewModel) {
					return;
				}

				const range = computeCompletionRanges(model, position, /(@|\/)\w*/g);
				if (!range) {
					return null;
				}

				if (!isEmptyUpToCompletionWord(model, range)) {
					// No text allowed before the completion
					return;
				}

				const agents = this.chatAgentService.getAgents()
					.filter(a => a.locations.includes(widget.location));

				return {
					suggestions: coalesce(agents.flatMap(agent => agent.slashCommands.map((c, i) => {
						if (agent.isDefault && this.chatAgentService.getDefaultAgent(widget.location)?.id !== agent.id) {
							return;
						}

						const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
						const withSlash = `${chatSubcommandLeader}${c.name}`;
						const extraSortText = agent.id === 'github.copilot.terminalPanel' ? `z` : ``;
						const sortText = `${chatSubcommandLeader}${extraSortText}${agent.name}${c.name}`;
						const item: CompletionItem = {
							label: { label: withSlash, description: agentLabel, detail: isDupe ? ` (${agent.publisherDisplayName})` : undefined },
							commitCharacters: [' '],
							insertText: `${agentLabel} ${withSlash} `,
							documentation: `(${agentLabel}) ${c.description ?? ''}`,
							range,
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
							sortText,
							command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget } satisfies AssignSelectedAgentActionArgs] },
						};

						if (agent.isDefault) {
							// default agent isn't mentioned nor inserted
							const label = `${chatSubcommandLeader}${c.name}`;
							item.label = label;
							item.insertText = `${label} `;
							item.documentation = c.description;
						}

						return item;
					})))
				};
			}
		}));

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'installChatExtensions',
			triggerCharacters: [chatAgentLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				if (!model.getLineContent(1).startsWith(chatAgentLeader)) {
					return;
				}

				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (widget?.location !== ChatAgentLocation.Panel) {
					return;
				}

				const range = computeCompletionRanges(model, position, /(@|\/)\w*/g);
				if (!range) {
					return;
				}

				if (!isEmptyUpToCompletionWord(model, range)) {
					// No text allowed before the completion
					return;
				}

				const label = localize('installLabel', "Install Chat Extensions...");
				const item: CompletionItem = {
					label,
					insertText: '',
					range,
					kind: CompletionItemKind.Text, // The icons are disabled here anyway
					command: { id: 'workbench.extensions.search', title: '', arguments: ['@tag:chat-participant'] },
					filterText: chatAgentLeader + label,
					sortText: 'zzz'
				};

				return {
					suggestions: [item]
				};
			}
		}));
	}

	private getAgentCompletionDetails(agent: IChatAgentData): { label: string; isDupe: boolean } {
		const isAllowed = this.chatAgentNameService.getAgentNameRestriction(agent);
		const agentLabel = `${chatAgentLeader}${isAllowed ? agent.name : getFullyQualifiedId(agent)}`;
		const isDupe = isAllowed && this.chatAgentService.agentHasDupeName(agent.id);
		return { label: agentLabel, isDupe };
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentCompletions, LifecyclePhase.Eventually);

interface AssignSelectedAgentActionArgs {
	agent: IChatAgentData;
	widget: IChatWidget;
}

class AssignSelectedAgentAction extends Action2 {
	static readonly ID = 'workbench.action.chat.assignSelectedAgent';

	constructor() {
		super({
			id: AssignSelectedAgentAction.ID,
			title: '' // not displayed
		});
	}

	async run(accessor: ServicesAccessor, ...args: any[]) {
		const arg: AssignSelectedAgentActionArgs = args[0];
		if (!arg || !arg.widget || !arg.agent) {
			return;
		}

		arg.widget.lastSelectedAgent = arg.agent;
	}
}
registerAction2(AssignSelectedAgentAction);


class ReferenceArgument {
	constructor(
		readonly widget: IChatWidget,
		readonly variable: IDynamicVariable
	) { }
}

interface IVariableCompletionsDetails {
	model: ITextModel;
	position: Position;
	context: CompletionContext;
	widget: IChatWidget;
	range: IChatCompletionRangeResult;
}

class BuiltinDynamicCompletions extends Disposable {
	private static readonly addReferenceCommand = '_addReferenceCmd';
	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}[\\w:]*`, 'g'); // MUST be using `g`-flag

	private readonly queryBuilder: QueryBuilder;

	constructor(
		@IHistoryService private readonly historyService: IHistoryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISearchService private readonly searchService: ISearchService,
		@ILabelService private readonly labelService: ILabelService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOutlineModelService private readonly outlineService: IOutlineModelService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IMarkerService markerService: IMarkerService,
	) {
		super();

		// File completions
		this.registerVariableCompletions('file', async ({ widget, range, position, model }, token) => {
			if (!widget.supportsFileReferences) {
				return null;
			}

			const result: CompletionList = { suggestions: [] };

			const afterRange = new Range(position.lineNumber, range.replace.startColumn, position.lineNumber, range.replace.startColumn + '#file:'.length);
			result.suggestions.push({
				label: `${chatVariableLeader}file`,
				insertText: `${chatVariableLeader}file:`,
				documentation: localize('pickFileLabel', "Pick a file"),
				range,
				kind: CompletionItemKind.Text,
				command: { id: SelectAndInsertFileAction.ID, title: SelectAndInsertFileAction.ID, arguments: [{ widget, range: afterRange }] },
				sortText: 'z'
			});

			const range2 = computeCompletionRanges(model, position, new RegExp(`${chatVariableLeader}[^\\s]*`, 'g'), true);
			if (range2) {
				await this.addFileEntries(widget, result, range2, token);
			}

			return result;
		});

		// Folder completions
		this.registerVariableCompletions('folder', async ({ widget, range, position, model }, token) => {
			if (!widget.supportsFileReferences) {
				return null;
			}

			const result: CompletionList = { suggestions: [] };

			const afterRange = new Range(position.lineNumber, range.replace.startColumn, position.lineNumber, range.replace.startColumn + '#folder:'.length);
			result.suggestions.push({
				label: `${chatVariableLeader}folder`,
				insertText: `${chatVariableLeader}folder:`,
				documentation: localize('pickFolderLabel', "Pick a folder"),
				range,
				kind: CompletionItemKind.Text,
				command: { id: SelectAndInsertFolderAction.ID, title: SelectAndInsertFolderAction.ID, arguments: [{ widget, range: afterRange }] },
				sortText: 'z'
			});

			const range2 = computeCompletionRanges(model, position, new RegExp(`${chatVariableLeader}[^\\s]*`, 'g'), true);
			if (range2) {
				await this.addFolderEntries(widget, result, range2, token);
			}

			return result;
		});

		// Selection completion
		this.registerVariableCompletions('selection', ({ widget, range }, token) => {
			if (!widget.supportsFileReferences) {
				return;
			}

			if (widget.location === ChatAgentLocation.Editor) {
				return;
			}

			const active = this.editorService.activeTextEditorControl;
			if (!isCodeEditor(active)) {
				return;
			}

			const currentResource = active.getModel()?.uri;
			const currentSelection = active.getSelection();
			if (!currentSelection || !currentResource || currentSelection.isEmpty()) {
				return;
			}

			const basename = this.labelService.getUriBasenameLabel(currentResource);
			const text = `${chatVariableLeader}file:${basename}:${currentSelection.startLineNumber}-${currentSelection.endLineNumber}`;
			const fullRangeText = `:${currentSelection.startLineNumber}:${currentSelection.startColumn}-${currentSelection.endLineNumber}:${currentSelection.endColumn}`;
			const description = this.labelService.getUriLabel(currentResource, { relative: true }) + fullRangeText;

			const result: CompletionList = { suggestions: [] };
			result.suggestions.push({
				label: { label: `${chatVariableLeader}selection`, description },
				filterText: `${chatVariableLeader}selection`,
				insertText: range.varWord?.endColumn === range.replace.endColumn ? `${text} ` : text,
				range,
				kind: CompletionItemKind.Text,
				sortText: 'z',
				command: {
					id: BuiltinDynamicCompletions.addReferenceCommand, title: '', arguments: [new ReferenceArgument(widget, {
						id: 'vscode.selection',
						prefix: 'file',
						isFile: true,
						range: { startLineNumber: range.replace.startLineNumber, startColumn: range.replace.startColumn, endLineNumber: range.replace.endLineNumber, endColumn: range.replace.startColumn + text.length },
						data: { range: currentSelection, uri: currentResource } satisfies Location
					})]
				}
			});
			return result;
		});

		// Symbol completions
		this.registerVariableCompletions('symbol', ({ widget, range, position, model }, token) => {
			if (!widget.supportsFileReferences) {
				return null;
			}

			const result: CompletionList = { suggestions: [] };

			const afterRangeSym = new Range(position.lineNumber, range.replace.startColumn, position.lineNumber, range.replace.startColumn + '#sym:'.length);
			result.suggestions.push({
				label: `${chatVariableLeader}sym`,
				insertText: `${chatVariableLeader}sym:`,
				documentation: localize('pickSymbolLabel', "Pick a symbol"),
				range,
				kind: CompletionItemKind.Text,
				command: { id: SelectAndInsertSymAction.ID, title: SelectAndInsertSymAction.ID, arguments: [{ widget, range: afterRangeSym }] },
				sortText: 'z'
			});

			const range2 = computeCompletionRanges(model, position, new RegExp(`${chatVariableLeader}[^\\s]*`, 'g'), true);
			if (range2) {
				this.addSymbolEntries(widget, result, range2, token);
			}

			return result;
		});

		// Problems completions, we just attach all problems in this case
		this.registerVariableCompletions(SelectAndInsertProblemAction.Name, ({ widget, range, position, model }, token) => {
			const stats = markerService.getStatistics();
			if (!stats.errors && !stats.warnings) {
				return null;
			}

			const result: CompletionList = { suggestions: [] };

			const completedText = `${chatVariableLeader}${SelectAndInsertProblemAction.Name}:`;
			const afterTextRange = new Range(position.lineNumber, range.replace.startColumn, position.lineNumber, range.replace.startColumn + completedText.length);
			result.suggestions.push({
				label: `${chatVariableLeader}${SelectAndInsertProblemAction.Name}`,
				insertText: completedText,
				documentation: localize('pickProblemsLabel', "Problems in your workspace"),
				range,
				kind: CompletionItemKind.Text,
				command: { id: SelectAndInsertProblemAction.ID, title: SelectAndInsertProblemAction.ID, arguments: [{ widget, range: afterTextRange }] },
				sortText: 'z'
			});

			return result;
		});

		this._register(CommandsRegistry.registerCommand(BuiltinDynamicCompletions.addReferenceCommand, (_services, arg) => this.cmdAddReference(arg)));

		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
	}

	private registerVariableCompletions(debugName: string, provider: (details: IVariableCompletionsDetails, token: CancellationToken) => ProviderResult<CompletionList>) {
		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: `chatVarCompletions-${debugName}`,
			triggerCharacters: [chatVariableLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, context: CompletionContext, token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return;
				}

				const range = computeCompletionRanges(model, position, BuiltinDynamicCompletions.VariableNameDef, true);
				if (range) {
					return provider({ model, position, widget, range, context }, token);
				}

				return;
			}
		}));
	}

	private cacheKey?: { key: string; time: number };

	private async addFileEntries(widget: IChatWidget, result: CompletionList, info: { insert: Range; replace: Range; varWord: IWordAtPosition | null }, token: CancellationToken) {

		const makeFileCompletionItem = (resource: URI, description?: string): CompletionItem => {

			const basename = this.labelService.getUriBasenameLabel(resource);
			const text = `${chatVariableLeader}file:${basename}`;
			const uriLabel = this.labelService.getUriLabel(resource, { relative: true });
			const labelDescription = description
				? localize('fileEntryDescription', '{0} ({1})', uriLabel, description)
				: uriLabel;
			const sortText = description ? 'z' : '{'; // after `z`

			return {
				label: { label: basename, description: labelDescription },
				filterText: `${chatVariableLeader}${basename}`,
				insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
				range: info,
				kind: CompletionItemKind.File,
				sortText,
				command: {
					id: BuiltinDynamicCompletions.addReferenceCommand, title: '', arguments: [new ReferenceArgument(widget, {
						id: 'vscode.file',
						prefix: 'file',
						isFile: true,
						range: { startLineNumber: info.replace.startLineNumber, startColumn: info.replace.startColumn, endLineNumber: info.replace.endLineNumber, endColumn: info.replace.startColumn + text.length },
						data: resource
					})]
				}
			};
		};

		let pattern: string | undefined;
		if (info.varWord?.word && info.varWord.word.startsWith(chatVariableLeader)) {
			pattern = info.varWord.word.toLowerCase().slice(1); // remove leading #
		}

		const seen = new ResourceSet();
		const len = result.suggestions.length;

		// RELATED FILES
		if (widget.location === ChatAgentLocation.EditingSession && widget.viewModel && this._chatEditingService.getEditingSession(widget.viewModel.sessionId)) {
			const relatedFiles = (await raceTimeout(this._chatEditingService.getRelatedFiles(widget.viewModel.sessionId, widget.getInput(), widget.attachmentModel.fileAttachments, token), 200)) ?? [];
			for (const relatedFileGroup of relatedFiles) {
				for (const relatedFile of relatedFileGroup.files) {
					if (seen.has(relatedFile.uri)) {
						continue;
					}
					seen.add(relatedFile.uri);
					result.suggestions.push(makeFileCompletionItem(relatedFile.uri, relatedFile.description));
				}
			}
		}

		// HISTORY
		// always take the last N items
		for (const item of this.historyService.getHistory()) {
			if (!item.resource || !this.workspaceContextService.getWorkspaceFolder(item.resource)) {
				// ignore "forgein" editors
				continue;
			}

			if (pattern) {
				// use pattern if available
				const basename = this.labelService.getUriBasenameLabel(item.resource).toLowerCase();
				if (!isPatternInWord(pattern, 0, pattern.length, basename, 0, basename.length)) {
					continue;
				}
			}

			seen.add(item.resource);
			const newLen = result.suggestions.push(makeFileCompletionItem(item.resource));
			if (newLen - len >= 5) {
				break;
			}
		}

		// SEARCH
		// use file search when having a pattern
		if (pattern) {

			const cacheKey = this.updateCacheKey();

			const query = this.queryBuilder.file(this.workspaceContextService.getWorkspace().folders, {
				filePattern: pattern,
				sortByScore: true,
				maxResults: 250,
				cacheKey: cacheKey.key
			});

			const data = await this.searchService.fileSearch(query, token);
			for (const match of data.results) {
				if (seen.has(match.resource)) {
					// already included via history
					continue;
				}
				result.suggestions.push(makeFileCompletionItem(match.resource));
			}
		}

		// mark results as incomplete because further typing might yield
		// in more search results
		result.incomplete = true;
	}

	private async addFolderEntries(widget: IChatWidget, result: CompletionList, info: { insert: Range; replace: Range; varWord: IWordAtPosition | null }, token: CancellationToken) {

		const folderLeader = `${chatVariableLeader}folder:`;

		const makeFolderCompletionItem = (resource: URI, description?: string): CompletionItem => {

			const basename = this.labelService.getUriBasenameLabel(resource);
			const text = `${folderLeader}${basename}`;
			const uriLabel = this.labelService.getUriLabel(dirname(resource), { relative: true });
			const labelDescription = description
				? localize('folderEntryDescription', '{0} ({1})', uriLabel, description)
				: uriLabel;
			const sortText = description ? 'z' : '{'; // after `z`

			return {
				label: { label: basename, description: labelDescription },
				filterText: `${folderLeader}${basename}`,
				insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
				range: info,
				kind: CompletionItemKind.Folder,
				sortText,
				command: {
					id: BuiltinDynamicCompletions.addReferenceCommand, title: '', arguments: [new ReferenceArgument(widget, {
						id: 'vscode.folder',
						prefix: 'folder',
						isFile: false,
						isDirectory: true,
						range: { startLineNumber: info.replace.startLineNumber, startColumn: info.replace.startColumn, endLineNumber: info.replace.endLineNumber, endColumn: info.replace.startColumn + text.length },
						data: resource
					})]
				}
			};
		};

		const seen = new ResourceSet();
		const workspaces = this.workspaceContextService.getWorkspace().folders.map(folder => folder.uri);

		let pattern: string | undefined;
		if (info.varWord?.word && info.varWord.word.startsWith(folderLeader)) {
			pattern = info.varWord.word.toLowerCase().slice(folderLeader.length);

			for (const folder of await getTopLevelFolders(workspaces, this.fileService)) {
				result.suggestions.push(makeFolderCompletionItem(folder));
				seen.add(folder);
			}
		}

		// SEARCH
		// use folder search when having a pattern
		if (pattern) {

			const cacheKey = this.updateCacheKey();

			const folders = await Promise.all(workspaces.map(workspace => searchFolders(workspace, pattern, true, token, cacheKey.key, this.configurationService, this.searchService)));
			for (const resource of folders.flat()) {
				if (seen.has(resource)) {
					// already included via history
					continue;
				}
				seen.add(resource);
				result.suggestions.push(makeFolderCompletionItem(resource));
			}
		}

		// mark results as incomplete because further typing might yield
		// in more search results
		result.incomplete = true;
	}

	private addSymbolEntries(widget: IChatWidget, result: CompletionList, info: { insert: Range; replace: Range; varWord: IWordAtPosition | null }, token: CancellationToken) {

		const makeSymbolCompletionItem = (symbolItem: { name: string; location: Location; kind: SymbolKind }, pattern: string): CompletionItem => {
			const text = `${chatVariableLeader}sym:${symbolItem.name}`;
			const resource = symbolItem.location.uri;
			const uriLabel = this.labelService.getUriLabel(resource, { relative: true });
			const sortText = pattern ? '{' /* after z */ : '|' /* after { */;

			return {
				label: { label: symbolItem.name, description: uriLabel },
				filterText: `${chatVariableLeader}${symbolItem.name}`,
				insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
				range: info,
				kind: SymbolKinds.toCompletionKind(symbolItem.kind),
				sortText,
				command: {
					id: BuiltinDynamicCompletions.addReferenceCommand, title: '', arguments: [new ReferenceArgument(widget, {
						id: 'vscode.symbol',
						prefix: 'sym',
						fullName: symbolItem.name,
						range: { startLineNumber: info.replace.startLineNumber, startColumn: info.replace.startColumn, endLineNumber: info.replace.endLineNumber, endColumn: info.replace.startColumn + text.length },
						data: symbolItem.location
					})]
				}
			};
		};

		let pattern: string | undefined;
		if (info.varWord?.word && info.varWord.word.startsWith(chatVariableLeader)) {
			pattern = info.varWord.word.toLowerCase().slice(1); // remove leading #
		}

		const symbolsToAdd: { symbol: DocumentSymbol; uri: URI }[] = [];
		for (const outlineModel of this.outlineService.getCachedModels()) {
			if (pattern) {
				symbolsToAdd.push(...outlineModel.asListOfDocumentSymbols().map(symbol => ({ symbol, uri: outlineModel.uri })));
			} else {
				symbolsToAdd.push(...outlineModel.getTopLevelSymbols().map(symbol => ({ symbol, uri: outlineModel.uri })));
			}
		}

		const symbolsToAddFiltered = symbolsToAdd.filter(fileSymbol => {
			switch (fileSymbol.symbol.kind) {
				case SymbolKind.Enum:
				case SymbolKind.Class:
				case SymbolKind.Method:
				case SymbolKind.Function:
				case SymbolKind.Namespace:
				case SymbolKind.Module:
				case SymbolKind.Interface:
					return true;
				default:
					return false;
			}
		});

		for (const symbol of symbolsToAddFiltered) {
			result.suggestions.push(makeSymbolCompletionItem({ ...symbol.symbol, location: { uri: symbol.uri, range: symbol.symbol.range } }, pattern ?? ''));
		}

		result.incomplete = !!pattern;
	}

	private updateCacheKey() {
		if (this.cacheKey && Date.now() - this.cacheKey.time > 60000) {
			this.searchService.clearCache(this.cacheKey.key);
			this.cacheKey = undefined;
		}

		if (!this.cacheKey) {
			this.cacheKey = {
				key: generateUuid(),
				time: Date.now()
			};
		}

		this.cacheKey.time = Date.now();

		return this.cacheKey;
	}

	private cmdAddReference(arg: ReferenceArgument) {
		// invoked via the completion command
		arg.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference(arg.variable);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinDynamicCompletions, LifecyclePhase.Eventually);

export interface IChatCompletionRangeResult {
	insert: Range;
	replace: Range;
	varWord: IWordAtPosition | null;
}

export function computeCompletionRanges(model: ITextModel, position: Position, reg: RegExp, onlyOnWordStart = false): IChatCompletionRangeResult | undefined {
	const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
	if (!varWord && model.getWordUntilPosition(position).word) {
		// inside a "normal" word
		return;
	}

	if (!varWord && position.column > 1) {
		const textBefore = model.getValueInRange(new Range(position.lineNumber, position.column - 1, position.lineNumber, position.column));
		if (textBefore !== ' ') {
			return;
		}
	}

	if (varWord && onlyOnWordStart) {
		const wordBefore = model.getWordUntilPosition({ lineNumber: position.lineNumber, column: varWord.startColumn });
		if (wordBefore.word) {
			// inside a word
			return;
		}
	}

	let insert: Range;
	let replace: Range;
	if (!varWord) {
		insert = replace = Range.fromPositions(position);
	} else {
		insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
		replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
	}

	return { insert, replace, varWord };
}

function isEmptyUpToCompletionWord(model: ITextModel, rangeResult: IChatCompletionRangeResult): boolean {
	const startToCompletionWordStart = new Range(1, 1, rangeResult.replace.startLineNumber, rangeResult.replace.startColumn);
	return !!model.getValueInRange(startToCompletionWordStart).match(/^\s*$/);
}

class ToolCompletions extends Disposable {

	private static readonly VariableNameDef = new RegExp(`(?<=^|\\s)${chatVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatVariables',
			triggerCharacters: [chatVariableLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return null;
				}

				const range = computeCompletionRanges(model, position, ToolCompletions.VariableNameDef, true);
				if (!range) {
					return null;
				}

				const usedTools = widget.parsedInput.parts.filter((p): p is ChatRequestToolPart => p instanceof ChatRequestToolPart);
				const usedToolNames = new Set(usedTools.map(v => v.toolName));
				const toolItems: CompletionItem[] = [];
				toolItems.push(...Array.from(toolsService.getTools())
					.filter(t => t.canBeReferencedInPrompt)
					.filter(t => !usedToolNames.has(t.toolReferenceName ?? ''))
					.map((t): CompletionItem => {
						const withLeader = `${chatVariableLeader}${t.toolReferenceName}`;
						return {
							label: withLeader,
							range,
							insertText: withLeader + ' ',
							documentation: t.userDescription,
							kind: CompletionItemKind.Text,
							sortText: 'z'
						};
					}));

				return {
					suggestions: toolItems
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ToolCompletions, LifecyclePhase.Eventually);
