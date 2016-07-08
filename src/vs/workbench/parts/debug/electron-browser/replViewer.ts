/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import actions = require('vs/base/common/actions');
import strings = require('vs/base/common/strings');
import URI from 'vs/base/common/uri';
import { isMacintosh } from 'vs/base/common/platform';
import keyboard = require('vs/base/browser/keyboardEvent');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import dom = require('vs/base/browser/dom');
import errors = require('vs/base/common/errors');
import severity from 'vs/base/common/severity';
import mouse = require('vs/base/browser/mouseEvent');
import tree = require('vs/base/parts/tree/browser/tree');
import renderer = require('vs/base/parts/tree/browser/actionsRenderer');
import treedefaults = require('vs/base/parts/tree/browser/treeDefaults');
import debug = require('vs/workbench/parts/debug/common/debug');
import model = require('vs/workbench/parts/debug/common/debugModel');
import debugviewer = require('vs/workbench/parts/debug/electron-browser/debugViewer');
import debugactions = require('vs/workbench/parts/debug/browser/debugActions');
import { CopyAction } from 'vs/workbench/parts/debug/electron-browser/electronDebugActions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

const $ = dom.emmet;

export class ReplExpressionsDataSource implements tree.IDataSource {

	constructor(private debugService: debug.IDebugService) {
		// noop
	}

	public getId(tree: tree.ITree, element: any): string {
		return element.getId();
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Model || element.reference > 0 || (element instanceof model.KeyValueOutputElement && element.getChildren().length > 0);
	}

	public getChildren(tree: tree.ITree, element: any): TPromise<any> {
		if (element instanceof model.Model) {
			return TPromise.as(element.getReplElements());
		}
		if (element instanceof model.KeyValueOutputElement) {
			return TPromise.as(element.getChildren());
		}
		if (element instanceof model.ValueOutputElement) {
			return TPromise.as(null);
		}

		return (<debug.IExpression>element).getChildren(this.debugService);
	}

