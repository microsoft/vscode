/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDragAndDropData } from '../../../../../base/browser/dnd.js';
import * as dom from '../../../../../base/browser/dom.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { IconLabel, IIconLabelValueOptions } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { ElementsDragAndDropData } from '../../../../../base/browser/ui/list/listView.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { ITreeDragAndDrop, ITreeDragOverReaction, ITreeFilter, ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';
import { safeIntl } from '../../../../../base/common/date.js';
import { createMatches, FuzzyScore } from '../../../../../base/common/filters.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { DocumentSymbol, getAriaLabelForSymbol, SymbolKind, symbolKindNames, SymbolKinds, SymbolTag } from '../../../../../editor/common/languages.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { OutlineElement, OutlineGroup, OutlineModel } from '../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import '../../../../../editor/contrib/symbolIcons/browser/symbolIcons.js'; // The codicon symbol colors are defined here and must be loaded to get colors
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { fillInSymbolsDragData, IResourceStat } from '../../../../../platform/dnd/browser/dnd.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { withSelection } from '../../../../../platform/opener/common/opener.js';
import { listErrorForeground, listWarningForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { fillEditorsDragData } from '../../../../browser/dnd.js';
import { IOutlineComparator, OutlineConfigKeys, OutlineTarget } from '../../../../services/outline/browser/outline.js';
import './documentSymbolsTree.css';

export type DocumentSymbolItem = OutlineGroup | OutlineElement;

export class DocumentSymbolNavigationLabelProvider implements IKeyboardNavigationLabelProvider<DocumentSymbolItem> {

	getKeyboardNavigationLabel(element: DocumentSymbolItem): { toString(): string } {
		if (element instanceof OutlineGroup) {
			return element.label;
		} else {
			return element.symbol.name;
		}
	}
}

export class DocumentSymbolAccessibilityProvider implements IListAccessibilityProvider<DocumentSymbolItem> {

	constructor(private readonly _ariaLabel: string) { }

	getWidgetAriaLabel(): string {
		return this._ariaLabel;
	}
	getAriaLabel(element: DocumentSymbolItem): string | null {
		if (element instanceof OutlineGroup) {
			return element.label;
		} else {
			return getAriaLabelForSymbol(element.symbol.name, element.symbol.kind);
		}
	}
}

export class DocumentSymbolIdentityProvider implements IIdentityProvider<DocumentSymbolItem> {
	getId(element: DocumentSymbolItem): { toString(): string } {
		return element.id;
	}
}

export class DocumentSymbolDragAndDrop implements ITreeDragAndDrop<DocumentSymbolItem> {

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) { }

	getDragURI(element: DocumentSymbolItem): string | null {
		const resource = OutlineModel.get(element)?.uri;
		if (!resource) {
			return null;
		}

		if (element instanceof OutlineElement) {
			const symbolUri = symbolRangeUri(resource, element.symbol);
			return symbolUri.fsPath + (symbolUri.fragment ? '#' + symbolUri.fragment : '');
		} else {
			return resource.fsPath;
		}
	}

	getDragLabel(elements: DocumentSymbolItem[], originalEvent: DragEvent): string | undefined {
		// Multi select not supported
		if (elements.length !== 1) {
			return undefined;
		}

		const element = elements[0];
		return element instanceof OutlineElement ? element.symbol.name : element.label;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const elements = (data as ElementsDragAndDropData<DocumentSymbolItem, DocumentSymbolItem[]>).elements;
		const item = elements[0];
		if (!item || !originalEvent.dataTransfer) {
			return;
		}

		const resource = OutlineModel.get(item)?.uri;
		if (!resource) {
			return;
		}

		const outlineElements = item instanceof OutlineElement ? [item] : Array.from(item.children.values());

		fillInSymbolsDragData(outlineElements.map(oe => ({
			name: oe.symbol.name,
			fsPath: resource.fsPath,
			range: oe.symbol.range,
			kind: oe.symbol.kind
		})), originalEvent);

		this._instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, outlineElements.map((oe): IResourceStat => ({
			resource,
			selection: oe.symbol.range,
		})), originalEvent));
	}

	onDragOver(): boolean | ITreeDragOverReaction { return false; }
	drop(): void { }
	dispose(): void { }
}

function symbolRangeUri(resource: URI, symbol: DocumentSymbol): URI {
	return withSelection(resource, symbol.range);
}

