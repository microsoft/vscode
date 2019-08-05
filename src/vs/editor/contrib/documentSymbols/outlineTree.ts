/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IDataSource, ITreeNode, ITreeRenderer, ITreeSorter } from 'vs/base/browser/ui/tree/tree';
import { values } from 'vs/base/common/collections';
import { createMatches, FuzzyScore } from 'vs/base/common/filters';
import 'vs/css!./media/outlineTree';
import 'vs/css!./media/symbol-icons';
import { Range } from 'vs/editor/common/core/range';
import { SymbolKind, symbolKindToCssClass } from 'vs/editor/common/modes';
import { OutlineElement, OutlineGroup, OutlineModel } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { localize } from 'vs/nls';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { OutlineConfigKeys } from 'vs/editor/contrib/documentSymbols/outline';
import { MarkerSeverity } from 'vs/platform/markers/common/markers';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { listErrorForeground, listWarningForeground } from 'vs/platform/theme/common/colorRegistry';
import { IdleValue } from 'vs/base/common/async';

export type OutlineItem = OutlineGroup | OutlineElement;

export class OutlineNavigationLabelProvider implements IKeyboardNavigationLabelProvider<OutlineItem> {

	getKeyboardNavigationLabel(element: OutlineItem): { toString(): string; } {
		if (element instanceof OutlineGroup) {
			return element.provider.displayName || element.id;
		} else {
			return element.symbol.name;
		}
	}
}


export class OutlineIdentityProvider implements IIdentityProvider<OutlineItem> {
	getId(element: OutlineItem): { toString(): string; } {
		return element.id;
	}
}

export class OutlineGroupTemplate {
	static id = 'OutlineGroupTemplate';
	constructor(
		readonly labelContainer: HTMLElement,
		readonly label: HighlightedLabel,
	) { }
}

export class OutlineElementTemplate {
	static id = 'OutlineElementTemplate';
	constructor(
		readonly container: HTMLElement,
		readonly iconLabel: IconLabel,
		readonly decoration: HTMLElement,
	) { }
}

export class OutlineVirtualDelegate implements IListVirtualDelegate<OutlineItem> {

	getHeight(_element: OutlineItem): number {
		return 22;
	}

	getTemplateId(element: OutlineItem): string {
		if (element instanceof OutlineGroup) {
			return OutlineGroupTemplate.id;
		} else {
			return OutlineElementTemplate.id;
		}
	}
}

export class OutlineGroupRenderer implements ITreeRenderer<OutlineGroup, FuzzyScore, OutlineGroupTemplate> {

	readonly templateId: string = OutlineGroupTemplate.id;

	renderTemplate(container: HTMLElement): OutlineGroupTemplate {
		const labelContainer = dom.$('.outline-element-label');
		dom.addClass(container, 'outline-element');
		dom.append(container, labelContainer);
		return new OutlineGroupTemplate(labelContainer, new HighlightedLabel(labelContainer, true));
	}

	renderElement(node: ITreeNode<OutlineGroup, FuzzyScore>, index: number, template: OutlineGroupTemplate): void {
		template.label.set(
			node.element.provider.displayName || localize('provider', "Outline Provider"),
			createMatches(node.filterData)
		);
	}

	disposeTemplate(_template: OutlineGroupTemplate): void {
		// nothing
	}
}

export class OutlineElementRenderer implements ITreeRenderer<OutlineElement, FuzzyScore, OutlineElementTemplate> {

	readonly templateId: string = OutlineElementTemplate.id;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	renderTemplate(container: HTMLElement): OutlineElementTemplate {
		dom.addClass(container, 'outline-element');
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		const decoration = dom.$('.outline-element-decoration');
		container.appendChild(decoration);
		return new OutlineElementTemplate(container, iconLabel, decoration);
	}

	renderElement(node: ITreeNode<OutlineElement, FuzzyScore>, index: number, template: OutlineElementTemplate): void {
		const { element } = node;
		const options = {
			matches: createMatches(node.filterData),
			labelEscapeNewLines: true,
			extraClasses: <string[]>[],
			title: localize('title.template', "{0} ({1})", element.symbol.name, OutlineElementRenderer._symbolKindNames[element.symbol.kind])
		};
		if (this._configurationService.getValue(OutlineConfigKeys.icons)) {
			// add styles for the icons
			options.extraClasses.push(`outline-element-icon ${symbolKindToCssClass(element.symbol.kind, true)}`);
		}
		template.iconLabel.setLabel(element.symbol.name, element.symbol.detail, options);
		this._renderMarkerInfo(element, template);
	}

