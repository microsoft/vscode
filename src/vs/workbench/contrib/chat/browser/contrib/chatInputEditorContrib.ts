/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IWordAtPosition, getWordAtText } from 'vs/editor/common/core/wordHelper';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProductService } from 'vs/platform/product/common/productService';
import { Registry } from 'vs/platform/registry/common/platform';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { SubmitAction } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';
import { IChatWidget, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { SelectAndInsertFileAction, dynamicVariableDecorationType } from 'vs/workbench/contrib/chat/browser/contrib/chatDynamicVariables';
import { IChatAgentCommand, IChatAgentData, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { chatSlashCommandBackground, chatSlashCommandForeground } from 'vs/workbench/contrib/chat/common/chatColors';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, ChatRequestTextPart, ChatRequestVariablePart, IParsedChatRequestPart, chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { ChatRequestParser } from 'vs/workbench/contrib/chat/common/chatRequestParser';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatSlashCommandService } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

const decorationDescription = 'chat';
const placeholderDecorationType = 'chat-session-detail';
const slashCommandTextDecorationType = 'chat-session-text';
const variableTextDecorationType = 'chat-variable-text';

function agentAndCommandToKey(agent: string, subcommand: string): string {
	return `${agent}__${subcommand}`;
}

class InputEditorDecorations extends Disposable {

	public readonly id = 'inputEditorDecorations';

	private readonly previouslyUsedAgents = new Set<string>();

	private readonly viewModelDisposables = this._register(new MutableDisposable());

	constructor(
		private readonly widget: IChatWidget,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
		@IChatService private readonly chatService: IChatService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
	) {
		super();

		this.codeEditorService.registerDecorationType(decorationDescription, placeholderDecorationType, {});

		this._register(this.themeService.onDidColorThemeChange(() => this.updateRegisteredDecorationTypes()));
		this.updateRegisteredDecorationTypes();

		this.updateInputEditorDecorations();
		this._register(this.widget.inputEditor.onDidChangeModelContent(() => this.updateInputEditorDecorations()));
		this._register(this.widget.onDidChangeViewModel(() => {
			this.registerViewModelListeners();
			this.previouslyUsedAgents.clear();
			this.updateInputEditorDecorations();
		}));
		this._register(this.chatService.onDidSubmitAgent((e) => {
			if (e.sessionId === this.widget.viewModel?.sessionId) {
				this.previouslyUsedAgents.add(agentAndCommandToKey(e.agent.id, e.slashCommand.name));
			}
		}));
		this._register(this.chatAgentService.onDidChangeAgents(() => this.updateInputEditorDecorations()));

		this.registerViewModelListeners();
	}

	private registerViewModelListeners(): void {
		this.viewModelDisposables.value = this.widget.viewModel?.onDidChange(e => {
			if (e?.kind === 'changePlaceholder' || e?.kind === 'initialize') {
				this.updateInputEditorDecorations();
			}
		});
	}

	private updateRegisteredDecorationTypes() {
		this.codeEditorService.removeDecorationType(variableTextDecorationType);
		this.codeEditorService.removeDecorationType(dynamicVariableDecorationType);
		this.codeEditorService.removeDecorationType(slashCommandTextDecorationType);

		const theme = this.themeService.getColorTheme();
		this.codeEditorService.registerDecorationType(decorationDescription, slashCommandTextDecorationType, {
			color: theme.getColor(chatSlashCommandForeground)?.toString(),
			backgroundColor: theme.getColor(chatSlashCommandBackground)?.toString(),
			borderRadius: '3px'
		});
		this.codeEditorService.registerDecorationType(decorationDescription, variableTextDecorationType, {
			color: theme.getColor(chatSlashCommandForeground)?.toString(),
			backgroundColor: theme.getColor(chatSlashCommandBackground)?.toString(),
			borderRadius: '3px'
		});
		this.codeEditorService.registerDecorationType(decorationDescription, dynamicVariableDecorationType, {
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

		const viewModel = this.widget.viewModel;
		if (!viewModel) {
			return;
		}

		if (!inputValue) {
			const viewModelPlaceholder = this.widget.viewModel?.inputPlaceholder;
			const placeholder = viewModelPlaceholder ?? '';
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

		const parsedRequest = (await this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(viewModel.sessionId, inputValue)).parts;

		let placeholderDecoration: IDecorationOptions[] | undefined;
		const agentPart = parsedRequest.find((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart);
		const agentSubcommandPart = parsedRequest.find((p): p is ChatRequestAgentSubcommandPart => p instanceof ChatRequestAgentSubcommandPart);
		const slashCommandPart = parsedRequest.find((p): p is ChatRequestSlashCommandPart => p instanceof ChatRequestSlashCommandPart);

		const exactlyOneSpaceAfterPart = (part: IParsedChatRequestPart): boolean => {
			const partIdx = parsedRequest.indexOf(part);
			if (parsedRequest.length > partIdx + 2) {
				return false;
			}

			const nextPart = parsedRequest[partIdx + 1];
			return nextPart && nextPart instanceof ChatRequestTextPart && nextPart.text === ' ';
		};

		const onlyAgentAndWhitespace = agentPart && parsedRequest.every(p => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentPart);
		if (onlyAgentAndWhitespace) {
			// Agent reference with no other text - show the placeholder
			if (agentPart.agent.metadata.description && exactlyOneSpaceAfterPart(agentPart)) {
				placeholderDecoration = [{
					range: {
						startLineNumber: agentPart.editorRange.startLineNumber,
						endLineNumber: agentPart.editorRange.endLineNumber,
						startColumn: agentPart.editorRange.endColumn + 1,
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

		const onlyAgentCommandAndWhitespace = agentPart && agentSubcommandPart && parsedRequest.every(p => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentPart || p instanceof ChatRequestAgentSubcommandPart);
		if (onlyAgentCommandAndWhitespace) {
			// Agent reference and subcommand with no other text - show the placeholder
			const isFollowupSlashCommand = this.previouslyUsedAgents.has(agentAndCommandToKey(agentPart.agent.id, agentSubcommandPart.command.name));
			const shouldRenderFollowupPlaceholder = isFollowupSlashCommand && agentSubcommandPart.command.followupPlaceholder;
			if (agentSubcommandPart?.command.description && exactlyOneSpaceAfterPart(agentSubcommandPart)) {
				placeholderDecoration = [{
					range: {
						startLineNumber: agentSubcommandPart.editorRange.startLineNumber,
						endLineNumber: agentSubcommandPart.editorRange.endLineNumber,
						startColumn: agentSubcommandPart.editorRange.endColumn + 1,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: shouldRenderFollowupPlaceholder ? agentSubcommandPart.command.followupPlaceholder : agentSubcommandPart.command.description,
							color: this.getPlaceholderColor(),
						}
					}
				}];
			}
		}

		const onlySlashCommandAndWhitespace = slashCommandPart && parsedRequest.every(p => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestSlashCommandPart);
		if (onlySlashCommandAndWhitespace) {
			// Command reference with no other text - show the placeholder
			if (slashCommandPart.slashCommand.detail && exactlyOneSpaceAfterPart(slashCommandPart)) {
				placeholderDecoration = [{
					range: {
						startLineNumber: slashCommandPart.editorRange.startLineNumber,
						endLineNumber: slashCommandPart.editorRange.endLineNumber,
						startColumn: slashCommandPart.editorRange.endColumn + 1,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: slashCommandPart.slashCommand.detail,
							color: this.getPlaceholderColor(),
						}
					}
				}];
			}
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, placeholderDecoration ?? []);

		const textDecorations: IDecorationOptions[] | undefined = [];
		if (agentPart) {
			textDecorations.push({ range: agentPart.editorRange });
			if (agentSubcommandPart) {
				textDecorations.push({ range: agentSubcommandPart.editorRange });
			}
		}

		if (slashCommandPart) {
			textDecorations.push({ range: slashCommandPart.editorRange });
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, textDecorations);

		const varDecorations: IDecorationOptions[] = [];
		const variableParts = parsedRequest.filter((p): p is ChatRequestVariablePart => p instanceof ChatRequestVariablePart);
		for (const variable of variableParts) {
			varDecorations.push({ range: variable.editorRange });
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, variableTextDecorationType, varDecorations);
	}
}

class InputEditorSlashCommandMode extends Disposable {
	public readonly id = 'InputEditorSlashCommandMode';

	constructor(
		private readonly widget: IChatWidget,
		@IChatService private readonly chatService: IChatService
	) {
		super();
		this._register(this.chatService.onDidSubmitAgent(e => {
			if (this.widget.viewModel?.sessionId !== e.sessionId) {
				return;
			}

			this.repopulateAgentCommand(e.agent, e.slashCommand);
		}));
	}

	private async repopulateAgentCommand(agent: IChatAgentData, slashCommand: IChatAgentCommand) {
		if (slashCommand.shouldRepopulate) {
			const value = `${chatAgentLeader}${agent.id} ${chatSubcommandLeader}${slashCommand.name} `;
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
		@IInstantiationService private readonly instantiationService: IInstantiationService,
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

				const parsedRequest = (await this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(widget.viewModel.sessionId, model.getValue())).parts;
				const usedAgent = parsedRequest.find(p => p instanceof ChatRequestAgentPart);
				if (usedAgent) {
					// No (classic) global slash commands when an agent is used
					return;
				}

				const slashCommands = this.chatSlashCommandService.getCommands();
				if (!slashCommands) {
					return null;
				}

				return <CompletionList>{
					suggestions: slashCommands.map((c, i) => {
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
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatAgent',
			triggerCharacters: ['@'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.viewModel) {
					return null;
				}

				const parsedRequest = (await this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(widget.viewModel.sessionId, model.getValue())).parts;
				const usedAgent = parsedRequest.find(p => p instanceof ChatRequestAgentPart);
				if (usedAgent && !Range.containsPosition(usedAgent.editorRange, position)) {
					// Only one agent allowed
					return;
				}

				const range = computeCompletionRanges(model, position, /@\w*/g);
				if (!range) {
					return null;
				}

				const agents = this.chatAgentService.getAgents()
					.filter(a => !a.metadata.isDefault);
				return <CompletionList>{
					suggestions: agents.map((c, i) => {
						const withAt = `@${c.id}`;
						return <CompletionItem>{
							label: withAt,
							insertText: `${withAt} `,
							detail: c.metadata.description,
							range,
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
						};
					})
				};
			}
		}));

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
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

				const parsedRequest = (await this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(widget.viewModel.sessionId, model.getValue())).parts;
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
				const commands = await usedAgent.agent.provideSlashCommands(token);

				return <CompletionList>{
					suggestions: commands.map((c, i) => {
						const withSlash = `/${c.name}`;
						return <CompletionItem>{
							label: withSlash,
							insertText: `${withSlash} `,
							detail: c.description,
							range,
							kind: CompletionItemKind.Text, // The icons are disabled here anyway
						};
					})
				};
			}
		}));

		// list subcommands when the query is empty, insert agent+subcommand
		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatAgentAndSubcommand',
			triggerCharacters: ['/'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return;
				}

				const range = computeCompletionRanges(model, position, /\/\w*/g);
				if (!range) {
					return null;
				}

				const agents = this.chatAgentService.getAgents();
				const all = agents.map(agent => agent.provideSlashCommands(token));
				const commands = await raceCancellation(Promise.all(all), token);

				if (!commands) {
					return;
				}

				const justAgents: CompletionItem[] = agents
					.filter(a => !a.metadata.isDefault)
					.map(agent => {
						const agentLabel = `${chatAgentLeader}${agent.id}`;
						return {
							label: { label: agentLabel, description: agent.metadata.description },
							filterText: `${chatSubcommandLeader}${agent.id}`,
							insertText: `${agentLabel} `,
							range: new Range(1, 1, 1, 1),
							kind: CompletionItemKind.Text,
							sortText: `${chatSubcommandLeader}${agent.id}`,
						};
					});

				return {
					suggestions: justAgents.concat(
						agents.flatMap((agent, i) => commands[i].map((c, i) => {
							const agentLabel = `${chatAgentLeader}${agent.id}`;
							const withSlash = `${chatSubcommandLeader}${c.name}`;
							return {
								label: { label: withSlash, description: agentLabel },
								filterText: `${chatSubcommandLeader}${agent.id}${c.name}`,
								commitCharacters: [' '],
								insertText: `${agentLabel} ${withSlash} `,
								detail: `(${agentLabel}) ${c.description}`,
								range: new Range(1, 1, 1, 1),
								kind: CompletionItemKind.Text, // The icons are disabled here anyway
								sortText: `${chatSubcommandLeader}${agent.id}${c.name}`,
							} satisfies CompletionItem;
						})))
				};
			}
		}));
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentCompletions, LifecyclePhase.Eventually);

class BuiltinDynamicCompletions extends Disposable {
	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatDynamicCompletions',
			triggerCharacters: [chatVariableLeader],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const fileVariablesEnabled = this.configurationService.getValue('chat.experimental.fileVariables') ?? this.productService.quality !== 'stable';
				if (!fileVariablesEnabled) {
					return;
				}

				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget || !widget.supportsFileReferences) {
					return null;
				}

				const range = computeCompletionRanges(model, position, BuiltinDynamicCompletions.VariableNameDef);
				if (!range) {
					return null;
				}

				const afterRange = new Range(position.lineNumber, range.replace.startColumn, position.lineNumber, range.replace.startColumn + '#file:'.length);
				return <CompletionList>{
					suggestions: [
						<CompletionItem>{
							label: `${chatVariableLeader}file`,
							insertText: `${chatVariableLeader}file:`,
							detail: localize('pickFileLabel', "Pick a file"),
							range,
							kind: CompletionItemKind.Text,
							command: { id: SelectAndInsertFileAction.ID, title: SelectAndInsertFileAction.ID, arguments: [{ widget, range: afterRange }] },
							sortText: 'z'
						}
					]
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinDynamicCompletions, LifecyclePhase.Eventually);

function computeCompletionRanges(model: ITextModel, position: Position, reg: RegExp): { insert: Range; replace: Range; varWord: IWordAtPosition | null } | undefined {
	const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
	if (!varWord && model.getWordUntilPosition(position).word) {
		// inside a "normal" word
		return;
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

	private static readonly VariableNameDef = new RegExp(`${chatVariableLeader}\\w*`, 'g'); // MUST be using `g`-flag

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatVariablesService private readonly chatVariablesService: IChatVariablesService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
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

				const range = computeCompletionRanges(model, position, VariableCompletions.VariableNameDef);
				if (!range) {
					return null;
				}

				const history = widget.viewModel!.getItems()
					.filter(isResponseVM);

				// TODO@roblourens work out a real API for this- maybe it can be part of the two-step flow that @file will probably use
				const historyVariablesEnabled = this.configurationService.getValue('chat.experimental.historyVariables');
				const historyItems = historyVariablesEnabled ? history.map((h, i): CompletionItem => ({
					label: `${chatVariableLeader}response:${i + 1}`,
					detail: h.response.asString(),
					insertText: `${chatVariableLeader}response:${String(i + 1).padStart(String(history.length).length, '0')} `,
					kind: CompletionItemKind.Text,
					range,
				})) : [];

				const variableItems = Array.from(this.chatVariablesService.getVariables()).map(v => {
					const withLeader = `${chatVariableLeader}${v.name}`;
					return <CompletionItem>{
						label: withLeader,
						range,
						insertText: withLeader + ' ',
						detail: v.description,
						kind: CompletionItemKind.Text, // The icons are disabled here anyway
						sortText: 'z'
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

class ChatTokenDeleter extends Disposable {

	public readonly id = 'chatTokenDeleter';

	constructor(
		private readonly widget: IChatWidget,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		const parser = this.instantiationService.createInstance(ChatRequestParser);
		const inputValue = this.widget.inputEditor.getValue();
		let previousInputValue: string | undefined;

		// A simple heuristic to delete the previous token when the user presses backspace.
		// The sophisticated way to do this would be to have a parse tree that can be updated incrementally.
		this.widget.inputEditor.onDidChangeModelContent(e => {
			if (!previousInputValue) {
				previousInputValue = inputValue;
			}

			// Don't try to handle multicursor edits right now
			const change = e.changes[0];

			// If this was a simple delete, try to find out whether it was inside a token
			if (!change.text && this.widget.viewModel) {
				parser.parseChatRequest(this.widget.viewModel.sessionId, previousInputValue).then(previousParsedValue => {
					// For dynamic variables, this has to happen in ChatDynamicVariableModel with the other bookkeeping
					const deletableTokens = previousParsedValue.parts.filter(p => p instanceof ChatRequestAgentPart || p instanceof ChatRequestAgentSubcommandPart || p instanceof ChatRequestSlashCommandPart || p instanceof ChatRequestVariablePart);
					deletableTokens.forEach(token => {
						const deletedRangeOfToken = Range.intersectRanges(token.editorRange, change.range);
						// Part of this token was deleted, and the deletion range doesn't go off the front of the token, for simpler math
						if ((deletedRangeOfToken && !deletedRangeOfToken.isEmpty()) && Range.compareRangesUsingStarts(token.editorRange, change.range) < 0) {
							// Assume single line tokens
							const length = deletedRangeOfToken.endColumn - deletedRangeOfToken.startColumn;
							const rangeToDelete = new Range(token.editorRange.startLineNumber, token.editorRange.startColumn, token.editorRange.endLineNumber, token.editorRange.endColumn - length);
							this.widget.inputEditor.executeEdits(this.id, [{
								range: rangeToDelete,
								text: '',
							}]);
						}
					});
				});
			}

			previousInputValue = this.widget.inputEditor.getValue();
		});
	}
}
ChatWidget.CONTRIBS.push(ChatTokenDeleter);
