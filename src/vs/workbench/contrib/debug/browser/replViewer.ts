/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { HighlightedLabel, IHighlight } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { IManagedHover } from '../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { CachedListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { createMatches, FuzzyScore } from '../../../../base/common/filters.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import severity from '../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { defaultCountBadgeStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IDebugConfiguration, IDebugService, IDebugSession, IExpression, IExpressionContainer, INestingReplElement, IReplElement, IReplElementSource, IReplOptions } from '../common/debug.js';
import { Variable } from '../common/debugModel.js';
import { RawObjectReplElement, ReplEvaluationInput, ReplEvaluationResult, ReplGroup, ReplOutputElement, ReplVariableElement } from '../common/replModel.js';
import { AbstractExpressionsRenderer, IExpressionTemplateData, IInputBoxOptions } from './baseDebugView.js';
import { DebugExpressionRenderer } from './debugExpressionRenderer.js';
import { debugConsoleEvaluationInput } from './debugIcons.js';

const $ = dom.$;

interface IReplEvaluationInputTemplateData {
	label: HighlightedLabel;
}

interface IReplGroupTemplateData {
	label: HTMLElement;
	source: SourceWidget;
	elementDisposable?: IDisposable;
}

interface IReplEvaluationResultTemplateData {
	value: HTMLElement;
	elementStore: DisposableStore;
}

interface IOutputReplElementTemplateData {
	container: HTMLElement;
	count: CountBadge;
	countContainer: HTMLElement;
	value: HTMLElement;
	source: SourceWidget;
	getReplElementSource(): IReplElementSource | undefined;
	elementDisposable: DisposableStore;
}

interface IRawObjectReplTemplateData {
	container: HTMLElement;
	expression: HTMLElement;
	name: HTMLElement;
	value: HTMLElement;
	label: HighlightedLabel;
	elementStore: DisposableStore;
}

export class ReplEvaluationInputsRenderer implements ITreeRenderer<ReplEvaluationInput, FuzzyScore, IReplEvaluationInputTemplateData> {
	static readonly ID = 'replEvaluationInput';

	get templateId(): string {
		return ReplEvaluationInputsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IReplEvaluationInputTemplateData {
		dom.append(container, $('span.arrow' + ThemeIcon.asCSSSelector(debugConsoleEvaluationInput)));
		const input = dom.append(container, $('.expression'));
		const label = new HighlightedLabel(input);
		return { label };
	}

	renderElement(element: ITreeNode<ReplEvaluationInput, FuzzyScore>, index: number, templateData: IReplEvaluationInputTemplateData): void {
		const evaluation = element.element;
		templateData.label.set(evaluation.value, createMatches(element.filterData));
	}

	disposeTemplate(templateData: IReplEvaluationInputTemplateData): void {
		templateData.label.dispose();
	}
}

export class ReplGroupRenderer implements ITreeRenderer<ReplGroup, FuzzyScore, IReplGroupTemplateData> {
	static readonly ID = 'replGroup';

	constructor(
		private readonly expressionRenderer: DebugExpressionRenderer,
		@IInstantiationService private readonly instaService: IInstantiationService,
	) { }

	get templateId(): string {
		return ReplGroupRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IReplGroupTemplateData {
		container.classList.add('group');
		const expression = dom.append(container, $('.output.expression.value-and-source'));
		const label = dom.append(expression, $('span.label'));
		const source = this.instaService.createInstance(SourceWidget, expression);
		return { label, source };
	}

	renderElement(element: ITreeNode<ReplGroup, FuzzyScore>, _index: number, templateData: IReplGroupTemplateData): void {

		templateData.elementDisposable?.dispose();
		const replGroup = element.element;
		dom.clearNode(templateData.label);
		templateData.elementDisposable = this.expressionRenderer.renderValue(templateData.label, replGroup.name, { wasANSI: true, session: element.element.session });
		templateData.source.setSource(replGroup.sourceData);
	}

	disposeTemplate(templateData: IReplGroupTemplateData): void {
		templateData.elementDisposable?.dispose();
		templateData.source.dispose();
	}
}

export class ReplEvaluationResultsRenderer implements ITreeRenderer<ReplEvaluationResult | Variable, FuzzyScore, IReplEvaluationResultTemplateData> {
	static readonly ID = 'replEvaluationResult';

