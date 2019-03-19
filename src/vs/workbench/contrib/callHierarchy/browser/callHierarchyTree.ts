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
import { ILabelService } from 'vs/platform/label/common/label';

export class Call {
	constructor(
		readonly direction: CallHierarchyDirection,
		readonly item: CallHierarchyItem,
		readonly locations: Location[]
	) { }
}

export class SingleDirectionDataSource implements IAsyncDataSource<CallHierarchyItem, Call> {

	constructor(
		public provider: CallHierarchyProvider,
		public direction: () => CallHierarchyDirection
	) { }

	hasChildren(_element: CallHierarchyItem): boolean {
		return true;
	}

	async getChildren(element: CallHierarchyItem | Call): Promise<Call[]> {
		if (element instanceof Call) {
			element = element.item;
		}
		const direction = this.direction();
		const calls = await this.provider.resolveCallHierarchyItem(element, direction, CancellationToken.None);
		return calls
			? calls.map(([item, locations]) => new Call(direction, item, locations))
			: [];
	}
}

export class IdentityProvider implements IIdentityProvider<Call> {
	getId(element: Call): { toString(): string; } {
		return element.item._id;
	}
}

class CallRenderingTemplate {
	iconLabel: IconLabel;
}

export class CallRenderer implements ITreeRenderer<Call, FuzzyScore, CallRenderingTemplate> {

	static id = 'CallRenderer';

	templateId: string = CallRenderer.id;

	constructor(@ILabelService private readonly _labelService: ILabelService) { }

	renderTemplate(container: HTMLElement): CallRenderingTemplate {
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		return { iconLabel };
	}
	renderElement(node: ITreeNode<Call, FuzzyScore>, _index: number, template: CallRenderingTemplate): void {
		const { element, filterData } = node;
		const detail = element.item.detail || this._labelService.getUriLabel(element.item.uri, { relative: true });

		template.iconLabel.setLabel(
			element.item.name,
			detail,
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
