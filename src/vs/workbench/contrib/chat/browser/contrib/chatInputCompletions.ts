/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isPatternInWord } from '../../../../../base/common/filters.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IWordAtPosition, getWordAtText } from '../../../../../editor/common/core/wordHelper.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../../common/contributions.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { QueryBuilder } from '../../../../services/search/common/queryBuilder.js';
import { ISearchService } from '../../../../services/search/common/search.js';
import { ChatAgentLocation, IChatAgentData, IChatAgentNameService, IChatAgentService, getFullyQualifiedId } from '../../common/chatAgents.js';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestVariablePart, chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from '../../common/chatParserTypes.js';
import { IChatSlashCommandService } from '../../common/chatSlashCommands.js';
import { IChatVariablesService, IDynamicVariable } from '../../common/chatVariables.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { SubmitAction } from '../actions/chatExecuteActions.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { ChatInputPart } from '../chatInputPart.js';
import { ChatDynamicVariableModel, SelectAndInsertFileAction } from './chatDynamicVariables.js';

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
							detail: c.detail,
							range: new Range(1, 1, 1, 1),
							sortText: c.sortText ?? 'a'.repeat(i + 1),
							kind: CompletionItemKind.Text, // The icons are disabled here anyway,
							command: c.executeImmediately ? { id: SubmitAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : undefined,
						};
					})
				};
			}
		}));
		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'globalSlashCommandsAt',
			triggerCharacters: ['@'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.viewModel) {
					return null;
				}

				const range = computeCompletionRanges(model, position, /@\w*/g);
				if (!range) {
					return null;
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
							detail: c.detail,
							range: new Range(1, 1, 1, 1),
							filterText: `${chatAgentLeader}${c.command}`,
							sortText: c.sortText ?? 'z'.repeat(i + 1),
							kind: CompletionItemKind.Text, // The icons are disabled here anyway,
							command: c.executeImmediately ? { id: SubmitAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : undefined,
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
							detail: c.description,
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
							detail,
							filterText: `${chatAgentLeader}${agent.name}`,
							insertText: `${agentLabel} `,
							range: new Range(1, 1, 1, 1),
							kind: CompletionItemKind.Text,
							sortText: `${chatAgentLeader}${agent.name}`,
							command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget } satisfies AssignSelectedAgentActionArgs] },
						};
					});

				return {
					suggestions: justAgents.concat(
						agents.flatMap(agent => agent.slashCommands.map((c, i) => {
							const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
							const label = `${agentLabel} ${chatSubcommandLeader}${c.name}`;
							const item: CompletionItem = {
								label: isDupe ?
									{ label, description: c.description, detail: isDupe ? ` (${agent.publisherDisplayName})` : undefined } :
									label,
								detail: c.description,
								filterText: getFilterText(agent, c.name),
								commitCharacters: [' '],
								insertText: label + ' ',
								range: new Range(1, 1, 1, 1),
								kind: CompletionItemKind.Text, // The icons are disabled here anyway
								sortText: `x${chatAgentLeader}${agent.name}${c.name}`,
								command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget } satisfies AssignSelectedAgentActionArgs] },
							};

							if (agent.isDefault) {
								// default agent isn't mentioned nor inserted
								const label = `${chatSubcommandLeader}${c.name}`;
								item.label = label;
								item.insertText = `${label} `;
								item.detail = c.description;
							}

							return item;
						})))
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

				const agents = this.chatAgentService.getAgents()
					.filter(a => a.locations.includes(widget.location));

				return {
					suggestions: agents.flatMap(agent => agent.slashCommands.map((c, i) => {
						const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
						const withSlash = `${chatSubcommandLeader}${c.name}`;
						const extraSortText = agent.id === 'github.copilot.terminalPanel' ? `z` : ``;
						const sortText = `${chatSubcommandLeader}${extraSortText}${agent.name}${c.name}`;
						const item: CompletionItem = {
							label: { label: withSlash, description: agentLabel, detail: isDupe ? ` (${agent.publisherDisplayName})` : undefined },
							commitCharacters: [' '],
							insertText: `${agentLabel} ${withSlash} `,
							detail: `(${agentLabel}) ${c.description ?? ''}`,
							range: new Range(1, 1, 1, 1),
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
							sortText,
							command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget } satisfies AssignSelectedAgentActionArgs] },
						};

						if (agent.isDefault) {
							// default agent isn't mentioned nor inserted
							const label = `${chatSubcommandLeader}${c.name}`;
							item.label = label;
							item.insertText = `${label} `;
							item.detail = c.description;
						}

						return item;
					}))
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

				const label = localize('installLabel', "Install Chat Extensions...");
				const item: CompletionItem = {
					label,
					insertText: '',
					range: new Range(1, 1, 1, 1),
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

class BuiltinDynamicCompletions extends Disposable {
	private static readonly addReferenceCommand = '_addReferenceCmd';
	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag

	private readonly queryBuilder: QueryBuilder;

	constructor(
		@IHistoryService private readonly historyService: IHistoryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISearchService private readonly searchService: ISearchService,
		@ILabelService private readonly labelService: ILabelService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatDynamicCompletions',
			triggerCharacters: [chatVariableLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.supportsFileReferences) {
					return null;
				}

				const result: CompletionList = { suggestions: [] };
				const range = computeCompletionRanges(model, position, BuiltinDynamicCompletions.VariableNameDef, true);

				if (range) {
					const afterRange = new Range(position.lineNumber, range.replace.startColumn, position.lineNumber, range.replace.startColumn + '#file:'.length);
					result.suggestions.push({
						label: `${chatVariableLeader}file`,
						insertText: `${chatVariableLeader}file:`,
						detail: localize('pickFileLabel', "Pick a file"),
						range,
						kind: CompletionItemKind.Text,
						command: { id: SelectAndInsertFileAction.ID, title: SelectAndInsertFileAction.ID, arguments: [{ widget, range: afterRange }] },
						sortText: 'z'
					});
				}

				const range2 = computeCompletionRanges(model, position, new RegExp(`${chatVariableLeader}[^\\s]*`, 'g'), true);
				if (range2) {
					await this.addFileEntries(widget, result, range2, token);
				}

				return result;
			}
		}));

		this._register(CommandsRegistry.registerCommand(BuiltinDynamicCompletions.addReferenceCommand, (_services, arg) => this.cmdAddReference(arg)));

		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
	}

	private cacheKey?: { key: string; time: number };

	private async addFileEntries(widget: IChatWidget, result: CompletionList, info: { insert: Range; replace: Range; varWord: IWordAtPosition | null }, token: CancellationToken) {

		const makeFileCompletionItem = (resource: URI): CompletionItem => {

			const basename = this.labelService.getUriBasenameLabel(resource);
			const text = `${chatVariableLeader}file:${basename}`;

			return {
				label: { label: basename, description: this.labelService.getUriLabel(resource, { relative: true }) },
				filterText: `${chatVariableLeader}${basename}`,
				insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
				range: info,
				kind: CompletionItemKind.File,
				sortText: '{', // after `z`
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

			const query = this.queryBuilder.file(this.workspaceContextService.getWorkspace().folders, {
				filePattern: pattern,
				sortByScore: true,
				maxResults: 250,
				cacheKey: this.cacheKey.key
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

	private cmdAddReference(arg: ReferenceArgument) {
		// invoked via the completion command
		arg.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference(arg.variable);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinDynamicCompletions, LifecyclePhase.Eventually);

export function computeCompletionRanges(model: ITextModel, position: Position, reg: RegExp, onlyOnWordStart = false): { insert: Range; replace: Range; varWord: IWordAtPosition | null } | undefined {
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

class VariableCompletions extends Disposable {

	private static readonly VariableNameDef = new RegExp(`(?<=^|\\s)${chatVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatVariablesService private readonly chatVariablesService: IChatVariablesService,
		@IConfigurationService configService: IConfigurationService,
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

				const range = computeCompletionRanges(model, position, VariableCompletions.VariableNameDef, true);
				if (!range) {
					return null;
				}

				const usedAgent = widget.parsedInput.parts.find(p => p instanceof ChatRequestAgentPart);
				const slowSupported = usedAgent ? usedAgent.agent.metadata.supportsSlowVariables : true;

				const usedVariables = widget.parsedInput.parts.filter((p): p is ChatRequestVariablePart => p instanceof ChatRequestVariablePart);
				const usedVariableNames = new Set(usedVariables.map(v => v.variableName));
				const variableItems = Array.from(this.chatVariablesService.getVariables(widget.location))
					// This doesn't look at dynamic variables like `file`, where multiple makes sense.
					.filter(v => !usedVariableNames.has(v.name))
					.filter(v => !v.isSlow || slowSupported)
					.map((v): CompletionItem => {
						const withLeader = `${chatVariableLeader}${v.name}`;
						return {
							label: withLeader,
							range,
							insertText: withLeader + ' ',
							detail: v.description,
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
							sortText: 'z'
						};
					});

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
							detail: t.userDescription,
							kind: CompletionItemKind.Text,
							sortText: 'z'
						};
					}));

				return {
					suggestions: [...variableItems, ...toolItems]
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(VariableCompletions, LifecyclePhase.Eventually);
