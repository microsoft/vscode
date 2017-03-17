/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as lifecycle from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { KeyCode } from 'vs/base/common/keyCodes';
import * as dom from 'vs/base/browser/dom';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { DefaultController, ICancelableEvent, ClickBehavior } from 'vs/base/parts/tree/browser/treeDefaults';
import { IConfigurationChangedEvent } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IContentWidget, ICodeEditor, IContentWidgetPosition, ContentWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDebugService, IExpression, IExpressionContainer } from 'vs/workbench/parts/debug/common/debug';
import { Expression } from 'vs/workbench/parts/debug/common/debugModel';
import { VariablesRenderer, renderExpressionValue, VariablesDataSource } from 'vs/workbench/parts/debug/electron-browser/debugViewer';
import { IListService } from 'vs/platform/list/browser/listService';

const $ = dom.$;
const MAX_ELEMENTS_SHOWN = 18;
const MAX_VALUE_RENDER_LENGTH_IN_HOVER = 4096;

export class DebugHoverWidget implements IContentWidget {

	public static ID = 'debug.hoverWidget';
	// editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	private _isVisible: boolean;
	private domNode: HTMLElement;
	private tree: ITree;
	private showAtPosition: Position;
	private highlightDecorations: string[];
	private complexValueContainer: HTMLElement;
	private treeContainer: HTMLElement;
	private complexValueTitle: HTMLElement;
	private valueContainer: HTMLElement;
	private stoleFocus: boolean;
	private toDispose: lifecycle.IDisposable[];

	constructor(
		private editor: ICodeEditor,
		private debugService: IDebugService,
		private listService: IListService,
		instantiationService: IInstantiationService
	) {
		this.toDispose = [];
		this.create(instantiationService);
		this.registerListeners();

		this.valueContainer = dom.append(this.domNode, $('.value'));
		this.valueContainer.tabIndex = 0;
		this.valueContainer.setAttribute('role', 'tooltip');

		this._isVisible = false;
		this.showAtPosition = null;
		this.highlightDecorations = [];

		this.editor.addContentWidget(this);
		this.editor.applyFontInfo(this.domNode);
	}

	private create(instantiationService: IInstantiationService): void {
		this.domNode = $('.debug-hover-widget');
		this.complexValueContainer = dom.append(this.domNode, $('.complex-value'));
		this.complexValueTitle = dom.append(this.complexValueContainer, $('.title'));
		this.treeContainer = dom.append(this.complexValueContainer, $('.debug-hover-tree'));
		this.treeContainer.setAttribute('role', 'tree');
		this.tree = new Tree(this.treeContainer, {
			dataSource: new VariablesDataSource(),
			renderer: instantiationService.createInstance(VariablesHoverRenderer),
			controller: new DebugHoverController(this.editor)
		}, {
				indentPixels: 6,
				twistiePixels: 15,
				ariaLabel: nls.localize('treeAriaLabel', "Debug Hover"),
				keyboardSupport: false
			});

		this.toDispose.push(this.listService.register(this.tree));
	}

