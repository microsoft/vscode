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
var EmptyTextEditorHintContentWidget_1;
import { $, addDisposableListener, getActiveWindow } from '../../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChangeLanguageAction } from '../../../../browser/parts/editor/editorStatus.js';
import { LOG_MODE_ID, OUTPUT_MODE_ID } from '../../../../services/output/common/output.js';
import { SEARCH_RESULT_LANGUAGE_ID } from '../../../../services/search/common/search.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IInlineChatSessionService } from '../../../inlineChat/browser/inlineChatSessionService.js';
import './emptyTextEditorHint.css';
export const emptyTextEditorHintSetting = 'workbench.editor.empty.hint';
let EmptyTextEditorHintContribution = class EmptyTextEditorHintContribution extends Disposable {
    static { this.ID = 'editor.contrib.emptyTextEditorHint'; }
    constructor(editor, configurationService, inlineChatSessionService, chatAgentService, instantiationService) {
        super();
        this.editor = editor;
        this.configurationService = configurationService;
        this.inlineChatSessionService = inlineChatSessionService;
        this.chatAgentService = chatAgentService;
        this.instantiationService = instantiationService;
        this._register(this.editor.onDidChangeModel(() => this.update()));
        this._register(this.editor.onDidChangeModelLanguage(() => this.update()));
        this._register(this.editor.onDidChangeModelContent(() => this.update()));
        this._register(this.chatAgentService.onDidChangeAgents(() => this.update()));
        this._register(this.editor.onDidChangeModelDecorations(() => this.update()));
        this._register(this.editor.onDidChangeConfiguration((e) => {
            if (e.hasChanged(104 /* EditorOption.readOnly */)) {
                this.update();
            }
        }));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(emptyTextEditorHintSetting)) {
                this.update();
            }
        }));
        this._register(inlineChatSessionService.onWillStartSession(editor => {
            if (this.editor === editor) {
                this.textHintContentWidget?.dispose();
            }
        }));
        this._register(inlineChatSessionService.onDidChangeSessions(() => {
            this.update();
        }));
    }
    shouldRenderHint() {
        const configValue = this.configurationService.getValue(emptyTextEditorHintSetting);
        if (configValue === 'hidden') {
            return false;
        }
        if (this.editor.getOption(104 /* EditorOption.readOnly */)) {
            return false;
        }
        const model = this.editor.getModel();
        const languageId = model?.getLanguageId();
        if (!model || languageId === OUTPUT_MODE_ID || languageId === LOG_MODE_ID || languageId === SEARCH_RESULT_LANGUAGE_ID) {
            return false;
        }
        if (this.inlineChatSessionService.getSessionByTextModel(model.uri)) {
            return false;
        }
        if (this.editor.getModel()?.getValueLength()) {
            return false;
        }
        const hasConflictingDecorations = Boolean(this.editor.getLineDecorations(1)?.find((d) => d.options.beforeContentClassName
            || d.options.afterContentClassName
            || d.options.before?.content
            || d.options.after?.content));
        if (hasConflictingDecorations) {
            return false;
        }
        const hasEditorAgents = Boolean(this.chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
        const shouldRenderDefaultHint = model?.uri.scheme === Schemas.untitled && languageId === PLAINTEXT_LANGUAGE_ID;
        return hasEditorAgents || shouldRenderDefaultHint;
    }
    update() {
        const shouldRenderHint = this.shouldRenderHint();
        if (shouldRenderHint && !this.textHintContentWidget) {
            this.textHintContentWidget = this.instantiationService.createInstance(EmptyTextEditorHintContentWidget, this.editor);
        }
        else if (!shouldRenderHint && this.textHintContentWidget) {
            this.textHintContentWidget.dispose();
            this.textHintContentWidget = undefined;
        }
    }
    dispose() {
        super.dispose();
        this.textHintContentWidget?.dispose();
    }
};
EmptyTextEditorHintContribution = __decorate([
    __param(1, IConfigurationService),
    __param(2, IInlineChatSessionService),
    __param(3, IChatAgentService),
    __param(4, IInstantiationService)
], EmptyTextEditorHintContribution);
export { EmptyTextEditorHintContribution };
let EmptyTextEditorHintContentWidget = class EmptyTextEditorHintContentWidget extends Disposable {
    static { EmptyTextEditorHintContentWidget_1 = this; }
    static { this.ID = 'editor.widget.emptyHint'; }
    constructor(editor, commandService, configurationService, keybindingService, chatAgentService, telemetryService, contextMenuService) {
        super();
        this.editor = editor;
        this.commandService = commandService;
        this.configurationService = configurationService;
        this.keybindingService = keybindingService;
        this.chatAgentService = chatAgentService;
        this.telemetryService = telemetryService;
        this.contextMenuService = contextMenuService;
        this.isVisible = false;
        this.ariaLabel = '';
        this._register(this.editor.onDidChangeConfiguration((e) => {
            if (this.domNode && e.hasChanged(59 /* EditorOption.fontInfo */)) {
                this.editor.applyFontInfo(this.domNode);
            }
        }));
        const onDidFocusEditorText = Event.debounce(this.editor.onDidFocusEditorText, () => undefined, 500);
        this._register(onDidFocusEditorText(() => {
            if (this.editor.hasTextFocus() && this.isVisible && this.ariaLabel && this.configurationService.getValue("accessibility.verbosity.emptyEditorHint" /* AccessibilityVerbositySettingId.EmptyEditorHint */)) {
                status(this.ariaLabel);
            }
        }));
        this.editor.addContentWidget(this);
    }
    getId() {
        return EmptyTextEditorHintContentWidget_1.ID;
    }
    disableHint(e) {
        const disableHint = () => {
            this.configurationService.updateValue(emptyTextEditorHintSetting, 'hidden');
            this.dispose();
            this.editor.focus();
        };
        if (!e) {
            disableHint();
            return;
        }
        this.contextMenuService.showContextMenu({
            getAnchor: () => { return new StandardMouseEvent(getActiveWindow(), e); },
            getActions: () => {
                return [{
                        id: 'workench.action.disableEmptyEditorHint',
                        label: localize('disableEditorEmptyHint', "Disable Empty Editor Hint"),
                        tooltip: localize('disableEditorEmptyHint', "Disable Empty Editor Hint"),
                        enabled: true,
                        class: undefined,
                        run: () => {
                            disableHint();
                        }
                    }
                ];
            }
        });
    }
    getHint() {
        const hasInlineChatProvider = this.chatAgentService.getActivatedAgents().filter(candidate => candidate.locations.includes(ChatAgentLocation.EditorInline)).length > 0;
        const hintHandler = {
            disposables: this._store,
            callback: (index, event) => {
                switch (index) {
                    case '0':
                        hasInlineChatProvider ? askSomething(event.browserEvent) : languageOnClickOrTap(event.browserEvent);
                        break;
                    case '1':
                        hasInlineChatProvider ? languageOnClickOrTap(event.browserEvent) : this.disableHint();
                        break;
                    case '2':
                        this.disableHint();
                        break;
                }
            }
        };
        // the actual command handlers...
        const askSomethingCommandId = 'inlineChat.start';
        const askSomething = async (e) => {
            e.stopPropagation();
            this.telemetryService.publicLog2('workbenchActionExecuted', {
                id: askSomethingCommandId,
                from: 'hint'
            });
            await this.commandService.executeCommand(askSomethingCommandId, { from: 'hint' });
        };
        const languageOnClickOrTap = async (e) => {
            e.stopPropagation();
            // Need to focus editor before so current editor becomes active and the command is properly executed
            this.editor.focus();
            this.telemetryService.publicLog2('workbenchActionExecuted', {
                id: ChangeLanguageAction.ID,
                from: 'hint'
            });
            await this.commandService.executeCommand(ChangeLanguageAction.ID);
            this.editor.focus();
        };
        const keybindingsLookup = [askSomethingCommandId, ChangeLanguageAction.ID];
        const keybindingLabels = keybindingsLookup.map(id => this.keybindingService.lookupKeybinding(id)?.getLabel());
        const hintMsg = (hasInlineChatProvider ? localize({
            key: 'emptyTextEditorHintWithInlineChat',
            comment: [
                'Preserve double-square brackets and their order',
                'language refers to a programming language'
            ]
        }, '[[Generate code]] ({0}), or [[select a language]] ({1}). Start typing to dismiss or [[don\'t show]] this again.', keybindingLabels.at(0) ?? '', keybindingLabels.at(1) ?? '') : localize({
            key: 'emptyTextEditorHintWithoutInlineChat',
            comment: [
                'Preserve double-square brackets and their order',
                'language refers to a programming language'
            ]
        }, '[[Select a language]] ({0}) to get started. Start typing to dismiss or [[don\'t show]] this again.', keybindingLabels.at(1) ?? '')).replaceAll(' ()', '');
        const hintElement = renderFormattedText(hintMsg, {
            actionHandler: hintHandler,
            renderCodeSegments: false,
        });
        hintElement.style.fontStyle = 'italic';
        const ariaLabel = hasInlineChatProvider ?
            localize('defaultHintAriaLabelWithInlineChat', 'Execute {0} to ask a question, execute {1} to select a language and get started. Start typing to dismiss.', ...keybindingLabels) :
            localize('defaultHintAriaLabelWithoutInlineChat', 'Execute {0} to select a language and get started. Start typing to dismiss.', ...keybindingLabels);
        // eslint-disable-next-line no-restricted-syntax
        for (const anchor of hintElement.querySelectorAll('a')) {
            anchor.style.cursor = 'pointer';
        }
        return { hintElement, ariaLabel };
    }
    getDomNode() {
        if (!this.domNode) {
            this.domNode = $('.empty-editor-hint');
            this.domNode.style.width = 'max-content';
            this.domNode.style.paddingLeft = '4px';
            const { hintElement, ariaLabel } = this.getHint();
            this.domNode.append(hintElement);
            this.ariaLabel = ariaLabel.concat(localize('disableHint', ' Toggle {0} in settings to disable this hint.', "accessibility.verbosity.emptyEditorHint" /* AccessibilityVerbositySettingId.EmptyEditorHint */));
            this._register(addDisposableListener(this.domNode, 'click', () => {
                this.editor.focus();
            }));
            this.editor.applyFontInfo(this.domNode);
            const lineHeight = this.editor.getLineHeightForPosition(new Position(1, 1));
            this.domNode.style.lineHeight = lineHeight + 'px';
        }
        return this.domNode;
    }
    getPosition() {
        return {
            position: { lineNumber: 1, column: 1 },
            preference: [0 /* ContentWidgetPositionPreference.EXACT */]
        };
    }
    dispose() {
        super.dispose();
        this.editor.removeContentWidget(this);
    }
};
EmptyTextEditorHintContentWidget = EmptyTextEditorHintContentWidget_1 = __decorate([
    __param(1, ICommandService),
    __param(2, IConfigurationService),
    __param(3, IKeybindingService),
    __param(4, IChatAgentService),
    __param(5, ITelemetryService),
    __param(6, IContextMenuService)
], EmptyTextEditorHintContentWidget);
registerEditorContribution(EmptyTextEditorHintContribution.ID, EmptyTextEditorHintContribution, 0 /* EditorContributionInstantiation.Eager */); // eager because it needs to render a help message
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1wdHlUZXh0RWRpdG9ySGludC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9lbXB0eVRleHRFZGl0b3JIaW50L2VtcHR5VGV4dEVkaXRvckhpbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUscUJBQXFCLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDL0YsT0FBTyxFQUF5QixtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUVyRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRSxPQUFPLEVBQW1DLDBCQUEwQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFaEksT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDakcsT0FBTyxFQUFFLHFC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