/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { themeColorFromId } from '../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { MouseTargetType } from '../../../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../../../editor/browser/services/codeEditorService.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../../../../editor/common/editorCommon.js';
import { TrackedRangeStickiness } from '../../../../../../../editor/common/model.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { inputPlaceholderForeground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { IChatAgentCommand, IChatAgentData, IChatAgentService } from '../../../../common/participants/chatAgents.js';
import { localize } from '../../../../../../../nls.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../../../common/widget/chatColors.js';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestSlashPromptPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestToolSetPart, IParsedChatRequestPart, chatAgentLeader, chatSubcommandLeader } from '../../../../common/requestParser/chatParserTypes.js';
import { agentReg, slashReg, variableReg } from '../../../../common/requestParser/chatRequestParser.js';
import { IChatWidget } from '../../../chat.js';
import { ChatWidget } from '../../chatWidget.js';
import { dynamicVariableDecorationType } from '../../../attachments/chatDynamicVariables.js';
import { NativeEditContextRegistry } from '../../../../../../../editor/browser/controller/editContext/native/nativeEditContextRegistry.js';
import { TextAreaEditContextRegistry } from '../../../../../../../editor/browser/controller/editContext/textArea/textAreaEditContextRegistry.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { ThrottledDelayer } from '../../../../../../../base/common/async.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { getChatSessionType } from '../../../../common/model/chatUri.js';
import { ICustomizationHarnessService } from '../../../../common/customizationHarnessService.js';

const decorationDescription = 'chat';
const placeholderDecorationType = 'chat-session-detail';
const slashCommandTextDecorationType = 'chat-session-text';
const clickableSlashPromptTextDecorationType = 'chat-session-clickable-text';
const variableTextDecorationType = 'chat-variable-text';

function agentAndCommandToKey(agent: IChatAgentData, subcommand: string | undefined): string {
	return subcommand ? `${agent.id}__${subcommand}` : agent.id;
}

function isWhitespaceOrPromptPart(p: IParsedChatRequestPart): boolean {
	return (p instanceof ChatRequestTextPart && !p.text.trim().length) || (p instanceof ChatRequestSlashPromptPart);
}

function exactlyOneSpaceAfterPart(parsedRequest: readonly IParsedChatRequestPart[], part: IParsedChatRequestPart): boolean {
	const partIdx = parsedRequest.indexOf(part);
	if (parsedRequest.length > partIdx + 2) {
		return false;
	}

	const nextPart = parsedRequest[partIdx + 1];
	return nextPart && nextPart instanceof ChatRequestTextPart && nextPart.text === ' ';
}

function getRangeForPlaceholder(part: IParsedChatRequestPart) {
	return {
		startLineNumber: part.editorRange.startLineNumber,
		endLineNumber: part.editorRange.endLineNumber,
		startColumn: part.editorRange.endColumn + 1,
		endColumn: 1000
	};
}

class InputEditorDecorations extends Disposable {

	private static readonly UPDATE_DELAY = 200;

	public readonly id = 'inputEditorDecorations';

	private readonly previouslyUsedAgents = new Set<string>();
	private clickablePromptSlashCommand: { range: Range; uri: URI } | undefined;
	private mouseDownPromptSlashCommand: { position: Position; uri: URI; range: Range } | undefined;

	private readonly viewModelDisposables = this._register(new MutableDisposable());


	private readonly updateThrottle = this._register(new ThrottledDelayer<void>(InputEditorDecorations.UPDATE_DELAY));

