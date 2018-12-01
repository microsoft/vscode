/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IExpression, IDebugService, IEnablement } from 'vs/workbench/parts/debug/common/debug';
import { Expression, Variable } from 'vs/workbench/parts/debug/common/debugModel';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ITree, ContextMenuEvent, IActionProvider } from 'vs/base/parts/tree/browser/tree';
import { IInputValidationOptions, InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IControllerOptions } from 'vs/base/parts/tree/browser/treeDefaults';
import { fillInContextMenuActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
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

export class BaseDebugController extends WorkbenchTreeController {

	private contributedContextMenu: IMenu;

	constructor(
		private actionProvider: IActionProvider,
		menuId: MenuId,
		options: IControllerOptions,
		@IDebugService protected debugService: IDebugService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(options, configurationService);

		this.contributedContextMenu = menuService.createMenu(menuId, contextKeyService);
		this.disposables.push(this.contributedContextMenu);
	}

	public onContextMenu(tree: ITree, element: IEnablement, event: ContextMenuEvent, focusElement = true): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		if (focusElement) {
			tree.setFocus(element);
		}

		if (this.actionProvider.hasSecondaryActions(tree, element)) {
			const anchor = { x: event.posx, y: event.posy };
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => {
					const actions = this.actionProvider.getSecondaryActions(tree, element);
					fillInContextMenuActions(this.contributedContextMenu, { arg: this.getContext(element) }, actions, this.contextMenuService);
					return actions;
				},
				onHide: (wasCancelled?: boolean) => {
					if (wasCancelled) {
						tree.domFocus();
					}
				},
				getActionsContext: () => element
			});

			return true;
		}

		return false;
	}

	protected getContext(element: any): any {
		return undefined;
	}
}

export interface IExpressionTemplateData {
	expression: HTMLElement;
	name: HTMLSpanElement;
	value: HTMLSpanElement;
	inputBoxContainer: HTMLElement;
	enableInputBox(expression: IExpression, options: IInputBoxOptions);
	toDispose: IDisposable[];
}

export abstract class AbstractExpressionsRenderer implements ITreeRenderer<IExpression, void, IExpressionTemplateData>, IDisposable {

	protected renderedExpressions = new Map<IExpression, IExpressionTemplateData>();
	private toDispose: IDisposable[];

	constructor(
		@IDebugService protected debugService: IDebugService,
		@IContextViewService private contextViewService: IContextViewService,
		@IThemeService private themeService: IThemeService
	) {
		this.toDispose = [];

		this.toDispose.push(this.debugService.getViewModel().onDidSelectExpression(expression => {
			const template = this.renderedExpressions.get(expression);
			if (template) {
				template.enableInputBox(expression, this.getInputBoxOptions(expression));
			}
		}));
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
		};

		return data;
	}

	renderElement({ element }: ITreeNode<IExpression>, index: number, data: IExpressionTemplateData): void {
		this.renderedExpressions.set(element, data);
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

	disposeElement(element: ITreeNode<Expression, void>): void {
		this.renderedExpressions.delete(element.element);
	}

	dispose(): void {
		this.renderedExpressions = undefined;
		dispose(this.toDispose);
	}
}
