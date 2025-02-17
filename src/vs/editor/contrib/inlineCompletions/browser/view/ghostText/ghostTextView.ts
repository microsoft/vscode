/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from '../../../../../../base/browser/trustedTypes.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { createHotClass } from '../../../../../../base/common/hotReloadHelpers.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, autorun, autorunWithStore, constObservable, derived, observableSignalFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import * as strings from '../../../../../../base/common/strings.js';
import { applyFontInfo } from '../../../../../browser/config/domFontInfo.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidgetPosition, IViewZoneChangeAccessor } from '../../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { EditorFontLigatures, EditorOption, IComputedEditorOptions } from '../../../../../common/config/editorOptions.js';
import { OffsetEdit, SingleOffsetEdit } from '../../../../../common/core/offsetEdit.js';
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
import { GhostText, GhostTextReplacement } from '../../model/ghostText.js';
import { ColumnRange } from '../../utils.js';
import { n } from '../../../../../../base/browser/dom.js';
import './ghostTextView.css';

export interface IGhostTextWidgetModel {
	readonly targetTextModel: IObservable<ITextModel | undefined>;
	readonly ghostText: IObservable<GhostText | GhostTextReplacement | undefined>;
	readonly warning: IObservable<{ icon: IconPath | undefined } | undefined>;
	readonly minReservedLineCount: IObservable<number>;
}

const USE_SQUIGGLES_FOR_WARNING = true;

export class GhostTextView extends Disposable {
	private readonly _isDisposed = observableValue(this, false);
	private readonly _editorObs = observableCodeEditor(this._editor);
	public static hot = createHotClass(GhostTextView);

	private _warningState = derived(reader => {
		const gt = this._model.ghostText.read(reader);
		if (!gt) { return undefined; }
		const warning = this._model.warning.read(reader);
		if (!warning) { return undefined; }
		return { lineNumber: gt.lineNumber, position: new Position(gt.lineNumber, gt.parts[0].column), icon: warning.icon };
	});

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _model: IGhostTextWidgetModel,
		private readonly _options: IObservable<{
			extraClasses?: string[];
			syntaxHighlightingEnabled: boolean;
		}>,
		private readonly _shouldKeepCursorStable: boolean,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this._register(toDisposable(() => { this._isDisposed.set(true, undefined); }));
		this._register(this._editorObs.setDecorations(this.decorations));

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

	private readonly _useSyntaxHighlighting = this._options.map(o => o.syntaxHighlightingEnabled);

	private readonly _extraClassNames = derived(this, reader => {
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

	private readonly uiState = derived(this, reader => {
		if (this._isDisposed.read(reader)) { return undefined; }
		const textModel = this._editorObs.model.read(reader);
		if (textModel !== this._model.targetTextModel.read(reader)) { return undefined; }
		const ghostText = this._model.ghostText.read(reader);
		if (!ghostText) { return undefined; }

		const replacedRange = ghostText instanceof GhostTextReplacement ? ghostText.columnRange : undefined;

		const syntaxHighlightingEnabled = this._useSyntaxHighlighting.read(reader);
		const extraClassNames = this._extraClassNames.read(reader);
		const { inlineTexts, additionalLines, hiddenRange } = computeGhostTextViewData(ghostText, textModel, 'ghost-text' + extraClassNames);

		const currentLine = textModel.getLineContent(ghostText.lineNumber);
		const edit = new OffsetEdit(inlineTexts.map(t => SingleOffsetEdit.insert(t.column - 1, t.text)));
		const tokens = syntaxHighlightingEnabled ? textModel.tokenization.tokenizeLinesAt(ghostText.lineNumber, [edit.apply(currentLine), ...additionalLines.map(l => l.content)]) : undefined;
		const newRanges = edit.getNewTextRanges();
		const inlineTextsWithTokens = inlineTexts.map((t, idx) => ({ ...t, tokens: tokens?.[0]?.getTokensInRange(newRanges[idx]) }));

		const tokenizedAdditionalLines: LineData[] = additionalLines.map((l, idx) => ({
			content: tokens?.[idx + 1] ?? LineTokens.createEmpty(l.content, this._languageService.languageIdCodec),
			decorations: l.decorations,
		}));

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

	private readonly decorations = derived(this, reader => {
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
						inlineClassName: p.preview ? 'ghost-text-decoration-preview' : 'ghost-text-decoration' + extraClassNames,
						cursorStops: InjectedTextCursorStops.Left,
					},
					showIfCollapsed: true,
				}
			});
		}

		return decorations;
	});

	private readonly additionalLinesWidget = this._register(
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
			this._shouldKeepCursorStable
		)
	);

	public readonly height = derived(this, reader => {
		const lineHeight = this._editorObs.getOption(EditorOption.lineHeight).read(reader);
		return lineHeight + (this.additionalLinesWidget.viewZoneHeight.read(reader) ?? 0);
	});

	public ownsViewZone(viewZoneId: string): boolean {
		return this.additionalLinesWidget.viewZoneId === viewZoneId;
	}
}

interface WidgetDomElement {
	ghostTextViewWarningWidgetData?: {
		range: Range;
	};
}

