/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from '../../../../../../base/browser/trustedTypes.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { createHotClass } from '../../../../../../base/common/hotReloadHelpers.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, autorun, autorunWithStore, constObservable, derived, observableSignalFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import * as strings from '../../../../../../base/common/strings.js';
import { applyFontInfo } from '../../../../../browser/config/domFontInfo.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidgetPosition, IViewZoneChangeAccessor, MouseTargetType } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { EditorFontLigatures, EditorOption, IComputedEditorOptions } from '../../../../../common/config/editorOptions.js';
import { StringEdit, StringReplacement } from '../../../../../common/core/edits/stringEdit.js';
import { Position } from '../../../../../common/core/position.js';
import { Range } from '../../../../../common/core/range.js';
import { StringBuilder } from '../../../../../common/core/stringBuilder.js';
import { IconPath } from '../../../../../common/languages.js';
import { ILanguageService } from '../../../../../common/languages/language.js';
import { IModelDeltaDecoration, ITextModel, InjectedTextCursorStops, PositionAffinity } from '../../../../../common/model.js';
import { LineTokens } from '../../../../../common/tokens/lineTokens.js';
import { LineDecoration } from '../../../../../common/viewLayout/lineDecorations.js';
import { RenderLineInput, renderViewLine } from '../../../../../common/viewLayout/viewLineRenderer.js';
import { InlineDecorationType } from '../../../../../common/viewModel.js';
import { GhostText, GhostTextReplacement, IGhostTextLine } from '../../model/ghostText.js';
import { RangeSingleLine } from '../../../../../common/core/ranges/rangeSingleLine.js';
import { ColumnRange } from '../../../../../common/core/ranges/columnRange.js';
import { addDisposableListener, getWindow, isHTMLElement, n } from '../../../../../../base/browser/dom.js';
import './ghostTextView.css';
import { IMouseEvent, StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { CodeEditorWidget } from '../../../../../browser/widget/codeEditor/codeEditorWidget.js';
import { TokenWithTextArray } from '../../../../../common/tokens/tokenWithTextArray.js';
import { InlineCompletionViewData } from '../inlineEdits/inlineEditsViewInterface.js';

export interface IGhostTextWidgetModel {
	readonly targetTextModel: IObservable<ITextModel | undefined>;
	readonly ghostText: IObservable<GhostText | GhostTextReplacement | undefined>;
	readonly warning: IObservable<{ icon: IconPath | undefined } | undefined>;
	readonly minReservedLineCount: IObservable<number>;

	readonly handleInlineCompletionShown: IObservable<(viewData: InlineCompletionViewData) => void>;
}

const USE_SQUIGGLES_FOR_WARNING = true;
const GHOST_TEXT_CLASS_NAME = 'ghost-text';

export class GhostTextView extends Disposable {
	private readonly _isDisposed;
	private readonly _editorObs;
	public static hot = createHotClass(GhostTextView);

	private _warningState;

	private readonly _onDidClick;
	public readonly onDidClick;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _model: IGhostTextWidgetModel,
		private readonly _options: IObservable<{
			extraClasses?: string[];
			syntaxHighlightingEnabled: boolean;
		}>,
		private readonly _shouldKeepCursorStable: boolean,
		private readonly _isClickable: boolean,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();
		this._isDisposed = observableValue(this, false);
		this._editorObs = observableCodeEditor(this._editor);
		this._warningState = derived(reader => {
			const gt = this._model.ghostText.read(reader);
			if (!gt) { return undefined; }
			const warning = this._model.warning.read(reader);
			if (!warning) { return undefined; }
			return { lineNumber: gt.lineNumber, position: new Position(gt.lineNumber, gt.parts[0].column), icon: warning.icon };
		});
		this._onDidClick = this._register(new Emitter<IMouseEvent>());
		this.onDidClick = this._onDidClick.event;
		this._useSyntaxHighlighting = this._options.map(o => o.syntaxHighlightingEnabled);
		this._extraClassNames = derived(this, reader => {
			const extraClasses = [...this._options.read(reader).extraClasses ?? []];
			if (this._useSyntaxHighlighting.read(reader)) {
				extraClasses.push('syntax-highlighted');
			}
			if (USE_SQUIGGLES_FOR_WARNING && this._warningState.read(reader)) {
				extraClasses.push('warning');
			}
			const extraClassNames = extraClasses.map(c => ` ${c}`).join('');
			return extraClassNames;
		});
		this.uiState = derived(this, reader => {
			if (this._isDisposed.read(reader)) { return undefined; }
			const textModel = this._editorObs.model.read(reader);
			if (textModel !== this._model.targetTextModel.read(reader)) { return undefined; }
			const ghostText = this._model.ghostText.read(reader);
			if (!ghostText) { return undefined; }

			const replacedRange = ghostText instanceof GhostTextReplacement ? ghostText.columnRange : undefined;

			const syntaxHighlightingEnabled = this._useSyntaxHighlighting.read(reader);
			const extraClassNames = this._extraClassNames.read(reader);
			const { inlineTexts, additionalLines, hiddenRange, additionalLinesOriginalSuffix } = computeGhostTextViewData(ghostText, textModel, GHOST_TEXT_CLASS_NAME + extraClassNames);

			const currentLine = textModel.getLineContent(ghostText.lineNumber);
			const edit = new StringEdit(inlineTexts.map(t => StringReplacement.insert(t.column - 1, t.text)));
			const tokens = syntaxHighlightingEnabled ? textModel.tokenization.tokenizeLinesAt(ghostText.lineNumber, [edit.apply(currentLine), ...additionalLines.map(l => l.content)]) : undefined;
			const newRanges = edit.getNewRanges();
			const inlineTextsWithTokens = inlineTexts.map((t, idx) => ({ ...t, tokens: tokens?.[0]?.getTokensInRange(newRanges[idx]) }));

			const tokenizedAdditionalLines: LineData[] = additionalLines.map((l, idx) => {
				let content = tokens?.[idx + 1] ?? LineTokens.createEmpty(l.content, this._languageService.languageIdCodec);
				if (idx === additionalLines.length - 1 && additionalLinesOriginalSuffix) {
					const t = TokenWithTextArray.fromLineTokens(textModel.tokenization.getLineTokens(additionalLinesOriginalSuffix.lineNumber));
					const existingContent = t.slice(additionalLinesOriginalSuffix.columnRange.toZeroBasedOffsetRange());
					content = TokenWithTextArray.fromLineTokens(content).append(existingContent).toLineTokens(content.languageIdCodec);
				}
				return {
					content,
					decorations: l.decorations,
				};
			});

			const cursorColumn = this._editor.getSelection()?.getStartPosition().column;
			const renderData: InlineCompletionViewData = {
				cursorColumnDistance: cursorColumn !== undefined ? Math.abs((inlineTextsWithTokens.length > 0 ? inlineTextsWithTokens[0].column : 1) - cursorColumn) : -1,
				cursorLineDistance: inlineTextsWithTokens.length > 0 ? 0 : additionalLines.findIndex(line => line.content !== ''),
				lineCountOriginal: inlineTextsWithTokens.length > 0 ? 1 : 0,
				lineCountModified: additionalLines.length + (inlineTextsWithTokens.length > 0 ? 1 : 0),
				characterCountOriginal: 0,
				characterCountModified: inlineTextsWithTokens.reduce((acc, inline) => acc + inline.text.length, 0) + tokenizedAdditionalLines.reduce((acc, line) => acc + line.content.getTextLength(), 0),
				disjointReplacements: inlineTextsWithTokens.length + (additionalLines.length > 0 ? 1 : 0),
				sameShapeReplacements: inlineTextsWithTokens.length > 1 && inlineTextsWithTokens.length === 0 ? inlineTextsWithTokens.every(inline => inline.text.length === inlineTextsWithTokens[0].text.length) : undefined,
			};
			this._model.handleInlineCompletionShown.read(reader)?.(renderData);

			return {
				replacedRange,
				inlineTexts: inlineTextsWithTokens,
				additionalLines: tokenizedAdditionalLines,
				hiddenRange,
				lineNumber: ghostText.lineNumber,
				additionalReservedLineCount: this._model.minReservedLineCount.read(reader),
				targetTextModel: textModel,
				syntaxHighlightingEnabled,
			};
		});
		this.decorations = derived(this, reader => {
			const uiState = this.uiState.read(reader);
			if (!uiState) { return []; }

			const decorations: IModelDeltaDecoration[] = [];

			const extraClassNames = this._extraClassNames.read(reader);

			if (uiState.replacedRange) {
				decorations.push({
					range: uiState.replacedRange.toRange(uiState.lineNumber),
					options: { inlineClassName: 'inline-completion-text-to-replace' + extraClassNames, description: 'GhostTextReplacement' }
				});
			}

			if (uiState.hiddenRange) {
				decorations.push({
					range: uiState.hiddenRange.toRange(uiState.lineNumber),
					options: { inlineClassName: 'ghost-text-hidden', description: 'ghost-text-hidden', }
				});
			}

			for (const p of uiState.inlineTexts) {
				decorations.push({
					range: Range.fromPositions(new Position(uiState.lineNumber, p.column)),
					options: {
						description: 'ghost-text-decoration',
						after: {
							content: p.text,
							tokens: p.tokens,
							inlineClassName: (p.preview ? 'ghost-text-decoration-preview' : 'ghost-text-decoration')
								+ (this._isClickable ? ' clickable' : '')
								+ extraClassNames
								+ p.lineDecorations.map(d => ' ' + d.className).join(' '), // TODO: take the ranges into account for line decorations
							cursorStops: InjectedTextCursorStops.Left,
							attachedData: new GhostTextAttachedData(this),
						},
						showIfCollapsed: true,
					}
				});
			}

			return decorations;
		});
		this._additionalLinesWidget = this._register(
			new AdditionalLinesWidget(
				this._editor,
				derived(reader => {
					/** @description lines */
					const uiState = this.uiState.read(reader);
					return uiState ? {
						lineNumber: uiState.lineNumber,
						additionalLines: uiState.additionalLines,
						minReservedLineCount: uiState.additionalReservedLineCount,
						targetTextModel: uiState.targetTextModel,
					} : undefined;
				}),
				this._shouldKeepCursorStable,
				this._isClickable
			)
		);
		this._isInlineTextHovered = this._editorObs.isTargetHovered(
			p => p.target.type === MouseTargetType.CONTENT_TEXT &&
				p.target.detail.injectedText?.options.attachedData instanceof GhostTextAttachedData &&
				p.target.detail.injectedText.options.attachedData.owner === this,
			this._store
		);
		this.isHovered = derived(this, reader => {
			if (this._isDisposed.read(reader)) { return false; }
			return this._isInlineTextHovered.read(reader) || this._additionalLinesWidget.isHovered.read(reader);
		});
		this.height = derived(this, reader => {
			const lineHeight = this._editorObs.getOption(EditorOption.lineHeight).read(reader);
			return lineHeight + (this._additionalLinesWidget.viewZoneHeight.read(reader) ?? 0);
		});

		this._register(toDisposable(() => { this._isDisposed.set(true, undefined); }));
		this._register(this._editorObs.setDecorations(this.decorations));

		if (this._isClickable) {
			this._register(this._additionalLinesWidget.onDidClick((e) => this._onDidClick.fire(e)));
			this._register(this._editor.onMouseUp(e => {
				if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
					return;
				}
				const a = e.target.detail.injectedText?.options.attachedData;
				if (a instanceof GhostTextAttachedData && a.owner === this) {
					this._onDidClick.fire(e.event);
				}
			}));
		}

		this._register(autorunWithStore((reader, store) => {
			if (USE_SQUIGGLES_FOR_WARNING) {
				return;
			}

			const state = this._warningState.read(reader);
			if (!state) {
				return;
			}

			const lineHeight = this._editorObs.getOption(EditorOption.lineHeight);
			store.add(this._editorObs.createContentWidget({
				position: constObservable<IContentWidgetPosition>({
					position: new Position(state.lineNumber, Number.MAX_SAFE_INTEGER),
					preference: [ContentWidgetPositionPreference.EXACT],
					positionAffinity: PositionAffinity.Right,
				}),
				allowEditorOverflow: false,
				domNode: n.div({
					class: 'ghost-text-view-warning-widget',
					style: {
						width: lineHeight,
						height: lineHeight,
						marginLeft: 4,
						color: 'orange',
					},
					ref: (dom) => {
						(dom as any as WidgetDomElement).ghostTextViewWarningWidgetData = { range: Range.fromPositions(state.position) };
					}
				}, [
					n.div({
						class: 'ghost-text-view-warning-widget-icon',
						style: {
							width: '100%',
							height: '100%',
							display: 'flex',
							alignContent: 'center',
							alignItems: 'center',
						}
					}, [
						renderIcon((state.icon && 'id' in state.icon) ? state.icon : Codicon.warning),
					])
				]).keepUpdated(store).element,
			}));
		}));
	}

	public static getWarningWidgetContext(domNode: HTMLElement): { range: Range } | undefined {
		const data = (domNode as any as WidgetDomElement).ghostTextViewWarningWidgetData;
		if (data) {
			return data;
		} else if (domNode.parentElement) {
			return this.getWarningWidgetContext(domNode.parentElement);
		}
		return undefined;
	}

	private readonly _useSyntaxHighlighting;

	private readonly _extraClassNames;

	private readonly uiState;

	private readonly decorations;

	private readonly _additionalLinesWidget;

	private readonly _isInlineTextHovered;

	public readonly isHovered;

	public readonly height;

	public ownsViewZone(viewZoneId: string): boolean {
		return this._additionalLinesWidget.viewZoneId === viewZoneId;
	}
}