class DocumentSymbolGroupTemplate {
	static readonly id = 'DocumentSymbolGroupTemplate';
	constructor(
		readonly labelContainer: HTMLElement,
		readonly label: HighlightedLabel,
	) { }

	dispose() {
		this.label.dispose();
	}
}

class DocumentSymbolTemplate {
	static readonly id = 'DocumentSymbolTemplate';
	constructor(
		readonly container: HTMLElement,
		readonly iconLabel: IconLabel,
		readonly iconClass: HTMLElement,
		readonly decoration: HTMLElement,
	) { }
}

export class DocumentSymbolVirtualDelegate implements IListVirtualDelegate<DocumentSymbolItem> {

	getHeight(_element: DocumentSymbolItem): number {
		return 22;
	}

	getTemplateId(element: DocumentSymbolItem): string {
		return element instanceof OutlineGroup
			? DocumentSymbolGroupTemplate.id
			: DocumentSymbolTemplate.id;
	}
}

export class DocumentSymbolGroupRenderer implements ITreeRenderer<OutlineGroup, FuzzyScore, DocumentSymbolGroupTemplate> {

	readonly templateId: string = DocumentSymbolGroupTemplate.id;

	renderTemplate(container: HTMLElement): DocumentSymbolGroupTemplate {
		const labelContainer = dom.$('.outline-element-label');
		container.classList.add('outline-element');
		dom.append(container, labelContainer);
		return new DocumentSymbolGroupTemplate(labelContainer, new HighlightedLabel(labelContainer));
	}

	renderElement(node: ITreeNode<OutlineGroup, FuzzyScore>, _index: number, template: DocumentSymbolGroupTemplate): void {
		template.label.set(node.element.label, createMatches(node.filterData));
	}

	disposeTemplate(_template: DocumentSymbolGroupTemplate): void {
		_template.dispose();
	}
}

export class DocumentSymbolRenderer implements ITreeRenderer<OutlineElement, FuzzyScore, DocumentSymbolTemplate> {

	readonly templateId: string = DocumentSymbolTemplate.id;

	constructor(
		private _renderMarker: boolean,
		target: OutlineTarget,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	renderTemplate(container: HTMLElement): DocumentSymbolTemplate {
		container.classList.add('outline-element');
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		const iconClass = dom.$('.outline-element-icon');
		const decoration = dom.$('.outline-element-decoration');
		container.prepend(iconClass);
		container.appendChild(decoration);
		return new DocumentSymbolTemplate(container, iconLabel, iconClass, decoration);
	}

	renderElement(node: ITreeNode<OutlineElement, FuzzyScore>, _index: number, template: DocumentSymbolTemplate): void {
		const { element } = node;
		const extraClasses = ['nowrap'];
		const options: IIconLabelValueOptions = {
			matches: createMatches(node.filterData),
			labelEscapeNewLines: true,
			extraClasses,
			title: localize('title.template', "{0} ({1})", element.symbol.name, symbolKindNames[element.symbol.kind])
		};
		if (this._configurationService.getValue(OutlineConfigKeys.icons)) {
			// add styles for the icons
			template.iconClass.className = '';
			template.iconClass.classList.add('outline-element-icon', 'inline', ...ThemeIcon.asClassNameArray(SymbolKinds.toIcon(element.symbol.kind)));
		}
		if (element.symbol.tags.indexOf(SymbolTag.Deprecated) >= 0) {
			extraClasses.push(`deprecated`);
			options.matches = [];
		}
		template.iconLabel.setLabel(element.symbol.name, element.symbol.detail, options);

		if (this._renderMarker) {
			this._renderMarkerInfo(element, template);
		}
	}

	private _renderMarkerInfo(element: OutlineElement, template: DocumentSymbolTemplate): void {

		if (!element.marker) {
			dom.hide(template.decoration);
			template.container.style.removeProperty('--outline-element-color');
			return;
		}

		const { count, topSev } = element.marker;
		const color = this._themeService.getColorTheme().getColor(topSev === MarkerSeverity.Error ? listErrorForeground : listWarningForeground);
		const cssColor = color ? color.toString() : 'inherit';

		// color of the label
		const problem = this._configurationService.getValue('problems.visibility');
		const configProblems = this._configurationService.getValue(OutlineConfigKeys.problemsColors);

		if (!problem || !configProblems) {
			template.container.style.removeProperty('--outline-element-color');
		} else {
			template.container.style.setProperty('--outline-element-color', cssColor);
		}

		// badge with color/rollup
		if (problem === undefined) {
			return;
		}

		const configBadges = this._configurationService.getValue(OutlineConfigKeys.problemsBadges);
		if (!configBadges || !problem) {
			dom.hide(template.decoration);
		} else if (count > 0) {
			dom.show(template.decoration);
			template.decoration.classList.remove('bubble');
			template.decoration.textContent = count < 10 ? count.toString() : '+9';
			template.decoration.title = count === 1 ? localize('1.problem', "1 problem in this element") : localize('N.problem', "{0} problems in this element", count);
			template.decoration.style.setProperty('--outline-element-color', cssColor);

		} else {
			dom.show(template.decoration);
			template.decoration.classList.add('bubble');
			template.decoration.textContent = '\uea71';
			template.decoration.title = localize('deep.problem', "Contains elements with problems");
			template.decoration.style.setProperty('--outline-element-color', cssColor);
		}
	}

	disposeTemplate(_template: DocumentSymbolTemplate): void {
		_template.iconLabel.dispose();
	}
}

export class DocumentSymbolFilter implements ITreeFilter<DocumentSymbolItem> {

