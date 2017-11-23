/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction } from 'vs/base/common/actions';
import * as lifecycle from 'vs/base/common/lifecycle';
import * as errors from 'vs/base/common/errors';
import { isFullWidthCharacter, removeAnsiEscapeCodes, endsWith } from 'vs/base/common/strings';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import * as dom from 'vs/base/browser/dom';
import severity from 'vs/base/common/severity';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { ITree, IAccessibilityProvider, ContextMenuEvent, IDataSource, IRenderer, IActionProvider } from 'vs/base/parts/tree/browser/tree';
import { ICancelableEvent } from 'vs/base/parts/tree/browser/treeDefaults';
import { IExpressionContainer, IExpression, IReplElementSource } from 'vs/workbench/parts/debug/common/debug';
import { Model, RawObjectReplElement, Expression, SimpleReplElement, Variable } from 'vs/workbench/parts/debug/common/debugModel';
import { renderVariable, renderExpressionValue, IVariableTemplateData, BaseDebugController } from 'vs/workbench/parts/debug/electron-browser/baseDebugView';
import { ClearReplAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { CopyAction, CopyAllAction } from 'vs/workbench/parts/debug/electron-browser/electronDebugActions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LinkDetector } from 'vs/workbench/parts/debug/browser/linkDetector';

const $ = dom.$;

export class ReplExpressionsDataSource implements IDataSource {

	public getId(tree: ITree, element: any): string {
		return element.getId();
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof Model || (<IExpressionContainer>element).hasChildren;
	}

	public getChildren(tree: ITree, element: any): TPromise<any> {
		if (element instanceof Model) {
			return TPromise.as(element.getReplElements());
		}
		if (element instanceof RawObjectReplElement) {
			return element.getChildren();
		}
		if (element instanceof SimpleReplElement) {
			return TPromise.as(null);
		}

		return (<IExpression>element).getChildren();
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

interface IExpressionTemplateData {
	input: HTMLElement;
	output: HTMLElement;
	value: HTMLElement;
	annotation: HTMLElement;
}

interface ISimpleReplElementTemplateData {
	container: HTMLElement;
	value: HTMLElement;
	source: HTMLElement;
	getReplElementSource(): IReplElementSource;
	toDispose: lifecycle.IDisposable[];
}

interface IRawObjectReplTemplateData {
	container: HTMLElement;
	expression: HTMLElement;
	name: HTMLElement;
	value: HTMLElement;
	annotation: HTMLElement;
}

export class ReplExpressionsRenderer implements IRenderer {

	private static readonly VARIABLE_TEMPLATE_ID = 'variable';
	private static readonly EXPRESSION_TEMPLATE_ID = 'expressionRepl';
	private static readonly SIMPLE_REPL_ELEMENT_TEMPLATE_ID = 'simpleReplElement';
	private static readonly RAW_OBJECT_REPL_ELEMENT_TEMPLATE_ID = 'rawObject';

	private static readonly LINE_HEIGHT_PX = 18;

	private width: number;
	private characterWidth: number;

	private linkDetector: LinkDetector;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.linkDetector = this.instantiationService.createInstance(LinkDetector);
	}

	public getHeight(tree: ITree, element: any): number {
		if (element instanceof Variable && (element.hasChildren || (element.name !== null))) {
			return ReplExpressionsRenderer.LINE_HEIGHT_PX;
		}
		if (element instanceof Expression && element.hasChildren) {
			return 2 * ReplExpressionsRenderer.LINE_HEIGHT_PX;
		}

		return this.getHeightForString(element.value) + (element instanceof Expression ? this.getHeightForString(element.name) : 0);
	}

	private getHeightForString(s: string): number {
		if (!s || !s.length || !this.width || this.width <= 0 || !this.characterWidth || this.characterWidth <= 0) {
			return ReplExpressionsRenderer.LINE_HEIGHT_PX;
		}

		// Last new line should be ignored since the repl elements are by design split by rows
		if (endsWith(s, '\n')) {
			s = s.substr(0, s.length - 1);
		}
		const lines = removeAnsiEscapeCodes(s).split('\n');
		const numLines = lines.reduce((lineCount: number, line: string) => {
			let lineLength = 0;
			for (let i = 0; i < line.length; i++) {
				lineLength += isFullWidthCharacter(line.charCodeAt(i)) ? 2 : 1;
			}

			return lineCount + Math.floor(lineLength * this.characterWidth / this.width);
		}, lines.length);

		return ReplExpressionsRenderer.LINE_HEIGHT_PX * numLines;
	}

	public setWidth(fullWidth: number, characterWidth: number): void {
		this.width = fullWidth;
		this.characterWidth = characterWidth;
	}

	public getTemplateId(tree: ITree, element: any): string {
		if (element instanceof Variable && element.name) {
			return ReplExpressionsRenderer.VARIABLE_TEMPLATE_ID;
		}
		if (element instanceof Expression) {
			return ReplExpressionsRenderer.EXPRESSION_TEMPLATE_ID;
		}
		if (element instanceof SimpleReplElement || (element instanceof Variable && !element.name)) {
			// Variable with no name is a top level variable which should be rendered like a repl element #17404
			return ReplExpressionsRenderer.SIMPLE_REPL_ELEMENT_TEMPLATE_ID;
		}
		if (element instanceof RawObjectReplElement) {
			return ReplExpressionsRenderer.RAW_OBJECT_REPL_ELEMENT_TEMPLATE_ID;
		}

		return null;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		if (templateId === ReplExpressionsRenderer.VARIABLE_TEMPLATE_ID) {
			let data: IVariableTemplateData = Object.create(null);
			data.expression = dom.append(container, $('.expression'));
			data.name = dom.append(data.expression, $('span.name'));
			data.value = dom.append(data.expression, $('span.value'));

			return data;
		}

		if (templateId === ReplExpressionsRenderer.EXPRESSION_TEMPLATE_ID) {
			let data: IExpressionTemplateData = Object.create(null);
			dom.addClass(container, 'input-output-pair');
			data.input = dom.append(container, $('.input.expression'));
			data.output = dom.append(container, $('.output.expression'));
			data.value = dom.append(data.output, $('span.value'));
			data.annotation = dom.append(data.output, $('span'));

			return data;
		}

		if (templateId === ReplExpressionsRenderer.SIMPLE_REPL_ELEMENT_TEMPLATE_ID) {
			let data: ISimpleReplElementTemplateData = Object.create(null);
			dom.addClass(container, 'output');
			let expression = dom.append(container, $('.output.expression.value-and-source'));

			data.container = container;
			data.value = dom.append(expression, $('span.value'));
			data.source = dom.append(expression, $('.source'));
			data.toDispose = [];
			data.toDispose.push(dom.addDisposableListener(data.source, 'click', e => {
				e.preventDefault();
				e.stopPropagation();
				const source = data.getReplElementSource();
				if (source) {
					source.source.openInEditor(this.editorService, {
						startLineNumber: source.lineNumber,
						startColumn: source.column,
						endLineNumber: source.lineNumber,
						endColumn: source.column
					}).done(undefined, errors.onUnexpectedError);
				}
			}));

			return data;
		}

		if (templateId === ReplExpressionsRenderer.RAW_OBJECT_REPL_ELEMENT_TEMPLATE_ID) {
			let data: IRawObjectReplTemplateData = Object.create(null);
			dom.addClass(container, 'output');

			data.container = container;
			data.expression = dom.append(container, $('.output.expression'));
			data.name = dom.append(data.expression, $('span.name'));
			data.value = dom.append(data.expression, $('span.value'));
			data.annotation = dom.append(data.expression, $('span'));

			return data;
		}
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === ReplExpressionsRenderer.VARIABLE_TEMPLATE_ID) {
			renderVariable(tree, element, templateData, false);
		} else if (templateId === ReplExpressionsRenderer.EXPRESSION_TEMPLATE_ID) {
			this.renderExpression(tree, element, templateData);
		} else if (templateId === ReplExpressionsRenderer.SIMPLE_REPL_ELEMENT_TEMPLATE_ID) {
			this.renderSimpleReplElement(element, templateData);
		} else if (templateId === ReplExpressionsRenderer.RAW_OBJECT_REPL_ELEMENT_TEMPLATE_ID) {
			this.renderRawObjectReplElement(tree, element, templateData);
		}
	}

	private renderExpression(tree: ITree, expression: IExpression, templateData: IExpressionTemplateData): void {
		templateData.input.textContent = expression.name;
		renderExpressionValue(expression, templateData.value, {
			preserveWhitespace: !expression.hasChildren,
			showHover: false,
			colorize: true
		});
		if (expression.hasChildren) {
			templateData.annotation.className = 'annotation octicon octicon-info';
			templateData.annotation.title = nls.localize('stateCapture', "Object state is captured from first evaluation");
		}
	}

	private renderSimpleReplElement(element: SimpleReplElement, templateData: ISimpleReplElementTemplateData): void {

		// value
		dom.clearNode(templateData.value);
		// Reset classes to clear ansi decorations since templates are reused
		templateData.value.className = 'value';
		let result = this.handleANSIOutput(element.value);
		if (typeof result === 'string') {
			renderExpressionValue(result, templateData.value, {
				preserveWhitespace: true,
				showHover: false
			});
		} else {
			templateData.value.appendChild(result);
		}

		dom.addClass(templateData.value, (element.severity === severity.Warning) ? 'warn' : (element.severity === severity.Error) ? 'error' : 'info');
		templateData.source.textContent = element.sourceData ? `${element.sourceData.source.name}:${element.sourceData.lineNumber}` : '';
		templateData.source.title = element.sourceData ? element.sourceData.source.uri.toString() : '';
		templateData.getReplElementSource = () => element.sourceData;
	}

	private renderRawObjectReplElement(tree: ITree, element: RawObjectReplElement, templateData: IRawObjectReplTemplateData): void {
		// key
		if (element.name) {
			templateData.name.textContent = `${element.name}:`;
		} else {
			templateData.name.textContent = '';
		}

		// value
		renderExpressionValue(element.value, templateData.value, {
			preserveWhitespace: true,
			showHover: false
		});

		// annotation if any
		if (element.annotation) {
			templateData.annotation.className = 'annotation octicon octicon-info';
			templateData.annotation.title = element.annotation;
		} else {
			templateData.annotation.className = '';
			templateData.annotation.title = '';
		}
	}

	private handleANSIOutput(text: string): HTMLElement | string {
		let tokensContainer: HTMLSpanElement;
		let currentToken: HTMLSpanElement;
		let buffer: string = '';

		for (let i = 0, len = text.length; i < len; i++) {

			// start of ANSI escape sequence (see http://ascii-table.com/ansi-escape-sequences.php)
			if (text.charCodeAt(i) === 27) {
				let index = i;
				let chr = (++index < len ? text.charAt(index) : null);
				if (chr && chr === '[') {
					let code: string = null;
					chr = (++index < len ? text.charAt(index) : null);

					if (chr && chr >= '0' && chr <= '9') {
						code = chr;
						chr = (++index < len ? text.charAt(index) : null);
					}

					if (chr && chr >= '0' && chr <= '9') {
						code += chr;
						chr = (++index < len ? text.charAt(index) : null);
					}

					if (code === null) {
						code = '0';
					}

					if (chr === 'm') { // set text color/mode.

						// only respect text-foreground ranges and ignore the values for "black" & "white" because those
						// only make sense in combination with text-background ranges which we currently not support
						let parsedMode = parseInt(code, 10);
						let token = document.createElement('span');
						if ((parsedMode >= 30 && parsedMode <= 37) || (parsedMode >= 90 && parsedMode <= 97)) {
							token.className = 'code' + parsedMode;
						} else if (parsedMode === 1) {
							token.className = 'code-bold';
						}

						// we need a tokens container now
						if (!tokensContainer) {
							tokensContainer = document.createElement('span');
						}

						// flush text buffer if we have any
						if (buffer) {
							this.insert(this.linkDetector.handleLinks(buffer), currentToken || tokensContainer);
							buffer = '';
						}

						currentToken = token;
						tokensContainer.appendChild(token);

						i = index;
					}
				}
			}

			// normal text
			else {
				buffer += text[i];
			}
		}

		// flush remaining text buffer if we have any
		if (buffer) {
			let res = this.linkDetector.handleLinks(buffer);
			if (typeof res !== 'string' || currentToken) {
				if (!tokensContainer) {
					tokensContainer = document.createElement('span');
				}

				this.insert(res, currentToken || tokensContainer);
			}
		}

		return tokensContainer || buffer;
	}

	private insert(arg: HTMLElement | string, target: HTMLElement): void {
		if (typeof arg === 'string') {
			target.textContent = arg;
		} else {
			target.appendChild(arg);
		}
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		if (templateData.toDispose) {
			lifecycle.dispose(templateData.toDispose);
		}
	}
}

export class ReplExpressionsAccessibilityProvider implements IAccessibilityProvider {

	public getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof Variable) {
			return nls.localize('replVariableAriaLabel', "Variable {0} has value {1}, read eval print loop, debug", (<Variable>element).name, (<Variable>element).value);
		}
		if (element instanceof Expression) {
			return nls.localize('replExpressionAriaLabel', "Expression {0} has value {1}, read eval print loop, debug", (<Expression>element).name, (<Expression>element).value);
		}
		if (element instanceof SimpleReplElement) {
			return nls.localize('replValueOutputAriaLabel', "{0}, read eval print loop, debug", (<SimpleReplElement>element).value);
		}
		if (element instanceof RawObjectReplElement) {
			return nls.localize('replRawObjectAriaLabel', "Repl variable {0} has value {1}, read eval print loop, debug", (<RawObjectReplElement>element).name, (<RawObjectReplElement>element).value);
		}

		return null;
	}
}