	get templateId(): string {
		return ReplEvaluationResultsRenderer.ID;
	}

	constructor(
		private readonly expressionRenderer: DebugExpressionRenderer,
	) { }

	renderTemplate(container: HTMLElement): IReplEvaluationResultTemplateData {
		const output = dom.append(container, $('.evaluation-result.expression'));
		const value = dom.append(output, $('span.value'));

		return { value, elementStore: new DisposableStore() };
	}

	renderElement(element: ITreeNode<ReplEvaluationResult | Variable, FuzzyScore>, index: number, templateData: IReplEvaluationResultTemplateData): void {
		templateData.elementStore.clear();
		const expression = element.element;
		templateData.elementStore.add(this.expressionRenderer.renderValue(templateData.value, expression, {
			colorize: true,
			hover: false,
			session: element.element.getSession(),
		}));
	}

	disposeTemplate(templateData: IReplEvaluationResultTemplateData): void {
		templateData.elementStore.dispose();
	}
}

export class ReplOutputElementRenderer implements ITreeRenderer<ReplOutputElement, FuzzyScore, IOutputReplElementTemplateData> {
	static readonly ID = 'outputReplElement';

	constructor(
		private readonly expressionRenderer: DebugExpressionRenderer,
		@IInstantiationService private readonly instaService: IInstantiationService,
	) { }

	get templateId(): string {
		return ReplOutputElementRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IOutputReplElementTemplateData {
		const data: IOutputReplElementTemplateData = Object.create(null);
		container.classList.add('output');
		const expression = dom.append(container, $('.output.expression.value-and-source'));

		data.container = container;
		data.countContainer = dom.append(expression, $('.count-badge-wrapper'));
		data.count = new CountBadge(data.countContainer, {}, defaultCountBadgeStyles);
		data.value = dom.append(expression, $('span.value.label'));
		data.source = this.instaService.createInstance(SourceWidget, expression);
		data.elementDisposable = new DisposableStore();

		return data;
	}

	renderElement({ element }: ITreeNode<ReplOutputElement, FuzzyScore>, index: number, templateData: IOutputReplElementTemplateData): void {
		templateData.elementDisposable.clear();
		this.setElementCount(element, templateData);
		templateData.elementDisposable.add(element.onDidChangeCount(() => this.setElementCount(element, templateData)));
		// value
		dom.clearNode(templateData.value);
		// Reset classes to clear ansi decorations since templates are reused
		templateData.value.className = 'value';

		const locationReference = element.expression?.valueLocationReference;
		templateData.elementDisposable.add(this.expressionRenderer.renderValue(templateData.value, element.value, { wasANSI: true, session: element.session, locationReference }));

		templateData.value.classList.add((element.severity === severity.Warning) ? 'warn' : (element.severity === severity.Error) ? 'error' : (element.severity === severity.Ignore) ? 'ignore' : 'info');
		templateData.source.setSource(element.sourceData);
		templateData.getReplElementSource = () => element.sourceData;
	}

	private setElementCount(element: ReplOutputElement, templateData: IOutputReplElementTemplateData): void {
		if (element.count >= 2) {
			templateData.count.setCount(element.count);
			templateData.countContainer.hidden = false;
		} else {
			templateData.countContainer.hidden = true;
		}
	}

	disposeTemplate(templateData: IOutputReplElementTemplateData): void {
		templateData.source.dispose();
		templateData.elementDisposable.dispose();
	}

	disposeElement(_element: ITreeNode<ReplOutputElement, FuzzyScore>, _index: number, templateData: IOutputReplElementTemplateData): void {
		templateData.elementDisposable.clear();
	}
}

export class ReplVariablesRenderer extends AbstractExpressionsRenderer<IExpression | ReplVariableElement> {

	static readonly ID = 'replVariable';

