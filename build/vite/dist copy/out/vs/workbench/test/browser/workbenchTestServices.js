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
import { mainWindow } from '../../../base/browser/window.js';
import { timeout } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { isValidBasename } from '../../../base/common/extpath.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { observableValue } from '../../../base/common/observable.js';
import { posix, win32 } from '../../../base/common/path.js';
import { isWindows } from '../../../base/common/platform.js';
import { env } from '../../../base/common/process.js';
import { basename, isEqual } from '../../../base/common/resources.js';
import { newWriteableStream } from '../../../base/common/stream.js';
import { assertReturnsDefined, upcast } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { ICodeEditorService } from '../../../editor/browser/services/codeEditorService.js';
import { Position as EditorPosition } from '../../../editor/common/core/position.js';
import { Range } from '../../../editor/common/core/range.js';
import { Selection } from '../../../editor/common/core/selection.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { ILanguageConfigurationService } from '../../../editor/common/languages/languageConfigurationRegistry.js';
import { createTextBufferFactoryFromStream } from '../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../editor/common/services/editorWorker.js';
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from '../../../editor/common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../editor/common/services/languageFeaturesService.js';
import { LanguageService } from '../../../editor/common/services/languageService.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ModelService } from '../../../editor/common/services/modelService.js';
import { ITextModelService } from '../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from '../../../editor/common/services/textResourceConfiguration.js';
import { ITreeSitterLibraryService } from '../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TestCodeEditor } from '../../../editor/test/browser/testCodeEditor.js';
import { TestLanguageConfigurationService } from '../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { TestEditorWorkerService } from '../../../editor/test/common/services/testEditorWorkerService.js';
import { TestTreeSitterLibraryService } from '../../../editor/test/common/services/testTreeSitterLibraryService.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IAccessibilitySignalService } from '../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService } from '../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../platform/defaultAccount/common/defaultAccount.js';
import { ContextMenuService } from '../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService, IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../platform/contextview/browser/contextViewService.js';
import { IDialogService, IFileDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../platform/dialogs/test/common/testDialogService.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { FileService } from '../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../platform/hover/test/browser/nullHoverService.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { IListService } from '../../../platform/list/browser/listService.js';
import { ILoggerService, ILogService, NullLogService } from '../../../platform/log/common/log.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../platform/markdown/browser/markdownRenderer.js';
import { IMarkerService } from '../../../platform/markers/common/markers.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../platform/notification/test/common/testNotificationService.js';
import product from '../../../platform/product/common/product.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { IProgressService, Progress } from '../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { IRemoteSocketFactoryService, RemoteSocketFactoryService } from '../../../platform/remote/common/remoteSocketFactoryService.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../platform/telemetry/common/telemetryUtils.js';
import { ITerminalLogService } from '../../../platform/terminal/common/terminal.js';
import { TerminalLogService } from '../../../platform/terminal/common/terminalLogService.js';
import { ColorScheme } from '../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { IUndoRedoService } from '../../../platform/undoRedo/common/undoRedo.js';
import { UndoRedoService } from '../../../platform/undoRedo/common/undoRedoService.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../platform/uriIdentity/common/uriIdentityService.js';
import { IUserDataProfilesService, UserDataProfilesService } from '../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../platform/workspace/common/workspaceTrust.js';
import { TestWorkspace } from '../../../platform/workspace/test/common/testWorkspace.js';
import { IWorkspacesService } from '../../../platform/workspaces/common/workspaces.js';
import { EditorPaneDescriptor } from '../../browser/editor.js';
import { Extensions as PaneCompositeExtensions } from '../../browser/panecomposite.js';
import { DEFAULT_EDITOR_PART_OPTIONS } from '../../browser/parts/editor/editor.js';
import { EditorPane } from '../../browser/parts/editor/editorPane.js';
import { MainEditorPart } from '../../browser/parts/editor/editorPart.js';
import { EditorParts } from '../../browser/parts/editor/editorParts.js';
import { SideBySideEditor } from '../../browser/parts/editor/sideBySideEditor.js';
import { TextEditorPaneSelection } from '../../browser/parts/editor/textEditor.js';
import { TextResourceEditor } from '../../browser/parts/editor/textResourceEditor.js';
import { EditorExtensions, EditorExtensions as Extensions } from '../../common/editor.js';
import { EditorInput } from '../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../common/editor/sideBySideEditorInput.js';
import { TextResourceEditorInput } from '../../common/editor/textResourceEditorInput.js';
import { IChatWidgetService } from '../../contrib/chat/browser/chat.js';
import { FileEditorInput } from '../../contrib/files/browser/editors/fileEditorInput.js';
import { TextFileEditor } from '../../contrib/files/browser/editors/textFileEditor.js';
import { FILE_EDITOR_INPUT_ID } from '../../contrib/files/common/files.js';
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService } from '../../contrib/terminal/browser/terminal.js';
import { TerminalConfigurationService } from '../../contrib/terminal/browser/terminalConfigurationService.js';
import { IEnvironmentVariableService } from '../../contrib/terminal/common/environmentVariable.js';
import { EnvironmentVariableService } from '../../contrib/terminal/common/environmentVariableService.js';
import { ITerminalProfileResolverService, ITerminalProfileService } from '../../contrib/terminal/common/terminal.js';
import { IChatEntitlementService } from '../../services/chat/common/chatEntitlementService.js';
import { IDecorationsService } from '../../services/decorations/common/decorations.js';
import { CodeEditorService } from '../../services/editor/browser/codeEditorService.js';
import { EditorPaneService } from '../../services/editor/browser/editorPaneService.js';
import { EditorResolverService } from '../../services/editor/browser/editorResolverService.js';
import { CustomEditorLabelService, ICustomEditorLabelService } from '../../services/editor/common/customEditorLabelService.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IEditorPaneService } from '../../services/editor/common/editorPaneService.js';
import { IEditorResolverService } from '../../services/editor/common/editorResolverService.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { BrowserWorkbenchEnvironmentService } from '../../services/environment/browser/environmentService.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { BrowserElevatedFileService } from '../../services/files/browser/elevatedFileService.js';
import { IElevatedFileService } from '../../services/files/common/elevatedFileService.js';
import { FilesConfigurationService, IFilesConfigurationService } from '../../services/filesConfiguration/common/filesConfigurationService.js';
import { IHistoryService } from '../../services/history/common/history.js';
import { IHostService } from '../../services/host/browser/host.js';
import { LabelService } from '../../services/label/common/labelService.js';
import { ILanguageDetectionService } from '../../services/languageDetection/common/languageDetectionWorkerService.js';
import { IWorkbenchLayoutService } from '../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../services/lifecycle/common/lifecycle.js';
import { IPaneCompositePartService } from '../../services/panecomposite/browser/panecomposite.js';
import { IPathService } from '../../services/path/common/pathService.js';
import { QuickInputService } from '../../services/quickinput/browser/quickInputService.js';
import { IRemoteAgentService } from '../../services/remote/common/remoteAgentService.js';
import { BrowserTextFileService } from '../../services/textfile/browser/browserTextFileService.js';
import { EncodingOracle } from '../../services/textfile/browser/textFileService.js';
import { UTF16be, UTF16le, UTF8_with_bom } from '../../services/textfile/common/encoding.js';
import { ITextEditorService, TextEditorService } from '../../services/textfile/common/textEditorService.js';
import { TextFileEditorModel } from '../../services/textfile/common/textFileEditorModel.js';
import { ITextFileService } from '../../services/textfile/common/textfiles.js';
import { TextModelResolverService } from '../../services/textmodelResolver/common/textModelResolverService.js';
import { UntitledTextEditorInput } from '../../services/untitled/common/untitledTextEditorInput.js';
import { IUntitledTextEditorService, UntitledTextEditorService } from '../../services/untitled/common/untitledTextEditorService.js';
import { IUserDataProfileService } from '../../services/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../services/userDataProfile/common/userDataProfileService.js';
import { BrowserWorkingCopyBackupService } from '../../services/workingCopy/browser/workingCopyBackupService.js';
import { IWorkingCopyBackupService } from '../../services/workingCopy/common/workingCopyBackup.js';
import { InMemoryWorkingCopyBackupService } from '../../services/workingCopy/common/workingCopyBackupService.js';
import { IWorkingCopyEditorService, WorkingCopyEditorService } from '../../services/workingCopy/common/workingCopyEditorService.js';
import { IWorkingCopyFileService, WorkingCopyFileService } from '../../services/workingCopy/common/workingCopyFileService.js';
import { IWorkingCopyService, WorkingCopyService } from '../../services/workingCopy/common/workingCopyService.js';
import { TestChatEntitlementService, TestContextService, TestExtensionService, TestFileService, TestHistoryService, TestLifecycleService, TestLoggerService, TestMarkerService, TestProductService, TestStorageService, TestTextResourcePropertiesService, TestWorkspaceTrustManagementService, TestWorkspaceTrustRequestService } from '../common/workbenchTestServices.js';
import { DefaultAccountService } from '../../services/accounts/browser/defaultAccount.js';
// Backcompat export
export { TestFileService, TestLifecycleService };
export function createFileEditorInput(instantiationService, resource) {
    return instantiationService.createInstance(FileEditorInput, resource, undefined, undefined, undefined, undefined, undefined, undefined);
}
Registry.as(EditorExtensions.EditorFactory).registerFileEditorFactory({
    typeId: FILE_EDITOR_INPUT_ID,
    createFileEditor: (resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents, instantiationService) => {
        return instantiationService.createInstance(FileEditorInput, resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents);
    },
    isFileEditor: (obj) => {
        return obj instanceof FileEditorInput;
    }
});
export class TestTextResourceEditor extends TextResourceEditor {
    createEditorControl(parent, configuration) {
        this.editorControl = this._register(this.instantiationService.createInstance(TestCodeEditor, parent, configuration, {}));
    }
}
export class TestTextFileEditor extends TextFileEditor {
    createEditorControl(parent, configuration) {
        this.editorControl = this._register(this.instantiationService.createInstance(TestCodeEditor, parent, configuration, { contributions: [] }));
    }
    setSelection(selection, reason) {
        this._options = selection ? upcast({ selection }) : undefined;
        this._onDidChangeSelection.fire({ reason });
    }
    getSelection() {
        const options = this.options;
        if (!options) {
            return undefined;
        }
        const textSelection = options.selection;
        if (!textSelection) {
            return undefined;
        }
        return new TextEditorPaneSelection(new Selection(textSelection.startLineNumber, textSelection.startColumn, textSelection.endLineNumber ?? textSelection.startLineNumber, textSelection.endColumn ?? textSelection.startColumn));
    }
}
export class TestWorkingCopyService extends WorkingCopyService {
    testUnregisterWorkingCopy(workingCopy) {
        return super.unregisterWorkingCopy(workingCopy);
    }
}
export function workbenchInstantiationService(overrides, disposables = new DisposableStore()) {
    const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection([ILifecycleService, disposables.add(new TestLifecycleService())], [IActionViewItemService, new SyncDescriptor(NullActionViewItemService)])));
    instantiationService.stub(IProductService, TestProductService);
    instantiationService.stub(IEditorWorkerService, new TestEditorWorkerService());
    instantiationService.stub(IWorkingCopyService, disposables.add(new TestWorkingCopyService()));
    const environmentService = overrides?.environmentService ? overrides.environmentService(instantiationService) : TestEnvironmentService;
    instantiationService.stub(IEnvironmentService, environmentService);
    instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
    instantiationService.stub(ILogService, new NullLogService());
    const contextKeyService = overrides?.contextKeyService ? overrides.contextKeyService(instantiationService) : instantiationService.createInstance(MockContextKeyService);
    instantiationService.stub(IContextKeyService, contextKeyService);
    instantiationService.stub(IProgressService, new TestProgressService());
    const workspaceContextService = new TestContextService(TestWorkspace);
    instantiationService.stub(IWorkspaceContextService, workspaceContextService);
    const configService = overrides?.configurationService ? overrides.configurationService(instantiationService) : new TestConfigurationService({
        files: {
            participants: {
                timeout: 60000
            }
        }
    });
    instantiationService.stub(IConfigurationService, configService);
    const textResourceConfigurationService = new TestTextResourceConfigurationService(configService);
    instantiationService.stub(ITextResourceConfigurationService, textResourceConfigurationService);
    instantiationService.stub(IUntitledTextEditorService, disposables.add(instantiationService.createInstance(UntitledTextEditorService)));
    instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
    instantiationService.stub(IRemoteAgentService, new TestRemoteAgentService());
    instantiationService.stub(ILanguageDetectionService, new TestLanguageDetectionService());
    instantiationService.stub(IPathService, overrides?.pathService ? overrides.pathService(instantiationService) : new TestPathService());
    const layoutService = new TestLayoutService();
    instantiationService.stub(IWorkbenchLayoutService, layoutService);
    instantiationService.stub(IDialogService, new TestDialogService());
    const accessibilityService = new TestAccessibilityService();
    instantiationService.stub(IAccessibilityService, accessibilityService);
    // eslint-disable-next-line local/code-no-any-casts
    instantiationService.stub(IAccessibilitySignalService, {
        playSignal: async () => { },
        isSoundEnabled(signal) { return false; },
    });
    instantiationService.stub(IFileDialogService, instantiationService.createInstance(TestFileDialogService));
    instantiationService.stub(ILanguageService, disposables.add(instantiationService.createInstance(LanguageService)));
    instantiationService.stub(ILanguageFeaturesService, new LanguageFeaturesService());
    instantiationService.stub(ILanguageFeatureDebounceService, instantiationService.createInstance(LanguageFeatureDebounceService));
    instantiationService.stub(IHistoryService, new TestHistoryService());
    instantiationService.stub(ITextResourcePropertiesService, new TestTextResourcePropertiesService(configService));
    instantiationService.stub(IUndoRedoService, instantiationService.createInstance(UndoRedoService));
    const themeService = new TestThemeService();
    instantiationService.stub(IThemeService, themeService);
    instantiationService.stub(ILanguageConfigurationService, disposables.add(new TestLanguageConfigurationService()));
    instantiationService.stub(ITreeSitterLibraryService, new TestTreeSitterLibraryService());
    instantiationService.stub(IModelService, disposables.add(instantiationService.createInstance(ModelService)));
    const fileService = overrides?.fileService ? overrides.fileService(instantiationService) : disposables.add(new TestFileService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
    const markerService = new TestMarkerService();
    instantiationService.stub(IMarkerService, markerService);
    instantiationService.stub(IFilesConfigurationService, disposables.add(instantiationService.createInstance(TestFilesConfigurationService)));
    const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(instantiationService.createInstance(UserDataProfilesService)));
    instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)));
    instantiationService.stub(IWorkingCopyBackupService, overrides?.workingCopyBackupService ? overrides?.workingCopyBackupService(instantiationService) : disposables.add(new TestWorkingCopyBackupService()));
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(INotificationService, new TestNotificationService());
    instantiationService.stub(IUntitledTextEditorService, disposables.add(instantiationService.createInstance(UntitledTextEditorService)));
    instantiationService.stub(IMenuService, new TestMenuService());
    const keybindingService = new MockKeybindingService();
    instantiationService.stub(IKeybindingService, keybindingService);
    instantiationService.stub(IDecorationsService, new TestDecorationsService());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IWorkingCopyFileService, disposables.add(instantiationService.createInstance(WorkingCopyFileService)));
    instantiationService.stub(ITextFileService, overrides?.textFileService ? overrides.textFileService(instantiationService) : disposables.add(instantiationService.createInstance(TestTextFileService)));
    instantiationService.stub(IHostService, instantiationService.createInstance(TestHostService));
    instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
    instantiationService.stub(ILoggerService, disposables.add(new TestLoggerService(TestEnvironmentService.logsHome)));
    const editorGroupService = new TestEditorGroupsService([new TestEditorGroupView(0)]);
    instantiationService.stub(IEditorGroupsService, editorGroupService);
    instantiationService.stub(ILabelService, disposables.add(instantiationService.createInstance(LabelService)));
    const editorService = overrides?.editorService ? overrides.editorService(instantiationService) : disposables.add(new TestEditorService(editorGroupService));
    instantiationService.stub(IEditorService, editorService);
    instantiationService.stub(IEditorPaneService, new EditorPaneService());
    instantiationService.stub(IWorkingCopyEditorService, disposables.add(instantiationService.createInstance(WorkingCopyEditorService)));
    instantiationService.stub(IEditorResolverService, disposables.add(instantiationService.createInstance(EditorResolverService)));
    const textEditorService = overrides?.textEditorService ? overrides.textEditorService(instantiationService) : disposables.add(instantiationService.createInstance(TextEditorService));
    instantiationService.stub(ITextEditorService, textEditorService);
    instantiationService.stub(ICodeEditorService, disposables.add(new CodeEditorService(editorService, themeService, configService)));
    instantiationService.stub(IPaneCompositePartService, disposables.add(new TestPaneCompositeService()));
    instantiationService.stub(IListService, new TestListService());
    instantiationService.stub(IContextViewService, disposables.add(instantiationService.createInstance(ContextViewService)));
    instantiationService.stub(IContextMenuService, disposables.add(instantiationService.createInstance(ContextMenuService)));
    instantiationService.stub(IQuickInputService, disposables.add(new QuickInputService(configService, instantiationService, keybindingService, contextKeyService, themeService, layoutService)));
    instantiationService.stub(IWorkspacesService, new TestWorkspacesService());
    instantiationService.stub(IWorkspaceTrustManagementService, disposables.add(new TestWorkspaceTrustManagementService()));
    instantiationService.stub(IWorkspaceTrustRequestService, disposables.add(new TestWorkspaceTrustRequestService(false)));
    instantiationService.stub(ITerminalInstanceService, new TestTerminalInstanceService());
    instantiationService.stub(ITerminalEditorService, new TestTerminalEditorService());
    instantiationService.stub(ITerminalGroupService, new TestTerminalGroupService());
    instantiationService.stub(ITerminalProfileService, new TestTerminalProfileService());
    instantiationService.stub(ITerminalProfileResolverService, new TestTerminalProfileResolverService());
    instantiationService.stub(ITerminalConfigurationService, disposables.add(instantiationService.createInstance(TestTerminalConfigurationService)));
    instantiationService.stub(ITerminalLogService, disposables.add(instantiationService.createInstance(TerminalLogService)));
    instantiationService.stub(IEnvironmentVariableService, disposables.add(instantiationService.createInstance(EnvironmentVariableService)));
    instantiationService.stub(IElevatedFileService, new BrowserElevatedFileService());
    instantiationService.stub(IRemoteSocketFactoryService, new RemoteSocketFactoryService());
    instantiationService.stub(ICustomEditorLabelService, disposables.add(new CustomEditorLabelService(configService, workspaceContextService)));
    instantiationService.stub(IHoverService, NullHoverService);
    instantiationService.stub(IChatEntitlementService, new TestChatEntitlementService());
    instantiationService.stub(IMarkdownRendererService, instantiationService.createInstance(MarkdownRendererService));
    instantiationService.stub(IChatWidgetService, instantiationService.createInstance(TestChatWidgetService));
    instantiationService.stub(IDefaultAccountService, DefaultAccountService);
    return instantiationService;
}
let TestServiceAccessor = class TestServiceAccessor {
    constructor(lifecycleService, textFileService, textEditorService, workingCopyFileService, filesConfigurationService, contextService, modelService, fileService, fileDialogService, dialogService, workingCopyService, editorService, editorPaneService, environmentService, pathService, editorGroupService, editorResolverService, languageService, textModelResolverService, untitledTextEditorService, testConfigurationService, workingCopyBackupService, hostService, quickInputService, labelService, logService, uriIdentityService, instantitionService, notificationService, workingCopyEditorService, instantiationService, elevatedFileService, workspaceTrustRequestService, decorationsService, progressService) {
        this.lifecycleService = lifecycleService;
        this.textFileService = textFileService;
        this.textEditorService = textEditorService;
        this.workingCopyFileService = workingCopyFileService;
        this.filesConfigurationService = filesConfigurationService;
        this.contextService = contextService;
        this.modelService = modelService;
        this.fileService = fileService;
        this.fileDialogService = fileDialogService;
        this.dialogService = dialogService;
        this.workingCopyService = workingCopyService;
        this.editorService = editorService;
        this.editorPaneService = editorPaneService;
        this.environmentService = environmentService;
        this.pathService = pathService;
        this.editorGroupService = editorGroupService;
        this.editorResolverService = editorResolverService;
        this.languageService = languageService;
        this.textModelResolverService = textModelResolverService;
        this.untitledTextEditorService = untitledTextEditorService;
        this.testConfigurationService = testConfigurationService;
        this.workingCopyBackupService = workingCopyBackupService;
        this.hostService = hostService;
        this.quickInputService = quickInputService;
        this.labelService = labelService;
        this.logService = logService;
        this.uriIdentityService = uriIdentityService;
        this.instantitionService = instantitionService;
        this.notificationService = notificationService;
        this.workingCopyEditorService = workingCopyEditorService;
        this.instantiationService = instantiationService;
        this.elevatedFileService = elevatedFileService;
        this.workspaceTrustRequestService = workspaceTrustRequestService;
        this.decorationsService = decorationsService;
        this.progressService = progressService;
    }
};
TestServiceAccessor = __decorate([
    __param(0, ILifecycleService),
    __param(1, ITextFileService),
    __param(2, ITextEditorService),
    __param(3, IWorkingCopyFileService),
    __param(4, IFilesConfigurationService),
    __param(5, IWorkspaceContextService),
    __param(6, IModelService),
    __param(7, IFileService),
    __param(8, IFileDialogService),
    __param(9, IDialogService),
    __param(10, IWorkingCopyService),
    __param(11, IEditorService),
    __param(12, IEditorPaneService),
    __param(13, IWorkbenchEnvironmentService),
    __param(14, IPathService),
    __param(15, IEditorGroupsService),
    __param(16, IEditorResolverService),
    __param(17, ILanguageService),
    __param(18, ITextModelService),
    __param(19, IUntitledTextEditorService),
    __param(20, IConfigurationService),
    __param(21, IWorkingCopyBackupService),
    __param(22, IHostService),
    __param(23, IQuickInputService),
    __param(24, ILabelService),
    __param(25, ILogService),
    __param(26, IUriIdentityService),
    __param(27, IInstantiationService),
    __param(28, INotificationService),
    __param(29, IWorkingCopyEditorService),
    __param(30, IInstantiationService),
    __param(31, IElevatedFileService),
    __param(32, IWorkspaceTrustRequestService),
    __param(33, IDecorationsService),
    __param(34, IProgressService)
], TestServiceAccessor);
export { TestServiceAccessor };
let TestTextFileService = class TestTextFileService extends BrowserTextFileService {
    constructor(fileService, untitledTextEditorService, lifecycleService, instantiationService, modelService, environmentService, dialogService, fileDialogService, textResourceConfigurationService, filesConfigurationService, codeEditorService, pathService, workingCopyFileService, uriIdentityService, languageService, logService, elevatedFileService, decorationsService) {
        super(fileService, untitledTextEditorService, lifecycleService, instantiationService, modelService, environmentService, dialogService, fileDialogService, textResourceConfigurationService, filesConfigurationService, codeEditorService, pathService, workingCopyFileService, uriIdentityService, languageService, elevatedFileService, logService, decorationsService);
        this.readStreamError = undefined;
        this.writeError = undefined;
    }
    setReadStreamErrorOnce(error) {
        this.readStreamError = error;
    }
    async readStream(resource, options) {
        if (this.readStreamError) {
            const error = this.readStreamError;
            this.readStreamError = undefined;
            throw error;
        }
        const content = await this.fileService.readFileStream(resource, options);
        return {
            resource: content.resource,
            name: content.name,
            mtime: content.mtime,
            ctime: content.ctime,
            etag: content.etag,
            encoding: 'utf8',
            value: await createTextBufferFactoryFromStream(content.value),
            size: 10,
            readonly: false,
            locked: false,
            executable: false
        };
    }
    setWriteErrorOnce(error) {
        this.writeError = error;
    }
    async write(resource, value, options) {
        if (this.writeError) {
            const error = this.writeError;
            this.writeError = undefined;
            throw error;
        }
        return super.write(resource, value, options);
    }
};
TestTextFileService = __decorate([
    __param(0, IFileService),
    __param(1, IUntitledTextEditorService),
    __param(2, ILifecycleService),
    __param(3, IInstantiationService),
    __param(4, IModelService),
    __param(5, IWorkbenchEnvironmentService),
    __param(6, IDialogService),
    __param(7, IFileDialogService),
    __param(8, ITextResourceConfigurationService),
    __param(9, IFilesConfigurationService),
    __param(10, ICodeEditorService),
    __param(11, IPathService),
    __param(12, IWorkingCopyFileService),
    __param(13, IUriIdentityService),
    __param(14, ILanguageService),
    __param(15, ILogService),
    __param(16, IElevatedFileService),
    __param(17, IDecorationsService)
], TestTextFileService);
export { TestTextFileService };
export class TestBrowserTextFileServiceWithEncodingOverrides extends BrowserTextFileService {
    get encoding() {
        if (!this._testEncoding) {
            this._testEncoding = this._register(this.instantiationService.createInstance(TestEncodingOracle));
        }
        return this._testEncoding;
    }
}
export class TestEncodingOracle extends EncodingOracle {
    get encodingOverrides() {
        return [
            { extension: 'utf16le', encoding: UTF16le },
            { extension: 'utf16be', encoding: UTF16be },
            { extension: 'utf8bom', encoding: UTF8_with_bom }
        ];
    }
    set encodingOverrides(overrides) { }
}
class TestEnvironmentServiceWithArgs extends BrowserWorkbenchEnvironmentService {
    constructor() {
        super(...arguments);
        this.args = [];
    }
}
export const TestEnvironmentService = new TestEnvironmentServiceWithArgs('', URI.file('tests').with({ scheme: 'vscode-tests' }), Object.create(null), TestProductService);
export class TestProgressService {
    withProgress(options, task, onDidCancel) {
        return task(Progress.None);
    }
}
export class TestDecorationsService {
    constructor() {
        this.onDidChangeDecorations = Event.None;
    }
    registerDecorationsProvider(_provider) { return Disposable.None; }
    getDecoration(_uri, _includeChildren, _overwrite) { return undefined; }
}
export class TestMenuService {
    createMenu(_id, _scopedKeybindingService) {
        return {
            onDidChange: Event.None,
            dispose: () => undefined,
            getActions: () => []
        };
    }
    getMenuActions(id, contextKeyService, options) {
        throw new Error('Method not implemented.');
    }
    getMenuContexts(id) {
        throw new Error('Method not implemented.');
    }
    resetHiddenStates() {
        // nothing
    }
}
let TestFileDialogService = class TestFileDialogService {
    constructor(pathService) {
        this.pathService = pathService;
    }
    async defaultFilePath(_schemeFilter) { return this.pathService.userHome(); }
    async defaultFolderPath(_schemeFilter) { return this.pathService.userHome(); }
    async defaultWorkspacePath(_schemeFilter) { return this.pathService.userHome(); }
    async preferredHome(_schemeFilter) { return this.pathService.userHome(); }
    pickFileFolderAndOpen(_options) { return Promise.resolve(0); }
    pickFileAndOpen(_options) { return Promise.resolve(0); }
    pickFolderAndOpen(_options) { return Promise.resolve(0); }
    pickWorkspaceAndOpen(_options) { return Promise.resolve(0); }
    setPickFileToSave(path) { this.fileToSave = path; }
    pickFileToSave(defaultUri, availableFileSystems) { return Promise.resolve(this.fileToSave); }
    showSaveDialog(_options) { return Promise.resolve(undefined); }
    showOpenDialog(_options) { return Promise.resolve(undefined); }
    setConfirmResult(result) { this.confirmResult = result; }
    showSaveConfirm(fileNamesOrResources) { return Promise.resolve(this.confirmResult); }
};
TestFileDialogService = __decorate([
    __param(0, IPathService)
], TestFileDialogService);
export { TestFileDialogService };
export class TestLayoutService {
    constructor() {
        this.openedDefaultEditors = false;
        this.mainContainerDimension = { width: 800, height: 600 };
        this.activeContainerDimension = { width: 800, height: 600 };
        this.mainContainerOffset = { top: 0, quickPickTop: 0 };
        this.activeContainerOffset = { top: 0, quickPickTop: 0 };
        this.mainContainer = mainWindow.document.body;
        this.containers = [mainWindow.document.body];
        this.activeContainer = mainWindow.document.body;
        this.onDidChangeZenMode = Event.None;
        this.onDidChangeMainEditorCenteredLayout = Event.None;
        this.onDidChangeWindowMaximized = Event.None;
        this.onDidChangePanelPosition = Event.None;
        this.onDidChangePanelAlignment = Event.None;
        this.onDidChangePartVisibility = Event.None;
        this.onDidLayoutMainContainer = Event.None;
        this.onDidLayoutActiveContainer = Event.None;
        this.onDidLayoutContainer = Event.None;
        this.onDidChangeNotificationsVisibility = Event.None;
        this.onDidAddContainer = Event.None;
        this.onDidChangeActiveContainer = Event.None;
        this.onDidChangeAuxiliaryBarMaximized = Event.None;
        this.whenReady = Promise.resolve(undefined);
        this.whenRestored = Promise.resolve(undefined);
    }
    layout() { }
    isRestored() { return true; }
    hasFocus(_part) { return false; }
    focusPart(_part) { }
    hasMainWindowBorder() { return false; }
    getMainWindowBorderRadius() { return undefined; }
    isVisible(_part) { return true; }
    getContainer() { return mainWindow.document.body; }
    whenContainerStylesLoaded() { return undefined; }
    isTitleBarHidden() { return false; }
    isStatusBarHidden() { return false; }
    isActivityBarHidden() { return false; }
    setActivityBarHidden(_hidden) { }
    setBannerHidden(_hidden) { }
    isSideBarHidden() { return false; }
    async setEditorHidden(_hidden) { }
    async setSideBarHidden(_hidden) { }
    async setAuxiliaryBarHidden(_hidden) { }
    async setPartHidden(_hidden, part) { }
    isPanelHidden() { return false; }
    async setPanelHidden(_hidden) { }
    toggleMaximizedPanel() { }
    isPanelMaximized() { return false; }
    toggleMaximizedAuxiliaryBar() { }
    setAuxiliaryBarMaximized(maximized) { return false; }
    isAuxiliaryBarMaximized() { return false; }
    getMenubarVisibility() { throw new Error('not implemented'); }
    toggleMenuBar() { }
    getSideBarPosition() { return 0; }
    getPanelPosition() { return 0; }
    getPanelAlignment() { return 'center'; }
    async setPanelPosition(_position) { }
    async setPanelAlignment(_alignment) { }
    addClass(_clazz) { }
    removeClass(_clazz) { }
    getMaximumEditorDimensions() { throw new Error('not implemented'); }
    toggleZenMode() { }
    isMainEditorLayoutCentered() { return false; }
    centerMainEditorLayout(_active) { }
    resizePart(_part, _sizeChangeWidth, _sizeChangeHeight) { }
    getSize(part) { throw new Error('Method not implemented.'); }
    setSize(part, size) { throw new Error('Method not implemented.'); }
    registerPart(part) { return Disposable.None; }
    isWindowMaximized(targetWindow) { return false; }
    updateWindowMaximizedState(targetWindow, maximized) { }
    getVisibleNeighborPart(part, direction) { return undefined; }
    focus() { }
}
// eslint-disable-next-line local/code-no-any-casts
const activeViewlet = {};
export class TestPaneCompositeService extends Disposable {
    constructor() {
        super();
        this.parts = new Map();
        this.parts.set(1 /* ViewContainerLocation.Panel */, new TestPanelPart());
        this.parts.set(0 /* ViewContainerLocation.Sidebar */, new TestSideBarPart());
        this.onDidPaneCompositeOpen = Event.any(...([1 /* ViewContainerLocation.Panel */, 0 /* ViewContainerLocation.Sidebar */].map(loc => Event.map(this.parts.get(loc).onDidPaneCompositeOpen, composite => { return { composite, viewContainerLocation: loc }; }))));
        this.onDidPaneCompositeClose = Event.any(...([1 /* ViewContainerLocation.Panel */, 0 /* ViewContainerLocation.Sidebar */].map(loc => Event.map(this.parts.get(loc).onDidPaneCompositeClose, composite => { return { composite, viewContainerLocation: loc }; }))));
    }
    getPartId(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).partId;
    }
    getRegistryId(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).registryId;
    }
    openPaneComposite(id, viewContainerLocation, focus) {
        return this.getPartByLocation(viewContainerLocation).openPaneComposite(id, focus);
    }
    getActivePaneComposite(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getActivePaneComposite();
    }
    getPaneComposite(id, viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getPaneComposite(id);
    }
    getPaneComposites(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getPaneComposites();
    }
    getProgressIndicator(id, viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getProgressIndicator(id);
    }
    hideActivePaneComposite(viewContainerLocation) {
        this.getPartByLocation(viewContainerLocation).hideActivePaneComposite();
    }
    getLastActivePaneCompositeId(viewContainerLocation) {
        return this.getPartByLocation(viewContainerLocation).getLastActivePaneCompositeId();
    }
    getPinnedPaneCompositeIds(viewContainerLocation) {
        throw new Error('Method not implemented.');
    }
    getVisiblePaneCompositeIds(viewContainerLocation) {
        throw new Error('Method not implemented.');
    }
    getPaneCompositeIds(viewContainerLocation) {
        throw new Error('Method not implemented.');
    }
    getPartByLocation(viewContainerLocation) {
        return assertReturnsDefined(this.parts.get(viewContainerLocation));
    }
}
export class TestSideBarPart {
    constructor() {
        this.onDidViewletRegisterEmitter = new Emitter();
        this.onDidViewletDeregisterEmitter = new Emitter();
        this.onDidViewletOpenEmitter = new Emitter();
        this.onDidViewletCloseEmitter = new Emitter();
        this.partId = "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */;
        this.registryId = PaneCompositeExtensions.Viewlets;
        this.element = undefined;
        this.minimumWidth = 0;
        this.maximumWidth = 0;
        this.minimumHeight = 0;
        this.maximumHeight = 0;
        this.onDidChange = Event.None;
        this.onDidPaneCompositeOpen = this.onDidViewletOpenEmitter.event;
        this.onDidPaneCompositeClose = this.onDidViewletCloseEmitter.event;
    }
    openPaneComposite(id, focus) { return Promise.resolve(undefined); }
    getPaneComposites() { return []; }
    getAllViewlets() { return []; }
    getActivePaneComposite() { return activeViewlet; }
    getDefaultViewletId() { return 'workbench.view.explorer'; }
    getPaneComposite(id) { return undefined; }
    getProgressIndicator(id) { return undefined; }
    hideActivePaneComposite() { }
    getLastActivePaneCompositeId() { return undefined; }
    dispose() { }
    getPinnedPaneCompositeIds() { return []; }
    getVisiblePaneCompositeIds() { return []; }
    getPaneCompositeIds() { return []; }
    layout(width, height, top, left) { }
}
export class TestPanelPart {
    constructor() {
        this.element = undefined;
        this.minimumWidth = 0;
        this.maximumWidth = 0;
        this.minimumHeight = 0;
        this.maximumHeight = 0;
        this.onDidChange = Event.None;
        this.onDidPaneCompositeOpen = new Emitter().event;
        this.onDidPaneCompositeClose = new Emitter().event;
        this.partId = "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */;
        this.registryId = PaneCompositeExtensions.Auxiliary;
    }
    async openPaneComposite(id, focus) { return undefined; }
    getPaneComposite(id) { return activeViewlet; }
    getPaneComposites() { return []; }
    getPinnedPaneCompositeIds() { return []; }
    getVisiblePaneCompositeIds() { return []; }
    getPaneCompositeIds() { return []; }
    getActivePaneComposite() { return activeViewlet; }
    setPanelEnablement(id, enabled) { }
    dispose() { }
    getProgressIndicator(id) { return null; }
    hideActivePaneComposite() { }
    getLastActivePaneCompositeId() { return undefined; }
    layout(width, height, top, left) { }
}
export class TestViewsService {
    constructor() {
        this.onDidChangeViewContainerVisibility = new Emitter().event;
        this.onDidChangeViewVisibilityEmitter = new Emitter();
        this.onDidChangeViewVisibility = this.onDidChangeViewVisibilityEmitter.event;
        this.onDidChangeFocusedViewEmitter = new Emitter();
        this.onDidChangeFocusedView = this.onDidChangeFocusedViewEmitter.event;
    }
    isViewContainerVisible(id) { return true; }
    isViewContainerActive(id) { return true; }
    getVisibleViewContainer() { return null; }
    openViewContainer(id, focus) { return Promise.resolve(null); }
    closeViewContainer(id) { }
    isViewVisible(id) { return true; }
    getActiveViewWithId(id) { return null; }
    getViewWithId(id) { return null; }
    openView(id, focus) { return Promise.resolve(null); }
    closeView(id) { }
    getViewProgressIndicator(id) { return null; }
    getActiveViewPaneContainerWithId(id) { return null; }
    getFocusedViewName() { return ''; }
    getFocusedView() { return null; }
}
export class TestEditorGroupsService {
    constructor(groups = []) {
        this.groups = groups;
        this.parts = [this];
        this.windowId = mainWindow.vscodeWindowId;
        this.onDidCreateAuxiliaryEditorPart = Event.None;
        this.onDidChangeActiveGroup = Event.None;
        this.onDidActivateGroup = Event.None;
        this.onDidAddGroup = Event.None;
        this.onDidRemoveGroup = Event.None;
        this.onDidMoveGroup = Event.None;
        this.onDidChangeGroupIndex = Event.None;
        this.onDidChangeGroupLabel = Event.None;
        this.onDidChangeGroupLocked = Event.None;
        this.onDidChangeGroupMaximized = Event.None;
        this.onDidLayout = Event.None;
        this.onDidChangeEditorPartOptions = Event.None;
        this.onDidScroll = Event.None;
        this.onWillDispose = Event.None;
        this.orientation = 0 /* GroupOrientation.HORIZONTAL */;
        this.isReady = true;
        this.whenReady = Promise.resolve(undefined);
        this.whenRestored = Promise.resolve(undefined);
        this.hasRestorableState = false;
        this.contentDimension = { width: 800, height: 600 };
        this.mainPart = this;
        this.activeModalEditorPart = undefined;
    }
    get activeGroup() { return this.groups[0]; }
    get sideGroup() { return this.groups[0]; }
    get count() { return this.groups.length; }
    getPart(group) { return this; }
    saveWorkingSet(name) { throw new Error('Method not implemented.'); }
    getWorkingSets() { throw new Error('Method not implemented.'); }
    applyWorkingSet(workingSet, options) { throw new Error('Method not implemented.'); }
    deleteWorkingSet(workingSet) { throw new Error('Method not implemented.'); }
    getGroups(_order) { return this.groups; }
    getGroup(identifier) { return this.groups.find(group => group.id === identifier); }
    getLabel(_identifier) { return 'Group 1'; }
    findGroup(_scope, _source, _wrap) { throw new Error('not implemented'); }
    activateGroup(_group) { throw new Error('not implemented'); }
    restoreGroup(_group) { throw new Error('not implemented'); }
    getSize(_group) { return { width: 100, height: 100 }; }
    setSize(_group, _size) { }
    arrangeGroups(_arrangement) { }
    toggleMaximizeGroup() { }
    hasMaximizedGroup() { throw new Error('not implemented'); }
    toggleExpandGroup() { }
    applyLayout(_layout) { }
    getLayout() { throw new Error('not implemented'); }
    setGroupOrientation(_orientation) { }
    addGroup(_location, _direction) { throw new Error('not implemented'); }
    removeGroup(_group) { }
    moveGroup(_group, _location, _direction) { throw new Error('not implemented'); }
    mergeGroup(_group, _target, _options) { throw new Error('not implemented'); }
    mergeAllGroups(_group, _options) { throw new Error('not implemented'); }
    copyGroup(_group, _location, _direction) { throw new Error('not implemented'); }
    centerLayout(active) { }
    isLayoutCentered() { return false; }
    createEditorDropTarget(container, delegate) { return Disposable.None; }
    registerContextKeyProvider(_provider) { throw new Error('not implemented'); }
    getScopedInstantiationService(part) { throw new Error('Method not implemented.'); }
    enforcePartOptions(options) { return Disposable.None; }
    registerEditorPart(part) { return Disposable.None; }
    createAuxiliaryEditorPart() { throw new Error('Method not implemented.'); }
    createModalEditorPart() { throw new Error('Method not implemented.'); }
}
export class TestEditorGroupView {
    constructor(id) {
        this.id = id;
        this.windowId = mainWindow.vscodeWindowId;
        this.groupsView = undefined;
        this.selectedEditors = [];
        this.editors = [];
        this.whenRestored = Promise.resolve(undefined);
        this.isEmpty = true;
        this.onWillDispose = Event.None;
        this.onDidModelChange = Event.None;
        this.onWillCloseEditor = Event.None;
        this.onDidCloseEditor = Event.None;
        this.onDidOpenEditorFail = Event.None;
        this.onDidFocus = Event.None;
        this.onDidChange = Event.None;
        this.onWillMoveEditor = Event.None;
        this.onWillOpenEditor = Event.None;
        this.onDidActiveEditorChange = Event.None;
    }
    getEditors(_order) { return []; }
    findEditors(_resource) { return []; }
    getEditorByIndex(_index) { throw new Error('not implemented'); }
    getIndexOfEditor(_editor) { return -1; }
    isFirst(editor) { return false; }
    isLast(editor) { return false; }
    openEditor(_editor, _options) { throw new Error('not implemented'); }
    openEditors(_editors) { throw new Error('not implemented'); }
    isPinned(_editor) { return false; }
    isSticky(_editor) { return false; }
    isTransient(_editor) { return false; }
    isActive(_editor) { return false; }
    setSelection(_activeSelectedEditor, _inactiveSelectedEditors) { throw new Error('not implemented'); }
    isSelected(_editor) { return false; }
    contains(candidate) { return false; }
    moveEditor(_editor, _target, _options) { return true; }
    moveEditors(_editors, _target) { return true; }
    copyEditor(_editor, _target, _options) { }
    copyEditors(_editors, _target) { }
    async closeEditor(_editor, options) { return true; }
    async closeEditors(_editors, options) { return true; }
    closeAllEditors(options) { return true; }
    async replaceEditors(_editors) { }
    pinEditor(_editor) { }
    stickEditor(editor) { }
    unstickEditor(editor) { }
    lock(locked) { }
    focus() { }
    get scopedContextKeyService() { throw new Error('not implemented'); }
    setActive(_isActive) { }
    notifyIndexChanged(_index) { }
    notifyLabelChanged(_label) { }
    dispose() { }
    toJSON() { return Object.create(null); }
    layout(_width, _height) { }
    relayout() { }
    createEditorActions(_menuDisposable) { throw new Error('not implemented'); }
}
export class TestEditorGroupAccessor {
    constructor() {
        this.label = '';
        this.windowId = mainWindow.vscodeWindowId;
        this.groups = [];
        this.partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS };
        this.onDidChangeEditorPartOptions = Event.None;
        this.onDidVisibilityChange = Event.None;
    }
    getGroup(identifier) { throw new Error('Method not implemented.'); }
    getGroups(order) { throw new Error('Method not implemented.'); }
    activateGroup(identifier) { throw new Error('Method not implemented.'); }
    restoreGroup(identifier) { throw new Error('Method not implemented.'); }
    addGroup(location, direction) { throw new Error('Method not implemented.'); }
    mergeGroup(group, target, options) { throw new Error('Method not implemented.'); }
    moveGroup(group, location, direction) { throw new Error('Method not implemented.'); }
    copyGroup(group, location, direction) { throw new Error('Method not implemented.'); }
    removeGroup(group) { throw new Error('Method not implemented.'); }
    arrangeGroups(arrangement, target) { throw new Error('Method not implemented.'); }
    toggleMaximizeGroup(group) { throw new Error('Method not implemented.'); }
    toggleExpandGroup(group) { throw new Error('Method not implemented.'); }
}
export class TestEditorService extends Disposable {
    get activeTextEditorControl() { return this._activeTextEditorControl; }
    set activeTextEditorControl(value) { this._activeTextEditorControl = value; }
    get activeEditor() { return this._activeEditor; }
    set activeEditor(value) { this._activeEditor = value; }
    getVisibleTextEditorControls(order) { return this.visibleTextEditorControls; }
    constructor(editorGroupService) {
        super();
        this.editorGroupService = editorGroupService;
        this.onDidActiveEditorChange = Event.None;
        this.onDidVisibleEditorsChange = Event.None;
        this.onDidEditorsChange = Event.None;
        this.onWillOpenEditor = Event.None;
        this.onDidCloseEditor = Event.None;
        this.onDidOpenEditorFail = Event.None;
        this.onDidMostRecentlyActiveEditorsChange = Event.None;
        this.editors = [];
        this.mostRecentlyActiveEditors = [];
        this.visibleEditorPanes = [];
        this.visibleTextEditorControls = [];
        this.visibleEditors = [];
        this.count = this.editors.length;
    }
    createScoped(editorGroupsContainer) { return this; }
    getEditors() { return []; }
    // eslint-disable-next-line local/code-no-any-casts
    findEditors() { return []; }
    async openEditor(editor, optionsOrGroup, group) {
        // openEditor takes ownership of the input, register it to the TestEditorService
        // so it's not marked as leaked during tests.
        if ('dispose' in editor) {
            this._register(editor);
        }
        return undefined;
    }
    async closeEditor(editor, options) { }
    async closeEditors(editors, options) { }
    doResolveEditorOpenRequest(editor) {
        if (!this.editorGroupService) {
            return undefined;
        }
        return [this.editorGroupService.activeGroup, editor, undefined];
    }
    openEditors(_editors, _group) { throw new Error('not implemented'); }
    isOpened(_editor) { return false; }
    isVisible(_editor) { return false; }
    replaceEditors(_editors, _group) { return Promise.resolve(undefined); }
    save(editors, options) { throw new Error('Method not implemented.'); }
    saveAll(options) { throw new Error('Method not implemented.'); }
    revert(editors, options) { throw new Error('Method not implemented.'); }
    revertAll(options) { throw new Error('Method not implemented.'); }
}
export class TestWorkingCopyBackupService extends InMemoryWorkingCopyBackupService {
    constructor() {
        super();
        this.resolved = new Set();
    }
    parseBackupContent(textBufferFactory) {
        const textBuffer = textBufferFactory.create(1 /* DefaultEndOfLine.LF */).textBuffer;
        const lineCount = textBuffer.getLineCount();
        const range = new Range(1, 1, lineCount, textBuffer.getLineLength(lineCount) + 1);
        return textBuffer.getValueInRange(range, 0 /* EndOfLinePreference.TextDefined */);
    }
    async resolve(identifier) {
        this.resolved.add(identifier);
        return super.resolve(identifier);
    }
}
export function toUntypedWorkingCopyId(resource) {
    return toTypedWorkingCopyId(resource, '');
}
export function toTypedWorkingCopyId(resource, typeId = 'testBackupTypeId') {
    return { typeId, resource };
}
export class InMemoryTestWorkingCopyBackupService extends BrowserWorkingCopyBackupService {
    constructor() {
        const disposables = new DisposableStore();
        const environmentService = TestEnvironmentService;
        const logService = new NullLogService();
        const fileService = disposables.add(new FileService(logService));
        disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
        disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new InMemoryFileSystemProvider())));
        super(new TestContextService(TestWorkspace), environmentService, fileService, logService);
        this.backupResourceJoiners = [];
        this.discardBackupJoiners = [];
        this.discardedBackups = [];
        this._register(disposables);
    }
    testGetFileService() {
        return this.fileService;
    }
    joinBackupResource() {
        return new Promise(resolve => this.backupResourceJoiners.push(resolve));
    }
    joinDiscardBackup() {
        return new Promise(resolve => this.discardBackupJoiners.push(resolve));
    }
    async backup(identifier, content, versionId, meta, token) {
        await super.backup(identifier, content, versionId, meta, token);
        while (this.backupResourceJoiners.length) {
            this.backupResourceJoiners.pop()();
        }
    }
    async discardBackup(identifier) {
        await super.discardBackup(identifier);
        this.discardedBackups.push(identifier);
        while (this.discardBackupJoiners.length) {
            this.discardBackupJoiners.pop()();
        }
    }
    async getBackupContents(identifier) {
        const backupResource = this.toBackupResource(identifier);
        const fileContents = await this.fileService.readFile(backupResource);
        return fileContents.value.toString();
    }
}
export class TestBeforeShutdownEvent {
    constructor() {
        this.reason = 1 /* ShutdownReason.CLOSE */;
    }
    veto(value) {
        this.value = value;
    }
    finalVeto(vetoFn) {
        this.value = vetoFn();
        this.finalValue = vetoFn;
    }
}
export class TestWillShutdownEvent {
    constructor() {
        this.value = [];
        this.joiners = () => [];
        this.reason = 1 /* ShutdownReason.CLOSE */;
        this.token = CancellationToken.None;
    }
    join(promise, joiner) {
        this.value.push(typeof promise === 'function' ? promise() : promise);
    }
    force() { }
}
export class TestTextResourceConfigurationService {
    constructor(configurationService = new TestConfigurationService()) {
        this.configurationService = configurationService;
    }
    onDidChangeConfiguration() {
        return { dispose() { } };
    }
    getValue(resource, arg2, arg3) {
        const position = EditorPosition.isIPosition(arg2) ? arg2 : null;
        const section = position ? (typeof arg3 === 'string' ? arg3 : undefined) : (typeof arg2 === 'string' ? arg2 : undefined);
        return this.configurationService.getValue(section, { resource });
    }
    inspect(resource, position, section) {
        return this.configurationService.inspect(section, { resource });
    }
    updateValue(resource, key, value, configurationTarget) {
        return this.configurationService.updateValue(key, value);
    }
}
export class RemoteFileSystemProvider {
    constructor(wrappedFsp, remoteAuthority) {
        this.wrappedFsp = wrappedFsp;
        this.remoteAuthority = remoteAuthority;
        this.capabilities = this.wrappedFsp.capabilities;
        this.onDidChangeCapabilities = this.wrappedFsp.onDidChangeCapabilities;
        this.onDidChangeFile = Event.map(this.wrappedFsp.onDidChangeFile, changes => changes.map(c => {
            return {
                type: c.type,
                resource: c.resource.with({ scheme: Schemas.vscodeRemote, authority: this.remoteAuthority }),
            };
        }));
    }
    watch(resource, opts) { return this.wrappedFsp.watch(this.toFileResource(resource), opts); }
    stat(resource) { return this.wrappedFsp.stat(this.toFileResource(resource)); }
    mkdir(resource) { return this.wrappedFsp.mkdir(this.toFileResource(resource)); }
    readdir(resource) { return this.wrappedFsp.readdir(this.toFileResource(resource)); }
    delete(resource, opts) { return this.wrappedFsp.delete(this.toFileResource(resource), opts); }
    rename(from, to, opts) { return this.wrappedFsp.rename(this.toFileResource(from), this.toFileResource(to), opts); }
    copy(from, to, opts) { return this.wrappedFsp.copy(this.toFileResource(from), this.toFileResource(to), opts); }
    readFile(resource) { return this.wrappedFsp.readFile(this.toFileResource(resource)); }
    writeFile(resource, content, opts) { return this.wrappedFsp.writeFile(this.toFileResource(resource), content, opts); }
    open(resource, opts) { return this.wrappedFsp.open(this.toFileResource(resource), opts); }
    close(fd) { return this.wrappedFsp.close(fd); }
    read(fd, pos, data, offset, length) { return this.wrappedFsp.read(fd, pos, data, offset, length); }
    write(fd, pos, data, offset, length) { return this.wrappedFsp.write(fd, pos, data, offset, length); }
    readFileStream(resource, opts, token) { return this.wrappedFsp.readFileStream(this.toFileResource(resource), opts, token); }
    toFileResource(resource) { return resource.with({ scheme: Schemas.file, authority: '' }); }
}
export class TestInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
    get capabilities() {
        return 2 /* FileSystemProviderCapabilities.FileReadWrite */
            | 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */
            | 16 /* FileSystemProviderCapabilities.FileReadStream */;
    }
    readFileStream(resource) {
        const BUFFER_SIZE = 64 * 1024;
        const stream = newWriteableStream(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);
        (async () => {
            try {
                const data = await this.readFile(resource);
                let offset = 0;
                while (offset < data.length) {
                    await timeout(0);
                    await stream.write(data.subarray(offset, offset + BUFFER_SIZE));
                    offset += BUFFER_SIZE;
                }
                await timeout(0);
                stream.end();
            }
            catch (error) {
                stream.end(error);
            }
        })();
        return stream;
    }
}
export const productService = { _serviceBrand: undefined, ...product };
export class TestHostService {
    constructor() {
        this._hasFocus = true;
        this._onDidChangeFocus = new Emitter();
        this.onDidChangeFocus = this._onDidChangeFocus.event;
        this._onDidChangeWindow = new Emitter();
        this.onDidChangeActiveWindow = this._onDidChangeWindow.event;
        this.onDidChangeFullScreen = Event.None;
        this.colorScheme = ColorScheme.DARK;
        this.onDidChangeColorScheme = Event.None;
    }
    get hasFocus() { return this._hasFocus; }
    async hadLastFocus() { return this._hasFocus; }
    setFocus(focus) {
        this._hasFocus = focus;
        this._onDidChangeFocus.fire(this._hasFocus);
    }
    async restart() { }
    async reload() { }
    async close() { }
    async withExpectedShutdown(expectedShutdownTask) {
        return await expectedShutdownTask();
    }
    async focus() { }
    async moveTop() { }
    async getCursorScreenPoint() { return undefined; }
    async getWindows(options) { return []; }
    async openWindow(arg1, arg2) { }
    async toggleFullScreen() { }
    async getScreenshot(rect) { return undefined; }
    async getNativeWindowHandle(_windowId) { return undefined; }
    async showToast(_options, token) { return { supported: false, clicked: false }; }
    async setWindowDimmed(_targetWindow, _dimmed) { }
}
export class TestFilesConfigurationService extends FilesConfigurationService {
    testOnFilesConfigurationChange(configuration) {
        super.onFilesConfigurationChange(configuration, true);
    }
}
export class TestReadonlyTextFileEditorModel extends TextFileEditorModel {
    isReadonly() {
        return true;
    }
}
export class TestEditorInput extends EditorInput {
    constructor(resource, _typeId) {
        super();
        this.resource = resource;
        this._typeId = _typeId;
    }
    get typeId() {
        return this._typeId;
    }
    get editorId() {
        return this._typeId;
    }
    resolve() {
        return Promise.resolve(null);
    }
}
export function registerTestEditor(id, inputs, serializerInputId) {
    const disposables = new DisposableStore();
    class TestEditor extends EditorPane {
        constructor(group) {
            super(id, group, NullTelemetryService, new TestThemeService(), disposables.add(new TestStorageService()));
            this._scopedContextKeyService = new MockContextKeyService();
        }
        async setInput(input, options, context, token) {
            super.setInput(input, options, context, token);
            await input.resolve();
        }
        getId() { return id; }
        layout() { }
        createEditor() { }
        get scopedContextKeyService() {
            return this._scopedContextKeyService;
        }
    }
    disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(TestEditor, id, 'Test Editor Control'), inputs));
    if (serializerInputId) {
        class EditorsObserverTestEditorInputSerializer {
            canSerialize(editorInput) {
                return true;
            }
            serialize(editorInput) {
                const testEditorInput = editorInput;
                const testInput = {
                    resource: testEditorInput.resource.toString()
                };
                return JSON.stringify(testInput);
            }
            deserialize(instantiationService, serializedEditorInput) {
                const testInput = JSON.parse(serializedEditorInput);
                return new TestFileEditorInput(URI.parse(testInput.resource), serializerInputId);
            }
        }
        disposables.add(Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(serializerInputId, EditorsObserverTestEditorInputSerializer));
    }
    return disposables;
}
export function registerTestFileEditor() {
    const disposables = new DisposableStore();
    disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(TestTextFileEditor, TestTextFileEditor.ID, 'Text File Editor'), [new SyncDescriptor(FileEditorInput)]));
    return disposables;
}
export function registerTestResourceEditor() {
    const disposables = new DisposableStore();
    disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(TestTextResourceEditor, TestTextResourceEditor.ID, 'Text Editor'), [
        new SyncDescriptor(UntitledTextEditorInput),
        new SyncDescriptor(TextResourceEditorInput)
    ]));
    return disposables;
}
export function registerTestSideBySideEditor() {
    const disposables = new DisposableStore();
    disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(SideBySideEditor, SideBySideEditor.ID, 'Text Editor'), [
        new SyncDescriptor(SideBySideEditorInput)
    ]));
    return disposables;
}
export class TestFileEditorInput extends EditorInput {
    constructor(resource, _typeId) {
        super();
        this.resource = resource;
        this._typeId = _typeId;
        this.gotDisposed = false;
        this.gotSaved = false;
        this.gotSavedAs = false;
        this.gotReverted = false;
        this.dirty = false;
        this.fails = false;
        this.disableToUntyped = false;
        this._capabilities = 0 /* EditorInputCapabilities.None */;
        this.movedEditor = undefined;
        this.moveDisabledReason = undefined;
        this.preferredResource = this.resource;
    }
    get typeId() { return this._typeId; }
    get editorId() { return this._typeId; }
    get capabilities() { return this._capabilities; }
    set capabilities(capabilities) {
        if (this._capabilities !== capabilities) {
            this._capabilities = capabilities;
            this._onDidChangeCapabilities.fire();
        }
    }
    resolve() { return !this.fails ? Promise.resolve(null) : Promise.reject(new Error('fails')); }
    matches(other) {
        if (super.matches(other)) {
            return true;
        }
        if (other instanceof EditorInput) {
            return !!(other?.resource && this.resource.toString() === other.resource.toString() && other instanceof TestFileEditorInput && other.typeId === this.typeId);
        }
        return isEqual(this.resource, other.resource) && (this.editorId === other.options?.override || other.options?.override === undefined);
    }
    setPreferredResource(resource) { }
    async setEncoding(encoding) { }
    getEncoding() { return undefined; }
    setPreferredName(name) { }
    setPreferredDescription(description) { }
    setPreferredEncoding(encoding) { }
    setPreferredContents(contents) { }
    setLanguageId(languageId, source) { }
    setPreferredLanguageId(languageId) { }
    setForceOpenAsBinary() { }
    setFailToOpen() {
        this.fails = true;
    }
    async save(groupId, options) {
        this.gotSaved = true;
        this.dirty = false;
        return this;
    }
    async saveAs(groupId, options) {
        this.gotSavedAs = true;
        return this;
    }
    async revert(group, options) {
        this.gotReverted = true;
        this.gotSaved = false;
        this.gotSavedAs = false;
        this.dirty = false;
    }
    toUntyped() {
        if (this.disableToUntyped) {
            return undefined;
        }
        return { resource: this.resource };
    }
    setModified() { this.modified = true; }
    isModified() {
        return this.modified === undefined ? this.dirty : this.modified;
    }
    setDirty() { this.dirty = true; }
    isDirty() {
        return this.dirty;
    }
    isResolved() { return false; }
    dispose() {
        super.dispose();
        this.gotDisposed = true;
    }
    async rename() { return this.movedEditor; }
    setMoveDisabled(reason) {
        this.moveDisabledReason = reason;
    }
    canMove(sourceGroup, targetGroup) {
        if (typeof this.moveDisabledReason === 'string') {
            return this.moveDisabledReason;
        }
        return super.canMove(sourceGroup, targetGroup);
    }
}
export class TestForceRevealFileEditorInput extends TestFileEditorInput {
    get capabilities() { return 1024 /* EditorInputCapabilities.ForceReveal */; }
}
export class TestEditorPart extends MainEditorPart {
    constructor() {
        super(...arguments);
        this.mainPart = this;
        this.parts = [this];
        this.activeModalEditorPart = undefined;
        this.onDidCreateAuxiliaryEditorPart = Event.None;
    }
    testSaveState() {
        return super.saveState();
    }
    clearState() {
        const workspaceMemento = this.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        for (const key of Object.keys(workspaceMemento)) {
            delete workspaceMemento[key];
        }
        const profileMemento = this.getMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        for (const key of Object.keys(profileMemento)) {
            delete profileMemento[key];
        }
    }
    registerEditorPart(part) {
        return Disposable.None;
    }
    createAuxiliaryEditorPart() {
        throw new Error('Method not implemented.');
    }
    createModalEditorPart() {
        throw new Error('Method not implemented.');
    }
    getScopedInstantiationService(part) {
        throw new Error('Method not implemented.');
    }
    getPart(group) { return this; }
    saveWorkingSet(name) { throw new Error('Method not implemented.'); }
    getWorkingSets() { throw new Error('Method not implemented.'); }
    applyWorkingSet(workingSet, options) { throw new Error('Method not implemented.'); }
    deleteWorkingSet(workingSet) { throw new Error('Method not implemented.'); }
    registerContextKeyProvider(provider) { throw new Error('Method not implemented.'); }
}
export class TestEditorParts extends EditorParts {
    createMainEditorPart() {
        this.testMainPart = this.instantiationService.createInstance(TestEditorPart, this);
        return this.testMainPart;
    }
}
export async function createEditorParts(instantiationService, disposables) {
    const parts = instantiationService.createInstance(TestEditorParts);
    const part = disposables.add(parts).testMainPart;
    part.create(document.createElement('div'));
    part.layout(1080, 800, 0, 0);
    await parts.whenReady;
    return parts;
}
export async function createEditorPart(instantiationService, disposables) {
    return (await createEditorParts(instantiationService, disposables)).testMainPart;
}
export class TestListService {
    constructor() {
        this.lastFocusedList = undefined;
    }
    register() {
        return Disposable.None;
    }
}
export class TestPathService {
    constructor(fallbackUserHome = URI.from({ scheme: Schemas.file, path: '/' }), defaultUriScheme = Schemas.file) {
        this.fallbackUserHome = fallbackUserHome;
        this.defaultUriScheme = defaultUriScheme;
    }
    hasValidBasename(resource, arg2, name) {
        if (typeof arg2 === 'string' || typeof arg2 === 'undefined') {
            return isValidBasename(arg2 ?? basename(resource));
        }
        return isValidBasename(name ?? basename(resource));
    }
    get path() { return Promise.resolve(isWindows ? win32 : posix); }
    userHome(options) {
        return options?.preferLocal ? this.fallbackUserHome : Promise.resolve(this.fallbackUserHome);
    }
    get resolvedUserHome() { return this.fallbackUserHome; }
    async fileURI(path) {
        return URI.file(path);
    }
}
export function getLastResolvedFileStat(model) {
    const candidate = model;
    return candidate?.lastResolvedFileStat;
}
export class TestWorkspacesService {
    constructor() {
        this.onDidChangeRecentlyOpened = Event.None;
    }
    async createUntitledWorkspace(folders, remoteAuthority) { throw new Error('Method not implemented.'); }
    async deleteUntitledWorkspace(workspace) { }
    async addRecentlyOpened(recents) { }
    async removeRecentlyOpened(workspaces) { }
    async clearRecentlyOpened() { }
    async getRecentlyOpened() { return { files: [], workspaces: [] }; }
    async getDirtyWorkspaces() { return []; }
    async enterWorkspace(path) { throw new Error('Method not implemented.'); }
    async getWorkspaceIdentifier(workspacePath) { throw new Error('Method not implemented.'); }
}
export class TestTerminalInstanceService {
    constructor() {
        this.onDidCreateInstance = Event.None;
        this.onDidRegisterBackend = Event.None;
    }
    convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile, cwd) { throw new Error('Method not implemented.'); }
    preparePathForTerminalAsync(path, executable, title, shellType, remoteAuthority) { throw new Error('Method not implemented.'); }
    createInstance(options, target) { throw new Error('Method not implemented.'); }
    async getBackend(remoteAuthority) { throw new Error('Method not implemented.'); }
    didRegisterBackend(backend) { throw new Error('Method not implemented.'); }
    getRegisteredBackends() { throw new Error('Method not implemented.'); }
}
export class TestTerminalEditorService {
    constructor() {
        this.instances = [];
        this.onDidDisposeInstance = Event.None;
        this.onDidFocusInstance = Event.None;
        this.onDidChangeInstanceCapability = Event.None;
        this.onDidChangeActiveInstance = Event.None;
        this.onDidChangeInstances = Event.None;
    }
    openEditor(instance, editorOptions) { throw new Error('Method not implemented.'); }
    detachInstance(instance) { throw new Error('Method not implemented.'); }
    splitInstance(instanceToSplit, shellLaunchConfig) { throw new Error('Method not implemented.'); }
    revealActiveEditor(preserveFocus) { throw new Error('Method not implemented.'); }
    resolveResource(instance) { throw new Error('Method not implemented.'); }
    reviveInput(deserializedInput) { throw new Error('Method not implemented.'); }
    getInputFromResource(resource) { throw new Error('Method not implemented.'); }
    setActiveInstance(instance) { throw new Error('Method not implemented.'); }
    focusActiveInstance() { throw new Error('Method not implemented.'); }
    async focusInstance(instance) { throw new Error('Method not implemented.'); }
    getInstanceFromResource(resource) { throw new Error('Method not implemented.'); }
    focusFindWidget() { throw new Error('Method not implemented.'); }
    hideFindWidget() { throw new Error('Method not implemented.'); }
    findNext() { throw new Error('Method not implemented.'); }
    findPrevious() { throw new Error('Method not implemented.'); }
}
export class TestTerminalGroupService {
    constructor() {
        this.instances = [];
        this.groups = [];
        this.activeGroupIndex = 0;
        this.lastAccessedMenu = 'inline-tab';
        this.onDidChangeActiveGroup = Event.None;
        this.onDidDisposeGroup = Event.None;
        this.onDidShow = Event.None;
        this.onDidChangeGroups = Event.None;
        this.onDidChangePanelOrientation = Event.None;
        this.onDidDisposeInstance = Event.None;
        this.onDidFocusInstance = Event.None;
        this.onDidChangeInstanceCapability = Event.None;
        this.onDidChangeActiveInstance = Event.None;
        this.onDidChangeInstances = Event.None;
    }
    createGroup(instance) { throw new Error('Method not implemented.'); }
    getGroupForInstance(instance) { throw new Error('Method not implemented.'); }
    moveGroup(source, target) { throw new Error('Method not implemented.'); }
    moveGroupToEnd(source) { throw new Error('Method not implemented.'); }
    moveInstance(source, target, side) { throw new Error('Method not implemented.'); }
    unsplitInstance(instance) { throw new Error('Method not implemented.'); }
    joinInstances(instances) { throw new Error('Method not implemented.'); }
    instanceIsSplit(instance) { throw new Error('Method not implemented.'); }
    getGroupLabels() { throw new Error('Method not implemented.'); }
    setActiveGroupByIndex(index) { throw new Error('Method not implemented.'); }
    setActiveGroupToNext() { throw new Error('Method not implemented.'); }
    setActiveGroupToPrevious() { throw new Error('Method not implemented.'); }
    setActiveInstanceByIndex(terminalIndex) { throw new Error('Method not implemented.'); }
    setContainer(container) { throw new Error('Method not implemented.'); }
    showPanel(focus) { throw new Error('Method not implemented.'); }
    hidePanel() { throw new Error('Method not implemented.'); }
    focusTabs() { throw new Error('Method not implemented.'); }
    focusHover() { throw new Error('Method not implemented.'); }
    setActiveInstance(instance) { throw new Error('Method not implemented.'); }
    focusActiveInstance() { throw new Error('Method not implemented.'); }
    async focusInstance(instance) { throw new Error('Method not implemented.'); }
    getInstanceFromResource(resource) { throw new Error('Method not implemented.'); }
    focusFindWidget() { throw new Error('Method not implemented.'); }
    hideFindWidget() { throw new Error('Method not implemented.'); }
    findNext() { throw new Error('Method not implemented.'); }
    findPrevious() { throw new Error('Method not implemented.'); }
    updateVisibility() { throw new Error('Method not implemented.'); }
}
export class TestTerminalProfileService {
    constructor() {
        this.availableProfiles = [];
        this.contributedProfiles = [];
        this.profilesReady = Promise.resolve();
        this.onDidChangeAvailableProfiles = Event.None;
    }
    getPlatformKey() { throw new Error('Method not implemented.'); }
    refreshAvailableProfiles() { throw new Error('Method not implemented.'); }
    getDefaultProfileName() { throw new Error('Method not implemented.'); }
    getDefaultProfile() { throw new Error('Method not implemented.'); }
    getContributedDefaultProfile(shellLaunchConfig) { throw new Error('Method not implemented.'); }
    registerContributedProfile(args) { throw new Error('Method not implemented.'); }
    getContributedProfileProvider(extensionIdentifier, id) { throw new Error('Method not implemented.'); }
    registerTerminalProfileProvider(extensionIdentifier, id, profileProvider) { throw new Error('Method not implemented.'); }
}
export class TestTerminalProfileResolverService {
    constructor() {
        this.defaultProfileName = '';
    }
    resolveIcon(shellLaunchConfig) { }
    async resolveShellLaunchConfig(shellLaunchConfig, options) { }
    async getDefaultProfile(options) { return { path: '/default', profileName: 'Default', isDefault: true }; }
    async getDefaultShell(options) { return '/default'; }
    async getDefaultShellArgs(options) { return []; }
    getDefaultIcon() { return Codicon.terminal; }
    async getEnvironment() { return env; }
    getSafeConfigValue(key, os) { return undefined; }
    getSafeConfigValueFullKey(key) { return undefined; }
    createProfileFromShellAndShellArgs(shell, shellArgs) { throw new Error('Method not implemented.'); }
}
export class TestTerminalConfigurationService extends TerminalConfigurationService {
    get fontMetrics() { return this._fontMetrics; }
    // eslint-disable-next-line local/code-no-any-casts
    setConfig(config) { this._config = config; }
}
export class TestQuickInputService {
    constructor() {
        this.onShow = Event.None;
        this.onHide = Event.None;
        this.alignment = observableValue('TestQuickInputService.alignment', 'top');
        this.currentQuickInput = undefined;
        this.quickAccess = undefined;
    }
    async pick(picks, options, token) {
        if (Array.isArray(picks)) {
            // eslint-disable-next-line local/code-no-any-casts
            return { label: 'selectedPick', description: 'pick description', value: 'selectedPick' };
        }
        else {
            return undefined;
        }
    }
    async input(options, token) { return options ? 'resolved' + options.prompt : 'resolved'; }
    createQuickPick() { throw new Error('not implemented.'); }
    createInputBox() { throw new Error('not implemented.'); }
    createQuickWidget() { throw new Error('Method not implemented.'); }
    createQuickTree() { throw new Error('not implemented.'); }
    focus() { throw new Error('not implemented.'); }
    toggle() { throw new Error('not implemented.'); }
    navigate(next, quickNavigate) { throw new Error('not implemented.'); }
    accept() { throw new Error('not implemented.'); }
    back() { throw new Error('not implemented.'); }
    cancel() { throw new Error('not implemented.'); }
    setAlignment(alignment) { throw new Error('not implemented.'); }
    toggleHover() { throw new Error('not implemented.'); }
}
class TestLanguageDetectionService {
    isEnabledForLanguage(languageId) { return false; }
    async detectLanguage(resource, supportedLangs) { return undefined; }
}
export class TestRemoteAgentService {
    getConnection() { return null; }
    async getEnvironment() { return null; }
    async getRawEnvironment() { return null; }
    async getExtensionHostExitInfo(reconnectionToken) { return null; }
    async getDiagnosticInfo(options) { return undefined; }
    async updateTelemetryLevel(telemetryLevel) { }
    async logTelemetry(eventName, data) { }
    async flushTelemetry() { }
    async getRoundTripTime() { return undefined; }
    async endConnection() { }
}
export class TestRemoteExtensionsScannerService {
    async whenExtensionsReady() { return { failed: [] }; }
    scanExtensions() { throw new Error('Method not implemented.'); }
}
export class TestWorkbenchExtensionEnablementService {
    constructor() {
        this.onEnablementChanged = Event.None;
    }
    getEnablementState(extension) { return 12 /* EnablementState.EnabledGlobally */; }
    getEnablementStates(extensions, workspaceTypeOverrides) { return []; }
    getDependenciesEnablementStates(extension) { return []; }
    canChangeEnablement(extension) { return true; }
    canChangeWorkspaceEnablement(extension) { return true; }
    isEnabled(extension) { return true; }
    isEnabledEnablementState(enablementState) { return true; }
    isDisabledGlobally(extension) { return false; }
    async setEnablement(extensions, state) { return []; }
    async updateExtensionsEnablementsWhenWorkspaceTrustChanges() { }
}
export class TestWorkbenchExtensionManagementService {
    constructor() {
        this.onInstallExtension = Event.None;
        this.onDidInstallExtensions = Event.None;
        this.onUninstallExtension = Event.None;
        this.onDidUninstallExtension = Event.None;
        this.onDidUpdateExtensionMetadata = Event.None;
        this.onProfileAwareInstallExtension = Event.None;
        this.onProfileAwareDidInstallExtensions = Event.None;
        this.onProfileAwareUninstallExtension = Event.None;
        this.onProfileAwareDidUninstallExtension = Event.None;
        this.onDidProfileAwareUninstallExtensions = Event.None;
        this.onProfileAwareDidUpdateExtensionMetadata = Event.None;
        this.onDidChangeProfile = Event.None;
        this.onDidEnableExtensions = Event.None;
        this.preferPreReleases = true;
    }
    installVSIX(location, manifest, installOptions) {
        throw new Error('Method not implemented.');
    }
    installFromLocation(location) {
        throw new Error('Method not implemented.');
    }
    installGalleryExtensions(extensions) {
        throw new Error('Method not implemented.');
    }
    async updateFromGallery(gallery, extension, installOptions) { return extension; }
    zip(extension) {
        throw new Error('Method not implemented.');
    }
    getManifest(vsix) {
        throw new Error('Method not implemented.');
    }
    install(vsix, options) {
        throw new Error('Method not implemented.');
    }
    isAllowed() { return true; }
    async canInstall(extension) { return true; }
    installFromGallery(extension, options) {
        throw new Error('Method not implemented.');
    }
    uninstall(extension, options) {
        throw new Error('Method not implemented.');
    }
    uninstallExtensions(extensions) {
        throw new Error('Method not implemented.');
    }
    async getInstalled(type) { return []; }
    getExtensionsControlManifest() {
        throw new Error('Method not implemented.');
    }
    async updateMetadata(local, metadata) { return local; }
    registerParticipant(pariticipant) { }
    async getTargetPlatform() { return "undefined" /* TargetPlatform.UNDEFINED */; }
    async cleanUp() { }
    download() {
        throw new Error('Method not implemented.');
    }
    copyExtensions() { throw new Error('Not Supported'); }
    toggleApplicationScope() { throw new Error('Not Supported'); }
    installExtensionsFromProfile() { throw new Error('Not Supported'); }
    whenProfileChanged(from, to) { throw new Error('Not Supported'); }
    getInstalledWorkspaceExtensionLocations() { throw new Error('Method not implemented.'); }
    getInstalledWorkspaceExtensions() { throw new Error('Method not implemented.'); }
    installResourceExtension() { throw new Error('Method not implemented.'); }
    getExtensions() { throw new Error('Method not implemented.'); }
    resetPinnedStateForAllUserExtensions(pinned) { throw new Error('Method not implemented.'); }
    getInstallableServers(extension) { throw new Error('Method not implemented.'); }
    isPublisherTrusted(extension) { return false; }
    getTrustedPublishers() { return []; }
    trustPublishers() { }
    untrustPublishers() { }
    async requestPublisherTrust(extensions) { }
}
export class TestWebExtensionsScannerService {
    constructor() {
        this.onDidChangeProfile = Event.None;
    }
    async scanSystemExtensions() { return []; }
    async scanUserExtensions() { return []; }
    async scanExtensionsUnderDevelopment() { return []; }
    async copyExtensions() {
        throw new Error('Method not implemented.');
    }
    scanExistingExtension(extensionLocation, extensionType) {
        throw new Error('Method not implemented.');
    }
    addExtension(location, metadata) {
        throw new Error('Method not implemented.');
    }
    addExtensionFromGallery(galleryExtension, metadata) {
        throw new Error('Method not implemented.');
    }
    removeExtension() {
        throw new Error('Method not implemented.');
    }
    updateMetadata(extension, metaData, profileLocation) {
        throw new Error('Method not implemented.');
    }
    scanExtensionManifest(extensionLocation) {
        throw new Error('Method not implemented.');
    }
}
export async function workbenchTeardown(instantiationService) {
    return instantiationService.invokeFunction(async (accessor) => {
        const workingCopyService = accessor.get(IWorkingCopyService);
        const editorGroupService = accessor.get(IEditorGroupsService);
        for (const workingCopy of workingCopyService.workingCopies) {
            await workingCopy.revert();
        }
        for (const group of editorGroupService.groups) {
            await group.closeAllEditors();
        }
        for (const group of editorGroupService.groups) {
            editorGroupService.removeGroup(group);
        }
    });
}
export class TestContextMenuService {
    constructor() {
        this.onDidShowContextMenu = Event.None;
        this.onDidHideContextMenu = Event.None;
    }
    showContextMenu(delegate) {
        throw new Error('Method not implemented.');
    }
}
export class TestChatWidgetService {
    constructor() {
        this.onDidAddWidget = Event.None;
        this.onDidBackgroundSession = Event.None;
        this.onDidChangeFocusedWidget = Event.None;
        this.onDidChangeFocusedSession = Event.None;
    }
    async reveal(widget, preserveFocus) { return false; }
    async revealWidget(preserveFocus) { return undefined; }
    getAllWidgets() { return []; }
    getWidgetByInputUri(uri) { return undefined; }
    async openSession(sessionResource, target, options) { return undefined; }
    getWidgetBySessionResource(sessionResource) { return undefined; }
    getWidgetsByLocations(location) { return []; }
    register(newWidget) { return Disposable.None; }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFLaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsUUFBUSxFQUE0QyxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUVsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDckUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEVBQXVCLFNBQVMsRUFBbUIsTUFBTSxrQ0FBa0MsQ0FBQztBQUNuRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsa0JBQWtCLEVBQXdCLE1BQU0sZ0NBQWdDLENBQUM7QUFFMUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzdFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUVsRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsUUFBUSxJQUFJLGNBQWMsRUFBYSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFckUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDaEYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFFbEgsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDOUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDdkYsT0FBTyxFQUFFLCtCQUErQixFQUFFLDhCQUE4QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0ksT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDL0YsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDckcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDL0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDakosT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDbkgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQ3pILE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQ3BILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBQ25ILE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBQzFILE9BQU8sRUFBRSxzQkFBc0IsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQy9ILE9BQU8sRUFBK0MsWUFBWSxFQUE2QyxNQUFNLDZDQUE2QyxDQUFDO0FBRW5LLE9BQU8sRUFBdUIscUJBQXFCLEVBQXVCLE1BQU0seURBQXlELENBQUM7QUFDMUksT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDbkgsT0FBTyxFQUFtQixrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2pHLE9BQU8sRUFBNEIsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxSSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUVqRyxPQUFPLEVBQWlCLGNBQWMsRUFBRSxrQkFBa0IsRUFBK0QsTUFBTSw2Q0FBNkMsQ0FBQztBQUM3SyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUUvRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUcxRixPQUFPLEVBQWtLLFlBQVksRUFBd0ksTUFBTSx5Q0FBeUMsQ0FBQztBQUM3VyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDNUUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDMUcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN2RixPQUFPLEVBQUUscUJBQXFCLEVBQXFCLE1BQU0seURBQXlELENBQUM7QUFDbkgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDbkgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDakksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUMzSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDN0UsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDN0YsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDaEgsT0FBTyxPQUFPLE1BQU0sNkNBQTZDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3JGLE9BQU8sRUFBb0ksZ0JBQWdCLEVBQXlDLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3BRLE9BQU8sRUFBNkQsa0JBQWtCLEVBQTBJLE1BQU0sbURBQW1ELENBQUM7QUFDMVIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBR3pFLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3hJLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sNkNBQTZDLENBQUM7QUFDM0csT0FBTyxFQUFrQixpQkFBaUIsRUFBa0IsTUFBTSxpREFBaUQsQ0FBQztBQUNwSCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM1RixPQUFPLEVBQW1FLG1CQUFtQixFQUF1RSxNQUFNLCtDQUErQyxDQUFDO0FBQzFOLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDM0YsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDakYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBb0Isd0JBQXdCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUVsSixPQUFPLEVBQUUsd0JBQXdCLEVBQXdCLE1BQU0saURBQWlELENBQUM7QUFDakgsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdkksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3pGLE9BQU8sRUFBaUYsa0JBQWtCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0SyxPQUFPLEVBQUUsb0JBQW9CLEVBQXVCLE1BQU0seUJBQXlCLENBQUM7QUFDcEYsT0FBTyxFQUEwQyxVQUFVLElBQUksdUJBQXVCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUUvSCxPQUFPLEVBQUUsMkJBQTJCLEVBQW1GLE1BQU0sc0NBQXNDLENBQUM7QUFDcEssT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFdEYsT0FBTyxFQUFFLGdCQUFnQixFQUFrRyxnQkFBZ0IsSUFBSSxVQUFVLEVBQTZiLE1BQU0sd0JBQXdCLENBQUM7QUFFcm5CLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUd6RixPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUdyRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDekYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNFLE9BQU8sRUFBNEQsNkJBQTZCLEVBQUUsc0JBQXNCLEVBQWtCLHFCQUFxQixFQUFxQix3QkFBd0IsRUFBMEIsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6UixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUU5RyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUN6RyxPQUFPLEVBQStGLCtCQUErQixFQUFFLHVCQUF1QixFQUErQixNQUFNLDJDQUEyQyxDQUFDO0FBQy9PLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQy9GLE9BQU8sRUFBc0QsbUJBQW1CLEVBQWtDLE1BQU0sa0RBQWtELENBQUM7QUFDM0ssT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDL0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLHlCQUF5QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDL0gsT0FBTyxFQUE4UyxvQkFBb0IsRUFBdUksTUFBTSxxREFBcUQsQ0FBQztBQUM1Z0IsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdkYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDL0YsT0FBTyxFQUF1QixjQUFjLEVBQXFGLE1BQU0sK0NBQStDLENBQUM7QUFDdkwsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDOUcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFdkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbkYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDMUYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLDBCQUEwQixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDOUksT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxZQUFZLEVBQStCLE1BQU0scUNBQXFDLENBQUM7QUFDaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDJFQUEyRSxDQUFDO0FBQ3RILE9BQU8sRUFBOEIsdUJBQXVCLEVBQXdFLE1BQU0sZ0RBQWdELENBQUM7QUFDM0wsT0FBTyxFQUFFLGlCQUFpQixFQUE0RixNQUFNLDhDQUE4QyxDQUFDO0FBQzNLLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUMzRixPQUFPLEVBQWtELG1CQUFtQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDekksT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBcUIsTUFBTSxvREFBb0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUM1RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQTJFLGdCQUFnQixFQUFpRCxNQUFNLDZDQUE2QyxDQUFDO0FBQ3ZNLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQy9HLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3BHLE9BQU8sRUFBbUMsMEJBQTBCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNySyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUV6RyxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUVqSCxPQUFPLEVBQThCLHlCQUF5QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDL0gsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDakgsT0FBTyxFQUFFLHlCQUF5QixFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDcEksT0FBTyxFQUFFLHVCQUF1QixFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDOUgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDbEgsT0FBTyxFQUFFLDBCQUEwQixFQUFFLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLGVBQWUsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxrQkFBa0IsRUFBRSxrQkFBa0IsRUFBRSxpQ0FBaUMsRUFBRSxtQ0FBbUMsRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdXLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRTFGLG9CQUFvQjtBQUNwQixPQUFPLEVBQUUsZUFBZSxFQUFFLG9CQUFvQixFQUFFLENBQUM7QUFFakQsTUFBTSxVQUFVLHFCQUFxQixDQUFDLG9CQUEyQyxFQUFFLFFBQWE7SUFDL0YsT0FBTyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsZUFBZSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQ3pJLENBQUM7QUFFRCxRQUFRLENBQUMsRUFBRSxDQUF5QixnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQztJQUU3RixNQUFNLEVBQUUsb0JBQW9CO0lBRTVCLGdCQUFnQixFQUFFLENBQUMsUUFBUSxFQUFFLGlCQUFpQixFQUFFLGFBQWEsRUFBRSxvQkFBb0IsRUFBRSxpQkFBaUIsRUFBRSxtQkFBbUIsRUFBRSxpQkFBaUIsRUFBRSxvQkFBb0IsRUFBb0IsRUFBRTtRQUN6TCxPQUFPLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxlQUFlLEVBQUUsUUFBUSxFQUFFLGlCQUFpQixFQUFFLGFBQWEsRUFBRSxvQkFBb0IsRUFBRSxpQkFBaUIsRUFBRSxtQkFBbUIsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBQzFMLENBQUM7SUFFRCxZQUFZLEVBQUUsQ0FBQyxHQUFHLEVBQTJCLEVBQUU7UUFDOUMsT0FBTyxHQUFHLFlBQVksZUFBZSxDQUFDO0lBQ3ZDLENBQUM7Q0FDRCxDQUFDLENBQUM7QUFFSCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsa0JBQWtCO0lBRTFDLG1CQUFtQixDQUFDLE1BQW1CLEVBQUUsYUFBa0I7UUFDN0UsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsY0FBYyxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxSCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sa0JBQW1CLFNBQVEsY0FBYztJQUVsQyxtQkFBbUIsQ0FBQyxNQUFtQixFQUFFLGFBQWtCO1FBQzdFLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGNBQWMsRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLEVBQUUsYUFBYSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3SSxDQUFDO0lBRUQsWUFBWSxDQUFDLFNBQWdDLEVBQUUsTUFBdUM7UUFDckYsSUFBSSxDQUFDLFFBQVEsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBcUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFbEcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVRLFlBQVk7UUFDcEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQztRQUM3QixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZCxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxhQUFhLEdBQUksT0FBOEIsQ0FBQyxTQUFTLENBQUM7UUFDaEUsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLElBQUksdUJBQXVCLENBQUMsSUFBSSxTQUFTLENBQUMsYUFBYSxDQUFDLGVBQWUsRUFBRSxhQUFhLENBQUMsV0FBVyxFQUFFLGFBQWEsQ0FBQyxhQUFhLElBQUksYUFBYSxDQUFDLGVBQWUsRUFBRSxhQUFhLENBQUMsU0FBUyxJQUFJLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQ2pPLENBQUM7Q0FDRDtBQU1ELE1BQU0sT0FBTyxzQkFBdUIsU0FBUSxrQkFBa0I7SUFDN0QseUJBQXlCLENBQUMsV0FBeUI7UUFDbEQsT0FBTyxLQUFLLENBQUMscUJBQXFCLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDakQsQ0FBQztDQUNEO0FBRUQsTUFBTSxVQUFVLDZCQUE2QixDQUM1QyxTQVVDLEVBQ0QsY0FBNEMsSUFBSSxlQUFlLEVBQUU7SUFFakUsTUFBTSxvQkFBb0IsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksd0JBQXdCLENBQUMsSUFBSSxpQkFBaUIsQ0FDOUYsQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksb0JBQW9CLEVBQUUsQ0FBQyxDQUFDLEVBQ2hFLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxjQUFjLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUN2RSxDQUFDLENBQUMsQ0FBQztJQUVKLG9CQUFvQixDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUMvRCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsSUFBSSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7SUFDL0Usb0JBQW9CLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxzQkFBc0IsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM5RixNQUFNLGtCQUFrQixHQUFHLFNBQVMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDO0lBQ3ZJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0lBQ25FLG9CQUFvQixDQUFDLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0lBQzVFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO0lBQzdELE1BQU0saUJBQWlCLEdBQUcsU0FBUyxFQUFFLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDeEssb0JBQW9CLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDakUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLElBQUksbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZFLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUN0RSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztJQUM3RSxNQUFNLGFBQWEsR0FBRyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLHdCQUF3QixDQUFDO1FBQzNJLEtBQUssRUFBRTtZQUNOLFlBQVksRUFBRTtnQkFDYixPQUFPLEVBQUUsS0FBSzthQUNkO1NBQ0Q7S0FDRCxDQUFDLENBQUM7SUFDSCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDaEUsTUFBTSxnQ0FBZ0MsR0FBRyxJQUFJLG9DQUFvQyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ2pHLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDO0lBQy9GLG9CQUFvQixDQUFDLElBQUksQ0FBQywwQkFBMEIsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN2SSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN0RixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxzQkFBc0IsRUFBRSxDQUFDLENBQUM7SUFDN0Usb0JBQW9CLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLElBQUksNEJBQTRCLEVBQUUsQ0FBQyxDQUFDO0lBQ3pGLG9CQUFvQixDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7SUFDdEksTUFBTSxhQUFhLEdBQUcsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO0lBQzlDLG9CQUFvQixDQUFDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUNsRSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO0lBQ25FLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO0lBQzVELG9CQUFvQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0lBQ3ZFLG1EQUFtRDtJQUNuRCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLEVBQUU7UUFDdEQsVUFBVSxFQUFFLEtBQUssSUFBSSxFQUFFLEdBQUcsQ0FBQztRQUMzQixjQUFjLENBQUMsTUFBZSxJQUFJLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztLQUMxQyxDQUFDLENBQUM7SUFDVixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztJQUMxRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ25ILG9CQUFvQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxJQUFJLHVCQUF1QixFQUFFLENBQUMsQ0FBQztJQUNuRixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsK0JBQStCLEVBQUUsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQztJQUNoSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO0lBQ3JFLG9CQUFvQixDQUFDLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxJQUFJLGlDQUFpQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFDaEgsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO0lBQ2xHLE1BQU0sWUFBWSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztJQUM1QyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ3ZELG9CQUFvQixDQUFDLElBQUksQ0FBQyw2QkFBNkIsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksZ0NBQWdDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDbEgsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLElBQUksNEJBQTRCLEVBQUUsQ0FBQyxDQUFDO0lBQ3pGLG9CQUFvQixDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdHLE1BQU0sV0FBVyxHQUFHLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7SUFDbEksb0JBQW9CLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxXQUFXLENBQUMsQ0FBQztJQUNyRCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyRyxNQUFNLGFBQWEsR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7SUFDOUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUN6RCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDM0ksTUFBTSx1QkFBdUIsR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkssb0JBQW9CLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxzQkFBc0IsQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEksb0JBQW9CLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLFNBQVMsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLHdCQUF3QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSw0QkFBNEIsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM1TSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztJQUNuRSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsSUFBSSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7SUFDL0Usb0JBQW9CLENBQUMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3ZJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO0lBQy9ELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxxQkFBcUIsRUFBRSxDQUFDO0lBQ3RELG9CQUFvQixDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBQ2pFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLHNCQUFzQixFQUFFLENBQUMsQ0FBQztJQUM3RSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxvQkFBb0IsRUFBRSxDQUFDLENBQUM7SUFDekUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQW1CLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4TixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFnQixvQkFBb0IsQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztJQUM1RyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQXFCLFdBQVcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hKLG9CQUFvQixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGlCQUFpQixDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuSCxNQUFNLGtCQUFrQixHQUFHLElBQUksdUJBQXVCLENBQUMsQ0FBQyxJQUFJLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyRixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUNwRSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFpQixXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUgsTUFBTSxhQUFhLEdBQUcsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO0lBQzVKLG9CQUFvQixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDekQsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZFLG9CQUFvQixDQUFDLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNySSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDL0gsTUFBTSxpQkFBaUIsR0FBRyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7SUFDckwsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDakUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxhQUFhLEVBQUUsWUFBWSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMseUJBQXlCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3RHLG9CQUFvQixDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO0lBQy9ELG9CQUFvQixDQUFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN6SCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDekgsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxpQkFBaUIsQ0FBQyxhQUFhLEVBQUUsb0JBQW9CLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5TCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxxQkFBcUIsRUFBRSxDQUFDLENBQUM7SUFDM0Usb0JBQW9CLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxtQ0FBbUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN4SCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsNkJBQTZCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGdDQUFnQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN2SCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsSUFBSSwyQkFBMkIsRUFBRSxDQUFDLENBQUM7SUFDdkYsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLElBQUkseUJBQXlCLEVBQUUsQ0FBQyxDQUFDO0lBQ25GLG9CQUFvQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLHdCQUF3QixFQUFFLENBQUMsQ0FBQztJQUNqRixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsSUFBSSwwQkFBMEIsRUFBRSxDQUFDLENBQUM7SUFDckYsb0JBQW9CLENBQUMsSUFBSSxDQUFDLCtCQUErQixFQUFFLElBQUksa0NBQWtDLEVBQUUsQ0FBQyxDQUFDO0lBQ3JHLG9CQUFvQixDQUFDLElBQUksQ0FBQyw2QkFBNkIsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqSixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDekgsb0JBQW9CLENBQUMsSUFBSSxDQUFDLDJCQUEyQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3pJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLDBCQUEwQixFQUFFLENBQUMsQ0FBQztJQUNsRixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsSUFBSSwwQkFBMEIsRUFBRSxDQUFDLENBQUM7SUFDekYsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSx3QkFBd0IsQ0FBQyxhQUFhLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUksb0JBQW9CLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzNELG9CQUFvQixDQUFDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLDBCQUEwQixFQUFFLENBQUMsQ0FBQztJQUNyRixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQztJQUNsSCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQztJQUMxRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLEVBQUUscUJBQXFCLENBQUMsQ0FBQztJQUV6RSxPQUFPLG9CQUFvQixDQUFDO0FBQzdCLENBQUM7QUFFTSxJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFtQjtJQUMvQixZQUMyQixnQkFBc0MsRUFDdkMsZUFBb0MsRUFDbEMsaUJBQXFDLEVBQ2hDLHNCQUErQyxFQUM1Qyx5QkFBd0QsRUFDMUQsY0FBa0MsRUFDN0MsWUFBMEIsRUFDM0IsV0FBNEIsRUFDdEIsaUJBQXdDLEVBQzVDLGFBQWdDLEVBQzNCLGtCQUEwQyxFQUMvQyxhQUFnQyxFQUM1QixpQkFBcUMsRUFDM0Isa0JBQWdELEVBQ2hFLFdBQXlCLEVBQ2pCLGtCQUF3QyxFQUN0QyxxQkFBNkMsRUFDbkQsZUFBaUMsRUFDaEMsd0JBQTJDLEVBQ2xDLHlCQUFvRCxFQUN6RCx3QkFBa0QsRUFDOUMsd0JBQXNELEVBQ25FLFdBQTRCLEVBQ3RCLGlCQUFxQyxFQUMxQyxZQUEyQixFQUM3QixVQUF1QixFQUNmLGtCQUF1QyxFQUNyQyxtQkFBMEMsRUFDM0MsbUJBQXlDLEVBQ3BDLHdCQUFtRCxFQUN2RCxvQkFBMkMsRUFDNUMsbUJBQXlDLEVBQ2hDLDRCQUE4RCxFQUN4RSxrQkFBdUMsRUFDMUMsZUFBaUM7UUFsQ2hDLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBc0I7UUFDdkMsb0JBQWUsR0FBZixlQUFlLENBQXFCO1FBQ2xDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFDaEMsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF5QjtRQUM1Qyw4QkFBeUIsR0FBekIseUJBQXlCLENBQStCO1FBQzFELG1CQUFjLEdBQWQsY0FBYyxDQUFvQjtRQUM3QyxpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUMzQixnQkFBVyxHQUFYLFdBQVcsQ0FBaUI7UUFDdEIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUF1QjtRQUM1QyxrQkFBYSxHQUFiLGFBQWEsQ0FBbUI7UUFDM0IsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUF3QjtRQUMvQyxrQkFBYSxHQUFiLGFBQWEsQ0FBbUI7UUFDNUIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUMzQix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQThCO1FBQ2hFLGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ2pCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBc0I7UUFDdEMsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF3QjtRQUNuRCxvQkFBZSxHQUFmLGVBQWUsQ0FBa0I7UUFDaEMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUFtQjtRQUNsQyw4QkFBeUIsR0FBekIseUJBQXlCLENBQTJCO1FBQ3pELDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBMEI7UUFDOUMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUE4QjtRQUNuRSxnQkFBVyxHQUFYLFdBQVcsQ0FBaUI7UUFDdEIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUMxQyxpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUM3QixlQUFVLEdBQVYsVUFBVSxDQUFhO1FBQ2YsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQjtRQUNyQyx3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXVCO1FBQzNDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBc0I7UUFDcEMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEyQjtRQUN2RCx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQzVDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBc0I7UUFDaEMsaUNBQTRCLEdBQTVCLDRCQUE0QixDQUFrQztRQUN4RSx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQzFDLG9CQUFlLEdBQWYsZUFBZSxDQUFrQjtJQUN2RCxDQUFDO0NBQ0wsQ0FBQTtBQXRDWSxtQkFBbUI7SUFFN0IsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGdCQUFnQixDQUFBO0lBQ2hCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSx1QkFBdUIsQ0FBQTtJQUN2QixXQUFBLDBCQUEwQixDQUFBO0lBQzFCLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSxhQUFhLENBQUE7SUFDYixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxjQUFjLENBQUE7SUFDZCxZQUFBLG1CQUFtQixDQUFBO0lBQ25CLFlBQUEsY0FBYyxDQUFBO0lBQ2QsWUFBQSxrQkFBa0IsQ0FBQTtJQUNsQixZQUFBLDRCQUE0QixDQUFBO0lBQzVCLFlBQUEsWUFBWSxDQUFBO0lBQ1osWUFBQSxvQkFBb0IsQ0FBQTtJQUNwQixZQUFBLHNCQUFzQixDQUFBO0lBQ3RCLFlBQUEsZ0JBQWdCLENBQUE7SUFDaEIsWUFBQSxpQkFBaUIsQ0FBQTtJQUNqQixZQUFBLDBCQUEwQixDQUFBO0lBQzFCLFlBQUEscUJBQXFCLENBQUE7SUFDckIsWUFBQSx5QkFBeUIsQ0FBQTtJQUN6QixZQUFBLFlBQVksQ0FBQTtJQUNaLFlBQUEsa0JBQWtCLENBQUE7SUFDbEIsWUFBQSxhQUFhLENBQUE7SUFDYixZQUFBLFdBQVcsQ0FBQTtJQUNYLFlBQUEsbUJBQW1CLENBQUE7SUFDbkIsWUFBQSxxQkFBcUIsQ0FBQTtJQUNyQixZQUFBLG9CQUFvQixDQUFBO0lBQ3BCLFlBQUEseUJBQXlCLENBQUE7SUFDekIsWUFBQSxxQkFBcUIsQ0FBQTtJQUNyQixZQUFBLG9CQUFvQixDQUFBO0lBQ3BCLFlBQUEsNkJBQTZCLENBQUE7SUFDN0IsWUFBQSxtQkFBbUIsQ0FBQTtJQUNuQixZQUFBLGdCQUFnQixDQUFBO0dBcENOLG1CQUFtQixDQXNDL0I7O0FBRU0sSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxzQkFBc0I7SUFJOUQsWUFDZSxXQUF5QixFQUNYLHlCQUEwRCxFQUNuRSxnQkFBbUMsRUFDL0Isb0JBQTJDLEVBQ25ELFlBQTJCLEVBQ1osa0JBQWdELEVBQzlELGFBQTZCLEVBQ3pCLGlCQUFxQyxFQUN0QixnQ0FBbUUsRUFDMUUseUJBQXFELEVBQzdELGlCQUFxQyxFQUMzQyxXQUF5QixFQUNkLHNCQUErQyxFQUNuRCxrQkFBdUMsRUFDMUMsZUFBaUMsRUFDdEMsVUFBdUIsRUFDZCxtQkFBeUMsRUFDMUMsa0JBQXVDO1FBRTVELEtBQUssQ0FDSixXQUFXLEVBQ1gseUJBQXlCLEVBQ3pCLGdCQUFnQixFQUNoQixvQkFBb0IsRUFDcEIsWUFBWSxFQUNaLGtCQUFrQixFQUNsQixhQUFhLEVBQ2IsaUJBQWlCLEVBQ2pCLGdDQUFnQyxFQUNoQyx5QkFBeUIsRUFDekIsaUJBQWlCLEVBQ2pCLFdBQVcsRUFDWCxzQkFBc0IsRUFDdEIsa0JBQWtCLEVBQ2xCLGVBQWUsRUFDZixtQkFBbUIsRUFDbkIsVUFBVSxFQUNWLGtCQUFrQixDQUNsQixDQUFDO1FBMUNLLG9CQUFlLEdBQW1DLFNBQVMsQ0FBQztRQUM1RCxlQUFVLEdBQW1DLFNBQVMsQ0FBQztJQTBDL0QsQ0FBQztJQUVELHNCQUFzQixDQUFDLEtBQXlCO1FBQy9DLElBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO0lBQzlCLENBQUM7SUFFUSxLQUFLLENBQUMsVUFBVSxDQUFDLFFBQWEsRUFBRSxPQUE4QjtRQUN0RSxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUMxQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDO1lBQ25DLElBQUksQ0FBQyxlQUFlLEdBQUcsU0FBUyxDQUFDO1lBRWpDLE1BQU0sS0FBSyxDQUFDO1FBQ2IsQ0FBQztRQUVELE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3pFLE9BQU87WUFDTixRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVE7WUFDMUIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO1lBQ2xCLEtBQUssRUFBRSxPQUFPLENBQUMsS0FBSztZQUNwQixLQUFLLEVBQUUsT0FBTyxDQUFDLEtBQUs7WUFDcEIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO1lBQ2xCLFFBQVEsRUFBRSxNQUFNO1lBQ2hCLEtBQUssRUFBRSxNQUFNLGlDQUFpQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7WUFDN0QsSUFBSSxFQUFFLEVBQUU7WUFDUixRQUFRLEVBQUUsS0FBSztZQUNmLE1BQU0sRUFBRSxLQUFLO1lBQ2IsVUFBVSxFQUFFLEtBQUs7U0FDakIsQ0FBQztJQUNILENBQUM7SUFFRCxpQkFBaUIsQ0FBQyxLQUF5QjtRQUMxQyxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztJQUN6QixDQUFDO0lBRVEsS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFhLEVBQUUsS0FBNkIsRUFBRSxPQUErQjtRQUNqRyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNyQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1lBQzlCLElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO1lBRTVCLE1BQU0sS0FBSyxDQUFDO1FBQ2IsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzlDLENBQUM7Q0FDRCxDQUFBO0FBeEZZLG1CQUFtQjtJQUs3QixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsMEJBQTBCLENBQUE7SUFDMUIsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsV0FBQSw0QkFBNEIsQ0FBQTtJQUM1QixXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxpQ0FBaUMsQ0FBQTtJQUNqQyxXQUFBLDBCQUEwQixDQUFBO0lBQzFCLFlBQUEsa0JBQWtCLENBQUE7SUFDbEIsWUFBQSxZQUFZLENBQUE7SUFDWixZQUFBLHVCQUF1QixDQUFBO0lBQ3ZCLFlBQUEsbUJBQW1CLENBQUE7SUFDbkIsWUFBQSxnQkFBZ0IsQ0FBQTtJQUNoQixZQUFBLFdBQVcsQ0FBQTtJQUNYLFlBQUEsb0JBQW9CLENBQUE7SUFDcEIsWUFBQSxtQkFBbUIsQ0FBQTtHQXRCVCxtQkFBbUIsQ0F3Ri9COztBQUVELE1BQU0sT0FBTywrQ0FBZ0QsU0FBUSxzQkFBc0I7SUFHMUYsSUFBYSxRQUFRO1FBQ3BCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO1FBQ25HLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDM0IsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGtCQUFtQixTQUFRLGNBQWM7SUFFckQsSUFBdUIsaUJBQWlCO1FBQ3ZDLE9BQU87WUFDTixFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRTtZQUMzQyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRTtZQUMzQyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRTtTQUNqRCxDQUFDO0lBQ0gsQ0FBQztJQUVELElBQXVCLGlCQUFpQixDQUFDLFNBQThCLElBQUksQ0FBQztDQUM1RTtBQUVELE1BQU0sOEJBQStCLFNBQVEsa0NBQWtDO0lBQS9FOztRQUNDLFNBQUksR0FBRyxFQUFFLENBQUM7SUFDWCxDQUFDO0NBQUE7QUFFRCxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLDhCQUE4QixDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztBQUUxSyxNQUFNLE9BQU8sbUJBQW1CO0lBSS9CLFlBQVksQ0FDWCxPQUFzSSxFQUN0SSxJQUEwRCxFQUMxRCxXQUFpRTtRQUVqRSxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUIsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLHNCQUFzQjtJQUFuQztRQUlVLDJCQUFzQixHQUEwQyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBSXJGLENBQUM7SUFGQSwyQkFBMkIsQ0FBQyxTQUErQixJQUFpQixPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3JHLGFBQWEsQ0FBQyxJQUFTLEVBQUUsZ0JBQXlCLEVBQUUsVUFBNEIsSUFBNkIsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0NBQ2hJO0FBRUQsTUFBTSxPQUFPLGVBQWU7SUFJM0IsVUFBVSxDQUFDLEdBQVcsRUFBRSx3QkFBNEM7UUFDbkUsT0FBTztZQUNOLFdBQVcsRUFBRSxLQUFLLENBQUMsSUFBSTtZQUN2QixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUztZQUN4QixVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtTQUNwQixDQUFDO0lBQ0gsQ0FBQztJQUVELGNBQWMsQ0FBQyxFQUFVLEVBQUUsaUJBQXFDLEVBQUUsT0FBNEI7UUFDN0YsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxlQUFlLENBQUMsRUFBVTtRQUN6QixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELGlCQUFpQjtRQUNoQixVQUFVO0lBQ1gsQ0FBQztDQUNEO0FBRU0sSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBcUI7SUFNakMsWUFDZ0MsV0FBeUI7UUFBekIsZ0JBQVcsR0FBWCxXQUFXLENBQWM7SUFDckQsQ0FBQztJQUNMLEtBQUssQ0FBQyxlQUFlLENBQUMsYUFBc0IsSUFBa0IsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNuRyxLQUFLLENBQUMsaUJBQWlCLENBQUMsYUFBc0IsSUFBa0IsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNyRyxLQUFLLENBQUMsb0JBQW9CLENBQUMsYUFBc0IsSUFBa0IsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN4RyxLQUFLLENBQUMsYUFBYSxDQUFDLGFBQXNCLElBQWtCLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakcscUJBQXFCLENBQUMsUUFBNkIsSUFBa0IsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqRyxlQUFlLENBQUMsUUFBNkIsSUFBa0IsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzRixpQkFBaUIsQ0FBQyxRQUE2QixJQUFrQixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdGLG9CQUFvQixDQUFDLFFBQTZCLElBQWtCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFHaEcsaUJBQWlCLENBQUMsSUFBUyxJQUFVLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUM5RCxjQUFjLENBQUMsVUFBZSxFQUFFLG9CQUErQixJQUE4QixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUV2SSxjQUFjLENBQUMsUUFBNEIsSUFBOEIsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3RyxjQUFjLENBQUMsUUFBNEIsSUFBZ0MsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUUvRyxnQkFBZ0IsQ0FBQyxNQUFxQixJQUFVLElBQUksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUM5RSxlQUFlLENBQUMsb0JBQXNDLElBQTRCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQy9ILENBQUE7QUEzQlkscUJBQXFCO0lBTy9CLFdBQUEsWUFBWSxDQUFBO0dBUEYscUJBQXFCLENBMkJqQzs7QUFFRCxNQUFNLE9BQU8saUJBQWlCO0lBQTlCO1FBSUMseUJBQW9CLEdBQUcsS0FBSyxDQUFDO1FBRTdCLDJCQUFzQixHQUFlLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUM7UUFDakUsNkJBQXdCLEdBQWUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQztRQUNuRSx3QkFBbUIsR0FBc0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUNyRSwwQkFBcUIsR0FBc0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUV2RSxrQkFBYSxHQUFnQixVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztRQUN0RCxlQUFVLEdBQUcsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hDLG9CQUFlLEdBQWdCLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO1FBRS9DLHVCQUFrQixHQUFtQixLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2hELHdDQUFtQyxHQUFtQixLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2pFLCtCQUEwQixHQUFvRCxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3pGLDZCQUF3QixHQUFrQixLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3JELDhCQUF5QixHQUEwQixLQUFLLENBQUMsSUFBSSxDQUFDO1FBQzlELDhCQUF5QixHQUFzQyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ25GLDZCQUF3QixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDdEMsK0JBQTBCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN4Qyx5QkFBb0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2xDLHVDQUFrQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDaEQsc0JBQWlCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUMvQiwrQkFBMEIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3hDLHFDQUFnQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFJOUMsY0FBUyxHQUFrQixPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3RELGlCQUFZLEdBQWtCLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7SUE4QzFELENBQUM7SUFqREEsTUFBTSxLQUFXLENBQUM7SUFDbEIsVUFBVSxLQUFjLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztJQUd0QyxRQUFRLENBQUMsS0FBWSxJQUFhLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNqRCxTQUFTLENBQUMsS0FBWSxJQUFVLENBQUM7SUFDakMsbUJBQW1CLEtBQWMsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ2hELHlCQUF5QixLQUF5QixPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDckUsU0FBUyxDQUFDLEtBQVksSUFBYSxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDakQsWUFBWSxLQUFrQixPQUFPLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNoRSx5QkFBeUIsS0FBSyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDakQsZ0JBQWdCLEtBQWMsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzdDLGlCQUFpQixLQUFjLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUM5QyxtQkFBbUIsS0FBYyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDaEQsb0JBQW9CLENBQUMsT0FBZ0IsSUFBVSxDQUFDO0lBQ2hELGVBQWUsQ0FBQyxPQUFnQixJQUFVLENBQUM7SUFDM0MsZUFBZSxLQUFjLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUM1QyxLQUFLLENBQUMsZUFBZSxDQUFDLE9BQWdCLElBQW1CLENBQUM7SUFDMUQsS0FBSyxDQUFDLGdCQUFnQixDQUFDLE9BQWdCLElBQW1CLENBQUM7SUFDM0QsS0FBSyxDQUFDLHFCQUFxQixDQUFDLE9BQWdCLElBQW1CLENBQUM7SUFDaEUsS0FBSyxDQUFDLGFBQWEsQ0FBQyxPQUFnQixFQUFFLElBQVcsSUFBbUIsQ0FBQztJQUNyRSxhQUFhLEtBQWMsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzFDLEtBQUssQ0FBQyxjQUFjLENBQUMsT0FBZ0IsSUFBbUIsQ0FBQztJQUN6RCxvQkFBb0IsS0FBVyxDQUFDO0lBQ2hDLGdCQUFnQixLQUFjLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUM3QywyQkFBMkIsS0FBVyxDQUFDO0lBQ3ZDLHdCQUF3QixDQUFDLFNBQWtCLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3ZFLHVCQUF1QixLQUFjLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNwRCxvQkFBb0IsS0FBd0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqRixhQUFhLEtBQVcsQ0FBQztJQUN6QixrQkFBa0IsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEMsZ0JBQWdCLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hDLGlCQUFpQixLQUFxQixPQUFPLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDeEQsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFNBQXVCLElBQW1CLENBQUM7SUFDbEUsS0FBSyxDQUFDLGlCQUFpQixDQUFDLFVBQTBCLElBQW1CLENBQUM7SUFDdEUsUUFBUSxDQUFDLE1BQWMsSUFBVSxDQUFDO0lBQ2xDLFdBQVcsQ0FBQyxNQUFjLElBQVUsQ0FBQztJQUNyQywwQkFBMEIsS0FBaUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNoRixhQUFhLEtBQVcsQ0FBQztJQUN6QiwwQkFBMEIsS0FBYyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDdkQsc0JBQXNCLENBQUMsT0FBZ0IsSUFBVSxDQUFDO0lBQ2xELFVBQVUsQ0FBQyxLQUFZLEVBQUUsZ0JBQXdCLEVBQUUsaUJBQXlCLElBQVUsQ0FBQztJQUN2RixPQUFPLENBQUMsSUFBVyxJQUFlLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDL0UsT0FBTyxDQUFDLElBQVcsRUFBRSxJQUFlLElBQVUsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzRixZQUFZLENBQUMsSUFBVSxJQUFpQixPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2pFLGlCQUFpQixDQUFDLFlBQW9CLElBQUksT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3pELDBCQUEwQixDQUFDLFlBQW9CLEVBQUUsU0FBa0IsSUFBVSxDQUFDO0lBQzlFLHNCQUFzQixDQUFDLElBQVcsRUFBRSxTQUFvQixJQUF1QixPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDbEcsS0FBSyxLQUFLLENBQUM7Q0FDWDtBQUVELG1EQUFtRDtBQUNuRCxNQUFNLGFBQWEsR0FBa0IsRUFBUyxDQUFDO0FBRS9DLE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxVQUFVO0lBUXZEO1FBQ0MsS0FBSyxFQUFFLENBQUM7UUFIRCxVQUFLLEdBQUcsSUFBSSxHQUFHLEVBQTZDLENBQUM7UUFLcEUsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLHNDQUE4QixJQUFJLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDakUsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLHdDQUFnQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFFckUsSUFBSSxDQUFDLHNCQUFzQixHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLDRFQUE0RCxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFFLENBQUMsc0JBQXNCLEVBQUUsU0FBUyxDQUFDLEVBQUUsR0FBRyxPQUFPLEVBQUUsU0FBUyxFQUFFLHFCQUFxQixFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbFAsSUFBSSxDQUFDLHVCQUF1QixHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLDRFQUE0RCxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFFLENBQUMsdUJBQXVCLEVBQUUsU0FBUyxDQUFDLEVBQUUsR0FBRyxPQUFPLEVBQUUsU0FBUyxFQUFFLHFCQUFxQixFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDclAsQ0FBQztJQUVELFNBQVMsQ0FBQyxxQkFBNEM7UUFDckQsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMscUJBQXFCLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDN0QsQ0FBQztJQUNELGFBQWEsQ0FBQyxxQkFBNEM7UUFDekQsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMscUJBQXFCLENBQUMsQ0FBQyxVQUFVLENBQUM7SUFDakUsQ0FBQztJQUNELGlCQUFpQixDQUFDLEVBQXNCLEVBQUUscUJBQTRDLEVBQUUsS0FBZTtRQUN0RyxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNuRixDQUFDO0lBQ0Qsc0JBQXNCLENBQUMscUJBQTRDO1FBQ2xFLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLHFCQUFxQixDQUFDLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztJQUMvRSxDQUFDO0lBQ0QsZ0JBQWdCLENBQUMsRUFBVSxFQUFFLHFCQUE0QztRQUN4RSxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFDRCxpQkFBaUIsQ0FBQyxxQkFBNEM7UUFDN0QsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMscUJBQXFCLENBQUMsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQzFFLENBQUM7SUFDRCxvQkFBb0IsQ0FBQyxFQUFVLEVBQUUscUJBQTRDO1FBQzVFLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLHFCQUFxQixDQUFDLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDL0UsQ0FBQztJQUNELHVCQUF1QixDQUFDLHFCQUE0QztRQUNuRSxJQUFJLENBQUMsaUJBQWlCLENBQUMscUJBQXFCLENBQUMsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO0lBQ3pFLENBQUM7SUFDRCw0QkFBNEIsQ0FBQyxxQkFBNEM7UUFDeEUsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMscUJBQXFCLENBQUMsQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO0lBQ3JGLENBQUM7SUFFRCx5QkFBeUIsQ0FBQyxxQkFBNEM7UUFDckUsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCwwQkFBMEIsQ0FBQyxxQkFBNEM7UUFDdEUsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxtQkFBbUIsQ0FBQyxxQkFBNEM7UUFDL0QsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxpQkFBaUIsQ0FBQyxxQkFBNEM7UUFDN0QsT0FBTyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7SUFDcEUsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLGVBQWU7SUFBNUI7UUFHQyxnQ0FBMkIsR0FBRyxJQUFJLE9BQU8sRUFBMkIsQ0FBQztRQUNyRSxrQ0FBNkIsR0FBRyxJQUFJLE9BQU8sRUFBMkIsQ0FBQztRQUN2RSw0QkFBdUIsR0FBRyxJQUFJLE9BQU8sRUFBa0IsQ0FBQztRQUN4RCw2QkFBd0IsR0FBRyxJQUFJLE9BQU8sRUFBa0IsQ0FBQztRQUVoRCxXQUFNLHNEQUFzQjtRQUM1QixlQUFVLEdBQUcsdUJBQXVCLENBQUMsUUFBUSxDQUFDO1FBQ3ZELFlBQU8sR0FBZ0IsU0FBVSxDQUFDO1FBQ2xDLGlCQUFZLEdBQUcsQ0FBQyxDQUFDO1FBQ2pCLGlCQUFZLEdBQUcsQ0FBQyxDQUFDO1FBQ2pCLGtCQUFhLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLGtCQUFhLEdBQUcsQ0FBQyxDQUFDO1FBQ2xCLGdCQUFXLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN6QiwyQkFBc0IsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDO1FBQzVELDRCQUF1QixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUM7SUFnQi9ELENBQUM7SUFkQSxpQkFBaUIsQ0FBQyxFQUFVLEVBQUUsS0FBZSxJQUF5QyxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFILGlCQUFpQixLQUFnQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsY0FBYyxLQUFnQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDMUQsc0JBQXNCLEtBQXFCLE9BQU8sYUFBYSxDQUFDLENBQUMsQ0FBQztJQUNsRSxtQkFBbUIsS0FBYSxPQUFPLHlCQUF5QixDQUFDLENBQUMsQ0FBQztJQUNuRSxnQkFBZ0IsQ0FBQyxFQUFVLElBQXlDLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUN2RixvQkFBb0IsQ0FBQyxFQUFVLElBQUksT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ3RELHVCQUF1QixLQUFXLENBQUM7SUFDbkMsNEJBQTRCLEtBQWEsT0FBTyxTQUFVLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sS0FBSyxDQUFDO0lBQ2IseUJBQXlCLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzFDLDBCQUEwQixLQUFLLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMzQyxtQkFBbUIsS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDcEMsTUFBTSxDQUFDLEtBQWEsRUFBRSxNQUFjLEVBQUUsR0FBVyxFQUFFLElBQVksSUFBVSxDQUFDO0NBQzFFO0FBRUQsTUFBTSxPQUFPLGFBQWE7SUFBMUI7UUFHQyxZQUFPLEdBQWdCLFNBQVUsQ0FBQztRQUNsQyxpQkFBWSxHQUFHLENBQUMsQ0FBQztRQUNqQixpQkFBWSxHQUFHLENBQUMsQ0FBQztRQUNqQixrQkFBYSxHQUFHLENBQUMsQ0FBQztRQUNsQixrQkFBYSxHQUFHLENBQUMsQ0FBQztRQUNsQixnQkFBVyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDekIsMkJBQXNCLEdBQUcsSUFBSSxPQUFPLEVBQWtCLENBQUMsS0FBSyxDQUFDO1FBQzdELDRCQUF1QixHQUFHLElBQUksT0FBTyxFQUFrQixDQUFDLEtBQUssQ0FBQztRQUNyRCxXQUFNLGdFQUEyQjtRQUNqQyxlQUFVLEdBQUcsdUJBQXVCLENBQUMsU0FBUyxDQUFDO0lBZXpELENBQUM7SUFiQSxLQUFLLENBQUMsaUJBQWlCLENBQUMsRUFBVyxFQUFFLEtBQWUsSUFBd0IsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQy9GLGdCQUFnQixDQUFDLEVBQVUsSUFBUyxPQUFPLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFDM0QsaUJBQWlCLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2xDLHlCQUF5QixLQUFLLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxQywwQkFBMEIsS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDM0MsbUJBQW1CLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3BDLHNCQUFzQixLQUFxQixPQUFPLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFDbEUsa0JBQWtCLENBQUMsRUFBVSxFQUFFLE9BQWdCLElBQVUsQ0FBQztJQUMxRCxPQUFPLEtBQUssQ0FBQztJQUNiLG9CQUFvQixDQUFDLEVBQVUsSUFBSSxPQUFPLElBQUssQ0FBQyxDQUFDLENBQUM7SUFDbEQsdUJBQXVCLEtBQVcsQ0FBQztJQUNuQyw0QkFBNEIsS0FBYSxPQUFPLFNBQVUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsTUFBTSxDQUFDLEtBQWEsRUFBRSxNQUFjLEVBQUUsR0FBVyxFQUFFLElBQVksSUFBVSxDQUFDO0NBQzFFO0FBRUQsTUFBTSxPQUFPLGdCQUFnQjtJQUE3QjtRQUlDLHVDQUFrQyxHQUFHLElBQUksT0FBTyxFQUFxRSxDQUFDLEtBQUssQ0FBQztRQU81SCxxQ0FBZ0MsR0FBRyxJQUFJLE9BQU8sRUFBb0MsQ0FBQztRQUNuRiw4QkFBeUIsR0FBRyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsS0FBSyxDQUFDO1FBQ3hFLGtDQUE2QixHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFDcEQsMkJBQXNCLEdBQUcsSUFBSSxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQztJQVVuRSxDQUFDO0lBbkJBLHNCQUFzQixDQUFDLEVBQVUsSUFBYSxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDNUQscUJBQXFCLENBQUMsRUFBVSxJQUFhLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztJQUMzRCx1QkFBdUIsS0FBMkIsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLGlCQUFpQixDQUFDLEVBQVUsRUFBRSxLQUFlLElBQW9DLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEgsa0JBQWtCLENBQUMsRUFBVSxJQUFVLENBQUM7SUFNeEMsYUFBYSxDQUFDLEVBQVUsSUFBYSxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDbkQsbUJBQW1CLENBQWtCLEVBQVUsSUFBYyxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDM0UsYUFBYSxDQUFrQixFQUFVLElBQWMsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3JFLFFBQVEsQ0FBa0IsRUFBVSxFQUFFLEtBQTJCLElBQXVCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdkgsU0FBUyxDQUFDLEVBQVUsSUFBVSxDQUFDO0lBQy9CLHdCQUF3QixDQUFDLEVBQVUsSUFBSSxPQUFPLElBQUssQ0FBQyxDQUFDLENBQUM7SUFDdEQsZ0NBQWdDLENBQUMsRUFBVSxJQUFJLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztJQUM3RCxrQkFBa0IsS0FBYSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDM0MsY0FBYyxLQUE2QixPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7Q0FDekQ7QUFFRCxNQUFNLE9BQU8sdUJBQXVCO0lBSW5DLFlBQW1CLFNBQWdDLEVBQUU7UUFBbEMsV0FBTSxHQUFOLE1BQU0sQ0FBNEI7UUFFNUMsVUFBSyxHQUEyQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWhELGFBQVEsR0FBRyxVQUFVLENBQUMsY0FBYyxDQUFDO1FBRTVCLG1DQUE4QixHQUFnQyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3pFLDJCQUFzQixHQUF3QixLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3pELHVCQUFrQixHQUF1QyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3BFLGtCQUFhLEdBQXdCLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDaEQscUJBQWdCLEdBQXdCLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDbkQsbUJBQWMsR0FBd0IsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNqRCwwQkFBcUIsR0FBd0IsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN4RCwwQkFBcUIsR0FBd0IsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN4RCwyQkFBc0IsR0FBd0IsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN6RCw4QkFBeUIsR0FBbUIsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN2RCxnQkFBVyxHQUFzQixLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3JELGlDQUE0QixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDMUMsZ0JBQVcsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3pCLGtCQUFhLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUUzQixnQkFBVyx1Q0FBK0I7UUFDMUMsWUFBTyxHQUFHLElBQUksQ0FBQztRQUNmLGNBQVMsR0FBa0IsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN0RCxpQkFBWSxHQUFrQixPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3pELHVCQUFrQixHQUFHLEtBQUssQ0FBQztRQUUzQixxQkFBZ0IsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDO1FBeUN0QyxhQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ2hCLDBCQUFxQixHQUFpQyxTQUFTLENBQUM7SUFyRWhCLENBQUM7SUE2QjFELElBQUksV0FBVyxLQUFtQixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFELElBQUksU0FBUyxLQUFtQixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hELElBQUksS0FBSyxLQUFhLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBRWxELE9BQU8sQ0FBQyxLQUE0QixJQUFpQixPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDbkUsY0FBYyxDQUFDLElBQVksSUFBdUIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMvRixjQUFjLEtBQTBCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDckYsZUFBZSxDQUFDLFVBQXVDLEVBQUUsT0FBa0MsSUFBc0IsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5SixnQkFBZ0IsQ0FBQyxVQUE2QixJQUFzQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pILFNBQVMsQ0FBQyxNQUFvQixJQUE2QixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ2hGLFFBQVEsQ0FBQyxVQUFrQixJQUE4QixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDckgsUUFBUSxDQUFDLFdBQW1CLElBQVksT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQzNELFNBQVMsQ0FBQyxNQUF1QixFQUFFLE9BQStCLEVBQUUsS0FBZSxJQUFrQixNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFJLGFBQWEsQ0FBQyxNQUE2QixJQUFrQixNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xHLFlBQVksQ0FBQyxNQUE2QixJQUFrQixNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pHLE9BQU8sQ0FBQyxNQUE2QixJQUF1QyxPQUFPLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2pILE9BQU8sQ0FBQyxNQUE2QixFQUFFLEtBQXdDLElBQVUsQ0FBQztJQUMxRixhQUFhLENBQUMsWUFBK0IsSUFBVSxDQUFDO0lBQ3hELG1CQUFtQixLQUFXLENBQUM7SUFDL0IsaUJBQWlCLEtBQWMsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwRSxpQkFBaUIsS0FBVyxDQUFDO0lBQzdCLFdBQVcsQ0FBQyxPQUEwQixJQUFVLENBQUM7SUFDakQsU0FBUyxLQUF3QixNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RFLG1CQUFtQixDQUFDLFlBQThCLElBQVUsQ0FBQztJQUM3RCxRQUFRLENBQUMsU0FBZ0MsRUFBRSxVQUEwQixJQUFrQixNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVILFdBQVcsQ0FBQyxNQUE2QixJQUFVLENBQUM7SUFDcEQsU0FBUyxDQUFDLE1BQTZCLEVBQUUsU0FBZ0MsRUFBRSxVQUEwQixJQUFrQixNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVKLFVBQVUsQ0FBQyxNQUE2QixFQUFFLE9BQThCLEVBQUUsUUFBNkIsSUFBYSxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3pKLGNBQWMsQ0FBQyxNQUE2QixFQUFFLFFBQTZCLElBQWEsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3SCxTQUFTLENBQUMsTUFBNkIsRUFBRSxTQUFnQyxFQUFFLFVBQTBCLElBQWtCLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUosWUFBWSxDQUFDLE1BQWUsSUFBVSxDQUFDO0lBQ3ZDLGdCQUFnQixLQUFjLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUM3QyxzQkFBc0IsQ0FBQyxTQUFzQixFQUFFLFFBQW1DLElBQWlCLE9BQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDNUgsMEJBQTBCLENBQTRCLFNBQTRDLElBQWlCLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEosNkJBQTZCLENBQUMsSUFBaUIsSUFBMkIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUd2SCxrQkFBa0IsQ0FBQyxPQUEyQixJQUFpQixPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBSXhGLGtCQUFrQixDQUFDLElBQVMsSUFBaUIsT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN0RSx5QkFBeUIsS0FBb0MsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxRyxxQkFBcUIsS0FBZ0MsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUNsRztBQUVELE1BQU0sT0FBTyxtQkFBbUI7SUFFL0IsWUFBbUIsRUFBVTtRQUFWLE9BQUUsR0FBRixFQUFFLENBQVE7UUFFN0IsYUFBUSxHQUFHLFVBQVUsQ0FBQyxjQUFjLENBQUM7UUFDckMsZUFBVSxHQUFzQixTQUFVLENBQUM7UUFHM0Msb0JBQWUsR0FBa0IsRUFBRSxDQUFDO1FBS3BDLFlBQU8sR0FBMkIsRUFBRSxDQUFDO1FBS3JDLGlCQUFZLEdBQWtCLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFTekQsWUFBTyxHQUFHLElBQUksQ0FBQztRQUVOLGtCQUFhLEdBQWdCLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDeEMscUJBQWdCLEdBQWtDLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDN0Qsc0JBQWlCLEdBQTZCLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDekQscUJBQWdCLEdBQTZCLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDeEQsd0JBQW1CLEdBQXVCLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDckQsZUFBVSxHQUFnQixLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3JDLGdCQUFXLEdBQTZDLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDbkUscUJBQWdCLEdBQWdDLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDM0QscUJBQWdCLEdBQWdDLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDM0QsNEJBQXVCLEdBQW9DLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFwQzlDLENBQUM7SUFzQ2xDLFVBQVUsQ0FBQyxNQUFxQixJQUE0QixPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDeEUsV0FBVyxDQUFDLFNBQWMsSUFBNEIsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2xFLGdCQUFnQixDQUFDLE1BQWMsSUFBaUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyRixnQkFBZ0IsQ0FBQyxPQUFvQixJQUFZLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sQ0FBQyxNQUFtQixJQUFhLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUN2RCxNQUFNLENBQUMsTUFBbUIsSUFBYSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDdEQsVUFBVSxDQUFDLE9BQW9CLEVBQUUsUUFBeUIsSUFBMEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN6SCxXQUFXLENBQUMsUUFBa0MsSUFBMEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3RyxRQUFRLENBQUMsT0FBb0IsSUFBYSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDekQsUUFBUSxDQUFDLE9BQW9CLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3pELFdBQVcsQ0FBQyxPQUFvQixJQUFhLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUM1RCxRQUFRLENBQUMsT0FBMEMsSUFBYSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDL0UsWUFBWSxDQUFDLHFCQUFrQyxFQUFFLHdCQUF1QyxJQUFtQixNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hKLFVBQVUsQ0FBQyxPQUFvQixJQUFhLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUMzRCxRQUFRLENBQUMsU0FBNEMsSUFBYSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDakYsVUFBVSxDQUFDLE9BQW9CLEVBQUUsT0FBcUIsRUFBRSxRQUF5QixJQUFhLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztJQUM1RyxXQUFXLENBQUMsUUFBa0MsRUFBRSxPQUFxQixJQUFhLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNoRyxVQUFVLENBQUMsT0FBb0IsRUFBRSxPQUFxQixFQUFFLFFBQXlCLElBQVUsQ0FBQztJQUM1RixXQUFXLENBQUMsUUFBa0MsRUFBRSxPQUFxQixJQUFVLENBQUM7SUFDaEYsS0FBSyxDQUFDLFdBQVcsQ0FBQyxPQUFxQixFQUFFLE9BQTZCLElBQXNCLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztJQUMxRyxLQUFLLENBQUMsWUFBWSxDQUFDLFFBQTZDLEVBQUUsT0FBNkIsSUFBc0IsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ25JLGVBQWUsQ0FBQyxPQUFpQyxJQUFTLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN4RSxLQUFLLENBQUMsY0FBYyxDQUFDLFFBQThCLElBQW1CLENBQUM7SUFDdkUsU0FBUyxDQUFDLE9BQXFCLElBQVUsQ0FBQztJQUMxQyxXQUFXLENBQUMsTUFBZ0MsSUFBVSxDQUFDO0lBQ3ZELGFBQWEsQ0FBQyxNQUFnQyxJQUFVLENBQUM7SUFDekQsSUFBSSxDQUFDLE1BQWUsSUFBVSxDQUFDO0lBQy9CLEtBQUssS0FBVyxDQUFDO0lBQ2pCLElBQUksdUJBQXVCLEtBQXlCLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDekYsU0FBUyxDQUFDLFNBQWtCLElBQVUsQ0FBQztJQUN2QyxrQkFBa0IsQ0FBQyxNQUFjLElBQVUsQ0FBQztJQUM1QyxrQkFBa0IsQ0FBQyxNQUFjLElBQVUsQ0FBQztJQUM1QyxPQUFPLEtBQVcsQ0FBQztJQUNuQixNQUFNLEtBQWEsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNoRCxNQUFNLENBQUMsTUFBYyxFQUFFLE9BQWUsSUFBVSxDQUFDO0lBQ2pELFFBQVEsS0FBSyxDQUFDO0lBQ2QsbUJBQW1CLENBQUMsZUFBNEIsSUFBd0UsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUM3SjtBQUVELE1BQU0sT0FBTyx1QkFBdUI7SUFBcEM7UUFFQyxVQUFLLEdBQVcsRUFBRSxDQUFDO1FBQ25CLGFBQVEsR0FBRyxVQUFVLENBQUMsY0FBYyxDQUFDO1FBRXJDLFdBQU0sR0FBdUIsRUFBRSxDQUFDO1FBR2hDLGdCQUFXLEdBQXVCLEVBQUUsR0FBRywyQkFBMkIsRUFBRSxDQUFDO1FBRXJFLGlDQUE0QixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDMUMsMEJBQXFCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztJQWNwQyxDQUFDO0lBWkEsUUFBUSxDQUFDLFVBQWtCLElBQWtDLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUcsU0FBUyxDQUFDLEtBQWtCLElBQXdCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakcsYUFBYSxDQUFDLFVBQXFDLElBQXNCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEgsWUFBWSxDQUFDLFVBQXFDLElBQXNCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDckgsUUFBUSxDQUFDLFFBQW1DLEVBQUUsU0FBeUIsSUFBc0IsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxSSxVQUFVLENBQUMsS0FBZ0MsRUFBRSxNQUFpQyxFQUFFLE9BQXdDLElBQWEsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsTCxTQUFTLENBQUMsS0FBZ0MsRUFBRSxRQUFtQyxFQUFFLFNBQXlCLElBQXNCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDN0ssU0FBUyxDQUFDLEtBQWdDLEVBQUUsUUFBbUMsRUFBRSxTQUF5QixJQUFzQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdLLFdBQVcsQ0FBQyxLQUFnQyxJQUFVLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkcsYUFBYSxDQUFDLFdBQThCLEVBQUUsTUFBOEMsSUFBVSxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ25KLG1CQUFtQixDQUFDLEtBQWdDLElBQVUsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzRyxpQkFBaUIsQ0FBQyxLQUFnQyxJQUFVLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDekc7QUFFRCxNQUFNLE9BQU8saUJBQWtCLFNBQVEsVUFBVTtJQWFoRCxJQUFXLHVCQUF1QixLQUE0QyxPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7SUFDckgsSUFBVyx1QkFBdUIsQ0FBQyxLQUE0QyxJQUFJLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBTTNILElBQVcsWUFBWSxLQUE4QixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBQ2pGLElBQVcsWUFBWSxDQUFDLEtBQThCLElBQUksSUFBSSxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBTXZGLDRCQUE0QixDQUFDLEtBQW1CLElBQXdDLE9BQU8sSUFBSSxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQztJQUloSSxZQUFvQixrQkFBeUM7UUFDNUQsS0FBSyxFQUFFLENBQUM7UUFEVyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXVCO1FBM0JwRCw0QkFBdUIsR0FBZ0IsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNsRCw4QkFBeUIsR0FBZ0IsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNwRCx1QkFBa0IsR0FBK0IsS0FBSyxDQUFDLElBQUksQ0FBQztRQUM1RCxxQkFBZ0IsR0FBZ0MsS0FBSyxDQUFDLElBQUksQ0FBQztRQUMzRCxxQkFBZ0IsR0FBNkIsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN4RCx3QkFBbUIsR0FBNkIsS0FBSyxDQUFDLElBQUksQ0FBQztRQUMzRCx5Q0FBb0MsR0FBZ0IsS0FBSyxDQUFDLElBQUksQ0FBQztRQWF4RSxZQUFPLEdBQTJCLEVBQUUsQ0FBQztRQUNyQyw4QkFBeUIsR0FBaUMsRUFBRSxDQUFDO1FBQzdELHVCQUFrQixHQUFrQyxFQUFFLENBQUM7UUFDdkQsOEJBQXlCLEdBQUcsRUFBRSxDQUFDO1FBRS9CLG1CQUFjLEdBQTJCLEVBQUUsQ0FBQztRQUM1QyxVQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUM7SUFJNUIsQ0FBQztJQUNELFlBQVksQ0FBQyxxQkFBNkMsSUFBb0IsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzVGLFVBQVUsS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDM0IsbURBQW1EO0lBQ25ELFdBQVcsS0FBSyxPQUFPLEVBQVMsQ0FBQyxDQUFDLENBQUM7SUFJbkMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUF5QyxFQUFFLGNBQWdELEVBQUUsS0FBc0I7UUFDbkksZ0ZBQWdGO1FBQ2hGLDZDQUE2QztRQUM3QyxJQUFJLFNBQVMsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3hCLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBQ0QsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUF5QixFQUFFLE9BQTZCLElBQW1CLENBQUM7SUFDOUYsS0FBSyxDQUFDLFlBQVksQ0FBQyxPQUE0QixFQUFFLE9BQTZCLElBQW1CLENBQUM7SUFDbEcsMEJBQTBCLENBQUMsTUFBeUM7UUFDbkUsSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzlCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFdBQVcsRUFBRSxNQUFxQixFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFDRCxXQUFXLENBQUMsUUFBYSxFQUFFLE1BQVksSUFBNEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4RyxRQUFRLENBQUMsT0FBdUMsSUFBYSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDNUUsU0FBUyxDQUFDLE9BQW9CLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzFELGNBQWMsQ0FBQyxRQUFhLEVBQUUsTUFBVyxJQUFJLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakYsSUFBSSxDQUFDLE9BQTRCLEVBQUUsT0FBNkIsSUFBaUMsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5SSxPQUFPLENBQUMsT0FBNkIsSUFBaUMsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuSCxNQUFNLENBQUMsT0FBNEIsRUFBRSxPQUF3QixJQUFzQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hJLFNBQVMsQ0FBQyxPQUFrQyxJQUFzQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQy9HO0FBRUQsTUFBTSxPQUFPLDRCQUE2QixTQUFRLGdDQUFnQztJQUlqRjtRQUNDLEtBQUssRUFBRSxDQUFDO1FBSEEsYUFBUSxHQUFnQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBSTNELENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxpQkFBcUM7UUFDdkQsTUFBTSxVQUFVLEdBQUcsaUJBQWlCLENBQUMsTUFBTSw2QkFBcUIsQ0FBQyxVQUFVLENBQUM7UUFDNUUsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQzVDLE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLFVBQVUsQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFbEYsT0FBTyxVQUFVLENBQUMsZUFBZSxDQUFDLEtBQUssMENBQWtDLENBQUM7SUFDM0UsQ0FBQztJQUVRLEtBQUssQ0FBQyxPQUFPLENBQW1DLFVBQWtDO1FBQzFGLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRTlCLE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNsQyxDQUFDO0NBQ0Q7QUFFRCxNQUFNLFVBQVUsc0JBQXNCLENBQUMsUUFBYTtJQUNuRCxPQUFPLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUMzQyxDQUFDO0FBRUQsTUFBTSxVQUFVLG9CQUFvQixDQUFDLFFBQWEsRUFBRSxNQUFNLEdBQUcsa0JBQWtCO0lBQzlFLE9BQU8sRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLENBQUM7QUFDN0IsQ0FBQztBQUVELE1BQU0sT0FBTyxvQ0FBcUMsU0FBUSwrQkFBK0I7SUFPeEY7UUFDQyxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzFDLE1BQU0sa0JBQWtCLEdBQUcsc0JBQXNCLENBQUM7UUFDbEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUN4QyxNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDakUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksMEJBQTBCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvRyxXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSwwQkFBMEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXpILEtBQUssQ0FBQyxJQUFJLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxFQUFFLGtCQUFrQixFQUFFLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUUxRixJQUFJLENBQUMscUJBQXFCLEdBQUcsRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLGdCQUFnQixHQUFHLEVBQUUsQ0FBQztRQUUzQixJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFRCxrQkFBa0I7UUFDakIsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDO0lBQ3pCLENBQUM7SUFFRCxrQkFBa0I7UUFDakIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUN6RSxDQUFDO0lBRUQsaUJBQWlCO1FBQ2hCLE9BQU8sSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVRLEtBQUssQ0FBQyxNQUFNLENBQUMsVUFBa0MsRUFBRSxPQUFtRCxFQUFFLFNBQWtCLEVBQUUsSUFBVSxFQUFFLEtBQXlCO1FBQ3ZLLE1BQU0sS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFaEUsT0FBTyxJQUFJLENBQUMscUJBQXFCLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDMUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsRUFBRyxFQUFFLENBQUM7UUFDckMsQ0FBQztJQUNGLENBQUM7SUFFUSxLQUFLLENBQUMsYUFBYSxDQUFDLFVBQWtDO1FBQzlELE1BQU0sS0FBSyxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN0QyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXZDLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3pDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLEVBQUcsRUFBRSxDQUFDO1FBQ3BDLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLGlCQUFpQixDQUFDLFVBQWtDO1FBQ3pELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUV6RCxNQUFNLFlBQVksR0FBRyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRXJFLE9BQU8sWUFBWSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUN0QyxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sdUJBQXVCO0lBQXBDO1FBSUMsV0FBTSxnQ0FBd0I7SUFVL0IsQ0FBQztJQVJBLElBQUksQ0FBQyxLQUFpQztRQUNyQyxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztJQUNwQixDQUFDO0lBRUQsU0FBUyxDQUFDLE1BQXdDO1FBQ2pELElBQUksQ0FBQyxLQUFLLEdBQUcsTUFBTSxFQUFFLENBQUM7UUFDdEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUM7SUFDMUIsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLHFCQUFxQjtJQUFsQztRQUVDLFVBQUssR0FBb0IsRUFBRSxDQUFDO1FBQzVCLFlBQU8sR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDbkIsV0FBTSxnQ0FBd0I7UUFDOUIsVUFBSyxHQUFHLGlCQUFpQixDQUFDLElBQUksQ0FBQztJQU9oQyxDQUFDO0lBTEEsSUFBSSxDQUFDLE9BQThDLEVBQUUsTUFBZ0M7UUFDcEYsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxPQUFPLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUVELEtBQUssS0FBMEIsQ0FBQztDQUNoQztBQUVELE1BQU0sT0FBTyxvQ0FBb0M7SUFJaEQsWUFBb0IsdUJBQXVCLElBQUksd0JBQXdCLEVBQUU7UUFBckQseUJBQW9CLEdBQXBCLG9CQUFvQixDQUFpQztJQUFJLENBQUM7SUFFOUUsd0JBQXdCO1FBQ3ZCLE9BQU8sRUFBRSxPQUFPLEtBQUssQ0FBQyxFQUFFLENBQUM7SUFDMUIsQ0FBQztJQUVELFFBQVEsQ0FBSSxRQUFhLEVBQUUsSUFBVSxFQUFFLElBQVU7UUFDaEQsTUFBTSxRQUFRLEdBQXFCLGNBQWMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQ2xGLE1BQU0sT0FBTyxHQUF1QixRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM3SSxPQUFPLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLEVBQUUsUUFBUSxFQUFFLENBQU0sQ0FBQztJQUN2RSxDQUFDO0lBRUQsT0FBTyxDQUFJLFFBQXlCLEVBQUUsUUFBMEIsRUFBRSxPQUFlO1FBQ2hGLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBSSxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFFRCxXQUFXLENBQUMsUUFBYSxFQUFFLEdBQVcsRUFBRSxLQUFVLEVBQUUsbUJBQXlDO1FBQzVGLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDMUQsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLHdCQUF3QjtJQUVwQyxZQUE2QixVQUErQixFQUFtQixlQUF1QjtRQUF6RSxlQUFVLEdBQVYsVUFBVSxDQUFxQjtRQUFtQixvQkFBZSxHQUFmLGVBQWUsQ0FBUTtRQUNyRyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDO1FBQ2pELElBQUksQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLHVCQUF1QixDQUFDO1FBQ3ZFLElBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLGVBQWUsRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDNUYsT0FBTztnQkFDTixJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUk7Z0JBQ1osUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxZQUFZLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQzthQUM1RixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFNRCxLQUFLLENBQUMsUUFBYSxFQUFFLElBQW1CLElBQWlCLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFN0gsSUFBSSxDQUFDLFFBQWEsSUFBb0IsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ25HLEtBQUssQ0FBQyxRQUFhLElBQW1CLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwRyxPQUFPLENBQUMsUUFBYSxJQUFtQyxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEgsTUFBTSxDQUFDLFFBQWEsRUFBRSxJQUF3QixJQUFtQixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXRJLE1BQU0sQ0FBQyxJQUFTLEVBQUUsRUFBTyxFQUFFLElBQTJCLElBQW1CLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuSyxJQUFJLENBQUMsSUFBUyxFQUFFLEVBQU8sRUFBRSxJQUEyQixJQUFtQixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFaEssUUFBUSxDQUFDLFFBQWEsSUFBeUIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pILFNBQVMsQ0FBQyxRQUFhLEVBQUUsT0FBbUIsRUFBRSxJQUF1QixJQUFtQixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBVSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUUxSyxJQUFJLENBQUMsUUFBYSxFQUFFLElBQXNCLElBQXFCLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFLLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkksS0FBSyxDQUFDLEVBQVUsSUFBbUIsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdkUsSUFBSSxDQUFDLEVBQVUsRUFBRSxHQUFXLEVBQUUsSUFBZ0IsRUFBRSxNQUFjLEVBQUUsTUFBYyxJQUFxQixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSyxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakssS0FBSyxDQUFDLEVBQVUsRUFBRSxHQUFXLEVBQUUsSUFBZ0IsRUFBRSxNQUFjLEVBQUUsTUFBYyxJQUFxQixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBTSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFbkssY0FBYyxDQUFDLFFBQWEsRUFBRSxJQUE0QixFQUFFLEtBQXdCLElBQXNDLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxjQUFlLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXZNLGNBQWMsQ0FBQyxRQUFhLElBQVMsT0FBTyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQzdHO0FBRUQsTUFBTSxPQUFPLDhCQUErQixTQUFRLDBCQUEwQjtJQUM3RSxJQUFhLFlBQVk7UUFDeEIsT0FBTzt5RUFDNEM7b0VBQ0gsQ0FBQztJQUNsRCxDQUFDO0lBRVEsY0FBYyxDQUFDLFFBQWE7UUFDcEMsTUFBTSxXQUFXLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQztRQUM5QixNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBYSxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJILENBQUMsS0FBSyxJQUFJLEVBQUU7WUFDWCxJQUFJLENBQUM7Z0JBQ0osTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUUzQyxJQUFJLE1BQU0sR0FBRyxDQUFDLENBQUM7Z0JBQ2YsT0FBTyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUM3QixNQUFNLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDakIsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLE1BQU0sR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDO29CQUNoRSxNQUFNLElBQUksV0FBVyxDQUFDO2dCQUN2QixDQUFDO2dCQUVELE1BQU0sT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNqQixNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDZCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDaEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNuQixDQUFDO1FBQ0YsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUVMLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztDQUNEO0FBRUQsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFvQixFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUUsR0FBRyxPQUFPLEVBQUUsQ0FBQztBQUV4RixNQUFNLE9BQU8sZUFBZTtJQUE1QjtRQUlTLGNBQVMsR0FBRyxJQUFJLENBQUM7UUFJakIsc0JBQWlCLEdBQUcsSUFBSSxPQUFPLEVBQVcsQ0FBQztRQUMxQyxxQkFBZ0IsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDO1FBRWpELHVCQUFrQixHQUFHLElBQUksT0FBTyxFQUFVLENBQUM7UUFDMUMsNEJBQXVCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztRQUV4RCwwQkFBcUIsR0FBcUQsS0FBSyxDQUFDLElBQUksQ0FBQztRQWdDckYsZ0JBQVcsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDO1FBQ3hDLDJCQUFzQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFDckMsQ0FBQztJQTNDQSxJQUFJLFFBQVEsS0FBSyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ3pDLEtBQUssQ0FBQyxZQUFZLEtBQXVCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFVakUsUUFBUSxDQUFDLEtBQWM7UUFDdEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdkIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPLEtBQW9CLENBQUM7SUFDbEMsS0FBSyxDQUFDLE1BQU0sS0FBb0IsQ0FBQztJQUNqQyxLQUFLLENBQUMsS0FBSyxLQUFvQixDQUFDO0lBQ2hDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBSSxvQkFBc0M7UUFDbkUsT0FBTyxNQUFNLG9CQUFvQixFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVELEtBQUssQ0FBQyxLQUFLLEtBQW9CLENBQUM7SUFDaEMsS0FBSyxDQUFDLE9BQU8sS0FBb0IsQ0FBQztJQUNsQyxLQUFLLENBQUMsb0JBQW9CLEtBQXlCLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUV0RSxLQUFLLENBQUMsVUFBVSxDQUFDLE9BQWdCLElBQUksT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRWpELEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBa0QsRUFBRSxJQUF5QixJQUFtQixDQUFDO0lBRWxILEtBQUssQ0FBQyxnQkFBZ0IsS0FBb0IsQ0FBQztJQUUzQyxLQUFLLENBQUMsYUFBYSxDQUFDLElBQWlCLElBQW1DLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUUzRixLQUFLLENBQUMscUJBQXFCLENBQUMsU0FBaUIsSUFBbUMsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBRW5HLEtBQUssQ0FBQyxTQUFTLENBQUMsUUFBdUIsRUFBRSxLQUF3QixJQUEyQixPQUFPLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRTFJLEtBQUssQ0FBQyxlQUFlLENBQUMsYUFBcUIsRUFBRSxPQUFnQixJQUFtQixDQUFDO0NBSWpGO0FBRUQsTUFBTSxPQUFPLDZCQUE4QixTQUFRLHlCQUF5QjtJQUUzRSw4QkFBOEIsQ0FBQyxhQUFrQjtRQUNoRCxLQUFLLENBQUMsMEJBQTBCLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3ZELENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTywrQkFBZ0MsU0FBUSxtQkFBbUI7SUFFOUQsVUFBVTtRQUNsQixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxlQUFnQixTQUFRLFdBQVc7SUFFL0MsWUFBbUIsUUFBYSxFQUFtQixPQUFlO1FBQ2pFLEtBQUssRUFBRSxDQUFDO1FBRFUsYUFBUSxHQUFSLFFBQVEsQ0FBSztRQUFtQixZQUFPLEdBQVAsT0FBTyxDQUFRO0lBRWxFLENBQUM7SUFFRCxJQUFhLE1BQU07UUFDbEIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxJQUFhLFFBQVE7UUFDcEIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3JCLENBQUM7SUFFUSxPQUFPO1FBQ2YsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzlCLENBQUM7Q0FDRDtBQUVELE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxFQUFVLEVBQUUsTUFBcUMsRUFBRSxpQkFBMEI7SUFDL0csTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUUxQyxNQUFNLFVBQVcsU0FBUSxVQUFVO1FBSWxDLFlBQVksS0FBbUI7WUFDOUIsS0FBSyxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsSUFBSSxnQkFBZ0IsRUFBRSxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxRyxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxxQkFBcUIsRUFBRSxDQUFDO1FBQzdELENBQUM7UUFFUSxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQWtCLEVBQUUsT0FBbUMsRUFBRSxPQUEyQixFQUFFLEtBQXdCO1lBQ3JJLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFL0MsTUFBTSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDdkIsQ0FBQztRQUVRLEtBQUssS0FBYSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkMsTUFBTSxLQUFXLENBQUM7UUFDUixZQUFZLEtBQVcsQ0FBQztRQUVsQyxJQUFhLHVCQUF1QjtZQUNuQyxPQUFPLElBQUksQ0FBQyx3QkFBd0IsQ0FBQztRQUN0QyxDQUFDO0tBQ0Q7SUFFRCxXQUFXLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQXNCLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFFeEssSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1FBTXZCLE1BQU0sd0NBQXdDO1lBRTdDLFlBQVksQ0FBQyxXQUF3QjtnQkFDcEMsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1lBRUQsU0FBUyxDQUFDLFdBQXdCO2dCQUNqQyxNQUFNLGVBQWUsR0FBd0IsV0FBVyxDQUFDO2dCQUN6RCxNQUFNLFNBQVMsR0FBeUI7b0JBQ3ZDLFFBQVEsRUFBRSxlQUFlLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRTtpQkFDN0MsQ0FBQztnQkFFRixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDbEMsQ0FBQztZQUVELFdBQVcsQ0FBQyxvQkFBMkMsRUFBRSxxQkFBNkI7Z0JBQ3JGLE1BQU0sU0FBUyxHQUF5QixJQUFJLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBRTFFLE9BQU8sSUFBSSxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsRUFBRSxpQkFBa0IsQ0FBQyxDQUFDO1lBQ25GLENBQUM7U0FDRDtRQUVELFdBQVcsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLENBQUMsd0JBQXdCLENBQUMsaUJBQWlCLEVBQUUsd0NBQXdDLENBQUMsQ0FBQyxDQUFDO0lBQzVLLENBQUM7SUFFRCxPQUFPLFdBQVcsQ0FBQztBQUNwQixDQUFDO0FBRUQsTUFBTSxVQUFVLHNCQUFzQjtJQUNyQyxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBRTFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBc0IsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLGtCQUFrQixDQUN6RixvQkFBb0IsQ0FBQyxNQUFNLENBQzFCLGtCQUFrQixFQUNsQixrQkFBa0IsQ0FBQyxFQUFFLEVBQ3JCLGtCQUFrQixDQUNsQixFQUNELENBQUMsSUFBSSxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FDckMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxXQUFXLENBQUM7QUFDcEIsQ0FBQztBQUVELE1BQU0sVUFBVSwwQkFBMEI7SUFDekMsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUUxQyxXQUFXLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQXNCLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxrQkFBa0IsQ0FDekYsb0JBQW9CLENBQUMsTUFBTSxDQUMxQixzQkFBc0IsRUFDdEIsc0JBQXNCLENBQUMsRUFBRSxFQUN6QixhQUFhLENBQ2IsRUFDRDtRQUNDLElBQUksY0FBYyxDQUFDLHVCQUF1QixDQUFDO1FBQzNDLElBQUksY0FBYyxDQUFDLHVCQUF1QixDQUFDO0tBQzNDLENBQ0QsQ0FBQyxDQUFDO0lBRUgsT0FBTyxXQUFXLENBQUM7QUFDcEIsQ0FBQztBQUVELE1BQU0sVUFBVSw0QkFBNEI7SUFDM0MsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUUxQyxXQUFXLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQXNCLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxrQkFBa0IsQ0FDekYsb0JBQW9CLENBQUMsTUFBTSxDQUMxQixnQkFBZ0IsRUFDaEIsZ0JBQWdCLENBQUMsRUFBRSxFQUNuQixhQUFhLENBQ2IsRUFDRDtRQUNDLElBQUksY0FBYyxDQUFDLHFCQUFxQixDQUFDO0tBQ3pDLENBQ0QsQ0FBQyxDQUFDO0lBRUgsT0FBTyxXQUFXLENBQUM7QUFDcEIsQ0FBQztBQUVELE1BQU0sT0FBTyxtQkFBb0IsU0FBUSxXQUFXO0lBY25ELFlBQ1EsUUFBYSxFQUNaLE9BQWU7UUFFdkIsS0FBSyxFQUFFLENBQUM7UUFIRCxhQUFRLEdBQVIsUUFBUSxDQUFLO1FBQ1osWUFBTyxHQUFQLE9BQU8sQ0FBUTtRQVp4QixnQkFBVyxHQUFHLEtBQUssQ0FBQztRQUNwQixhQUFRLEdBQUcsS0FBSyxDQUFDO1FBQ2pCLGVBQVUsR0FBRyxLQUFLLENBQUM7UUFDbkIsZ0JBQVcsR0FBRyxLQUFLLENBQUM7UUFDcEIsVUFBSyxHQUFHLEtBQUssQ0FBQztRQUVOLFVBQUssR0FBRyxLQUFLLENBQUM7UUFFdEIscUJBQWdCLEdBQUcsS0FBSyxDQUFDO1FBY2pCLGtCQUFhLHdDQUF5RDtRQWtFOUUsZ0JBQVcsR0FBNEIsU0FBUyxDQUFDO1FBR3pDLHVCQUFrQixHQUF1QixTQUFTLENBQUM7UUEzRTFELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3hDLENBQUM7SUFFRCxJQUFhLE1BQU0sS0FBSyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQzlDLElBQWEsUUFBUSxLQUFLLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFHaEQsSUFBYSxZQUFZLEtBQThCLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFDbkYsSUFBYSxZQUFZLENBQUMsWUFBcUM7UUFDOUQsSUFBSSxJQUFJLENBQUMsYUFBYSxLQUFLLFlBQVksRUFBRSxDQUFDO1lBQ3pDLElBQUksQ0FBQyxhQUFhLEdBQUcsWUFBWSxDQUFDO1lBQ2xDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN0QyxDQUFDO0lBQ0YsQ0FBQztJQUVRLE9BQU8sS0FBa0MsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDM0gsT0FBTyxDQUFDLEtBQXVHO1FBQ3ZILElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzFCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksS0FBSyxZQUFZLFdBQVcsRUFBRSxDQUFDO1lBQ2xDLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxLQUFLLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLElBQUksS0FBSyxZQUFZLG1CQUFtQixJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzlKLENBQUM7UUFDRCxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEtBQUssS0FBSyxDQUFDLE9BQU8sRUFBRSxRQUFRLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxRQUFRLEtBQUssU0FBUyxDQUFDLENBQUM7SUFDdkksQ0FBQztJQUNELG9CQUFvQixDQUFDLFFBQWEsSUFBVSxDQUFDO0lBQzdDLEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBZ0IsSUFBSSxDQUFDO0lBQ3ZDLFdBQVcsS0FBSyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDbkMsZ0JBQWdCLENBQUMsSUFBWSxJQUFVLENBQUM7SUFDeEMsdUJBQXVCLENBQUMsV0FBbUIsSUFBVSxDQUFDO0lBQ3RELG9CQUFvQixDQUFDLFFBQWdCLElBQUksQ0FBQztJQUMxQyxvQkFBb0IsQ0FBQyxRQUFnQixJQUFVLENBQUM7SUFDaEQsYUFBYSxDQUFDLFVBQWtCLEVBQUUsTUFBZSxJQUFJLENBQUM7SUFDdEQsc0JBQXNCLENBQUMsVUFBa0IsSUFBSSxDQUFDO0lBQzlDLG9CQUFvQixLQUFXLENBQUM7SUFDaEMsYUFBYTtRQUNaLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO0lBQ25CLENBQUM7SUFDUSxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQXdCLEVBQUUsT0FBc0I7UUFDbkUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7UUFDckIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBQ1EsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUF3QixFQUFFLE9BQXNCO1FBQ3JFLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUNRLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBc0IsRUFBRSxPQUF3QjtRQUNyRSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztRQUN4QixJQUFJLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN0QixJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztRQUN4QixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztJQUNwQixDQUFDO0lBQ1EsU0FBUztRQUNqQixJQUFJLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzNCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNwQyxDQUFDO0lBQ0QsV0FBVyxLQUFXLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNwQyxVQUFVO1FBQ2xCLE9BQU8sSUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDakUsQ0FBQztJQUNELFFBQVEsS0FBVyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDOUIsT0FBTztRQUNmLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQztJQUNuQixDQUFDO0lBQ0QsVUFBVSxLQUFjLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUM5QixPQUFPO1FBQ2YsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO0lBQ3pCLENBQUM7SUFFUSxLQUFLLENBQUMsTUFBTSxLQUF1QyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBR3RGLGVBQWUsQ0FBQyxNQUFjO1FBQzdCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxNQUFNLENBQUM7SUFDbEMsQ0FBQztJQUVRLE9BQU8sQ0FBQyxXQUE0QixFQUFFLFdBQTRCO1FBQzFFLElBQUksT0FBTyxJQUFJLENBQUMsa0JBQWtCLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDakQsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUM7UUFDaEMsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDaEQsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLDhCQUErQixTQUFRLG1CQUFtQjtJQUV0RSxJQUFhLFlBQVksS0FBOEIsc0RBQTJDLENBQUMsQ0FBQztDQUNwRztBQUVELE1BQU0sT0FBTyxjQUFlLFNBQVEsY0FBYztJQUFsRDs7UUFJVSxhQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ2hCLFVBQUssR0FBMkIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QywwQkFBcUIsR0FBaUMsU0FBUyxDQUFDO1FBRWhFLG1DQUE4QixHQUFnQyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBMENuRixDQUFDO0lBeENBLGFBQWE7UUFDWixPQUFPLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUMxQixDQUFDO0lBRUQsVUFBVTtRQUNULE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFVBQVUsK0RBQTBFLENBQUM7UUFDbkgsS0FBSyxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQztZQUNqRCxPQUFPLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzlCLENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsVUFBVSw2REFBd0UsQ0FBQztRQUMvRyxLQUFLLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUMvQyxPQUFPLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1QixDQUFDO0lBQ0YsQ0FBQztJQUVELGtCQUFrQixDQUFDLElBQWlCO1FBQ25DLE9BQU8sVUFBVSxDQUFDLElBQUksQ0FBQztJQUN4QixDQUFDO0lBRUQseUJBQXlCO1FBQ3hCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQscUJBQXFCO1FBQ3BCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRUQsNkJBQTZCLENBQUMsSUFBaUI7UUFDOUMsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxPQUFPLENBQUMsS0FBNEIsSUFBaUIsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBRW5FLGNBQWMsQ0FBQyxJQUFZLElBQXVCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDL0YsY0FBYyxLQUEwQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3JGLGVBQWUsQ0FBQyxVQUF1QyxFQUFFLE9BQWtDLElBQXNCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDOUosZ0JBQWdCLENBQUMsVUFBNkIsSUFBc0IsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVqSCwwQkFBMEIsQ0FBNEIsUUFBMkMsSUFBaUIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUMvSjtBQUVELE1BQU0sT0FBTyxlQUFnQixTQUFRLFdBQVc7SUFHNUIsb0JBQW9CO1FBQ3RDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFbkYsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDO0lBQzFCLENBQUM7Q0FDRDtBQUVELE1BQU0sQ0FBQyxLQUFLLFVBQVUsaUJBQWlCLENBQUMsb0JBQTJDLEVBQUUsV0FBNEI7SUFDaEgsTUFBTSxLQUFLLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ25FLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsWUFBWSxDQUFDO0lBQ2pELElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzNDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFFN0IsTUFBTSxLQUFLLENBQUMsU0FBUyxDQUFDO0lBRXRCLE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELE1BQU0sQ0FBQyxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsb0JBQTJDLEVBQUUsV0FBNEI7SUFDL0csT0FBTyxDQUFDLE1BQU0saUJBQWlCLENBQUMsb0JBQW9CLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUM7QUFDbEYsQ0FBQztBQUVELE1BQU0sT0FBTyxlQUFlO0lBQTVCO1FBR0Msb0JBQWUsR0FBb0IsU0FBUyxDQUFDO0lBSzlDLENBQUM7SUFIQSxRQUFRO1FBQ1AsT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDO0lBQ3hCLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxlQUFlO0lBSTNCLFlBQTZCLG1CQUF3QixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQVMsbUJBQW1CLE9BQU8sQ0FBQyxJQUFJO1FBQTdHLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBcUQ7UUFBUyxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWU7SUFBSSxDQUFDO0lBSS9JLGdCQUFnQixDQUFDLFFBQWEsRUFBRSxJQUErQixFQUFFLElBQWE7UUFDN0UsSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLElBQUksT0FBTyxJQUFJLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDN0QsT0FBTyxlQUFlLENBQUMsSUFBSSxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3BELENBQUM7UUFFRCxPQUFPLGVBQWUsQ0FBQyxJQUFJLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQUVELElBQUksSUFBSSxLQUFLLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBSWpFLFFBQVEsQ0FBQyxPQUFrQztRQUMxQyxPQUFPLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUM5RixDQUFDO0lBRUQsSUFBSSxnQkFBZ0IsS0FBSyxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7SUFFeEQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFZO1FBQ3pCLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN2QixDQUFDO0NBQ0Q7QUFXRCxNQUFNLFVBQVUsdUJBQXVCLENBQUMsS0FBYztJQUNyRCxNQUFNLFNBQVMsR0FBRyxLQUE2QyxDQUFDO0lBRWhFLE9BQU8sU0FBUyxFQUFFLG9CQUFvQixDQUFDO0FBQ3hDLENBQUM7QUFFRCxNQUFNLE9BQU8scUJBQXFCO0lBQWxDO1FBR0MsOEJBQXlCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztJQVd4QyxDQUFDO0lBVEEsS0FBSyxDQUFDLHVCQUF1QixDQUFDLE9BQXdDLEVBQUUsZUFBd0IsSUFBbUMsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNoTCxLQUFLLENBQUMsdUJBQXVCLENBQUMsU0FBK0IsSUFBbUIsQ0FBQztJQUNqRixLQUFLLENBQUMsaUJBQWlCLENBQUMsT0FBa0IsSUFBbUIsQ0FBQztJQUM5RCxLQUFLLENBQUMsb0JBQW9CLENBQUMsVUFBaUIsSUFBbUIsQ0FBQztJQUNoRSxLQUFLLENBQUMsbUJBQW1CLEtBQW9CLENBQUM7SUFDOUMsS0FBSyxDQUFDLGlCQUFpQixLQUErQixPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzdGLEtBQUssQ0FBQyxrQkFBa0IsS0FBNEQsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2hHLEtBQUssQ0FBQyxjQUFjLENBQUMsSUFBUyxJQUFnRCxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNILEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxhQUFrQixJQUFtQyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQy9IO0FBRUQsTUFBTSxPQUFPLDJCQUEyQjtJQUF4QztRQUNDLHdCQUFtQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDakMseUJBQW9CLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztJQVNuQyxDQUFDO0lBTkEsaUNBQWlDLENBQUMsMEJBQWtFLEVBQUUsR0FBa0IsSUFBd0IsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3TCwyQkFBMkIsQ0FBQyxJQUFZLEVBQUUsVUFBOEIsRUFBRSxLQUFhLEVBQUUsU0FBNEIsRUFBRSxlQUFtQyxJQUFxQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVOLGNBQWMsQ0FBQyxPQUErQixFQUFFLE1BQXdCLElBQXVCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxlQUF3QixJQUEyQyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pJLGtCQUFrQixDQUFDLE9BQXlCLElBQVUsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuRyxxQkFBcUIsS0FBeUMsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUMzRztBQUVELE1BQU0sT0FBTyx5QkFBeUI7SUFBdEM7UUFHQyxjQUFTLEdBQWlDLEVBQUUsQ0FBQztRQUM3Qyx5QkFBb0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2xDLHVCQUFrQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDaEMsa0NBQTZCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUMzQyw4QkFBeUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3ZDLHlCQUFvQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFnQm5DLENBQUM7SUFmQSxVQUFVLENBQUMsUUFBMkIsRUFBRSxhQUFzQyxJQUFtQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzlJLGNBQWMsQ0FBQyxRQUEyQixJQUFVLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakcsYUFBYSxDQUFDLGVBQWtDLEVBQUUsaUJBQXNDLElBQXVCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUosa0JBQWtCLENBQUMsYUFBdUIsSUFBbUIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxRyxlQUFlLENBQUMsUUFBMkIsSUFBUyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pHLFdBQVcsQ0FBQyxpQkFBbUQsSUFBeUIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNySSxvQkFBb0IsQ0FBQyxRQUFhLElBQXlCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEcsaUJBQWlCLENBQUMsUUFBMkIsSUFBVSxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BHLG1CQUFtQixLQUFvQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BGLEtBQUssQ0FBQyxhQUFhLENBQUMsUUFBMkIsSUFBbUIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMvRyx1QkFBdUIsQ0FBQyxRQUF5QixJQUFtQyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pJLGVBQWUsS0FBVyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3ZFLGNBQWMsS0FBVyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RFLFFBQVEsS0FBVyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLFlBQVksS0FBVyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQ3BFO0FBRUQsTUFBTSxPQUFPLHdCQUF3QjtJQUFyQztRQUdDLGNBQVMsR0FBaUMsRUFBRSxDQUFDO1FBQzdDLFdBQU0sR0FBOEIsRUFBRSxDQUFDO1FBRXZDLHFCQUFnQixHQUFXLENBQUMsQ0FBQztRQUM3QixxQkFBZ0IsR0FBOEIsWUFBWSxDQUFDO1FBQzNELDJCQUFzQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDcEMsc0JBQWlCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUMvQixjQUFTLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN2QixzQkFBaUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQy9CLGdDQUEyQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDekMseUJBQW9CLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNsQyx1QkFBa0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2hDLGtDQUE2QixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDM0MsOEJBQXlCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN2Qyx5QkFBb0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBNEJuQyxDQUFDO0lBM0JBLFdBQVcsQ0FBQyxRQUFjLElBQW9CLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDM0YsbUJBQW1CLENBQUMsUUFBMkIsSUFBZ0MsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1SCxTQUFTLENBQUMsTUFBK0MsRUFBRSxNQUF5QixJQUFVLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDM0ksY0FBYyxDQUFDLE1BQStDLElBQVUsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNySCxZQUFZLENBQUMsTUFBeUIsRUFBRSxNQUF5QixFQUFFLElBQXdCLElBQVUsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsSixlQUFlLENBQUMsUUFBMkIsSUFBVSxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xHLGFBQWEsQ0FBQyxTQUE4QixJQUFVLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkcsZUFBZSxDQUFDLFFBQTJCLElBQWEsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyRyxjQUFjLEtBQWUsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxRSxxQkFBcUIsQ0FBQyxLQUFhLElBQVUsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxRixvQkFBb0IsS0FBVyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVFLHdCQUF3QixLQUFXLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEYsd0JBQXdCLENBQUMsYUFBcUIsSUFBVSxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3JHLFlBQVksQ0FBQyxTQUFzQixJQUFVLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUYsU0FBUyxDQUFDLEtBQWUsSUFBbUIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN6RixTQUFTLEtBQVcsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqRSxTQUFTLEtBQVcsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqRSxVQUFVLEtBQVcsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsRSxpQkFBaUIsQ0FBQyxRQUEyQixJQUFVLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEcsbUJBQW1CLEtBQW9CLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEYsS0FBSyxDQUFDLGFBQWEsQ0FBQyxRQUEyQixJQUFtQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQy9HLHVCQUF1QixDQUFDLFFBQXlCLElBQW1DLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDakksZUFBZSxLQUFXLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdkUsY0FBYyxLQUFXLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEUsUUFBUSxLQUFXLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEUsWUFBWSxLQUFXLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDcEUsZ0JBQWdCLEtBQVcsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUN4RTtBQUVELE1BQU0sT0FBTywwQkFBMEI7SUFBdkM7UUFFQyxzQkFBaUIsR0FBdUIsRUFBRSxDQUFDO1FBQzNDLHdCQUFtQixHQUFnQyxFQUFFLENBQUM7UUFDdEQsa0JBQWEsR0FBa0IsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pELGlDQUE0QixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFTM0MsQ0FBQztJQVJBLGNBQWMsS0FBc0IsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqRix3QkFBd0IsS0FBVyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hGLHFCQUFxQixLQUF5QixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNGLGlCQUFpQixLQUFtQyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pHLDRCQUE0QixDQUFDLGlCQUFxQyxJQUFvRCxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ25LLDBCQUEwQixDQUFDLElBQXFDLElBQW1CLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEksNkJBQTZCLENBQUMsbUJBQTJCLEVBQUUsRUFBVSxJQUEwQyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVKLCtCQUErQixDQUFDLG1CQUEyQixFQUFFLEVBQVUsRUFBRSxlQUF5QyxJQUFpQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQ2hMO0FBRUQsTUFBTSxPQUFPLGtDQUFrQztJQUEvQztRQUVDLHVCQUFrQixHQUFHLEVBQUUsQ0FBQztJQVd6QixDQUFDO0lBVkEsV0FBVyxDQUFDLGlCQUFxQyxJQUFVLENBQUM7SUFDNUQsS0FBSyxDQUFDLHdCQUF3QixDQUFDLGlCQUFxQyxFQUFFLE9BQXlDLElBQW1CLENBQUM7SUFDbkksS0FBSyxDQUFDLGlCQUFpQixDQUFDLE9BQXlDLElBQStCLE9BQU8sRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN2SyxLQUFLLENBQUMsZUFBZSxDQUFDLE9BQXlDLElBQXFCLE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQztJQUN4RyxLQUFLLENBQUMsbUJBQW1CLENBQUMsT0FBeUMsSUFBZ0MsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQy9HLGNBQWMsS0FBK0IsT0FBTyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUN2RSxLQUFLLENBQUMsY0FBYyxLQUFtQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDcEUsa0JBQWtCLENBQUMsR0FBVyxFQUFFLEVBQW1CLElBQXlCLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUMvRix5QkFBeUIsQ0FBQyxHQUFXLElBQXlCLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUNqRixrQ0FBa0MsQ0FBQyxLQUFlLEVBQUUsU0FBbUIsSUFBd0MsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUM1SjtBQUVELE1BQU0sT0FBTyxnQ0FBaUMsU0FBUSw0QkFBNEI7SUFDakYsSUFBSSxXQUFXLEtBQUssT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztJQUMvQyxtREFBbUQ7SUFDbkQsU0FBUyxDQUFDLE1BQXVDLElBQUksSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFhLENBQUMsQ0FBQyxDQUFDO0NBQ3BGO0FBRUQsTUFBTSxPQUFPLHFCQUFxQjtJQUFsQztRQUdVLFdBQU0sR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3BCLFdBQU0sR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBRXBCLGNBQVMsR0FBRyxlQUFlLENBQUMsaUNBQWlDLEVBQUUsS0FBNEIsQ0FBQyxDQUFDO1FBQzdGLHNCQUFpQixHQUFHLFNBQVMsQ0FBQztRQUM5QixnQkFBVyxHQUFHLFNBQVUsQ0FBQztJQTRCbkMsQ0FBQztJQXZCQSxLQUFLLENBQUMsSUFBSSxDQUEyQixLQUF5RCxFQUFFLE9BQThDLEVBQUUsS0FBeUI7UUFDeEssSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDMUIsbURBQW1EO1lBQ25ELE9BQVksRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLENBQUM7UUFDL0YsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxLQUFLLENBQUMsT0FBdUIsRUFBRSxLQUF5QixJQUFxQixPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUMsVUFBVSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFFL0ksZUFBZSxLQUEwRSxNQUFNLElBQUksS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQy9ILGNBQWMsS0FBZ0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwRSxpQkFBaUIsS0FBbUIsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqRixlQUFlLEtBQThDLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkcsS0FBSyxLQUFXLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEQsTUFBTSxLQUFXLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdkQsUUFBUSxDQUFDLElBQWEsRUFBRSxhQUEyQyxJQUFVLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkgsTUFBTSxLQUFvQixNQUFNLElBQUksS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLElBQUksS0FBb0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5RCxNQUFNLEtBQW9CLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEUsWUFBWSxDQUFDLFNBQTJELElBQVUsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN4SCxXQUFXLEtBQVcsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUM1RDtBQUVELE1BQU0sNEJBQTRCO0lBSWpDLG9CQUFvQixDQUFDLFVBQWtCLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ25FLEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBYSxFQUFFLGNBQXFDLElBQWlDLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztDQUM3SDtBQUVELE1BQU0sT0FBTyxzQkFBc0I7SUFJbEMsYUFBYSxLQUFvQyxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDL0QsS0FBSyxDQUFDLGNBQWMsS0FBOEMsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2hGLEtBQUssQ0FBQyxpQkFBaUIsS0FBOEMsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ25GLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxpQkFBeUIsSUFBNEMsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2xILEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxPQUErQixJQUEwQyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDcEgsS0FBSyxDQUFDLG9CQUFvQixDQUFDLGNBQThCLElBQW1CLENBQUM7SUFDN0UsS0FBSyxDQUFDLFlBQVksQ0FBQyxTQUFpQixFQUFFLElBQXFCLElBQW1CLENBQUM7SUFDL0UsS0FBSyxDQUFDLGNBQWMsS0FBb0IsQ0FBQztJQUN6QyxLQUFLLENBQUMsZ0JBQWdCLEtBQWtDLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUMzRSxLQUFLLENBQUMsYUFBYSxLQUFvQixDQUFDO0NBQ3hDO0FBRUQsTUFBTSxPQUFPLGtDQUFrQztJQUU5QyxLQUFLLENBQUMsbUJBQW1CLEtBQXVDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3hGLGNBQWMsS0FBdUMsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUNsRztBQUVELE1BQU0sT0FBTyx1Q0FBdUM7SUFBcEQ7UUFFQyx3QkFBbUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBV2xDLENBQUM7SUFWQSxrQkFBa0IsQ0FBQyxTQUFxQixJQUFxQixnREFBdUMsQ0FBQyxDQUFDO0lBQ3RHLG1CQUFtQixDQUFDLFVBQXdCLEVBQUUsc0JBQXNFLElBQXVCLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN2SiwrQkFBK0IsQ0FBQyxTQUFxQixJQUFxQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdEcsbUJBQW1CLENBQUMsU0FBcUIsSUFBYSxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDcEUsNEJBQTRCLENBQUMsU0FBcUIsSUFBYSxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDN0UsU0FBUyxDQUFDLFNBQXFCLElBQWEsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzFELHdCQUF3QixDQUFDLGVBQWdDLElBQWEsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3BGLGtCQUFrQixDQUFDLFNBQXFCLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3BFLEtBQUssQ0FBQyxhQUFhLENBQUMsVUFBd0IsRUFBRSxLQUFzQixJQUF3QixPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDeEcsS0FBSyxDQUFDLG9EQUFvRCxLQUFvQixDQUFDO0NBQy9FO0FBRUQsTUFBTSxPQUFPLHVDQUF1QztJQUFwRDtRQUVDLHVCQUFrQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDaEMsMkJBQXNCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNwQyx5QkFBb0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2xDLDRCQUF1QixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDckMsaUNBQTRCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUMxQyxtQ0FBOEIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQzVDLHVDQUFrQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDaEQscUNBQWdDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUM5Qyx3Q0FBbUMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2pELHlDQUFvQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDbEQsNkNBQXdDLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN0RCx1QkFBa0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2hDLDBCQUFxQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDbkMsc0JBQWlCLEdBQUcsSUFBSSxDQUFDO0lBeUQxQixDQUFDO0lBeERBLFdBQVcsQ0FBQyxRQUFhLEVBQUUsUUFBNkMsRUFBRSxjQUEyQztRQUNwSCxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNELG1CQUFtQixDQUFDLFFBQWE7UUFDaEMsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFDRCx3QkFBd0IsQ0FBQyxVQUFrQztRQUMxRCxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNELEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxPQUEwQixFQUFFLFNBQTBCLEVBQUUsY0FBMkMsSUFBOEIsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQzVLLEdBQUcsQ0FBQyxTQUEwQjtRQUM3QixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNELFdBQVcsQ0FBQyxJQUFTO1FBQ3BCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBQ0QsT0FBTyxDQUFDLElBQVMsRUFBRSxPQUFvQztRQUN0RCxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNELFNBQVMsS0FBNkIsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3BELEtBQUssQ0FBQyxVQUFVLENBQUMsU0FBNEIsSUFBbUIsT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzlFLGtCQUFrQixDQUFDLFNBQTRCLEVBQUUsT0FBb0M7UUFDcEYsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFDRCxTQUFTLENBQUMsU0FBMEIsRUFBRSxPQUFzQztRQUMzRSxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNELG1CQUFtQixDQUFDLFVBQW9DO1FBQ3ZELE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBQ0QsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFnQyxJQUFnQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDL0YsNEJBQTRCO1FBQzNCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBQ0QsS0FBSyxDQUFDLGNBQWMsQ0FBQyxLQUFzQixFQUFFLFFBQTJCLElBQThCLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNySCxtQkFBbUIsQ0FBQyxZQUE2QyxJQUFVLENBQUM7SUFDNUUsS0FBSyxDQUFDLGlCQUFpQixLQUE4QixrREFBZ0MsQ0FBQyxDQUFDO0lBQ3ZGLEtBQUssQ0FBQyxPQUFPLEtBQW9CLENBQUM7SUFDbEMsUUFBUTtRQUNQLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBQ0QsY0FBYyxLQUFvQixNQUFNLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyRSxzQkFBc0IsS0FBK0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEYsNEJBQTRCLEtBQWlDLE1BQU0sSUFBSSxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hHLGtCQUFrQixDQUFDLElBQXNCLEVBQUUsRUFBb0IsSUFBbUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDckgsdUNBQXVDLEtBQVksTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNoRywrQkFBK0IsS0FBaUMsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3Ryx3QkFBd0IsS0FBK0IsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwRyxhQUFhLEtBQW9DLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDOUYsb0NBQW9DLENBQUMsTUFBZSxJQUFtQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BILHFCQUFxQixDQUFDLFNBQTRCLElBQTJDLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUksa0JBQWtCLENBQUMsU0FBNEIsSUFBYSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDM0Usb0JBQW9CLEtBQUssT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3JDLGVBQWUsS0FBVyxDQUFDO0lBQzNCLGlCQUFpQixLQUFXLENBQUM7SUFDN0IsS0FBSyxDQUFDLHFCQUFxQixDQUFDLFVBQWtDLElBQW1CLENBQUM7Q0FDbEY7QUFJRCxNQUFNLE9BQU8sK0JBQStCO0lBQTVDO1FBRUMsdUJBQWtCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztJQXlCakMsQ0FBQztJQXhCQSxLQUFLLENBQUMsb0JBQW9CLEtBQTRCLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNsRSxLQUFLLENBQUMsa0JBQWtCLEtBQW1DLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN2RSxLQUFLLENBQUMsOEJBQThCLEtBQTRCLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM1RSxLQUFLLENBQUMsY0FBYztRQUNuQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNELHFCQUFxQixDQUFDLGlCQUFzQixFQUFFLGFBQTRCO1FBQ3pFLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBQ0QsWUFBWSxDQUFDLFFBQWEsRUFBRSxRQUF1TjtRQUNsUCxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNELHVCQUF1QixDQUFDLGdCQUFtQyxFQUFFLFFBQXVOO1FBQ25SLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBQ0QsZUFBZTtRQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBQ0QsY0FBYyxDQUFDLFNBQTRCLEVBQUUsUUFBMkIsRUFBRSxlQUFvQjtRQUM3RixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNELHFCQUFxQixDQUFDLGlCQUFzQjtRQUMzQyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztDQUNEO0FBRUQsTUFBTSxDQUFDLEtBQUssVUFBVSxpQkFBaUIsQ0FBQyxvQkFBMkM7SUFDbEYsT0FBTyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFDLFFBQVEsRUFBQyxFQUFFO1FBQzNELE1BQU0sa0JBQWtCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQzdELE1BQU0sa0JBQWtCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBRTlELEtBQUssTUFBTSxXQUFXLElBQUksa0JBQWtCLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDNUQsTUFBTSxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDNUIsQ0FBQztRQUVELEtBQUssTUFBTSxLQUFLLElBQUksa0JBQWtCLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDL0MsTUFBTSxLQUFLLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDL0IsQ0FBQztRQUVELEtBQUssTUFBTSxLQUFLLElBQUksa0JBQWtCLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDL0Msa0JBQWtCLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxNQUFNLE9BQU8sc0JBQXNCO0lBQW5DO1FBSVUseUJBQW9CLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNsQyx5QkFBb0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBSzVDLENBQUM7SUFIQSxlQUFlLENBQUMsUUFBeUQ7UUFDeEUsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxxQkFBcUI7SUFBbEM7UUFNQyxtQkFBYyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDNUIsMkJBQXNCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNwQyw2QkFBd0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3RDLDhCQUF5QixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFZeEMsQ0FBQztJQVZBLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBbUIsRUFBRSxhQUF1QixJQUFzQixPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDOUYsS0FBSyxDQUFDLFlBQVksQ0FBQyxhQUF1QixJQUFzQyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDbkcsYUFBYSxLQUFpQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDMUQsbUJBQW1CLENBQUMsR0FBUSxJQUE2QixPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFHNUUsS0FBSyxDQUFDLFdBQVcsQ0FBQyxlQUF3QixFQUFFLE1BQWdCLEVBQUUsT0FBaUIsSUFBc0MsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ3hJLDBCQUEwQixDQUFDLGVBQW9CLElBQTZCLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUMvRixxQkFBcUIsQ0FBQyxRQUEyQixJQUFnQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0YsUUFBUSxDQUFDLFNBQXNCLElBQWlCLE9BQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Q0FDekUifQ==