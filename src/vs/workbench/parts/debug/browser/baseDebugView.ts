/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IExpression, IDebugService } from 'vs/workbench/parts/debug/common/debug';
import { Expression, Variable } from 'vs/workbench/parts/debug/common/debugModel';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInputValidationOptions, InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { ITreeRenderer, ITreeNode, AbstractTreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';

export const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;
export const twistiePixels = 20;
const booleanRegex = /^true|false$/i;
const stringRegex = /^(['"]).*\1$/;
const $ = dom.$;

export interface IRenderValueOptions {
	preserveWhitespace?: boolean;
	showChanged?: boolean;
	maxValueLength?: number;
	showHover?: boolean;
	colorize?: boolean;
}

export interface IVariableTemplateData {
	expression: HTMLElement;
	name: HTMLElement;
	value: HTMLElement;
}

export function renderViewTree(container: HTMLElement): HTMLElement {
	const treeContainer = document.createElement('div');
	dom.addClass(treeContainer, 'debug-view-content');
	container.appendChild(treeContainer);
	return treeContainer;
}

export function replaceWhitespace(value: string): string {
	const map: { [x: string]: string } = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };
	return value.replace(/[\n\r\t]/g, char => map[char]);
}

export function renderExpressionValue(expressionOrValue: IExpression | string, container: HTMLElement, options: IRenderValueOptions): void {
	let value = typeof expressionOrValue === 'string' ? expressionOrValue : expressionOrValue.value;

	// remove stale classes
	container.className = 'value';
	// when resolving expressions we represent errors from the server as a variable with name === null.
	if (value === null || ((expressionOrValue instanceof Expression || expressionOrValue instanceof Variable) && !expressionOrValue.available)) {
		dom.addClass(container, 'unavailable');
		if (value !== Expression.DEFAULT_VALUE) {
			dom.addClass(container, 'error');
		}
	} else if (options.showChanged && (<any>expressionOrValue).valueChanged && value !== Expression.DEFAULT_VALUE) {
		// value changed color has priority over other colors.
		container.className = 'value changed';
	}

	if (options.colorize && typeof expressionOrValue !== 'string') {
		if (expressionOrValue.type === 'number' || expressionOrValue.type === 'boolean' || expressionOrValue.type === 'string') {
			dom.addClass(container, expressionOrValue.type);
		} else if (!isNaN(+value)) {
			dom.addClass(container, 'number');
		} else if (booleanRegex.test(value)) {
			dom.addClass(container, 'boolean');
		} else if (stringRegex.test(value)) {
			dom.addClass(container, 'string');
		}
	}

	if (options.maxValueLength && value && value.length > options.maxValueLength) {
		value = value.substr(0, options.maxValueLength) + '...';
	}
	if (value && !options.preserveWhitespace) {
		container.textContent = replaceWhitespace(value);
	} else {
		container.textContent = value || '';
	}
	if (options.showHover) {
		container.title = value || '';
	}
}

export function renderVariable(variable: Variable, data: IVariableTemplateData, showChanged: boolean): void {
	if (variable.available) {
		data.name.textContent = replaceWhitespace(variable.name);
		data.name.title = variable.type ? variable.type : variable.name;
		dom.toggleClass(data.name, 'virtual', !!variable.presentationHint && variable.presentationHint.kind === 'virtual');
	}

	renderExpressionValue(variable, data.value, {
		showChanged,
		maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
		preserveWhitespace: false,
		showHover: true,
		colorize: true
	});
	if (variable.value && typeof variable.name === 'string') {
		data.name.textContent += ':';
	}
}

export interface IInputBoxOptions {
	initialValue: string;
	ariaLabel: string;
	placeholder?: string;
	validationOptions?: IInputValidationOptions;
	onFinish: (value: string, success: boolean) => void;
}

export interface IExpressionTemplateData {
	expression: HTMLElement;
	name: HTMLSpanElement;
	value: HTMLSpanElement;
	inputBoxContainer: HTMLElement;
	enableInputBox(expression: IExpression, options: IInputBoxOptions);
	toDispose: IDisposable[];
}

export abstract class AbstractExpressionsRenderer
	extends AbstractTreeRenderer<IExpression, void, IExpressionTemplateData>
	implements ITreeRenderer<IExpression, void, IExpressionTemplateData>, IDisposable {

	constructor(
		@IDebugService protected debugService: IDebugService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super(debugService.getViewModel().onDidSelectExpression);
	}

	abstract get templateId(): string;

	renderTemplate(container: HTMLElement): IExpressionTemplateData {
		const data: IExpressionTemplateData = Object.create(null);
		data.expression = dom.append(container, $('.expression'));
		data.name = dom.append(data.expression, $('span.name'));
		data.value = dom.append(data.expression, $('span.value'));
		data.inputBoxContainer = dom.append(data.expression, $('.inputBoxContainer'));

		data.enableInputBox = (expression: IExpression, options: IInputBoxOptions) => {
			data.name.style.display = 'none';
			data.value.style.display = 'none';
			data.inputBoxContainer.style.display = 'initial';

			const inputBox = new InputBox(data.inputBoxContainer, this.contextViewService, {
				placeholder: options.placeholder,
				ariaLabel: options.ariaLabel
			});
			const styler = attachInputBoxStyler(inputBox, this.themeService);

			inputBox.value = options.initialValue;
			inputBox.focus();
			inputBox.select();

			let disposed = false;
			data.toDispose = [inputBox, styler];

			const wrapUp = (renamed: boolean) => {
				if (!disposed) {
					disposed = true;
					this.debugService.getViewModel().setSelectedExpression(undefined);
					options.onFinish(inputBox.value, renamed);

					// need to remove the input box since this template will be reused.
					data.inputBoxContainer.removeChild(inputBox.element);
					data.name.style.display = 'initial';
					data.value.style.display = 'initial';
					data.inputBoxContainer.style.display = 'none';
					dispose(data.toDispose);
				}
			};

			data.toDispose.push(dom.addStandardDisposableListener(inputBox.inputElement, 'keydown', (e: IKeyboardEvent) => {
				const isEscape = e.equals(KeyCode.Escape);
				const isEnter = e.equals(KeyCode.Enter);
				if (isEscape || isEnter) {
					e.preventDefault();
					e.stopPropagation();
					wrapUp(isEnter);
				}
			}));
			data.toDispose.push(dom.addDisposableListener(inputBox.inputElement, 'blur', () => {
				wrapUp(true);
			}));
			data.toDispose.push(dom.addDisposableListener(inputBox.inputElement, 'click', e => {
				// Do not expand / collapse selected elements
				e.preventDefault();
				e.stopPropagation();
			}));
		};

		return data;
	}

	renderElement(node: ITreeNode<IExpression>, index: number, data: IExpressionTemplateData): void {
		super.renderElement(node, index, data);

		const { element } = node;
		if (element === this.debugService.getViewModel().getSelectedExpression()) {
			data.enableInputBox(element, this.getInputBoxOptions(element));
		} else {
			this.renderExpression(element, data);
		}
	}

	protected abstract renderExpression(expression: IExpression, data: IExpressionTemplateData): void;
	protected abstract getInputBoxOptions(expression: IExpression): IInputBoxOptions;

	disposeTemplate(templateData: IExpressionTemplateData): void {
		dispose(templateData.toDispose);
	}
}