	get templateId(): string {
		return ReplVariablesRenderer.ID;
	}

	constructor(
		private readonly expressionRenderer: DebugExpressionRenderer,
		@IDebugService debugService: IDebugService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
	) {
		super(debugService, contextViewService, hoverService);
	}

	public renderElement(node: ITreeNode<IExpression | ReplVariableElement, FuzzyScore>, _index: number, data: IExpressionTemplateData): void {
		const element = node.element;
		data.elementDisposable.clear();
		super.renderExpressionElement(element instanceof ReplVariableElement ? element.expression : element, node, data);
	}

	protected renderExpression(expression: IExpression | ReplVariableElement, data: IExpressionTemplateData, highlights: IHighlight[]): void {
		const isReplVariable = expression instanceof ReplVariableElement;
		if (isReplVariable || !expression.name) {
			data.label.set('');
			const value = isReplVariable ? expression.expression : expression;
			data.elementDisposable.add(this.expressionRenderer.renderValue(data.value, value, { colorize: true, hover: false, session: expression.getSession() }));
			data.expression.classList.remove('nested-variable');
		} else {
			data.elementDisposable.add(this.expressionRenderer.renderVariable(data, expression as Variable, { showChanged: true, highlights }));
			data.expression.classList.toggle('nested-variable', isNestedVariable(expression));
		}
	}

	protected getInputBoxOptions(expression: IExpression): IInputBoxOptions | undefined {
		return undefined;
	}
}

export class ReplRawObjectsRenderer implements ITreeRenderer<RawObjectReplElement, FuzzyScore, IRawObjectReplTemplateData> {
	static readonly ID = 'rawObject';

	constructor(
		private readonly expressionRenderer: DebugExpressionRenderer,
	) { }

	get templateId(): string {
		return ReplRawObjectsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IRawObjectReplTemplateData {
		container.classList.add('output');

		const expression = dom.append(container, $('.output.expression'));
		const name = dom.append(expression, $('span.name'));
		const label = new HighlightedLabel(name);
		const value = dom.append(expression, $('span.value'));

		return { container, expression, name, label, value, elementStore: new DisposableStore() };
	}

	renderElement(node: ITreeNode<RawObjectReplElement, FuzzyScore>, index: number, templateData: IRawObjectReplTemplateData): void {
		templateData.elementStore.clear();

		// key
		const element = node.element;
		templateData.label.set(element.name ? `${element.name}:` : '', createMatches(node.filterData));
		if (element.name) {
			templateData.name.textContent = `${element.name}:`;
		} else {
			templateData.name.textContent = '';
		}

		// value
		templateData.elementStore.add(this.expressionRenderer.renderValue(templateData.value, element.value, {
			hover: false,
			session: node.element.getSession(),
		}));
	}

	disposeTemplate(templateData: IRawObjectReplTemplateData): void {
		templateData.elementStore.dispose();
		templateData.label.dispose();
	}
}

function isNestedVariable(element: IReplElement) {
	return element instanceof Variable && (element.parent instanceof ReplEvaluationResult || element.parent instanceof Variable);
}

export class ReplDelegate extends CachedListVirtualDelegate<IReplElement> {

	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly replOptions: IReplOptions
	) {
		super();
	}

	override getHeight(element: IReplElement): number {
		const config = this.configurationService.getValue<IDebugConfiguration>('debug');

		if (!config.console.wordWrap) {
			return this.estimateHeight(element, true);
		}

		return super.getHeight(element);
	}

	/**
	 * With wordWrap enabled, this is an estimate. With wordWrap disabled, this is the real height that the list will use.
	 */
	protected estimateHeight(element: IReplElement, ignoreValueLength = false): number {
		const lineHeight = this.replOptions.replConfiguration.lineHeight;
		const countNumberOfLines = (str: string) => str.match(/\n/g)?.length ?? 0;
		const hasValue = (e: any): e is { value: string } => typeof e.value === 'string';

		if (hasValue(element) && !isNestedVariable(element)) {
			const value = element.value;
			const valueRows = countNumberOfLines(value)
				+ (ignoreValueLength ? 0 : Math.floor(value.length / 70)) // Make an estimate for wrapping
				+ (element instanceof ReplOutputElement ? 0 : 1); // A SimpleReplElement ends in \n if it's a complete line

			return Math.max(valueRows, 1) * lineHeight;
		}

		return lineHeight;
	}

