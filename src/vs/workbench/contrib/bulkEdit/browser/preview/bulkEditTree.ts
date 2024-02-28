/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode, ITreeSorter } from 'vs/base/browser/ui/tree/tree';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { HighlightedLabel, IHighlight } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IIdentityProvider, IListVirtualDelegate, IKeyboardNavigationLabelProvider } from 'vs/base/browser/ui/list/list';
import { Range } from 'vs/editor/common/core/range';
import * as dom from 'vs/base/browser/dom';
import { ITextModel } from 'vs/editor/common/model';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { TextModel } from 'vs/editor/common/model/textModel';
import { BulkFileOperations, BulkFileOperation, BulkFileOperationType, BulkTextEdit, BulkCategory } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPreview';
import { FileKind } from 'vs/platform/files/common/files';
import { localize } from 'vs/nls';
import { ILabelService } from 'vs/platform/label/common/label';
import type { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { basename } from 'vs/base/common/resources';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { compare } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { ResourceFileEdit } from 'vs/editor/browser/services/bulkEditService';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { SnippetParser } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { AriaRole } from 'vs/base/browser/ui/aria/aria';

// --- VIEW MODEL

export interface ICheckable {
	isChecked(): boolean;
	setChecked(value: boolean): void;
}

export class CategoryElement implements ICheckable {

	constructor(
		readonly parent: BulkFileOperations,
		readonly category: BulkCategory
	) { }

	isChecked(): boolean {
		const model = this.parent;
		let checked = true;
		for (const file of this.category.fileOperations) {
			for (const edit of file.originalEdits.values()) {
				checked = checked && model.checked.isChecked(edit);
			}
		}
		return checked;
	}

	setChecked(value: boolean): void {
		const model = this.parent;
		for (const file of this.category.fileOperations) {
			for (const edit of file.originalEdits.values()) {
				model.checked.updateChecked(edit, value);
			}
		}
	}
}

export class FileElement implements ICheckable {

	constructor(
		readonly parent: CategoryElement | BulkFileOperations,
		readonly edit: BulkFileOperation
	) { }

	isChecked(): boolean {
		const model = this.parent instanceof CategoryElement ? this.parent.parent : this.parent;

		let checked = true;

		// only text edit children -> reflect children state
		if (this.edit.type === BulkFileOperationType.TextEdit) {
			checked = !this.edit.textEdits.every(edit => !model.checked.isChecked(edit.textEdit));
		}

		// multiple file edits -> reflect single state
		for (const edit of this.edit.originalEdits.values()) {
			if (edit instanceof ResourceFileEdit) {
				checked = checked && model.checked.isChecked(edit);
			}
		}

		// multiple categories and text change -> read all elements
		if (this.parent instanceof CategoryElement && this.edit.type === BulkFileOperationType.TextEdit) {
			for (const category of model.categories) {
				for (const file of category.fileOperations) {
					if (file.uri.toString() === this.edit.uri.toString()) {
						for (const edit of file.originalEdits.values()) {
							if (edit instanceof ResourceFileEdit) {
								checked = checked && model.checked.isChecked(edit);
							}
						}
					}
				}
			}
		}

		return checked;
	}

	setChecked(value: boolean): void {
		const model = this.parent instanceof CategoryElement ? this.parent.parent : this.parent;
		for (const edit of this.edit.originalEdits.values()) {
			model.checked.updateChecked(edit, value);
		}

		// multiple categories and file change -> update all elements
		if (this.parent instanceof CategoryElement && this.edit.type !== BulkFileOperationType.TextEdit) {
			for (const category of model.categories) {
				for (const file of category.fileOperations) {
					if (file.uri.toString() === this.edit.uri.toString()) {
						for (const edit of file.originalEdits.values()) {
							model.checked.updateChecked(edit, value);
						}
					}
				}
			}
		}
	}

	isDisabled(): boolean {
		if (this.parent instanceof CategoryElement && this.edit.type === BulkFileOperationType.TextEdit) {
			const model = this.parent.parent;
			let checked = true;
			for (const category of model.categories) {
				for (const file of category.fileOperations) {
					if (file.uri.toString() === this.edit.uri.toString()) {
						for (const edit of file.originalEdits.values()) {
							if (edit instanceof ResourceFileEdit) {
								checked = checked && model.checked.isChecked(edit);
							}
						}
					}
				}
			}
			return !checked;
		}
		return false;
	}
}

export class TextEditElement implements ICheckable {

	constructor(
		readonly parent: FileElement,
		readonly idx: number,
		readonly edit: BulkTextEdit,
		readonly prefix: string, readonly selecting: string, readonly inserting: string, readonly suffix: string
	) { }

	isChecked(): boolean {
		let model = this.parent.parent;
		if (model instanceof CategoryElement) {
			model = model.parent;
		}
		return model.checked.isChecked(this.edit.textEdit);
	}

	setChecked(value: boolean): void {
		let model = this.parent.parent;
		if (model instanceof CategoryElement) {
			model = model.parent;
		}

		// check/uncheck this element
		model.checked.updateChecked(this.edit.textEdit, value);

		// make sure parent is checked when this element is checked...
		if (value) {
			for (const edit of this.parent.edit.originalEdits.values()) {
				if (edit instanceof ResourceFileEdit) {
					(<BulkFileOperations>model).checked.updateChecked(edit, value);
				}
			}
		}
	}

	isDisabled(): boolean {
		return this.parent.isDisabled();
	}
}

export type BulkEditElement = CategoryElement | FileElement | TextEditElement;

// --- DATA SOURCE

export class BulkEditDataSource implements IAsyncDataSource<BulkFileOperations, BulkEditElement> {

	public groupByFile: boolean = true;

	constructor(
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
	) { }

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
			return this.groupByFile
				? element.fileOperations.map(op => new FileElement(element, op))
				: element.categories.map(cat => new CategoryElement(element, cat));
		}

		// category
		if (element instanceof CategoryElement) {
			return Array.from(element.category.fileOperations, op => new FileElement(element, op));
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
				textModel = new TextModel('', PLAINTEXT_LANGUAGE_ID, TextModel.DEFAULT_CREATION_OPTIONS, null, this._undoRedoService, this._languageService, this._languageConfigurationService);
				textModelDisposable = textModel;
			}

			const result = element.edit.textEdits.map((edit, idx) => {
				const range = textModel.validateRange(edit.textEdit.textEdit.range);

				//prefix-math
				const startTokens = textModel.tokenization.getLineTokens(range.startLineNumber);
				let prefixLen = 23; // default value for the no tokens/grammar case
				for (let idx = startTokens.findTokenIndexAtOffset(range.startColumn - 1) - 1; prefixLen < 50 && idx >= 0; idx--) {
					prefixLen = range.startColumn - startTokens.getStartOffset(idx);
				}

				//suffix-math
				const endTokens = textModel.tokenization.getLineTokens(range.endLineNumber);
				let suffixLen = 0;
				for (let idx = endTokens.findTokenIndexAtOffset(range.endColumn - 1); suffixLen < 50 && idx < endTokens.getCount(); idx++) {
					suffixLen += endTokens.getEndOffset(idx) - endTokens.getStartOffset(idx);
				}

				return new TextEditElement(
					element,
					idx,
					edit,
					textModel.getValueInRange(new Range(range.startLineNumber, range.startColumn - prefixLen, range.startLineNumber, range.startColumn)),
					textModel.getValueInRange(range),
					!edit.textEdit.textEdit.insertAsSnippet ? edit.textEdit.textEdit.text : SnippetParser.asInsertText(edit.textEdit.textEdit.text),
					textModel.getValueInRange(new Range(range.endLineNumber, range.endColumn, range.endLineNumber, range.endColumn + suffixLen))
				);
			});

			textModelDisposable.dispose();
			return result;
		}

		return [];
	}
}