export class ReplExpressionsActionProvider implements IActionProvider {

	constructor(private instantiationService: IInstantiationService) {
		// noop
	}

	public hasActions(tree: ITree, element: any): boolean {
		return false;
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return TPromise.as([]);
	}

	public hasSecondaryActions(tree: ITree, element: any): boolean {
		return true;
	}

	public getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		const actions: IAction[] = [];
		actions.push(new CopyAction(CopyAction.ID, CopyAction.LABEL));
		actions.push(new CopyAllAction(CopyAllAction.ID, CopyAllAction.LABEL, tree));
		actions.push(this.instantiationService.createInstance(ClearReplAction, ClearReplAction.ID, ClearReplAction.LABEL));

		return TPromise.as(actions);
	}

	public getActionItem(tree: ITree, element: any, action: IAction): IActionItem {
		return null;
	}
}

export class ReplExpressionsController extends BaseDebugController {

	private lastSelectedString: string = null;
	public toFocusOnClick: { focus(): void };

	protected onLeftClick(tree: ITree, element: any, eventish: ICancelableEvent, origin: string = 'mouse'): boolean {
		const mouseEvent = <IMouseEvent>eventish;
		// input and output are one element in the tree => we only expand if the user clicked on the output.
		if ((element.reference > 0 || (element instanceof RawObjectReplElement && element.hasChildren)) && mouseEvent.target.className.indexOf('input expression') === -1) {
			super.onLeftClick(tree, element, eventish, origin);
			tree.clearFocus();
			tree.deselect(element);
		}

		const selection = window.getSelection();
		if (selection.type !== 'Range' || this.lastSelectedString === selection.toString()) {
			// only focus the input if the user is not currently selecting.
			this.toFocusOnClick.focus();
		}
		this.lastSelectedString = selection.toString();

		return true;
	}

	public onContextMenu(tree: ITree, element: any, event: ContextMenuEvent): boolean {
		return super.onContextMenu(tree, element, event, false);
	}
}
