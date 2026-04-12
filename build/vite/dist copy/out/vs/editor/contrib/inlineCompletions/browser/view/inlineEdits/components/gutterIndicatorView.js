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
import { n } from '../../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { BugIndicatingError } from '../../../../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, debouncedObservable, derived, observableFromEvent, observableValue, runOnChange } from '../../../../../../../base/common/observable.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { Point } from '../../../../../../common/core/2d/point.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';
import { StickyScrollController } from '../../../../../stickyScroll/browser/stickyScrollController.js';
import { InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { getEditorBlendedColor, INLINE_EDITS_BORDER_RADIUS, inlineEditIndicatorBackground, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorSecondaryBorder, inlineEditIndicatorSecondaryForeground, inlineEditIndicatorSuccessfulBackground, inlineEditIndicatorSuccessfulBorder, inlineEditIndicatorSuccessfulForeground } from '../theme.js';
import { mapOutFalsy, rectToProps } from '../utils/utils.js';
import { GutterIndicatorMenuContent } from './gutterIndicatorMenu.js';
import { assertNever } from '../../../../../../../base/common/assert.js';
import { localize } from '../../../../../../../nls.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { IUserInteractionService } from '../../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { Emitter } from '../../../../../../../base/common/event.js';
export class InlineEditsGutterIndicatorData {
    constructor(gutterMenuData, originalRange, model, altAction, customization) {
        this.gutterMenuData = gutterMenuData;
        this.originalRange = originalRange;
        this.model = model;
        this.altAction = altAction;
        this.customization = customization;
    }
}
export class InlineSuggestionGutterMenuData {
    static fromInlineSuggestion(suggestion) {
        const alternativeAction = suggestion.action?.kind === 'edit' ? suggestion.action.alternativeAction : undefined;
        const commands = suggestion.source.inlineSuggestions.commands ?? [];
        return new InlineSuggestionGutterMenuData(suggestion.gutterMenuLinkAction, suggestion.source.provider.displayName ?? localize('inlineSuggestion', "Inline Suggestion"), commands.length > 0 ? [commands] : [], alternativeAction, suggestion.source.provider.modelInfo, suggestion.source.provider.setModelId?.bind(suggestion.source.provider));
    }
    constructor(action, displayName, extensionCommands, alternativeAction, modelInfo, setModelId, extensionCommandsOnly = false) {
        this.action = action;
        this.displayName = displayName;
        this.extensionCommands = extensionCommands;
        this.alternativeAction = alternativeAction;
        this.modelInfo = modelInfo;
        this.setModelId = setModelId;
        this.extensionCommandsOnly = extensionCommandsOnly;
    }
}
// TODO this class does not make that much sense yet.
export class SimpleInlineSuggestModel {
    static fromInlineCompletionModel(model) {
        return new SimpleInlineSuggestModel(() => model.accept(), () => model.jump());
    }
    constructor(accept, jump) {
        this.accept = accept;
        this.jump = jump;
    }
}
const CODICON_SIZE_PX = 16;
const CODICON_PADDING_PX = 2;
let InlineEditsGutterIndicator = class InlineEditsGutterIndicator extends Disposable {
    constructor(_editorObs, _data, _tabAction, _verticalOffset, _isHoveringOverInlineEdit, _focusIsInMenu, _hoverService, _instantiationService, _accessibilityService, _themeService, _userInteractionService) {
        super();
        this._editorObs = _editorObs;
        this._data = _data;
        this._tabAction = _tabAction;
        this._verticalOffset = _verticalOffset;
        this._isHoveringOverInlineEdit = _isHoveringOverInlineEdit;
        this._focusIsInMenu = _focusIsInMenu;
        this._hoverService = _hoverService;
        this._instantiationService = _instantiationService;
        this._accessibilityService = _accessibilityService;
        this._themeService = _themeService;
        this._userInteractionService = _userInteractionService;
        this._onDidCloseWithCommand = this._register(new Emitter());
        this.onDidCloseWithCommand = this._onDidCloseWithCommand.event;
        this._modifierPressed = derived(this, reader => this._userInteractionService.readModifierKeyStatus(this._editorObs.editor.getDomNode(), reader).shiftKey);
        this._gutterIndicatorStyles = derived(this, reader => {
            let v = this._tabAction.read(reader);
            // TODO: add source of truth for alt action active and key pressed
            const altAction = this._data.read(reader)?.altAction;
            const modifiedPressed = this._modifierPressed.read(reader);
            if (altAction && modifiedPressed) {
                v = InlineEditTabAction.Inactive;
            }
            switch (v) {
                case InlineEditTabAction.Inactive: return {
                    background: getEditorBlendedColor(inlineEditIndicatorSecondaryBackground, this._themeService).read(reader).toString(),
                    foreground: getEditorBlendedColor(inlineEditIndicatorSecondaryForeground, this._themeService).read(reader).toString(),
                    border: getEditorBlendedColor(inlineEditIndicatorSecondaryBorder, this._themeService).read(reader).toString(),
                };
                case InlineEditTabAction.Jump: return {
                    background: getEditorBlendedColor(inlineEditIndicatorPrimaryBackground, this._themeService).read(reader).toString(),
                    foreground: getEditorBlendedColor(inlineEditIndicatorPrimaryForeground, this._themeService).read(reader).toString(),
                    border: getEditorBlendedColor(inlineEditIndicatorPrimaryBorder, this._themeService).read(reader).toString()
                };
                case InlineEditTabAction.Accept: return {
                    background: getEditorBlendedColor(inlineEditIndicatorSuccessfulBackground, this._themeService).read(reader).toString(),
                    foreground: getEditorBlendedColor(inlineEditIndicatorSuccessfulForeground, this._themeService).read(reader).toString(),
                    border: getEditorBlendedColor(inlineEditIndicatorSuccessfulBorder, this._themeService).read(reader).toString()
                };
                default:
                    assertNever(v);
            }
        });
        this._state = derived(this, reader => {
            const range = this._originalRangeObs.read(reader);
            if (!range) {
                return undefined;
            }
            return {
                range,
                lineOffsetRange: this._editorObs.observeLineOffsetRange(range, reader.store),
            };
        });
        this._lineNumberToRender = derived(this, reader => {
            if (this._verticalOffset.read(reader) !== 0) {
                return '';
            }
            const lineNumber = this._data.read(reader)?.originalRange.startLineNumber;
            const lineNumberOptions = this._editorObs.getOption(76 /* EditorOption.lineNumbers */).read(reader);
            if (lineNumber === undefined || lineNumberOptions.renderType === 0 /* RenderLineNumbersType.Off */) {
                return '';
            }
            if (lineNumberOptions.renderType === 3 /* RenderLineNumbersType.Interval */) {
                const cursorPosition = this._editorObs.cursorPosition.read(reader);
                if (lineNumber % 10 === 0 || cursorPosition && cursorPosition.lineNumber === lineNumber) {
                    return lineNumber.toString();
                }
                return '';
            }
            if (lineNumberOptions.renderType === 2 /* RenderLineNumbersType.Relative */) {
                const cursorPosition = this._editorObs.cursorPosition.read(reader);
                if (!cursorPosition) {
                    return '';
                }
                const relativeLineNumber = Math.abs(lineNumber - cursorPosition.lineNumber);
                if (relativeLineNumber === 0) {
                    return lineNumber.toString();
                }
                return relativeLineNumber.toString();
            }
            if (lineNumberOptions.renderType === 4 /* RenderLineNumbersType.Custom */) {
                if (lineNumberOptions.renderFn) {
                    return lineNumberOptions.renderFn(lineNumber);
                }
                return '';
            }
            return lineNumber.toString();
        });
        this._availableWidthForIcon = derived(this, reader => {
            const textModel = this._editorObs.editor.getModel();
            const editor = this._editorObs.editor;
            const layout = this._editorObs.layoutInfo.read(reader);
            const gutterWidth = layout.decorationsLeft + layout.decorationsWidth - layout.glyphMarginLeft;
            if (!textModel || gutterWidth <= 0) {
                return () => 0;
            }
            // no glyph margin => the entire gutter width is available as there is no optimal place to put the icon
            if (layout.lineNumbersLeft === 0) {
                return () => gutterWidth;
            }
            const lineNumberOptions = this._editorObs.getOption(76 /* EditorOption.lineNumbers */).read(reader);
            if (lineNumberOptions.renderType === 2 /* RenderLineNumbersType.Relative */ || /* likely to flicker */
                lineNumberOptions.renderType === 0 /* RenderLineNumbersType.Off */) {
                return () => gutterWidth;
            }
            const w = editor.getOption(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth;
            const rightOfLineNumber = layout.lineNumbersLeft + layout.lineNumbersWidth;
            const totalLines = textModel.getLineCount();
            const totalLinesDigits = (totalLines + 1 /* 0 based to 1 based*/).toString().length;
            const offsetDigits = [];
            // We only need to pre compute the usable width left of the line number for the first line number with a given digit count
            for (let digits = 1; digits <= totalLinesDigits; digits++) {
                const firstLineNumberWithDigitCount = 10 ** (digits - 1);
                const topOfLineNumber = editor.getTopForLineNumber(firstLineNumberWithDigitCount);
                const digitsWidth = digits * w;
                const usableWidthLeftOfLineNumber = Math.min(gutterWidth, Math.max(0, rightOfLineNumber - digitsWidth - layout.glyphMarginLeft));
                offsetDigits.push({ firstLineNumberWithDigitCount, topOfLineNumber, usableWidthLeftOfLineNumber });
            }
            return (topOffset) => {
                for (let i = offsetDigits.length - 1; i >= 0; i--) {
                    if (topOffset >= offsetDigits[i].topOfLineNumber) {
                        return offsetDigits[i].usableWidthLeftOfLineNumber;
                    }
                }
                throw new BugIndicatingError('Could not find avilable width for icon');
            };
        });
        this._layout = derived(this, reader => {
            const s = this._state.read(reader);
            if (!s) {
                return undefined;
            }
            const layout = this._editorObs.layoutInfo.read(reader);
            const lineHeight = this._editorObs.observeLineHeightForLine(s.range.map(r => r.startLineNumber)).read(reader);
            const gutterViewPortPaddingLeft = 1;
            const gutterViewPortPaddingTop = 2;
            // Entire gutter view from top left to bottom right
            const gutterWidthWithoutPadding = layout.decorationsLeft + layout.decorationsWidth - layout.glyphMarginLeft - 2 * gutterViewPortPaddingLeft;
            const gutterHeightWithoutPadding = layout.height - 2 * gutterViewPortPaddingTop;
            const gutterViewPortWithStickyScroll = Rect.fromLeftTopWidthHeight(gutterViewPortPaddingLeft, gutterViewPortPaddingTop, gutterWidthWithoutPadding, gutterHeightWithoutPadding);
            const gutterViewPortWithoutStickyScrollWithoutPaddingTop = gutterViewPortWithStickyScroll.withTop(this._stickyScrollHeight.read(reader));
            const gutterViewPortWithoutStickyScroll = gutterViewPortWithStickyScroll.withTop(gutterViewPortWithoutStickyScrollWithoutPaddingTop.top + gutterViewPortPaddingTop);
            // The glyph margin area across all relevant lines
            const verticalEditRange = s.lineOffsetRange.read(reader);
            const gutterEditArea = Rect.fromRanges(OffsetRange.fromTo(gutterViewPortWithoutStickyScroll.left, gutterViewPortWithoutStickyScroll.right), verticalEditRange);
            // The gutter view container (pill)
            const pillHeight = lineHeight;
            const pillOffset = this._verticalOffset.read(reader);
            const pillFullyDockedRect = gutterEditArea.withHeight(pillHeight).translateY(pillOffset);
            const pillIsFullyDocked = gutterViewPortWithoutStickyScrollWithoutPaddingTop.containsRect(pillFullyDockedRect);
            // The icon which will be rendered in the pill
            const customIcon = this._data.read(reader)?.customization?.icon;
            const iconNoneDocked = customIcon
                ? constObservable(customIcon)
                : this._tabAction.map(action => action === InlineEditTabAction.Accept ? Codicon.keyboardTab : Codicon.arrowRight);
            const iconDocked = customIcon
                ? constObservable(customIcon)
                : derived(this, reader => {
                    if (this._isHoveredOverIconDebounced.read(reader) || this._isHoveredOverInlineEditDebounced.read(reader)) {
                        return Codicon.check;
                    }
                    if (this._tabAction.read(reader) === InlineEditTabAction.Accept) {
                        return Codicon.keyboardTab;
                    }
                    const cursorLineNumber = this._editorObs.cursorLineNumber.read(reader) ?? 0;
                    const editStartLineNumber = s.range.read(reader).startLineNumber;
                    return cursorLineNumber <= editStartLineNumber ? Codicon.keyboardTabAbove : Codicon.keyboardTabBelow;
                });
            const idealIconAreaWidth = 22;
            const iconWidth = (pillRect) => {
                const availableIconAreaWidth = this._availableWidthForIcon.read(undefined)(pillRect.bottom + this._editorObs.editor.getScrollTop()) - gutterViewPortPaddingLeft;
                return Math.max(Math.min(availableIconAreaWidth, idealIconAreaWidth), CODICON_SIZE_PX);
            };
            if (pillIsFullyDocked) {
                const pillRect = pillFullyDockedRect;
                let widthUntilLineNumberEnd;
                if (layout.lineNumbersWidth === 0) {
                    widthUntilLineNumberEnd = Math.max(0, Math.min(Math.max(layout.lineNumbersLeft - gutterViewPortWithStickyScroll.left, 0), pillRect.width - idealIconAreaWidth));
                }
                else {
                    widthUntilLineNumberEnd = Math.max(layout.lineNumbersLeft + layout.lineNumbersWidth - gutterViewPortWithStickyScroll.left, 0);
                }
                const lineNumberRect = pillRect.withWidth(widthUntilLineNumberEnd);
                const minimalIconWidthWithPadding = CODICON_SIZE_PX + CODICON_PADDING_PX;
                const iconWidth = Math.min(pillRect.width - widthUntilLineNumberEnd, idealIconAreaWidth);
                const iconRect = pillRect.withWidth(Math.max(iconWidth, minimalIconWidthWithPadding)).translateX(widthUntilLineNumberEnd);
                const iconVisible = iconWidth >= minimalIconWidthWithPadding;
                return {
                    gutterEditArea,
                    icon: iconDocked,
                    iconDirection: 'right',
                    iconRect,
                    iconVisible,
                    pillRect,
                    lineNumberRect,
                };
            }
            const pillPartiallyDockedPossibleArea = gutterViewPortWithStickyScroll.intersect(gutterEditArea); // The area in which the pill could be partially docked
            const pillIsPartiallyDocked = pillPartiallyDockedPossibleArea && pillPartiallyDockedPossibleArea.height >= pillHeight;
            if (pillIsPartiallyDocked) {
                // pillFullyDockedRect is outside viewport, move it into the viewport under sticky scroll as we prefer the pill to not be on top of the sticky scroll
                // then move it into the possible area which will only cause it to move if it has to be rendered on top of the sticky scroll
                const pillRectMoved = pillFullyDockedRect.moveToBeContainedIn(gutterViewPortWithoutStickyScroll).moveToBeContainedIn(pillPartiallyDockedPossibleArea);
                const pillRect = pillRectMoved.withWidth(iconWidth(pillRectMoved));
                const iconRect = pillRect;
                return {
                    gutterEditArea,
                    icon: iconDocked,
                    iconDirection: 'right',
                    iconRect,
                    pillRect,
                    iconVisible: true,
                };
            }
            // pillFullyDockedRect is outside viewport, so move it into viewport
            const pillRectMoved = pillFullyDockedRect.moveToBeContainedIn(gutterViewPortWithStickyScroll);
            const pillRect = pillRectMoved.withWidth(iconWidth(pillRectMoved));
            const iconRect = pillRect;
            // docked = pill was already in the viewport
            const iconDirection = pillRect.top < pillFullyDockedRect.top ?
                'top' :
                'bottom';
            return {
                gutterEditArea,
                icon: iconNoneDocked,
                iconDirection,
                iconRect,
                pillRect,
                iconVisible: true,
            };
        });
        this._iconRef = n.ref();
        this.isVisible = this._layout.map(l => !!l);
        this._hoverVisible = observableValue(this, false);
        this.isHoverVisible = this._hoverVisible;
        this._isHoveredOverIcon = observableValue(this, false);
        this._isHoveredOverIconDebounced = debouncedObservable(this._isHoveredOverIcon, 100);
        this.isHoveredOverIcon = this._isHoveredOverIconDebounced;
        this._indicator = n.div({
            class: 'inline-edits-view-gutter-indicator',
            style: {
                position: 'absolute',
                overflow: 'visible',
            },
        }, mapOutFalsy(this._layout).map(layout => !layout ? [] : [
            n.div({
                style: {
                    position: 'absolute',
                    background: asCssVariable(inlineEditIndicatorBackground),
                    borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                    ...rectToProps(reader => layout.read(reader).gutterEditArea),
                }
            }),
            n.div({
                class: 'icon',
                ref: this._iconRef,
                tabIndex: 0,
                onclick: () => {
                    const layout = this._layout.get();
                    const acceptOnClick = layout?.icon.get() === Codicon.check;
                    const data = this._data.get();
                    if (!data) {
                        throw new BugIndicatingError('Gutter indicator data not available');
                    }
                    this._editorObs.editor.focus();
                    if (acceptOnClick) {
                        data.model.accept();
                    }
                    else {
                        data.model.jump();
                    }
                },
                onmouseenter: () => {
                    // TODO show hover when hovering ghost text etc.
                    this._showHover();
                },
                style: {
                    cursor: 'pointer',
                    zIndex: '20',
                    position: 'absolute',
                    backgroundColor: this._gutterIndicatorStyles.map(v => v.background),
                    // eslint-disable-next-line local/code-no-any-casts
                    ['--vscodeIconForeground']: this._gutterIndicatorStyles.map(v => v.foreground),
                    border: this._gutterIndicatorStyles.map(v => `1px solid ${v.border}`),
                    boxSizing: 'border-box',
                    borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                    display: 'flex',
                    justifyContent: layout.map(l => l.iconDirection === 'bottom' ? 'flex-start' : 'flex-end'),
                    transition: this._modifierPressed.map(m => m ? '' : 'background-color 0.2s ease-in-out, width 0.2s ease-in-out'),
                    ...rectToProps(reader => layout.read(reader).pillRect),
                }
            }, [
                n.div({
                    className: 'line-number',
                    style: {
                        lineHeight: layout.map(l => l.lineNumberRect ? l.lineNumberRect.height : 0),
                        display: layout.map(l => l.lineNumberRect ? 'flex' : 'none'),
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        width: layout.map(l => l.lineNumberRect ? l.lineNumberRect.width : 0),
                        height: '100%',
                        color: this._gutterIndicatorStyles.map(v => v.foreground),
                    }
                }, this._lineNumberToRender),
                n.div({
                    style: {
                        transform: layout.map(l => `rotate(${getRotationFromDirection(l.iconDirection)}deg)`),
                        transition: 'rotate 0.2s ease-in-out, opacity 0.2s ease-in-out',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        opacity: layout.map(l => l.iconVisible ? '1' : '0'),
                        marginRight: layout.map(l => l.pillRect.width - l.iconRect.width - (l.lineNumberRect?.width ?? 0)),
                        width: layout.map(l => l.iconRect.width),
                        position: 'relative',
                        right: layout.map(l => l.iconDirection === 'top' ? '1px' : '0'),
                        color: this._data.map(d => d?.customization?.icon?.color ? asCssVariable(d.customization.icon.color.id) : undefined),
                    }
                }, [
                    layout.map((l, reader) => withStyles(renderIcon(l.icon.read(reader)), { fontSize: toPx(Math.min(l.iconRect.width - CODICON_PADDING_PX, CODICON_SIZE_PX)) })),
                ])
            ]),
        ]));
        this._originalRangeObs = mapOutFalsy(this._data.map(d => d?.originalRange));
        this._stickyScrollController = StickyScrollController.get(this._editorObs.editor);
        this._stickyScrollHeight = this._stickyScrollController
            ? observableFromEvent(this._stickyScrollController.onDidChangeStickyScrollHeight, () => this._stickyScrollController.stickyScrollWidgetHeight)
            : constObservable(0);
        const indicator = this._indicator.keepUpdated(this._store);
        this._register(this._editorObs.createOverlayWidget({
            domNode: indicator.element,
            position: constObservable(null),
            allowEditorOverflow: false,
            minContentWidthInPx: constObservable(0),
        }));
        this._register(this._editorObs.editor.onMouseMove((e) => {
            const state = this._state.get();
            if (state === undefined) {
                return;
            }
            const el = this._iconRef.element;
            const rect = el.getBoundingClientRect();
            const rectangularArea = Rect.fromLeftTopWidthHeight(rect.left, rect.top, rect.width, rect.height);
            const point = new Point(e.event.posx, e.event.posy);
            this._isHoveredOverIcon.set(rectangularArea.containsPoint(point), undefined);
        }));
        this._register(this._editorObs.editor.onDidScrollChange(() => {
            this._isHoveredOverIcon.set(false, undefined);
        }));
        this._isHoveredOverInlineEditDebounced = debouncedObservable(this._isHoveringOverInlineEdit, 100);
        // pulse animation when hovering inline edit
        this._register(runOnChange(this._isHoveredOverInlineEditDebounced, (isHovering) => {
            if (isHovering) {
                this.triggerAnimation();
            }
        }));
        this._register(autorun(reader => {
            indicator.readEffect(reader);
            if (indicator.element) {
                // For the line number
                this._editorObs.editor.applyFontInfo(indicator.element);
            }
        }));
    }
    triggerAnimation() {
        if (this._accessibilityService.isMotionReduced()) {
            return new Animation(null, null).finished;
        }
        // PULSE ANIMATION:
        const animation = this._iconRef.element.animate([
            {
                outline: `2px solid ${this._gutterIndicatorStyles.map(v => v.border).get()}`,
                outlineOffset: '-1px',
                offset: 0
            },
            {
                outline: `2px solid transparent`,
                outlineOffset: '10px',
                offset: 1
            },
        ], { duration: 500 });
        return animation.finished;
    }
    _showHover() {
        if (this._hoverVisible.get()) {
            return;
        }
        const data = this._data.get();
        if (!data) {
            throw new BugIndicatingError('Gutter indicator data not available');
        }
        const disposableStore = new DisposableStore();
        const content = disposableStore.add(this._instantiationService.createInstance(GutterIndicatorMenuContent, this._editorObs, data.gutterMenuData, (focusEditor, commandId) => {
            if (focusEditor) {
                this._editorObs.editor.focus();
            }
            if (commandId) {
                this._onDidCloseWithCommand.fire(commandId);
            }
            h?.dispose();
        }).toDisposableLiveElement());
        const isFocused = this._userInteractionService.createFocusTracker(content.element, disposableStore); // TODO@benibenj should this be removed?
        disposableStore.add(autorun(reader => {
            this._focusIsInMenu.set(isFocused.read(reader), undefined);
        }));
        disposableStore.add(toDisposable(() => this._focusIsInMenu.set(false, undefined)));
        const h = this._hoverService.showInstantHover({
            target: this._iconRef.element,
            content: content.element,
        });
        if (h) {
            this._hoverVisible.set(true, undefined);
            disposableStore.add(this._editorObs.editor.onDidScrollChange(() => h.dispose()));
            disposableStore.add(h.onDispose(() => {
                this._hoverVisible.set(false, undefined);
                disposableStore.dispose();
            }));
        }
        else {
            disposableStore.dispose();
        }
    }
};
InlineEditsGutterIndicator = __decorate([
    __param(6, IHoverService),
    __param(7, IInstantiationService),
    __param(8, IAccessibilityService),
    __param(9, IThemeService),
    __param(10, IUserInteractionService)
], InlineEditsGutterIndicator);
export { InlineEditsGutterIndicator };
function getRotationFromDirection(direction) {
    switch (direction) {
        case 'top': return 90;
        case 'bottom': return -90;
        case 'right': return 0;
    }
}
function withStyles(element, styles) {
    for (const key in styles) {
        // eslint-disable-next-line local/code-no-any-casts
        element.style[key] = styles[key];
    }
    return element;
}
function toPx(n) {
    return `${n}px`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3V0dGVySW5kaWNhdG9yVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9jb21wb25lbnRzL2d1dHRlckluZGljYXRvclZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDaEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDMUcsT0FBTyxFQUFvQyxPQUFPLEVBQUUsZUFBZSxFQUFFLG1CQUFtQixFQUFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDN00sT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzVHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUczRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbEUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBS2hFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxREFBcUQs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