	public getParent(tree: tree.ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

interface IInputOutputPairTemplateData {
	input: HTMLElement;
	output: HTMLElement;
	value: HTMLElement;
	annotation: HTMLElement;
}

interface IValueOutputTemplateData {
	container: HTMLElement;
	counter: HTMLElement;
	value: HTMLElement;
}

interface IKeyValueOutputTemplateData {
	container: HTMLElement;
	expression: HTMLElement;
	key: HTMLElement;
	value: HTMLElement;
	annotation: HTMLElement;
}

export class ReplExpressionsRenderer implements tree.IRenderer {

	private static VARIABLE_TEMPLATE_ID = 'variable';
	private static INPUT_OUTPUT_PAIR_TEMPLATE_ID = 'inputOutputPair';
	private static VALUE_OUTPUT_TEMPLATE_ID = 'outputValue';
	private static KEY_VALUE_OUTPUT_TEMPLATE_ID = 'outputKeyValue';

	private static FILE_LOCATION_PATTERNS: RegExp[] = [
		// group 0: the full thing :)
		// group 1: absolute path
		// group 2: drive letter on windows with trailing backslash or leading slash on mac/linux
		// group 3: line number
		// group 4: column number
		// eg: at Context.<anonymous> (c:\Users\someone\Desktop\mocha-runner\test\test.js:26:11)
		/((\/|[a-zA-Z]:\\)[^\(\)<>\'\"\[\]]+):(\d+):(\d+)/
	];

	private width: number;
	private characterWidth: number;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		// noop
	}

	public getHeight(tree: tree.ITree, element: any): number {
		return this.getHeightForString(element.value) + (element instanceof model.Expression ? this.getHeightForString(element.name) : 0);
	}

	private getHeightForString(s: string): number {
		if (!s || !s.length || !this.width || this.width <= 0 || !this.characterWidth || this.characterWidth <= 0) {
			return 18;
		}
		let realLength = 0;
		for (let i = 0; i < s.length; i++) {
			realLength += strings.isFullWidthCharacter(s.charCodeAt(i)) ? 2 : 1;
		}

		return 18 * Math.ceil(realLength * this.characterWidth / this.width);
	}

	public setWidth(fullWidth: number, characterWidth: number): void {
		this.width = fullWidth;
		this.characterWidth = characterWidth;
	}

	public getTemplateId(tree: tree.ITree, element: any): string {
		if (element instanceof model.Variable) {
			return ReplExpressionsRenderer.VARIABLE_TEMPLATE_ID;
		}
		if (element instanceof model.Expression) {
			return ReplExpressionsRenderer.INPUT_OUTPUT_PAIR_TEMPLATE_ID;
		}
		if (element instanceof model.ValueOutputElement) {
			return ReplExpressionsRenderer.VALUE_OUTPUT_TEMPLATE_ID;
		}
		if (element instanceof model.KeyValueOutputElement) {
			return ReplExpressionsRenderer.KEY_VALUE_OUTPUT_TEMPLATE_ID;
		}

		return null;
	}

	public renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement): any {
		if (templateId === ReplExpressionsRenderer.VARIABLE_TEMPLATE_ID) {
			let data: debugviewer.IVariableTemplateData = Object.create(null);
			data.expression = dom.append(container, $('.expression'));
			data.name = dom.append(data.expression, $('span.name'));
			data.value = dom.append(data.expression, $('span.value'));

			return data;
		}

		if (templateId === ReplExpressionsRenderer.INPUT_OUTPUT_PAIR_TEMPLATE_ID) {
			let data: IInputOutputPairTemplateData = Object.create(null);
			dom.addClass(container, 'input-output-pair');
			data.input = dom.append(container, $('.input.expression'));
			data.output = dom.append(container, $('.output.expression'));
			data.value = dom.append(data.output, $('span.value'));
			data.annotation = dom.append(data.output, $('span'));

			return data;
		}

		if (templateId === ReplExpressionsRenderer.VALUE_OUTPUT_TEMPLATE_ID) {
			let data: IValueOutputTemplateData = Object.create(null);
			dom.addClass(container, 'output');
			let expression = dom.append(container, $('.output.expression'));

			data.container = container;
			data.counter = dom.append(expression, $('div.counter'));
			data.value = dom.append(expression, $('span.value'));

			return data;
		}

		if (templateId === ReplExpressionsRenderer.KEY_VALUE_OUTPUT_TEMPLATE_ID) {
			let data: IKeyValueOutputTemplateData = Object.create(null);
			dom.addClass(container, 'output');

			data.container = container;
			data.expression = dom.append(container, $('.output.expression'));
			data.key = dom.append(data.expression, $('span.name'));
			data.value = dom.append(data.expression, $('span.value'));
			data.annotation = dom.append(data.expression, $('span'));

			return data;
		}
	}

	public renderElement(tree: tree.ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === ReplExpressionsRenderer.VARIABLE_TEMPLATE_ID) {
			debugviewer.renderVariable(tree, element, templateData, false);
		} else if (templateId === ReplExpressionsRenderer.INPUT_OUTPUT_PAIR_TEMPLATE_ID) {
			this.renderInputOutputPair(tree, element, templateData);
		} else if (templateId === ReplExpressionsRenderer.VALUE_OUTPUT_TEMPLATE_ID) {
			this.renderOutputValue(element, templateData);
		} else if (templateId === ReplExpressionsRenderer.KEY_VALUE_OUTPUT_TEMPLATE_ID) {
			this.renderOutputKeyValue(tree, element, templateData);
		}
	}

	private renderInputOutputPair(tree: tree.ITree, expression: debug.IExpression, templateData: IInputOutputPairTemplateData): void {
		templateData.input.textContent = expression.name;
		debugviewer.renderExpressionValue(expression, templateData.value, false);
		if (expression.reference > 0) {
			templateData.annotation.className = 'annotation octicon octicon-info';
			templateData.annotation.title = nls.localize('stateCapture', "Object state is captured from first evaluation");
		}
	}

	private renderOutputValue(output: model.ValueOutputElement, templateData: IValueOutputTemplateData): void {

		// counter
		if (output.counter > 1) {
			templateData.counter.textContent = String(output.counter);
			templateData.counter.className = (output.severity === severity.Warning) ? 'counter warn' : (output.severity === severity.Error) ? 'counter error' : 'counter info';
		} else {
			templateData.counter.textContent = '';
			templateData.counter.className = 'counter';
		}

		// value
		dom.clearNode(templateData.value);
		let result = this.handleANSIOutput(output.value);
		if (typeof result === 'string') {
			templateData.value.textContent = result;
		} else {
			templateData.value.appendChild(result);
		}

		templateData.value.className = (output.severity === severity.Warning) ? 'warn' : (output.severity === severity.Error) ? 'error' : 'info';
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
							this.insert(this.handleLinks(buffer), currentToken || tokensContainer);
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
			let res = this.handleLinks(buffer);
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

	private handleLinks(text: string): HTMLElement | string {
		let linkContainer: HTMLElement;

		for (let pattern of ReplExpressionsRenderer.FILE_LOCATION_PATTERNS) {
			pattern.lastIndex = 0; // the holy grail of software development

			const match = pattern.exec(text);
			let resource = null;
			try {
				resource = match && URI.file(match[1]);
			} catch (e) { }

			if (resource) {
				linkContainer = document.createElement('span');

				let textBeforeLink = text.substr(0, match.index);
				if (textBeforeLink) {
					let span = document.createElement('span');
					span.textContent = textBeforeLink;
					linkContainer.appendChild(span);
				}

				const link = document.createElement('a');
				link.textContent = text.substr(match.index, match[0].length);
				link.title = isMacintosh ? nls.localize('fileLinkMac', "Click to follow (Cmd + click opens to the side)") : nls.localize('fileLink', "Click to follow (Ctrl + click opens to the side)");
				linkContainer.appendChild(link);
				link.onclick = (e) => this.onLinkClick(new mouse.StandardMouseEvent(e), resource, Number(match[3]), Number(match[4]));

				let textAfterLink = text.substr(match.index + match[0].length);
				if (textAfterLink) {
					let span = document.createElement('span');
					span.textContent = textAfterLink;
					linkContainer.appendChild(span);
				}

				break; // support one link per line for now
			}
		}

		return linkContainer || text;
	}

	private onLinkClick(event: mouse.IMouseEvent, resource: URI, line: number, column: number): void {
		const selection = window.getSelection();
		if (selection.type === 'Range') {
			return; // do not navigate when user is selecting
		}

		event.preventDefault();

		this.editorService.openEditor({
			resource,
			options: {
				selection: {
					startLineNumber: line,
					startColumn: column
				}
			}
		}, event.ctrlKey || event.metaKey).done(null, errors.onUnexpectedError);
	}

	private renderOutputKeyValue(tree: tree.ITree, output: model.KeyValueOutputElement, templateData: IKeyValueOutputTemplateData): void {

		// key
		if (output.key) {
			templateData.key.textContent = `${output.key}:`;
		} else {
			templateData.key.textContent = '';
		}

		// value
		debugviewer.renderExpressionValue(output.value, templateData.value, false);

		// annotation if any
		if (output.annotation) {
			templateData.annotation.className = 'annotation octicon octicon-info';
			templateData.annotation.title = output.annotation;
		} else {
			templateData.annotation.className = '';
			templateData.annotation.title = '';
		}
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		// noop
	}
}

export class ReplExpressionsAccessibilityProvider implements tree.IAccessibilityProvider {

	public getAriaLabel(tree: tree.ITree, element: any): string {
		if (element instanceof model.Variable) {
			return nls.localize('replVariableAriaLabel', "Variable {0} has value {1}, read eval print loop, debug", (<model.Variable>element).name, (<model.Variable>element).value);
		}
		if (element instanceof model.Expression) {
			return nls.localize('replExpressionAriaLabel', "Expression {0} has value {1}, read eval print loop, debug", (<model.Expression>element).name, (<model.Expression>element).value);
		}
		if (element instanceof model.ValueOutputElement) {
			return nls.localize('replValueOutputAriaLabel', "{0}, read eval print loop, debug", (<model.ValueOutputElement>element).value);
		}
		if (element instanceof model.KeyValueOutputElement) {
			return nls.localize('replKeyValueOutputAriaLabel', "Output variable {0} has value {1}, read eval print loop, debug", (<model.KeyValueOutputElement>element).key, (<model.KeyValueOutputElement>element).value);
		}

		return null;
	}
}

export class ReplExpressionsActionProvider implements renderer.IActionProvider {

	constructor(private instantiationService: IInstantiationService) {
		// noop
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return false;
	}

	public getActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		return TPromise.as([]);
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return true;
	}

	public getSecondaryActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		const actions: actions.IAction[] = [];
		if (element instanceof model.Variable || element instanceof model.Expression) {
			actions.push(this.instantiationService.createInstance(debugactions.AddToWatchExpressionsAction, debugactions.AddToWatchExpressionsAction.ID, debugactions.AddToWatchExpressionsAction.LABEL, element));
			actions.push(new actionbar.Separator());
		}
		actions.push(new CopyAction(CopyAction.ID, CopyAction.LABEL));
		actions.push(this.instantiationService.createInstance(debugactions.ClearReplAction, debugactions.ClearReplAction.ID, debugactions.ClearReplAction.LABEL));

		return TPromise.as(actions);
	}