class GhostTextAttachedData {
	constructor(public readonly owner: GhostTextView) { }
}

interface WidgetDomElement {
	ghostTextViewWarningWidgetData?: {
		range: Range;
	};
}

function computeGhostTextViewData(ghostText: GhostText | GhostTextReplacement, textModel: ITextModel, ghostTextClassName: string) {
	const inlineTexts: { column: number; text: string; preview: boolean; lineDecorations: LineDecoration[] }[] = [];
	const additionalLines: { content: string; decorations: LineDecoration[] }[] = [];

	function addToAdditionalLines(ghLines: readonly IGhostTextLine[], className: string | undefined) {
		if (additionalLines.length > 0) {
			const lastLine = additionalLines[additionalLines.length - 1];
			if (className) {
				lastLine.decorations.push(new LineDecoration(
					lastLine.content.length + 1,
					lastLine.content.length + 1 + ghLines[0].line.length,
					className,
					InlineDecorationType.Regular
				));
			}
			lastLine.content += ghLines[0].line;

			ghLines = ghLines.slice(1);
		}
		for (const ghLine of ghLines) {
			additionalLines.push({
				content: ghLine.line,
				decorations: className ? [new LineDecoration(
					1,
					ghLine.line.length + 1,
					className,
					InlineDecorationType.Regular
				), ...ghLine.lineDecorations] : [...ghLine.lineDecorations]
			});
		}
	}

	const textBufferLine = textModel.getLineContent(ghostText.lineNumber);

	let hiddenTextStartColumn: number | undefined = undefined;
	let lastIdx = 0;
	for (const part of ghostText.parts) {
		let ghLines = part.lines;
		if (hiddenTextStartColumn === undefined) {
			inlineTexts.push({ column: part.column, text: ghLines[0].line, preview: part.preview, lineDecorations: ghLines[0].lineDecorations });
			ghLines = ghLines.slice(1);
		} else {
			addToAdditionalLines([{ line: textBufferLine.substring(lastIdx, part.column - 1), lineDecorations: [] }], undefined);
		}

		if (ghLines.length > 0) {
			addToAdditionalLines(ghLines, ghostTextClassName);
			if (hiddenTextStartColumn === undefined && part.column <= textBufferLine.length) {
				hiddenTextStartColumn = part.column;
			}
		}

		lastIdx = part.column - 1;
	}
	let additionalLinesOriginalSuffix: RangeSingleLine | undefined = undefined;
	if (hiddenTextStartColumn !== undefined) {
		additionalLinesOriginalSuffix = new RangeSingleLine(ghostText.lineNumber, new ColumnRange(lastIdx + 1, textBufferLine.length + 1));
	}

	const hiddenRange = hiddenTextStartColumn !== undefined ? new ColumnRange(hiddenTextStartColumn, textBufferLine.length + 1) : undefined;

	return {
		inlineTexts,
		additionalLines,
		hiddenRange,
		additionalLinesOriginalSuffix,
	};
}