	getTemplateId(element: IReplElement): string {
		if (element instanceof Variable || element instanceof ReplVariableElement) {
			return ReplVariablesRenderer.ID;
		}
		if (element instanceof ReplEvaluationResult) {
			return ReplEvaluationResultsRenderer.ID;
		}
		if (element instanceof ReplEvaluationInput) {
			return ReplEvaluationInputsRenderer.ID;
		}
		if (element instanceof ReplOutputElement) {
			return ReplOutputElementRenderer.ID;
		}
		if (element instanceof ReplGroup) {
			return ReplGroupRenderer.ID;
		}

		return ReplRawObjectsRenderer.ID;
	}

	hasDynamicHeight(element: IReplElement): boolean {
		if (isNestedVariable(element)) {
			// Nested variables should always be in one line #111843
			return false;
		}
		// Empty elements should not have dynamic height since they will be invisible
		return element.toString().length > 0;
	}
}

function isDebugSession(obj: any): obj is IDebugSession {
	return typeof obj.getReplElements === 'function';
}

export class ReplDataSource implements IAsyncDataSource<IDebugSession, IReplElement> {

	hasChildren(element: IReplElement | IDebugSession): boolean {
		if (isDebugSession(element)) {
			return true;
		}

		return !!(<IExpressionContainer | INestingReplElement>element).hasChildren;
	}

	getChildren(element: IReplElement | IDebugSession): Promise<IReplElement[]> {
		if (isDebugSession(element)) {
			return Promise.resolve(element.getReplElements());
		}

		return Promise.resolve((<IExpression | INestingReplElement>element).getChildren());
	}
}

export class ReplAccessibilityProvider implements IListAccessibilityProvider<IReplElement> {

	getWidgetAriaLabel(): string {
		return localize('debugConsole', "Debug Console");
	}

	getAriaLabel(element: IReplElement): string {
		if (element instanceof Variable) {
			return localize('replVariableAriaLabel', "Variable {0}, value {1}", element.name, element.value);
		}
		if (element instanceof ReplOutputElement || element instanceof ReplEvaluationInput || element instanceof ReplEvaluationResult) {
			return element.value + (element instanceof ReplOutputElement && element.count > 1 ? localize({ key: 'occurred', comment: ['Front will the value of the debug console element. Placeholder will be replaced by a number which represents occurrance count.'] },
				", occurred {0} times", element.count) : '');
		}
		if (element instanceof RawObjectReplElement) {
			return localize('replRawObjectAriaLabel', "Debug console variable {0}, value {1}", element.name, element.value);
		}
		if (element instanceof ReplGroup) {
			return localize('replGroup', "Debug console group {0}", element.name);
		}

		return '';
	}
}

class SourceWidget extends Disposable {
	private readonly el: HTMLElement;
	private source?: IReplElementSource;
	private hover?: IManagedHover;

	constructor(container: HTMLElement,
		@IEditorService editorService: IEditorService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();
		this.el = dom.append(container, $('.source'));
		this._register(dom.addDisposableListener(this.el, 'click', e => {
			e.preventDefault();
			e.stopPropagation();
			if (this.source) {
				this.source.source.openInEditor(editorService, {
					startLineNumber: this.source.lineNumber,
					startColumn: this.source.column,
					endLineNumber: this.source.lineNumber,
					endColumn: this.source.column
				});
			}
		}));

	}

	public setSource(source?: IReplElementSource) {
		this.source = source;
		this.el.textContent = source ? `${basename(source.source.name)}:${source.lineNumber}` : '';

		this.hover ??= this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.el, ''));
		this.hover.update(source ? `${this.labelService.getUriLabel(source.source.uri)}:${source.lineNumber}` : '');
	}
}
