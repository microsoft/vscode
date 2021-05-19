/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import * as strings from 'vs/base/common/strings';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { EditorFontLigatures, EditorOption } from 'vs/editor/common/config/editorOptions';
import { createStringBuilder } from 'vs/editor/common/core/stringBuilder';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { Position } from 'vs/editor/common/core/position';

const ttPolicy = window.trustedTypes?.createPolicy('editorGhostText', { createHTML: value => value });

export interface GhostText {
	text: string;
	position: Position;
}

export class GhostTextWidget extends Disposable {
	private static instanceCount = 0;

	private readonly _codeEditorDecorationTypeKey: string;

	private currentGhostText: GhostText | null;
	private hasDecoration: boolean;
	private decorationIds: string[];
	private viewZoneId: string | null;

	constructor(
		private readonly editor: ICodeEditor,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService
	) {
		super();

		// We add 0 to bring it before any other decoration.
		this._codeEditorDecorationTypeKey = `0-ghost-text-${++GhostTextWidget.instanceCount}`;
		this.currentGhostText = null;
		this.hasDecoration = false;
		this.decorationIds = [];
		this.viewZoneId = null;

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
				this._render();
			}
		}));
		this._register(toDisposable(() => this._removeInlineText()));
	}

	private _removeInlineText(): void {
		if (this.hasDecoration) {
			this.hasDecoration = false;
			this._codeEditorService.removeDecorationType(this._codeEditorDecorationTypeKey);
		}
	}

	public hide(): void {
		this._removeInlineText();
		this.editor.changeViewZones((changeAccessor) => {
			if (this.viewZoneId) {
				changeAccessor.removeZone(this.viewZoneId);
				this.viewZoneId = null;
			}
		});
		this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
		this.currentGhostText = null;
	}

	public show(ghostText: GhostText): void {
		if (!this.editor.hasModel()) {
			return;
		}
		const model = this.editor.getModel();
		const maxColumn = model.getLineMaxColumn(ghostText.position.lineNumber);
		if (ghostText.position.column !== maxColumn) {
			console.warn('Can only show multiline ghost text at the end of a line');
			return;
		}
		this.currentGhostText = ghostText;
		this._render();
	}

	private _render(): void {
		if (!this.editor.hasModel() || !this.currentGhostText) {
			return;
		}

		const model = this.editor.getModel();
		const { tabSize } = model.getOptions();
		const ghostLines = strings.splitLines(this.currentGhostText.text);

		this._removeInlineText();

		this._codeEditorService.registerDecorationType(this._codeEditorDecorationTypeKey, {
			after: {
				contentText: ghostLines[0],
				opacity: '0.467',
			}
		});
		this.hasDecoration = true;
		const insertPosition = this.currentGhostText.position;
		this.decorationIds = this.editor.deltaDecorations(this.decorationIds, [{
			range: Range.fromPositions(insertPosition, insertPosition),
			options: this._codeEditorService.resolveDecorationOptions(this._codeEditorDecorationTypeKey, true)
		}]);

		this.editor.changeViewZones((changeAccessor) => {
			if (this.viewZoneId) {
				changeAccessor.removeZone(this.viewZoneId);
				this.viewZoneId = null;
			}
			const remainingLines = ghostLines.slice(1);
			if (remainingLines.length > 0) {
				const domNode = document.createElement('div');
				this._renderLines(domNode, tabSize, remainingLines);

				this.viewZoneId = changeAccessor.addZone({
					afterLineNumber: insertPosition.lineNumber,
					afterColumn: insertPosition.column,
					heightInLines: ghostLines.length - 1,
					domNode,
				});
			}
		});
	}

	private _renderLines(domNode: HTMLElement, tabSize: number, lines: string[]): void {
		const opts = this.editor.getOptions();
		const disableMonospaceOptimizations = opts.get(EditorOption.disableMonospaceOptimizations);
		const stopRenderingLineAfter = opts.get(EditorOption.stopRenderingLineAfter);
		const renderWhitespace = opts.get(EditorOption.renderWhitespace);
		const renderControlCharacters = opts.get(EditorOption.renderControlCharacters);
		const fontLigatures = opts.get(EditorOption.fontLigatures);
		const fontInfo = opts.get(EditorOption.fontInfo);
		const lineHeight = opts.get(EditorOption.lineHeight);

		const sb = createStringBuilder(10000);
		sb.appendASCIIString('<div style="opacity: 0.467">');

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
		sb.appendASCIIString('</div>');

		Configuration.applyFontInfoSlow(domNode, fontInfo);
		const html = sb.build();
		const trustedhtml = ttPolicy ? ttPolicy.createHTML(html) : html;
		domNode.innerHTML = trustedhtml as string;
	}
}