export class BulkEditSorter implements ITreeSorter<BulkEditElement> {

	compare(a: BulkEditElement, b: BulkEditElement): number {
		if (a instanceof FileElement && b instanceof FileElement) {
			return compareBulkFileOperations(a.edit, b.edit);
		}

		if (a instanceof TextEditElement && b instanceof TextEditElement) {
			return Range.compareRangesUsingStarts(a.edit.textEdit.textEdit.range, b.edit.textEdit.textEdit.range);
		}

		return 0;
	}
}

export function compareBulkFileOperations(a: BulkFileOperation, b: BulkFileOperation): number {
	return compare(a.uri.toString(), b.uri.toString());
}

// --- ACCESSI

export class BulkEditAccessibilityProvider implements IListAccessibilityProvider<BulkEditElement> {

	constructor(@ILabelService private readonly _labelService: ILabelService) { }

	getWidgetAriaLabel(): string {
		return localize('bulkEdit', "Bulk Edit");
	}

	getRole(_element: BulkEditElement): AriaRole {
		return 'checkbox';
	}

	getAriaLabel(element: BulkEditElement): string | null {
		if (element instanceof FileElement) {
			if (element.edit.textEdits.length > 0) {
				if (element.edit.type & BulkFileOperationType.Rename && element.edit.newUri) {
					return localize(
						'aria.renameAndEdit', "Renaming {0} to {1}, also making text edits",
						this._labelService.getUriLabel(element.edit.uri, { relative: true }), this._labelService.getUriLabel(element.edit.newUri, { relative: true })
					);

				} else if (element.edit.type & BulkFileOperationType.Create) {
					return localize(
						'aria.createAndEdit', "Creating {0}, also making text edits",
						this._labelService.getUriLabel(element.edit.uri, { relative: true })
					);

				} else if (element.edit.type & BulkFileOperationType.Delete) {
					return localize(
						'aria.deleteAndEdit', "Deleting {0}, also making text edits",
						this._labelService.getUriLabel(element.edit.uri, { relative: true }),
					);
				} else {
					return localize(
						'aria.editOnly', "{0}, making text edits",
						this._labelService.getUriLabel(element.edit.uri, { relative: true }),
					);
				}

			} else {
				if (element.edit.type & BulkFileOperationType.Rename && element.edit.newUri) {
					return localize(
						'aria.rename', "Renaming {0} to {1}",
						this._labelService.getUriLabel(element.edit.uri, { relative: true }), this._labelService.getUriLabel(element.edit.newUri, { relative: true })
					);

				} else if (element.edit.type & BulkFileOperationType.Create) {
					return localize(
						'aria.create', "Creating {0}",
						this._labelService.getUriLabel(element.edit.uri, { relative: true })
					);

				} else if (element.edit.type & BulkFileOperationType.Delete) {
					return localize(
						'aria.delete', "Deleting {0}",
						this._labelService.getUriLabel(element.edit.uri, { relative: true }),
					);
				}
			}
		}

		if (element instanceof TextEditElement) {
			if (element.selecting.length > 0 && element.inserting.length > 0) {
				// edit: replace
				return localize('aria.replace', "line {0}, replacing {1} with {2}", element.edit.textEdit.textEdit.range.startLineNumber, element.selecting, element.inserting);
			} else if (element.selecting.length > 0 && element.inserting.length === 0) {
				// edit: delete
				return localize('aria.del', "line {0}, removing {1}", element.edit.textEdit.textEdit.range.startLineNumber, element.selecting);
			} else if (element.selecting.length === 0 && element.inserting.length > 0) {
				// edit: insert
				return localize('aria.insert', "line {0}, inserting {1}", element.edit.textEdit.textEdit.range.startLineNumber, element.selecting);
			}
		}

		return null;
	}
}