	static readonly kindToConfigName = Object.freeze({
		[SymbolKind.File]: 'showFiles',
		[SymbolKind.Module]: 'showModules',
		[SymbolKind.Namespace]: 'showNamespaces',
		[SymbolKind.Package]: 'showPackages',
		[SymbolKind.Class]: 'showClasses',
		[SymbolKind.Method]: 'showMethods',
		[SymbolKind.Property]: 'showProperties',
		[SymbolKind.Field]: 'showFields',
		[SymbolKind.Constructor]: 'showConstructors',
		[SymbolKind.Enum]: 'showEnums',
		[SymbolKind.Interface]: 'showInterfaces',
		[SymbolKind.Function]: 'showFunctions',
		[SymbolKind.Variable]: 'showVariables',
		[SymbolKind.Constant]: 'showConstants',
		[SymbolKind.String]: 'showStrings',
		[SymbolKind.Number]: 'showNumbers',
		[SymbolKind.Boolean]: 'showBooleans',
		[SymbolKind.Array]: 'showArrays',
		[SymbolKind.Object]: 'showObjects',
		[SymbolKind.Key]: 'showKeys',
		[SymbolKind.Null]: 'showNull',
		[SymbolKind.EnumMember]: 'showEnumMembers',
		[SymbolKind.Struct]: 'showStructs',
		[SymbolKind.Event]: 'showEvents',
		[SymbolKind.Operator]: 'showOperators',
		[SymbolKind.TypeParameter]: 'showTypeParameters',
	});

	constructor(
		private readonly _prefix: 'breadcrumbs' | 'outline',
		@ITextResourceConfigurationService private readonly _textResourceConfigService: ITextResourceConfigurationService,
	) { }

	filter(element: DocumentSymbolItem): boolean {
		const outline = OutlineModel.get(element);
		if (!(element instanceof OutlineElement)) {
			return true;
		}
		const configName = DocumentSymbolFilter.kindToConfigName[element.symbol.kind];
		const configKey = `${this._prefix}.${configName}`;
		return this._textResourceConfigService.getValue(outline?.uri, configKey);
	}
}

export class DocumentSymbolComparator implements IOutlineComparator<DocumentSymbolItem> {

	private readonly _collator = safeIntl.Collator(undefined, { numeric: true });

	compareByPosition(a: DocumentSymbolItem, b: DocumentSymbolItem): number {
		if (a instanceof OutlineGroup && b instanceof OutlineGroup) {
			return a.order - b.order;
		} else if (a instanceof OutlineElement && b instanceof OutlineElement) {
			return Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range) || this._collator.value.compare(a.symbol.name, b.symbol.name);
		}
		return 0;
	}
	compareByType(a: DocumentSymbolItem, b: DocumentSymbolItem): number {
		if (a instanceof OutlineGroup && b instanceof OutlineGroup) {
			return a.order - b.order;
		} else if (a instanceof OutlineElement && b instanceof OutlineElement) {
			return a.symbol.kind - b.symbol.kind || this._collator.value.compare(a.symbol.name, b.symbol.name);
		}
		return 0;
	}
	compareByName(a: DocumentSymbolItem, b: DocumentSymbolItem): number {
		if (a instanceof OutlineGroup && b instanceof OutlineGroup) {
			return a.order - b.order;
		} else if (a instanceof OutlineElement && b instanceof OutlineElement) {
			return this._collator.value.compare(a.symbol.name, b.symbol.name) || Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range);
		}
		return 0;
	}
}
