/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, ModifierKeyEmitter, n, ObserverNodeWithElement } from '../../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from '../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { IEquatable } from '../../../../../../../base/common/equals.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableFromEvent, observableFromPromise, observableValue } from '../../../../../../../base/common/observable.js';
import { OS } from '../../../../../../../base/common/platform.js';
import { localize } from '../../../../../../../nls.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { editorHoverForeground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { contrastBorder } from '../../../../../../../platform/theme/common/colors/baseColors.js';
import { asCssVariable } from '../../../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { Point } from '../../../../../../common/core/2d/point.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { StringReplacement } from '../../../../../../common/core/edits/stringEdit.js';
import { TextReplacement } from '../../../../../../common/core/edits/textEdit.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';
import { ILanguageService } from '../../../../../../common/languages/language.js';
import { LineTokens, TokenArray } from '../../../../../../common/tokens/lineTokens.js';
import { inlineSuggestCommitAlternativeActionId } from '../../../controller/commandIds.js';
import { InlineSuggestAlternativeAction } from '../../../model/InlineSuggestAlternativeAction.js';
import { InlineCompletionEditorType } from '../../../model/provideInlineCompletions.js';
import { IInlineEditsView, InlineEditClickEvent, InlineEditTabAction } from '../inlineEditsViewInterface.js';
import { getEditorBackgroundColor, getModifiedBorderColor, getOriginalBorderColor, INLINE_EDITS_BORDER_RADIUS, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground, modifiedChangedTextOverlayColor, observeColor, originalChangedTextOverlayColor } from '../theme.js';
import { getEditorValidOverlayRect, mapOutFalsy, rectToProps } from '../utils/utils.js';

export class WordReplacementsViewData implements IEquatable<WordReplacementsViewData> {
	constructor(
		public readonly edit: TextReplacement,
		public readonly editorType: InlineCompletionEditorType,
		public readonly alternativeAction: InlineSuggestAlternativeAction | undefined,
	) { }

	equals(other: WordReplacementsViewData): boolean {
		return this.edit.equals(other.edit) && this.alternativeAction === other.alternativeAction;
	}
}

const BORDER_WIDTH = 1;
const DOM_ID_OVERLAY = 'word-replacement-view-overlay';
const DOM_ID_WIDGET = 'word-replacement-view-widget';
const DOM_ID_REPLACEMENT = 'word-replacement-view-replacement';
const DOM_ID_RENAME = 'word-replacement-view-rename';

export class InlineEditsWordReplacementView extends Disposable implements IInlineEditsView {

	public static MAX_LENGTH = 100;

	private readonly _onDidClick = this._register(new Emitter<InlineEditClickEvent>());
	readonly onDidClick = this._onDidClick.event;

	private readonly _start;
	private readonly _end;

	private readonly _line;

	private readonly _primaryElement;
	private readonly _secondaryElement;

	readonly isHovered;

	readonly minEditorScrollHeight;

	constructor(
		private readonly _editor: ObservableCodeEditor,
		private readonly _viewData: WordReplacementsViewData,
		protected readonly _tabAction: IObservable<InlineEditTabAction>,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IThemeService private readonly _themeService: IThemeService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();
		this._start = this._editor.observePosition(constObservable(this._viewData.edit.range.getStartPosition()), this._store);
		this._end = this._editor.observePosition(constObservable(this._viewData.edit.range.getEndPosition()), this._store);
		this._line = document.createElement('div');
		this._primaryElement = observableValue<ObserverNodeWithElement | null>(this, null);
		this._secondaryElement = observableValue<ObserverNodeWithElement | null>(this, null);
		this.isHovered = this._primaryElement.map((e, reader) => e?.didMouseMoveDuringHover.read(reader) ?? false);
		this._renderTextEffect = derived(this, _reader => {
			const tm = this._editor.model.get()!;
			const origLine = tm.getLineContent(this._viewData.edit.range.startLineNumber);

			const edit = StringReplacement.replace(new OffsetRange(this._viewData.edit.range.startColumn - 1, this._viewData.edit.range.endColumn - 1), this._viewData.edit.text);
			const lineToTokenize = edit.replace(origLine);
			const t = tm.tokenization.tokenizeLinesAt(this._viewData.edit.range.startLineNumber, [lineToTokenize])?.[0];
			let tokens: LineTokens;
			if (t) {
				tokens = TokenArray.fromLineTokens(t).slice(edit.getRangeAfterReplace()).toLineTokens(this._viewData.edit.text, this._languageService.languageIdCodec);
			} else {
				tokens = LineTokens.createEmpty(this._viewData.edit.text, this._languageService.languageIdCodec);
			}
			const res = renderLines(new LineSource([tokens]), RenderOptions.fromEditor(this._editor.editor).withSetWidth(false).withScrollBeyondLastColumn(0), [], this._line, true);
			this._line.style.width = `${res.minWidthInPx}px`;
		});
		const modifiedLineHeight = this._editor.observeLineHeightForPosition(this._viewData.edit.range.getStartPosition());
		const altCount = observableFromPromise(this._viewData.alternativeAction?.count ?? new Promise<undefined>(resolve => resolve(undefined))).map(c => c.value);
		const altModifierActive = observableFromEvent(this, ModifierKeyEmitter.getInstance().event, () => ModifierKeyEmitter.getInstance().keyStatus.shiftKey);
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
			const w = this._editor.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;

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

				const secondaryElementHovered = constObservable(false);//this._secondaryElement.map((e, r) => e?.isHovered.read(r) ?? false);
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
									fontFamily: this._editor.getOption(EditorOption.fontFamily),
									fontSize: this._editor.getOption(EditorOption.fontSize),
									fontWeight: this._editor.getOption(EditorOption.fontWeight),
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

	private readonly _renderTextEffect;

	private readonly _layout;

	private readonly _root;

	private _mouseDown(e: MouseEvent): void {
		const target_id = traverseParentsUntilId(e.target as HTMLElement, new Set([DOM_ID_WIDGET, DOM_ID_REPLACEMENT, DOM_ID_RENAME, DOM_ID_OVERLAY]));
		if (!target_id) {
			return;
		}
		e.preventDefault(); // This prevents that the editor loses focus
		this._onDidClick.fire(InlineEditClickEvent.create(e, target_id === DOM_ID_RENAME));
	}
}

function traverseParentsUntilId(element: HTMLElement, ids: Set<string>): string | null {
	let current: HTMLElement | null = element;
	while (current) {
		if (ids.has(current.id)) {
			return current.id;
		}
		current = current.parentElement;
	}
	return null;
}