	private registerListeners(): void {
		this.toDispose.push(this.tree.addListener2('item:expanded', () => {
			this.layoutTree();
		}));
		this.toDispose.push(this.tree.addListener2('item:collapsed', () => {
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

	private getExactExpressionRange(lineContent: string, range: Range): Range {
		let matchingExpression: string = undefined;
		let startOffset = 0;

		// Some example supported expressions: myVar.prop, a.b.c.d, myVar?.prop, myVar->prop, MyClass::StaticProp, *myVar
		// Match any character except a set of characters which often break interesting sub-expressions
		let expression: RegExp = /([^()\[\]{}<>\s+\-/%~#^;=|,`!]|\->)+/g;
		let result: RegExpExecArray = undefined;

		// First find the full expression under the cursor
		while (result = expression.exec(lineContent)) {
			let start = result.index + 1;
			let end = start + result[0].length;

			if (start <= range.startColumn && end >= range.endColumn) {
				matchingExpression = result[0];
				startOffset = start;
				break;
			}
		}

		// If there are non-word characters after the cursor, we want to truncate the expression then.
		// For example in expression 'a.b.c.d', if the focus was under 'b', 'a.b' would be evaluated.
		if (matchingExpression) {
			let subExpression: RegExp = /\w+/g;
			let subExpressionResult: RegExpExecArray = undefined;
			while (subExpressionResult = subExpression.exec(matchingExpression)) {
				let subEnd = subExpressionResult.index + 1 + startOffset + subExpressionResult[0].length;
				if (subEnd >= range.endColumn) {
					break;
				}
			}

			if (subExpressionResult) {
				matchingExpression = matchingExpression.substring(0, subExpression.lastIndex);
			}
		}

		return matchingExpression ?
			new Range(range.startLineNumber, startOffset, range.endLineNumber, startOffset + matchingExpression.length - 1) :
			new Range(range.startLineNumber, 0, range.endLineNumber, 0);
	}

	public showAt(range: Range, focus: boolean): TPromise<void> {
		const pos = range.getStartPosition();

		const process = this.debugService.getViewModel().focusedProcess;
		const lineContent = this.editor.getModel().getLineContent(pos.lineNumber);
		const expressionRange = this.getExactExpressionRange(lineContent, range);
		// use regex to extract the sub-expression #9821
		const matchingExpression = lineContent.substring(expressionRange.startColumn - 1, expressionRange.endColumn);
		if (!matchingExpression) {
			return TPromise.as(this.hide());
		}

		let promise: TPromise<IExpression>;
		if (process.session.capabilities.supportsEvaluateForHovers) {
			const result = new Expression(matchingExpression);
			promise = result.evaluate(process, this.debugService.getViewModel().focusedStackFrame, 'hover').then(() => result);
		} else {
			promise = this.findExpressionInStackFrame(matchingExpression.split('.').map(word => word.trim()).filter(word => !!word), expressionRange);
		}

		return promise.then(expression => {
			if (!expression || (expression instanceof Expression && !expression.available)) {
				this.hide();
				return undefined;
			}

			this.highlightDecorations = this.editor.deltaDecorations(this.highlightDecorations, [{
				range: new Range(pos.lineNumber, expressionRange.startColumn, pos.lineNumber, expressionRange.startColumn + matchingExpression.length),
				options: {
					className: 'hoverHighlight'
				}
			}]);

			return this.doShow(pos, expression, focus);
		});
	}

	private doFindExpression(container: IExpressionContainer, namesToFind: string[]): TPromise<IExpression> {
		if (!container) {
			return TPromise.as(null);
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

	private findExpressionInStackFrame(namesToFind: string[], expressionRange: Range): TPromise<IExpression> {
		return this.debugService.getViewModel().focusedStackFrame.getMostSpecificScopes(expressionRange)
			.then(scopes => TPromise.join(scopes.map(scope => this.doFindExpression(scope, namesToFind))))
			.then(expressions => expressions.filter(exp => !!exp))
			// only show if all expressions found have the same value
			.then(expressions => (expressions.length > 0 && expressions.every(e => e.value === expressions[0].value)) ? expressions[0] : null);
	}

	private doShow(position: Position, expression: IExpression, focus: boolean, forceValueHover = false): TPromise<void> {
		this.showAtPosition = position;
		this._isVisible = true;
		this.stoleFocus = focus;

		if (!expression.hasChildren || forceValueHover) {
			this.complexValueContainer.hidden = true;
			this.valueContainer.hidden = false;
			renderExpressionValue(expression, this.valueContainer, {
				showChanged: false,
				maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_HOVER,
				preserveWhitespace: true
			});
			this.valueContainer.title = '';
			this.editor.layoutContentWidget(this);
			if (focus) {
				this.editor.render();
				this.valueContainer.focus();
			}

			return TPromise.as(null);
		}

		this.valueContainer.hidden = true;
		this.complexValueContainer.hidden = false;

		return this.tree.setInput(expression).then(() => {
			this.complexValueTitle.textContent = expression.value;
			this.complexValueTitle.title = expression.value;
			this.layoutTree();
			this.editor.layoutContentWidget(this);
			if (focus) {
				this.editor.render();
				this.tree.DOMFocus();
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

class DebugHoverController extends DefaultController {

	constructor(private editor: ICodeEditor) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP, keyboardSupport: false });
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