// --- IDENT

export class BulkEditIdentityProvider implements IIdentityProvider<BulkEditElement> {

	getId(element: BulkEditElement): { toString(): string } {
		if (element instanceof FileElement) {
			return element.edit.uri + (element.parent instanceof CategoryElement ? JSON.stringify(element.parent.category.metadata) : '');
		} else if (element instanceof TextEditElement) {
			return element.parent.edit.uri.toString() + element.idx;
		} else {
			return JSON.stringify(element.category.metadata);
		}
	}
}

// --- RENDERER

class CategoryElementTemplate {

	readonly icon: HTMLDivElement;
	readonly label: IconLabel;

	constructor(container: HTMLElement) {
		container.classList.add('category');
		this.icon = document.createElement('div');
		container.appendChild(this.icon);
		this.label = new IconLabel(container);
	}
}

export class CategoryElementRenderer implements ITreeRenderer<CategoryElement, FuzzyScore, CategoryElementTemplate> {

	static readonly id: string = 'CategoryElementRenderer';

	readonly templateId: string = CategoryElementRenderer.id;

	constructor(@IThemeService private readonly _themeService: IThemeService) { }

	renderTemplate(container: HTMLElement): CategoryElementTemplate {
		return new CategoryElementTemplate(container);
	}

	renderElement(node: ITreeNode<CategoryElement, FuzzyScore>, _index: number, template: CategoryElementTemplate): void {

		template.icon.style.setProperty('--background-dark', null);
		template.icon.style.setProperty('--background-light', null);
		template.icon.style.color = '';

		const { metadata } = node.element.category;
		if (ThemeIcon.isThemeIcon(metadata.iconPath)) {
			// css
			const className = ThemeIcon.asClassName(metadata.iconPath);
			template.icon.className = className ? `theme-icon ${className}` : '';
			template.icon.style.color = metadata.iconPath.color ? this._themeService.getColorTheme().getColor(metadata.iconPath.color.id)?.toString() ?? '' : '';


		} else if (URI.isUri(metadata.iconPath)) {
			// background-image
			template.icon.className = 'uri-icon';
			template.icon.style.setProperty('--background-dark', dom.asCSSUrl(metadata.iconPath));
			template.icon.style.setProperty('--background-light', dom.asCSSUrl(metadata.iconPath));

		} else if (metadata.iconPath) {
			// background-image
			template.icon.className = 'uri-icon';
			template.icon.style.setProperty('--background-dark', dom.asCSSUrl(metadata.iconPath.dark));
			template.icon.style.setProperty('--background-light', dom.asCSSUrl(metadata.iconPath.light));
		}

		template.label.setLabel(metadata.label, metadata.description, {
			descriptionMatches: createMatches(node.filterData),
		});
	}

