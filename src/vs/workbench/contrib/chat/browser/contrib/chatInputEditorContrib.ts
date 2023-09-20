/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { getWordAtText } from 'vs/editor/common/core/wordHelper';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { SubmitAction } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';
import { IChatWidget, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { chatSlashCommandBackground, chatSlashCommandForeground } from 'vs/workbench/contrib/chat/common/chatColors';
import { ChatRequestAgentPart, ChatRequestSlashCommandPart, ChatRequestVariablePart } from 'vs/workbench/contrib/chat/common/chatModel';
import { parseChatRequest } from 'vs/workbench/contrib/chat/common/chatRequestParser';
import { IChatService, ISlashCommand } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

const decorationDescription = 'chat';
const placeholderDecorationType = 'chat-session-detail';
const slashCommandTextDecorationType = 'chat-session-text';
const variableTextDecorationType = 'chat-variable-text';

class InputEditorDecorations extends Disposable {

	private _previouslyUsedSlashCommands = new Set<string>();

	constructor(
		private readonly widget: IChatWidget,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();

		this.codeEditorService.registerDecorationType(decorationDescription, placeholderDecorationType, {});

		this._register(this.themeService.onDidColorThemeChange(() => this.updateRegisteredDecorationTypes()));
		this.updateRegisteredDecorationTypes();

		this.updateInputEditorDecorations();
		this._register(this.widget.inputEditor.onDidChangeModelContent(() => this.updateInputEditorDecorations()));
		this._register(this.widget.onDidChangeViewModel(() => {
			this._previouslyUsedSlashCommands.clear();
			this.updateInputEditorDecorations();
		}));
		this._register(this.chatService.onDidSubmitSlashCommand((e) => {
			if (e.sessionId === this.widget.viewModel?.sessionId && !this._previouslyUsedSlashCommands.has(e.slashCommand)) {
				this._previouslyUsedSlashCommands.add(e.slashCommand);
			}
		}));
	}

	private updateRegisteredDecorationTypes() {
		this.codeEditorService.removeDecorationType(variableTextDecorationType);
		this.codeEditorService.removeDecorationType(slashCommandTextDecorationType);

		const theme = this.themeService.getColorTheme();
		this.codeEditorService.registerDecorationType(decorationDescription, slashCommandTextDecorationType, {
			color: theme.getColor(chatSlashCommandForeground)?.toString(),
			backgroundColor: theme.getColor(chatSlashCommandBackground)?.toString()
		});
		this.codeEditorService.registerDecorationType(decorationDescription, variableTextDecorationType, {
			color: theme.getColor(chatSlashCommandForeground)?.toString(),
			backgroundColor: theme.getColor(chatSlashCommandBackground)?.toString(),
			borderRadius: '3px'
		});
		this.updateInputEditorDecorations();
	}

	private getPlaceholderColor(): string | undefined {
		const theme = this.themeService.getColorTheme();
		const transparentForeground = theme.getColor(inputPlaceholderForeground);
		return transparentForeground?.toString();
	}

	private async updateInputEditorDecorations() {
		const inputValue = this.widget.inputEditor.getValue();
		const slashCommands = await this.widget.getSlashCommands(); // TODO this async call can lead to a flicker of the placeholder text when switching editor tabs

		const viewModel = this.widget.viewModel;
		if (!viewModel) {
			return;
		}

		if (!inputValue) {
			const extensionPlaceholder = this.widget.viewModel?.inputPlaceholder;
			const defaultPlaceholder = slashCommands?.length ?
				localize('interactive.input.placeholderWithCommands', "Ask a question or type '@' or '/'") :
				localize('interactive.input.placeholderNoCommands', "Ask a question");
			const placeholder = extensionPlaceholder ?? defaultPlaceholder;
			const decoration: IDecorationOptions[] = [
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: 1,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: placeholder,
							color: this.getPlaceholderColor()
						}
					}
				}
			];
			this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, decoration);
			return;
		}

		const parsedRequest = await this.instantiationService.invokeFunction(parseChatRequest, viewModel.sessionId, inputValue);

		let placeholderDecoration: IDecorationOptions[] | undefined;
		const agentPart = parsedRequest.find((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart);
		const agentSubcommandPart = agentPart && parsedRequest.find((p): p is ChatRequestSlashCommandPart => p instanceof ChatRequestSlashCommandPart);
		const slashCommandPart = !agentPart && parsedRequest.find((p): p is ChatRequestSlashCommandPart => p instanceof ChatRequestSlashCommandPart);

		if (agentPart && inputValue.trim() === `@${agentPart.agent.id}`) {
			// Agent reference with no other text - show the placeholder
			if (agentPart.agent.metadata.description) {
				placeholderDecoration = [{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: inputValue.length,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: agentPart.agent.metadata.description,
							color: this.getPlaceholderColor(),
						}
					}
				}];
			}
		}

		if (slashCommandPart && inputValue.trim() === `/${slashCommandPart.slashCommand}`) {
			// Command reference with no other text - show the placeholder
			const isFollowupSlashCommand = this._previouslyUsedSlashCommands.has(slashCommandPart.slashCommand.command);
			const shouldRenderFollowupPlaceholder = isFollowupSlashCommand && slashCommandPart.slashCommand.followupPlaceholder;
			if (shouldRenderFollowupPlaceholder || slashCommandPart.slashCommand.detail) {
				placeholderDecoration = [{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: slashCommandPart ? inputValue.length : 1,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: shouldRenderFollowupPlaceholder ? slashCommandPart.slashCommand.followupPlaceholder : slashCommandPart.slashCommand.detail,
							color: this.getPlaceholderColor(),
						}
					}
				}];
			}
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, placeholderDecoration ?? []);

		// TODO@roblourens The way these numbers are computed aren't totally correct...
		const textDecorations: IDecorationOptions[] | undefined = [];
		if (agentPart) {
			textDecorations.push(
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: agentPart.range.start + 1,
						endColumn: agentPart.range.endExclusive + 1
					}
				}
			);
			if (agentSubcommandPart) {
				textDecorations.push(
					{
						range: {
							startLineNumber: 1,
							endLineNumber: 1,
							startColumn: agentSubcommandPart.range.start + 1,
							endColumn: agentSubcommandPart.range.endExclusive + 1
						}
					}
				);
			}
		}

		if (slashCommandPart) {
			textDecorations.push(
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: slashCommandPart.range.start + 1,
						endColumn: slashCommandPart.range.endExclusive + 1
					}
				}
			);
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, textDecorations);

		const varDecorations: IDecorationOptions[] = [];
		const variableParts = parsedRequest.filter((p): p is ChatRequestVariablePart => p instanceof ChatRequestVariablePart);
		for (const variable of variableParts) {
			varDecorations.push({
				range: {
					startLineNumber: 1,
					endLineNumber: 1,
					startColumn: variable.range.start + 1,
					endColumn: variable.range.endExclusive + 1
				}
			});
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, variableTextDecorationType, varDecorations);
	}
}

