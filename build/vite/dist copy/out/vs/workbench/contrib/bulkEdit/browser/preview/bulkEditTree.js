/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CategoryElementRenderer_1, FileElementRenderer_1, TextEditElementRenderer_1;
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createMatches } from '../../../../../base/common/filters.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { Range } from '../../../../../editor/common/core/range.js';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { TextModel } from '../../../../../editor/common/model/textModel.js';
import { BulkFileOperations } from './bulkEditPreview.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { localize } from '../../../../../nls.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { basename } from '../../../../../base/common/resources.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { compare } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { ResourceFileEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { SnippetParser } from '../../../../../editor/contrib/snippet/browser/snippetParser.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import * as css from '../../../../../base/browser/cssValue.js';
export class CategoryElement {
    constructor(parent, category) {
        this.parent = parent;
        this.category = category;
    }
    isChecked() {
        const model = this.parent;
        let checked = true;
        for (const file of this.category.fileOperations) {
            for (const edit of file.originalEdits.values()) {
                checked = checked && model.checked.isChecked(edit);
            }
        }
        return checked;
    }
    setChecked(value) {
        const model = this.parent;
        for (const file of this.category.fileOperations) {
            for (const edit of file.originalEdits.values()) {
                model.checked.updateChecked(edit, value);
            }
        }
    }
}
export class FileElement {
    constructor(parent, edit) {
        this.parent = parent;
        this.edit = edit;
    }
    isChecked() {
        const model = this.parent instanceof CategoryElement ? this.parent.parent : this.parent;
        let checked = true;
        // only text edit children -> reflect children state
        if (this.edit.type === 1 /* BulkFileOperationType.TextEdit */) {
            checked = !this.edit.textEdits.every(edit => !model.checked.isChecked(edit.textEdit));
        }
        // multiple file edits -> reflect single state
        for (const edit of this.edit.originalEdits.values()) {
            if (edit instanceof ResourceFileEdit) {
                checked = checked && model.checked.isChecked(edit);
            }
        }
        // multiple categories and text change -> read all elements
        if (this.parent instanceof CategoryElement && this.edit.type === 1 /* BulkFileOperationType.TextEdit */) {
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
    setChecked(value) {
        const model = this.parent instanceof CategoryElement ? this.parent.parent : this.parent;
        for (const edit of this.edit.originalEdits.values()) {
            model.checked.updateChecked(edit, value);
        }
        // multiple categories and file change -> update all elements
        if (this.parent instanceof CategoryElement && this.edit.type !== 1 /* BulkFileOperationType.TextEdit */) {
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
    isDisabled() {
        if (this.parent instanceof CategoryElement && this.edit.type === 1 /* BulkFileOperationType.TextEdit */) {
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
export class TextEditElement {
    constructor(parent, idx, edit, prefix, selecting, inserting, suffix) {
        this.parent = parent;
        this.idx = idx;
        this.edit = edit;
        this.prefix = prefix;
        this.selecting = selecting;
        this.inserting = inserting;
        this.suffix = suffix;
    }
    isChecked() {
        let model = this.parent.parent;
        if (model instanceof CategoryElement) {
            model = model.parent;
        }
        return model.checked.isChecked(this.edit.textEdit);
    }
    setChecked(value) {
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
                    model.checked.updateChecked(edit, value);
                }
            }
        }
    }
    isDisabled() {
        return this.parent.isDisabled();
    }
}
// --- DATA SOURCE
let BulkEditDataSource = class BulkEditDataSource {
    constructor(_textModelService, _instantiationService) {
        this._textModelService = _textModelService;
        this._instantiationService = _instantiationService;
        this.groupByFile = true;
    }
    hasChildren(element) {
        if (element instanceof FileElement) {
            return element.edit.textEdits.length > 0;
        }
        if (element instanceof TextEditElement) {
            return false;
        }
        return true;
    }
    async getChildren(element) {
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
            let textModel;
            let textModelDisposable;
            try {
                const ref = await this._textModelService.createModelReference(element.edit.uri);
                textModel = ref.object.textEditorModel;
                textModelDisposable = ref;
            }
            catch {
                textModel = this._instantiationService.createInstance(TextModel, '', PLAINTEXT_LANGUAGE_ID, TextModel.DEFAULT_CREATION_OPTIONS, null);
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
                return new TextEditElement(element, idx, edit, textModel.getValueInRange(new Range(range.startLineNumber, range.startColumn - prefixLen, range.startLineNumber, range.startColumn)), textModel.getValueInRange(range), !edit.textEdit.textEdit.insertAsSnippet ? edit.textEdit.textEdit.text : SnippetParser.asInsertText(edit.textEdit.textEdit.text), textModel.getValueInRange(new Range(range.endLineNumber, range.endColumn, range.endLineNumber, range.endColumn + suffixLen)));
            });
            textModelDisposable.dispose();
            return result;
        }
        return [];
    }
};
BulkEditDataSource = __decorate([
    __param(0, ITextModelService),
    __param(1, IInstantiationService)
], BulkEditDataSource);
export { BulkEditDataSource };
export class BulkEditSorter {
    compare(a, b) {
        if (a instanceof FileElement && b instanceof FileElement) {
            return compareBulkFileOperations(a.edit, b.edit);
        }
        if (a instanceof TextEditElement && b instanceof TextEditElement) {
            return Range.compareRangesUsingStarts(a.edit.textEdit.textEdit.range, b.edit.textEdit.textEdit.range);
        }
        return 0;
    }
}
export function compareBulkFileOperations(a, b) {
    return compare(a.uri.toString(), b.uri.toString());
}
// --- ACCESSI
let BulkEditAccessibilityProvider = class BulkEditAccessibilityProvider {
    constructor(_labelService) {
        this._labelService = _labelService;
    }
    getWidgetAriaLabel() {
        return localize('bulkEdit', "Bulk Edit");
    }
    getRole(_element) {
        return 'checkbox';
    }
    getAriaLabel(element) {
        if (element instanceof FileElement) {
            if (element.edit.textEdits.length > 0) {
                if (element.edit.type & 8 /* BulkFileOperationType.Rename */ && element.edit.newUri) {
                    return localize('aria.renameAndEdit', "Renaming {0} to {1}, also making text edits", this._labelService.getUriLabel(element.edit.uri, { relative: true }), this._labelService.getUriLabel(element.edit.newUri, { relative: true }));
                }
                else if (element.edit.type & 2 /* BulkFileOperationType.Create */) {
                    return localize('aria.createAndEdit', "Creating {0}, also making text edits", this._labelService.getUriLabel(element.edit.uri, { relative: true }));
                }
                else if (element.edit.type & 4 /* BulkFileOperationType.Delete */) {
                    return localize('aria.deleteAndEdit', "Deleting {0}, also making text edits", this._labelService.getUriLabel(element.edit.uri, { relative: true }));
                }
                else {
                    return localize('aria.editOnly', "{0}, making text edits", this._labelService.getUriLabel(element.edit.uri, { relative: true }));
                }
            }
            else {
                if (element.edit.type & 8 /* BulkFileOperationType.Rename */ && element.edit.newUri) {
                    return localize('aria.rename', "Renaming {0} to {1}", this._labelService.getUriLabel(element.edit.uri, { relative: true }), this._labelService.getUriLabel(element.edit.newUri, { relative: true }));
                }
                else if (element.edit.type & 2 /* BulkFileOperationType.Create */) {
                    return localize('aria.create', "Creating {0}", this._labelService.getUriLabel(element.edit.uri, { relative: true }));
                }
                else if (element.edit.type & 4 /* BulkFileOperationType.Delete */) {
                    return localize('aria.delete', "Deleting {0}", this._labelService.getUriLabel(element.edit.uri, { relative: true }));
                }
            }
        }
        if (element instanceof TextEditElement) {
            if (element.selecting.length > 0 && element.inserting.length > 0) {
                // edit: replace
                return localize('aria.replace', "line {0}, replacing {1} with {2}", element.edit.textEdit.textEdit.range.startLineNumber, element.selecting, element.inserting);
            }
            else if (element.selecting.length > 0 && element.inserting.length === 0) {
                // edit: delete
                return localize('aria.del', "line {0}, removing {1}", element.edit.textEdit.textEdit.range.startLineNumber, element.selecting);
            }
            else if (element.selecting.length === 0 && element.inserting.length > 0) {
                // edit: insert
                return localize('aria.insert', "line {0}, inserting {1}", element.edit.textEdit.textEdit.range.startLineNumber, element.selecting);
            }
        }
        return null;
    }
};
BulkEditAccessibilityProvider = __decorate([
    __param(0, ILabelService)
], BulkEditAccessibilityProvider);
export { BulkEditAccessibilityProvider };
// --- IDENT
export class BulkEditIdentityProvider {
    getId(element) {
        if (element instanceof FileElement) {
            return element.edit.uri + (element.parent instanceof CategoryElement ? JSON.stringify(element.parent.category.metadata) : '');
        }
        else if (element instanceof TextEditElement) {
            return element.parent.edit.uri.toString() + element.idx;
        }
        else {
            return JSON.stringify(element.category.metadata);
        }
    }
}
// --- RENDERER
class CategoryElementTemplate {
    constructor(container) {
        container.classList.add('category');
        this.icon = document.createElement('div');
        container.appendChild(this.icon);
        this.label = new IconLabel(container);
    }
}
let CategoryElementRenderer = class CategoryElementRenderer {
    static { CategoryElementRenderer_1 = this; }
    static { this.id = 'CategoryElementRenderer'; }
    constructor(_themeService) {
        this._themeService = _themeService;
        this.templateId = CategoryElementRenderer_1.id;
    }
    renderTemplate(container) {
        return new CategoryElementTemplate(container);
    }
    renderElement(node, _index, template) {
        template.icon.style.setProperty('--background-dark', null);
        template.icon.style.setProperty('--background-light', null);
        template.icon.style.color = '';
        const { metadata } = node.element.category;
        if (ThemeIcon.isThemeIcon(metadata.iconPath)) {
            // css
            const className = ThemeIcon.asClassName(metadata.iconPath);
            template.icon.className = className ? `theme-icon ${className}` : '';
            template.icon.style.color = metadata.iconPath.color ? this._themeService.getColorTheme().getColor(metadata.iconPath.color.id)?.toString() ?? '' : '';
        }
        else if (URI.isUri(metadata.iconPath)) {
            // background-image
            template.icon.className = 'uri-icon';
            template.icon.style.setProperty('--background-dark', css.asCSSUrl(metadata.iconPath));
            template.icon.style.setProperty('--background-light', css.asCSSUrl(metadata.iconPath));
        }
        else if (metadata.iconPath) {
            // background-image
            template.icon.className = 'uri-icon';
            template.icon.style.setProperty('--background-dark', css.asCSSUrl(metadata.iconPath.dark));
            template.icon.style.setProperty('--background-light', css.asCSSUrl(metadata.iconPath.light));
        }
        template.label.setLabel(metadata.label, metadata.description, {
            descriptionMatches: createMatches(node.filterData),
        });
    }
    disposeTemplate(template) {
        template.label.dispose();
    }
};
CategoryElementRenderer = CategoryElementRenderer_1 = __decorate([
    __param(0, IThemeService)
], CategoryElementRenderer);
export { CategoryElementRenderer };
let FileElementTemplate = class FileElementTemplate {
    constructor(container, resourceLabels, _labelService) {
        this._labelService = _labelService;
        this._disposables = new DisposableStore();
        this._localDisposables = new DisposableStore();
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
    dispose() {
        this._localDisposables.dispose();
        this._disposables.dispose();
        this._label.dispose();
    }
    set(element, score) {
        this._localDisposables.clear();
        this._checkbox.checked = element.isChecked();
        this._checkbox.disabled = element.isDisabled();
        this._localDisposables.add(dom.addDisposableListener(this._checkbox, 'change', () => {
            element.setChecked(this._checkbox.checked);
        }));
        if (element.edit.type & 8 /* BulkFileOperationType.Rename */ && element.edit.newUri) {
            // rename: oldName → newName
            this._label.setResource({
                resource: element.edit.uri,
                name: localize('rename.label', "{0} → {1}", this._labelService.getUriLabel(element.edit.uri, { relative: true }), this._labelService.getUriLabel(element.edit.newUri, { relative: true })),
            }, {
                fileDecorations: { colors: true, badges: false }
            });
            this._details.innerText = localize('detail.rename', "(renaming)");
        }
        else {
            // create, delete, edit: NAME
            const options = {
                matches: createMatches(score),
                fileKind: FileKind.FILE,
                fileDecorations: { colors: true, badges: false },
                extraClasses: []
            };
            if (element.edit.type & 2 /* BulkFileOperationType.Create */) {
                this._details.innerText = localize('detail.create', "(creating)");
            }
            else if (element.edit.type & 4 /* BulkFileOperationType.Delete */) {
                this._details.innerText = localize('detail.del', "(deleting)");
                options.extraClasses.push('delete');
            }
            else {
                this._details.innerText = '';
            }
            this._label.setFile(element.edit.uri, options);
        }
    }
};
FileElementTemplate = __decorate([
    __param(2, ILabelService)
], FileElementTemplate);
let FileElementRenderer = class FileElementRenderer {
    static { FileElementRenderer_1 = this; }
    static { this.id = 'FileElementRenderer'; }
    constructor(_resourceLabels, _labelService) {
        this._resourceLabels = _resourceLabels;
        this._labelService = _labelService;
        this.templateId = FileElementRenderer_1.id;
    }
    renderTemplate(container) {
        return new FileElementTemplate(container, this._resourceLabels, this._labelService);
    }
    renderElement(node, _index, template) {
        template.set(node.element, node.filterData);
    }
    disposeTemplate(template) {
        template.dispose();
    }
};
FileElementRenderer = FileElementRenderer_1 = __decorate([
    __param(1, ILabelService)
], FileElementRenderer);
export { FileElementRenderer };
let TextEditElementTemplate = class TextEditElementTemplate {
    constructor(container, _themeService) {
        this._themeService = _themeService;
        this._disposables = new DisposableStore();
        this._localDisposables = new DisposableStore();
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
    dispose() {
        this._localDisposables.dispose();
        this._disposables.dispose();
    }
    set(element) {
        this._localDisposables.clear();
        this._localDisposables.add(dom.addDisposableListener(this._checkbox, 'change', e => {
            element.setChecked(this._checkbox.checked);
            e.preventDefault();
        }));
        if (element.parent.isChecked()) {
            this._checkbox.checked = element.isChecked();
            this._checkbox.disabled = element.isDisabled();
        }
        else {
            this._checkbox.checked = element.isChecked();
            this._checkbox.disabled = element.isDisabled();
        }
        let value = '';
        value += element.prefix;
        value += element.selecting;
        value += element.inserting;
        value += element.suffix;
        const selectHighlight = { start: element.prefix.length, end: element.prefix.length + element.selecting.length, extraClasses: ['remove'] };
        const insertHighlight = { start: selectHighlight.end, end: selectHighlight.end + element.inserting.length, extraClasses: ['insert'] };
        let title;
        const { metadata } = element.edit.textEdit;
        if (metadata && metadata.description) {
            title = localize('title', "{0} - {1}", metadata.label, metadata.description);
        }
        else if (metadata) {
            title = metadata.label;
        }
        const iconPath = metadata?.iconPath;
        if (!iconPath) {
            this._icon.style.display = 'none';
        }
        else {
            this._icon.style.display = 'block';
            this._icon.style.setProperty('--background-dark', null);
            this._icon.style.setProperty('--background-light', null);
            if (ThemeIcon.isThemeIcon(iconPath)) {
                // css
                const className = ThemeIcon.asClassName(iconPath);
                this._icon.className = className ? `theme-icon ${className}` : '';
                this._icon.style.color = iconPath.color ? this._themeService.getColorTheme().getColor(iconPath.color.id)?.toString() ?? '' : '';
            }
            else if (URI.isUri(iconPath)) {
                // background-image
                this._icon.className = 'uri-icon';
                this._icon.style.setProperty('--background-dark', css.asCSSUrl(iconPath));
                this._icon.style.setProperty('--background-light', css.asCSSUrl(iconPath));
            }
            else {
                // background-image
                this._icon.className = 'uri-icon';
                this._icon.style.setProperty('--background-dark', css.asCSSUrl(iconPath.dark));
                this._icon.style.setProperty('--background-light', css.asCSSUrl(iconPath.light));
            }
        }
        this._label.set(value, [selectHighlight, insertHighlight], title, true);
        this._icon.title = title || '';
    }
};
TextEditElementTemplate = __decorate([
    __param(1, IThemeService)
], TextEditElementTemplate);
let TextEditElementRenderer = class TextEditElementRenderer {
    static { TextEditElementRenderer_1 = this; }
    static { this.id = 'TextEditElementRenderer'; }
    constructor(_themeService) {
        this._themeService = _themeService;
        this.templateId = TextEditElementRenderer_1.id;
    }
    renderTemplate(container) {
        return new TextEditElementTemplate(container, this._themeService);
    }
    renderElement({ element }, _index, template) {
        template.set(element);
    }
    disposeTemplate(template) {
        template.dispose();
    }
};
TextEditElementRenderer = TextEditElementRenderer_1 = __decorate([
    __param(0, IThemeService)
], TextEditElementRenderer);
export { TextEditElementRenderer };
export class BulkEditDelegate {
    getHeight() {
        return 23;
    }
    getTemplateId(element) {
        if (element instanceof FileElement) {
            return FileElementRenderer.id;
        }
        else if (element instanceof TextEditElement) {
            return TextEditElementRenderer.id;
        }
        else {
            return CategoryElementRenderer.id;
        }
    }
}
export class BulkEditNaviLabelProvider {
    getKeyboardNavigationLabel(element) {
        if (element instanceof FileElement) {
            return basename(element.edit.uri);
        }
        else if (element instanceof CategoryElement) {
            return element.category.metadata.label;
        }
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsa0VkaXRUcmVlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnVsa0VkaXQvYnJvd3Nlci9wcmV2aWV3L2J1bGtFZGl0VHJlZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDN0YsT0FBTyxFQUFjLGFBQWEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWxGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBYyxNQUFNLHFFQUFxRSxDQUFDO0FBRW5ILE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBRTFELE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN2RixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDNUUsT0FBTyxFQUFFLGtCQUFrQixFQUF3RSxNQUFNLHNCQUFzQixDQUFDO0FBQ2hJLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRTlFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVD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