	private _renderMarkerInfo(element: OutlineElement, template: OutlineElementTemplate): void {

		if (!element.marker) {
			dom.hide(template.decoration);
			template.container.style.removeProperty('--outline-element-color');
			return;
		}

		const { count, topSev } = element.marker;
		const color = this._themeService.getTheme().getColor(topSev === MarkerSeverity.Error ? listErrorForeground : listWarningForeground);
		const cssColor = color ? color.toString() : 'inherit';

		// color of the label
		if (this._configurationService.getValue(OutlineConfigKeys.problemsColors)) {
			template.container.style.setProperty('--outline-element-color', cssColor);
		} else {
			template.container.style.removeProperty('--outline-element-color');
		}

		// badge with color/rollup
		if (!this._configurationService.getValue(OutlineConfigKeys.problemsBadges)) {
			dom.hide(template.decoration);

		} else if (count > 0) {
			dom.show(template.decoration);
			dom.removeClass(template.decoration, 'bubble');
			template.decoration.innerText = count < 10 ? count.toString() : '+9';
			template.decoration.title = count === 1 ? localize('1.problem', "1 problem in this element") : localize('N.problem', "{0} problems in this element", count);
			template.decoration.style.setProperty('--outline-element-color', cssColor);

		} else {
			dom.show(template.decoration);
			dom.addClass(template.decoration, 'bubble');
			template.decoration.innerText = '\uf052';
			template.decoration.title = localize('deep.problem', "Contains elements with problems");
			template.decoration.style.setProperty('--outline-element-color', cssColor);
		}
	}

	private static _symbolKindNames: { [symbol: number]: string } = {
		[SymbolKind.Array]: localize('Array', "array"),
		[SymbolKind.Boolean]: localize('Boolean', "boolean"),
		[SymbolKind.Class]: localize('Class', "class"),
		[SymbolKind.Constant]: localize('Constant', "constant"),
		[SymbolKind.Constructor]: localize('Constructor', "constructor"),
		[SymbolKind.Enum]: localize('Enum', "enumeration"),
		[SymbolKind.EnumMember]: localize('EnumMember', "enumeration member"),
		[SymbolKind.Event]: localize('Event', "event"),
		[SymbolKind.Field]: localize('Field', "field"),
		[SymbolKind.File]: localize('File', "file"),
		[SymbolKind.Function]: localize('Function', "function"),
		[SymbolKind.Interface]: localize('Interface', "interface"),
		[SymbolKind.Key]: localize('Key', "key"),
		[SymbolKind.Method]: localize('Method', "method"),
		[SymbolKind.Module]: localize('Module', "module"),
		[SymbolKind.Namespace]: localize('Namespace', "namespace"),
		[SymbolKind.Null]: localize('Null', "null"),
		[SymbolKind.Number]: localize('Number', "number"),
		[SymbolKind.Object]: localize('Object', "object"),
		[SymbolKind.Operator]: localize('Operator', "operator"),
		[SymbolKind.Package]: localize('Package', "package"),
		[SymbolKind.Property]: localize('Property', "property"),
		[SymbolKind.String]: localize('String', "string"),
		[SymbolKind.Struct]: localize('Struct', "struct"),
		[SymbolKind.TypeParameter]: localize('TypeParameter', "type parameter"),
		[SymbolKind.Variable]: localize('Variable', "variable"),
	};

	disposeTemplate(_template: OutlineElementTemplate): void {
		_template.iconLabel.dispose();
	}
}

export const enum OutlineSortOrder {
	ByPosition,
	ByName,
	ByKind
}

export class OutlineItemComparator implements ITreeSorter<OutlineItem> {

	private readonly _collator = new IdleValue<Intl.Collator>(() => new Intl.Collator(undefined, { numeric: true }));

	constructor(
		public type: OutlineSortOrder = OutlineSortOrder.ByPosition
	) { }

	compare(a: OutlineItem, b: OutlineItem): number {
		if (a instanceof OutlineGroup && b instanceof OutlineGroup) {
			return a.providerIndex - b.providerIndex;

		} else if (a instanceof OutlineElement && b instanceof OutlineElement) {
			if (this.type === OutlineSortOrder.ByKind) {
				return a.symbol.kind - b.symbol.kind || this._collator.getValue().compare(a.symbol.name, b.symbol.name);
			} else if (this.type === OutlineSortOrder.ByName) {
				return this._collator.getValue().compare(a.symbol.name, b.symbol.name) || Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range);
			} else if (this.type === OutlineSortOrder.ByPosition) {
				return Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range) || this._collator.getValue().compare(a.symbol.name, b.symbol.name);
			}
		}
		return 0;
	}
}

export class OutlineDataSource implements IDataSource<OutlineModel, OutlineItem> {

	getChildren(element: undefined | OutlineModel | OutlineGroup | OutlineElement): OutlineItem[] {
		if (!element) {
			return [];
		}
		return values(element.children);
	}
}