	constructor(
		private readonly widget: IChatWidget,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@ILabelService private readonly labelService: ILabelService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();

		this.registeredDecorationTypes();
		this.triggerInputEditorDecorationsUpdate();
		this._register(this.widget.inputEditor.onDidChangeModelContent(() => this.triggerInputEditorDecorationsUpdate()));
		this._register(this.widget.onDidChangeParsedInput(() => this.triggerInputEditorDecorationsUpdate()));
		this._register(this.widget.onDidChangeViewModel(() => {
			this.registerViewModelListeners();
			this.previouslyUsedAgents.clear();
			this.triggerInputEditorDecorationsUpdate();
		}));
		this._register(this.widget.onDidSubmitAgent((e) => {
			this.previouslyUsedAgents.add(agentAndCommandToKey(e.agent, e.slashCommand?.name));
		}));
		this._register(this.widget.inputEditor.onMouseDown(e => {
			this.mouseDownPromptSlashCommand = undefined;

			if (!e.event.leftButton || e.target.type !== MouseTargetType.CONTENT_TEXT || !e.target.position) {
				return;
			}

			const clickablePromptSlashCommand = this.clickablePromptSlashCommand;
			if (!clickablePromptSlashCommand || !clickablePromptSlashCommand.range.containsPosition(e.target.position)) {
				return;
			}

			this.mouseDownPromptSlashCommand = {
				position: Position.lift(e.target.position),
				uri: clickablePromptSlashCommand.uri,
				range: clickablePromptSlashCommand.range,
			};
		}));
		this._register(this.widget.inputEditor.onMouseUp(e => {
			const mouseDownPromptSlashCommand = this.mouseDownPromptSlashCommand;
			this.mouseDownPromptSlashCommand = undefined;

			if (!mouseDownPromptSlashCommand || e.target.type !== MouseTargetType.CONTENT_TEXT || !e.target.position) {
				return;
			}

			if (!mouseDownPromptSlashCommand.range.containsPosition(e.target.position) || !Position.equals(mouseDownPromptSlashCommand.position, e.target.position)) {
				return;
			}

			void this.editorService.openEditor({ resource: mouseDownPromptSlashCommand.uri });
		}));
		this._register(this.chatAgentService.onDidChangeAgents(() => this.triggerInputEditorDecorationsUpdate()));
		this._register(this.customizationHarnessService.onDidChangeSlashCommands((e) => {
			const sessionResource = this.widget.viewModel?.sessionResource;
			if (sessionResource && e.sessionType === getChatSessionType(sessionResource)) {
				this.triggerInputEditorDecorationsUpdate();
			}
		}));
		this._register(autorun(reader => {
			// Watch for changes to the current mode and its properties
			const currentMode = this.widget.input.currentModeObs.read(reader);
			if (currentMode) {
				// Also watch the mode's description to react to any changes
				currentMode.description.read(reader);
			}
			// Trigger decoration update when mode or its properties change
			this.triggerInputEditorDecorationsUpdate();
		}));

		this.registerViewModelListeners();
	}

	private registerViewModelListeners(): void {
		this.viewModelDisposables.value = this.widget.viewModel?.onDidChange(e => {
			if (e?.kind === 'changePlaceholder' || e?.kind === 'initialize') {
				this.triggerInputEditorDecorationsUpdate();
			}
		});
	}

	private registeredDecorationTypes() {
		this._register(this.codeEditorService.registerDecorationType(decorationDescription, placeholderDecorationType, {}));
		this._register(this.codeEditorService.registerDecorationType(decorationDescription, slashCommandTextDecorationType, {
			color: themeColorFromId(chatSlashCommandForeground),
			backgroundColor: themeColorFromId(chatSlashCommandBackground),
			borderRadius: '3px'
		}));
		this._register(this.codeEditorService.registerDecorationType(decorationDescription, clickableSlashPromptTextDecorationType, {
			color: themeColorFromId(chatSlashCommandForeground),
			backgroundColor: themeColorFromId(chatSlashCommandBackground),
			borderRadius: '3px',
			cursor: 'pointer'
		}));
		this._register(this.codeEditorService.registerDecorationType(decorationDescription, variableTextDecorationType, {
			color: themeColorFromId(chatSlashCommandForeground),
			backgroundColor: themeColorFromId(chatSlashCommandBackground),
			borderRadius: '3px'
		}));
		this._register(this.codeEditorService.registerDecorationType(decorationDescription, dynamicVariableDecorationType, {
			color: themeColorFromId(chatSlashCommandForeground),
			backgroundColor: themeColorFromId(chatSlashCommandBackground),
			borderRadius: '3px',
			rangeBehavior: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
		}));
	}

	private getPlaceholderColor(): string | undefined {
		const theme = this.themeService.getColorTheme();
		const transparentForeground = theme.getColor(inputPlaceholderForeground);
		return transparentForeground?.toString();
	}

	private triggerInputEditorDecorationsUpdate(): void {
		// update placeholder decorations immediately, in sync
		this.updateInputPlaceholderDecoration();

		// with a delay, update the rest of the decorations
		this.updateThrottle.trigger(token => this.updateAsyncInputEditorDecorations(token));
	}

