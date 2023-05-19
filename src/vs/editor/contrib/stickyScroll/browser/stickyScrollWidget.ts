/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorLayoutInfo, EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { RenderLineInput, renderViewLine } from 'vs/editor/common/viewLayout/viewLineRenderer';
import { LineDecoration } from 'vs/editor/common/viewLayout/lineDecorations';
import { Position } from 'vs/editor/common/core/position';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import * as dom from 'vs/base/browser/dom';
import 'vs/css!./stickyScroll';
import { CodeLensItem, CodeLensModel } from 'vs/editor/contrib/codelens/browser/codelens';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Command } from 'vs/editor/common/languages';

export class StickyScrollWidgetState {
	constructor(
		readonly lineNumbers: number[],
		readonly lastLineRelativePosition: number,
		readonly codeLensModel: CodeLensModel | undefined,
	) { }
}

const _ttPolicy = window.trustedTypes?.createPolicy('stickyScrollViewLayer', { createHTML: value => value });

export class StickyScrollWidget extends Disposable implements IOverlayWidget {

	private readonly _layoutInfo: EditorLayoutInfo;
	private readonly _rootDomNode: HTMLElement = document.createElement('div');
	private readonly _disposableStore = this._register(new DisposableStore());

	private _lineNumbers: number[] = [];
	private _lastLineRelativePosition: number = 0;
	private _codeLensModel: CodeLensModel | undefined = undefined;
	private _hoverOnLine: number = -1;
	private _hoverOnColumn: number = -1;
	private readonly _commands = new Map<string, Command>();

	constructor(
		private readonly _editor: ICodeEditor
	) {
		super();
		this._layoutInfo = this._editor.getLayoutInfo();
		this._rootDomNode = document.createElement('div');
		this._rootDomNode.className = 'sticky-widget';
		this._rootDomNode.classList.toggle('peek', _editor instanceof EmbeddedCodeEditorWidget);
		this._rootDomNode.style.width = `${this._layoutInfo.width - this._layoutInfo.minimap.minimapCanvasOuterWidth - this._layoutInfo.verticalScrollbarWidth}px`;
	}

	get hoverOnLine(): number {
		return this._hoverOnLine;
	}

	get hoverOnColumn(): number {
		return this._hoverOnColumn;
	}

	get lineNumbers(): number[] {
		return this._lineNumbers;
	}

	get codeLineCount(): number {
		return this._lineNumbers.length;
	}

	getCurrentLines(): readonly number[] {
		return this._lineNumbers;
	}

	setState(state: StickyScrollWidgetState): void {
		dom.clearNode(this._rootDomNode);
		this._disposableStore.clear();
		this._lineNumbers.length = 0;
		const editorLineHeight = this._editor.getOption(EditorOption.lineHeight);
		const futureWidgetHeight = state.lineNumbers.length * editorLineHeight + state.lastLineRelativePosition;

		if (futureWidgetHeight > 0) {
			this._lastLineRelativePosition = state.lastLineRelativePosition;
			this._lineNumbers = state.lineNumbers;
		} else {
			this._lastLineRelativePosition = 0;
			this._lineNumbers = [];
		}
		this._codeLensModel = state.codeLensModel;
		this._renderRootNode();
	}

	private _renderRootNode(): void {
		if (!this._editor._getViewModel()) {
			return;
		}

		let codeLensLineHeightCount = 0;

		// If there is no lineNumbers, check if there are codelens for the first line of editor's visible ranges
		if (!this._lineNumbers.length) {
			const firstLineNumberOfVisibleRanges = this._editor.getVisibleRanges()[0].startLineNumber;
			const matchedCodelensStartLineNumber = this._getCodeLensStartLineNumber(firstLineNumberOfVisibleRanges);

			if (matchedCodelensStartLineNumber) {
				const codeLensChildNode = this._renderCodeLensLine(matchedCodelensStartLineNumber);
				if (codeLensChildNode) {
					this._rootDomNode.appendChild(codeLensChildNode);
					codeLensLineHeightCount += codeLensChildNode.clientHeight;
				}
			}
		} else {
			for (const [index, line] of this._lineNumbers.entries()) {
				const codeLensChildNode = this._renderCodeLensLine(line);
				if (codeLensChildNode) {
					this._rootDomNode.appendChild(codeLensChildNode);
					codeLensLineHeightCount += codeLensChildNode.clientHeight;
				}
				const childNode = this._renderChildNode(index, line);
				this._rootDomNode.appendChild(childNode);
			}
		}

		const editorLineHeight = this._editor.getOption(EditorOption.lineHeight);
		const widgetHeight: number = this._lineNumbers.length * editorLineHeight + codeLensLineHeightCount + this._lastLineRelativePosition;
		this._rootDomNode.style.display = widgetHeight > 0 ? 'block' : 'none';
		this._rootDomNode.style.height = widgetHeight.toString() + 'px';
		this._rootDomNode.setAttribute('role', 'list');
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;

		if (minimapSide === 'left') {
			this._rootDomNode.style.marginLeft = this._editor.getLayoutInfo().minimap.minimapCanvasOuterWidth + 'px';
		}
	}

