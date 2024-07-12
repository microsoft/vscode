/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { HighlightedLabel, IHighlight } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IInputValidationOptions, InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { Codicon } from 'vs/base/common/codicons';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { createSingleCallFunction } from 'vs/base/common/functional';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore, IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { defaultInputBoxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { COPY_EVALUATE_PATH_ID, COPY_VALUE_ID } from 'vs/workbench/contrib/debug/browser/debugCommands';
import { LinkDetector } from 'vs/workbench/contrib/debug/browser/linkDetector';
import { IDebugService, IExpression, IExpressionValue } from 'vs/workbench/contrib/debug/common/debug';
import { Expression, ExpressionContainer, Variable } from 'vs/workbench/contrib/debug/common/debugModel';
import { IDebugVisualizerService } from 'vs/workbench/contrib/debug/common/debugVisualizers';
import { ReplEvaluationResult } from 'vs/workbench/contrib/debug/common/replModel';

const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;
const booleanRegex = /^(true|false)$/i;
const stringRegex = /^(['"]).*\1$/;
const $ = dom.$;

export interface IRenderValueOptions {
	showChanged?: boolean;
	maxValueLength?: number;
	/** If set, a hover will be shown on the element. Requires a disposable store for usage. */
	hover?: DisposableStore | {
		store: DisposableStore;
		commands: { id: string; args: unknown[] }[];
		commandService: ICommandService;
	};
	colorize?: boolean;
	linkDetector?: LinkDetector;
}

export interface IVariableTemplateData {
	expression: HTMLElement;
	name: HTMLElement;
	type: HTMLElement;
	value: HTMLElement;
	label: HighlightedLabel;
	lazyButton: HTMLElement;
}

export function renderViewTree(container: HTMLElement): HTMLElement {
	const treeContainer = $('.');
	treeContainer.classList.add('debug-view-content');
	container.appendChild(treeContainer);
	return treeContainer;
}

export function renderExpressionValue(expressionOrValue: IExpressionValue | string, container: HTMLElement, options: IRenderValueOptions, hoverService: IHoverService): void {
	let value = typeof expressionOrValue === 'string' ? expressionOrValue : expressionOrValue.value;

	// remove stale classes
	container.className = 'value';
	// when resolving expressions we represent errors from the server as a variable with name === null.
	if (value === null || ((expressionOrValue instanceof Expression || expressionOrValue instanceof Variable || expressionOrValue instanceof ReplEvaluationResult) && !expressionOrValue.available)) {
		container.classList.add('unavailable');
		if (value !== Expression.DEFAULT_VALUE) {
			container.classList.add('error');
		}
	} else {
		if (typeof expressionOrValue !== 'string' && options.showChanged && expressionOrValue.valueChanged && value !== Expression.DEFAULT_VALUE) {
			// value changed color has priority over other colors.
			container.className = 'value changed';
			expressionOrValue.valueChanged = false;
		}

		if (options.colorize && typeof expressionOrValue !== 'string') {
			if (expressionOrValue.type === 'number' || expressionOrValue.type === 'boolean' || expressionOrValue.type === 'string') {
				container.classList.add(expressionOrValue.type);
			} else if (!isNaN(+value)) {
				container.classList.add('number');
			} else if (booleanRegex.test(value)) {
				container.classList.add('boolean');
			} else if (stringRegex.test(value)) {
				container.classList.add('string');
			}
		}
	}

	if (options.maxValueLength && value && value.length > options.maxValueLength) {
		value = value.substring(0, options.maxValueLength) + '...';
	}
	if (!value) {
		value = '';
	}

	if (options.linkDetector) {
		container.textContent = '';
		const session = (expressionOrValue instanceof ExpressionContainer) ? expressionOrValue.getSession() : undefined;
		container.appendChild(options.linkDetector.linkify(value, false, session ? session.root : undefined, true));
	} else {
		container.textContent = value;
	}

	if (options.hover) {
		const { store, commands, commandService } = options.hover instanceof DisposableStore ? { store: options.hover, commands: [], commandService: undefined } : options.hover;
		store.add(hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), container, () => {
			const container = dom.$('div');
			const markdownHoverElement = dom.$('div.hover-row');
			const hoverContentsElement = dom.append(markdownHoverElement, dom.$('div.hover-contents'));
			const hoverContentsPre = dom.append(hoverContentsElement, dom.$('pre.debug-var-hover-pre'));
			hoverContentsPre.textContent = value;
			container.appendChild(markdownHoverElement);
			return container;
		}, {
			actions: commands.map(({ id, args }) => {
				const description = CommandsRegistry.getCommand(id)?.metadata?.description;
				return {
					label: typeof description === 'string' ? description : description ? description.value : id,
					commandId: id,
					run: () => commandService!.executeCommand(id, ...args),
				};
			})
		}));
	}
}

export function renderVariable(store: DisposableStore, commandService: ICommandService, hoverService: IHoverService, variable: Variable, data: IVariableTemplateData, showChanged: boolean, highlights: IHighlight[], linkDetector?: LinkDetector, displayType?: boolean): void {
	if (variable.available) {
		data.type.textContent = '';
		let text = variable.name;
		if (variable.value && typeof variable.name === 'string') {
			if (variable.type && displayType) {
				text += ': ';
				data.type.textContent = variable.type + ' =';
			} else {
				text += ' =';
			}
		}

		data.label.set(text, highlights, variable.type && !displayType ? variable.type : variable.name);
		data.name.classList.toggle('virtual', variable.presentationHint?.kind === 'virtual');
		data.name.classList.toggle('internal', variable.presentationHint?.visibility === 'internal');
	} else if (variable.value && typeof variable.name === 'string' && variable.name) {
		data.label.set(':');
	}

	data.expression.classList.toggle('lazy', !!variable.presentationHint?.lazy);
	const commands = [
		{ id: COPY_VALUE_ID, args: [variable, [variable]] as unknown[] }
	];
	if (variable.evaluateName) {
		commands.push({ id: COPY_EVALUATE_PATH_ID, args: [{ variable }] });
	}

	renderExpressionValue(variable, data.value, {
		showChanged,
		maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
		hover: { store, commands, commandService },
		colorize: true,
		linkDetector
	}, hoverService);
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
	type: HTMLSpanElement;
	value: HTMLSpanElement;
	inputBoxContainer: HTMLElement;
	actionBar?: ActionBar;
	elementDisposable: DisposableStore;
	templateDisposable: IDisposable;
	label: HighlightedLabel;
	lazyButton: HTMLElement;
	currentElement: IExpression | undefined;
}

export abstract class AbstractExpressionDataSource<Input, Element extends IExpression> implements IAsyncDataSource<Input, Element> {
	constructor(
		@IDebugService protected debugService: IDebugService,
		@IDebugVisualizerService protected debugVisualizer: IDebugVisualizerService,
	) { }

	public abstract hasChildren(element: Input | Element): boolean;

	public async getChildren(element: Input | Element): Promise<Element[]> {
		const vm = this.debugService.getViewModel();
		const children = await this.doGetChildren(element);
		return Promise.all(children.map(async r => {
			const vizOrTree = vm.getVisualizedExpression(r as IExpression);
			if (typeof vizOrTree === 'string') {
				const viz = await this.debugVisualizer.getVisualizedNodeFor(vizOrTree, r);
				if (viz) {
					vm.setVisualizedExpression(r, viz);
					return viz as IExpression as Element;
				}
			} else if (vizOrTree) {
				return vizOrTree as Element;
			}


			return r;
		}));
	}

	protected abstract doGetChildren(element: Input | Element): Promise<Element[]>;
}

export abstract class AbstractExpressionsRenderer<T = IExpression> implements ITreeRenderer<T, FuzzyScore, IExpressionTemplateData> {

	constructor(
		@IDebugService protected debugService: IDebugService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IHoverService protected readonly hoverService: IHoverService,
	) { }

	abstract get templateId(): string;

	renderTemplate(container: HTMLElement): IExpressionTemplateData {
		const templateDisposable = new DisposableStore();
		const expression = dom.append(container, $('.expression'));
		const name = dom.append(expression, $('span.name'));
		const lazyButton = dom.append(expression, $('span.lazy-button'));
		lazyButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.eye));

		templateDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), lazyButton, localize('debug.lazyButton.tooltip', "Click to expand")));
		const type = dom.append(expression, $('span.type'));

		const value = dom.append(expression, $('span.value'));

		const label = templateDisposable.add(new HighlightedLabel(name));

		const inputBoxContainer = dom.append(expression, $('.inputBoxContainer'));

		let actionBar: ActionBar | undefined;
		if (this.renderActionBar) {
			dom.append(expression, $('.span.actionbar-spacer'));
			actionBar = templateDisposable.add(new ActionBar(expression));
		}

		const template: IExpressionTemplateData = { expression, name, type, value, label, inputBoxContainer, actionBar, elementDisposable: new DisposableStore(), templateDisposable, lazyButton, currentElement: undefined };

		templateDisposable.add(dom.addDisposableListener(lazyButton, dom.EventType.CLICK, () => {
			if (template.currentElement) {
				this.debugService.getViewModel().evaluateLazyExpression(template.currentElement);
			}
		}));

		return template;
	}

	public abstract renderElement(node: ITreeNode<T, FuzzyScore>, index: number, data: IExpressionTemplateData): void;

	protected renderExpressionElement(element: IExpression, node: ITreeNode<T, FuzzyScore>, data: IExpressionTemplateData): void {
		data.currentElement = element;
		this.renderExpression(node.element, data, createMatches(node.filterData));
		if (data.actionBar) {
			this.renderActionBar!(data.actionBar, element, data);
		}
		const selectedExpression = this.debugService.getViewModel().getSelectedExpression();
		if (element === selectedExpression?.expression || (element instanceof Variable && element.errorMessage)) {
			const options = this.getInputBoxOptions(element, !!selectedExpression?.settingWatch);
			if (options) {
				data.elementDisposable.add(this.renderInputBox(data.name, data.value, data.inputBoxContainer, options));
			}
		}
	}

	renderInputBox(nameElement: HTMLElement, valueElement: HTMLElement, inputBoxContainer: HTMLElement, options: IInputBoxOptions): IDisposable {
		nameElement.style.display = 'none';
		valueElement.style.display = 'none';
		inputBoxContainer.style.display = 'initial';
		dom.clearNode(inputBoxContainer);

		const inputBox = new InputBox(inputBoxContainer, this.contextViewService, { ...options, inputBoxStyles: defaultInputBoxStyles });

		inputBox.value = options.initialValue;
		inputBox.focus();
		inputBox.select();

		const done = createSingleCallFunction((success: boolean, finishEditing: boolean) => {
			nameElement.style.display = '';
			valueElement.style.display = '';
			inputBoxContainer.style.display = 'none';
			const value = inputBox.value;
			dispose(toDispose);

			if (finishEditing) {
				this.debugService.getViewModel().setSelectedExpression(undefined, false);
				options.onFinish(value, success);
			}
		});

		const toDispose = [
			inputBox,
			dom.addStandardDisposableListener(inputBox.inputElement, dom.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
				const isEscape = e.equals(KeyCode.Escape);
				const isEnter = e.equals(KeyCode.Enter);
				if (isEscape || isEnter) {
					e.preventDefault();
					e.stopPropagation();
					done(isEnter, true);
				}
			}),
			dom.addDisposableListener(inputBox.inputElement, dom.EventType.BLUR, () => {
				done(true, true);
			}),
			dom.addDisposableListener(inputBox.inputElement, dom.EventType.CLICK, e => {
				// Do not expand / collapse selected elements
				e.preventDefault();
				e.stopPropagation();
			})
		];

		return toDisposable(() => {
			done(false, false);
		});
	}

	protected abstract renderExpression(expression: T, data: IExpressionTemplateData, highlights: IHighlight[]): void;
	protected abstract getInputBoxOptions(expression: IExpression, settingValue: boolean): IInputBoxOptions | undefined;

	protected renderActionBar?(actionBar: ActionBar, expression: IExpression, data: IExpressionTemplateData): void;

	disposeElement(node: ITreeNode<T, FuzzyScore>, index: number, templateData: IExpressionTemplateData): void {
		templateData.elementDisposable.clear();
	}

	disposeTemplate(templateData: IExpressionTemplateData): void {
		templateData.elementDisposable.dispose();
		templateData.templateDisposable.dispose();
	}
}
