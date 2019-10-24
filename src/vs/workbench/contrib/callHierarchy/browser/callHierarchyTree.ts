/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { CallHierarchyItem, CallHierarchyDirection, CallHierarchyModel, } from 'vs/workbench/contrib/callHierarchy/browser/callHierarchy';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { SymbolKinds, Location } from 'vs/editor/common/modes';
import * as dom from 'vs/base/browser/dom';

export class Call {
	constructor(
		readonly item: CallHierarchyItem,
		readonly locations: Location[],
		readonly model: CallHierarchyModel
	) { }
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
			return [new Call(element.root, [], element)];
		}

		const results: Call[] = [];
		if (this.getDirection() === CallHierarchyDirection.CallsFrom) {
			await this._getOutgoingCalls(element.model, element.item, results);
		} else {
			await this._getIncomingCalls(element.model, element.item, results);
		}
		return results;
	}

	private async _getOutgoingCalls(model: CallHierarchyModel, item: CallHierarchyItem, bucket: Call[]): Promise<void> {

		const outgoingCalls = await model.resolveOutgoingCalls(item, CancellationToken.None);
		for (const call of outgoingCalls) {
			bucket.push(new Call(
				call.to,
				call.fromRanges.map(range => ({ range, uri: item.uri })),
				model
			));
		}
	}

	private async _getIncomingCalls(model: CallHierarchyModel, item: CallHierarchyItem, bucket: Call[]): Promise<void> {
		const incomingCalls = await model.resolveIncomingCalls(item, CancellationToken.None);
		for (const call of incomingCalls) {
			bucket.push(new Call(
				call.from,
				call.fromRanges.map(range => ({ range, uri: call.from.uri })),
				model
			));
		}
	}

}


export class IdentityProvider implements IIdentityProvider<Call> {

	constructor(
		public getDirection: () => CallHierarchyDirection
	) { }

	getId(element: Call): { toString(): string; } {
		return this.getDirection() + '->' + element.item.id;
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
		dom.addClass(container, 'callhierarchy-element');
		let icon = document.createElement('div');
		container.appendChild(icon);
		const label = new IconLabel(container, { supportHighlights: true });
		return new CallRenderingTemplate(icon, label);
	}

	renderElement(node: ITreeNode<Call, FuzzyScore>, _index: number, template: CallRenderingTemplate): void {
		const { element, filterData } = node;
		template.icon.className = SymbolKinds.toCssClassName(element.item.kind, true);
		template.label.setLabel(
			element.item.name,
			element.item.detail,
			{ labelEscapeNewLines: true, matches: createMatches(filterData) }
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
