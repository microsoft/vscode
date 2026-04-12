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
var LightBulbWidget_1;
import * as dom from '../../../../base/browser/dom.js';
import { Gesture } from '../../../../base/browser/touch.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import './lightBulbWidget.css';
import { ShowLightbulbIconMode } from '../../../common/config/editorOptions.js';
import { GlyphMarginLane } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { computeIndentLevel } from '../../../common/model/utils.js';
import { autoFixCommandId, quickFixCommandId } from './codeAction.js';
import * as nls from '../../../../nls.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Range } from '../../../common/core/range.js';
const GUTTER_LIGHTBULB_ICON = registerIcon('gutter-lightbulb', Codicon.lightBulb, nls.localize('gutterLightbulbWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor.'));
const GUTTER_LIGHTBULB_AUTO_FIX_ICON = registerIcon('gutter-lightbulb-auto-fix', Codicon.lightbulbAutofix, nls.localize('gutterLightbulbAutoFixWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and a quick fix is available.'));
const GUTTER_LIGHTBULB_AIFIX_ICON = registerIcon('gutter-lightbulb-sparkle', Codicon.lightbulbSparkle, nls.localize('gutterLightbulbAIFixWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix is available.'));
const GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON = registerIcon('gutter-lightbulb-aifix-auto-fix', Codicon.lightbulbSparkleAutofix, nls.localize('gutterLightbulbAIFixAutoFixWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix and a quick fix is available.'));
const GUTTER_SPARKLE_FILLED_ICON = registerIcon('gutter-lightbulb-sparkle-filled', Codicon.sparkleFilled, nls.localize('gutterLightbulbSparkleFilledWidget', 'Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix and a quick fix is available.'));
var LightBulbState;
(function (LightBulbState) {
    let Type;
    (function (Type) {
        Type[Type["Hidden"] = 0] = "Hidden";
        Type[Type["Showing"] = 1] = "Showing";
    })(Type = LightBulbState.Type || (LightBulbState.Type = {}));
    LightBulbState.Hidden = { type: 0 /* Type.Hidden */ };
    class Showing {
        constructor(actions, trigger, editorPosition, widgetPosition) {
            this.actions = actions;
            this.trigger = trigger;
            this.editorPosition = editorPosition;
            this.widgetPosition = widgetPosition;
            this.type = 1 /* Type.Showing */;
        }
    }
    LightBulbState.Showing = Showing;
})(LightBulbState || (LightBulbState = {}));
export function computeLightBulbInfo(actions, trigger, preferredKbLabel, quickFixKbLabel, forGutter = false) {
    if (actions.validActions.length <= 0) {
        return undefined;
    }
    let icon;
    let autoRun = false;
    if (actions.allAIFixes) {
        icon = forGutter ? GUTTER_SPARKLE_FILLED_ICON : Codicon.sparkleFilled;
        if (actions.validActions.length === 1) {
            autoRun = true;
        }
    }
    else if (actions.hasAutoFix) {
        if (actions.hasAIFix) {
            icon = forGutter ? GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON : Codicon.lightbulbSparkleAutofix;
        }
        else {
            icon = forGutter ? GUTTER_LIGHTBULB_AUTO_FIX_ICON : Codicon.lightbulbAutofix;
        }
    }
    else if (actions.hasAIFix) {
        icon = forGutter ? GUTTER_LIGHTBULB_AIFIX_ICON : Codicon.lightbulbSparkle;
    }
    else {
        icon = forGutter ? GUTTER_LIGHTBULB_ICON : Codicon.lightBulb;
    }
    let title;
    if (autoRun) {
        title = nls.localize('codeActionAutoRun', "Run: {0}", actions.validActions[0].action.title);
    }
    else if (actions.hasAutoFix && preferredKbLabel) {
        title = nls.localize('preferredcodeActionWithKb', "Show Code Actions. Preferred Quick Fix Available ({0})", preferredKbLabel);
    }
    else if (!actions.hasAutoFix && quickFixKbLabel) {
        title = nls.localize('codeActionWithKb', "Show Code Actions ({0})", quickFixKbLabel);
    }
    else {
        title = nls.localize('codeAction', "Show Code Actions");
    }
    return { actions, trigger, icon, autoRun, title, isGutter: forGutter };
}
let LightBulbWidget = class LightBulbWidget extends Disposable {
    static { LightBulbWidget_1 = this; }
    static { this.GUTTER_DECORATION = ModelDecorationOptions.register({
        description: 'codicon-gutter-lightbulb-decoration',
        glyphMarginClassName: ThemeIcon.asClassName(Codicon.lightBulb),
        glyphMargin: { position: GlyphMarginLane.Left },
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
    }); }
    static { this.ID = 'editor.contrib.lightbulbWidget'; }
    static { this._posPref = [0 /* ContentWidgetPositionPreference.EXACT */]; }
    static _computeLightBulbInfo(state, forGutter, preferredKbLabel, quickFixKbLabel) {
        if (state.type !== 1 /* LightBulbState.Type.Showing */) {
            return undefined;
        }
        return computeLightBulbInfo(state.actions, state.trigger, preferredKbLabel, quickFixKbLabel, forGutter);
    }
    constructor(_editor, _keybindingService) {
        super();
        this._editor = _editor;
        this._keybindingService = _keybindingService;
        this.onlyWithEmptySelection = false;
        this._onClick = this._register(new Emitter());
        this.onClick = this._onClick.event;
        this._state = observableValue(this, LightBulbState.Hidden);
        this._gutterState = observableValue(this, LightBulbState.Hidden);
        this._combinedInfo = derived(this, reader => {
            const gutterState = this._gutterState.read(reader);
            if (gutterState.type === 1 /* LightBulbState.Type.Showing */) {
                return LightBulbWidget_1._computeLightBulbInfo(gutterState, true, this._preferredKbLabel.read(reader), this._quickFixKbLabel.read(reader));
            }
            const state = this._state.read(reader);
            if (state.type === 1 /* LightBulbState.Type.Showing */) {
                return LightBulbWidget_1._computeLightBulbInfo(state, false, this._preferredKbLabel.read(reader), this._quickFixKbLabel.read(reader));
            }
            return undefined;
        });
        this.lightBulbInfo = this._combinedInfo;
        this._iconClasses = [];
        this.lightbulbClasses = [
            'codicon-' + GUTTER_LIGHTBULB_ICON.id,
            'codicon-' + GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON.id,
            'codicon-' + GUTTER_LIGHTBULB_AUTO_FIX_ICON.id,
            'codicon-' + GUTTER_LIGHTBULB_AIFIX_ICON.id,
            'codicon-' + GUTTER_SPARKLE_FILLED_ICON.id
        ];
        this._preferredKbLabel = observableValue(this, undefined);
        this._quickFixKbLabel = observableValue(this, undefined);
        this.gutterDecoration = LightBulbWidget_1.GUTTER_DECORATION;
        this._domNode = dom.$('div.lightBulbWidget');
        this._domNode.role = 'listbox';
        this._register(Gesture.ignoreTarget(this._domNode));
        this._editor.addContentWidget(this);
        this._register(this._editor.onDidChangeModelContent(_ => {
            // cancel when the line in question has been removed
            const editorModel = this._editor.getModel();
            const state = this._state.get();
            if (state.type !== 1 /* LightBulbState.Type.Showing */ || !editorModel || state.editorPosition.lineNumber >= editorModel.getLineCount()) {
                this.hide();
            }
            const gutterState = this._gutterState.get();
            if (gutterState.type !== 1 /* LightBulbState.Type.Showing */ || !editorModel || gutterState.editorPosition.lineNumber >= editorModel.getLineCount()) {
                this.gutterHide();
            }
        }));
        this._register(dom.addStandardDisposableGenericMouseDownListener(this._domNode, e => {
            const state = this._state.get();
            if (state.type !== 1 /* LightBulbState.Type.Showing */) {
                return;
            }
            // Make sure that focus / cursor location is not lost when clicking widget icon
            this._editor.focus();
            e.preventDefault();
            // a bit of extra work to make sure the menu
            // doesn't cover the line-text
            const { top, height } = dom.getDomNodePagePosition(this._domNode);
            const lineHeight = this._editor.getOption(75 /* EditorOption.lineHeight */);
            let pad = Math.floor(lineHeight / 3);
            if (state.widgetPosition.position !== null && state.widgetPosition.position.lineNumber < state.editorPosition.lineNumber) {
                pad += lineHeight;
            }
            this._onClick.fire({
                x: e.posx,
                y: top + height + pad,
                actions: state.actions,
                trigger: state.trigger,
            });
        }));
        this._register(dom.addDisposableListener(this._domNode, 'mouseenter', (e) => {
            if ((e.buttons & 1) !== 1) {
                return;
            }
            // mouse enters lightbulb while the primary/left button
            // is being pressed -> hide the lightbulb
            this.hide();
        }));
        this._register(Event.runAndSubscribe(this._keybindingService.onDidUpdateKeybindings, () => {
            this._preferredKbLabel.set(this._keybindingService.lookupKeybinding(autoFixCommandId)?.getLabel() ?? undefined, undefined);
            this._quickFixKbLabel.set(this._keybindingService.lookupKeybinding(quickFixCommandId)?.getLabel() ?? undefined, undefined);
        }));
        // Autorun to update the DOM based on state changes
        this._register(autorun(reader => {
            const info = this._combinedInfo.read(reader);
            this._updateLightBulbTitleAndIcon(info);
            this._updateGutterDecorationOptions(info);
        }));
        this._register(this._editor.onMouseDown(async (e) => {
            if (!e.target.element || !this.lightbulbClasses.some(cls => e.target.element && e.target.element.classList.contains(cls))) {
                return;
            }
            const gutterState = this._gutterState.get();
            if (gutterState.type !== 1 /* LightBulbState.Type.Showing */) {
                return;
            }
            // Make sure that focus / cursor location is not lost when clicking widget icon
            this._editor.focus();
            // a bit of extra work to make sure the menu
            // doesn't cover the line-text
            const { top, height } = dom.getDomNodePagePosition(e.target.element);
            const lineHeight = this._editor.getOption(75 /* EditorOption.lineHeight */);
            let pad = Math.floor(lineHeight / 3);
            if (gutterState.widgetPosition.position !== null && gutterState.widgetPosition.position.lineNumber < gutterState.editorPosition.lineNumber) {
                pad += lineHeight;
            }
            this._onClick.fire({
                x: e.event.posx,
                y: top + height + pad,
                actions: gutterState.actions,
                trigger: gutterState.trigger,
            });
        }));
    }
    dispose() {
        super.dispose();
        this._editor.removeContentWidget(this);
        if (this._gutterDecorationID) {
            this._removeGutterDecoration(this._gutterDecorationID);
        }
    }
    getId() {
        return 'LightBulbWidget';
    }
    getDomNode() {
        return this._domNode;
    }
    getPosition() {
        const state = this._state.get();
        return state.type === 1 /* LightBulbState.Type.Showing */ ? state.widgetPosition : null;
    }
    update(actions, trigger, atPosition) {
        if (actions.validActions.length <= 0) {
            this.gutterHide();
            return this.hide();
        }
        if (this.onlyWithEmptySelection && !this._editor.getSelection()?.isEmpty()) {
            this.gutterHide();
            return this.hide();
        }
        const hasTextFocus = this._editor.hasTextFocus();
        if (!hasTextFocus) {
            this.gutterHide();
            return this.hide();
        }
        const options = this._editor.getOptions();
        if (options.get(73 /* EditorOption.lightbulb */).enabled === ShowLightbulbIconMode.Off) {
            this.gutterHide();
            return this.hide();
        }
        const model = this._editor.getModel();
        if (!model) {
            this.gutterHide();
            return this.hide();
        }
        const { lineNumber, column } = model.validatePosition(atPosition);
        const tabSize = model.getOptions().tabSize;
        const fontInfo = this._editor.getOptions().get(59 /* EditorOption.fontInfo */);
        const lineContent = model.getLineContent(lineNumber);
        const indent = computeIndentLevel(lineContent, tabSize);
        const lineHasSpace = fontInfo.spaceWidth * indent > 22;
        const isFolded = (lineNumber) => {
            return lineNumber > 2 && this._editor.getTopForLineNumber(lineNumber) === this._editor.getTopForLineNumber(lineNumber - 1);
        };
        // Check for glyph margin decorations of any kind
        const currLineDecorations = this._editor.getLineDecorations(lineNumber);
        let hasDecoration = false;
        if (currLineDecorations) {
            for (const decoration of currLineDecorations) {
                const glyphClass = decoration.options.glyphMarginClassName;
                if (glyphClass && !this.lightbulbClasses.some(className => glyphClass.includes(className))) {
                    hasDecoration = true;
                    break;
                }
            }
        }
        let effectiveLineNumber = lineNumber;
        let effectiveColumnNumber = 1;
        if (!lineHasSpace) {
            // Checks if line is empty or starts with any amount of whitespace
            const isLineEmptyOrIndented = (lineNumber) => {
                const lineContent = model.getLineContent(lineNumber);
                return /^\s*$|^\s+/.test(lineContent) || lineContent.length <= effectiveColumnNumber;
            };
            if (lineNumber > 1 && !isFolded(lineNumber - 1)) {
                const lineCount = model.getLineCount();
                const endLine = lineNumber === lineCount;
                const prevLineEmptyOrIndented = lineNumber > 1 && isLineEmptyOrIndented(lineNumber - 1);
                const nextLineEmptyOrIndented = !endLine && isLineEmptyOrIndented(lineNumber + 1);
                const currLineEmptyOrIndented = isLineEmptyOrIndented(lineNumber);
                const notEmpty = !nextLineEmptyOrIndented && !prevLineEmptyOrIndented;
                // check above and below. if both are blocked, display lightbulb in the gutter.
                if (!nextLineEmptyOrIndented && !prevLineEmptyOrIndented && !hasDecoration) {
                    this._gutterState.set(new LightBulbState.Showing(actions, trigger, atPosition, {
                        position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
                        preference: LightBulbWidget_1._posPref
                    }), undefined);
                    this.renderGutterLightbub();
                    return this.hide();
                }
                else if (prevLineEmptyOrIndented || endLine || (prevLineEmptyOrIndented && !currLineEmptyOrIndented)) {
                    effectiveLineNumber -= 1;
                }
                else if (nextLineEmptyOrIndented || (notEmpty && currLineEmptyOrIndented)) {
                    effectiveLineNumber += 1;
                }
            }
            else if (lineNumber === 1 && (lineNumber === model.getLineCount() || !isLineEmptyOrIndented(lineNumber + 1) && !isLineEmptyOrIndented(lineNumber))) {
                // special checks for first line blocked vs. not blocked.
                this._gutterState.set(new LightBulbState.Showing(actions, trigger, atPosition, {
                    position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
                    preference: LightBulbWidget_1._posPref
                }), undefined);
                if (hasDecoration) {
                    this.gutterHide();
                }
                else {
                    this.renderGutterLightbub();
                    return this.hide();
                }
            }
            else if ((lineNumber < model.getLineCount()) && !isFolded(lineNumber + 1)) {
                effectiveLineNumber += 1;
            }
            else if (column * fontInfo.spaceWidth < 22) {
                // cannot show lightbulb above/below and showing
                // it inline would overlay the cursor...
                return this.hide();
            }
            effectiveColumnNumber = /^\S\s*$/.test(model.getLineContent(effectiveLineNumber)) ? 2 : 1;
        }
        this._state.set(new LightBulbState.Showing(actions, trigger, atPosition, {
            position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
            preference: LightBulbWidget_1._posPref
        }), undefined);
        if (this._gutterDecorationID) {
            this._removeGutterDecoration(this._gutterDecorationID);
            this.gutterHide();
        }
        const validActions = actions.validActions;
        const actionKind = actions.validActions[0].action.kind;
        if (validActions.length !== 1 || !actionKind) {
            this._editor.layoutContentWidget(this);
            return;
        }
        this._editor.layoutContentWidget(this);
    }
    hide() {
        if (this._state.get() === LightBulbState.Hidden) {
            return;
        }
        this._state.set(LightBulbState.Hidden, undefined);
        this._editor.layoutContentWidget(this);
    }
    gutterHide() {
        if (this._gutterState.get() === LightBulbState.Hidden) {
            return;
        }
        if (this._gutterDecorationID) {
            this._removeGutterDecoration(this._gutterDecorationID);
        }
        this._gutterState.set(LightBulbState.Hidden, undefined);
    }
    _updateLightBulbTitleAndIcon(info) {
        this._domNode.classList.remove(...this._iconClasses);
        this._iconClasses = [];
        if (!info || info.isGutter) {
            return;
        }
        this._domNode.title = info.title;
        this._iconClasses = ThemeIcon.asClassNameArray(info.icon);
        this._domNode.classList.add(...this._iconClasses);
    }
    _updateGutterDecorationOptions(info) {
        if (!info || !info.isGutter) {
            return;
        }
        this.gutterDecoration = ModelDecorationOptions.register({
            description: 'codicon-gutter-lightbulb-decoration',
            glyphMarginClassName: ThemeIcon.asClassName(info.icon),
            glyphMargin: { position: GlyphMarginLane.Left },
            stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        });
    }
    /* Gutter Helper Functions */
    renderGutterLightbub() {
        const selection = this._editor.getSelection();
        if (!selection) {
            return;
        }
        if (this._gutterDecorationID === undefined) {
            this._addGutterDecoration(selection.startLineNumber);
        }
        else {
            this._updateGutterDecoration(this._gutterDecorationID, selection.startLineNumber);
        }
    }
    _addGutterDecoration(lineNumber) {
        this._editor.changeDecorations((accessor) => {
            this._gutterDecorationID = accessor.addDecoration(new Range(lineNumber, 0, lineNumber, 0), this.gutterDecoration);
        });
    }
    _removeGutterDecoration(decorationId) {
        this._editor.changeDecorations((accessor) => {
            accessor.removeDecoration(decorationId);
            this._gutterDecorationID = undefined;
        });
    }
    _updateGutterDecoration(decorationId, lineNumber) {
        this._editor.changeDecorations((accessor) => {
            accessor.changeDecoration(decorationId, new Range(lineNumber, 0, lineNumber, 0));
            accessor.changeDecorationOptions(decorationId, this.gutterDecoration);
        });
    }
};
LightBulbWidget = LightBulbWidget_1 = __decorate([
    __param(1, IKeybindingService)
], LightBulbWidget);
export { LightBulbWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlnaHRCdWxiV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9icm93c2VyL2xpZ2h0QnVsYldpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFlLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLHVCQUF1QixDQUFDO0FBRS9CLE9BQU8sRUFBZ0IscUJBQXFCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUU5RixPQUFPLEVBQUUsZUFBZSxFQUEyRCxNQUFNLDBCQUEwQixDQUFDO0FBQ3BILE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRXRFLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV0RCxNQUFNLHFCQUFxQixHQUFHLFlBQVksQ0FBQyxrQkFBa0IsRUFBRSxPQUFPLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLEVBQUUsMkZBQTJGLENBQUMsQ0FBQyxDQUFDO0FBQ3ROLE1BQU0sOEJBQThCLEdBQUcsWUFBWSxDQUFDLDJCQUEyQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDhCQUE4QixFQUFFLHdIQUF3SCxDQUFDLENBQUMsQ0FBQztBQUNuUixNQUFNLDJCQUEyQixHQUFHLFlBQVksQ0FBQywwQkFBMEIsRUFBRSxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxzSEFBc0gsQ0FBQyxDQUFDLENBQUM7QUFDM1EsTUFBTSxvQ0FBb0MsR0FBRyxZQUFZLENBQUMsaUNBQWlDLEVBQUUsT0FBTyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsbUNBQW1DLEVBQUUsc0lBQXNJLENBQUMsQ0FBQyxDQUFDO0FBQ3pULE1BQU0sMEJBQTBCLEdBQUcsWUFBWSxDQUFDLGlDQUFpQyxFQUFFLE9BQU8sQ0FBQyxhQUFhLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSxzSUFBc0ksQ0FBQyxDQUFDLENBQUM7QUFXdFMsSUFBVSxjQUFjLENBcUJ2QjtBQXJCRCxXQUFVLGNBQWM7SUFFdkIsSUFBa0IsSUFHakI7SUFIRCxXQUFrQixJQUFJO1FBQ3JCLG1DQUFNLENBQUE7UUFDTixxQ0FBTyxDQUFBO0lBQ1IsQ0FBQyxFQUhpQixJQUFJLEdBQUosbUJBQUksS0FBSixtQkFBSSxRQUdyQjtJQUVZLHFCQUFNLEdBQUcsRUFBRSxJQUFJLHFCQUFhLEVBQVcsQ0FBQztJQUVyRCxNQUFhLE9BQU87UUFHbkIsWUFDaUIsT0FBc0IsRUFDdEIsT0FBMEIsRUFDMUIsY0FBeUIsRUFDekIsY0FBc0M7WUFIdEMsWUFBTyxHQUFQLE9BQU8sQ0FBZTtZQUN0QixZQUFPLEdBQVAsT0FBTyxDQUFtQjtZQUMxQixtQkFBYyxHQUFkLGNBQWMsQ0FBVztZQUN6QixtQkFBYyxHQUFkLGNBQWMsQ0FBd0I7WUFOOUMsU0FBSSx3QkFBZ0I7UUFPekIsQ0FBQztLQUNMO0lBVFksc0JBQU8sVUFTbkIsQ0FBQTtBQUdGLENBQUMsRUFyQlMsY0FBYyxLQUFkLGNBQWMsUUFxQnZCO0FBRUQsTUFBTSxVQUFVLG9CQUFvQixDQUFDLE9BQXNCLEVBQUUsT0FBMEIsRUFBRSxnQkFBb0MsRUFBRSxlQUFtQyxFQUFFLFlBQXFCLEtBQUs7SUFDN0wsSUFBSSxPQUFPLENBQUMsWUFBWSxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUN0QyxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsSUFBSSxJQUFlLENBQUM7SUFDcEIsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDO0lBQ3BCLElBQUksT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3hCLElBQUksR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDO1FBQ3RFLElBQUksT0FBTyxDQUFDLFlBQVksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDdkMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNoQixDQUFDO0lBQ0YsQ0FBQztTQUFNLElBQUksT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQy9CLElBQUksT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3RCLElBQUksR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLG9DQUFvQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsdUJBQXVCLENBQUM7UUFDM0YsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDO1FBQzlFLENBQUM7SUFDRixDQUFDO1NBQU0sSUFBSSxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDN0IsSUFBSSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztJQUMzRSxDQUFDO1NBQU0sQ0FBQztRQUNQLElBQUksR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDO0lBQzlELENBQUM7SUFFRCxJQUFJLEtBQWEsQ0FBQztJQUNsQixJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQ2IsS0FBSyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLEVBQUUsVUFBVSxFQUFFLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzdGLENBQUM7U0FBTSxJQUFJLE9BQU8sQ0FBQyxVQUFVLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUNuRCxLQUFLLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSx3REFBd0QsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQy9ILENBQUM7U0FBTSxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNuRCxLQUFLLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSx5QkFBeUIsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUN0RixDQUFDO1NBQU0sQ0FBQztRQUNQLEtBQUssR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLENBQUM7QUFDeEUsQ0FBQztBQUVNLElBQU0sZUFBZSxHQUFyQixNQUFNLGVBQWdCLFNBQVEsVUFBVTs7YUFLdEIsc0JBQWlCLEdBQUcsc0JBQXNCLENBQUMsUUFBUSxDQUFDO1FBQzNFLFdBQVcsRUFBRSxxQ0FBcUM7UUFDbEQsb0JBQW9CLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDO1FBQzlELFdBQVcsRUFBRSxFQUFFLFFBQVEsRUFBRSxlQUFlLENBQUMsSUFBSSxFQUFFO1FBQy9DLFVBQVUsNERBQW9EO0tBQzlELENBQUMsQUFMdUMsQ0FLdEM7YUFFb0IsT0FBRSxHQUFHLGdDQUFnQyxBQUFuQyxDQUFvQzthQUVyQyxhQUFRLEdBQUcsK0NBQXVDLEFBQTFDLENBQTJDO0lBdUNuRSxNQUFNLENBQUMscUJBQXFCLENBQUMsS0FBMkIsRUFBRSxTQUFrQixFQUFFLGdCQUFvQyxFQUFFLGVBQW1DO1FBQzlKLElBQUksS0FBSyxDQUFDLElBQUksd0NBQWdDLEVBQUUsQ0FBQztZQUNoRCxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsT0FBTyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3pHLENBQUM7SUFFRCxZQUNrQixPQUFvQixFQUNqQixrQkFBdUQ7UUFFM0UsS0FBSyxFQUFFLENBQUM7UUFIUyxZQUFPLEdBQVAsT0FBTyxDQUFhO1FBQ0EsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQTNENUUsMkJBQXNCLEdBQUcsS0FBSyxDQUFDO1FBZWQsYUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQW9ILENBQUMsQ0FBQztRQUM1SixZQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7UUFFN0IsV0FBTSxHQUFHLGVBQWUsQ0FBdUIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1RSxpQkFBWSxHQUFHLGVBQWUsQ0FBdUIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVsRixrQkFBYSxHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLEVBQUU7WUFDdkQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbkQsSUFBSSxXQUFXLENBQUMsSUFBSSx3Q0FBZ0MsRUFBRSxDQUFDO2dCQUN0RCxPQUFPLGlCQUFlLENBQUMscUJBQXFCLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUMxSSxDQUFDO1lBQ0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdkMsSUFBSSxLQUFLLENBQUMsSUFBSSx3Q0FBZ0MsRUFBRSxDQUFDO2dCQUNoRCxPQUFPLGlCQUFlLENBQUMscUJBQXFCLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNySSxDQUFDO1lBQ0QsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQyxDQUFDLENBQUM7UUFFYSxrQkFBYSxHQUEyQyxJQUFJLENBQUMsYUFBYSxDQUFDO1FBRW5GLGlCQUFZLEdBQWEsRUFBRSxDQUFDO1FBRW5CLHFCQUFnQixHQUFHO1lBQ25DLFVBQVUsR0FBRyxxQkFBcUIsQ0FBQyxFQUFFO1lBQ3JDLFVBQVUsR0FBRyxvQ0FBb0MsQ0FBQyxFQUFFO1lBQ3BELFVBQVUsR0FBRyw4QkFBOEIsQ0FBQyxFQUFFO1lBQzlDLFVBQVUsR0FBRywyQkFBMkIsQ0FBQyxFQUFFO1lBQzNDLFVBQVUsR0FBRywwQkFBMEIsQ0FBQyxFQUFFO1NBQzFDLENBQUM7UUFFZSxzQkFBaUIsR0FBRyxlQUFlLENBQXFCLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN6RSxxQkFBZ0IsR0FBRyxlQUFlLENBQXFCLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVqRixxQkFBZ0IsR0FBMkIsaUJBQWUsQ0FBQyxpQkFBaUIsQ0FBQztRQWVwRixJQUFJLENBQUMsUUFBUSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxTQUFTLENBQUM7UUFDL0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBRXBELElBQUksQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFcEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3ZELG9EQUFvRDtZQUNwRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQzVDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDaEMsSUFBSSxLQUFLLENBQUMsSUFBSSx3Q0FBZ0MsSUFBSSxDQUFDLFdBQVcsSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsSUFBSSxXQUFXLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQztnQkFDakksSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2IsQ0FBQztZQUVELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDNUMsSUFBSSxXQUFXLENBQUMsSUFBSSx3Q0FBZ0MsSUFBSSxDQUFDLFdBQVcsSUFBSSxXQUFXLENBQUMsY0FBYyxDQUFDLFVBQVUsSUFBSSxXQUFXLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQztnQkFDN0ksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ25CLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsNkNBQTZDLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsRUFBRTtZQUNuRixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ2hDLElBQUksS0FBSyxDQUFDLElBQUksd0NBQWdDLEVBQUUsQ0FBQztnQkFDaEQsT0FBTztZQUNSLENBQUM7WUFFRCwrRUFBK0U7WUFDL0UsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNyQixDQUFDLENBQUMsY0FBYyxFQUFFLENBQUM7WUFFbkIsNENBQTRDO1lBQzVDLDhCQUE4QjtZQUM5QixNQUFNLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbEUsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLGtDQUF5QixDQUFDO1lBRW5FLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLElBQUksS0FBSyxDQUFDLGNBQWMsQ0FBQyxRQUFRLEtBQUssSUFBSSxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUMxSCxHQUFHLElBQUksVUFBVSxDQUFDO1lBQ25CLENBQUM7WUFFRCxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztnQkFDbEIsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJO2dCQUNULENBQUMsRUFBRSxHQUFHLEdBQUcsTUFBTSxHQUFHLEdBQUc7Z0JBQ3JCLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTztnQkFDdEIsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPO2FBQ3RCLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLFlBQVksRUFBRSxDQUFDLENBQWEsRUFBRSxFQUFFO1lBQ3ZGLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUMzQixPQUFPO1lBQ1IsQ0FBQztZQUNELHVEQUF1RDtZQUN2RCx5Q0FBeUM7WUFDekMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUdKLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO1lBQ3pGLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLEVBQUUsUUFBUSxFQUFFLElBQUksU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzNILElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLGlCQUFpQixDQUFDLEVBQUUsUUFBUSxFQUFFLElBQUksU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVILENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixtREFBbUQ7UUFDbkQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDN0MsSUFBSSxDQUFDLDRCQUE0QixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3hDLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBb0IsRUFBRSxFQUFFO1lBRXRFLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDM0gsT0FBTztZQUNSLENBQUM7WUFFRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzVDLElBQUksV0FBVyxDQUFDLElBQUksd0NBQWdDLEVBQUUsQ0FBQztnQkFDdEQsT0FBTztZQUNSLENBQUM7WUFFRCwrRUFBK0U7WUFDL0UsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUVyQiw0Q0FBNEM7WUFDNUMsOEJBQThCO1lBQzlCLE1BQU0sRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDckUsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLGtDQUF5QixDQUFDO1lBRW5FLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLElBQUksV0FBVyxDQUFDLGNBQWMsQ0FBQyxRQUFRLEtBQUssSUFBSSxJQUFJLFdBQVcsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxXQUFXLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUM1SSxHQUFHLElBQUksVUFBVSxDQUFDO1lBQ25CLENBQUM7WUFFRCxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztnQkFDbEIsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSTtnQkFDZixDQUFDLEVBQUUsR0FBRyxHQUFHLE1BQU0sR0FBRyxHQUFHO2dCQUNyQixPQUFPLEVBQUUsV0FBVyxDQUFDLE9BQU87Z0JBQzVCLE9BQU8sRUFBRSxXQUFXLENBQUMsT0FBTzthQUM1QixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVRLE9BQU87UUFDZixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDaEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QyxJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUN4RCxDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUs7UUFDSixPQUFPLGlCQUFpQixDQUFDO0lBQzFCLENBQUM7SUFFRCxVQUFVO1FBQ1QsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3RCLENBQUM7SUFFRCxXQUFXO1FBQ1YsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNoQyxPQUFPLEtBQUssQ0FBQyxJQUFJLHdDQUFnQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDakYsQ0FBQztJQUVNLE1BQU0sQ0FBQyxPQUFzQixFQUFFLE9BQTBCLEVBQUUsVUFBcUI7UUFDdEYsSUFBSSxPQUFPLENBQUMsWUFBWSxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUN0QyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDcEIsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLHNCQUFzQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDO1lBQzVFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNwQixDQUFDO1FBRUQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNqRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbkIsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3BCLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzFDLElBQUksT0FBTyxDQUFDLEdBQUcsaUNBQXdCLENBQUMsT0FBTyxLQUFLLHFCQUFxQixDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQy9FLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNsQixPQUFPLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNwQixDQUFDO1FBR0QsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUN0QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDcEIsQ0FBQztRQUVELE1BQU0sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRWxFLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQyxPQUFPLENBQUM7UUFDM0MsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxHQUFHLGdDQUF1QixDQUFDO1FBQ3RFLE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDckQsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3hELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxVQUFVLEdBQUcsTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUN2RCxNQUFNLFFBQVEsR0FBRyxDQUFDLFVBQWtCLEVBQUUsRUFBRTtZQUN2QyxPQUFPLFVBQVUsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxVQUFVLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFDLG1CQUFtQixDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM1SCxDQUFDLENBQUM7UUFFRixpREFBaUQ7UUFDakQsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3hFLElBQUksYUFBYSxHQUFHLEtBQUssQ0FBQztRQUMxQixJQUFJLG1CQUFtQixFQUFFLENBQUM7WUFDekIsS0FBSyxNQUFNLFVBQVUsSUFBSSxtQkFBbUIsRUFBRSxDQUFDO2dCQUM5QyxNQUFNLFVBQVUsR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDO2dCQUUzRCxJQUFJLFVBQVUsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDNUYsYUFBYSxHQUFHLElBQUksQ0FBQztvQkFDckIsTUFBTTtnQkFDUCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLG1CQUFtQixHQUFHLFVBQVUsQ0FBQztRQUNyQyxJQUFJLHFCQUFxQixHQUFHLENBQUMsQ0FBQztRQUM5QixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbkIsa0VBQWtFO1lBQ2xFLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxVQUFrQixFQUFXLEVBQUU7Z0JBQzdELE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ3JELE9BQU8sWUFBWSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxXQUFXLENBQUMsTUFBTSxJQUFJLHFCQUFxQixDQUFDO1lBQ3RGLENBQUMsQ0FBQztZQUVGLElBQUksVUFBVSxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDakQsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUN2QyxNQUFNLE9BQU8sR0FBRyxVQUFVLEtBQUssU0FBUyxDQUFDO2dCQUN6QyxNQUFNLHVCQUF1QixHQUFHLFVBQVUsR0FBRyxDQUFDLElBQUkscUJBQXFCLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUN4RixNQUFNLHVCQUF1QixHQUFHLENBQUMsT0FBTyxJQUFJLHFCQUFxQixDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDbEYsTUFBTSx1QkFBdUIsR0FBRyxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDbEUsTUFBTSxRQUFRLEdBQUcsQ0FBQyx1QkFBdUIsSUFBSSxDQUFDLHVCQUF1QixDQUFDO2dCQUV0RSwrRUFBK0U7Z0JBQy9FLElBQUksQ0FBQyx1QkFBdUIsSUFBSSxDQUFDLHVCQUF1QixJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7b0JBQzVFLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksY0FBYyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRTt3QkFDOUUsUUFBUSxFQUFFLEVBQUUsVUFBVSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sRUFBRSxxQkFBcUIsRUFBRTt3QkFDNUUsVUFBVSxFQUFFLGlCQUFlLENBQUMsUUFBUTtxQkFDcEMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO29CQUNmLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO29CQUM1QixPQUFPLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDcEIsQ0FBQztxQkFBTSxJQUFJLHVCQUF1QixJQUFJLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixJQUFJLENBQUMsdUJBQXVCLENBQUMsRUFBRSxDQUFDO29CQUN4RyxtQkFBbUIsSUFBSSxDQUFDLENBQUM7Z0JBQzFCLENBQUM7cUJBQU0sSUFBSSx1QkFBdUIsSUFBSSxDQUFDLFFBQVEsSUFBSSx1QkFBdUIsQ0FBQyxFQUFFLENBQUM7b0JBQzdFLG1CQUFtQixJQUFJLENBQUMsQ0FBQztnQkFDMUIsQ0FBQztZQUNGLENBQUM7aUJBQU0sSUFBSSxVQUFVLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxLQUFLLEtBQUssQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDdEoseURBQXlEO2dCQUN6RCxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUU7b0JBQzlFLFFBQVEsRUFBRSxFQUFFLFVBQVUsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLEVBQUUscUJBQXFCLEVBQUU7b0JBQzVFLFVBQVUsRUFBRSxpQkFBZSxDQUFDLFFBQVE7aUJBQ3BDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFFZixJQUFJLGFBQWEsRUFBRSxDQUFDO29CQUNuQixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ25CLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztvQkFDNUIsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3BCLENBQUM7WUFDRixDQUFDO2lCQUFNLElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDLFlBQVksRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQzdFLG1CQUFtQixJQUFJLENBQUMsQ0FBQztZQUMxQixDQUFDO2lCQUFNLElBQUksTUFBTSxHQUFHLFFBQVEsQ0FBQyxVQUFVLEdBQUcsRUFBRSxFQUFFLENBQUM7Z0JBQzlDLGdEQUFnRDtnQkFDaEQsd0NBQXdDO2dCQUN4QyxPQUFPLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNwQixDQUFDO1lBQ0QscUJBQXFCLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0YsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksY0FBYyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRTtZQUN4RSxRQUFRLEVBQUUsRUFBRSxVQUFVLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxFQUFFLHFCQUFxQixFQUFFO1lBQzVFLFVBQVUsRUFBRSxpQkFBZSxDQUFDLFFBQVE7U0FDcEMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRWYsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUM5QixJQUFJLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7WUFDdkQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ25CLENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsWUFBWSxDQUFDO1FBQzFDLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztRQUN2RCxJQUFJLFlBQVksQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDOUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QyxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVNLElBQUk7UUFDVixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pELE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNsRCxJQUFJLENBQUMsT0FBTyxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFTSxVQUFVO1FBQ2hCLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsS0FBSyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDdkQsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUN4RCxDQUFDO1FBRUQsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztJQUN6RCxDQUFDO0lBRU8sNEJBQTRCLENBQUMsSUFBK0I7UUFDbkUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxZQUFZLEdBQUcsRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQzVCLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztRQUNqQyxJQUFJLENBQUMsWUFBWSxHQUFHLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDMUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFTyw4QkFBOEIsQ0FBQyxJQUErQjtRQUNyRSxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQzdCLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLGdCQUFnQixHQUFHLHNCQUFzQixDQUFDLFFBQVEsQ0FBQztZQUN2RCxXQUFXLEVBQUUscUNBQXFDO1lBQ2xELG9CQUFvQixFQUFFLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztZQUN0RCxXQUFXLEVBQUUsRUFBRSxRQUFRLEVBQUUsZUFBZSxDQUFDLElBQUksRUFBRTtZQUMvQyxVQUFVLDREQUFvRDtTQUM5RCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsNkJBQTZCO0lBQ3JCLG9CQUFvQjtRQUMzQixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQzlDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLG1CQUFtQixLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQzVDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDdEQsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLFNBQVMsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNuRixDQUFDO0lBQ0YsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFVBQWtCO1FBQzlDLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxRQUF5QyxFQUFFLEVBQUU7WUFDNUUsSUFBSSxDQUFDLG1CQUFtQixHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDbkgsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sdUJBQXVCLENBQUMsWUFBb0I7UUFDbkQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFFBQXlDLEVBQUUsRUFBRTtZQUM1RSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDeEMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLFNBQVMsQ0FBQztRQUN0QyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyx1QkFBdUIsQ0FBQyxZQUFvQixFQUFFLFVBQWtCO1FBQ3ZFLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxRQUF5QyxFQUFFLEVBQUU7WUFDNUUsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFlBQVksRUFBRSxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pGLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDdkUsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDOztBQTNZVyxlQUFlO0lBOER6QixXQUFBLGtCQUFrQixDQUFBO0dBOURSLGVBQWUsQ0E4WTNCIn0=