	public getActionItem(tree: tree.ITree, element: any, action: actions.IAction): actionbar.IActionItem {
		return null;
	}
}

export class ReplExpressionsController extends debugviewer.BaseDebugController {

	private lastSelectedString: string = null;

	constructor(
		debugService: debug.IDebugService,
		contextMenuService: IContextMenuService,
		actionProvider: renderer.IActionProvider,
		private replInput: HTMLInputElement,
		focusOnContextMenu = true
	) {
		super(debugService, contextMenuService, actionProvider, focusOnContextMenu);
	}

	protected onLeftClick(tree: tree.ITree, element: any, eventish: treedefaults.ICancelableEvent, origin: string = 'mouse'): boolean {
		const mouseEvent = <mouse.IMouseEvent>eventish;
		// input and output are one element in the tree => we only expand if the user clicked on the output.
		if ((element.reference > 0 || (element instanceof model.KeyValueOutputElement && element.getChildren().length > 0)) && mouseEvent.target.className.indexOf('input expression') === -1) {
			super.onLeftClick(tree, element, eventish, origin);
			tree.clearFocus();
			tree.deselect(element);
		}

		const selection = window.getSelection();
		if (selection.type !== 'Range' || this.lastSelectedString === selection.toString()) {
			// only focus the input if the user is not currently selecting.
			this.replInput.focus();
		}
		this.lastSelectedString = selection.toString();

		return true;
	}

	protected onDown(tree: tree.ITree, event: keyboard.IKeyboardEvent): boolean {
		if (tree.getFocus()) {
			return super.onDown(tree, event);
		}

		const payload = { origin: 'keyboard', originalEvent: event };
		tree.focusLast(payload);
		tree.reveal(tree.getFocus()).done(null, errors.onUnexpectedError);

		return true;
	}
}
