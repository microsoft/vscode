/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IDataSource, ITreeNode, ITreeRenderer, ITreeSorter, ITreeFilter } from 'vs/base/browser/ui/tree/tree';
import { values } from 'vs/base/common/collections';
import { createMatches, FuzzyScore } from 'vs/base/common/filters';
import 'vs/css!./media/outlineTree';
import 'vs/css!./media/symbol-icons';
import { Range } from 'vs/editor/common/core/range';
import { SymbolKind, SymbolKinds, SymbolTag } from 'vs/editor/common/modes';
import { OutlineElement, OutlineGroup, OutlineModel } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { localize } from 'vs/nls';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { OutlineConfigKeys } from 'vs/editor/contrib/documentSymbols/outline';
import { MarkerSeverity } from 'vs/platform/markers/common/markers';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { registerColor, listErrorForeground, listWarningForeground, foreground } from 'vs/platform/theme/common/colorRegistry';
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
	static readonly id = 'OutlineGroupTemplate';
	constructor(
		readonly labelContainer: HTMLElement,
		readonly label: HighlightedLabel,
	) { }
}

export class OutlineElementTemplate {
	static readonly id = 'OutlineElementTemplate';
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
			options.extraClasses.push(`outline-element-icon ${SymbolKinds.toCssClassName(element.symbol.kind, true)}`);
		}
		if (element.symbol.tags.indexOf(SymbolTag.Deprecated) >= 0) {
			options.extraClasses.push(`deprecated`);
			options.matches = [];
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
			template.decoration.innerText = '\uea71';
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

export class OutlineFilter implements ITreeFilter<OutlineItem> {

	private readonly _filteredTypes = new Set<SymbolKind>();

	constructor(
		private readonly _prefix: string,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) {

	}

	update() {
		this._filteredTypes.clear();
		for (const name of SymbolKinds.names()) {
			if (!this._configService.getValue<boolean>(`${this._prefix}.${name}`)) {
				this._filteredTypes.add(SymbolKinds.fromString(name) || -1);
			}
		}
	}

	filter(element: OutlineItem): boolean {
		return !(element instanceof OutlineElement) || !this._filteredTypes.has(element.symbol.kind);
	}
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

export const OUTLINE_ARRAY_SYMBOL_FOREGROUND = registerColor('outlineArraySymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineArraySymbol.foreground', 'The foreground color for array symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_BOOLEAN_SYMBOL_FOREGROUND = registerColor('outlineBooleanSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineBooleanSymbol.foreground', 'The foreground color for boolean symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_CLASS_SYMBOL_FOREGROUND = registerColor('outlineClassSymbol.foreground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hc: '#EE9D28'
}, localize('outlineClassSymbol.foreground', 'The foreground color for class symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_CONSTANT_SYMBOL_FOREGROUND = registerColor('outlineContstantSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineContstantSymbol.foreground', 'The foreground color for contstant symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_CONSTRUCTOR_SYMBOL_FOREGROUND = registerColor('outlineConstructorSymbol.foreground', {
	dark: '#B180D7',
	light: '#652D90',
	hc: '#B180D7'
}, localize('outlineConstructorSymbol.foreground', 'The foreground color for constructor symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_ENUMERATOR_SYMBOL_FOREGROUND = registerColor('outlineEnumeratorSymbol.foreground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hc: '#EE9D28'
}, localize('outlineEnumeratorSymbol.foreground', 'The foreground color for enumerator symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_ENUMERATOR_MEMBER_SYMBOL_FOREGROUND = registerColor('outlineEnumeratorMemberSymbol.foreground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('outlineEnumeratorMemberSymbol.foreground', 'The foreground color for enumerator member symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_EVENT_SYMBOL_FOREGROUND = registerColor('outlineEventSymbol.foreground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hc: '#EE9D28'
}, localize('outlineEventSymbol.foreground', 'The foreground color for event symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_FIELD_SYMBOL_FOREGROUND = registerColor('outlineFieldSymbol.foreground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('outlineFieldSymbol.foreground', 'The foreground color for field symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_FILE_SYMBOL_FOREGROUND = registerColor('outlineFileSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineFileSymbol.foreground', 'The foreground color for file symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_FUNCTION_SYMBOL_FOREGROUND = registerColor('outlineFunctionSymbol.foreground', {
	dark: '#B180D7',
	light: '#652D90',
	hc: '#B180D7'
}, localize('outlineFunctionSymbol.foreground', 'The foreground color for function symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_INTERFACE_SYMBOL_FOREGROUND = registerColor('outlineInterfaceSymbol.foreground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('outlineInterfaceSymbol.foreground', 'The foreground color for interface symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_KEY_SYMBOL_FOREGROUND = registerColor('outlineKeySymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineKeySymbol.foreground', 'The foreground color for key symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_METHOD_SYMBOL_FOREGROUND = registerColor('outlineMethodSymbol.foreground', {
	dark: '#B180D7',
	light: '#652D90',
	hc: '#B180D7'
}, localize('outlineMethodSymbol.foreground', 'The foreground color for method symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_MODULE_SYMBOL_FOREGROUND = registerColor('outlineModuleSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineModuleSymbol.foreground', 'The foreground color for module symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_NAMESPACE_SYMBOL_FOREGROUND = registerColor('outlineNamespaceSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineNamespaceSymbol.foreground', 'The foreground color for namespace symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_NULL_SYMBOL_FOREGROUND = registerColor('outlineNullSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineNullSymbol.foreground', 'The foreground color for null symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_NUMBER_SYMBOL_FOREGROUND = registerColor('outlineNumberSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineNumberSymbol.foreground', 'The foreground color for number symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_OBJECT_SYMBOL_FOREGROUND = registerColor('outlineObjectSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineObjectSymbol.foreground', 'The foreground color for object symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_OPERATOR_SYMBOL_FOREGROUND = registerColor('outlineOperatorSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineOperatorSymbol.foreground', 'The foreground color for operator symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_PACKAGE_SYMBOL_FOREGROUND = registerColor('outlinePackageSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlinePackageSymbol.foreground', 'The foreground color for package symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_PROPERTY_SYMBOL_FOREGROUND = registerColor('outlinePropertySymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlinePropertySymbol.foreground', 'The foreground color for property symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_STRING_SYMBOL_FOREGROUND = registerColor('outlineStringSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineStringSymbol.foreground', 'The foreground color for string symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_STRUCT_SYMBOL_FOREGROUND = registerColor('outlineStructSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineStructSymbol.foreground', 'The foreground color for struct symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_TYPEPARAMETER_SYMBOL_FOREGROUND = registerColor('outlineTypeParameterSymbol.foreground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('outlineTypeParameterSymbol.foreground', 'The foreground color for type parameter symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const OUTLINE_VARIABLE_SYMBOL_FOREGROUND = registerColor('outlineVariableSymbol.foreground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('outlineVariableSymbol.foreground', 'The foreground color for variable symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	const outlineArraySymbolColor = theme.getColor(OUTLINE_ARRAY_SYMBOL_FOREGROUND);
	if (outlineArraySymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-array:before {
				color: ${outlineArraySymbolColor};
			}
		`);
	}

	const outlineBooleanSymbolColor = theme.getColor(OUTLINE_BOOLEAN_SYMBOL_FOREGROUND);
	if (outlineBooleanSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-boolean:before {
				color: ${outlineBooleanSymbolColor};
			}
		`);
	}

	const outlineClassSymbolColor = theme.getColor(OUTLINE_CLASS_SYMBOL_FOREGROUND);
	if (outlineClassSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-class:before {
				color: ${outlineClassSymbolColor};
			}
		`);
	}

	const outlineMethodSymbolColor = theme.getColor(OUTLINE_METHOD_SYMBOL_FOREGROUND);
	if (outlineMethodSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-method:before {
				color: ${outlineMethodSymbolColor};
			}
		`);
	}

	const outlineConstantSymbolColor = theme.getColor(OUTLINE_CONSTANT_SYMBOL_FOREGROUND);
	if (outlineConstantSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-constant:before {
				color: ${outlineConstantSymbolColor};
			}
		`);
	}

	const outlineConstructorSymbolColor = theme.getColor(OUTLINE_CONSTRUCTOR_SYMBOL_FOREGROUND);
	if (outlineConstructorSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-constructor:before {
				color: ${outlineConstructorSymbolColor};
			}
		`);
	}

	const outlineEnumeratorSymbolColor = theme.getColor(OUTLINE_ENUMERATOR_SYMBOL_FOREGROUND);
	if (outlineEnumeratorSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-value:before,
			.monaco-workbench .codicon-symbol-enum:before {
				color: ${outlineEnumeratorSymbolColor};
			}
		`);
	}

	const outlineEnumeratorMemberSymbolColor = theme.getColor(OUTLINE_ENUMERATOR_MEMBER_SYMBOL_FOREGROUND);
	if (outlineEnumeratorMemberSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-enum-member:before {
				color: ${outlineEnumeratorMemberSymbolColor};
			}
		`);
	}

	const outlineEventSymbolColor = theme.getColor(OUTLINE_EVENT_SYMBOL_FOREGROUND);
	if (outlineEventSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-event:before {
				color: ${outlineEventSymbolColor};
			}
		`);
	}

	const outlineFieldSymbolColor = theme.getColor(OUTLINE_FIELD_SYMBOL_FOREGROUND);
	if (outlineFieldSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-field:before {
				color: ${outlineFieldSymbolColor};
			}
		`);
	}

	const outlineFileSymbolColor = theme.getColor(OUTLINE_FILE_SYMBOL_FOREGROUND);
	if (outlineFileSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-file:before {
				color: ${outlineFileSymbolColor};
			}
		`);
	}

	const outlineFunctionSymbolColor = theme.getColor(OUTLINE_FUNCTION_SYMBOL_FOREGROUND);
	if (outlineFunctionSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-function:before {
				color: ${outlineFunctionSymbolColor};
			}
		`);
	}

	const outlineInterfaceSymbolColor = theme.getColor(OUTLINE_INTERFACE_SYMBOL_FOREGROUND);
	if (outlineInterfaceSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-interface:before {
				color: ${outlineInterfaceSymbolColor};
			}
		`);
	}

	const outlineKeySymbolColor = theme.getColor(OUTLINE_KEY_SYMBOL_FOREGROUND);
	if (outlineKeySymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-key:before {
				color: ${outlineKeySymbolColor};
			}
		`);
	}

	const outlineModuleSymbolColor = theme.getColor(OUTLINE_MODULE_SYMBOL_FOREGROUND);
	if (outlineModuleSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-module:before {
				color: ${outlineModuleSymbolColor};
			}
		`);
	}

	const outlineNamespaceColor = theme.getColor(OUTLINE_NAMESPACE_SYMBOL_FOREGROUND);
	if (outlineNamespaceColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-namespace:before {
				color: ${outlineNamespaceColor};
			}
		`);
	}

	const outlineNullSymbolColor = theme.getColor(OUTLINE_NULL_SYMBOL_FOREGROUND);
	if (outlineNullSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-null:before {
				color: ${outlineNullSymbolColor};
			}
		`);
	}

	const outlineNumberSymbolColor = theme.getColor(OUTLINE_NUMBER_SYMBOL_FOREGROUND);
	if (outlineNumberSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-number:before {
				color: ${outlineNumberSymbolColor};
			}
		`);
	}

	const outlineObjectSymbolColor = theme.getColor(OUTLINE_OBJECT_SYMBOL_FOREGROUND);
	if (outlineObjectSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-object:before {
				color: ${outlineObjectSymbolColor};
			}
		`);
	}

	const outlineOperatorSymbolColor = theme.getColor(OUTLINE_OPERATOR_SYMBOL_FOREGROUND);
	if (outlineOperatorSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-operator:before {
				color: ${outlineOperatorSymbolColor};
			}
		`);
	}

	const outlinePackageSymbolColor = theme.getColor(OUTLINE_PACKAGE_SYMBOL_FOREGROUND);
	if (outlinePackageSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-package:before {
				color: ${outlinePackageSymbolColor};
			}
		`);
	}

	const outlinePropertySymbolColor = theme.getColor(OUTLINE_PROPERTY_SYMBOL_FOREGROUND);
	if (outlinePropertySymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-property:before {
				color: ${outlinePropertySymbolColor};
			}
		`);
	}

	const outlineStringSymbolColor = theme.getColor(OUTLINE_STRING_SYMBOL_FOREGROUND);
	if (outlineStringSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-string:before {
				color: ${outlineStringSymbolColor};
			}
		`);
	}

	const outlineStructSymbolColor = theme.getColor(OUTLINE_STRUCT_SYMBOL_FOREGROUND);
	if (outlineStructSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-struct:before {
				color: ${outlineStructSymbolColor};
			}
		`);
	}

	const outlineTypeParameterSymbolColor = theme.getColor(OUTLINE_TYPEPARAMETER_SYMBOL_FOREGROUND);
	if (outlineTypeParameterSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-type-parameter:before {
				color: ${outlineTypeParameterSymbolColor};
			}
		`);
	}

	const outlineVariableSymbolColor = theme.getColor(OUTLINE_VARIABLE_SYMBOL_FOREGROUND);
	if (outlineVariableSymbolColor) {
		collector.addRule(`
			.monaco-workbench .codicon-symbol-variable:before {
				color: ${outlineVariableSymbolColor};
			}
		`);
	}

});