function computeGhostTextViewData(ghostText: GhostText | GhostTextReplacement, textModel: ITextModel, ghostTextClassName: string) {
	const inlineTexts: { column: number; text: string; preview: boolean }[] = [];
	const additionalLines: { content: string; decorations: LineDecoration[] }[] = [];

	function addToAdditionalLines(lines: readonly string[], className: string | undefined) {
		if (additionalLines.length > 0) {
			const lastLine = additionalLines[additionalLines.length - 1];
			if (className) {
				lastLine.decorations.push(new LineDecoration(
					lastLine.content.length + 1,
					lastLine.content.length + 1 + lines[0].length,
					className,
					InlineDecorationType.Regular
				));
			}
			lastLine.content += lines[0];

			lines = lines.slice(1);
		}
		for (const line of lines) {
			additionalLines.push({
				content: line,
				decorations: className ? [new LineDecoration(
					1,
					line.length + 1,
					className,
					InlineDecorationType.Regular
				)] : []
			});
		}
	}

	const textBufferLine = textModel.getLineContent(ghostText.lineNumber);

	let hiddenTextStartColumn: number | undefined = undefined;
	let lastIdx = 0;
	for (const part of ghostText.parts) {
		let lines = part.lines;
		if (hiddenTextStartColumn === undefined) {
			inlineTexts.push({ column: part.column, text: lines[0], preview: part.preview });
			lines = lines.slice(1);
		} else {
			addToAdditionalLines([textBufferLine.substring(lastIdx, part.column - 1)], undefined);
		}

		if (lines.length > 0) {
			addToAdditionalLines(lines, ghostTextClassName);
			if (hiddenTextStartColumn === undefined && part.column <= textBufferLine.length) {
				hiddenTextStartColumn = part.column;
			}
		}

		lastIdx = part.column - 1;
	}
	if (hiddenTextStartColumn !== undefined) {
		addToAdditionalLines([textBufferLine.substring(lastIdx)], undefined);
	}

	const hiddenRange = hiddenTextStartColumn !== undefined ? new ColumnRange(hiddenTextStartColumn, textBufferLine.length + 1) : undefined;

	return {
		inlineTexts,
		additionalLines,
		hiddenRange,
	};
}

export class AdditionalLinesWidget extends Disposable {
	private _viewZoneInfo: { viewZoneId: string; heightInLines: number; lineNumber: number } | undefined;
	public get viewZoneId(): string | undefined { return this._viewZoneInfo?.viewZoneId; }

	private _viewZoneHeight = observableValue<undefined | number>('viewZoneHeight', undefined);
	public get viewZoneHeight(): IObservable<number | undefined> { return this._viewZoneHeight; }

	private readonly editorOptionsChanged = observableSignalFromEvent('editorOptionChanged', Event.filter(
		this.editor.onDidChangeConfiguration,
		e => e.hasChanged(EditorOption.disableMonospaceOptimizations)
			|| e.hasChanged(EditorOption.stopRenderingLineAfter)
			|| e.hasChanged(EditorOption.renderWhitespace)
			|| e.hasChanged(EditorOption.renderControlCharacters)
			|| e.hasChanged(EditorOption.fontLigatures)
			|| e.hasChanged(EditorOption.fontInfo)
			|| e.hasChanged(EditorOption.lineHeight)
	));

	constructor(
		private readonly editor: ICodeEditor,
		private readonly lines: IObservable<{
			targetTextModel: ITextModel;
			lineNumber: number;
			additionalLines: LineData[];
			minReservedLineCount: number;
		} | undefined>,
		private readonly shouldKeepCursorStable: boolean
	) {
		super();

		this._register(autorun(reader => {
			/** @description update view zone */
			const lines = this.lines.read(reader);
			this.editorOptionsChanged.read(reader);

			if (lines) {
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
		this.editor.changeViewZones((changeAccessor) => {
			this.removeActiveViewZone(changeAccessor);
		});
	}

	private updateLines(lineNumber: number, additionalLines: LineData[], minReservedLineCount: number): void {
		const textModel = this.editor.getModel();
		if (!textModel) {
			return;
		}

		const { tabSize } = textModel.getOptions();

		this.editor.changeViewZones((changeAccessor) => {
			this.removeActiveViewZone(changeAccessor);

			const heightInLines = Math.max(additionalLines.length, minReservedLineCount);
			if (heightInLines > 0) {
				const domNode = document.createElement('div');
				renderLines(domNode, tabSize, additionalLines, this.editor.getOptions());

				this.addViewZone(changeAccessor, lineNumber, heightInLines, domNode);
			}
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

			this.keepCursorStable(this._viewZoneInfo.lineNumber, -this._viewZoneInfo.heightInLines);

			this._viewZoneInfo = undefined;
			this._viewZoneHeight.set(undefined, undefined);
		}
	}

	private keepCursorStable(lineNumber: number, heightInLines: number): void {
		if (!this.shouldKeepCursorStable) {
			return;
		}

		const cursorLineNumber = this.editor.getSelection()?.getStartPosition()?.lineNumber;
		if (cursorLineNumber !== undefined && lineNumber < cursorLineNumber) {
			this.editor.setScrollTop(this.editor.getScrollTop() + heightInLines * this.editor.getOption(EditorOption.lineHeight));
		}
	}
}

export interface LineData {
	content: LineTokens; // Must not contain a linebreak!
	decorations: LineDecoration[];
}

function renderLines(domNode: HTMLElement, tabSize: number, lines: LineData[], opts: IComputedEditorOptions): void {
	const disableMonospaceOptimizations = opts.get(EditorOption.disableMonospaceOptimizations);
	const stopRenderingLineAfter = opts.get(EditorOption.stopRenderingLineAfter);
	// To avoid visual confusion, we don't want to render visible whitespace
	const renderWhitespace = 'none';
	const renderControlCharacters = opts.get(EditorOption.renderControlCharacters);
	const fontLigatures = opts.get(EditorOption.fontLigatures);
	const fontInfo = opts.get(EditorOption.fontInfo);
	const lineHeight = opts.get(EditorOption.lineHeight);

	const sb = new StringBuilder(10000);
	sb.appendString('<div class="suggest-preview-text">');

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
