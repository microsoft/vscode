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
import { $, n } from '../../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from '../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableFromEvent, observableFromPromise, observableValue } from '../../../../../../../base/common/observable.js';
import { OS } from '../../../../../../../base/common/platform.js';
import { localize } from '../../../../../../../nls.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { editorHoverForeground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { contrastBorder } from '../../../../../../../platform/theme/common/colors/baseColors.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { Point } from '../../../../../../common/core/2d/point.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { StringReplacement } from '../../../../../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';
import { ILanguageService } from '../../../../../../common/languages/language.js';
import { LineTokens, TokenArray } from '../../../../../../common/tokens/lineTokens.js';
import { inlineSuggestCommitAlternativeActionId } from '../../../controller/commandIds.js';
import { InlineEditClickEvent } from '../inlineEditsViewInterface.js';
import { getEditorBackgroundColor, getModifiedBorderColor, getOriginalBorderColor, INLINE_EDITS_BORDER_RADIUS, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground, modifiedChangedTextOverlayColor, observeColor, originalChangedTextOverlayColor } from '../theme.js';
import { getEditorValidOverlayRect, mapOutFalsy, rectToProps } from '../utils/utils.js';
import { IUserInteractionService } from '../../../../../../../platform/userInteraction/browser/userInteractionService.js';
export class WordReplacementsViewData {
    constructor(edit, editorType, alternativeAction) {
        this.edit = edit;
        this.editorType = editorType;
        this.alternativeAction = alternativeAction;
    }
    equals(other) {
        return this.edit.equals(other.edit) && this.alternativeAction === other.alternativeAction;
    }
}
const BORDER_WIDTH = 1;
const DOM_ID_OVERLAY = 'word-replacement-view-overlay';
const DOM_ID_WIDGET = 'word-replacement-view-widget';
const DOM_ID_REPLACEMENT = 'word-replacement-view-replacement';
const DOM_ID_RENAME = 'word-replacement-view-rename';
let InlineEditsWordReplacementView = class InlineEditsWordReplacementView extends Disposable {
    static { this.MAX_LENGTH = 100; }
    constructor(_editor, _viewData, _tabAction, _languageService, _themeService, _keybindingService, _hoverService, _userInteractionService) {
        super();
        this._editor = _editor;
        this._viewData = _viewData;
        this._tabAction = _tabAction;
        this._languageService = _languageService;
        this._themeService = _themeService;
        this._keybindingService = _keybindingService;
        this._hoverService = _hoverService;
        this._userInteractionService = _userInteractionService;
        this._onDidClick = this._register(new Emitter());
        this.onDidClick = this._onDidClick.event;
        this._start = this._editor.observePosition(constObservable(this._viewData.edit.range.getStartPosition()), this._store);
        this._end = this._editor.observePosition(constObservable(this._viewData.edit.range.getEndPosition()), this._store);
        this._line = document.createElement('div');
        this._primaryElement = observableValue(this, null);
        this._secondaryElement = observableValue(this, null);
        this.isHovered = derived(this, reader => {
            const elem = this._primaryElement.read(reader);
            if (!elem) {
                return false;
            }
            return this._userInteractionService.createHoverTracker(elem.element, reader.store).read(reader);
        });
        this._renderTextEffect = derived(this, _reader => {
            const tm = this._editor.model.get();
            const origLine = tm.getLineContent(this._viewData.edit.range.startLineNumber);
            const edit = StringReplacement.replace(new OffsetRange(this._viewData.edit.range.startColumn - 1, this._viewData.edit.range.endColumn - 1), this._viewData.edit.text);
            const lineToTokenize = edit.replace(origLine);
            const t = tm.tokenization.tokenizeLinesAt(this._viewData.edit.range.startLineNumber, [lineToTokenize])?.[0];
            let tokens;
            if (t) {
                tokens = TokenArray.fromLineTokens(t).slice(edit.getRangeAfterReplace()).toLineTokens(this._viewData.edit.text, this._languageService.languageIdCodec);
            }
            else {
                tokens = LineTokens.createEmpty(this._viewData.edit.text, this._languageService.languageIdCodec);
            }
            const res = renderLines(new LineSource([tokens]), RenderOptions.fromEditor(this._editor.editor).withSetWidth(false).withScrollBeyondLastColumn(0), [], this._line, true);
            this._line.style.width = `${res.minWidthInPx}px`;
        });
        const modifiedLineHeight = this._editor.observeLineHeightForPosition(this._viewData.edit.range.getStartPosition());
        const altCount = observableFromPromise(this._viewData.alternativeAction?.count ?? new Promise(resolve => resolve(undefined))).map(c => c.value);
        const altModifierActive = derived(this, reader => this._userInteractionService.readModifierKeyStatus(this._editor.editor.getDomNode(), reader).shiftKey);
        this._layout = derived(this, reader => {
            this._renderTextEffect.read(reader);
            const widgetStart = this._start.read(reader);
            const widgetEnd = this._end.read(reader);
            // TODO@hediet better about widgetStart and widgetEnd in a single transaction!
            if (!widgetStart || !widgetEnd || widgetStart.x > widgetEnd.x || widgetStart.y > widgetEnd.y) {
                return undefined;
            }
            const lineHeight = modifiedLineHeight.read(reader);
            const scrollLeft = this._editor.scrollLeft.read(reader);
            const w = this._editor.getOption(59 /* EditorOption.fontInfo */).read(reader).typicalHalfwidthCharacterWidth;
            const modifiedLeftOffset = 3 * w;
            const modifiedTopOffset = 4;
            const modifiedOffset = new Point(modifiedLeftOffset, modifiedTopOffset);
            let alternativeAction = undefined;
            if (this._viewData.alternativeAction) {
                const label = this._viewData.alternativeAction.label;
                const count = altCount.read(reader);
                const active = altModifierActive.read(reader);
                const occurrencesLabel = count !== undefined ? count === 1 ?
                    localize('labelOccurence', "{0} 1 occurrence", label) :
                    localize('labelOccurences', "{0} {1} occurrences", label, count)
                    : label;
                const keybindingTooltip = localize('shiftToSeeOccurences', "{0} show occurrences", '[shift]');
                alternativeAction = {
                    label: count !== undefined ? (active ? occurrencesLabel : label) : label,
                    tooltip: occurrencesLabel ? `${occurrencesLabel}\n${keybindingTooltip}` : undefined,
                    icon: undefined, //this._viewData.alternativeAction.icon, Do not render icon fo the moment
                    count,
                    keybinding: this._keybindingService.lookupKeybinding(inlineSuggestCommitAlternativeActionId),
                    active: altModifierActive,
                };
            }
            const originalLine = Rect.fromPoints(widgetStart, widgetEnd).withHeight(lineHeight).translateX(-scrollLeft);
            const codeLine = Rect.fromPointSize(originalLine.getLeftBottom().add(modifiedOffset), new Point(this._viewData.edit.text.length * w, originalLine.height));
            const modifiedLine = codeLine.withWidth(codeLine.width + (alternativeAction ? alternativeAction.label.length * w + 8 + 4 + 12 : 0));
            const lowerBackground = modifiedLine.withLeft(originalLine.left);
            // debugView(debugLogRects({ lowerBackground }, this._editor.editor.getContainerDomNode()), reader);
            return {
                alternativeAction,
                originalLine,
                codeLine,
                modifiedLine,
                lowerBackground,
                lineHeight,
            };
        });
        this.minEditorScrollHeight = derived(this, reader => {
            const layout = mapOutFalsy(this._layout).read(reader);
            if (!layout) {
                return 0;
            }
            return layout.read(reader).modifiedLine.bottom + BORDER_WIDTH + this._editor.editor.getScrollTop();
        });
        this._root = n.div({
            class: 'word-replacement',
        }, [
            derived(this, reader => {
                const layout = mapOutFalsy(this._layout).read(reader);
                if (!layout) {
                    return [];
                }
                const originalBorderColor = getOriginalBorderColor(this._tabAction).map(c => asCssVariable(c)).read(reader);
                const modifiedBorderColor = getModifiedBorderColor(this._tabAction).map(c => asCssVariable(c)).read(reader);
                this._line.style.lineHeight = `${layout.read(reader).modifiedLine.height + 2 * BORDER_WIDTH}px`;
                const secondaryElementHovered = constObservable(false); //this._secondaryElement.map((e, r) => e?.isHovered.read(r) ?? false);
                const alternativeAction = layout.map(l => l.alternativeAction);
                const alternativeActionActive = derived(reader => (alternativeAction.read(reader)?.active.read(reader) ?? false) || secondaryElementHovered.read(reader));
                const isHighContrast = observableFromEvent(this._themeService.onDidColorThemeChange, () => {
                    const theme = this._themeService.getColorTheme();
                    return theme.type === 'hcDark' || theme.type === 'hcLight';
                }).read(reader);
                const hcBorderColor = isHighContrast ? observeColor(contrastBorder, this._themeService).read(reader) : null;
                const primaryActiveStyles = {
                    borderColor: hcBorderColor ? hcBorderColor.toString() : modifiedBorderColor,
                    backgroundColor: asCssVariable(modifiedChangedTextOverlayColor),
                    color: '',
                    opacity: '1',
                };
                const secondaryActiveStyles = {
                    borderColor: hcBorderColor ? hcBorderColor.toString() : asCssVariable(inlineEditIndicatorPrimaryBorder),
                    backgroundColor: asCssVariable(inlineEditIndicatorPrimaryBackground),
                    color: asCssVariable(inlineEditIndicatorPrimaryForeground),
                    opacity: '1',
                };
                const passiveStyles = {
                    borderColor: hcBorderColor ? hcBorderColor.toString() : observeColor(editorHoverForeground, this._themeService).map(c => c.transparent(0.2).toString()).read(reader),
                    backgroundColor: getEditorBackgroundColor(this._viewData.editorType),
                    color: '',
                    opacity: '0.7',
                };
                const editorBackground = getEditorBackgroundColor(this._viewData.editorType);
                const primaryActionStyles = derived(this, r => alternativeActionActive.read(r) ? primaryActiveStyles : primaryActiveStyles);
                const secondaryActionStyles = derived(this, r => alternativeActionActive.read(r) ? secondaryActiveStyles : passiveStyles);
                // TODO@benibenj clicking the arrow does not accept suggestion anymore
                return [
                    n.div({
                        id: DOM_ID_OVERLAY,
                        style: {
                            position: 'absolute',
                            ...rectToProps((r) => getEditorValidOverlayRect(this._editor).read(r)),
                            overflow: 'hidden',
                            pointerEvents: 'none',
                        }
                    }, [
                        n.div({
                            style: {
                                position: 'absolute',
                                ...rectToProps(reader => layout.read(reader).lowerBackground.withMargin(BORDER_WIDTH, 2 * BORDER_WIDTH, BORDER_WIDTH, 0)),
                                background: editorBackground,
                                cursor: 'pointer',
                                pointerEvents: 'auto',
                            },
                            onmousedown: (e) => this._mouseDown(e),
                        }),
                        n.div({
                            id: DOM_ID_WIDGET,
                            style: {
                                position: 'absolute',
                                ...rectToProps(reader => layout.read(reader).modifiedLine.withMargin(BORDER_WIDTH, 2 * BORDER_WIDTH)),
                                width: undefined,
                                pointerEvents: 'auto',
                                boxSizing: 'border-box',
                                borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                                background: editorBackground,
                                display: 'flex',
                                justifyContent: 'left',
                                outline: `2px solid ${editorBackground}`,
                            },
                            onmousedown: (e) => this._mouseDown(e),
                        }, [
                            n.div({
                                id: DOM_ID_REPLACEMENT,
                                style: {
                                    fontFamily: this._editor.getOption(58 /* EditorOption.fontFamily */),
                                    fontSize: this._editor.getOption(61 /* EditorOption.fontSize */),
                                    fontWeight: this._editor.getOption(62 /* EditorOption.fontWeight */),
                                    width: rectToProps(reader => layout.read(reader).codeLine.withMargin(BORDER_WIDTH, 2 * BORDER_WIDTH)).width,
                                    borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                                    border: primaryActionStyles.map(s => `${BORDER_WIDTH}px solid ${s.borderColor}`),
                                    boxSizing: 'border-box',
                                    padding: `${BORDER_WIDTH}px`,
                                    opacity: primaryActionStyles.map(s => s.opacity),
                                    background: primaryActionStyles.map(s => s.backgroundColor),
                                    display: 'flex',
                                    justifyContent: 'left',
                                    alignItems: 'center',
                                    pointerEvents: 'auto',
                                    cursor: 'pointer',
                                },
                                obsRef: (elem) => {
                                    this._primaryElement.set(elem, undefined);
                                }
                            }, [this._line]),
                            derived(this, reader => {
                                const altAction = alternativeAction.read(reader);
                                if (!altAction) {
                                    return undefined;
                                }
                                const keybinding = document.createElement('div');
                                const keybindingLabel = reader.store.add(new KeybindingLabel(keybinding, OS, { ...unthemedKeybindingLabelOptions, disableTitle: true }));
                                keybindingLabel.set(altAction.keybinding);
                                return n.div({
                                    id: DOM_ID_RENAME,
                                    style: {
                                        position: 'relative',
                                        borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                                        borderTop: `${BORDER_WIDTH}px solid`,
                                        borderRight: `${BORDER_WIDTH}px solid`,
                                        borderBottom: `${BORDER_WIDTH}px solid`,
                                        borderLeft: `${BORDER_WIDTH}px solid`,
                                        borderColor: secondaryActionStyles.map(s => s.borderColor),
                                        opacity: secondaryActionStyles.map(s => s.opacity),
                                        color: secondaryActionStyles.map(s => s.color),
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        padding: '0 4px 0 1px',
                                        marginLeft: '4px',
                                        background: secondaryActionStyles.map(s => s.backgroundColor),
                                        cursor: 'pointer',
                                        textWrap: 'nowrap',
                                    },
                                    class: 'inline-edit-alternative-action-label',
                                    obsRef: (elem) => {
                                        this._secondaryElement.set(elem, undefined);
                                    },
                                    ref: (elem) => {
                                        if (altAction.tooltip) {
                                            reader.store.add(this._hoverService.setupDelayedHoverAtMouse(elem, { content: altAction.tooltip, appearance: { compact: true } }));
                                        }
                                    }
                                }, [
                                    keybinding,
                                    $('div.inline-edit-alternative-action-label-separator'),
                                    altAction.icon ? renderIcon(altAction.icon) : undefined,
                                    altAction.label,
                                ]);
                            })
                        ]),
                        n.div({
                            style: {
                                position: 'absolute',
                                ...rectToProps(reader => layout.read(reader).originalLine.withMargin(BORDER_WIDTH)),
                                boxSizing: 'border-box',
                                borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                                border: `${BORDER_WIDTH}px solid ${originalBorderColor}`,
                                background: asCssVariable(originalChangedTextOverlayColor),
                                pointerEvents: 'none',
                            }
                        }, []),
                        n.svg({
                            width: 11,
                            height: 14,
                            viewBox: '0 0 11 14',
                            fill: 'none',
                            style: {
                                position: 'absolute',
                                left: layout.map(l => l.modifiedLine.left - 16),
                                top: layout.map(l => l.modifiedLine.top + Math.round((l.lineHeight - 14 - 5) / 2)),
                                pointerEvents: 'none',
                            },
                            onmousedown: (e) => this._mouseDown(e),
                        }, [
                            n.svgElem('path', {
                                d: 'M1 0C1 2.98966 1 5.92087 1 8.49952C1 9.60409 1.89543 10.5 3 10.5H10.5',
                                stroke: asCssVariable(editorHoverForeground),
                            }),
                            n.svgElem('path', {
                                d: 'M6 7.5L9.99999 10.49998L6 13.5',
                                stroke: asCssVariable(editorHoverForeground),
                            })
                        ]),
                    ])
                ];
            })
        ]).keepUpdated(this._store);
        this._register(this._editor.createOverlayWidget({
            domNode: this._root.element,
            minContentWidthInPx: constObservable(0),
            position: constObservable({ preference: { top: 0, left: 0 } }),
            allowEditorOverflow: false,
        }));
    }
    _mouseDown(e) {
        const target_id = traverseParentsUntilId(e.target, new Set([DOM_ID_WIDGET, DOM_ID_REPLACEMENT, DOM_ID_RENAME, DOM_ID_OVERLAY]));
        if (!target_id) {
            return;
        }
        e.preventDefault(); // This prevents that the editor loses focus
        this._onDidClick.fire(InlineEditClickEvent.create(e, target_id === DOM_ID_RENAME));
    }
};
InlineEditsWordReplacementView = __decorate([
    __param(3, ILanguageService),
    __param(4, IThemeService),
    __param(5, IKeybindingService),
    __param(6, IHoverService),
    __param(7, IUserInteractionService)
], InlineEditsWordReplacementView);
export { InlineEditsWordReplacementView };
function traverseParentsUntilId(element, ids) {
    let current = element;
    while (current) {
        if (ids.has(current.id)) {
            return current.id;
        }
        current = current.parentElement;
    }
    return null;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lRWRpdHNXb3JkUmVwbGFjZW1lbnRWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZUVkaXRzL2lubGluZUVkaXRzVmlld3MvaW5saW5lRWRpdHNXb3JkUmVwbGFjZW1lbnRWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUEyQixNQUFNLDBDQUEwQyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsZUFBZSxFQUFFLDhCQUE4QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFFMUksT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxtQkFBbUIsRUFBRSxxQkFBcUIsRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNwSyxPQUFPLEVBQUUsRUFBRSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDakcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFN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