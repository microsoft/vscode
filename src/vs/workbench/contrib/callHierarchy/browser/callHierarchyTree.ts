/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { CallHierarchyItem, CallHierarchyProvider, CallHierarchyDirection } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { symbolKindToCssClass, Location } from 'vs/editor/common/modes';
import { hash } from 'vs/base/common/hash';
import { onUnexpectedExternalError } from 'vs/base/common/errors';

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
			const results: Call[] = [];
			if (this.getDirection() === CallHierarchyDirection.CallsFrom) {
				await this._getCallsFrom(element, results);
			} else {
				await this._getCallsTo(element, results);
			}
			return results;
		} else {
			// 'root'
			return [new Call(element, [], undefined)];
		}
	}

	private async _getCallsFrom(source: Call, bucket: Call[]): Promise<void> {
		try {
			const callsFrom = await this.provider.provideOutgoingCalls(source.item, CancellationToken.None);
			if (!callsFrom) {
				return;
			}
			for (const callFrom of callsFrom) {
				bucket.push(new Call(
					callFrom.target,
					callFrom.sourceRanges.map(range => ({ range, uri: source.item.uri })),
					source
				));
			}
		} catch (e) {
			onUnexpectedExternalError(e);
		}
	}

	private async _getCallsTo(target: Call, bucket: Call[]): Promise<void> {
		try {
			const callsTo = await this.provider.provideIncomingCalls(target.item, CancellationToken.None);
			if (!callsTo) {
				return;
			}
			for (const callTo of callsTo) {
				bucket.push(new Call(
					callTo.source,
					callTo.sourceRanges.map(range => ({ range, uri: callTo.source.uri })),
					target
				));
			}
		} catch (e) {
			onUnexpectedExternalError(e);
		}
	}

}

export class IdentityProvider implements IIdentityProvider<Call> {

	constructor(
		public getDirection: () => CallHierarchyDirection
	) { }

	getId(element: Call): { toString(): string; } {
		return this.getDirection() + hash(element.item.uri.toString(), hash(JSON.stringify(element.item.range))).toString() + (element.parent ? this.getId(element.parent) : '');
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
