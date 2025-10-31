/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../../editor/common/editorCommon.js';
import { TrackedRangeStickiness } from '../../../../../editor/common/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { inputPlaceholderForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IChatAgentCommand, IChatAgentData, IChatAgentService } from '../../common/chatAgents.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../common/chatColors.js';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestSlashPromptPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestToolSetPart, IParsedChatRequestPart, chatAgentLeader, chatSubcommandLeader } from '../../common/chatParserTypes.js';
import { ChatRequestParser } from '../../common/chatRequestParser.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { IChatWidget } from '../chat.js';
import { ChatWidget } from '../chatWidget.js';
import { dynamicVariableDecorationType } from './chatDynamicVariables.js';

const decorationDescription = 'chat';
const placeholderDecorationType = 'chat-session-detail';
const slashCommandTextDecorationType = 'chat-session-text';
const variableTextDecorationType = 'chat-variable-text';

function agentAndCommandToKey(agent: IChatAgentData, subcommand: string | undefined): string {
	return subcommand ? `${agent.id}__${subcommand}` : agent.id;
}

function isWhitespaceOrPromptPart(p: IParsedChatRequestPart): boolean {
	return (p instanceof ChatRequestTextPart && !p.text.trim().length) || (p instanceof ChatRequestSlashPromptPart);
}

class InputEditorDecorations extends Disposable {

	public readonly id = 'inputEditorDecorations';

	private readonly previouslyUsedAgents = new Set<string>();

	private readonly viewModelDisposables = this._register(new MutableDisposable());

	constructor(
		private readonly widget: IChatWidget,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@ILabelService private readonly labelService: ILabelService,
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
		super();

		this.codeEditorService.registerDecorationType(decorationDescription, placeholderDecorationType, {});

		this.registeredDecorationTypes();

		this.updateInputEditorDecorations();
		this._register(this.widget.inputEditor.onDidChangeModelContent(() => this.updateInputEditorDecorations()));
		this._register(this.widget.onDidChangeParsedInput(() => this.updateInputEditorDecorations()));
		this._register(this.widget.onDidChangeViewModel(() => {
			this.registerViewModelListeners();
			this.previouslyUsedAgents.clear();
			this.updateInputEditorDecorations();
		}));
		this._register(this.widget.onDidSubmitAgent((e) => {
			this.previouslyUsedAgents.add(agentAndCommandToKey(e.agent, e.slashCommand?.name));
		}));
		this._register(this.chatAgentService.onDidChangeAgents(() => this.updateInputEditorDecorations()));
		this._register(this.promptsService.onDidChangeParsedPromptFilesCache(() => this.updateInputEditorDecorations()));
		this._register(autorun(reader => {
			// Watch for changes to the current mode and its properties
			const currentMode = this.widget.input.currentModeObs.read(reader);
			if (currentMode) {
				// Also watch the mode's description to react to any changes
				currentMode.description.read(reader);
			}
			// Trigger decoration update when mode or its properties change
			this.updateInputEditorDecorations();
		}));

		this.registerViewModelListeners();
	}

	private registerViewModelListeners(): void {
		this.viewModelDisposables.value = this.widget.viewModel?.onDidChange(e => {
			if (e?.kind === 'changePlaceholder' || e?.kind === 'initialize') {
				this.updateInputEditorDecorations();
			}
		});
	}