	disposeTemplate(template: CategoryElementTemplate): void {
		template.label.dispose();
	}
}

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

		this._checkbox.checked = element.isChecked();
		this._checkbox.disabled = element.isDisabled();
		this._localDisposables.add(dom.addDisposableListener(this._checkbox, 'change', () => {
			element.setChecked(this._checkbox.checked);
		}));

		if (element.edit.type & BulkFileOperationType.Rename && element.edit.newUri) {
			// rename: oldName → newName
			this._label.setResource({
				resource: element.edit.uri,
				name: localize('rename.label', "{0} → {1}", this._labelService.getUriLabel(element.edit.uri, { relative: true }), this._labelService.getUriLabel(element.edit.newUri, { relative: true })),
			}, {
				fileDecorations: { colors: true, badges: false }
			});

			this._details.innerText = localize('detail.rename', "(renaming)");

		} else {
			// create, delete, edit: NAME
			const options = {
				matches: createMatches(score),
				fileKind: FileKind.FILE,
				fileDecorations: { colors: true, badges: false },
				extraClasses: <string[]>[]
			};
			if (element.edit.type & BulkFileOperationType.Create) {
				this._details.innerText = localize('detail.create', "(creating)");
			} else if (element.edit.type & BulkFileOperationType.Delete) {
				this._details.innerText = localize('detail.del', "(deleting)");
				options.extraClasses.push('delete');
			} else {
				this._details.innerText = '';
			}
			this._label.setFile(element.edit.uri, options);
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
	private readonly _icon: HTMLDivElement;
	private readonly _label: HighlightedLabel;

	constructor(container: HTMLElement, @IThemeService private readonly _themeService: IThemeService) {
		container.classList.add('textedit');

		this._checkbox = document.createElement('input');
		this._checkbox.className = 'edit-checkbox';
		this._checkbox.type = 'checkbox';
		this._checkbox.setAttribute('role', 'checkbox');
		container.appendChild(this._checkbox);

		this._icon = document.createElement('div');
		container.appendChild(this._icon);

		this._label = this._disposables.add(new HighlightedLabel(container));
	}

	dispose(): void {
		this._localDisposables.dispose();
		this._disposables.dispose();
	}

	set(element: TextEditElement) {
		this._localDisposables.clear();

		this._localDisposables.add(dom.addDisposableListener(this._checkbox, 'change', e => {
			element.setChecked(this._checkbox.checked);
			e.preventDefault();
		}));
		if (element.parent.isChecked()) {
			this._checkbox.checked = element.isChecked();
			this._checkbox.disabled = element.isDisabled();
		} else {
			this._checkbox.checked = element.isChecked();
			this._checkbox.disabled = element.isDisabled();
		}

		let value = '';
		value += element.prefix;
		value += element.selecting;
		value += element.inserting;
		value += element.suffix;

		const selectHighlight: IHighlight = { start: element.prefix.length, end: element.prefix.length + element.selecting.length, extraClasses: ['remove'] };
		const insertHighlight: IHighlight = { start: selectHighlight.end, end: selectHighlight.end + element.inserting.length, extraClasses: ['insert'] };

		let title: string | undefined;
		const { metadata } = element.edit.textEdit;
		if (metadata && metadata.description) {
			title = localize('title', "{0} - {1}", metadata.label, metadata.description);
		} else if (metadata) {
			title = metadata.label;
		}

		const iconPath = metadata?.iconPath;
		if (!iconPath) {
			this._icon.style.display = 'none';
		} else {
			this._icon.style.display = 'block';

			this._icon.style.setProperty('--background-dark', null);
			this._icon.style.setProperty('--background-light', null);

			if (ThemeIcon.isThemeIcon(iconPath)) {
				// css
				const className = ThemeIcon.asClassName(iconPath);
				this._icon.className = className ? `theme-icon ${className}` : '';
				this._icon.style.color = iconPath.color ? this._themeService.getColorTheme().getColor(iconPath.color.id)?.toString() ?? '' : '';


			} else if (URI.isUri(iconPath)) {
				// background-image
				this._icon.className = 'uri-icon';
				this._icon.style.setProperty('--background-dark', dom.asCSSUrl(iconPath));
				this._icon.style.setProperty('--background-light', dom.asCSSUrl(iconPath));

			} else {
				// background-image
				this._icon.className = 'uri-icon';
				this._icon.style.setProperty('--background-dark', dom.asCSSUrl(iconPath.dark));
				this._icon.style.setProperty('--background-light', dom.asCSSUrl(iconPath.light));
			}
		}

		this._label.set(value, [selectHighlight, insertHighlight], title, true);
		this._icon.title = title || '';
	}
}

export class TextEditElementRenderer implements ITreeRenderer<TextEditElement, FuzzyScore, TextEditElementTemplate> {

	static readonly id = 'TextEditElementRenderer';

	readonly templateId: string = TextEditElementRenderer.id;

	constructor(@IThemeService private readonly _themeService: IThemeService) { }

	renderTemplate(container: HTMLElement): TextEditElementTemplate {
		return new TextEditElementTemplate(container, this._themeService);
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

		if (element instanceof FileElement) {
			return FileElementRenderer.id;
		} else if (element instanceof TextEditElement) {
			return TextEditElementRenderer.id;
		} else {
			return CategoryElementRenderer.id;
		}
	}
}


export class BulkEditNaviLabelProvider implements IKeyboardNavigationLabelProvider<BulkEditElement> {

	getKeyboardNavigationLabel(element: BulkEditElement) {
		if (element instanceof FileElement) {
			return basename(element.edit.uri);
		} else if (element instanceof CategoryElement) {
			return element.category.metadata.label;
		}
		return undefined;
	}
}