	private _renderCodeLensLine(lineNumber: number) {
		this._commands.clear();

		const codeLensItems = this._groupCodeLensModel(this._codeLensModel);
		if (!codeLensItems?.length) {
			return;
		}

		const lineCodeLensItems = codeLensItems.find(cl => cl[0].symbol?.range?.startLineNumber === lineNumber);
		if (!lineCodeLensItems?.length) {
			return;
		}

		const child = document.createElement('div');
		const layoutInfo = this._editor.getLayoutInfo();
		const width = layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth;
		child.className = 'sticky-line-root';
		child.setAttribute('role', 'listitem');
		child.tabIndex = 0;
		child.style.cssText = `width: ${width}px; z-index: 0;`;
		const codeLensCont = document.createElement('div');
		codeLensCont.className = 'codelens-decoration';
		codeLensCont.style.cssText = `position: relative; left: ${layoutInfo.contentLeft}px;`;
		child.appendChild(codeLensCont);

		// Convert codelens startColumn to space and use renderViewLine to render it
		const viewModel = this._editor._getViewModel();
		const viewLineNumber = viewModel!.coordinatesConverter.convertModelPositionToViewPosition(new Position(lineNumber, 1)).lineNumber;
		const lineRenderingData = viewModel!.getViewLineRenderingData(viewLineNumber);
		const renderLineInput: RenderLineInput = new RenderLineInput(
			true,
			true,
			'\u00a0'.repeat(lineCodeLensItems[0].symbol.range.startColumn - 1),
			false,
			true,
			false,
			0,
			lineRenderingData.tokens,
			[],
			lineRenderingData.tabSize,
			1,
			1, 1, 1, 500, 'none', true, true, null
		);
		const sb = new StringBuilder(2000);
		renderViewLine(renderLineInput, sb);
		let newLine;
		if (_ttPolicy) {
			newLine = _ttPolicy.createHTML(sb.build() as string);
		} else {
			newLine = sb.build();
		}
		const indentNodeChild = document.createElement('span');
		indentNodeChild.innerHTML = newLine as string;
		this._editor.applyFontInfo(indentNodeChild);
		codeLensCont.append(indentNodeChild);

		// Render codeLens commands
		const children: HTMLElement[] = [];
		lineCodeLensItems.forEach((lens, i) => {
			if (lens?.symbol?.command) {
				const title = renderLabelWithIcons(lens.symbol.command?.title?.trim());
				if (lens.symbol.command?.id) {
					children.push(dom.$('a', { id: String(i), title: lens.symbol.command?.tooltip, role: 'button' }, ...title));
					this._commands.set(String(i), lens.symbol.command);
				} else {
					children.push(dom.$('span', { title: lens.symbol.command?.tooltip }, ...title));
				}
				if (i + 1 < lineCodeLensItems.length) {
					children.push(dom.$('span', undefined, '\u00a0|\u00a0'));
				}
			}
		});
		codeLensCont.append(...children);

		return child;
	}

	private _getCodeLensStartLineNumber(lineNumber: number) {
		const codeLensItems = this._groupCodeLensModel(this._codeLensModel);
		if (!codeLensItems?.length) {
			return;
		}

		const matchedCodeLens = codeLensItems.find(cl => {
			const clRange = cl[0]?.symbol?.range;

			if (clRange) {
				if (lineNumber >= clRange.startLineNumber && lineNumber <= clRange.endLineNumber) {
					return true;
				}
			}

			return false;
		});

		return matchedCodeLens?.[0].symbol?.range?.startLineNumber;
	}

	private _groupCodeLensModel(codeLensModel: CodeLensModel | undefined): CodeLensItem[][] {
		if (!codeLensModel) {
			return [];
		}

		const maxLineNumber = this._editor.getModel()?.getLineCount() || 0;
		const groups: CodeLensItem[][] = [];
		let lastGroup: CodeLensItem[] | undefined;

		for (const symbol of codeLensModel.lenses) {
			const line = symbol.symbol.range.startLineNumber;
			if (line < 1 || line > maxLineNumber) {
				// invalid code lens
				continue;
			} else if (lastGroup && lastGroup[lastGroup.length - 1].symbol.range.startLineNumber === line) {
				// on same line as previous
				lastGroup.push(symbol);
			} else {
				// on later line as previous
				lastGroup = [symbol];
				groups.push(lastGroup);
			}
		}

		return groups;
	}

