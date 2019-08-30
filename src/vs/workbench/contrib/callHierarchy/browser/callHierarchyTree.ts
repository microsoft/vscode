/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { CallHierarchyItem, CallHierarchyDirection, CallHierarchyProvider, CallHierarchySymbol } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { symbolKindToCssClass } from 'vs/editor/common/modes';
import { hash } from 'vs/base/common/hash';

export class Call {
	constructor(
		readonly source: CallHierarchySymbol,
		readonly targets: CallHierarchySymbol[],
		readonly parent: Call | undefined
	) { }
}

export class SingleDirectionDataSource implements IAsyncDataSource<CallHierarchyItem[], Call> {

	constructor(
		public provider: CallHierarchyProvider,
		public getDirection: () => CallHierarchyDirection
	) { }

	hasChildren(): boolean {
		return true;
	}

	async getChildren(callOrItems: CallHierarchyItem[] | Call): Promise<Call[]> {

		if (Array.isArray(callOrItems)) {
			// 'root'
			return callOrItems.map(item => new Call(item.source, item.targets, undefined));

		}

		const direction = this.getDirection();
		const result: Call[] = [];
		await Promise.all(callOrItems.targets.map(async item => {
			const items = await this.provider.provideCallHierarchyItems(
				item.uri,
				{ lineNumber: item.selectionRange.startLineNumber, column: item.selectionRange.startColumn },
				direction,
				CancellationToken.None
			);

			if (items) {
				for (const item of items) {
					result.push(new Call(item.source, item.targets, callOrItems));
				}
			}
		}));

		return result;
	}
}

export class IdentityProvider implements IIdentityProvider<Call> {
	getId(element: Call): { toString(): string; } {
		return hash(element.source.uri.toString(), hash(JSON.stringify(element.source.range))).toString() + (element.parent ? this.getId(element.parent) : '');
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
			element.source.name,
			element.source.detail,
			{
				labelEscapeNewLines: true,
				matches: createMatches(filterData),
				extraClasses: [symbolKindToCssClass(element.source.kind, true)]
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
