/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as lifecycle from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import * as dom from 'vs/base/browser/dom';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ICancelableEvent, OpenMode } from 'vs/base/parts/tree/browser/treeDefaults';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IContentWidget, ICodeEditor, IContentWidgetPosition, ContentWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDebugService, IExpression, IExpressionContainer } from 'vs/workbench/parts/debug/common/debug';
import { Expression } from 'vs/workbench/parts/debug/common/debugModel';
import { renderExpressionValue } from 'vs/workbench/parts/debug/browser/baseDebugView';
import { VariablesDataSource, VariablesRenderer } from 'vs/workbench/parts/debug/electron-browser/variablesView';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { editorHoverBackground, editorHoverBorder } from 'vs/platform/theme/common/colorRegistry';
import { WorkbenchTree, WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { getExactExpressionStartAndEnd } from 'vs/workbench/parts/debug/common/debugUtils';

const $ = dom.$;
const MAX_ELEMENTS_SHOWN = 18;

export class DebugHoverWidget implements IContentWidget {

	public static readonly ID = 'debug.hoverWidget';
	// editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	private _isVisible: boolean;
	private domNode: HTMLElement;
	private tree: WorkbenchTree;
	private showAtPosition: Position;
	private highlightDecorations: string[];
	private complexValueContainer: HTMLElement;
	private treeContainer: HTMLElement;
	private complexValueTitle: HTMLElement;
	private valueContainer: HTMLElement;
	private stoleFocus: boolean;
	private toDispose: lifecycle.IDisposable[];
	private scrollbar: DomScrollableElement;

	constructor(
		private editor: ICodeEditor,
		private debugService: IDebugService,
		private instantiationService: IInstantiationService,
		private themeService: IThemeService
	) {
		this.toDispose = [];

		this._isVisible = false;
		this.showAtPosition = null;
		this.highlightDecorations = [];
	}

	private create(): void {
		this.domNode = $('.debug-hover-widget');
		this.complexValueContainer = dom.append(this.domNode, $('.complex-value'));
		this.complexValueTitle = dom.append(this.complexValueContainer, $('.title'));
		this.treeContainer = dom.append(this.complexValueContainer, $('.debug-hover-tree'));
		this.treeContainer.setAttribute('role', 'tree');
		this.tree = this.instantiationService.createInstance(WorkbenchTree, this.treeContainer, {
			dataSource: new VariablesDataSource(),
			renderer: this.instantiationService.createInstance(VariablesHoverRenderer),
			controller: this.instantiationService.createInstance(DebugHoverController, this.editor)
		}, {
				indentPixels: 6,
				horizontalScrollMode: ScrollbarVisibility.Auto,
				twistiePixels: 15,
				ariaLabel: nls.localize('treeAriaLabel', "Debug Hover")
			});

		this.valueContainer = $('.value');
		this.valueContainer.tabIndex = 0;
		this.valueContainer.setAttribute('role', 'tooltip');
		this.scrollbar = new DomScrollableElement(this.valueContainer, { horizontal: ScrollbarVisibility.Hidden });
		this.domNode.appendChild(this.scrollbar.getDomNode());
		this.toDispose.push(this.scrollbar);

		this.editor.applyFontInfo(this.domNode);

		this.toDispose.push(attachStylerCallback(this.themeService, { editorHoverBackground, editorHoverBorder }, colors => {
			if (colors.editorHoverBackground) {
				this.domNode.style.backgroundColor = colors.editorHoverBackground.toString();
			} else {
				this.domNode.style.backgroundColor = null;
			}
			if (colors.editorHoverBorder) {
				this.domNode.style.border = `1px solid ${colors.editorHoverBorder}`;
			} else {
				this.domNode.style.border = null;
			}
		}));

		this.registerListeners();
		this.editor.addContentWidget(this);
	}

	private registerListeners(): void {
		this.toDispose.push(this.tree.onDidExpandItem(() => {
			this.layoutTree();
		}));
		this.toDispose.push(this.tree.onDidCollapseItem(() => {
			this.layoutTree();
		}));

		this.toDispose.push(dom.addStandardDisposableListener(this.domNode, 'keydown', (e: IKeyboardEvent) => {
			if (e.equals(KeyCode.Escape)) {
				this.hide();
			}
		}));
		this.toDispose.push(this.editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.fontInfo) {
				this.editor.applyFontInfo(this.domNode);
			}
		}));
	}

	public isVisible(): boolean {
		return this._isVisible;
	}

	public getId(): string {
		return DebugHoverWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this.domNode;
	}

	public showAt(range: Range, focus: boolean): TPromise<void> {
		const pos = range.getStartPosition();

		const session = this.debugService.getViewModel().focusedSession;
		const lineContent = this.editor.getModel().getLineContent(pos.lineNumber);
		const { start, end } = getExactExpressionStartAndEnd(lineContent, range.startColumn, range.endColumn);
		// use regex to extract the sub-expression #9821
		const matchingExpression = lineContent.substring(start - 1, end);
		if (!matchingExpression) {
			return Promise.resolve(this.hide());
		}

		let promise: TPromise<IExpression>;
		if (session.capabilities.supportsEvaluateForHovers) {
			const result = new Expression(matchingExpression);
			promise = result.evaluate(session, this.debugService.getViewModel().focusedStackFrame, 'hover').then(() => result);
		} else {
			promise = this.findExpressionInStackFrame(matchingExpression.split('.').map(word => word.trim()).filter(word => !!word));
		}

		return promise.then(expression => {
			if (!expression || (expression instanceof Expression && !expression.available)) {
				this.hide();
				return undefined;
			}

			this.highlightDecorations = this.editor.deltaDecorations(this.highlightDecorations, [{
				range: new Range(pos.lineNumber, start, pos.lineNumber, start + matchingExpression.length),
				options: DebugHoverWidget._HOVER_HIGHLIGHT_DECORATION_OPTIONS
			}]);

			return this.doShow(pos, expression, focus);
		});
	}

	private static _HOVER_HIGHLIGHT_DECORATION_OPTIONS = ModelDecorationOptions.register({
		className: 'hoverHighlight'
	});

	private doFindExpression(container: IExpressionContainer, namesToFind: string[]): TPromise<IExpression> {
		if (!container) {
			return Promise.resolve(null);
		}

		return container.getChildren().then(children => {
			// look for our variable in the list. First find the parents of the hovered variable if there are any.
			const filtered = children.filter(v => namesToFind[0] === v.name);
			if (filtered.length !== 1) {
				return null;
			}

			if (namesToFind.length === 1) {
				return filtered[0];
			} else {
				return this.doFindExpression(filtered[0], namesToFind.slice(1));
			}
		});
	}

	private findExpressionInStackFrame(namesToFind: string[]): TPromise<IExpression> {
		return this.debugService.getViewModel().focusedStackFrame.getScopes()
			.then(scopes => scopes.filter(s => !s.expensive))
			.then(scopes => Promise.all(scopes.map(scope => this.doFindExpression(scope, namesToFind))))
			.then(expressions => expressions.filter(exp => !!exp))
			// only show if all expressions found have the same value
			.then(expressions => (expressions.length > 0 && expressions.every(e => e.value === expressions[0].value)) ? expressions[0] : null);
	}

	private doShow(position: Position, expression: IExpression, focus: boolean, forceValueHover = false): TPromise<void> {
		if (!this.domNode) {
			this.create();
		}

		this.showAtPosition = position;
		this._isVisible = true;
		this.stoleFocus = focus;

		if (!expression.hasChildren || forceValueHover) {
			this.complexValueContainer.hidden = true;
			this.valueContainer.hidden = false;
			renderExpressionValue(expression, this.valueContainer, {
				showChanged: false,
				preserveWhitespace: true,
				colorize: true
			});
			this.valueContainer.title = '';
			this.editor.layoutContentWidget(this);
			this.scrollbar.scanDomNode();
			if (focus) {
				this.editor.render();
				this.valueContainer.focus();
			}

			return Promise.resolve(null);
		}

		this.valueContainer.hidden = true;
		this.complexValueContainer.hidden = false;

		return this.tree.setInput(expression).then(() => {
			this.complexValueTitle.textContent = expression.value;
			this.complexValueTitle.title = expression.value;
			this.layoutTree();
			this.editor.layoutContentWidget(this);
			this.scrollbar.scanDomNode();
			if (focus) {
				this.editor.render();
				this.tree.domFocus();
			}
		});
	}

	private layoutTree(): void {
		const navigator = this.tree.getNavigator();
		let visibleElementsCount = 0;
		while (navigator.next()) {
			visibleElementsCount++;
		}

		if (visibleElementsCount === 0) {
			this.doShow(this.showAtPosition, this.tree.getInput(), false, true);
		} else {
			const height = Math.min(visibleElementsCount, MAX_ELEMENTS_SHOWN) * 18;

			if (this.treeContainer.clientHeight !== height) {
				this.treeContainer.style.height = `${height}px`;
				this.tree.layout();
			}
		}
	}

	public hide(): void {
		if (!this._isVisible) {
			return;
		}

		this._isVisible = false;
		this.editor.deltaDecorations(this.highlightDecorations, []);
		this.highlightDecorations = [];
		this.editor.layoutContentWidget(this);
		if (this.stoleFocus) {
			this.editor.focus();
		}
	}

	public getPosition(): IContentWidgetPosition {
		return this._isVisible ? {
			position: this.showAtPosition,
			preference: [
				ContentWidgetPositionPreference.ABOVE,
				ContentWidgetPositionPreference.BELOW
			]
		} : null;
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}

class DebugHoverController extends WorkbenchTreeController {

	constructor(
		private editor: ICodeEditor,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({ openMode: OpenMode.SINGLE_CLICK }, configurationService);
	}

	protected onLeftClick(tree: ITree, element: any, eventish: ICancelableEvent, origin = 'mouse'): boolean {
		if (element.reference > 0) {
			super.onLeftClick(tree, element, eventish, origin);
			tree.clearFocus();
			tree.deselect(element);
			this.editor.focus();
		}

		return true;
	}
}

class VariablesHoverRenderer extends VariablesRenderer {

	public getHeight(tree: ITree, element: any): number {
		return 18;
	}
}
