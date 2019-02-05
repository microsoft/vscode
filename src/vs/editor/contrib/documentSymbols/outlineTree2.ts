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
import { OutlineElement, OutlineGroup, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { localize } from 'vs/nls';
import { IKeybindingService, IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { MarkerSeverity } from 'vs/platform/markers/common/markers';
import { listErrorForeground, listWarningForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { OutlineConfigKeys } from 'vs/editor/contrib/documentSymbols/outline';

export type NOutlineItem = OutlineGroup | OutlineElement;

export class NOutlineNavigationLabelProvider implements IKeyboardNavigationLabelProvider<NOutlineItem> {

	constructor(@IKeybindingService private readonly _keybindingService: IKeybindingService) { }

	getKeyboardNavigationLabel(element: NOutlineItem): { toString(): string; } {
		if (element instanceof OutlineGroup) {
			return element.provider.displayName;
		} else {
			return element.symbol.name;
		}
	}

	mightProducePrintableCharacter(event: IKeyboardEvent): boolean {
		return this._keybindingService.mightProducePrintableCharacter(event);
	}
}


export class NOutlineIdentityProvider implements IIdentityProvider<NOutlineItem> {
	getId(element: TreeElement): { toString(): string; } {
		return element.id;
	}
}

export class NOutlineGroupTemplate {
	static id = 'OutlineGroupTemplate';

	labelContainer: HTMLElement;
	label: HighlightedLabel;
}

export class NOutlineElementTemplate {
	static id = 'OutlineElementTemplate';
	iconLabel: IconLabel;
	decoration: HTMLElement;
}

export class NOutlineVirtualDelegate implements IListVirtualDelegate<NOutlineItem> {

	getHeight(_element: NOutlineItem): number {
		return 22;
	}

	getTemplateId(element: NOutlineItem): string {
		if (element instanceof OutlineGroup) {
			return NOutlineGroupTemplate.id;
		} else {
			return NOutlineElementTemplate.id;
		}
	}
}

export class NOutlineGroupRenderer implements ITreeRenderer<OutlineGroup, FuzzyScore, NOutlineGroupTemplate> {

	readonly templateId: string = NOutlineGroupTemplate.id;

	renderTemplate(container: HTMLElement): NOutlineGroupTemplate {
		const labelContainer = dom.$('.outline-element-label');
		dom.addClass(container, 'outline-element');
		dom.append(container, labelContainer);
		return { labelContainer, label: new HighlightedLabel(labelContainer, true) };
	}

	renderElement(node: ITreeNode<OutlineGroup, FuzzyScore>, index: number, template: NOutlineGroupTemplate): void {
		template.label.set(
			node.element.provider.displayName || localize('provider', "Outline Provider"),
			createMatches(node.filterData)
		);
	}

	disposeTemplate(_template: NOutlineGroupTemplate): void {
		// nothing
	}
}

export class NOutlineElementRenderer implements ITreeRenderer<OutlineElement, FuzzyScore, NOutlineElementTemplate> {

	readonly templateId: string = NOutlineElementTemplate.id;

	renderProblemColors = true;
	renderProblemBadges = true;

	constructor(
		// @IMarkerService private readonly _markerService: IMarkerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) { }

	renderTemplate(container: HTMLElement): NOutlineElementTemplate {
		// const labelContainer = dom.$('.outline-element-label');
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		const decoration = dom.$('.outline-element-decoration');
		container.appendChild(decoration);
		return { iconLabel, decoration };
	}

	renderElement(node: ITreeNode<OutlineElement, FuzzyScore>, index: number, template: NOutlineElementTemplate): void {
		const { element } = node;
		const options = {
			matches: createMatches(node.filterData),
			extraClasses: [],
			title: localize('title.template', "{0} ({1})", element.symbol.name, NOutlineElementRenderer._symbolKindNames[element.symbol.kind])
		};
		if (this._configurationService.getValue(OutlineConfigKeys.icons)) {
			options.extraClasses.push(`outline-element-icon ${symbolKindToCssClass(element.symbol.kind, true)}`);
		}
		template.iconLabel.setLabel(element.symbol.name, element.symbol.detail, options);
		// this._renderMarkerInfo(element, template);
	}

	// private _renderMarkerInfo(element: OutlineElement, template: NOutlineElementTemplate): void {

	// 	if (!element.marker) {
	// 		dom.hide(template.decoration);
	// 		template.labelContainer.style.removeProperty('--outline-element-color');
	// 		return;
	// 	}

	// 	const { count, topSev } = element.marker;
	// 	const color = this._themeService.getTheme().getColor(topSev === MarkerSeverity.Error ? listErrorForeground : listWarningForeground);
	// 	const cssColor = color ? color.toString() : 'inherit';

	// 	// color of the label
	// 	if (this.renderProblemColors) {
	// 		template.labelContainer.style.setProperty('--outline-element-color', cssColor);
	// 	} else {
	// 		template.labelContainer.style.removeProperty('--outline-element-color');
	// 	}

	// 	// badge with color/rollup
	// 	if (!this.renderProblemBadges) {
	// 		dom.hide(template.decoration);

	// 	} else if (count > 0) {
	// 		dom.show(template.decoration);
	// 		dom.removeClass(template.decoration, 'bubble');
	// 		template.decoration.innerText = count < 10 ? count.toString() : '+9';
	// 		template.decoration.title = count === 1 ? localize('1.problem', "1 problem in this element") : localize('N.problem', "{0} problems in this element", count);
	// 		template.decoration.style.setProperty('--outline-element-color', cssColor);

	// 	} else {
	// 		dom.show(template.decoration);
	// 		dom.addClass(template.decoration, 'bubble');
	// 		template.decoration.innerText = '\uf052';
	// 		template.decoration.title = localize('deep.problem', "Contains elements with problems");
	// 		template.decoration.style.setProperty('--outline-element-color', cssColor);
	// 	}
	// }

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

	disposeTemplate(_template: NOutlineElementTemplate): void {
		_template.iconLabel.dispose();
	}
}

export const enum NOutlineItemCompareType {
	ByPosition,
	ByName,
	ByKind
}

export class NOutlineItemComparator implements ITreeSorter<NOutlineItem> {

	constructor(
		public type: NOutlineItemCompareType = NOutlineItemCompareType.ByPosition
	) { }

	compare(a: NOutlineItem, b: NOutlineItem): number {
		if (a instanceof OutlineGroup && b instanceof OutlineGroup) {
			return a.providerIndex - b.providerIndex;

		} else if (a instanceof OutlineElement && b instanceof OutlineElement) {
			if (this.type === NOutlineItemCompareType.ByKind) {
				return a.symbol.kind - b.symbol.kind || a.symbol.name.localeCompare(b.symbol.name);
			} else if (this.type === NOutlineItemCompareType.ByName) {
				return a.symbol.name.localeCompare(b.symbol.name) || Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range);
			} else if (this.type === NOutlineItemCompareType.ByPosition) {
				return Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range) || a.symbol.name.localeCompare(b.symbol.name);
			}
		}
		return 0;
	}
}

export class NOutlineDataSource implements IDataSource<OutlineModel, NOutlineItem> {

	getChildren(element: undefined | OutlineModel | OutlineGroup | OutlineElement): NOutlineItem[] {
		if (!element) {
			return [];
		}
		return values(element.children);
	}
}
