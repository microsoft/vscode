/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import 'vs/css!./ghostText';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorFontLigatures, EditorOption, IComputedEditorOptions } from 'vs/editor/common/config/editorOptions';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { IModelDeltaDecoration, InjectedTextCursorStops, PositionAffinity } from 'vs/editor/common/model';
import { ILanguageIdCodec } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ghostTextBackground, ghostTextBorder, ghostTextForeground } from 'vs/editor/common/core/editorColorRegistry';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { InlineDecorationType } from 'vs/editor/common/viewModel';
import { GhostTextReplacement, GhostTextWidgetModel } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';

const ttPolicy = window.trustedTypes?.createPolicy('editorGhostText', { createHTML: value => value });

export class GhostTextWidget extends Disposable {
	private disposed = false;
	private readonly partsWidget = this._register(this.instantiationService.createInstance(DecorationsWidget, this.editor));
	private readonly additionalLinesWidget = this._register(new AdditionalLinesWidget(this.editor, this.languageService.languageIdCodec));
	private viewMoreContentWidget: ViewMoreLinesContentWidget | undefined = undefined;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly model: GhostTextWidgetModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();

		this._register(this.editor.onDidChangeConfiguration((e) => {
			if (
				e.hasChanged(EditorOption.disableMonospaceOptimizations)
				|| e.hasChanged(EditorOption.stopRenderingLineAfter)
				|| e.hasChanged(EditorOption.renderWhitespace)
				|| e.hasChanged(EditorOption.renderControlCharacters)
				|| e.hasChanged(EditorOption.fontLigatures)
				|| e.hasChanged(EditorOption.fontInfo)
				|| e.hasChanged(EditorOption.lineHeight)
			) {
				this.update();
			}
		}));

		this._register(toDisposable(() => {
			this.disposed = true;
			this.update();

			this.viewMoreContentWidget?.dispose();
			this.viewMoreContentWidget = undefined;
		}));

		this._register(model.onDidChange(() => {
			this.update();
		}));
		this.update();
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return (this.additionalLinesWidget.viewZoneId === viewZoneId);
	}

	private readonly replacementDecoration = this._register(new DisposableDecorations(this.editor));

	private update(): void {
		const ghostText = this.model.ghostText;

		if (!this.editor.hasModel() || !ghostText || this.disposed) {
			this.partsWidget.clear();
			this.additionalLinesWidget.clear();
			this.replacementDecoration.clear();
			return;
		}

		const inlineTexts = new Array<InsertedInlineText>();
		const additionalLines = new Array<LineData>();

		function addToAdditionalLines(lines: readonly string[], className: string | undefined) {
			if (additionalLines.length > 0) {
				const lastLine = additionalLines[additionalLines.length - 1];
				if (className) {
					lastLine.decorations.push(new LineDecoration(lastLine.content.length + 1, lastLine.content.length + 1 + lines[0].length, className, InlineDecorationType.Regular));
				}
				lastLine.content += lines[0];

				lines = lines.slice(1);
			}
			for (const line of lines) {
				additionalLines.push({
					content: line,
					decorations: className ? [new LineDecoration(1, line.length + 1, className, InlineDecorationType.Regular)] : []
				});
			}
		}

		if (ghostText instanceof GhostTextReplacement) {
			this.replacementDecoration.setDecorations([
				{
					range: new Range(
						ghostText.lineNumber,
						ghostText.columnStart,
						ghostText.lineNumber,
						ghostText.columnStart + ghostText.length
					),
					options: {
						inlineClassName: 'inline-completion-text-to-replace',
						description: 'GhostTextReplacement'
					}
				},
			]);
		} else {
			this.replacementDecoration.setDecorations([]);
		}

		const textBufferLine = this.editor.getModel().getLineContent(ghostText.lineNumber);

		let hiddenTextStartColumn: number | undefined = undefined;
		let lastIdx = 0;
		for (const part of ghostText.parts) {
			let lines = part.lines;
			if (hiddenTextStartColumn === undefined) {
				inlineTexts.push({
					column: part.column,
					text: lines[0],
					preview: part.preview,
				});
				lines = lines.slice(1);
			} else {
				addToAdditionalLines([textBufferLine.substring(lastIdx, part.column - 1)], undefined);
			}

			if (lines.length > 0) {
				addToAdditionalLines(lines, 'ghost-text');
				if (hiddenTextStartColumn === undefined && part.column <= textBufferLine.length) {
					hiddenTextStartColumn = part.column;
				}
			}

			lastIdx = part.column - 1;
		}
		if (hiddenTextStartColumn !== undefined) {
			addToAdditionalLines([textBufferLine.substring(lastIdx)], undefined);
		}

		this.partsWidget.setParts(ghostText.lineNumber, inlineTexts,
			hiddenTextStartColumn !== undefined ? { column: hiddenTextStartColumn, length: textBufferLine.length + 1 - hiddenTextStartColumn } : undefined);
		this.additionalLinesWidget.updateLines(ghostText.lineNumber, additionalLines, ghostText.additionalReservedLineCount);

		if (0 < 0) {
			// Not supported at the moment, condition is always false.
			this.viewMoreContentWidget = this.renderViewMoreLines(
				new Position(ghostText.lineNumber, this.editor.getModel()!.getLineMaxColumn(ghostText.lineNumber)),
				'', 0
			);
		} else {
			this.viewMoreContentWidget?.dispose();
			this.viewMoreContentWidget = undefined;
		}
	}

	private renderViewMoreLines(position: Position, firstLineText: string, remainingLinesLength: number): ViewMoreLinesContentWidget {
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		const domNode = document.createElement('div');
		domNode.className = 'suggest-preview-additional-widget';
		applyFontInfo(domNode, fontInfo);

		const spacer = document.createElement('span');
		spacer.className = 'content-spacer';
		spacer.append(firstLineText);
		domNode.append(spacer);

		const newline = document.createElement('span');
		newline.className = 'content-newline suggest-preview-text';
		newline.append('⏎  ');
		domNode.append(newline);

		const disposableStore = new DisposableStore();

		const button = document.createElement('div');
		button.className = 'button suggest-preview-text';
		button.append(`+${remainingLinesLength} lines…`);

		disposableStore.add(dom.addStandardDisposableListener(button, 'mousedown', (e) => {
			this.model?.setExpanded(true);
			e.preventDefault();
			this.editor.focus();
		}));

		domNode.append(button);
		return new ViewMoreLinesContentWidget(this.editor, position, domNode, disposableStore);
	}
}