	private _renderChildNode(index: number, line: number): HTMLDivElement {
		const child = document.createElement('div');
		const viewModel = this._editor._getViewModel();
		const viewLineNumber = viewModel!.coordinatesConverter.convertModelPositionToViewPosition(new Position(line, 1)).lineNumber;
		const lineRenderingData = viewModel!.getViewLineRenderingData(viewLineNumber);
		const layoutInfo = this._editor.getLayoutInfo();
		const width = layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth;
		const minimapSide = this._editor.getOption(EditorOption.minimap).side;
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);

		let actualInlineDecorations: LineDecoration[];
		try {
			actualInlineDecorations = LineDecoration.filter(lineRenderingData.inlineDecorations, viewLineNumber, lineRenderingData.minColumn, lineRenderingData.maxColumn);
		} catch (err) {
			actualInlineDecorations = [];
		}

		const renderLineInput: RenderLineInput = new RenderLineInput(true, true, lineRenderingData.content,
			lineRenderingData.continuesWithWrappedLine,
			lineRenderingData.isBasicASCII, lineRenderingData.containsRTL, 0,
			lineRenderingData.tokens, actualInlineDecorations,
			lineRenderingData.tabSize, lineRenderingData.startVisibleColumn,
			1, 1, 1, 500, 'none', true, true, null
		);

		const sb = new StringBuilder(2000);
		renderViewLine(renderLineInput, sb);

		let newLine;
		if (_ttPolicy) {
			newLine = _ttPolicy.createHTML(sb.build() as string);
		} else {
			newLine = sb.build();
		}

		const lineHTMLNode = document.createElement('span');
		lineHTMLNode.className = 'sticky-line';
		lineHTMLNode.classList.add(`stickyLine${line}`);
		lineHTMLNode.style.lineHeight = `${lineHeight}px`;
		lineHTMLNode.innerHTML = newLine as string;

		const lineNumberHTMLNode = document.createElement('span');
		lineNumberHTMLNode.className = 'sticky-line';
		lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
		if (minimapSide === 'left') {
			lineNumberHTMLNode.style.width = `${layoutInfo.contentLeft - layoutInfo.minimap.minimapCanvasOuterWidth}px`;
		} else if (minimapSide === 'right') {
			lineNumberHTMLNode.style.width = `${layoutInfo.contentLeft}px`;
		}

		const innerLineNumberHTML = document.createElement('span');
		if (lineNumberOption.renderType === RenderLineNumbersType.On || lineNumberOption.renderType === RenderLineNumbersType.Interval && line % 10 === 0) {
			innerLineNumberHTML.innerText = line.toString();
		} else if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
			innerLineNumberHTML.innerText = Math.abs(line - this._editor.getPosition()!.lineNumber).toString();
		}
		innerLineNumberHTML.className = 'sticky-line-number';
		innerLineNumberHTML.style.lineHeight = `${lineHeight}px`;
		innerLineNumberHTML.style.width = `${layoutInfo.lineNumbersWidth}px`;
		if (minimapSide === 'left') {
			innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft - layoutInfo.minimap.minimapCanvasOuterWidth}px`;
		} else if (minimapSide === 'right') {
			innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft}px`;
		}
		lineNumberHTMLNode.appendChild(innerLineNumberHTML);

		this._editor.applyFontInfo(lineHTMLNode);
		this._editor.applyFontInfo(innerLineNumberHTML);

		child.appendChild(lineNumberHTMLNode);
		child.appendChild(lineHTMLNode);

		child.className = 'sticky-line-root';
		child.setAttribute('role', 'listitem');
		child.tabIndex = 0;
		child.style.lineHeight = `${lineHeight}px`;
		child.style.width = `${width}px`;
		child.style.height = `${lineHeight}px`;
		child.style.zIndex = '0';

		// Special case for the last line of sticky scroll
		if (index === this._lineNumbers.length - 1) {
			child.style.position = 'relative';
			child.style.zIndex = '-1';
			child.style.top = this._lastLineRelativePosition + 'px';
		}

		// Each child has a listener which fires when the mouse hovers over the child
		this._disposableStore.add(dom.addDisposableListener(child, 'mouseover', (e) => {
			if (this._editor.hasModel()) {
				const mouseOverEvent = new StandardMouseEvent(e);
				const text = mouseOverEvent.target.innerText;

				// Line and column number of the hover needed for the control clicking feature
				this._hoverOnLine = line;
				// TODO: workaround to find the column index, perhaps need a more solid solution
				this._hoverOnColumn = this._editor.getModel().getLineContent(line).indexOf(text) + 1 || -1;
			}
		}));

		return child;
	}

	getId(): string {
		return 'editor.contrib.stickyScrollWidget';
	}

	getDomNode(): HTMLElement {
		return this._rootDomNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: null
		};
	}

	getCommand(link: HTMLLinkElement) {
		return link.parentElement?.parentElement?.parentElement === this._rootDomNode ? this._commands.get(link.id) : undefined;
	}
}