export class AdditionalLinesWidget extends Disposable {
	private _viewZoneInfo: { viewZoneId: string; heightInLines: number; lineNumber: number } | undefined;
	public get viewZoneId(): string | undefined { return this._viewZoneInfo?.viewZoneId; }

	private _viewZoneHeight;
	public get viewZoneHeight(): IObservable<number | undefined> { return this._viewZoneHeight; }

	private readonly editorOptionsChanged;

	private readonly _onDidClick;
	public readonly onDidClick;

	private readonly _viewZoneListener;

	readonly isHovered;

	private hasBeenAccepted;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _lines: IObservable<{
			targetTextModel: ITextModel;
			lineNumber: number;
			additionalLines: LineData[];
			minReservedLineCount: number;
		} | undefined>,
		private readonly _shouldKeepCursorStable: boolean,
		private readonly _isClickable: boolean,
	) {
		super();
		this._viewZoneHeight = observableValue<undefined | number>('viewZoneHeight', undefined);
		this.editorOptionsChanged = observableSignalFromEvent('editorOptionChanged', Event.filter(
			this._editor.onDidChangeConfiguration,
			e => e.hasChanged(EditorOption.disableMonospaceOptimizations)
				|| e.hasChanged(EditorOption.stopRenderingLineAfter)
				|| e.hasChanged(EditorOption.renderWhitespace)
				|| e.hasChanged(EditorOption.renderControlCharacters)
				|| e.hasChanged(EditorOption.fontLigatures)
				|| e.hasChanged(EditorOption.fontInfo)
				|| e.hasChanged(EditorOption.lineHeight)
		));
		this._onDidClick = this._register(new Emitter<IMouseEvent>());
		this.onDidClick = this._onDidClick.event;
		this._viewZoneListener = this._register(new MutableDisposable());
		this.isHovered = observableCodeEditor(this._editor).isTargetHovered(
			p => isTargetGhostText(p.target.element),
			this._store
		);
		this.hasBeenAccepted = false;

		if (this._editor instanceof CodeEditorWidget && this._shouldKeepCursorStable) {
			this._register(this._editor.onBeforeExecuteEdit(e => this.hasBeenAccepted = e.source === 'inlineSuggestion.accept'));
		}

		this._register(autorun(reader => {
			/** @description update view zone */
			const lines = this._lines.read(reader);
			this.editorOptionsChanged.read(reader);

			if (lines) {
				this.hasBeenAccepted = false;
				this.updateLines(lines.lineNumber, lines.additionalLines, lines.minReservedLineCount);
			} else {
				this.clear();
			}
		}));
	}

	public override dispose(): void {
		super.dispose();
		this.clear();
	}

	private clear(): void {
		this._viewZoneListener.clear();

		this._editor.changeViewZones((changeAccessor) => {
			this.removeActiveViewZone(changeAccessor);
		});
	}

	private updateLines(lineNumber: number, additionalLines: LineData[], minReservedLineCount: number): void {
		const textModel = this._editor.getModel();
		if (!textModel) {
			return;
		}

		const { tabSize } = textModel.getOptions();

		this._editor.changeViewZones((changeAccessor) => {
			const store = new DisposableStore();

			this.removeActiveViewZone(changeAccessor);

			const heightInLines = Math.max(additionalLines.length, minReservedLineCount);
			if (heightInLines > 0) {
				const domNode = document.createElement('div');
				renderLines(domNode, tabSize, additionalLines, this._editor.getOptions(), this._isClickable);

				if (this._isClickable) {
					store.add(addDisposableListener(domNode, 'mousedown', (e) => {
						e.preventDefault(); // This prevents that the editor loses focus
					}));
					store.add(addDisposableListener(domNode, 'click', (e) => {
						if (isTargetGhostText(e.target)) {
							this._onDidClick.fire(new StandardMouseEvent(getWindow(e), e));
						}
					}));
				}

				this.addViewZone(changeAccessor, lineNumber, heightInLines, domNode);
			}

			this._viewZoneListener.value = store;
		});
	}

	private addViewZone(changeAccessor: IViewZoneChangeAccessor, afterLineNumber: number, heightInLines: number, domNode: HTMLElement): void {
		const id = changeAccessor.addZone({
			afterLineNumber: afterLineNumber,
			heightInLines: heightInLines,
			domNode,
			afterColumnAffinity: PositionAffinity.Right,
			onComputedHeight: (height: number) => {
				this._viewZoneHeight.set(height, undefined); // TODO: can a transaction be used to avoid flickering?
			}
		});

		this.keepCursorStable(afterLineNumber, heightInLines);

		this._viewZoneInfo = { viewZoneId: id, heightInLines, lineNumber: afterLineNumber };
	}

	private removeActiveViewZone(changeAccessor: IViewZoneChangeAccessor): void {
		if (this._viewZoneInfo) {
			changeAccessor.removeZone(this._viewZoneInfo.viewZoneId);

			if (!this.hasBeenAccepted) {
				this.keepCursorStable(this._viewZoneInfo.lineNumber, -this._viewZoneInfo.heightInLines);
			}

			this._viewZoneInfo = undefined;
			this._viewZoneHeight.set(undefined, undefined);
		}
	}

	private keepCursorStable(lineNumber: number, heightInLines: number): void {
		if (!this._shouldKeepCursorStable) {
			return;
		}

		const cursorLineNumber = this._editor.getSelection()?.getStartPosition()?.lineNumber;
		if (cursorLineNumber !== undefined && lineNumber < cursorLineNumber) {
			this._editor.setScrollTop(this._editor.getScrollTop() + heightInLines * this._editor.getOption(EditorOption.lineHeight));
		}
	}
}