class DisposableDecorations {
	private decorationIds: string[] = [];

	constructor(private readonly editor: ICodeEditor) {
	}

	public setDecorations(decorations: IModelDeltaDecoration[]): void {
		// Using change decorations ensures that we update the id's before some event handler is called.
		this.editor.changeDecorations(accessor => {
			this.decorationIds = accessor.deltaDecorations(this.decorationIds, decorations);
		});
	}

	public clear(): void {
		this.setDecorations([]);
	}

	public dispose(): void {
		this.clear();
	}
}

interface HiddenText {
	column: number;
	length: number;
}

interface InsertedInlineText {
	column: number;
	text: string;
	preview: boolean;
}

class DecorationsWidget implements IDisposable {
	private decorationIds: string[] = [];

	constructor(
		private readonly editor: ICodeEditor
	) {
	}

	public dispose(): void {
		this.clear();
	}

	public clear(): void {
		// Using change decorations ensures that we update the id's before some event handler is called.
		this.editor.changeDecorations(accessor => {
			this.decorationIds = accessor.deltaDecorations(this.decorationIds, []);
		});
	}

	public setParts(lineNumber: number, parts: InsertedInlineText[], hiddenText?: HiddenText): void {
		const textModel = this.editor.getModel();
		if (!textModel) {
			return;
		}

		const hiddenTextDecorations = new Array<IModelDeltaDecoration>();
		if (hiddenText) {
			hiddenTextDecorations.push({
				range: Range.fromPositions(new Position(lineNumber, hiddenText.column), new Position(lineNumber, hiddenText.column + hiddenText.length)),
				options: {
					inlineClassName: 'ghost-text-hidden',
					description: 'ghost-text-hidden',
				}
			});
		}

		// Using change decorations ensures that we update the id's before some event handler is called.
		this.editor.changeDecorations(accessor => {
			this.decorationIds = accessor.deltaDecorations(this.decorationIds, parts.map<IModelDeltaDecoration>(p => {
				return ({
					range: Range.fromPositions(new Position(lineNumber, p.column)),
					options: {
						description: 'ghost-text',
						after: { content: p.text, inlineClassName: p.preview ? 'ghost-text-decoration-preview' : 'ghost-text-decoration', cursorStops: InjectedTextCursorStops.Left },
						showIfCollapsed: true,
					}
				});
			}).concat(hiddenTextDecorations));
		});
	}
}

class AdditionalLinesWidget implements IDisposable {
	private _viewZoneId: string | undefined = undefined;
	public get viewZoneId(): string | undefined { return this._viewZoneId; }

	constructor(
		private readonly editor: ICodeEditor,
		private readonly languageIdCodec: ILanguageIdCodec
	) { }

	public dispose(): void {
		this.clear();
	}

	public clear(): void {
		this.editor.changeViewZones((changeAccessor) => {
			if (this._viewZoneId) {
				changeAccessor.removeZone(this._viewZoneId);
				this._viewZoneId = undefined;
			}
		});
	}