	private registeredDecorationTypes() {

		this.codeEditorService.registerDecorationType(decorationDescription, slashCommandTextDecorationType, {
			color: themeColorFromId(chatSlashCommandForeground),
			backgroundColor: themeColorFromId(chatSlashCommandBackground),
			borderRadius: '3px'
		});
		this.codeEditorService.registerDecorationType(decorationDescription, variableTextDecorationType, {
			color: themeColorFromId(chatSlashCommandForeground),
			backgroundColor: themeColorFromId(chatSlashCommandBackground),
			borderRadius: '3px'
		});
		this.codeEditorService.registerDecorationType(decorationDescription, dynamicVariableDecorationType, {
			color: themeColorFromId(chatSlashCommandForeground),
			backgroundColor: themeColorFromId(chatSlashCommandBackground),
			borderRadius: '3px',
			rangeBehavior: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
		});

		this._register(toDisposable(() => {
			this.codeEditorService.removeDecorationType(variableTextDecorationType);
			this.codeEditorService.removeDecorationType(dynamicVariableDecorationType);
			this.codeEditorService.removeDecorationType(slashCommandTextDecorationType);
		}));
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
			const mode = this.widget.input.currentModeObs.get();
			const placeholder = mode.argumentHint?.get() ?? mode.description.get() ?? '';

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
							contentText: viewModel.inputPlaceholder || placeholder,
							color: this.getPlaceholderColor()
						}
					}
				}
			];
			this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, decoration);
			return;
		}

		const parsedRequest = this.widget.parsedInput.parts;

		let placeholderDecoration: IDecorationOptions[] | undefined;
		const agentPart = parsedRequest.find((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart);
		const agentSubcommandPart = parsedRequest.find((p): p is ChatRequestAgentSubcommandPart => p instanceof ChatRequestAgentSubcommandPart);
		const slashCommandPart = parsedRequest.find((p): p is ChatRequestSlashCommandPart => p instanceof ChatRequestSlashCommandPart);
		const slashPromptPart = parsedRequest.find((p): p is ChatRequestSlashPromptPart => p instanceof ChatRequestSlashPromptPart);

		const exactlyOneSpaceAfterPart = (part: IParsedChatRequestPart): boolean => {
			const partIdx = parsedRequest.indexOf(part);
			if (parsedRequest.length > partIdx + 2) {
				return false;
			}

			const nextPart = parsedRequest[partIdx + 1];
			return nextPart && nextPart instanceof ChatRequestTextPart && nextPart.text === ' ';
		};

		const getRangeForPlaceholder = (part: IParsedChatRequestPart) => ({
			startLineNumber: part.editorRange.startLineNumber,
			endLineNumber: part.editorRange.endLineNumber,
			startColumn: part.editorRange.endColumn + 1,
			endColumn: 1000
		});

		const onlyAgentAndWhitespace = agentPart && parsedRequest.every(p => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentPart);
		if (onlyAgentAndWhitespace) {
			// Agent reference with no other text - show the placeholder
			const isFollowupSlashCommand = this.previouslyUsedAgents.has(agentAndCommandToKey(agentPart.agent, undefined));
			const shouldRenderFollowupPlaceholder = isFollowupSlashCommand && agentPart.agent.metadata.followupPlaceholder;
			if (agentPart.agent.description && exactlyOneSpaceAfterPart(agentPart)) {
				placeholderDecoration = [{
					range: getRangeForPlaceholder(agentPart),
					renderOptions: {
						after: {
							contentText: shouldRenderFollowupPlaceholder ? agentPart.agent.metadata.followupPlaceholder : agentPart.agent.description,
							color: this.getPlaceholderColor(),
						}
					}
				}];
			}
		}

		const onlyAgentAndAgentCommandAndWhitespace = agentPart && agentSubcommandPart && parsedRequest.every(p => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentPart || p instanceof ChatRequestAgentSubcommandPart);
		if (onlyAgentAndAgentCommandAndWhitespace) {
			// Agent reference and subcommand with no other text - show the placeholder
			const isFollowupSlashCommand = this.previouslyUsedAgents.has(agentAndCommandToKey(agentPart.agent, agentSubcommandPart.command.name));
			const shouldRenderFollowupPlaceholder = isFollowupSlashCommand && agentSubcommandPart.command.followupPlaceholder;
			if (agentSubcommandPart?.command.description && exactlyOneSpaceAfterPart(agentSubcommandPart)) {
				placeholderDecoration = [{
					range: getRangeForPlaceholder(agentSubcommandPart),
					renderOptions: {
						after: {
							contentText: shouldRenderFollowupPlaceholder ? agentSubcommandPart.command.followupPlaceholder : agentSubcommandPart.command.description,
							color: this.getPlaceholderColor(),
						}
					}
				}];
			}
		}

		const onlyAgentCommandAndWhitespace = agentSubcommandPart && parsedRequest.every(p => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentSubcommandPart);
		if (onlyAgentCommandAndWhitespace) {
			// Agent subcommand with no other text - show the placeholder
			if (agentSubcommandPart?.command.description && exactlyOneSpaceAfterPart(agentSubcommandPart)) {
				placeholderDecoration = [{
					range: getRangeForPlaceholder(agentSubcommandPart),
					renderOptions: {
						after: {
							contentText: agentSubcommandPart.command.description,
							color: this.getPlaceholderColor(),
						}
					}
				}];
			}
		}

		const onlyPromptCommandAndWhitespace = slashPromptPart && parsedRequest.every(isWhitespaceOrPromptPart);
		if (onlyPromptCommandAndWhitespace && exactlyOneSpaceAfterPart(slashPromptPart)) {
			// Prompt slash command with no other text - show the placeholder
			// Resolve the prompt file (this will use cache if available)
			const promptFile = this.promptsService.resolvePromptSlashCommandFromCache(slashPromptPart.slashPromptCommand.command);

			const description = promptFile?.header?.argumentHint ?? promptFile?.header?.description;
			if (description) {
				placeholderDecoration = [{
					range: getRangeForPlaceholder(slashPromptPart),
					renderOptions: {
						after: {
							contentText: description,
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
		}
		if (agentSubcommandPart) {
			textDecorations.push({ range: agentSubcommandPart.editorRange, hoverMessage: new MarkdownString(agentSubcommandPart.command.description) });
		}

		if (slashCommandPart) {
			textDecorations.push({ range: slashCommandPart.editorRange });
		}

		if (slashPromptPart) {
			textDecorations.push({ range: slashPromptPart.editorRange });
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, textDecorations);

		const varDecorations: IDecorationOptions[] = [];
		const toolParts = parsedRequest.filter((p): p is ChatRequestToolPart => p instanceof ChatRequestToolPart || p instanceof ChatRequestToolSetPart);
		for (const tool of toolParts) {
			varDecorations.push({ range: tool.editorRange });
		}

		const dynamicVariableParts = parsedRequest.filter((p): p is ChatRequestDynamicVariablePart => p instanceof ChatRequestDynamicVariablePart);

		const isEditingPreviousRequest = !!this.widget.viewModel?.editing;
		if (isEditingPreviousRequest) {
			for (const variable of dynamicVariableParts) {
				varDecorations.push({ range: variable.editorRange, hoverMessage: URI.isUri(variable.data) ? new MarkdownString(this.labelService.getUriLabel(variable.data, { relative: true })) : undefined });
			}
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, variableTextDecorationType, varDecorations);
	}
}

class InputEditorSlashCommandMode extends Disposable {
	public readonly id = 'InputEditorSlashCommandMode';

	constructor(
		private readonly widget: IChatWidget
	) {
		super();
		this._register(this.widget.onDidChangeAgent(e => {
			if (e.slashCommand && e.slashCommand.isSticky || !e.slashCommand && e.agent.metadata.isSticky) {
				this.repopulateAgentCommand(e.agent, e.slashCommand);
			}
		}));
		this._register(this.widget.onDidSubmitAgent(e => {
			this.repopulateAgentCommand(e.agent, e.slashCommand);
		}));
	}

	private async repopulateAgentCommand(agent: IChatAgentData, slashCommand: IChatAgentCommand | undefined) {
		// Make sure we don't repopulate if the user already has something in the input
		if (this.widget.inputEditor.getValue().trim()) {
			return;
		}

		let value: string | undefined;
		if (slashCommand && slashCommand.isSticky) {
			value = `${chatAgentLeader}${agent.name} ${chatSubcommandLeader}${slashCommand.name} `;
		} else if (agent.metadata.isSticky) {
			value = `${chatAgentLeader}${agent.name} `;
		}

		if (value) {
			this.widget.inputEditor.setValue(value);
			this.widget.inputEditor.setPosition({ lineNumber: 1, column: value.length + 1 });
		}
	}
}

ChatWidget.CONTRIBS.push(InputEditorDecorations, InputEditorSlashCommandMode);

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
		let previousSelectedAgent: IChatAgentData | undefined;

		// A simple heuristic to delete the previous token when the user presses backspace.
		// The sophisticated way to do this would be to have a parse tree that can be updated incrementally.
		this._register(this.widget.inputEditor.onDidChangeModelContent(e => {
			if (!previousInputValue) {
				previousInputValue = inputValue;
				previousSelectedAgent = this.widget.lastSelectedAgent;
			}

			// Don't try to handle multicursor edits right now
			const change = e.changes[0];

			// If this was a simple delete, try to find out whether it was inside a token
			if (!change.text && this.widget.viewModel) {
				const previousParsedValue = parser.parseChatRequest(this.widget.viewModel.sessionResource, previousInputValue, widget.location, { selectedAgent: previousSelectedAgent, mode: this.widget.input.currentModeKind });

				// For dynamic variables, this has to happen in ChatDynamicVariableModel with the other bookkeeping
				const deletableTokens = previousParsedValue.parts.filter(p => p instanceof ChatRequestAgentPart || p instanceof ChatRequestAgentSubcommandPart || p instanceof ChatRequestSlashCommandPart || p instanceof ChatRequestSlashPromptPart || p instanceof ChatRequestToolPart);
				deletableTokens.forEach(token => {
					const deletedRangeOfToken = Range.intersectRanges(token.editorRange, change.range);
					// Part of this token was deleted, or the space after it was deleted, and the deletion range doesn't go off the front of the token, for simpler math
					if (deletedRangeOfToken && Range.compareRangesUsingStarts(token.editorRange, change.range) < 0) {
						// Assume single line tokens
						const length = deletedRangeOfToken.endColumn - deletedRangeOfToken.startColumn;
						const rangeToDelete = new Range(token.editorRange.startLineNumber, token.editorRange.startColumn, token.editorRange.endLineNumber, token.editorRange.endColumn - length);
						this.widget.inputEditor.executeEdits(this.id, [{
							range: rangeToDelete,
							text: '',
						}]);
						this.widget.refreshParsedInput();
					}
				});
			}

			previousInputValue = this.widget.inputEditor.getValue();
			previousSelectedAgent = this.widget.lastSelectedAgent;
		}));
	}
}
ChatWidget.CONTRIBS.push(ChatTokenDeleter);
