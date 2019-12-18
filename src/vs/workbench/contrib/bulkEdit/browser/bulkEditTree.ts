/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import * as modes from 'vs/editor/common/modes';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IResourceLabel, ResourceLabels, DEFAULT_LABELS_CONTAINER } from 'vs/workbench/browser/labels';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { HighlightedLabel, IHighlight } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Range } from 'vs/editor/common/core/range';
import * as dom from 'vs/base/browser/dom';

// --- VIEW MODEL

export class FileElement {

	constructor(readonly edit: modes.ResourceFileEdit | modes.ResourceTextEdit) { }

	getUri(): URI {
		return modes.isResourceTextEdit(this.edit)
			? this.edit.resource
			: this.edit.oldUri || this.edit.newUri!;
	}
}

export class TextEditElement {
	constructor(readonly edit: modes.TextEdit, readonly prefix: string, readonly selecting: string, readonly inserting: string, readonly suffix: string) { }
}

export type Edit = FileElement | TextEditElement;

// --- DATA SOURCE

export class BulkEditDataSource implements IAsyncDataSource<modes.WorkspaceEdit, Edit> {

	constructor(@ITextModelService private readonly _textModelService: ITextModelService) { }

	hasChildren(element: modes.WorkspaceEdit | Edit): boolean {
		if (element instanceof FileElement) {
			return modes.isResourceTextEdit(element.edit);
		}
		if (element instanceof TextEditElement) {
			return false;
		}
		return true;
	}

	async getChildren(element: modes.WorkspaceEdit | Edit): Promise<Edit[]> {

		// root -> file/text edits
		if (Array.isArray((<modes.WorkspaceEdit>element).edits)) {
			return (<modes.WorkspaceEdit>element).edits.map(edit => new FileElement(edit));
		}

		// file: text edit
		if (element instanceof FileElement && modes.isResourceTextEdit(element.edit)) {
			const ref = await this._textModelService.createModelReference(element.edit.resource);
			const textModel = ref.object.textEditorModel;

			const result = element.edit.edits.map(edit => {
				const range = Range.lift(edit.range);

				const tokens = textModel.getLineTokens(range.endLineNumber);
				let suffixLen = 0;
				for (let idx = tokens.findTokenIndexAtOffset(range.endColumn); suffixLen < 50 && idx < tokens.getCount(); idx++) {
					suffixLen += tokens.getEndOffset(idx) - tokens.getStartOffset(idx);
				}

				return new TextEditElement(
					edit,
					textModel.getValueInRange(new Range(range.startLineNumber, 1, range.startLineNumber, range.startColumn)), // line start to edit start,
					textModel.getValueInRange(range),
					edit.text,
					textModel.getValueInRange(new Range(range.endLineNumber, range.endColumn, range.endLineNumber, range.endColumn + suffixLen))
				);
			});

			return result;
		}

		return [];
	}
}

// --- IDENT

export class BulkEditIdentityProvider implements IIdentityProvider<Edit> {

	private readonly _map = new WeakMap<Edit, number>();
	private _idPool = 0;

	getId(element: Edit): { toString(): string; } {
		let id = this._map.get(element);
		if (typeof id === 'undefined') {
			id = this._idPool++;
			this._map.set(element, id);
		}
		return id;
	}
}

// --- RENDERER

class FileElementTemplate {
	constructor(readonly label: IResourceLabel) { }
}

export class FileElementRenderer implements ITreeRenderer<FileElement, FuzzyScore, FileElementTemplate> {

	static readonly id: string = 'FileElementRenderer';

	readonly templateId: string = FileElementRenderer.id;

	private readonly _resourceLabel: ResourceLabels;

	constructor(@IInstantiationService instaService: IInstantiationService) {
		this._resourceLabel = instaService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER);
	}

	renderTemplate(container: HTMLElement): FileElementTemplate {
		return new FileElementTemplate(this._resourceLabel.create(container, { supportHighlights: true }));
	}

	renderElement(node: ITreeNode<FileElement, FuzzyScore>, _index: number, template: FileElementTemplate): void {
		template.label.setFile(node.element.getUri(), { matches: createMatches(node.filterData) });
	}

	disposeTemplate(template: FileElementTemplate): void {
		template.label.dispose();
	}
}

class TextEditElementTemplate {
	constructor(readonly label: HighlightedLabel) { }
}

export class TextEditElementRenderer implements ITreeRenderer<TextEditElement, FuzzyScore, TextEditElementTemplate> {

	static readonly id = 'TextEditElementRenderer';

	readonly templateId: string = TextEditElementRenderer.id;

	renderTemplate(container: HTMLElement): TextEditElementTemplate {
		const label = new HighlightedLabel(container, false);
		dom.addClass(label.element, 'textedit');
		return new TextEditElementTemplate(label);
	}

	renderElement({ element }: ITreeNode<TextEditElement, FuzzyScore>, _index: number, template: TextEditElementTemplate): void {

		let value = '';
		value += element.prefix;
		value += element.selecting;
		value += element.inserting;
		value += element.suffix;

		let selectHighlight: IHighlight = { start: element.prefix.length, end: element.prefix.length + element.selecting.length, extraClasses: 'remove' };
		let insertHighlight: IHighlight = { start: selectHighlight.end, end: selectHighlight.end + element.inserting.length, extraClasses: 'insert' };

		template.label.set(value, [selectHighlight, insertHighlight], undefined, true);
	}

	disposeTemplate(_template: TextEditElementTemplate): void { }
}

export class BulkEditDelegate implements IListVirtualDelegate<Edit> {

	getHeight(): number {
		return 23;
	}

	getTemplateId(element: Edit): string {
		return element instanceof FileElement
			? FileElementRenderer.id
			: TextEditElementRenderer.id;
	}
}
