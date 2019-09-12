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
				await this._getCallsFrom(element.model, element.position, results);
			} else {
				await this._getCallsTo(element.model, element.position, results);
			}
		} else {
			const reference = await this._modelService.createModelReference(element.item.uri);
			const position = Range.lift(element.item.selectionRange).getStartPosition();
			if (this.getDirection() === CallHierarchyDirection.CallsFrom) {
				await this._getCallsFrom(reference.object.textEditorModel, position, results, element);
			} else {
				await this._getCallsTo(reference.object.textEditorModel, position, results, element);
			}
			reference.dispose();
		}

		return results;
	}

	private async _getCallsFrom(model: ITextModel, position: IPosition, bucket: Call[], parent?: Call): Promise<void> {
		try {
			const callsFrom = await this.provider.provideOutgoingCalls(model, position, CancellationToken.None);
			if (!callsFrom) {
				return;
			}
			for (const callFrom of callsFrom) {
				bucket.push(new Call(
					callFrom.target,
					callFrom.sourceRanges.map(range => ({ range, uri: model.uri })),
					parent
				));
			}
		} catch (e) {
			onUnexpectedExternalError(e);
		}
	}

	private async _getCallsTo(model: ITextModel, position: IPosition, bucket: Call[], parent?: Call): Promise<void> {
		try {
			const callsTo = await this.provider.provideIncomingCalls(model, position, CancellationToken.None);
			if (!callsTo) {
				return;
			}
			for (const callTo of callsTo) {
				bucket.push(new Call(
					callTo.source,
					callTo.sourceRanges.map(range => ({ range, uri: callTo.source.uri })),
					parent
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
