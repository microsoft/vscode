/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HighlightedLabel, IHighlight } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IInputValidationOptions, InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { IKeyboardNavigationLabelProvider } from '../../../../base/browser/ui/list/list.js';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { FuzzyScore, createMatches } from '../../../../base/common/filters.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, IDisposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IDebugService, IExpression, IScope } from '../common/debug.js';
import { Variable } from '../common/debugModel.js';
import { IDebugVisualizerService } from '../common/debugVisualizers.js';
import { LinkDetector } from './linkDetector.js';

const $ = dom.$;

export interface IRenderValueOptions {
	showChanged?: boolean;
	maxValueLength?: number;
	/** If set, a hover will be shown on the element. Requires a disposable store for usage. */
	hover?: false | {
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
	treeContainer.classList.add('debug-view-content', 'file-icon-themable-tree');
	container.appendChild(treeContainer);
	return treeContainer;
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

/** Splits highlights based on matching of the {@link expressionAndScopeLabelProvider} */
export const splitExpressionOrScopeHighlights = (e: IExpression | IScope, highlights: IHighlight[]) => {
	const nameEndsAt = e.name.length;
	const labelBeginsAt = e.name.length + 2;
	const name: IHighlight[] = [];
	const value: IHighlight[] = [];
	for (const hl of highlights) {
		if (hl.start < nameEndsAt) {
			name.push({ start: hl.start, end: Math.min(hl.end, nameEndsAt) });
		}
		if (hl.end > labelBeginsAt) {
			value.push({ start: Math.max(hl.start - labelBeginsAt, 0), end: hl.end - labelBeginsAt });
		}
	}

	return { name, value };
};

/** Keyboard label provider for expression and scope tree elements. */
export const expressionAndScopeLabelProvider: IKeyboardNavigationLabelProvider<IExpression | IScope> = {
	getKeyboardNavigationLabel(e) {
		const stripAnsi = e.getSession()?.rememberedCapabilities?.supportsANSIStyling;
		return `${e.name}: ${stripAnsi ? removeAnsiEscapeCodes(e.value) : e.value}`;
	},
};

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
