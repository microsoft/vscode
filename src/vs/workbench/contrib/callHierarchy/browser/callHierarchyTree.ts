/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { CallHierarchyItem, CallHierarchyProvider, CallHierarchyDirection, provideOutgoingCalls, provideIncomingCalls } from 'vs/workbench/contrib/callHierarchy/browser/callHierarchy';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { symbolKindToCssClass, Location } from 'vs/editor/common/modes';
import { hash } from 'vs/base/common/hash';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { IPosition } from 'vs/editor/common/core/position';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';

export class Call {
	constructor(
		readonly item: CallHierarchyItem,
		readonly locations: Location[],
		readonly parent: Call | undefined
	) { }
}

export class CallHierarchyRoot {

	static fromEditor(editor: IActiveCodeEditor): CallHierarchyRoot | undefined {
		const model = editor.getModel();
		const position = editor.getPosition();
		const wordInfo = model.getWordAtPosition(position);
		return wordInfo
			? new CallHierarchyRoot(model, position, wordInfo.word)
			: undefined;
	}

	constructor(
		readonly model: ITextModel,
		readonly position: IPosition,
		readonly word: string
	) { }
}

export class DataSource implements IAsyncDataSource<CallHierarchyRoot, Call> {

	constructor(
		public provider: CallHierarchyProvider,
		public getDirection: () => CallHierarchyDirection,
		@ITextModelService private readonly _modelService: ITextModelService,
	) { }

	hasChildren(): boolean {
		return true;
	}

	async getChildren(element: CallHierarchyRoot | Call): Promise<Call[]> {

		const results: Call[] = [];

		if (element instanceof CallHierarchyRoot) {
			if (this.getDirection() === CallHierarchyDirection.CallsFrom) {
				await this._getOutgoingCalls(element.model, element.position, results);
			} else {
				await this._getIncomingCalls(element.model, element.position, results);
			}
		} else {
			const reference = await this._modelService.createModelReference(element.item.uri);
			const position = Range.lift(element.item.selectionRange).getStartPosition();
			if (this.getDirection() === CallHierarchyDirection.CallsFrom) {
				await this._getOutgoingCalls(reference.object.textEditorModel, position, results, element);
			} else {
				await this._getIncomingCalls(reference.object.textEditorModel, position, results, element);
			}
			reference.dispose();
		}

		return results;
	}

	private async _getOutgoingCalls(model: ITextModel, position: IPosition, bucket: Call[], parent?: Call): Promise<void> {
		const outgoingCalls = await provideOutgoingCalls(model, position, CancellationToken.None);
		for (const call of outgoingCalls) {
			bucket.push(new Call(
				call.target,
				call.sourceRanges.map(range => ({ range, uri: model.uri })),
				parent
			));
		}
	}

	private async _getIncomingCalls(model: ITextModel, position: IPosition, bucket: Call[], parent?: Call): Promise<void> {
		const incomingCalls = await provideIncomingCalls(model, position, CancellationToken.None);
		for (const call of incomingCalls) {
			bucket.push(new Call(
				call.source,
				call.sourceRanges.map(range => ({ range, uri: call.source.uri })),
				parent
			));
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
