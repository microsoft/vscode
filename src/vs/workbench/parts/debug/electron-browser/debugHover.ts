/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import lifecycle = require('vs/base/common/lifecycle');
import {TPromise} from 'vs/base/common/winjs.base';
import {CommonKeybindings} from 'vs/base/common/keyCodes';
import dom = require('vs/base/browser/dom');
import * as nls from 'vs/nls';
import {ITree} from 'vs/base/parts/tree/browser/tree';
import {Tree} from 'vs/base/parts/tree/browser/treeImpl';
import {DefaultController, ICancelableEvent} from 'vs/base/parts/tree/browser/treeDefaults';
import {IConfigurationChangedEvent} from 'vs/editor/common/editorCommon';
import editorbrowser = require('vs/editor/browser/editorBrowser');
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import debug = require('vs/workbench/parts/debug/common/debug');
import {evaluateExpression, Expression} from 'vs/workbench/parts/debug/common/debugModel';
import viewer = require('vs/workbench/parts/debug/electron-browser/debugViewer');
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';

const $ = dom.$;
const debugTreeOptions = {
	indentPixels: 6,
	twistiePixels: 15,
	ariaLabel: nls.localize('treeAriaLabel', "Debug Hover")
};
const MAX_ELEMENTS_SHOWN = 18;
const MAX_VALUE_RENDER_LENGTH_IN_HOVER = 4096;

export class DebugHoverWidget implements editorbrowser.IContentWidget {

	public static ID = 'debug.hoverWidget';
	// editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	private domNode: HTMLElement;
	public isVisible: boolean;
	private tree: ITree;
	private showAtPosition: Position;
	private highlightDecorations: string[];
	private complexValueContainer: HTMLElement;
	private treeContainer: HTMLElement;
	private complexValueTitle: HTMLElement;
	private valueContainer: HTMLElement;
	private stoleFocus: boolean;
	private toDispose: lifecycle.IDisposable[];

	constructor(private editor: editorbrowser.ICodeEditor, private debugService: debug.IDebugService, private instantiationService: IInstantiationService) {
		this.domNode = $('.debug-hover-widget monaco-editor-background');
		this.complexValueContainer = dom.append(this.domNode, $('.complex-value'));
		this.complexValueTitle = dom.append(this.complexValueContainer, $('.title'));
		this.treeContainer = dom.append(this.complexValueContainer, $('.debug-hover-tree'));
		this.treeContainer.setAttribute('role', 'tree');
		this.tree = new Tree(this.treeContainer, {
			dataSource: new viewer.VariablesDataSource(this.debugService),
			renderer: this.instantiationService.createInstance(VariablesHoverRenderer),
			controller: new DebugHoverController(editor)
		}, debugTreeOptions);

		this.toDispose = [];
		this.registerListeners();

		this.valueContainer = dom.append(this.domNode, $('.value'));
		this.valueContainer.tabIndex = 0;
		this.valueContainer.setAttribute('role', 'tooltip');

		this.isVisible = false;
		this.showAtPosition = null;
		this.highlightDecorations = [];

		this.editor.addContentWidget(this);
		this.editor.applyFontInfo(this.domNode);
	}

