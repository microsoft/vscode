/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { GhostText } from 'vs/editor/common/modes';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import * as strings from 'vs/base/common/strings';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { EditorFontLigatures, EditorOption } from 'vs/editor/common/config/editorOptions';
import { createStringBuilder } from 'vs/editor/common/core/stringBuilder';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { LineTokens } from 'vs/editor/common/core/lineTokens';

export interface ValidGhostText extends GhostText {
	replaceRange: IRange;
}

const ttPolicy = window.trustedTypes?.createPolicy('editorGhostText', { createHTML: value => value });

export class GhostTextWidget extends Disposable {

	private static instanceCount = 0;

	private readonly _editor: ICodeEditor;
	private readonly _codeEditorDecorationTypeKey: string;

	private _currentGhostText: ValidGhostText | null;
	private _hasDecoration: boolean;
	private _decorationIds: string[];
	private _viewZoneId: string | null;

	constructor(
		editor: ICodeEditor,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService
	) {
		super();
		this._editor = editor;
		this._codeEditorDecorationTypeKey = `0ghost-text-${++GhostTextWidget.instanceCount}`;
		this._currentGhostText = null;
		this._hasDecoration = false;
		this._decorationIds = [];
		this._viewZoneId = null;

		this._register(this._editor.onDidChangeConfiguration((e) => {
			if (
				e.hasChanged(EditorOption.disableMonospaceOptimizations)
				|| e.hasChanged(EditorOption.stopRenderingLineAfter)
				|| e.hasChanged(EditorOption.renderWhitespace)
				|| e.hasChanged(EditorOption.renderControlCharacters)
				|| e.hasChanged(EditorOption.fontLigatures)
				|| e.hasChanged(EditorOption.fontInfo)
				|| e.hasChanged(EditorOption.lineHeight)
			) {
				this._render();
			}
		}));
		this._register(toDisposable(() => this._removeInlineText()));
	}

	private _removeInlineText(): void {
		if (this._hasDecoration) {
			this._hasDecoration = false;
			this._codeEditorService.removeDecorationType(this._codeEditorDecorationTypeKey);
		}
	}

	public hide(): void {
		this._removeInlineText();
		this._editor.changeViewZones((changeAccessor) => {
			if (this._viewZoneId) {
				changeAccessor.removeZone(this._viewZoneId);
				this._viewZoneId = null;
			}
		});
		this._currentGhostText = null;
	}

	public show(ghostText: ValidGhostText): void {
		if (!this._editor.hasModel()) {
			return;
		}
		this._currentGhostText = ghostText;
		this._render();
	}

	private _render(): void {
		if (!this._editor.hasModel() || !this._currentGhostText) {
			return;
		}

		const model = this._editor.getModel();
		const { tabSize } = model.getOptions();
		const ghostLines = strings.splitLines(this._currentGhostText.text);

		this._removeInlineText();

		this._codeEditorService.registerDecorationType(this._codeEditorDecorationTypeKey, {
			after: {
				contentText: ghostLines[0]
			}
		});
		this._hasDecoration = true;
		const insertPosition = Range.lift(this._currentGhostText.replaceRange).getEndPosition();
		this._decorationIds = model.deltaDecorations(this._decorationIds, [{
			range: Range.fromPositions(insertPosition, insertPosition),
			options: this._codeEditorService.resolveDecorationOptions(this._codeEditorDecorationTypeKey, true)
		}]);

		this._editor.changeViewZones((changeAccessor) => {
			if (this._viewZoneId) {
				changeAccessor.removeZone(this._viewZoneId);
				this._viewZoneId = null;
			}
			const remainingLines = ghostLines.slice(1);
			if (remainingLines.length > 0) {
				const domNode = document.createElement('div');
				this._renderLines(domNode, tabSize, remainingLines);

				this._viewZoneId = changeAccessor.addZone({
					afterLineNumber: insertPosition.lineNumber,
					afterColumn: insertPosition.column,
					heightInLines: ghostLines.length - 1,
					domNode,
				});
			}
		});
	}

	private _renderLines(domNode: HTMLElement, tabSize: number, lines: string[]): void {
		const opts = this._editor.getOptions();
		const disableMonospaceOptimizations = opts.get(EditorOption.disableMonospaceOptimizations);
		const stopRenderingLineAfter = opts.get(EditorOption.stopRenderingLineAfter);
		const renderWhitespace = opts.get(EditorOption.renderWhitespace);
		const renderControlCharacters = opts.get(EditorOption.renderControlCharacters);
		const fontLigatures = opts.get(EditorOption.fontLigatures);
		const fontInfo = opts.get(EditorOption.fontInfo);
		const lineHeight = opts.get(EditorOption.lineHeight);

		const sb = createStringBuilder(10000);

		for (let i = 0, len = lines.length; i < len; i++) {
			const line = lines[i];
			sb.appendASCIIString('<div class="view-line');
			sb.appendASCIIString('" style="top:');
			sb.appendASCIIString(String(i * lineHeight));
			sb.appendASCIIString('px;width:1000000px;">');

			const isBasicASCII = strings.isBasicASCII(line);
			const containsRTL = strings.containsRTL(line);
			const lineTokens = LineTokens.createEmpty(line);

			renderViewLine(new RenderLineInput(
				(fontInfo.isMonospace && !disableMonospaceOptimizations),
				fontInfo.canUseHalfwidthRightwardsArrow,
				line,
				false,
				isBasicASCII,
				containsRTL,
				0,
				lineTokens,
				[],
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

		Configuration.applyFontInfoSlow(domNode, fontInfo);
		const html = sb.build();
		const trustedhtml = ttPolicy ? ttPolicy.createHTML(html) : html;
		domNode.innerHTML = trustedhtml as string;
	}
}
