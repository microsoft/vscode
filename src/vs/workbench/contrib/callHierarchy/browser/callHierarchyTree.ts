/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode, ITreeSorter } from '../../../../base/browser/ui/tree/tree.js';
import { CallHierarchyItem, CallHierarchyDirection, CallHierarchyModel, } from '../common/callHierarchy.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { FuzzyScore, createMatches } from '../../../../base/common/filters.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { SymbolKinds, Location, SymbolTag } from '../../../../editor/common/languages.js';
import { compare } from '../../../../base/common/strings.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { localize } from '../../../../nls.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

export class Call {
	constructor(
		readonly item: CallHierarchyItem,
		readonly locations: Location[] | undefined,
		readonly model: CallHierarchyModel,
		readonly parent: Call | undefined
	) { }

	static compare(a: Call, b: Call): number {
		let res = compare(a.item.uri.toString(), b.item.uri.toString());
		if (res === 0) {
			res = Range.compareRangesUsingStarts(a.item.range, b.item.range);
		}
		return res;
	}
}

export class DataSource implements IAsyncDataSource<CallHierarchyModel, Call> {

	constructor(
		public getDirection: () => CallHierarchyDirection,
	) { }

	hasChildren(): boolean {
		return true;
	}

	async getChildren(element: CallHierarchyModel | Call): Promise<Call[]> {
		if (element instanceof CallHierarchyModel) {
			return element.roots.map(root => new Call(root, undefined, element, undefined));
		}

		const { model, item } = element;

		if (this.getDirection() === CallHierarchyDirection.CallsFrom) {
			return (await model.resolveOutgoingCalls(item, CancellationToken.None)).map(call => {
				return new Call(
					call.to,
					call.fromRanges.map(range => ({ range, uri: item.uri })),
					model,
					element
				);
			});

		} else {
			return (await model.resolveIncomingCalls(item, CancellationToken.None)).map(call => {
				return new Call(
					call.from,
					call.fromRanges.map(range => ({ range, uri: call.from.uri })),
					model,
					element
				);
			});
		}
	}
}

export class Sorter implements ITreeSorter<Call> {

	compare(element: Call, otherElement: Call): number {
		return Call.compare(element, otherElement);
	}
}

export class IdentityProvider implements IIdentityProvider<Call> {

	constructor(
		public getDirection: () => CallHierarchyDirection
	) { }

	getId(element: Call): { toString(): string } {
		let res = this.getDirection() + JSON.stringify(element.item.uri) + JSON.stringify(element.item.range);
		if (element.parent) {
			res += this.getId(element.parent);
		}
		return res;
	}
}

class CallRenderingTemplate {
	constructor(
		readonly icon: HTMLDivElement,
		readonly label: IconLabel
	) { }
}

export class CallRenderer implements ITreeRenderer<Call, FuzzyScore, CallRenderingTemplate> {

	static readonly id = 'CallRenderer';

	templateId: string = CallRenderer.id;

	renderTemplate(container: HTMLElement): CallRenderingTemplate {
		container.classList.add('callhierarchy-element');
		const icon = document.createElement('div');
		container.appendChild(icon);
		const label = new IconLabel(container, { supportHighlights: true });
		return new CallRenderingTemplate(icon, label);
	}

	renderElement(node: ITreeNode<Call, FuzzyScore>, _index: number, template: CallRenderingTemplate): void {
		const { element, filterData } = node;
		const deprecated = element.item.tags?.includes(SymbolTag.Deprecated);
		template.icon.className = '';
		template.icon.classList.add('inline', ...ThemeIcon.asClassNameArray(SymbolKinds.toIcon(element.item.kind)));
		template.label.setLabel(
			element.item.name,
			element.item.detail,
			{ labelEscapeNewLines: true, matches: createMatches(filterData), strikethrough: deprecated }
		);
	}
	disposeTemplate(template: CallRenderingTemplate): void {
		template.label.dispose();
	}
}

export class VirtualDelegate implements IListVirtualDelegate<Call> {

	getHeight(_element: Call): number {
		return 22;
	}

	getTemplateId(_element: Call): string {
		return CallRenderer.id;
	}
}

export class AccessibilityProvider implements IListAccessibilityProvider<Call> {

	constructor(
		public getDirection: () => CallHierarchyDirection
	) { }

	getWidgetAriaLabel(): string {
		return localize('tree.aria', "Call Hierarchy");
	}

	getAriaLabel(element: Call): string | null {
		if (this.getDirection() === CallHierarchyDirection.CallsFrom) {
			return localize('from', "calls from {0}", element.item.name);
		} else {
			return localize('to', "callers of {0}", element.item.name);
		}
	}
}