	private registerListeners(): void {
		this.toDispose.push(this.tree.addListener2('item:expanded', () => {
			this.layoutTree();
		}));
		this.toDispose.push(this.tree.addListener2('item:collapsed', () => {
			this.layoutTree();
		}));

		this.toDispose.push(dom.addStandardDisposableListener(this.domNode, 'keydown', (e: IKeyboardEvent) => {
			if (e.equals(CommonKeybindings.ESCAPE)) {
				this.hide();
			}
		}));
		this.toDispose.push(this.editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.fontInfo) {
				this.editor.applyFontInfo(this.domNode);
			}
		}));
	}

	public getId(): string {
		return DebugHoverWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this.domNode;
	}

	private getExactExpressionRange(lineContent: string, range: Range) : Range {
		let matchingExpression = undefined;
		let startOffset = 0;

		// Some example supported expressions: myVar.prop, a.b.c.d, myVar?.prop, myVar->prop, MyClass::StaticProp, *myVar
		// Match any character except a set of characters which often break interesting sub-expressions
		let expression: RegExp = /([^()\[\]{}<>\s+\-/%~#^;=|,`!]|\->)+/g;
		let result = undefined;

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
			let subExpressionResult = undefined;
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

	public showAt(range: Range, hoveringOver: string, focus: boolean): TPromise<void> {
		const pos = range.getStartPosition();
		const focusedStackFrame = this.debugService.getViewModel().getFocusedStackFrame();
		if (!hoveringOver || !focusedStackFrame || (focusedStackFrame.source.uri.toString() !== this.editor.getModel().uri.toString())) {
			return;
		}

		const session = this.debugService.getActiveSession();
		const lineContent = this.editor.getModel().getLineContent(pos.lineNumber);
		const expressionRange = this.getExactExpressionRange(lineContent, range);
		// use regex to extract the sub-expression #9821
		const matchingExpression = lineContent.substring(expressionRange.startColumn - 1, expressionRange.endColumn);

		const evaluatedExpression = session.configuration.capabilities.supportsEvaluateForHovers ?
			evaluateExpression(session, focusedStackFrame, new Expression(matchingExpression, true), 'hover') :
			this.findExpressionInStackFrame(matchingExpression.split('.').map(word => word.trim()).filter(word => !!word));

		return evaluatedExpression.then(expression => {
			if (!expression || !expression.available) {
				this.hide();
				return;
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

	private doFindExpression(container: debug.IExpressionContainer, namesToFind: string[]): TPromise<debug.IExpression> {
		return container.getChildren(this.debugService).then(children => {
			// look for our variable in the list. First find the parents of the hovered variable if there are any.
			// some languages pass the type as part of the name, so need to check if the last word of the name matches.
			const filtered = children.filter(v => typeof v.name === 'string' && (namesToFind[0] === v.name || namesToFind[0] === v.name.substr(v.name.lastIndexOf(' ') + 1)));
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

	private findExpressionInStackFrame(namesToFind: string[]): TPromise<debug.IExpression> {
		return this.debugService.getViewModel().getFocusedStackFrame().getScopes(this.debugService)
			// no expensive scopes
			.then(scopes => scopes.filter(scope => !scope.expensive))
			.then(scopes => TPromise.join(scopes.map(scope => this.doFindExpression(scope, namesToFind))))
			.then(expressions => expressions.filter(exp => !!exp))
			// only show if there are no duplicates across scopes
			.then(expressions => expressions.length === 1 ? expressions[0] : null);
	}

	private doShow(position: Position, expression: debug.IExpression, focus: boolean, forceValueHover = false): TPromise<void> {
		this.showAtPosition = position;
		this.isVisible = true;
		this.stoleFocus = focus;

		if (expression.reference === 0 || forceValueHover) {
			this.complexValueContainer.hidden = true;
			this.valueContainer.hidden = false;
			viewer.renderExpressionValue(expression, this.valueContainer, false, MAX_VALUE_RENDER_LENGTH_IN_HOVER);
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
				this.treeContainer.style.height = `${ height }px`;
				this.tree.layout();
			}
		}
	}

	public hide(): void {
		if (!this.isVisible) {
			return;
		}

		this.isVisible = false;
		this.editor.deltaDecorations(this.highlightDecorations, []);
		this.highlightDecorations = [];
		this.editor.layoutContentWidget(this);
		if (this.stoleFocus) {
			this.editor.focus();
		}
	}

	public getPosition(): editorbrowser.IContentWidgetPosition {
		return this.isVisible ? {
			position: this.showAtPosition,
			preference: [
				editorbrowser.ContentWidgetPositionPreference.ABOVE,
				editorbrowser.ContentWidgetPositionPreference.BELOW
			]
		} : null;
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}

class DebugHoverController extends DefaultController {

	constructor(private editor: editorbrowser.ICodeEditor) {
		super();
	}

	/* protected */ public onLeftClick(tree: ITree, element: any, eventish: ICancelableEvent, origin: string = 'mouse'): boolean {
		if (element.reference > 0) {
			super.onLeftClick(tree, element, eventish, origin);
			tree.clearFocus();
			tree.deselect(element);
			this.editor.focus();
		}

		return true;
	}
}

class VariablesHoverRenderer extends viewer.VariablesRenderer {

	public getHeight(tree: ITree, element: any): number {
		return 18;
	}
}
