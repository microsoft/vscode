/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var InputEditorDecorations_1;
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { themeColorFromId } from '../../../../../../../base/common/themables.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../../../../editor/browser/services/codeEditorService.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { inputPlaceholderForeground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { IChatAgentService } from '../../../../common/participants/chatAgents.js';
import { localize } from '../../../../../../../nls.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../../../common/widget/chatColors.js';
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestSlashPromptPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestToolSetPart, chatAgentLeader, chatSubcommandLeader } from '../../../../common/requestParser/chatParserTypes.js';
import { agentReg, slashReg, variableReg } from '../../../../common/requestParser/chatRequestParser.js';
import { IPromptsService } from '../../../../common/promptSyntax/service/promptsService.js';
import { ChatWidget } from '../../chatWidget.js';
import { dynamicVariableDecorationType } from '../../../attachments/chatDynamicVariables.js';
import { NativeEditContextRegistry } from '../../../../../../../editor/browser/controller/editContext/native/nativeEditContextRegistry.js';
import { TextAreaEditContextRegistry } from '../../../../../../../editor/browser/controller/editContext/textArea/textAreaEditContextRegistry.js';
import { ThrottledDelayer } from '../../../../../../../base/common/async.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
const decorationDescription = 'chat';
const placeholderDecorationType = 'chat-session-detail';
const slashCommandTextDecorationType = 'chat-session-text';
const clickableSlashPromptTextDecorationType = 'chat-session-clickable-text';
const variableTextDecorationType = 'chat-variable-text';
function agentAndCommandToKey(agent, subcommand) {
    return subcommand ? `${agent.id}__${subcommand}` : agent.id;
}
function isWhitespaceOrPromptPart(p) {
    return (p instanceof ChatRequestTextPart && !p.text.trim().length) || (p instanceof ChatRequestSlashPromptPart);
}
function exactlyOneSpaceAfterPart(parsedRequest, part) {
    const partIdx = parsedRequest.indexOf(part);
    if (parsedRequest.length > partIdx + 2) {
        return false;
    }
    const nextPart = parsedRequest[partIdx + 1];
    return nextPart && nextPart instanceof ChatRequestTextPart && nextPart.text === ' ';
}
function getRangeForPlaceholder(part) {
    return {
        startLineNumber: part.editorRange.startLineNumber,
        endLineNumber: part.editorRange.endLineNumber,
        startColumn: part.editorRange.endColumn + 1,
        endColumn: 1000
    };
}
let InputEditorDecorations = class InputEditorDecorations extends Disposable {
    static { InputEditorDecorations_1 = this; }
    static { this.UPDATE_DELAY = 200; }
    constructor(widget, codeEditorService, themeService, chatAgentService, labelService, promptsService, editorService) {
        super();
        this.widget = widget;
        this.codeEditorService = codeEditorService;
        this.themeService = themeService;
        this.chatAgentService = chatAgentService;
        this.labelService = labelService;
        this.promptsService = promptsService;
        this.editorService = editorService;
        this.id = 'inputEditorDecorations';
        this.previouslyUsedAgents = new Set();
        this.viewModelDisposables = this._register(new MutableDisposable());
        this.updateThrottle = this._register(new ThrottledDelayer(InputEditorDecorations_1.UPDATE_DELAY));
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
            if (!e.event.leftButton || e.target.type !== 6 /* MouseTargetType.CONTENT_TEXT */ || !e.target.position) {
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
            if (!mouseDownPromptSlashCommand || e.target.type !== 6 /* MouseTargetType.CONTENT_TEXT */ || !e.target.position) {
                return;
            }
            if (!mouseDownPromptSlashCommand.range.containsPosition(e.target.position) || !Position.equals(mouseDownPromptSlashCommand.position, e.target.position)) {
                return;
            }
            void this.editorService.openEditor({ resource: mouseDownPromptSlashCommand.uri });
        }));
        this._register(this.chatAgentService.onDidChangeAgents(() => this.triggerInputEditorDecorationsUpdate()));
        this._register(this.promptsService.onDidChangeSlashCommands(() => this.triggerInputEditorDecorationsUpdate()));
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
    registerViewModelListeners() {
        this.viewModelDisposables.value = this.widget.viewModel?.onDidChange(e => {
            if (e?.kind === 'changePlaceholder' || e?.kind === 'initialize') {
                this.triggerInputEditorDecorationsUpdate();
            }
        });
    }
    registeredDecorationTypes() {
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
            rangeBehavior: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */
        }));
    }
    getPlaceholderColor() {
        const theme = this.themeService.getColorTheme();
        const transparentForeground = theme.getColor(inputPlaceholderForeground);
        return transparentForeground?.toString();
    }
    triggerInputEditorDecorationsUpdate() {
        // update placeholder decorations immediately, in sync
        this.updateInputPlaceholderDecoration();
        // with a delay, update the rest of the decorations
        this.updateThrottle.trigger(token => this.updateAsyncInputEditorDecorations(token));
    }
    updateInputPlaceholderDecoration() {
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
            const decoration = [
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
        let placeholderDecoration;
        const agentPart = parsedRequest.find((p) => p instanceof ChatRequestAgentPart);
        const agentSubcommandPart = parsedRequest.find((p) => p instanceof ChatRequestAgentSubcommandPart);
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
    async updateAsyncInputEditorDecorations(token) {
        this.clickablePromptSlashCommand = undefined;
        this.widget.inputEditor.setDecorationsByType(decorationDescription, clickableSlashPromptTextDecorationType, []);
        const parsedRequest = this.widget.parsedInput.parts;
        const agentPart = parsedRequest.find((p) => p instanceof ChatRequestAgentPart);
        const agentSubcommandPart = parsedRequest.find((p) => p instanceof ChatRequestAgentSubcommandPart);
        const slashCommandPart = parsedRequest.find((p) => p instanceof ChatRequestSlashCommandPart);
        const slashPromptPart = parsedRequest.find((p) => p instanceof ChatRequestSlashPromptPart);
        // first, fetch all async context
        const promptSlashCommand = slashPromptPart ? await this.promptsService.resolvePromptSlashCommand(slashPromptPart.name, token) : undefined;
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
        const textDecorations = [];
        if (agentPart) {
            textDecorations.push({ range: agentPart.editorRange });
        }
        if (agentSubcommandPart) {
            textDecorations.push({ range: agentSubcommandPart.editorRange, hoverMessage: new MarkdownString(agentSubcommandPart.command.description) });
        }
        if (slashCommandPart) {
            textDecorations.push({ range: slashCommandPart.editorRange });
        }
        if (slashPromptPart && promptSlashCommand) {
            this.clickablePromptSlashCommand = {
                range: Range.lift(slashPromptPart.editorRange),
                uri: promptSlashCommand.uri,
            };
            const promptHoverMessage = new MarkdownString();
            promptHoverMessage.appendText(localize('chatInput.promptSlashCommand.open', "Click to open {0}", this.labelService.getUriLabel(promptSlashCommand.uri, { relative: true })));
            const promptDecoration = {
                range: slashPromptPart.editorRange,
                hoverMessage: promptHoverMessage,
            };
            this.widget.inputEditor.setDecorationsByType(decorationDescription, clickableSlashPromptTextDecorationType, [promptDecoration]);
        }
        this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, textDecorations);
        const varDecorations = [];
        const toolParts = parsedRequest.filter((p) => p instanceof ChatRequestToolPart || p instanceof ChatRequestToolSetPart);
        for (const tool of toolParts) {
            varDecorations.push({ range: tool.editorRange });
        }
        const dynamicVariableParts = parsedRequest.filter((p) => p instanceof ChatRequestDynamicVariablePart);
        const isEditingPreviousRequest = !!this.widget.viewModel?.editing;
        if (isEditingPreviousRequest) {
            for (const variable of dynamicVariableParts) {
                varDecorations.push({ range: variable.editorRange, hoverMessage: URI.isUri(variable.data) ? new MarkdownString(this.labelService.getUriLabel(variable.data, { relative: true })) : undefined });
            }
        }
        this.widget.inputEditor.setDecorationsByType(decorationDescription, variableTextDecorationType, varDecorations);
    }
    updateAriaPlaceholder(value) {
        const nativeEditContext = NativeEditContextRegistry.get(this.widget.inputEditor.getId());
        if (nativeEditContext) {
            const domNode = nativeEditContext.domNode.domNode;
            if (value && value.trim().length) {
                domNode.setAttribute('aria-placeholder', value);
            }
            else {
                domNode.removeAttribute('aria-placeholder');
            }
        }
        else {
            const textAreaEditContext = TextAreaEditContextRegistry.get(this.widget.inputEditor.getId());
            if (textAreaEditContext) {
                const textArea = textAreaEditContext.textArea.domNode;
                if (value && value.trim().length) {
                    textArea.setAttribute('aria-placeholder', value);
                }
                else {
                    textArea.removeAttribute('aria-placeholder');
                }
            }
        }
    }
};
InputEditorDecorations = InputEditorDecorations_1 = __decorate([
    __param(1, ICodeEditorService),
    __param(2, IThemeService),
    __param(3, IChatAgentService),
    __param(4, ILabelService),
    __param(5, IPromptsService),
    __param(6, IEditorService)
], InputEditorDecorations);
class InputEditorSlashCommandMode extends Disposable {
    constructor(widget) {
        super();
        this.widget = widget;
        this.id = 'InputEditorSlashCommandMode';
        this._register(this.widget.onDidChangeAgent(e => {
            if (e.slashCommand && e.slashCommand.isSticky || !e.slashCommand && e.agent.metadata.isSticky) {
                this.repopulateAgentCommand(e.agent, e.slashCommand);
            }
        }));
        this._register(this.widget.onDidSubmitAgent(e => {
            this.repopulateAgentCommand(e.agent, e.slashCommand);
        }));
    }
    async repopulateAgentCommand(agent, slashCommand) {
        // Make sure we don't repopulate if the user already has something in the input
        if (this.widget.inputEditor.getValue().trim()) {
            return;
        }
        let value;
        if (slashCommand && slashCommand.isSticky) {
            value = `${chatAgentLeader}${agent.name} ${chatSubcommandLeader}${slashCommand.name} `;
        }
        else if (agent.metadata.isSticky) {
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
    constructor(widget) {
        super();
        this.widget = widget;
        this.id = 'chatTokenDeleter';
        let prevInsertTokenRange;
        // A simple heuristic to delete the previous insert token when the user presses backspace.
        this._register(this.widget.inputEditor.onDidChangeModelContent(e => {
            let insertedTokenRange;
            // Don't try to handle multi-cursor edits right now
            if (e.changes.length === 1) {
                const change = e.changes[0];
                if (change.text.length > 0 && change.rangeLength === 1) {
                    // A full slash command or agent reference was just inserted - store it so that if the user immediately deletes it, we can delete the whole thing instead of just one character
                    if (slashReg.test(change.text) || agentReg.test(change.text) || variableReg.test(change.text)) {
                        insertedTokenRange = new Range(change.range.startLineNumber, change.range.startColumn, change.range.endLineNumber, change.range.startColumn + change.text.length);
                    }
                }
                else if (change.text.length === 0 && prevInsertTokenRange && change.range.endColumn === prevInsertTokenRange.endColumn) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdElucHV0RWRpdG9yQ29udHJpYi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRJbnB1dEVkaXRvckNvbnRyaWIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDOUYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUU5RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN2RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0UsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBR3pFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUN6RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDM0YsT0FBTyxFQUFxQyxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3JILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNqSCxPQUFPLEVBQUUsb0JB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