class InputEditorSlashCommandMode extends Disposable {
	constructor(
		private readonly widget: IChatWidget,
		@IChatService private readonly chatService: IChatService
	) {
		super();
		this._register(this.chatService.onDidSubmitSlashCommand(({ slashCommand, sessionId }) => this.repopulateSlashCommand(slashCommand, sessionId)));
	}

	private async repopulateSlashCommand(slashCommand: string, sessionId: string) {
		if (this.widget.viewModel?.sessionId !== sessionId) {
			return;
		}

		const slashCommands = await this.widget.getSlashCommands();

		if (this.widget.inputEditor.getValue().trim().length !== 0) {
			return;
		}

		if (slashCommands?.find(c => c.command === slashCommand)?.shouldRepopulate) {
			const value = `/${slashCommand} `;
			this.widget.inputEditor.setValue(value);
			this.widget.inputEditor.setPosition({ lineNumber: 1, column: value.length + 1 });

		}
	}
}

ChatWidget.CONTRIBS.push(InputEditorDecorations, InputEditorSlashCommandMode);

class SlashCommandCompletions extends Disposable {
	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatSlashCommand',
			triggerCharacters: ['/'],
			provideCompletionItems: async (model: ITextModel, _position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return null;
				}

				const firstLine = model.getLineContent(1).trim();

