/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode, ITreeSorter } from '../../../../base/browser/ui/tree/tree.js';
import { TypeHierarchyDirection, TypeHierarchyItem, TypeHierarchyModel } from '../common/typeHierarchy.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { FuzzyScore, createMatches } from '../../../../base/common/filters.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { SymbolKinds, SymbolTag } from '../../../../editor/common/languages.js';
import { compare } from '../../../../base/common/strings.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

export class Type {
	constructor(
		readonly item: TypeHierarchyItem,
		readonly model: TypeHierarchyModel,
		readonly parent: Type | undefined
	) { }

	static compare(a: Type, b: Type): number {
		let res = compare(a.item.uri.toString(), b.item.uri.toString());
		if (res === 0) {
			res = Range.compareRangesUsingStarts(a.item.range, b.item.range);
		}
		return res;
	}
}

export class DataSource implements IAsyncDataSource<TypeHierarchyModel, Type> {

	constructor(
		public getDirection: () => TypeHierarchyDirection,
	) { }

	hasChildren(): boolean {
		return true;
	}

	async getChildren(element: TypeHierarchyModel | Type): Promise<Type[]> {
		if (element instanceof TypeHierarchyModel) {
			return element.roots.map(root => new Type(root, element, undefined));
		}

		const { model, item } = element;

		if (this.getDirection() === TypeHierarchyDirection.Supertypes) {
			return (await model.provideSupertypes(item, CancellationToken.None)).map(item => {
				return new Type(
					item,
					model,
					element
				);
			});
		} else {
			return (await model.provideSubtypes(item, CancellationToken.None)).map(item => {
				return new Type(
					item,
					model,
					element
				);
			});
		}
	}
}

export class Sorter implements ITreeSorter<Type> {

	compare(element: Type, otherElement: Type): number {
		return Type.compare(element, otherElement);
	}
}

export class IdentityProvider implements IIdentityProvider<Type> {

	constructor(
		public getDirection: () => TypeHierarchyDirection
	) { }

	getId(element: Type): { toString(): string } {
		let res = this.getDirection() + JSON.stringify(element.item.uri) + JSON.stringify(element.item.range);
		if (element.parent) {
			res += this.getId(element.parent);
		}
		return res;
	}
}

class TypeRenderingTemplate {
	constructor(
		readonly icon: HTMLDivElement,
		readonly label: IconLabel
	) { }
}

export class TypeRenderer implements ITreeRenderer<Type, FuzzyScore, TypeRenderingTemplate> {

	static readonly id = 'TypeRenderer';

	templateId: string = TypeRenderer.id;

	renderTemplate(container: HTMLElement): TypeRenderingTemplate {
		container.classList.add('typehierarchy-element');
		const icon = document.createElement('div');
		container.appendChild(icon);
		const label = new IconLabel(container, { supportHighlights: true });
		return new TypeRenderingTemplate(icon, label);
	}

	renderElement(node: ITreeNode<Type, FuzzyScore>, _index: number, template: TypeRenderingTemplate): void {
		const { element, filterData } = node;
		const deprecated = element.item.tags?.includes(SymbolTag.Deprecated);
		template.icon.classList.add('inline', ...ThemeIcon.asClassNameArray(SymbolKinds.toIcon(element.item.kind)));
		template.label.setLabel(
			element.item.name,
			element.item.detail,
			{ labelEscapeNewLines: true, matches: createMatches(filterData), strikethrough: deprecated }
		);
	}
	disposeTemplate(template: TypeRenderingTemplate): void {
		template.label.dispose();
	}
}

export class VirtualDelegate implements IListVirtualDelegate<Type> {

	getHeight(_element: Type): number {
		return 22;
	}

	getTemplateId(_element: Type): string {
		return TypeRenderer.id;
	}
}

export class AccessibilityProvider implements IListAccessibilityProvider<Type> {

	constructor(
		public getDirection: () => TypeHierarchyDirection
	) { }

	getWidgetAriaLabel(): string {
		return localize('tree.aria', "Type Hierarchy");
	}

	getAriaLabel(element: Type): string | null {
		if (this.getDirection() === TypeHierarchyDirection.Supertypes) {
			return localize('supertypes', "supertypes of {0}", element.item.name);
		} else {
			return localize('subtypes', "subtypes of {0}", element.item.name);
		}
	}
}
