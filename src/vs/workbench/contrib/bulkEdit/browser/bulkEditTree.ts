/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { URI } from 'vs/base/common/uri';
import { HighlightedLabel, IHighlight } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Range } from 'vs/editor/common/core/range';
import * as dom from 'vs/base/browser/dom';
import { ITextModel } from 'vs/editor/common/model';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { TextModel } from 'vs/editor/common/model/textModel';
import { BulkFileOperations, BulkFileOperation, BulkFileOperationType, BulkTextEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditPreview';
import { FileKind } from 'vs/platform/files/common/files';
import { localize } from 'vs/nls';
import { ILabelService } from 'vs/platform/label/common/label';
import type { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';

// --- VIEW MODEL

export class FileElement {

	readonly uri: URI;

	constructor(readonly edit: BulkFileOperation) {
		this.uri = edit.uri;
	}
}

export class TextEditElement {

	constructor(
		readonly parent: FileElement,
		readonly edit: BulkTextEdit,
		readonly prefix: string, readonly selecting: string, readonly inserting: string, readonly suffix: string
	) { }
}

export type BulkEditElement = FileElement | TextEditElement;

// --- DATA SOURCE

export class BulkEditDataSource implements IAsyncDataSource<BulkFileOperations, BulkEditElement> {

	constructor(@ITextModelService private readonly _textModelService: ITextModelService) { }

	hasChildren(element: BulkFileOperations | BulkEditElement): boolean {
		if (element instanceof FileElement) {
			return element.edit.textEdits.length > 0;
		}
		if (element instanceof TextEditElement) {
			return false;
		}
		return true;
	}

	async getChildren(element: BulkFileOperations | BulkEditElement): Promise<BulkEditElement[]> {

		// root -> file/text edits
		if (element instanceof BulkFileOperations) {
			return element.fileOperations.map(op => new FileElement(op));
		}

		// file: text edit
		if (element instanceof FileElement && element.edit.textEdits.length > 0) {
			// const previewUri = BulkEditPreviewProvider.asPreviewUri(element.edit.resource);
			let textModel: ITextModel;
			let textModelDisposable: IDisposable;
			try {
				const ref = await this._textModelService.createModelReference(element.edit.uri);
				textModel = ref.object.textEditorModel;
				textModelDisposable = ref;
			} catch {
				textModel = TextModel.createFromString('');
				textModelDisposable = textModel;
			}

			const result = element.edit.textEdits.map(edit => {
				const range = Range.lift(edit.edit.range);

				const tokens = textModel.getLineTokens(range.endLineNumber);
				let suffixLen = 0;
				for (let idx = tokens.findTokenIndexAtOffset(range.endColumn); suffixLen < 50 && idx < tokens.getCount(); idx++) {
					suffixLen += tokens.getEndOffset(idx) - tokens.getStartOffset(idx);
				}

				return new TextEditElement(
					element,
					edit,
					textModel.getValueInRange(new Range(range.startLineNumber, 1, range.startLineNumber, range.startColumn)), // line start to edit start,
					textModel.getValueInRange(range),
					edit.edit.text,
					textModel.getValueInRange(new Range(range.endLineNumber, range.endColumn, range.endLineNumber, range.endColumn + suffixLen))
				);
			});

			textModelDisposable.dispose();
			return result;
		}

		return [];
	}
}

// --- ACCESSI

export class BulkEditAccessibilityProvider implements IAccessibilityProvider<BulkEditElement> {

	constructor(@ILabelService private readonly _labelService: ILabelService) { }

	getAriaLabel(element: BulkEditElement): string | null {
		if (element instanceof FileElement) {
			if (element.edit.textEdits.length > 0) {
				if (element.edit.type & BulkFileOperationType.Rename && element.edit.newUri) {
					return localize(
						'area.renameAndEdit', "Renaming {0} to {1}, also making text edits",
						this._labelService.getUriLabel(element.edit.uri, { relative: true }), this._labelService.getUriLabel(element.edit.newUri, { relative: true })
					);

				} else if (element.edit.type & BulkFileOperationType.Create) {
					return localize(
						'area.createAndEdit', "Creating {0}, also making text edits",
						this._labelService.getUriLabel(element.edit.uri, { relative: true })
					);

				} else if (element.edit.type & BulkFileOperationType.Delete) {
					return localize(
						'area.deleteAndEdit', "Deleting {0}, also making text edits",
						this._labelService.getUriLabel(element.edit.uri, { relative: true }),
					);
				}
			} else {
				if (element.edit.type & BulkFileOperationType.Rename && element.edit.newUri) {
					return localize(
						'area.rename', "Renaming {0} to {1}",
						this._labelService.getUriLabel(element.edit.uri, { relative: true }), this._labelService.getUriLabel(element.edit.newUri, { relative: true })
					);

				} else if (element.edit.type & BulkFileOperationType.Create) {
					return localize(
						'area.create', "Creating {0}",
						this._labelService.getUriLabel(element.edit.uri, { relative: true })
					);

				} else if (element.edit.type & BulkFileOperationType.Delete) {
					return localize(
						'area.delete', "Deleting {0}",
						this._labelService.getUriLabel(element.edit.uri, { relative: true }),
					);
				}
			}
		}

		if (element instanceof TextEditElement) {
			if (element.selecting.length > 0 && element.inserting.length > 0) {
				// edit: replace
				return localize('aria.replace', "line {0}, replacing {1} with {0}", element.edit.edit.range.startLineNumber, element.selecting, element.inserting);
			} else if (element.selecting.length > 0 && element.inserting.length === 0) {
				// edit: delete
				return localize('aria.del', "line {0}, removing {1}", element.edit.edit.range.startLineNumber, element.selecting);
			} else if (element.selecting.length === 0 && element.inserting.length > 0) {
				// edit: insert
				return localize('aria.insert', "line {0}, inserting {1}", element.edit.edit.range.startLineNumber, element.selecting);
			}
		}

		return null;
	}
}

// --- IDENT

export class BulkEditIdentityProvider implements IIdentityProvider<BulkEditElement> {

	getId(element: BulkEditElement): { toString(): string; } {
		if (element instanceof FileElement) {
			return element.uri;
		} else {
			return element.parent.uri.toString() + JSON.stringify(element.edit.edit);
		}
	}
}

// --- RENDERER

class FileElementTemplate {

	private readonly _disposables = new DisposableStore();
	private readonly _localDisposables = new DisposableStore();

	private readonly _checkbox: HTMLInputElement;
	private readonly _label: IResourceLabel;
	private readonly _details: HTMLSpanElement;

	constructor(
		container: HTMLElement,
		resourceLabels: ResourceLabels,
		@ILabelService private readonly _labelService: ILabelService,
	) {

		this._checkbox = document.createElement('input');
		this._checkbox.className = 'edit-checkbox';
		this._checkbox.type = 'checkbox';
		this._checkbox.setAttribute('role', 'checkbox');
		container.appendChild(this._checkbox);

		this._label = resourceLabels.create(container, { supportHighlights: true });

		this._details = document.createElement('span');
		this._details.className = 'details';
		container.appendChild(this._details);
	}

	dispose(): void {
		this._localDisposables.dispose();
		this._disposables.dispose();
		this._label.dispose();
	}

	set(element: FileElement, score: FuzzyScore | undefined) {
		this._localDisposables.clear();
		this._localDisposables.add(dom.addDisposableListener(this._checkbox, 'change', (() => element.edit.updateChecked(this._checkbox.checked))));
		this._checkbox.checked = element.edit.isChecked();

		if (element.edit.type & BulkFileOperationType.Rename && element.edit.newUri) {
			// rename: NEW NAME (old name)
			this._label.setFile(element.edit.newUri, {
				matches: createMatches(score),
				fileKind: FileKind.FILE,
				fileDecorations: { colors: true, badges: false },
			});

			this._details.innerText = localize(
				'detail.rename', "(renaming from {0})",
				this._labelService.getUriLabel(element.uri, { relative: true })
			);

		} else {
			// create, delete, edit: NAME
			this._label.setFile(element.uri, {
				matches: createMatches(score),
				fileKind: FileKind.FILE,
				fileDecorations: { colors: true, badges: false },
			});

			if (element.edit.type & BulkFileOperationType.Create) {
				this._details.innerText = localize('detail.create', "(creating)");
			} else if (element.edit.type & BulkFileOperationType.Delete) {
				this._details.innerText = localize('detail.del', "(deleting)");
			} else {
				this._details.innerText = '';
			}
		}
	}
}

export class FileElementRenderer implements ITreeRenderer<FileElement, FuzzyScore, FileElementTemplate> {

	static readonly id: string = 'FileElementRenderer';

	readonly templateId: string = FileElementRenderer.id;

	constructor(
		private readonly _resourceLabels: ResourceLabels,
		@ILabelService private readonly _labelService: ILabelService,
	) { }

	renderTemplate(container: HTMLElement): FileElementTemplate {
		return new FileElementTemplate(container, this._resourceLabels, this._labelService);
	}

	renderElement(node: ITreeNode<FileElement, FuzzyScore>, _index: number, template: FileElementTemplate): void {
		template.set(node.element, node.filterData);
	}

	disposeTemplate(template: FileElementTemplate): void {
		template.dispose();
	}
}

class TextEditElementTemplate {

	private readonly _disposables = new DisposableStore();
	private readonly _localDisposables = new DisposableStore();

	private readonly _checkbox: HTMLInputElement;
	private readonly _label: HighlightedLabel;

	constructor(container: HTMLElement) {
		this._checkbox = document.createElement('input');
		this._checkbox.className = 'edit-checkbox';
		this._checkbox.type = 'checkbox';
		this._checkbox.setAttribute('role', 'checkbox');
		container.appendChild(this._checkbox);

		this._label = new HighlightedLabel(container, false);
		dom.addClass(this._label.element, 'textedit');
	}

	dispose(): void {
		this._localDisposables.dispose();
		this._disposables.dispose();
	}

	set(element: TextEditElement) {
		this._localDisposables.clear();
		this._localDisposables.add(dom.addDisposableListener(this._checkbox, 'change', () => element.edit.updateChecked(this._checkbox.checked)));
		this._checkbox.checked = element.edit.isChecked();
		dom.toggleClass(this._checkbox, 'disabled', !element.edit.parent.isChecked());

		let value = '';
		value += element.prefix;
		value += element.selecting;
		value += element.inserting;
		value += element.suffix;

		let selectHighlight: IHighlight = { start: element.prefix.length, end: element.prefix.length + element.selecting.length, extraClasses: 'remove' };
		let insertHighlight: IHighlight = { start: selectHighlight.end, end: selectHighlight.end + element.inserting.length, extraClasses: 'insert' };

		this._label.set(value, [selectHighlight, insertHighlight], undefined, true);
	}
}

export class TextEditElementRenderer implements ITreeRenderer<TextEditElement, FuzzyScore, TextEditElementTemplate> {

	static readonly id = 'TextEditElementRenderer';

	readonly templateId: string = TextEditElementRenderer.id;

	renderTemplate(container: HTMLElement): TextEditElementTemplate {
		return new TextEditElementTemplate(container);
	}

	renderElement({ element }: ITreeNode<TextEditElement, FuzzyScore>, _index: number, template: TextEditElementTemplate): void {
		template.set(element);
	}

	disposeTemplate(_template: TextEditElementTemplate): void { }
}

export class BulkEditDelegate implements IListVirtualDelegate<BulkEditElement> {

	getHeight(): number {
		return 23;
	}

	getTemplateId(element: BulkEditElement): string {
		return element instanceof FileElement
			? FileElementRenderer.id
			: TextEditElementRenderer.id;
	}
}