				const agents = this.chatAgentService.getAgents();
				const usedAgent = firstLine.startsWith('@') && agents.find(a => firstLine.startsWith(`@${a.id}`));
				if (usedAgent) {
					// No (classic) global slash commands when an agent is used
					return;
				}

				if (model.getValueInRange(new Range(1, 1, 1, 2)) !== '/' && model.getValueLength() > 0) {
					return null;
				}

				const slashCommands = await widget.getSlashCommands();
				if (!slashCommands) {
					return null;
				}

				return <CompletionList>{
					suggestions: sortSlashCommandsByYieldTo<ISlashCommand>(slashCommands).map((c, i) => {
						const withSlash = `/${c.command}`;
						return <CompletionItem>{
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
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SlashCommandCompletions, LifecyclePhase.Eventually);

class AgentCompletions extends Disposable {
	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatAgent',
			triggerCharacters: ['@'],
			provideCompletionItems: async (model: ITextModel, _position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return null;
				}

				if (model.getValueInRange(new Range(1, 1, 1, 2)) !== '@' && model.getValueLength() > 0) {
					return null;
				}

				const agents = this.chatAgentService.getAgents();
				return <CompletionList>{
					suggestions: agents.map((c, i) => {
						const withAt = `@${c.id}`;
						return <CompletionItem>{
							label: withAt,
							insertText: `${withAt} `,
							detail: c.metadata.description,
							range: new Range(1, 1, 1, 1),
							// sortText: 'a'.repeat(i + 1),
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
							// command: c.executeImmediately ? { id: SubmitAction.ID, title: withAt, arguments: [{ widget, inputValue: `${withAt} ` }] } : undefined,
						};
					})
				};
			}
		}));

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatAgentSubcommand',
			triggerCharacters: ['/'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return;
				}

				const firstLine = model.getLineContent(1).trim();

				if (!firstLine.startsWith('@')) {
					return;
				}

				const agents = this.chatAgentService.getAgents();
				const usedAgent = agents.find(a => firstLine.startsWith(`@${a.id}`));
				if (!usedAgent) {
					return;
				}

				const maybeCommands = model.getValue().split(/\s+/).filter(w => w.startsWith('/'));
				const usedSubcommand = usedAgent.metadata.subCommands.find(agentCommand => maybeCommands.some(c => c === `/${agentCommand.name}`));
				if (usedSubcommand) {
					// Only one allowed
					return;
				}

				return <CompletionList>{
					suggestions: usedAgent.metadata.subCommands.map((c, i) => {
						const withSlash = `/${c.name}`;
						return <CompletionItem>{
							label: withSlash,
							insertText: `${withSlash} `,
							detail: c.description,
							range: new Range(1, position.column - 1, 1, position.column - 1),
							// sortText: 'a'.repeat(i + 1),
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
							// command: c.executeImmediately ? { id: SubmitAction.ID, title: withAt, arguments: [{ widget, inputValue: `${withAt} ` }] } : undefined,
						};
					})
				};
			}
		}));

		// list subcommands when the query is empty, insert agent+subcommand
		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatAgentAndSubcommand',
			triggerCharacters: ['/'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return;
				}

				if (model.getValue().trim() !== '/') {
					// Only when the input only contains a slash
					return;
				}

				const agents = this.chatAgentService.getAgents();
				return <CompletionList>{
					suggestions: agents.flatMap(a => a.metadata.subCommands.map((c, i) => {
						const withSlash = `/${c.name}`;
						return <CompletionItem>{
							label: withSlash,
							insertText: `@${a.id} ${withSlash} `,
							detail: `(@${a.id}) ${c.description}`,
							range: new Range(1, 1, 1, 1),
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
						};
					}))
				};
			}
		}));
	}
}