	public updateLines(lineNumber: number, additionalLines: LineData[], minReservedLineCount: number): void {
		const textModel = this.editor.getModel();
		if (!textModel) {
			return;
		}

		const { tabSize } = textModel.getOptions();

		this.editor.changeViewZones((changeAccessor) => {
			if (this._viewZoneId) {
				changeAccessor.removeZone(this._viewZoneId);
				this._viewZoneId = undefined;
			}

			const heightInLines = Math.max(additionalLines.length, minReservedLineCount);
			if (heightInLines > 0) {
				const domNode = document.createElement('div');
				renderLines(domNode, tabSize, additionalLines, this.editor.getOptions(), this.languageIdCodec);

				this._viewZoneId = changeAccessor.addZone({
					afterLineNumber: lineNumber,
					heightInLines: heightInLines,
					domNode,
					afterColumnAffinity: PositionAffinity.Right
				});
			}
		});
	}
}

interface LineData {
	content: string;
	decorations: LineDecoration[];
}

function renderLines(domNode: HTMLElement, tabSize: number, lines: LineData[], opts: IComputedEditorOptions, languageIdCodec: ILanguageIdCodec): void {
	const disableMonospaceOptimizations = opts.get(EditorOption.disableMonospaceOptimizations);
	const stopRenderingLineAfter = opts.get(EditorOption.stopRenderingLineAfter);
	// To avoid visual confusion, we don't want to render visible whitespace
	const renderWhitespace = 'none';
	const renderControlCharacters = opts.get(EditorOption.renderControlCharacters);
	const fontLigatures = opts.get(EditorOption.fontLigatures);
	const fontInfo = opts.get(EditorOption.fontInfo);
	const lineHeight = opts.get(EditorOption.lineHeight);

	const sb = new StringBuilder(10000);
	sb.appendASCIIString('<div class="suggest-preview-text">');

	for (let i = 0, len = lines.length; i < len; i++) {
		const lineData = lines[i];
		const line = lineData.content;
		sb.appendASCIIString('<div class="view-line');
		sb.appendASCIIString('" style="top:');
		sb.appendASCIIString(String(i * lineHeight));
		sb.appendASCIIString('px;width:1000000px;">');

		const isBasicASCII = strings.isBasicASCII(line);
		const containsRTL = strings.containsRTL(line);
		const lineTokens = LineTokens.createEmpty(line, languageIdCodec);

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

		sb.appendASCIIString('</div>');
	}
	sb.appendASCIIString('</div>');

	applyFontInfo(domNode, fontInfo);
	const html = sb.build();
	const trustedhtml = ttPolicy ? ttPolicy.createHTML(html) : html;
	domNode.innerHTML = trustedhtml as string;
}

class ViewMoreLinesContentWidget extends Disposable implements IContentWidget {
	readonly allowEditorOverflow = false;
	readonly suppressMouseDown = false;

	constructor(
		private editor: ICodeEditor,
		private position: Position,
		private domNode: HTMLElement,
		disposableStore: DisposableStore
	) {
		super();
		this._register(disposableStore);
		this._register(toDisposable(() => {
			this.editor.removeContentWidget(this);
		}));
		this.editor.addContentWidget(this);
	}

	getId(): string {
		return 'editor.widget.viewMoreLinesWidget';
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return {
			position: this.position,
			preference: [ContentWidgetPositionPreference.EXACT]
		};
	}
}

registerThemingParticipant((theme, collector) => {
	const foreground = theme.getColor(ghostTextForeground);
	if (foreground) {
		// `!important` ensures that other decorations don't cause a style conflict (#132017).
		collector.addRule(`.monaco-editor .ghost-text-decoration { color: ${foreground.toString()} !important; }`);
		collector.addRule(`.monaco-editor .ghost-text-decoration-preview { color: ${foreground.toString()} !important; }`);
		collector.addRule(`.monaco-editor .suggest-preview-text .ghost-text { color: ${foreground.toString()} !important; }`);
	}

	const background = theme.getColor(ghostTextBackground);
	if (background) {
		collector.addRule(`.monaco-editor .ghost-text-decoration { background-color: ${background.toString()}; }`);
		collector.addRule(`.monaco-editor .ghost-text-decoration-preview { background-color: ${background.toString()}; }`);
		collector.addRule(`.monaco-editor .suggest-preview-text .ghost-text { background-color: ${background.toString()}; }`);
	}

	const border = theme.getColor(ghostTextBorder);
	if (border) {
		collector.addRule(`.monaco-editor .suggest-preview-text .ghost-text { border: 1px solid ${border}; }`);
		collector.addRule(`.monaco-editor .ghost-text-decoration { border: 1px solid ${border}; }`);
		collector.addRule(`.monaco-editor .ghost-text-decoration-preview { border: 1px solid ${border}; }`);
	}
});
