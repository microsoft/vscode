/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { CallHierarchyCall, CallHierarchyDirection, CallHierarchyProvider, CallHierarchySymbol } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { symbolKindToCssClass } from 'vs/editor/common/modes';
import { hash } from 'vs/base/common/hash';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { groupBy } from 'vs/base/common/arrays';
import { compare } from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';

export class Call {

	static create(calls: CallHierarchyCall[], direction: CallHierarchyDirection): Call[] {

		for (const call of calls) {
			console.log(`FROM ${call.source.name} TO ${call.target.name} (at ${call.sourceRange.startLineNumber},${call.sourceRange.startColumn})`);
		}
		console.log('rooted: ' + (direction === CallHierarchyDirection.CallsFrom ? 'FROM' : 'TO'));

		if (direction === CallHierarchyDirection.CallsFrom) {
			const groups = groupBy(calls, (a, b) => Call.compareSymbol(a.source, b.source));
			return groups.map(group => {
				const targets = groupBy(group.map(call => call.target), Call.compareSymbol);
				return new Call(group[0].source, [], targets.map(t => new Call(t[0], [], undefined)));
			});

		} else {
			const groups = groupBy(calls, (a, b) => Call.compareSymbol(a.target, b.target));
			return groups.map(group => {
				const targets = groupBy(group.map(call => call.source), Call.compareSymbol);
				return new Call(group[0].target, [], targets.map(t => new Call(t[0], [], undefined)));
			});
		}
	}

	static compareSymbol(a: CallHierarchySymbol, b: CallHierarchySymbol): number {
		let res = compare(a.uri.toString(), b.uri.toString());
		if (res === 0) {
			res = Range.compareRangesUsingStarts(a.range, b.range);
		}
		return res;
	}


	constructor(
		readonly source: CallHierarchySymbol,
		readonly ranges: Range[],
		readonly children: Call[] | undefined,
	) { }
}

export class SingleDirectionDataSource implements IAsyncDataSource<Call[], Call> {

	constructor(
		public provider: CallHierarchyProvider,
		public getDirection: () => CallHierarchyDirection,
		@ITextModelService private readonly _textModelService: ITextModelService,
	) { }

	hasChildren(): boolean {
		return true;
	}

	async getChildren(parent: Call[] | Call): Promise<Call[]> {

		// root
		if (Array.isArray(parent)) {
			return parent;
		}

		// root'ish
		if (parent.children) {
			return parent.children;
		}

		// drill down
		const reference = await this._textModelService.createModelReference(parent.source.uri);
		const direction = this.getDirection();

		const calls = await this.provider.provideCallHierarchyItems(
			reference.object.textEditorModel,
			Range.lift(parent.source.range).getStartPosition(),
			direction,
			CancellationToken.None
		);

		if (!calls) {
			return [];
		}

		const targets: CallHierarchySymbol[] = [];
		for (const call of calls) {
			if ((direction === CallHierarchyDirection.CallsFrom ? call.source : call.target).id === parent.source.id) {
				targets.push(direction === CallHierarchyDirection.CallsFrom ? call.target : call.source);
			} else {
				console.warn('DROPPING', call);
			}
		}

		return groupBy(targets, (a, b) => compare(a.id, b.id)).map(group => new Call(group[0], [], undefined));
	}
}

export class IdentityProvider implements IIdentityProvider<Call> {
	getId(element: Call): { toString(): string; } {
		return hash(element.source.uri.toString(), hash(JSON.stringify(element.source.range))).toString();
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
