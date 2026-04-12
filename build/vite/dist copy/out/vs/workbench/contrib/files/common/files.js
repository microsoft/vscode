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
var TextFileContentProvider_1;
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { InputFocusedContextKey } from '../../../../platform/contextkey/common/contextkeys.js';
import { Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
/**
 * Explorer viewlet id.
 */
export const VIEWLET_ID = 'workbench.view.explorer';
/**
 * Explorer file view id.
 */
export const VIEW_ID = 'workbench.explorer.fileView';
/**
 * Context Keys to use with keybindings for the Explorer and Open Editors view
 */
export const ExplorerViewletVisibleContext = new RawContextKey('explorerViewletVisible', true, { type: 'boolean', description: localize('explorerViewletVisible', "True when the EXPLORER viewlet is visible.") });
export const FoldersViewVisibleContext = new RawContextKey('foldersViewVisible', true, { type: 'boolean', description: localize('foldersViewVisible', "True when the FOLDERS view (the file tree within the explorer view container) is visible.") });
export const ExplorerFolderContext = new RawContextKey('explorerResourceIsFolder', false, { type: 'boolean', description: localize('explorerResourceIsFolder', "True when the focused item in the EXPLORER is a folder.") });
export const ExplorerResourceReadonlyContext = new RawContextKey('explorerResourceReadonly', false, { type: 'boolean', description: localize('explorerResourceReadonly', "True when the focused item in the EXPLORER is read-only.") });
export const ExplorerResourceWritableContext = ExplorerResourceReadonlyContext.toNegated();
export const ExplorerResourceParentReadOnlyContext = new RawContextKey('explorerResourceParentReadonly', false, { type: 'boolean', description: localize('explorerResourceParentReadonly', "True when the focused item in the EXPLORER's parent is read-only.") });
/**
 * Comma separated list of editor ids that can be used for the selected explorer resource.
 */
export const ExplorerResourceAvailableEditorIdsContext = new RawContextKey('explorerResourceAvailableEditorIds', '');
export const ExplorerRootContext = new RawContextKey('explorerResourceIsRoot', false, { type: 'boolean', description: localize('explorerResourceIsRoot', "True when the focused item in the EXPLORER is a root folder.") });
export const ExplorerResourceCut = new RawContextKey('explorerResourceCut', false, { type: 'boolean', description: localize('explorerResourceCut', "True when an item in the EXPLORER has been cut for cut and paste.") });
export const ExplorerResourceMoveableToTrash = new RawContextKey('explorerResourceMoveableToTrash', false, { type: 'boolean', description: localize('explorerResourceMoveableToTrash', "True when the focused item in the EXPLORER can be moved to trash.") });
export const FilesExplorerFocusedContext = new RawContextKey('filesExplorerFocus', true, { type: 'boolean', description: localize('filesExplorerFocus', "True when the focus is inside the EXPLORER view.") });
export const OpenEditorsFocusedContext = new RawContextKey('openEditorsFocus', true, { type: 'boolean', description: localize('openEditorsFocus', "True when the focus is inside the OPEN EDITORS view.") });
export const ExplorerFocusedContext = new RawContextKey('explorerViewletFocus', true, { type: 'boolean', description: localize('explorerViewletFocus', "True when the focus is inside the EXPLORER viewlet.") });
export const ExplorerFindProviderActive = new RawContextKey('explorerFindProviderActive', false, { type: 'boolean', description: localize('explorerFindProviderActive', "True when the explorer tree is using the explorer find provider.") });
// compressed nodes
export const ExplorerCompressedFocusContext = new RawContextKey('explorerViewletCompressedFocus', true, { type: 'boolean', description: localize('explorerViewletCompressedFocus', "True when the focused item in the EXPLORER view is a compact item.") });
export const ExplorerCompressedFirstFocusContext = new RawContextKey('explorerViewletCompressedFirstFocus', true, { type: 'boolean', description: localize('explorerViewletCompressedFirstFocus', "True when the focus is inside a compact item's first part in the EXPLORER view.") });
export const ExplorerCompressedLastFocusContext = new RawContextKey('explorerViewletCompressedLastFocus', true, { type: 'boolean', description: localize('explorerViewletCompressedLastFocus', "True when the focus is inside a compact item's last part in the EXPLORER view.") });
export const ViewHasSomeCollapsibleRootItemContext = new RawContextKey('viewHasSomeCollapsibleItem', false, { type: 'boolean', description: localize('viewHasSomeCollapsibleItem', "True when a workspace in the EXPLORER view has some collapsible root child.") });
export const FilesExplorerFocusCondition = ContextKeyExpr.and(FoldersViewVisibleContext, FilesExplorerFocusedContext, ContextKeyExpr.not(InputFocusedContextKey));
export const ExplorerFocusCondition = ContextKeyExpr.and(FoldersViewVisibleContext, ExplorerFocusedContext, ContextKeyExpr.not(InputFocusedContextKey));
/**
 * Text file editor id.
 */
export const TEXT_FILE_EDITOR_ID = 'workbench.editors.files.textFileEditor';
/**
 * File editor input id.
 */
export const FILE_EDITOR_INPUT_ID = 'workbench.editors.files.fileEditorInput';
/**
 * Binary file editor id.
 */
export const BINARY_FILE_EDITOR_ID = 'workbench.editors.files.binaryFileEditor';
/**
 * Language identifier for binary files opened as text.
 */
export const BINARY_TEXT_FILE_MODE = 'code-text-binary';
export var SortOrder;
(function (SortOrder) {
    SortOrder["Default"] = "default";
    SortOrder["Mixed"] = "mixed";
    SortOrder["FilesFirst"] = "filesFirst";
    SortOrder["Type"] = "type";
    SortOrder["Modified"] = "modified";
    SortOrder["FoldersNestsFiles"] = "foldersNestsFiles";
})(SortOrder || (SortOrder = {}));
export var UndoConfirmLevel;
(function (UndoConfirmLevel) {
    UndoConfirmLevel["Verbose"] = "verbose";
    UndoConfirmLevel["Default"] = "default";
    UndoConfirmLevel["Light"] = "light";
})(UndoConfirmLevel || (UndoConfirmLevel = {}));
export var LexicographicOptions;
(function (LexicographicOptions) {
    LexicographicOptions["Default"] = "default";
    LexicographicOptions["Upper"] = "upper";
    LexicographicOptions["Lower"] = "lower";
    LexicographicOptions["Unicode"] = "unicode";
})(LexicographicOptions || (LexicographicOptions = {}));
let TextFileContentProvider = TextFileContentProvider_1 = class TextFileContentProvider extends Disposable {
    constructor(textFileService, fileService, languageService, modelService) {
        super();
        this.textFileService = textFileService;
        this.fileService = fileService;
        this.languageService = languageService;
        this.modelService = modelService;
        this.fileWatcherDisposable = this._register(new MutableDisposable());
    }
    static async open(resource, scheme, label, editorService, options) {
        await editorService.openEditor({
            original: { resource: TextFileContentProvider_1.resourceToTextFile(scheme, resource) },
            modified: { resource },
            label,
            options
        });
    }
    static resourceToTextFile(scheme, resource) {
        return resource.with({ scheme, query: JSON.stringify({ scheme: resource.scheme, query: resource.query }) });
    }
    static textFileToResource(resource) {
        const { scheme, query } = JSON.parse(resource.query);
        return resource.with({ scheme, query });
    }
    async provideTextContent(resource) {
        if (!resource.query) {
            // We require the URI to use the `query` to transport the original scheme and query
            // as done by `resourceToTextFile`
            return null;
        }
        const savedFileResource = TextFileContentProvider_1.textFileToResource(resource);
        // Make sure our text file is resolved up to date
        const codeEditorModel = await this.resolveEditorModel(resource);
        // Make sure to keep contents up to date when it changes
        if (!this.fileWatcherDisposable.value) {
            const disposables = new DisposableStore();
            this.fileWatcherDisposable.value = disposables;
            disposables.add(this.fileService.onDidFilesChange(changes => {
                if (changes.contains(savedFileResource, 0 /* FileChangeType.UPDATED */)) {
                    this.resolveEditorModel(resource, false /* do not create if missing */); // update model when resource changes
                }
            }));
            if (codeEditorModel) {
                disposables.add(Event.once(codeEditorModel.onWillDispose)(() => this.fileWatcherDisposable.clear()));
            }
        }
        return codeEditorModel;
    }
    async resolveEditorModel(resource, createAsNeeded = true) {
        const savedFileResource = TextFileContentProvider_1.textFileToResource(resource);
        const content = await this.textFileService.readStream(savedFileResource);
        let codeEditorModel = this.modelService.getModel(resource);
        if (codeEditorModel) {
            this.modelService.updateModel(codeEditorModel, content.value);
        }
        else if (createAsNeeded) {
            const textFileModel = this.modelService.getModel(savedFileResource);
            let languageSelector;
            if (textFileModel) {
                languageSelector = this.languageService.createById(textFileModel.getLanguageId());
            }
            else {
                languageSelector = this.languageService.createByFilepathOrFirstLine(savedFileResource);
            }
            codeEditorModel = this.modelService.createModel(content.value, languageSelector, resource);
        }
        return codeEditorModel;
    }
};
TextFileContentProvider = TextFileContentProvider_1 = __decorate([
    __param(0, ITextFileService),
    __param(1, IFileService),
    __param(2, ILanguageService),
    __param(3, IModelService)
], TextFileContentProvider);
export { TextFileContentProvider };
export class OpenEditor {
    static { this.COUNTER = 0; }
    constructor(_editor, _group) {
        this._editor = _editor;
        this._group = _group;
        this.id = OpenEditor.COUNTER++;
    }
    get editor() {
        return this._editor;
    }
    get group() {
        return this._group;
    }
    get groupId() {
        return this._group.id;
    }
    getId() {
        return `openeditor:${this.groupId}:${this.id}`;
    }
    isPreview() {
        return !this._group.isPinned(this.editor);
    }
    isSticky() {
        return this._group.isSticky(this.editor);
    }
    getResource() {
        return EditorResourceAccessor.getOriginalUri(this.editor, { supportSideBySide: SideBySideEditor.PRIMARY });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9maWxlcy9jb21tb24vZmlsZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBSWhHLE9BQU8sRUFBb0Qsc0JBQXNCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUV2SSxPQUFPLEVBQXNFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzlJLE9BQU8sRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFckcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV0RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGdCQUFnQixFQUFzQixNQUFNLGlEQUFpRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRS9GLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUd6RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFHOUM7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxVQUFVLEdBQUcseUJBQXlCLENBQUM7QUFFcEQ7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxPQUFPLEdBQUcsNkJBQTZCLENBQUM7QUFFckQ7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSw2QkFBNkIsR0FBRyxJQUFJLGFBQWEsQ0FBVSx3QkFBd0IsRUFBRSxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxR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