interface SlashCommandYieldTo {
	command: string;
}

// Adapted from https://github.com/microsoft/vscode/blob/ca2c1636f87ea4705f32345c2e348e815996e129/src/vs/editor/contrib/dropOrPasteInto/browser/edit.ts#L31-L99
function sortSlashCommandsByYieldTo<T extends {
	readonly command: string;
	readonly yieldsTo?: ReadonlyArray<SlashCommandYieldTo>;
}>(slashCommands: readonly T[]): T[] {
	function yieldsTo(yTo: SlashCommandYieldTo, other: T): boolean {
		return 'command' in yTo && other.command === yTo.command;
	}

	// Build list of nodes each node yields to
	const yieldsToMap = new Map<T, T[]>();
	for (const slashCommand of slashCommands) {
		for (const yTo of slashCommand.yieldsTo ?? []) {
			for (const other of slashCommands) {
				if (other.command === slashCommand.command) {
					continue;
				}

				if (yieldsTo(yTo, other)) {
					let arr = yieldsToMap.get(slashCommand);
					if (!arr) {
						arr = [];
						yieldsToMap.set(slashCommand, arr);
					}
					arr.push(other);
				}
			}
		}
	}

	if (!yieldsToMap.size) {
		return Array.from(slashCommands);
	}

	// Topological sort
	const visited = new Set<T>();
	const tempStack: T[] = [];

	function visit(nodes: T[]): T[] {
		if (!nodes.length) {
			return [];
		}

		const node = nodes[0];
		if (tempStack.includes(node)) {
			console.warn(`Yield to cycle detected for ${node.command}`);
			return nodes;
		}

		if (visited.has(node)) {
			return visit(nodes.slice(1));
		}

		let pre: T[] = [];
		const yTo = yieldsToMap.get(node);
		if (yTo) {
			tempStack.push(node);
			pre = visit(yTo);
			tempStack.pop();
		}

		visited.add(node);

		return [...pre, node, ...visit(nodes.slice(1))];
	}

	return visit(Array.from(slashCommands));
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentCompletions, LifecyclePhase.Eventually);

class VariableCompletions extends Disposable {

	private static readonly VariableNameDef = /@\w*/g; // MUST be using `g`-flag

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatVariablesService private readonly chatVariablesService: IChatVariablesService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatVariables',
			triggerCharacters: ['@'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {

				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return null;
				}

				const varWord = getWordAtText(position.column, VariableCompletions.VariableNameDef, model.getLineContent(position.lineNumber), 0);
				if (!varWord && model.getWordUntilPosition(position).word) {
					// inside a "normal" word
					return null;
				}

				let insert: Range;
				let replace: Range;
				if (!varWord) {
					insert = replace = Range.fromPositions(position);
				} else {
					insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
					replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
				}

				const history = widget.viewModel!.getItems()
					.filter(isResponseVM);

				// TODO@roblourens work out a real API for this- maybe it can be part of the two-step flow that @file will probably use
				const historyVariablesEnabled = this.configurationService.getValue('chat.experimental.historyVariables');
				const historyItems = historyVariablesEnabled ? history.map((h, i): CompletionItem => ({
					label: `@response:${i + 1}`,
					detail: h.response.asString(),
					insertText: `@response:${String(i + 1).padStart(String(history.length).length, '0')} `,
					kind: CompletionItemKind.Text,
					range: { insert, replace },
				})) : [];

				const variableItems = Array.from(this.chatVariablesService.getVariables()).map(v => {
					const withAt = `@${v.name}`;
					return <CompletionItem>{
						label: withAt,
						range: { insert, replace },
						insertText: withAt + ' ',
						detail: v.description,
						kind: CompletionItemKind.Text, // The icons are disabled here anyway,
					};
				});

				return <CompletionList>{
					suggestions: [...variableItems, ...historyItems]
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(VariableCompletions, LifecyclePhase.Eventually);