	private updateInputPlaceholderDecoration(): void {
		const inputValue = this.widget.inputEditor.getValue();

		const viewModel = this.widget.viewModel;
		if (!viewModel) {
			this.updateAriaPlaceholder(undefined);
			return;
		}

		if (!inputValue) {
			const mode = this.widget.input.currentModeObs.get();
			const placeholder = mode.argumentHint?.get() ?? mode.description.get() ?? '';
			const displayPlaceholder = viewModel.inputPlaceholder || placeholder;

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
							contentText: displayPlaceholder,
							color: this.getPlaceholderColor()
						}
					}
				}
			];
			this.updateAriaPlaceholder(displayPlaceholder || undefined);
			this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, decoration);
			return;
		}

		this.updateAriaPlaceholder(undefined);

		const parsedRequest = this.widget.parsedInput.parts;

		let placeholderDecoration: IDecorationOptions[] | undefined;
		const agentPart = parsedRequest.find((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart);
		const agentSubcommandPart = parsedRequest.find((p): p is ChatRequestAgentSubcommandPart => p instanceof ChatRequestAgentSubcommandPart);

		const onlyAgentAndWhitespace = agentPart && parsedRequest.every(p => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentPart);
		if (onlyAgentAndWhitespace) {
			// Agent reference with no other text - show the placeholder
			const isFollowupSlashCommand = this.previouslyUsedAgents.has(agentAndCommandToKey(agentPart.agent, undefined));
			const shouldRenderFollowupPlaceholder = isFollowupSlashCommand && agentPart.agent.metadata.followupPlaceholder;
			if (agentPart.agent.description && exactlyOneSpaceAfterPart(parsedRequest, agentPart)) {
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
			if (agentSubcommandPart?.command.description && exactlyOneSpaceAfterPart(parsedRequest, agentSubcommandPart)) {
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
			if (agentSubcommandPart?.command.description && exactlyOneSpaceAfterPart(parsedRequest, agentSubcommandPart)) {
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
		this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, placeholderDecoration ?? []);
	}

	private async updateAsyncInputEditorDecorations(token: CancellationToken): Promise<void> {
		this.clickablePromptSlashCommand = undefined;
		this.widget.inputEditor.setDecorationsByType(decorationDescription, clickableSlashPromptTextDecorationType, []);

		const parsedRequest = this.widget.parsedInput.parts;
		const viewModel = this.widget.viewModel;
		if (!viewModel) {
			return;
		}

		const agentPart = parsedRequest.find((p): p is ChatRequestAgentPart => p instanceof ChatRequestAgentPart);
		const agentSubcommandPart = parsedRequest.find((p): p is ChatRequestAgentSubcommandPart => p instanceof ChatRequestAgentSubcommandPart);
		const slashCommandPart = parsedRequest.find((p): p is ChatRequestSlashCommandPart => p instanceof ChatRequestSlashCommandPart);
		const slashPromptPart = parsedRequest.find((p): p is ChatRequestSlashPromptPart => p instanceof ChatRequestSlashPromptPart);

		// first, fetch all async context
		const promptSlashCommand = slashPromptPart ? await this.customizationHarnessService.resolvePromptSlashCommand(slashPromptPart.name, getChatSessionType(viewModel.sessionResource), token) : undefined;
		if (token.isCancellationRequested) {
			// a new update came in while we were waiting
			return;
		}

		if (slashPromptPart && promptSlashCommand) {
			const onlyPromptCommandAndWhitespace = slashPromptPart && parsedRequest.every(isWhitespaceOrPromptPart);
			if (onlyPromptCommandAndWhitespace && exactlyOneSpaceAfterPart(parsedRequest, slashPromptPart) && promptSlashCommand) {
				const description = promptSlashCommand.argumentHint ?? promptSlashCommand.description;
				if (description) {
					this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, [{
						range: getRangeForPlaceholder(slashPromptPart),
						renderOptions: {
							after: {
								contentText: description,
								color: this.getPlaceholderColor(),
							}
						}
					}]);
				}
			}
		}

		const textDecorations: IDecorationOptions[] | undefined = [];
		if (agentPart) {
			textDecorations.push({ range: agentPart.editorRange });
		}
		if (agentSubcommandPart) {
			textDecorations.push({ range: agentSubcommandPart.editorRange, hoverMessage: new MarkdownString(agentSubcommandPart.command.description) });
		}

		if (slashCommandPart) {
			textDecorations.push({ range: slashCommandPart.editorRange, hoverMessage: new MarkdownString(slashCommandPart.slashCommand.detail) });
		}

		if (slashPromptPart && promptSlashCommand) {
			this.clickablePromptSlashCommand = {
				range: Range.lift(slashPromptPart.editorRange),
				uri: promptSlashCommand.uri,
			};
			const promptHoverMessage = new MarkdownString();
			if (promptSlashCommand.description) {
				promptHoverMessage.appendText(promptSlashCommand.description);
				promptHoverMessage.appendText('\n');
			}
			promptHoverMessage.appendText(localize(
				'chatInput.promptSlashCommand.open',
				"Click to open {0}",
				this.labelService.getUriLabel(promptSlashCommand.uri, { relative: true })
			));
			const promptDecoration = {
				range: slashPromptPart.editorRange,
				hoverMessage: promptHoverMessage,
			};
			this.widget.inputEditor.setDecorationsByType(decorationDescription, clickableSlashPromptTextDecorationType, [promptDecoration]);
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, textDecorations);

		const varDecorations: IDecorationOptions[] = [];
		const toolParts = parsedRequest.filter((p): p is ChatRequestToolPart => p instanceof ChatRequestToolPart || p instanceof ChatRequestToolSetPart);
		for (const tool of toolParts) {
			varDecorations.push({ range: tool.editorRange });
		}

		const dynamicVariableParts = parsedRequest.filter((p): p is ChatRequestDynamicVariablePart => p instanceof ChatRequestDynamicVariablePart);

		const isEditingPreviousRequest = !!viewModel.editing;
		if (isEditingPreviousRequest) {
			for (const variable of dynamicVariableParts) {
				varDecorations.push({ range: variable.editorRange, hoverMessage: URI.isUri(variable.data) ? new MarkdownString(this.labelService.getUriLabel(variable.data, { relative: true })) : undefined });
			}
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, variableTextDecorationType, varDecorations);
	}

	private updateAriaPlaceholder(value: string | undefined): void {
		const nativeEditContext = NativeEditContextRegistry.get(this.widget.inputEditor.getId());
		if (nativeEditContext) {
			const domNode = nativeEditContext.domNode.domNode;
			if (value && value.trim().length) {
				domNode.setAttribute('aria-placeholder', value);
			} else {
				domNode.removeAttribute('aria-placeholder');
			}
		} else {
			const textAreaEditContext = TextAreaEditContextRegistry.get(this.widget.inputEditor.getId());
			if (textAreaEditContext) {
				const textArea = textAreaEditContext.textArea.domNode;
				if (value && value.trim().length) {
					textArea.setAttribute('aria-placeholder', value);
				} else {
					textArea.removeAttribute('aria-placeholder');
				}
			}
		}
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
	) {
		super();

		let prevInsertTokenRange: Range | undefined;

		// A simple heuristic to delete the previous insert token when the user presses backspace.
		this._register(this.widget.inputEditor.onDidChangeModelContent(e => {
			let insertedTokenRange: Range | undefined;

			// Don't try to handle multi-cursor edits right now
			if (e.changes.length === 1) {
				const change = e.changes[0];
				if (change.text.length > 0 && change.rangeLength === 1) {
					// A full slash command or agent reference was just inserted - store it so that if the user immediately deletes it, we can delete the whole thing instead of just one character
					if (slashReg.test(change.text) || agentReg.test(change.text) || variableReg.test(change.text)) {
						insertedTokenRange = new Range(change.range.startLineNumber, change.range.startColumn, change.range.endLineNumber, change.range.startColumn + change.text.length);
					}
				} else if (change.text.length === 0 && prevInsertTokenRange && change.range.endColumn === prevInsertTokenRange.endColumn) {
					this.widget.inputEditor.executeEdits(this.id, [{
						range: prevInsertTokenRange,
						text: '',
					}]);
					this.widget.refreshParsedInput();
				}
			}
			prevInsertTokenRange = insertedTokenRange;
		}));
	}
}
ChatWidget.CONTRIBS.push(ChatTokenDeleter);
