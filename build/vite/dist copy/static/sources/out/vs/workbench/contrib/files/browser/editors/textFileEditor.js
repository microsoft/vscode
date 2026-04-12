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
var TextFileEditor_1;
import { localize } from '../../../../../nls.js';
import { mark } from '../../../../../base/common/performance.js';
import { assertReturnsDefined } from '../../../../../base/common/types.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { toAction } from '../../../../../base/common/actions.js';
import { VIEWLET_ID, TEXT_FILE_EDITOR_ID, BINARY_TEXT_FILE_MODE } from '../../common/files.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { AbstractTextCodeEditor } from '../../../../browser/parts/editor/textCodeEditor.js';
import { isTextEditorViewState, DEFAULT_EDITOR_ASSOCIATION, createEditorOpenError, createTooLargeFileError } from '../../../../common/editor.js';
import { applyTextEditorOptions } from '../../../../common/editor/editorOptions.js';
import { BinaryEditorModel } from '../../../../common/editor/binaryEditorModel.js';
import { FileEditorInput } from './fileEditorInput.js';
import { FileOperationError, IFileService, ByteSize, TooLargeFileOperationError } from '../../../../../platform/files/common/files.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IExplorerService } from '../files.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
/**
 * An implementation of editor for file system resources.
 */
