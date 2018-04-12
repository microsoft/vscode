/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IExpression, IDebugService, IEnablement } from 'vs/workbench/parts/debug/common/debug';
import { Expression, Variable } from 'vs/workbench/parts/debug/common/debugModel';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITree, ContextMenuEvent, IActionProvider } from 'vs/base/parts/tree/browser/tree';
import { InputBox, IInputValidationOptions } from 'vs/base/browser/ui/inputbox/inputBox';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { once } from 'vs/base/common/functional';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IControllerOptions } from 'vs/base/parts/tree/browser/treeDefaults';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { onUnexpectedError } from 'vs/base/common/errors';
import { WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

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

function replaceWhitespace(value: string): string {
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

	if (options.showChanged && (<any>expressionOrValue).valueChanged && value !== Expression.DEFAULT_VALUE) {
		// value changed color has priority over other colors.
		container.className = 'value changed';
	}

	if (options.maxValueLength && value.length > options.maxValueLength) {
		value = value.substr(0, options.maxValueLength) + '...';
	}
	if (value && !options.preserveWhitespace) {
		container.textContent = replaceWhitespace(value);
	} else {
		container.textContent = value;
	}
	if (options.showHover) {
		container.title = value;
	}
}

export function renderVariable(tree: ITree, variable: Variable, data: IVariableTemplateData, showChanged: boolean): void {
	if (variable.available) {
		data.name.textContent = replaceWhitespace(variable.name);
		data.name.title = variable.type ? variable.type : variable.name;
		dom.toggleClass(data.name, 'virtual', !!variable.presentationHint && variable.presentationHint.kind === 'virtual');
	}

	if (variable.value) {
		data.name.textContent += variable.name ? ':' : '';
		renderExpressionValue(variable, data.value, {
			showChanged,
			maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
			preserveWhitespace: false,
			showHover: true,
			colorize: true
		});
	} else {
		data.value.textContent = '';
		data.value.title = '';
	}
}

export interface IRenameBoxOptions {
	initialValue: string;
	ariaLabel: string;
	placeholder?: string;
	validationOptions?: IInputValidationOptions;
}

export function renderRenameBox(debugService: IDebugService, contextViewService: IContextViewService, themeService: IThemeService, tree: ITree, element: any, container: HTMLElement, options: IRenameBoxOptions): void {
	let inputBoxContainer = dom.append(container, $('.inputBoxContainer'));
	let inputBox = new InputBox(inputBoxContainer, contextViewService, {
		validationOptions: options.validationOptions,
		placeholder: options.placeholder,
		ariaLabel: options.ariaLabel
	});
	const styler = attachInputBoxStyler(inputBox, themeService);

	inputBox.value = options.initialValue ? options.initialValue : '';
	inputBox.focus();
	inputBox.select();

	let disposed = false;
	const toDispose: IDisposable[] = [inputBox, styler];

	const wrapUp = once((renamed: boolean) => {
		if (!disposed) {
			disposed = true;
			debugService.getViewModel().setSelectedExpression(undefined);
			if (element instanceof Expression && renamed && inputBox.value) {
				debugService.renameWatchExpression(element.getId(), inputBox.value);
			} else if (element instanceof Expression && !element.name) {
				debugService.removeWatchExpressions(element.getId());
			} else if (element instanceof Variable) {
				element.errorMessage = null;
				if (renamed && element.value !== inputBox.value) {
					element.setVariable(inputBox.value)
						// if everything went fine we need to refresh ui elements since the variable update can change watch and variables view
						.done(() => {
							tree.refresh(element, false);
							// Need to force watch expressions to update since a variable change can have an effect on watches
							debugService.focusStackFrame(debugService.getViewModel().focusedStackFrame);
						}, onUnexpectedError);
				}
			}

			tree.domFocus();
			tree.setFocus(element);

			// need to remove the input box since this template will be reused.
			container.removeChild(inputBoxContainer);
			dispose(toDispose);
		}
	});

	toDispose.push(dom.addStandardDisposableListener(inputBox.inputElement, 'keydown', (e: IKeyboardEvent) => {
		const isEscape = e.equals(KeyCode.Escape);
		const isEnter = e.equals(KeyCode.Enter);
		if (isEscape || isEnter) {
			e.preventDefault();
			e.stopPropagation();
			wrapUp(isEnter);
		}
	}));
	toDispose.push(dom.addDisposableListener(inputBox.inputElement, 'blur', () => {
		wrapUp(true);
	}));
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
				getActions: () => this.actionProvider.getSecondaryActions(tree, element).then(actions => {
					fillInActions(this.contributedContextMenu, { arg: this.getContext(element) }, actions, this.contextMenuService);
					return actions;
				}),
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
