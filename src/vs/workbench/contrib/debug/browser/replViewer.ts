/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { HighlightedLabel, IHighlight } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IManagedHover } from 'vs/base/browser/ui/hover/hover';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { CachedListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { createMatches, FuzzyScore } from 'vs/base/common/filters';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/path';
import severity from 'vs/base/common/severity';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { defaultCountBadgeStyles } from 'vs/platform/theme/browser/defaultStyles';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { AbstractExpressionsRenderer, IExpressionTemplateData, IInputBoxOptions, renderExpressionValue, renderVariable } from 'vs/workbench/contrib/debug/browser/baseDebugView';
import { handleANSIOutput } from 'vs/workbench/contrib/debug/browser/debugANSIHandling';
import { debugConsoleEvaluationInput } from 'vs/workbench/contrib/debug/browser/debugIcons';
import { LinkDetector } from 'vs/workbench/contrib/debug/browser/linkDetector';
import { IDebugConfiguration, IDebugService, IDebugSession, IExpression, IExpressionContainer, INestingReplElement, IReplElement, IReplElementSource, IReplOptions } from 'vs/workbench/contrib/debug/common/debug';
import { Variable } from 'vs/workbench/contrib/debug/common/debugModel';
import { RawObjectReplElement, ReplEvaluationInput, ReplEvaluationResult, ReplGroup, ReplOutputElement, ReplVariableElement } from 'vs/workbench/contrib/debug/common/replModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const $ = dom.$;

interface IReplEvaluationInputTemplateData {
	label: HighlightedLabel;
}

interface IReplGroupTemplateData {
	label: HTMLElement;
	source: SourceWidget;
}

interface IReplEvaluationResultTemplateData {
	value: HTMLElement;
}

interface IOutputReplElementTemplateData {
	container: HTMLElement;
	count: CountBadge;
	countContainer: HTMLElement;
	value: HTMLElement;
	source: SourceWidget;
	getReplElementSource(): IReplElementSource | undefined;
	elementListener: IDisposable;
}

interface IRawObjectReplTemplateData {
	container: HTMLElement;
	expression: HTMLElement;
	name: HTMLElement;
	value: HTMLElement;
	label: HighlightedLabel;
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
		private readonly linkDetector: LinkDetector,
		@IThemeService private readonly themeService: IThemeService,
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
		const replGroup = element.element;
		dom.clearNode(templateData.label);
		const result = handleANSIOutput(replGroup.name, this.linkDetector, this.themeService, undefined);
		templateData.label.appendChild(result);
		templateData.source.setSource(replGroup.sourceData);
	}

	disposeTemplate(templateData: IReplGroupTemplateData): void {
		templateData.source.dispose();
	}
}

export class ReplEvaluationResultsRenderer implements ITreeRenderer<ReplEvaluationResult | Variable, FuzzyScore, IReplEvaluationResultTemplateData> {
	static readonly ID = 'replEvaluationResult';

	get templateId(): string {
		return ReplEvaluationResultsRenderer.ID;
	}

	constructor(
		private readonly linkDetector: LinkDetector,
		private readonly hoverService: IHoverService
	) { }

	renderTemplate(container: HTMLElement): IReplEvaluationResultTemplateData {
		const output = dom.append(container, $('.evaluation-result.expression'));
		const value = dom.append(output, $('span.value'));

		return { value };
	}

	renderElement(element: ITreeNode<ReplEvaluationResult | Variable, FuzzyScore>, index: number, templateData: IReplEvaluationResultTemplateData): void {
		const expression = element.element;
		renderExpressionValue(expression, templateData.value, {
			colorize: true,
			linkDetector: this.linkDetector
		}, this.hoverService);
	}

	disposeTemplate(templateData: IReplEvaluationResultTemplateData): void {
		// noop
	}
}

export class ReplOutputElementRenderer implements ITreeRenderer<ReplOutputElement, FuzzyScore, IOutputReplElementTemplateData> {
	static readonly ID = 'outputReplElement';

	constructor(
		private readonly linkDetector: LinkDetector,
		@IThemeService private readonly themeService: IThemeService,
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

		return data;
	}

	renderElement({ element }: ITreeNode<ReplOutputElement, FuzzyScore>, index: number, templateData: IOutputReplElementTemplateData): void {
		this.setElementCount(element, templateData);
		templateData.elementListener = element.onDidChangeCount(() => this.setElementCount(element, templateData));
		// value
		dom.clearNode(templateData.value);
		// Reset classes to clear ansi decorations since templates are reused
		templateData.value.className = 'value';

		templateData.value.appendChild(handleANSIOutput(element.value, this.linkDetector, this.themeService, element.session.root));

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
	}

	disposeElement(_element: ITreeNode<ReplOutputElement, FuzzyScore>, _index: number, templateData: IOutputReplElementTemplateData): void {
		templateData.elementListener.dispose();
	}
}

export class ReplVariablesRenderer extends AbstractExpressionsRenderer<IExpression | ReplVariableElement> {

	static readonly ID = 'replVariable';

	get templateId(): string {
		return ReplVariablesRenderer.ID;
	}

	constructor(
		private readonly linkDetector: LinkDetector,
		@IDebugService debugService: IDebugService,
		@IContextViewService contextViewService: IContextViewService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService hoverService: IHoverService
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
			renderExpressionValue(isReplVariable ? expression.expression : expression, data.value, { colorize: true, linkDetector: this.linkDetector }, this.hoverService);
			data.expression.classList.remove('nested-variable');
		} else {
			renderVariable(data.elementDisposable, this.commandService, this.hoverService, expression as Variable, data, true, highlights, this.linkDetector);
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
		private readonly linkDetector: LinkDetector,
		private readonly hoverService: IHoverService
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

		return { container, expression, name, label, value };
	}

	renderElement(node: ITreeNode<RawObjectReplElement, FuzzyScore>, index: number, templateData: IRawObjectReplTemplateData): void {
		// key
		const element = node.element;
		templateData.label.set(element.name ? `${element.name}:` : '', createMatches(node.filterData));
		if (element.name) {
			templateData.name.textContent = `${element.name}:`;
		} else {
			templateData.name.textContent = '';
		}

		// value
		renderExpressionValue(element.value, templateData.value, {
			linkDetector: this.linkDetector
		}, this.hoverService);
	}

	disposeTemplate(templateData: IRawObjectReplTemplateData): void {
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
