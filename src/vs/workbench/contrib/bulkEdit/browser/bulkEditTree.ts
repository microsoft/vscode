/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IResourceLabel, ResourceLabels, DEFAULT_LABELS_CONTAINER } from 'vs/workbench/browser/labels';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { HighlightedLabel, IHighlight } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Range } from 'vs/editor/common/core/range';
import * as dom from 'vs/base/browser/dom';
import { ITextModel } from 'vs/editor/common/model';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { TextModel } from 'vs/editor/common/model/textModel';
import { BulkFileOperations, BulkFileOperation, BulkFileOperationType, BulkTextEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditPreview';
import { localize } from 'vs/nls';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachCheckboxStyler } from 'vs/platform/theme/common/styler';
import { FileKind } from 'vs/platform/files/common/files';

// --- VIEW MODEL

export class FileElement {

	private static _typeLabels: Record<number, string> = {
		[BulkFileOperationType.Create]: localize('create', "create"),
		[BulkFileOperationType.Delete]: localize('delete', "delete"),
		[BulkFileOperationType.Rename]: localize('rename', "rename"),
		[BulkFileOperationType.Create | BulkFileOperationType.Delete]: localize('createDelete', "create & delete"),
		[BulkFileOperationType.Create | BulkFileOperationType.Rename]: localize('createRename', "create & rename"),
		[BulkFileOperationType.Delete | BulkFileOperationType.Rename]: localize('deleteRename', "delete & rename"),
		[BulkFileOperationType.Create | BulkFileOperationType.Delete | BulkFileOperationType.Rename]: localize('createRenameDelete', "create, rename, delete"),
	};

	readonly uri: URI;
	readonly typeLabel: string;

	constructor(readonly edit: BulkFileOperation) {
		this.uri = edit.uri;
		this.typeLabel = FileElement._typeLabels[edit.type] || '';
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

	constructor(
		private readonly _checkbox: Checkbox,
		private readonly _label: IResourceLabel,
		@IThemeService themeService: IThemeService
	) {
		this._disposables.add(attachCheckboxStyler(_checkbox, themeService));
	}

	dispose(): void {
		this._localDisposables.dispose();
		this._disposables.dispose();
		this._checkbox.dispose();
		this._label.dispose();
	}

	set(element: FileElement, score: FuzzyScore | undefined) {
		this._localDisposables.clear();
		this._localDisposables.add(this._checkbox.onChange(() => element.edit.updateChecked(this._checkbox.checked)));
		this._checkbox.checked = element.edit.isChecked();

		const extraClasses: string[] = [];
		if (element.edit.type & BulkFileOperationType.Create) {
			extraClasses.push('create');
		}
		if (element.edit.type & BulkFileOperationType.Delete) {
			extraClasses.push('delete');
		}
		if (element.edit.type & BulkFileOperationType.Rename) {
			extraClasses.push('rename');
		}
		this._label.setFile(element.uri, {
			matches: createMatches(score),
			fileKind: FileKind.FILE,
			fileDecorations: { colors: true, badges: false },
			// parentCount: element.edit.textEdits.length || undefined,
			extraClasses,
		});
	}
}

export class FileElementRenderer implements ITreeRenderer<FileElement, FuzzyScore, FileElementTemplate> {

	static readonly id: string = 'FileElementRenderer';

	readonly templateId: string = FileElementRenderer.id;

	private readonly _resourceLabels: ResourceLabels;

	constructor(
		@IInstantiationService private _instaService: IInstantiationService
	) {
		this._resourceLabels = _instaService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER);
	}

	dispose(): void {
		this._resourceLabels.dispose();
	}

	renderTemplate(container: HTMLElement): FileElementTemplate {
		const checkbox = new Checkbox({ actionClassName: 'codicon-check edit-checkbox', isChecked: true, title: '' });
		container.appendChild(checkbox.domNode);

		const label = this._resourceLabels.create(container, { supportHighlights: true });
		return this._instaService.createInstance(FileElementTemplate, checkbox, label);
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

	constructor(
		private readonly _checkbox: Checkbox,
		private readonly _label: HighlightedLabel,
		@IThemeService themeService: IThemeService
	) {

		this._disposables.add(attachCheckboxStyler(_checkbox, themeService));
	}

	dispose(): void {
		this._localDisposables.dispose();
		this._disposables.dispose();
		this._checkbox.dispose();
	}

	set(element: TextEditElement) {
		this._localDisposables.clear();
		this._localDisposables.add(this._checkbox.onChange(() => element.edit.updateChecked(this._checkbox.checked)));
		this._checkbox.checked = element.edit.isChecked();
		dom.toggleClass(this._checkbox.domNode, 'disabled', !element.edit.parent.isChecked());

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

	constructor(@IInstantiationService private readonly _instaService: IInstantiationService) { }

	renderTemplate(container: HTMLElement): TextEditElementTemplate {
		const checkbox = new Checkbox({ actionClassName: 'codicon-check edit-checkbox', isChecked: true, title: '' });
		container.appendChild(checkbox.domNode);

		const label = new HighlightedLabel(container, false);
		dom.addClass(label.element, 'textedit');
		return this._instaService.createInstance(TextEditElementTemplate, checkbox, label);
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
