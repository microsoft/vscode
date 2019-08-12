/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { CallHierarchyItem, CallHierarchyDirection, CallHierarchyProvider } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { symbolKindToCssClass, Location } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';
import { hash } from 'vs/base/common/hash';

export class Call {
	constructor(
		readonly item: CallHierarchyItem,
		readonly locations: Location[],
		readonly parent: Call | undefined
	) { }
}

export class SingleDirectionDataSource implements IAsyncDataSource<CallHierarchyItem, Call> {

	constructor(
		public provider: CallHierarchyProvider,
		public getDirection: () => CallHierarchyDirection
	) { }

	hasChildren(): boolean {
		return true;
	}

	async getChildren(element: CallHierarchyItem | Call): Promise<Call[]> {
		if (element instanceof Call) {
			try {
				const direction = this.getDirection();
				const calls = await this.provider.resolveCallHierarchyItem(element.item, direction, CancellationToken.None);
				if (!calls) {
					return [];
				}
				return calls.map(([item, locations]) => new Call(item, locations, element));
			} catch {
				return [];
			}
		} else {
			// 'root'
			return [new Call(element, [{ uri: element.uri, range: Range.lift(element.range).collapseToStart() }], undefined)];
		}
	}
}

export class IdentityProvider implements IIdentityProvider<Call> {
	getId(element: Call): { toString(): string; } {
		return hash(element.item.uri.toString(), hash(JSON.stringify(element.item.range))).toString() + (element.parent ? this.getId(element.parent) : '');
	}
}

class CallRenderingTemplate {
	constructor(
		readonly iconLabel: IconLabel
	) { }
}

export class CallRenderer implements ITreeRenderer<Call, FuzzyScore, CallRenderingTemplate> {

	static id = 'CallRenderer';

	templateId: string = CallRenderer.id;

	renderTemplate(container: HTMLElement): CallRenderingTemplate {
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		return new CallRenderingTemplate(iconLabel);
	}

	renderElement(node: ITreeNode<Call, FuzzyScore>, _index: number, template: CallRenderingTemplate): void {
		const { element, filterData } = node;

		template.iconLabel.setLabel(
			element.item.name,
			element.item.detail,
			{
				labelEscapeNewLines: true,
				matches: createMatches(filterData),
				extraClasses: [symbolKindToCssClass(element.item.kind, true)]
			}
		);
	}
	disposeTemplate(template: CallRenderingTemplate): void {
		template.iconLabel.dispose();
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