function isTargetGhostText(target: EventTarget | null): boolean {
	return isHTMLElement(target) && target.classList.contains(GHOST_TEXT_CLASS_NAME);
}

export interface LineData {
	content: LineTokens; // Must not contain a linebreak!
	decorations: LineDecoration[];
}

function renderLines(domNode: HTMLElement, tabSize: number, lines: LineData[], opts: IComputedEditorOptions, isClickable: boolean): void {
	const disableMonospaceOptimizations = opts.get(EditorOption.disableMonospaceOptimizations);
	const stopRenderingLineAfter = opts.get(EditorOption.stopRenderingLineAfter);
	// To avoid visual confusion, we don't want to render visible whitespace
	const renderWhitespace = 'none';
	const renderControlCharacters = opts.get(EditorOption.renderControlCharacters);
	const fontLigatures = opts.get(EditorOption.fontLigatures);
	const fontInfo = opts.get(EditorOption.fontInfo);
	const lineHeight = opts.get(EditorOption.lineHeight);

	let classNames = 'suggest-preview-text';
	if (isClickable) {
		classNames += ' clickable';
	}

	const sb = new StringBuilder(10000);
	sb.appendString(`<div class="${classNames}">`);

	for (let i = 0, len = lines.length; i < len; i++) {
		const lineData = lines[i];
		const lineTokens = lineData.content;
		sb.appendString('<div class="view-line');
		sb.appendString('" style="top:');
		sb.appendString(String(i * lineHeight));
		sb.appendString('px;width:1000000px;">');

		const line = lineTokens.getLineContent();
		const isBasicASCII = strings.isBasicASCII(line);
		const containsRTL = strings.containsRTL(line);

		renderViewLine(new RenderLineInput(
			(fontInfo.isMonospace && !disableMonospaceOptimizations),
			fontInfo.canUseHalfwidthRightwardsArrow,
			line,
			false,
			isBasicASCII,
			containsRTL,
			0,
			lineTokens,
			lineData.decorations,
			tabSize,
			0,
			fontInfo.spaceWidth,
			fontInfo.middotWidth,
			fontInfo.wsmiddotWidth,
			stopRenderingLineAfter,
			renderWhitespace,
			renderControlCharacters,
			fontLigatures !== EditorFontLigatures.OFF,
			null
		), sb);

		sb.appendString('</div>');
	}
	sb.appendString('</div>');

	applyFontInfo(domNode, fontInfo);
	const html = sb.build();
	const trustedhtml = ttPolicy ? ttPolicy.createHTML(html) : html;
	domNode.innerHTML = trustedhtml as string;
}

export const ttPolicy = createTrustedTypesPolicy('editorGhostText', { createHTML: value => value });