let TextFileEditor = class TextFileEditor extends AbstractTextCodeEditor {
    static { TextFileEditor_1 = this; }
    static { this.ID = TEXT_FILE_EDITOR_ID; }
    constructor(group, telemetryService, fileService, paneCompositeService, instantiationService, contextService, storageService, textResourceConfigurationService, editorService, themeService, editorGroupService, textFileService, explorerService, uriIdentityService, pathService, configurationService, preferencesService, hostService, filesConfigurationService) {
        super(TextFileEditor_1.ID, group, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, fileService);
        this.paneCompositeService = paneCompositeService;
        this.contextService = contextService;
        this.textFileService = textFileService;
        this.explorerService = explorerService;
        this.uriIdentityService = uriIdentityService;
        this.pathService = pathService;
        this.configurationService = configurationService;
        this.preferencesService = preferencesService;
        this.hostService = hostService;
        this.filesConfigurationService = filesConfigurationService;
        // Clear view state for deleted files
        this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
        // Move view state for moved files
        this._register(this.fileService.onDidRunOperation(e => this.onDidRunOperation(e)));
    }
    onDidFilesChange(e) {
        for (const resource of e.rawDeleted) {
            this.clearEditorViewState(resource);
        }
    }
    onDidRunOperation(e) {
        if (e.operation === 2 /* FileOperation.MOVE */ && e.target) {
            this.moveEditorViewState(e.resource, e.target.resource, this.uriIdentityService.extUri);
        }
    }
    getTitle() {
        if (this.input) {
            return this.input.getName();
        }
        return localize('textFileEditor', "Text File Editor");
    }
    get input() {
        return this._input;
    }
    async setInput(input, options, context, token) {
        mark('code/willSetInputToTextFileEditor');
        // Set input and resolve
        await super.setInput(input, options, context, token);
        try {
            const resolvedModel = await input.resolve(options);
            // Check for cancellation
            if (token.isCancellationRequested) {
                return;
            }
            // There is a special case where the text editor has to handle binary
            // file editor input: if a binary file has been resolved and cached
            // before, it maybe an actual instance of BinaryEditorModel. In this
            // case our text editor has to open this model using the binary editor.
            // We return early in this case.
            if (resolvedModel instanceof BinaryEditorModel) {
                return this.openAsBinary(input, options);
            }
            const textFileModel = resolvedModel;
            // Editor
            const control = assertReturnsDefined(this.editorControl);
            control.setModel(textFileModel.textEditorModel);
            // Restore view state (unless provided by options)
            if (!isTextEditorViewState(options?.viewState)) {
                const editorViewState = this.loadEditorViewState(input, context);
                if (editorViewState) {
                    if (options?.selection) {
                        editorViewState.cursorState = []; // prevent duplicate selections via options
                    }
                    control.restoreViewState(editorViewState);
                }
            }
            // Apply options to editor if any
            if (options) {
                applyTextEditorOptions(options, control, 1 /* ScrollType.Immediate */);
            }
            // Since the resolved model provides information about being readonly
            // or not, we apply it here to the editor even though the editor input
            // was already asked for being readonly or not. The rationale is that
            // a resolved model might have more specific information about being
            // readonly or not that the input did not have.
            control.updateOptions(this.getReadonlyConfiguration(textFileModel.isReadonly()));
            if (control.handleInitialized) {
                control.handleInitialized();
            }
        }
        catch (error) {
            await this.handleSetInputError(error, input, options);
        }
        mark('code/didSetInputToTextFileEditor');
    }
    async handleSetInputError(error, input, options) {
        // Handle case where content appears to be binary
        if (error.textFileOperationResult === 0 /* TextFileOperationResult.FILE_IS_BINARY */) {
            return this.openAsBinary(input, options);
        }
        // Handle case where we were asked to open a folder
        if (error.fileOperationResult === 0 /* FileOperationResult.FILE_IS_DIRECTORY */) {
            const actions = [];
            actions.push(toAction({
                id: 'workbench.files.action.openFolder', label: localize('openFolder', "Open Folder"), run: async () => {
                    return this.hostService.openWindow([{ folderUri: input.resource }], { forceNewWindow: true });
                }
            }));
            if (this.contextService.isInsideWorkspace(input.preferredResource)) {
                actions.push(toAction({
                    id: 'workbench.files.action.reveal', label: localize('reveal', "Reveal Folder"), run: async () => {
                        await this.paneCompositeService.openPaneComposite(VIEWLET_ID, 0 /* ViewContainerLocation.Sidebar */, true);
                        return this.explorerService.select(input.preferredResource, true);
                    }
                }));
            }
            throw createEditorOpenError(localize('fileIsDirectory', "The file is not displayed in the text editor because it is a directory."), actions, { forceMessage: true });
        }
        // Handle case where a file is too large to open without confirmation
        if (error.fileOperationResult === 7 /* FileOperationResult.FILE_TOO_LARGE */) {
            let message;
            if (error instanceof TooLargeFileOperationError) {
                message = localize('fileTooLargeForHeapErrorWithSize', "The file is not displayed in the text editor because it is very large ({0}).", ByteSize.formatSize(error.size));
            }
            else {
                message = localize('fileTooLargeForHeapErrorWithoutSize', "The file is not displayed in the text editor because it is very large.");
            }
            throw createTooLargeFileError(this.group, input, options, message, this.preferencesService);
        }
        // Offer to create a file from the error if we have a file not found and the name is valid and not readonly
        if (error.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */ &&
            !this.filesConfigurationService.isReadonly(input.preferredResource) &&
            await this.pathService.hasValidBasename(input.preferredResource)) {
            const fileNotFoundError = createEditorOpenError(new FileOperationError(localize('unavailableResourceErrorEditorText', "The editor could not be opened because the file was not found."), 1 /* FileOperationResult.FILE_NOT_FOUND */), [
                toAction({
                    id: 'workbench.files.action.createMissingFile', label: localize('createFile', "Create File"), run: async () => {
                        await this.textFileService.create([{ resource: input.preferredResource }]);
                        return this.editorService.openEditor({
                            resource: input.preferredResource,
                            options: {
                                pinned: true // new file gets pinned by default
                            }
                        });
                    }
                })
            ], {
                // Support the flow of directly pressing `Enter` on the dialog to
                // create the file on the go. This is nice when for example following
                // a link to a file that does not exist to scaffold it quickly.
                allowDialog: true
            });
            throw fileNotFoundError;
        }
        // Otherwise make sure the error bubbles up
        throw error;
    }
    openAsBinary(input, options) {
        const defaultBinaryEditor = this.configurationService.getValue('workbench.editor.defaultBinaryEditor');
        const editorOptions = {
            ...options,
            // Make sure to not steal away the currently active group
            // because we are triggering another openEditor() call
            // and do not control the initial intent that resulted
            // in us now opening as binary.
            activation: EditorActivation.PRESERVE
        };
        // Check configuration and determine whether we open the binary
        // file input in a different editor or going through the same
        // editor.
        // Going through the same editor is debt, and a better solution
        // would be to introduce a real editor for the binary case
        // and avoid enforcing binary or text on the file editor input.
        if (defaultBinaryEditor && defaultBinaryEditor !== '' && defaultBinaryEditor !== DEFAULT_EDITOR_ASSOCIATION.id) {
            this.doOpenAsBinaryInDifferentEditor(this.group, defaultBinaryEditor, input, editorOptions);
        }
        else {
            this.doOpenAsBinaryInSameEditor(this.group, defaultBinaryEditor, input, editorOptions);
        }
    }
    doOpenAsBinaryInDifferentEditor(group, editorId, editor, editorOptions) {
        this.editorService.replaceEditors([{
                editor,
                replacement: { resource: editor.resource, options: { ...editorOptions, override: editorId } }
            }], group);
    }
    doOpenAsBinaryInSameEditor(group, editorId, editor, editorOptions) {
        // Open binary as text
        if (editorId === DEFAULT_EDITOR_ASSOCIATION.id) {
            editor.setForceOpenAsText();
            editor.setPreferredLanguageId(BINARY_TEXT_FILE_MODE); // https://github.com/microsoft/vscode/issues/131076
            editorOptions = { ...editorOptions, forceReload: true }; // Same pane and same input, must force reload to clear cached state
        }
        // Open as binary
        else {
            editor.setForceOpenAsBinary();
        }
        group.openEditor(editor, editorOptions);
    }
    clearInput() {
        super.clearInput();
        // Clear Model
        this.editorControl?.setModel(null);
    }
    createEditorControl(parent, initialOptions) {
        mark('code/willCreateTextFileEditorControl');
        super.createEditorControl(parent, initialOptions);
        mark('code/didCreateTextFileEditorControl');
    }
    tracksEditorViewState(input) {
        return input instanceof FileEditorInput;
    }
    tracksDisposedEditorViewState() {
        return true; // track view state even for disposed editors
    }
};
TextFileEditor = TextFileEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IFileService),
    __param(3, IPaneCompositePartService),
    __param(4, IInstantiationService),
    __param(5, IWorkspaceContextService),
    __param(6, IStorageService),
    __param(7, ITextResourceConfigurationService),
    __param(8, IEditorService),
    __param(9, IThemeService),
    __param(10, IEditorGroupsService),
    __param(11, ITextFileService),
    __param(12, IExplorerService),
    __param(13, IUriIdentityService),
    __param(14, IPathService),
    __param(15, IConfigurationService),
    __param(16, IPreferencesService),
    __param(17, IHostService),
    __param(18, IFilesConfigurationService)
], TextFileEditor);
export { TextFileEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEZpbGVFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9maWxlcy9icm93c2VyL2VkaXRvcnMvdGV4dEZpbGVFZGl0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDakUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQy9FLE9BQU8sRUFBVyxRQUFRLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsVUFBVSxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDL0YsT0FBTyxFQUFFLGdCQUFnQixFQUFtRCxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RJLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzVGLE9BQU8sRUFBc0IscUJBQXFCLEVBQUUsMEJBQTBCLEVBQUUscUJBQXFCLEVBQTJCLHVCQUF1QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFOUwsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDcEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbkYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxrQkFBa0IsRUFBeUMsWUFBWSxFQUFxQyxRQUFRLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNqTixPQUFPLEVB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