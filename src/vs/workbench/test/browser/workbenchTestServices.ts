/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileEditorInput } from '../../contrib/files/browser/editors/fileEditorInput.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { basename, isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../platform/telemetry/common/telemetryUtils.js';
import { EditorInput } from '../../common/editor/editorInput.js';
import { EditorInputWithOptions, IEditorIdentifier, IUntitledTextResourceEditorInput, IResourceDiffEditorInput, IEditorPane, IEditorCloseEvent, IEditorPartOptions, IRevertOptions, GroupIdentifier, EditorsOrder, IFileEditorInput, IEditorFactoryRegistry, IEditorSerializer, EditorExtensions, ISaveOptions, IMoveResult, ITextDiffEditorPane, IVisibleEditorPane, IEditorOpenContext, EditorExtensions as Extensions, EditorInputCapabilities, IUntypedEditorInput, IEditorWillMoveEvent, IEditorWillOpenEvent, IActiveEditorChangeEvent, EditorPaneSelectionChangeReason, IEditorPaneSelection, IToolbarActions } from '../../common/editor.js';
import { EditorServiceImpl, IEditorGroupView, IEditorGroupsView, IEditorGroupTitleHeight, DEFAULT_EDITOR_PART_OPTIONS } from '../../browser/parts/editor/editor.js';
import { Event, Emitter } from '../../../base/common/event.js';
import { IResolvedWorkingCopyBackup, IWorkingCopyBackupService } from '../../services/workingCopy/common/workingCopyBackup.js';
import { IConfigurationService, ConfigurationTarget, IConfigurationValue } from '../../../platform/configuration/common/configuration.js';
import { IWorkbenchLayoutService, PanelAlignment, Parts, Position as PartPosition } from '../../services/layout/browser/layoutService.js';
import { TextModelResolverService } from '../../services/textmodelResolver/common/textModelResolverService.js';
import { ITextModelService } from '../../../editor/common/services/resolverService.js';
import { IEditorOptions, IResourceEditorInput, IResourceEditorInputIdentifier, ITextResourceEditorInput, ITextEditorOptions } from '../../../platform/editor/common/editor.js';
import { IUntitledTextEditorService, UntitledTextEditorService } from '../../services/untitled/common/untitledTextEditorService.js';
import { IWorkspaceContextService, IWorkspaceIdentifier } from '../../../platform/workspace/common/workspace.js';
import { ILifecycleService, ShutdownReason, StartupKind, LifecyclePhase, WillShutdownEvent, BeforeShutdownErrorEvent, InternalBeforeShutdownEvent, IWillShutdownEventJoiner } from '../../services/lifecycle/common/lifecycle.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { FileOperationEvent, IFileService, IFileStat, IFileStatResult, FileChangesEvent, IResolveFileOptions, ICreateFileOptions, IFileSystemProvider, FileSystemProviderCapabilities, IFileChange, IWatchOptions, IStat, FileType, IFileDeleteOptions, IFileOverwriteOptions, IFileWriteOptions, IFileOpenOptions, IFileStatWithMetadata, IResolveMetadataFileOptions, IWriteFileOptions, IReadFileOptions, IFileContent, IFileStreamContent, FileOperationError, IFileSystemProviderWithFileReadStreamCapability, IFileReadStreamOptions, IReadFileStreamOptions, IFileSystemProviderCapabilitiesChangeEvent, IFileStatWithPartialMetadata, IFileSystemWatcher, IWatchOptionsWithCorrelation, IFileSystemProviderActivationEvent } from '../../../platform/files/common/files.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { LanguageService } from '../../../editor/common/services/languageService.js';
import { ModelService } from '../../../editor/common/services/modelService.js';
import { IResourceEncoding, ITextFileService, IReadTextFileOptions, ITextFileStreamContent, IWriteTextFileOptions, ITextFileEditorModel, ITextFileEditorModelManager } from '../../services/textfile/common/textfiles.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { IHistoryService } from '../../services/history/common/history.js';
import { IInstantiationService, ServiceIdentifier } from '../../../platform/instantiation/common/instantiation.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { MenuBarVisibility, IWindowOpenable, IOpenWindowOptions, IOpenEmptyWindowOptions } from '../../../platform/window/common/window.js';
import { TestWorkspace } from '../../../platform/workspace/test/common/testWorkspace.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from '../../../editor/common/services/textResourceConfiguration.js';
import { IPosition, Position as EditorPosition } from '../../../editor/common/core/position.js';
import { IMenuService, MenuId, IMenu, IMenuChangeEvent, IMenuActionOptions, MenuItemAction, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { ContextKeyValue, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService, MockKeybindingService } from '../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ITextBufferFactory, DefaultEndOfLine, EndOfLinePreference, ITextSnapshot } from '../../../editor/common/model.js';
import { Range } from '../../../editor/common/core/range.js';
import { IDialogService, IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions, IFileDialogService, ConfirmResult } from '../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../platform/notification/test/common/testNotificationService.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IDecorationsService, IResourceDecorationChangeEvent, IDecoration, IDecorationData, IDecorationsProvider } from '../../services/decorations/common/decorations.js';
import { IDisposable, toDisposable, Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IEditorGroupsService, IEditorGroup, GroupsOrder, GroupsArrangement, GroupDirection, IMergeGroupOptions, IEditorReplacement, IFindGroupScope, EditorGroupLayout, ICloseEditorOptions, GroupOrientation, ICloseAllEditorsOptions, ICloseEditorsFilter, IEditorDropTargetDelegate, IEditorPart, IAuxiliaryEditorPart, IEditorGroupsContainer, IEditorWorkingSet, IEditorGroupContextKeyProvider, IEditorWorkingSetOptions } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService, ISaveEditorsOptions, IRevertAllEditorsOptions, PreferredGroup, IEditorsChangeEvent, ISaveEditorsResult } from '../../services/editor/common/editorService.js';
import { ICodeEditorService } from '../../../editor/browser/services/codeEditorService.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../browser/editor.js';
import { IDimension } from '../../../base/browser/dom.js';
import { ILoggerService, ILogService, NullLogService } from '../../../platform/log/common/log.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { PaneComposite, PaneCompositeDescriptor } from '../../browser/panecomposite.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../platform/storage/common/storage.js';
import { IProcessEnvironment, isLinux, isWindows, OperatingSystem } from '../../../base/common/platform.js';
import { LabelService } from '../../services/label/common/labelService.js';
import { Part } from '../../browser/part.js';
import { bufferToStream, VSBuffer, VSBufferReadable, VSBufferReadableStream } from '../../../base/common/buffer.js';
import { Schemas } from '../../../base/common/network.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import product from '../../../platform/product/common/product.js';
import { IHostService } from '../../services/host/browser/host.js';
import { IWorkingCopyService, WorkingCopyService } from '../../services/workingCopy/common/workingCopyService.js';
import { IWorkingCopy, IWorkingCopyBackupMeta, IWorkingCopyIdentifier } from '../../services/workingCopy/common/workingCopy.js';
import { IFilesConfigurationService, FilesConfigurationService } from '../../services/filesConfiguration/common/filesConfigurationService.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { BrowserWorkbenchEnvironmentService } from '../../services/environment/browser/environmentService.js';
import { BrowserTextFileService } from '../../services/textfile/browser/browserTextFileService.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { createTextBufferFactoryFromStream } from '../../../editor/common/model/textModel.js';
import { IPathService } from '../../services/path/common/pathService.js';
import { Direction } from '../../../base/browser/ui/grid/grid.js';
import { IProgressService, IProgressOptions, IProgressWindowOptions, IProgressNotificationOptions, IProgressCompositeOptions, IProgress, IProgressStep, Progress, IProgressDialogOptions, IProgressIndicator } from '../../../platform/progress/common/progress.js';
import { IWorkingCopyFileService, WorkingCopyFileService } from '../../services/workingCopy/common/workingCopyFileService.js';
import { UndoRedoService } from '../../../platform/undoRedo/common/undoRedoService.js';
import { IUndoRedoService } from '../../../platform/undoRedo/common/undoRedo.js';
import { TextFileEditorModel } from '../../services/textfile/common/textFileEditorModel.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { EditorPane } from '../../browser/parts/editor/editorPane.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { TestDialogService } from '../../../platform/dialogs/test/common/testDialogService.js';
import { CodeEditorService } from '../../services/editor/browser/codeEditorService.js';
import { MainEditorPart } from '../../browser/parts/editor/editorPart.js';
import { ICodeEditor } from '../../../editor/browser/editorBrowser.js';
import { IDiffEditor } from '../../../editor/common/editorCommon.js';
import { IInputBox, IInputOptions, IPickOptions, IQuickInputButton, IQuickInputService, IQuickNavigateConfiguration, IQuickPick, IQuickPickItem, IQuickWidget, QuickPickInput } from '../../../platform/quickinput/common/quickInput.js';
import { QuickInputService } from '../../services/quickinput/browser/quickInputService.js';
import { IListService } from '../../../platform/list/browser/listService.js';
import { win32, posix } from '../../../base/common/path.js';
import { TestContextService, TestStorageService, TestTextResourcePropertiesService, TestExtensionService, TestProductService, createFileStat, TestLoggerService, TestWorkspaceTrustManagementService, TestWorkspaceTrustRequestService, TestMarkerService, TestHistoryService } from '../common/workbenchTestServices.js';
import { IView, ViewContainer, ViewContainerLocation } from '../../common/views.js';
import { IViewsService } from '../../services/views/common/viewsService.js';
import { IPaneComposite } from '../../common/panecomposite.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../platform/uriIdentity/common/uriIdentityService.js';
import { InMemoryFileSystemProvider } from '../../../platform/files/common/inMemoryFilesystemProvider.js';
import { newWriteableStream, ReadableStreamEvents } from '../../../base/common/stream.js';
import { EncodingOracle, IEncodingOverride } from '../../services/textfile/browser/textFileService.js';
import { UTF16le, UTF16be, UTF8_with_bom } from '../../services/textfile/common/encoding.js';
import { ColorScheme } from '../../../platform/theme/common/theme.js';
import { Iterable } from '../../../base/common/iterator.js';
import { InMemoryWorkingCopyBackupService } from '../../services/workingCopy/common/workingCopyBackupService.js';
import { BrowserWorkingCopyBackupService } from '../../services/workingCopy/browser/workingCopyBackupService.js';
import { FileService } from '../../../platform/files/common/fileService.js';
import { TextResourceEditor } from '../../browser/parts/editor/textResourceEditor.js';
import { TestCodeEditor } from '../../../editor/test/browser/testCodeEditor.js';
import { TextFileEditor } from '../../contrib/files/browser/editors/textFileEditor.js';
import { TextResourceEditorInput } from '../../common/editor/textResourceEditorInput.js';
import { UntitledTextEditorInput } from '../../services/untitled/common/untitledTextEditorInput.js';
import { SideBySideEditor } from '../../browser/parts/editor/sideBySideEditor.js';
import { IEnterWorkspaceResult, IRecent, IRecentlyOpened, IWorkspaceFolderCreationData, IWorkspacesService } from '../../../platform/workspaces/common/workspaces.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../platform/workspace/common/workspaceTrust.js';
import { IExtensionTerminalProfile, IShellLaunchConfig, ITerminalBackend, ITerminalLogService, ITerminalProfile, TerminalIcon, TerminalLocation, TerminalShellType } from '../../../platform/terminal/common/terminal.js';
import { ICreateTerminalOptions, IDeserializedTerminalEditorInput, ITerminalConfigurationService, ITerminalEditorService, ITerminalGroup, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, TerminalEditorLocation } from '../../contrib/terminal/browser/terminal.js';
import { assertIsDefined, upcast } from '../../../base/common/types.js';
import { IRegisterContributedProfileArgs, IShellLaunchConfigResolveOptions, ITerminalProfileProvider, ITerminalProfileResolverService, ITerminalProfileService, type ITerminalConfiguration } from '../../contrib/terminal/common/terminal.js';
import { EditorResolverService } from '../../services/editor/browser/editorResolverService.js';
import { FILE_EDITOR_INPUT_ID } from '../../contrib/files/common/files.js';
import { IEditorResolverService } from '../../services/editor/common/editorResolverService.js';
import { IWorkingCopyEditorService, WorkingCopyEditorService } from '../../services/workingCopy/common/workingCopyEditorService.js';
import { IElevatedFileService } from '../../services/files/common/elevatedFileService.js';
import { BrowserElevatedFileService } from '../../services/files/browser/elevatedFileService.js';
import { IEditorWorkerService } from '../../../editor/common/services/editorWorker.js';
import { ResourceMap } from '../../../base/common/map.js';
import { SideBySideEditorInput } from '../../common/editor/sideBySideEditorInput.js';
import { ITextEditorService, TextEditorService } from '../../services/textfile/common/textEditorService.js';
import { IPaneCompositePartService } from '../../services/panecomposite/browser/panecomposite.js';
import { IPaneCompositePart } from '../../browser/parts/paneCompositePart.js';
import { ILanguageConfigurationService } from '../../../editor/common/languages/languageConfigurationRegistry.js';
import { TestLanguageConfigurationService } from '../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { TerminalEditorInput } from '../../contrib/terminal/browser/terminalEditorInput.js';
import { IGroupModelChangeEvent } from '../../common/editor/editorGroupModel.js';
import { env } from '../../../base/common/process.js';
import { isValidBasename } from '../../../base/common/extpath.js';
import { TestAccessibilityService } from '../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from '../../../editor/common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../editor/common/services/languageFeaturesService.js';
import { TextEditorPaneSelection } from '../../browser/parts/editor/textEditor.js';
import { Selection } from '../../../editor/common/core/selection.js';
import { IFolderBackupInfo, IWorkspaceBackupInfo } from '../../../platform/backup/common/backup.js';
import { TestEditorWorkerService } from '../../../editor/test/common/services/testEditorWorkerService.js';
import { IExtensionHostExitInfo, IRemoteAgentConnection, IRemoteAgentService } from '../../services/remote/common/remoteAgentService.js';
import { ILanguageDetectionService } from '../../services/languageDetection/common/languageDetectionWorkerService.js';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from '../../../platform/diagnostics/common/diagnostics.js';
import { ExtensionType, IExtension, IExtensionDescription, IRelaxedExtensionManifest, TargetPlatform } from '../../../platform/extensions/common/extensions.js';
import { IRemoteAgentEnvironment } from '../../../platform/remote/common/remoteAgentEnvironment.js';
import { ILayoutOffsetInfo } from '../../../platform/layout/browser/layoutService.js';
import { IUserDataProfile, IUserDataProfilesService, toUserDataProfile, UserDataProfilesService } from '../../../platform/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../services/userDataProfile/common/userDataProfileService.js';
import { IUserDataProfileService } from '../../services/userDataProfile/common/userDataProfile.js';
import { EnablementState, IResourceExtension, IScannedExtension, IWebExtensionsScannerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../services/extensionManagement/common/extensionManagement.js';
import { ILocalExtension, IGalleryExtension, InstallOptions, UninstallOptions, IExtensionsControlManifest, IGalleryMetadata, IExtensionManagementParticipant, Metadata, InstallExtensionResult, InstallExtensionInfo, UninstallExtensionInfo } from '../../../platform/extensionManagement/common/extensionManagement.js';
import { Codicon } from '../../../base/common/codicons.js';
import { IRemoteExtensionsScannerService } from '../../../platform/remote/common/remoteExtensionsScanner.js';
import { IRemoteSocketFactoryService, RemoteSocketFactoryService } from '../../../platform/remote/common/remoteSocketFactoryService.js';
import { EditorParts } from '../../browser/parts/editor/editorParts.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IMarkerService } from '../../../platform/markers/common/markers.js';
import { IAccessibilitySignalService } from '../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IEditorPaneService } from '../../services/editor/common/editorPaneService.js';
import { EditorPaneService } from '../../services/editor/browser/editorPaneService.js';
import { IContextMenuService, IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../platform/contextview/browser/contextViewService.js';
import { CustomEditorLabelService, ICustomEditorLabelService } from '../../services/editor/common/customEditorLabelService.js';
import { TerminalConfigurationService } from '../../contrib/terminal/browser/terminalConfigurationService.js';
import { TerminalLogService } from '../../../platform/terminal/common/terminalLogService.js';
import { IEnvironmentVariableService } from '../../contrib/terminal/common/environmentVariable.js';
import { EnvironmentVariableService } from '../../contrib/terminal/common/environmentVariableService.js';
import { ContextMenuService } from '../../../platform/contextview/browser/contextMenuService.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../platform/hover/test/browser/nullHoverService.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../platform/actions/browser/actionViewItemService.js';

export function createFileEditorInput(instantiationService: IInstantiationService, resource: URI): FileEditorInput {
	return instantiationService.createInstance(FileEditorInput, resource, undefined, undefined, undefined, undefined, undefined, undefined);
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerFileEditorFactory({

	typeId: FILE_EDITOR_INPUT_ID,

	createFileEditor: (resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents, instantiationService): IFileEditorInput => {
		return instantiationService.createInstance(FileEditorInput, resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents);
	},

	isFileEditor: (obj): obj is IFileEditorInput => {
		return obj instanceof FileEditorInput;
	}
});

export class TestTextResourceEditor extends TextResourceEditor {

	protected override createEditorControl(parent: HTMLElement, configuration: any): void {
		this.editorControl = this._register(this.instantiationService.createInstance(TestCodeEditor, parent, configuration, {}));
	}
}

export class TestTextFileEditor extends TextFileEditor {

	protected override createEditorControl(parent: HTMLElement, configuration: any): void {
		this.editorControl = this._register(this.instantiationService.createInstance(TestCodeEditor, parent, configuration, { contributions: [] }));
	}

	setSelection(selection: Selection | undefined, reason: EditorPaneSelectionChangeReason): void {
		this._options = selection ? upcast<IEditorOptions, ITextEditorOptions>({ selection }) : undefined;

		this._onDidChangeSelection.fire({ reason });
	}

	override getSelection(): IEditorPaneSelection | undefined {
		const options = this.options;
		if (!options) {
			return undefined;
		}

		const textSelection = (options as ITextEditorOptions).selection;
		if (!textSelection) {
			return undefined;
		}

		return new TextEditorPaneSelection(new Selection(textSelection.startLineNumber, textSelection.startColumn, textSelection.endLineNumber ?? textSelection.startLineNumber, textSelection.endColumn ?? textSelection.startColumn));
	}
}

export interface ITestInstantiationService extends IInstantiationService {
	stub<T>(service: ServiceIdentifier<T>, ctor: any): T;
}

export class TestWorkingCopyService extends WorkingCopyService {
	testUnregisterWorkingCopy(workingCopy: IWorkingCopy): void {
		return super.unregisterWorkingCopy(workingCopy);
	}
}

export function workbenchInstantiationService(
	overrides?: {
		environmentService?: (instantiationService: IInstantiationService) => IEnvironmentService;
		fileService?: (instantiationService: IInstantiationService) => IFileService;
		workingCopyBackupService?: (instantiationService: IInstantiationService) => IWorkingCopyBackupService;
		configurationService?: (instantiationService: IInstantiationService) => TestConfigurationService;
		textFileService?: (instantiationService: IInstantiationService) => ITextFileService;
		pathService?: (instantiationService: IInstantiationService) => IPathService;
		editorService?: (instantiationService: IInstantiationService) => IEditorService;
		contextKeyService?: (instantiationService: IInstantiationService) => IContextKeyService;
		textEditorService?: (instantiationService: IInstantiationService) => ITextEditorService;
	},
	disposables: Pick<DisposableStore, 'add'> = new DisposableStore()
): TestInstantiationService {
	const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
		[ILifecycleService, disposables.add(new TestLifecycleService())],
		[IActionViewItemService, new SyncDescriptor(NullActionViewItemService)],
	)));

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
	instantiationService.stub(IAccessibilitySignalService, {
		playSignal: async () => { },
		isSoundEnabled(signal: unknown) { return false; },
	} as any);
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
	instantiationService.stub(ITextFileService, overrides?.textFileService ? overrides.textFileService(instantiationService) : disposables.add(<ITextFileService>instantiationService.createInstance(TestTextFileService)));
	instantiationService.stub(IHostService, <IHostService>instantiationService.createInstance(TestHostService));
	instantiationService.stub(ITextModelService, <ITextModelService>disposables.add(instantiationService.createInstance(TextModelResolverService)));
	instantiationService.stub(ILoggerService, disposables.add(new TestLoggerService(TestEnvironmentService.logsHome)));
	const editorGroupService = new TestEditorGroupsService([new TestEditorGroupView(0)]);
	instantiationService.stub(IEditorGroupsService, editorGroupService);
	instantiationService.stub(ILabelService, <ILabelService>disposables.add(instantiationService.createInstance(LabelService)));
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

	return instantiationService;
}

export class TestServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService,
		@ITextEditorService public textEditorService: ITextEditorService,
		@IWorkingCopyFileService public workingCopyFileService: IWorkingCopyFileService,
		@IFilesConfigurationService public filesConfigurationService: TestFilesConfigurationService,
		@IWorkspaceContextService public contextService: TestContextService,
		@IModelService public modelService: ModelService,
		@IFileService public fileService: TestFileService,
		@IFileDialogService public fileDialogService: TestFileDialogService,
		@IDialogService public dialogService: TestDialogService,
		@IWorkingCopyService public workingCopyService: TestWorkingCopyService,
		@IEditorService public editorService: TestEditorService,
		@IEditorPaneService public editorPaneService: IEditorPaneService,
		@IWorkbenchEnvironmentService public environmentService: IWorkbenchEnvironmentService,
		@IPathService public pathService: IPathService,
		@IEditorGroupsService public editorGroupService: IEditorGroupsService,
		@IEditorResolverService public editorResolverService: IEditorResolverService,
		@ILanguageService public languageService: ILanguageService,
		@ITextModelService public textModelResolverService: ITextModelService,
		@IUntitledTextEditorService public untitledTextEditorService: UntitledTextEditorService,
		@IConfigurationService public testConfigurationService: TestConfigurationService,
		@IWorkingCopyBackupService public workingCopyBackupService: TestWorkingCopyBackupService,
		@IHostService public hostService: TestHostService,
		@IQuickInputService public quickInputService: IQuickInputService,
		@ILabelService public labelService: ILabelService,
		@ILogService public logService: ILogService,
		@IUriIdentityService public uriIdentityService: IUriIdentityService,
		@IInstantiationService public instantitionService: IInstantiationService,
		@INotificationService public notificationService: INotificationService,
		@IWorkingCopyEditorService public workingCopyEditorService: IWorkingCopyEditorService,
		@IInstantiationService public instantiationService: IInstantiationService,
		@IElevatedFileService public elevatedFileService: IElevatedFileService,
		@IWorkspaceTrustRequestService public workspaceTrustRequestService: TestWorkspaceTrustRequestService,
		@IDecorationsService public decorationsService: IDecorationsService,
		@IProgressService public progressService: IProgressService,
	) { }
}

export class TestTextFileService extends BrowserTextFileService {
	private readStreamError: FileOperationError | undefined = undefined;
	private writeError: FileOperationError | undefined = undefined;

	constructor(
		@IFileService fileService: IFileService,
		@IUntitledTextEditorService untitledTextEditorService: IUntitledTextEditorService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IDialogService dialogService: IDialogService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IPathService pathService: IPathService,
		@IWorkingCopyFileService workingCopyFileService: IWorkingCopyFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILanguageService languageService: ILanguageService,
		@ILogService logService: ILogService,
		@IElevatedFileService elevatedFileService: IElevatedFileService,
		@IDecorationsService decorationsService: IDecorationsService
	) {
		super(
			fileService,
			untitledTextEditorService,
			lifecycleService,
			instantiationService,
			modelService,
			environmentService,
			dialogService,
			fileDialogService,
			textResourceConfigurationService,
			filesConfigurationService,
			codeEditorService,
			pathService,
			workingCopyFileService,
			uriIdentityService,
			languageService,
			elevatedFileService,
			logService,
			decorationsService
		);
	}

	setReadStreamErrorOnce(error: FileOperationError): void {
		this.readStreamError = error;
	}

	override async readStream(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileStreamContent> {
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
			locked: false
		};
	}

	setWriteErrorOnce(error: FileOperationError): void {
		this.writeError = error;
	}

	override async write(resource: URI, value: string | ITextSnapshot, options?: IWriteTextFileOptions): Promise<IFileStatWithMetadata> {
		if (this.writeError) {
			const error = this.writeError;
			this.writeError = undefined;

			throw error;
		}

		return super.write(resource, value, options);
	}
}

export class TestBrowserTextFileServiceWithEncodingOverrides extends BrowserTextFileService {

	private _testEncoding: TestEncodingOracle | undefined;
	override get encoding(): TestEncodingOracle {
		if (!this._testEncoding) {
			this._testEncoding = this._register(this.instantiationService.createInstance(TestEncodingOracle));
		}

		return this._testEncoding;
	}
}

export class TestEncodingOracle extends EncodingOracle {

	protected override get encodingOverrides(): IEncodingOverride[] {
		return [
			{ extension: 'utf16le', encoding: UTF16le },
			{ extension: 'utf16be', encoding: UTF16be },
			{ extension: 'utf8bom', encoding: UTF8_with_bom }
		];
	}

	protected override set encodingOverrides(overrides: IEncodingOverride[]) { }
}

class TestEnvironmentServiceWithArgs extends BrowserWorkbenchEnvironmentService {
	args = [];
}

export const TestEnvironmentService = new TestEnvironmentServiceWithArgs('', URI.file('tests').with({ scheme: 'vscode-tests' }), Object.create(null), TestProductService);

export class TestProgressService implements IProgressService {

	declare readonly _serviceBrand: undefined;

	withProgress(
		options: IProgressOptions | IProgressDialogOptions | IProgressWindowOptions | IProgressNotificationOptions | IProgressCompositeOptions,
		task: (progress: IProgress<IProgressStep>) => Promise<any>,
		onDidCancel?: ((choice?: number | undefined) => void) | undefined
	): Promise<any> {
		return task(Progress.None);
	}
}

export class TestDecorationsService implements IDecorationsService {

	declare readonly _serviceBrand: undefined;

	onDidChangeDecorations: Event<IResourceDecorationChangeEvent> = Event.None;

	registerDecorationsProvider(_provider: IDecorationsProvider): IDisposable { return Disposable.None; }
	getDecoration(_uri: URI, _includeChildren: boolean, _overwrite?: IDecorationData): IDecoration | undefined { return undefined; }
}

export class TestMenuService implements IMenuService {

	declare readonly _serviceBrand: undefined;

	createMenu(_id: MenuId, _scopedKeybindingService: IContextKeyService): IMenu {
		return {
			onDidChange: Event.None,
			dispose: () => undefined,
			getActions: () => []
		};
	}

	getMenuActions(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuActionOptions): [string, Array<MenuItemAction | SubmenuItemAction>][] {
		throw new Error('Method not implemented.');
	}

	getMenuContexts(id: MenuId): ReadonlySet<string> {
		throw new Error('Method not implemented.');
	}

	resetHiddenStates(): void {
		// nothing
	}
}

export class TestFileDialogService implements IFileDialogService {

	declare readonly _serviceBrand: undefined;

	private confirmResult!: ConfirmResult;

	constructor(
		@IPathService private readonly pathService: IPathService
	) { }
	async defaultFilePath(_schemeFilter?: string): Promise<URI> { return this.pathService.userHome(); }
	async defaultFolderPath(_schemeFilter?: string): Promise<URI> { return this.pathService.userHome(); }
	async defaultWorkspacePath(_schemeFilter?: string): Promise<URI> { return this.pathService.userHome(); }
	async preferredHome(_schemeFilter?: string): Promise<URI> { return this.pathService.userHome(); }
	pickFileFolderAndOpen(_options: IPickAndOpenOptions): Promise<any> { return Promise.resolve(0); }
	pickFileAndOpen(_options: IPickAndOpenOptions): Promise<any> { return Promise.resolve(0); }
	pickFolderAndOpen(_options: IPickAndOpenOptions): Promise<any> { return Promise.resolve(0); }
	pickWorkspaceAndOpen(_options: IPickAndOpenOptions): Promise<any> { return Promise.resolve(0); }

	private fileToSave!: URI;
	setPickFileToSave(path: URI): void { this.fileToSave = path; }
	pickFileToSave(defaultUri: URI, availableFileSystems?: string[]): Promise<URI | undefined> { return Promise.resolve(this.fileToSave); }

	showSaveDialog(_options: ISaveDialogOptions): Promise<URI | undefined> { return Promise.resolve(undefined); }
	showOpenDialog(_options: IOpenDialogOptions): Promise<URI[] | undefined> { return Promise.resolve(undefined); }

	setConfirmResult(result: ConfirmResult): void { this.confirmResult = result; }
	showSaveConfirm(fileNamesOrResources: (string | URI)[]): Promise<ConfirmResult> { return Promise.resolve(this.confirmResult); }
}

export class TestLayoutService implements IWorkbenchLayoutService {

	declare readonly _serviceBrand: undefined;

	openedDefaultEditors = false;

	mainContainerDimension: IDimension = { width: 800, height: 600 };
	activeContainerDimension: IDimension = { width: 800, height: 600 };
	mainContainerOffset: ILayoutOffsetInfo = { top: 0, quickPickTop: 0 };
	activeContainerOffset: ILayoutOffsetInfo = { top: 0, quickPickTop: 0 };

	mainContainer: HTMLElement = mainWindow.document.body;
	containers = [mainWindow.document.body];
	activeContainer: HTMLElement = mainWindow.document.body;

	onDidChangeZenMode: Event<boolean> = Event.None;
	onDidChangeMainEditorCenteredLayout: Event<boolean> = Event.None;
	onDidChangeWindowMaximized: Event<{ windowId: number; maximized: boolean }> = Event.None;
	onDidChangePanelPosition: Event<string> = Event.None;
	onDidChangePanelAlignment: Event<PanelAlignment> = Event.None;
	onDidChangePartVisibility: Event<void> = Event.None;
	onDidLayoutMainContainer = Event.None;
	onDidLayoutActiveContainer = Event.None;
	onDidLayoutContainer = Event.None;
	onDidChangeNotificationsVisibility = Event.None;
	onDidAddContainer = Event.None;
	onDidChangeActiveContainer = Event.None;

	layout(): void { }
	isRestored(): boolean { return true; }
	whenReady: Promise<void> = Promise.resolve(undefined);
	whenRestored: Promise<void> = Promise.resolve(undefined);
	hasFocus(_part: Parts): boolean { return false; }
	focusPart(_part: Parts): void { }
	hasMainWindowBorder(): boolean { return false; }
	getMainWindowBorderRadius(): string | undefined { return undefined; }
	isVisible(_part: Parts): boolean { return true; }
	getContainer(): HTMLElement { return null!; }
	whenContainerStylesLoaded() { return undefined; }
	isTitleBarHidden(): boolean { return false; }
	isStatusBarHidden(): boolean { return false; }
	isActivityBarHidden(): boolean { return false; }
	setActivityBarHidden(_hidden: boolean): void { }
	setBannerHidden(_hidden: boolean): void { }
	isSideBarHidden(): boolean { return false; }
	async setEditorHidden(_hidden: boolean): Promise<void> { }
	async setSideBarHidden(_hidden: boolean): Promise<void> { }
	async setAuxiliaryBarHidden(_hidden: boolean): Promise<void> { }
	async setPartHidden(_hidden: boolean, part: Parts): Promise<void> { }
	isPanelHidden(): boolean { return false; }
	async setPanelHidden(_hidden: boolean): Promise<void> { }
	toggleMaximizedPanel(): void { }
	isPanelMaximized(): boolean { return false; }
	getMenubarVisibility(): MenuBarVisibility { throw new Error('not implemented'); }
	toggleMenuBar(): void { }
	getSideBarPosition() { return 0; }
	getPanelPosition() { return 0; }
	getPanelAlignment(): PanelAlignment { return 'center'; }
	async setPanelPosition(_position: PartPosition): Promise<void> { }
	async setPanelAlignment(_alignment: PanelAlignment): Promise<void> { }
	addClass(_clazz: string): void { }
	removeClass(_clazz: string): void { }
	getMaximumEditorDimensions(): IDimension { throw new Error('not implemented'); }
	toggleZenMode(): void { }
	isMainEditorLayoutCentered(): boolean { return false; }
	centerMainEditorLayout(_active: boolean): void { }
	resizePart(_part: Parts, _sizeChangeWidth: number, _sizeChangeHeight: number): void { }
	registerPart(part: Part): IDisposable { return Disposable.None; }
	isWindowMaximized(targetWindow: Window) { return false; }
	updateWindowMaximizedState(targetWindow: Window, maximized: boolean): void { }
	getVisibleNeighborPart(part: Parts, direction: Direction): Parts | undefined { return undefined; }
	focus() { }
}

const activeViewlet: PaneComposite = {} as any;

export class TestPaneCompositeService extends Disposable implements IPaneCompositePartService {
	declare readonly _serviceBrand: undefined;

	onDidPaneCompositeOpen: Event<{ composite: IPaneComposite; viewContainerLocation: ViewContainerLocation }>;
	onDidPaneCompositeClose: Event<{ composite: IPaneComposite; viewContainerLocation: ViewContainerLocation }>;

	private parts = new Map<ViewContainerLocation, IPaneCompositePart>();

	constructor() {
		super();

		this.parts.set(ViewContainerLocation.Panel, new TestPanelPart());
		this.parts.set(ViewContainerLocation.Sidebar, new TestSideBarPart());

		this.onDidPaneCompositeOpen = Event.any(...([ViewContainerLocation.Panel, ViewContainerLocation.Sidebar].map(loc => Event.map(this.parts.get(loc)!.onDidPaneCompositeOpen, composite => { return { composite, viewContainerLocation: loc }; }))));
		this.onDidPaneCompositeClose = Event.any(...([ViewContainerLocation.Panel, ViewContainerLocation.Sidebar].map(loc => Event.map(this.parts.get(loc)!.onDidPaneCompositeClose, composite => { return { composite, viewContainerLocation: loc }; }))));
	}

	openPaneComposite(id: string | undefined, viewContainerLocation: ViewContainerLocation, focus?: boolean): Promise<IPaneComposite | undefined> {
		return this.getPartByLocation(viewContainerLocation).openPaneComposite(id, focus);
	}
	getActivePaneComposite(viewContainerLocation: ViewContainerLocation): IPaneComposite | undefined {
		return this.getPartByLocation(viewContainerLocation).getActivePaneComposite();
	}
	getPaneComposite(id: string, viewContainerLocation: ViewContainerLocation): PaneCompositeDescriptor | undefined {
		return this.getPartByLocation(viewContainerLocation).getPaneComposite(id);
	}
	getPaneComposites(viewContainerLocation: ViewContainerLocation): PaneCompositeDescriptor[] {
		return this.getPartByLocation(viewContainerLocation).getPaneComposites();
	}
	getProgressIndicator(id: string, viewContainerLocation: ViewContainerLocation): IProgressIndicator | undefined {
		return this.getPartByLocation(viewContainerLocation).getProgressIndicator(id);
	}
	hideActivePaneComposite(viewContainerLocation: ViewContainerLocation): void {
		this.getPartByLocation(viewContainerLocation).hideActivePaneComposite();
	}
	getLastActivePaneCompositeId(viewContainerLocation: ViewContainerLocation): string {
		return this.getPartByLocation(viewContainerLocation).getLastActivePaneCompositeId();
	}

	getPinnedPaneCompositeIds(viewContainerLocation: ViewContainerLocation): string[] {
		throw new Error('Method not implemented.');
	}

	getVisiblePaneCompositeIds(viewContainerLocation: ViewContainerLocation): string[] {
		throw new Error('Method not implemented.');
	}

	getPartByLocation(viewContainerLocation: ViewContainerLocation): IPaneCompositePart {
		return assertIsDefined(this.parts.get(viewContainerLocation));
	}
}

export class TestSideBarPart implements IPaneCompositePart {
	declare readonly _serviceBrand: undefined;

	onDidViewletRegisterEmitter = new Emitter<PaneCompositeDescriptor>();
	onDidViewletDeregisterEmitter = new Emitter<PaneCompositeDescriptor>();
	onDidViewletOpenEmitter = new Emitter<IPaneComposite>();
	onDidViewletCloseEmitter = new Emitter<IPaneComposite>();

	readonly partId = Parts.SIDEBAR_PART;
	element: HTMLElement = undefined!;
	minimumWidth = 0;
	maximumWidth = 0;
	minimumHeight = 0;
	maximumHeight = 0;
	onDidChange = Event.None;
	onDidPaneCompositeOpen = this.onDidViewletOpenEmitter.event;
	onDidPaneCompositeClose = this.onDidViewletCloseEmitter.event;

	openPaneComposite(id: string, focus?: boolean): Promise<IPaneComposite | undefined> { return Promise.resolve(undefined); }
	getPaneComposites(): PaneCompositeDescriptor[] { return []; }
	getAllViewlets(): PaneCompositeDescriptor[] { return []; }
	getActivePaneComposite(): IPaneComposite { return activeViewlet; }
	getDefaultViewletId(): string { return 'workbench.view.explorer'; }
	getPaneComposite(id: string): PaneCompositeDescriptor | undefined { return undefined; }
	getProgressIndicator(id: string) { return undefined; }
	hideActivePaneComposite(): void { }
	getLastActivePaneCompositeId(): string { return undefined!; }
	dispose() { }
	getPinnedPaneCompositeIds() { return []; }
	getVisiblePaneCompositeIds() { return []; }
	layout(width: number, height: number, top: number, left: number): void { }
}

export class TestPanelPart implements IPaneCompositePart {
	declare readonly _serviceBrand: undefined;

	element: HTMLElement = undefined!;
	minimumWidth = 0;
	maximumWidth = 0;
	minimumHeight = 0;
	maximumHeight = 0;
	onDidChange = Event.None;
	onDidPaneCompositeOpen = new Emitter<IPaneComposite>().event;
	onDidPaneCompositeClose = new Emitter<IPaneComposite>().event;
	readonly partId = Parts.AUXILIARYBAR_PART;

	async openPaneComposite(id?: string, focus?: boolean): Promise<undefined> { return undefined; }
	getPaneComposite(id: string): any { return activeViewlet; }
	getPaneComposites() { return []; }
	getPinnedPaneCompositeIds() { return []; }
	getVisiblePaneCompositeIds() { return []; }
	getActivePaneComposite(): IPaneComposite { return activeViewlet; }
	setPanelEnablement(id: string, enabled: boolean): void { }
	dispose() { }
	getProgressIndicator(id: string) { return null!; }
	hideActivePaneComposite(): void { }
	getLastActivePaneCompositeId(): string { return undefined!; }
	layout(width: number, height: number, top: number, left: number): void { }
}

export class TestViewsService implements IViewsService {
	declare readonly _serviceBrand: undefined;


	onDidChangeViewContainerVisibility = new Emitter<{ id: string; visible: boolean; location: ViewContainerLocation }>().event;
	isViewContainerVisible(id: string): boolean { return true; }
	isViewContainerActive(id: string): boolean { return true; }
	getVisibleViewContainer(): ViewContainer | null { return null; }
	openViewContainer(id: string, focus?: boolean): Promise<IPaneComposite | null> { return Promise.resolve(null); }
	closeViewContainer(id: string): void { }

	onDidChangeViewVisibilityEmitter = new Emitter<{ id: string; visible: boolean }>();
	onDidChangeViewVisibility = this.onDidChangeViewVisibilityEmitter.event;
	onDidChangeFocusedViewEmitter = new Emitter<void>();
	onDidChangeFocusedView = this.onDidChangeFocusedViewEmitter.event;
	isViewVisible(id: string): boolean { return true; }
	getActiveViewWithId<T extends IView>(id: string): T | null { return null; }
	getViewWithId<T extends IView>(id: string): T | null { return null; }
	openView<T extends IView>(id: string, focus?: boolean | undefined): Promise<T | null> { return Promise.resolve(null); }
	closeView(id: string): void { }
	getViewProgressIndicator(id: string) { return null!; }
	getActiveViewPaneContainerWithId(id: string) { return null; }
	getFocusedViewName(): string { return ''; }
}

export class TestEditorGroupsService implements IEditorGroupsService {

	declare readonly _serviceBrand: undefined;

	constructor(public groups: TestEditorGroupView[] = []) { }

	readonly parts: readonly IEditorPart[] = [this];

	windowId = mainWindow.vscodeWindowId;

	onDidCreateAuxiliaryEditorPart: Event<IAuxiliaryEditorPart> = Event.None;
	onDidChangeActiveGroup: Event<IEditorGroup> = Event.None;
	onDidActivateGroup: Event<IEditorGroup> = Event.None;
	onDidAddGroup: Event<IEditorGroup> = Event.None;
	onDidRemoveGroup: Event<IEditorGroup> = Event.None;
	onDidMoveGroup: Event<IEditorGroup> = Event.None;
	onDidChangeGroupIndex: Event<IEditorGroup> = Event.None;
	onDidChangeGroupLabel: Event<IEditorGroup> = Event.None;
	onDidChangeGroupLocked: Event<IEditorGroup> = Event.None;
	onDidChangeGroupMaximized: Event<boolean> = Event.None;
	onDidLayout: Event<IDimension> = Event.None;
	onDidChangeEditorPartOptions = Event.None;
	onDidScroll = Event.None;
	onWillDispose = Event.None;

	orientation = GroupOrientation.HORIZONTAL;
	isReady = true;
	whenReady: Promise<void> = Promise.resolve(undefined);
	whenRestored: Promise<void> = Promise.resolve(undefined);
	hasRestorableState = false;

	contentDimension = { width: 800, height: 600 };

	get activeGroup(): IEditorGroup { return this.groups[0]; }
	get sideGroup(): IEditorGroup { return this.groups[0]; }
	get count(): number { return this.groups.length; }

	getPart(group: number | IEditorGroup): IEditorPart { return this; }
	saveWorkingSet(name: string): IEditorWorkingSet { throw new Error('Method not implemented.'); }
	getWorkingSets(): IEditorWorkingSet[] { throw new Error('Method not implemented.'); }
	applyWorkingSet(workingSet: IEditorWorkingSet | 'empty', options?: IEditorWorkingSetOptions): Promise<boolean> { throw new Error('Method not implemented.'); }
	deleteWorkingSet(workingSet: IEditorWorkingSet): Promise<boolean> { throw new Error('Method not implemented.'); }
	getGroups(_order?: GroupsOrder): readonly IEditorGroup[] { return this.groups; }
	getGroup(identifier: number): IEditorGroup | undefined { return this.groups.find(group => group.id === identifier); }
	getLabel(_identifier: number): string { return 'Group 1'; }
	findGroup(_scope: IFindGroupScope, _source?: number | IEditorGroup, _wrap?: boolean): IEditorGroup { throw new Error('not implemented'); }
	activateGroup(_group: number | IEditorGroup): IEditorGroup { throw new Error('not implemented'); }
	restoreGroup(_group: number | IEditorGroup): IEditorGroup { throw new Error('not implemented'); }
	getSize(_group: number | IEditorGroup): { width: number; height: number } { return { width: 100, height: 100 }; }
	setSize(_group: number | IEditorGroup, _size: { width: number; height: number }): void { }
	arrangeGroups(_arrangement: GroupsArrangement): void { }
	toggleMaximizeGroup(): void { }
	hasMaximizedGroup(): boolean { throw new Error('not implemented'); }
	toggleExpandGroup(): void { }
	applyLayout(_layout: EditorGroupLayout): void { }
	getLayout(): EditorGroupLayout { throw new Error('not implemented'); }
	setGroupOrientation(_orientation: GroupOrientation): void { }
	addGroup(_location: number | IEditorGroup, _direction: GroupDirection): IEditorGroup { throw new Error('not implemented'); }
	removeGroup(_group: number | IEditorGroup): void { }
	moveGroup(_group: number | IEditorGroup, _location: number | IEditorGroup, _direction: GroupDirection): IEditorGroup { throw new Error('not implemented'); }
	mergeGroup(_group: number | IEditorGroup, _target: number | IEditorGroup, _options?: IMergeGroupOptions): boolean { throw new Error('not implemented'); }
	mergeAllGroups(_group: number | IEditorGroup): boolean { throw new Error('not implemented'); }
	copyGroup(_group: number | IEditorGroup, _location: number | IEditorGroup, _direction: GroupDirection): IEditorGroup { throw new Error('not implemented'); }
	centerLayout(active: boolean): void { }
	isLayoutCentered(): boolean { return false; }
	createEditorDropTarget(container: HTMLElement, delegate: IEditorDropTargetDelegate): IDisposable { return Disposable.None; }
	registerContextKeyProvider<T extends ContextKeyValue>(_provider: IEditorGroupContextKeyProvider<T>): IDisposable { throw new Error('not implemented'); }
	getScopedInstantiationService(part: IEditorPart): IInstantiationService { throw new Error('Method not implemented.'); }

	partOptions!: IEditorPartOptions;
	enforcePartOptions(options: IEditorPartOptions): IDisposable { return Disposable.None; }

	readonly mainPart = this;
	registerEditorPart(part: any): IDisposable { return Disposable.None; }
	createAuxiliaryEditorPart(): Promise<IAuxiliaryEditorPart> { throw new Error('Method not implemented.'); }
}

export class TestEditorGroupView implements IEditorGroupView {

	constructor(public id: number) { }

	windowId = mainWindow.vscodeWindowId;
	groupsView: IEditorGroupsView = undefined!;
	activeEditorPane!: IVisibleEditorPane;
	activeEditor!: EditorInput;
	selectedEditors: EditorInput[] = [];
	previewEditor!: EditorInput;
	count!: number;
	stickyCount!: number;
	disposed!: boolean;
	editors: readonly EditorInput[] = [];
	label!: string;
	isLocked!: boolean;
	ariaLabel!: string;
	index!: number;
	whenRestored: Promise<void> = Promise.resolve(undefined);
	element!: HTMLElement;
	minimumWidth!: number;
	maximumWidth!: number;
	minimumHeight!: number;
	maximumHeight!: number;

	titleHeight!: IEditorGroupTitleHeight;

	isEmpty = true;

	onWillDispose: Event<void> = Event.None;
	onDidModelChange: Event<IGroupModelChangeEvent> = Event.None;
	onWillCloseEditor: Event<IEditorCloseEvent> = Event.None;
	onDidCloseEditor: Event<IEditorCloseEvent> = Event.None;
	onDidOpenEditorFail: Event<EditorInput> = Event.None;
	onDidFocus: Event<void> = Event.None;
	onDidChange: Event<{ width: number; height: number }> = Event.None;
	onWillMoveEditor: Event<IEditorWillMoveEvent> = Event.None;
	onWillOpenEditor: Event<IEditorWillOpenEvent> = Event.None;
	onDidActiveEditorChange: Event<IActiveEditorChangeEvent> = Event.None;

	getEditors(_order?: EditorsOrder): readonly EditorInput[] { return []; }
	findEditors(_resource: URI): readonly EditorInput[] { return []; }
	getEditorByIndex(_index: number): EditorInput { throw new Error('not implemented'); }
	getIndexOfEditor(_editor: EditorInput): number { return -1; }
	isFirst(editor: EditorInput): boolean { return false; }
	isLast(editor: EditorInput): boolean { return false; }
	openEditor(_editor: EditorInput, _options?: IEditorOptions): Promise<IEditorPane> { throw new Error('not implemented'); }
	openEditors(_editors: EditorInputWithOptions[]): Promise<IEditorPane> { throw new Error('not implemented'); }
	isPinned(_editor: EditorInput): boolean { return false; }
	isSticky(_editor: EditorInput): boolean { return false; }
	isTransient(_editor: EditorInput): boolean { return false; }
	isActive(_editor: EditorInput | IUntypedEditorInput): boolean { return false; }
	setSelection(_activeSelectedEditor: EditorInput, _inactiveSelectedEditors: EditorInput[]): Promise<void> { throw new Error('not implemented'); }
	isSelected(_editor: EditorInput): boolean { return false; }
	contains(candidate: EditorInput | IUntypedEditorInput): boolean { return false; }
	moveEditor(_editor: EditorInput, _target: IEditorGroup, _options?: IEditorOptions): boolean { return true; }
	moveEditors(_editors: EditorInputWithOptions[], _target: IEditorGroup): boolean { return true; }
	copyEditor(_editor: EditorInput, _target: IEditorGroup, _options?: IEditorOptions): void { }
	copyEditors(_editors: EditorInputWithOptions[], _target: IEditorGroup): void { }
	async closeEditor(_editor?: EditorInput, options?: ICloseEditorOptions): Promise<boolean> { return true; }
	async closeEditors(_editors: EditorInput[] | ICloseEditorsFilter, options?: ICloseEditorOptions): Promise<boolean> { return true; }
	async closeAllEditors(options?: ICloseAllEditorsOptions): Promise<boolean> { return true; }
	async replaceEditors(_editors: IEditorReplacement[]): Promise<void> { }
	pinEditor(_editor?: EditorInput): void { }
	stickEditor(editor?: EditorInput | undefined): void { }
	unstickEditor(editor?: EditorInput | undefined): void { }
	lock(locked: boolean): void { }
	focus(): void { }
	get scopedContextKeyService(): IContextKeyService { throw new Error('not implemented'); }
	setActive(_isActive: boolean): void { }
	notifyIndexChanged(_index: number): void { }
	notifyLabelChanged(_label: string): void { }
	dispose(): void { }
	toJSON(): object { return Object.create(null); }
	layout(_width: number, _height: number): void { }
	relayout() { }
	createEditorActions(_menuDisposable: IDisposable): { actions: IToolbarActions; onDidChange: Event<IMenuChangeEvent> } { throw new Error('not implemented'); }
}

export class TestEditorGroupAccessor implements IEditorGroupsView {

	label: string = '';
	windowId = mainWindow.vscodeWindowId;

	groups: IEditorGroupView[] = [];
	activeGroup!: IEditorGroupView;

	partOptions: IEditorPartOptions = { ...DEFAULT_EDITOR_PART_OPTIONS };

	onDidChangeEditorPartOptions = Event.None;
	onDidVisibilityChange = Event.None;

	getGroup(identifier: number): IEditorGroupView | undefined { throw new Error('Method not implemented.'); }
	getGroups(order: GroupsOrder): IEditorGroupView[] { throw new Error('Method not implemented.'); }
	activateGroup(identifier: number | IEditorGroupView): IEditorGroupView { throw new Error('Method not implemented.'); }
	restoreGroup(identifier: number | IEditorGroupView): IEditorGroupView { throw new Error('Method not implemented.'); }
	addGroup(location: number | IEditorGroupView, direction: GroupDirection): IEditorGroupView { throw new Error('Method not implemented.'); }
	mergeGroup(group: number | IEditorGroupView, target: number | IEditorGroupView, options?: IMergeGroupOptions | undefined): boolean { throw new Error('Method not implemented.'); }
	moveGroup(group: number | IEditorGroupView, location: number | IEditorGroupView, direction: GroupDirection): IEditorGroupView { throw new Error('Method not implemented.'); }
	copyGroup(group: number | IEditorGroupView, location: number | IEditorGroupView, direction: GroupDirection): IEditorGroupView { throw new Error('Method not implemented.'); }
	removeGroup(group: number | IEditorGroupView): void { throw new Error('Method not implemented.'); }
	arrangeGroups(arrangement: GroupsArrangement, target?: number | IEditorGroupView | undefined): void { throw new Error('Method not implemented.'); }
	toggleMaximizeGroup(group: number | IEditorGroupView): void { throw new Error('Method not implemented.'); }
	toggleExpandGroup(group: number | IEditorGroupView): void { throw new Error('Method not implemented.'); }
}

export class TestEditorService extends Disposable implements EditorServiceImpl {

	declare readonly _serviceBrand: undefined;

	onDidActiveEditorChange: Event<void> = Event.None;
	onDidVisibleEditorsChange: Event<void> = Event.None;
	onDidEditorsChange: Event<IEditorsChangeEvent> = Event.None;
	onWillOpenEditor: Event<IEditorWillOpenEvent> = Event.None;
	onDidCloseEditor: Event<IEditorCloseEvent> = Event.None;
	onDidOpenEditorFail: Event<IEditorIdentifier> = Event.None;
	onDidMostRecentlyActiveEditorsChange: Event<void> = Event.None;

	private _activeTextEditorControl: ICodeEditor | IDiffEditor | undefined;
	public get activeTextEditorControl(): ICodeEditor | IDiffEditor | undefined { return this._activeTextEditorControl; }
	public set activeTextEditorControl(value: ICodeEditor | IDiffEditor | undefined) { this._activeTextEditorControl = value; }

	activeEditorPane: IVisibleEditorPane | undefined;
	activeTextEditorLanguageId: string | undefined;

	private _activeEditor: EditorInput | undefined;
	public get activeEditor(): EditorInput | undefined { return this._activeEditor; }
	public set activeEditor(value: EditorInput | undefined) { this._activeEditor = value; }

	editors: readonly EditorInput[] = [];
	mostRecentlyActiveEditors: readonly IEditorIdentifier[] = [];
	visibleEditorPanes: readonly IVisibleEditorPane[] = [];
	visibleTextEditorControls = [];
	visibleEditors: readonly EditorInput[] = [];
	count = this.editors.length;

	constructor(private editorGroupService?: IEditorGroupsService) {
		super();
	}
	createScoped(editorGroupsContainer: IEditorGroupsContainer): IEditorService { return this; }
	getEditors() { return []; }
	findEditors() { return [] as any; }
	openEditor(editor: EditorInput, options?: IEditorOptions, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	openEditor(editor: IResourceEditorInput | IUntitledTextResourceEditorInput, group?: PreferredGroup): Promise<IEditorPane | undefined>;
	openEditor(editor: IResourceDiffEditorInput, group?: PreferredGroup): Promise<ITextDiffEditorPane | undefined>;
	async openEditor(editor: EditorInput | IUntypedEditorInput, optionsOrGroup?: IEditorOptions | PreferredGroup, group?: PreferredGroup): Promise<IEditorPane | undefined> {
		// openEditor takes ownership of the input, register it to the TestEditorService
		// so it's not marked as leaked during tests.
		if ('dispose' in editor) {
			this._register(editor);
		}
		return undefined;
	}
	async closeEditor(editor: IEditorIdentifier, options?: ICloseEditorOptions): Promise<void> { }
	async closeEditors(editors: IEditorIdentifier[], options?: ICloseEditorOptions): Promise<void> { }
	doResolveEditorOpenRequest(editor: EditorInput | IUntypedEditorInput): [IEditorGroup, EditorInput, IEditorOptions | undefined] | undefined {
		if (!this.editorGroupService) {
			return undefined;
		}

		return [this.editorGroupService.activeGroup, editor as EditorInput, undefined];
	}
	openEditors(_editors: any, _group?: any): Promise<IEditorPane[]> { throw new Error('not implemented'); }
	isOpened(_editor: IResourceEditorInputIdentifier): boolean { return false; }
	isVisible(_editor: EditorInput): boolean { return false; }
	replaceEditors(_editors: any, _group: any) { return Promise.resolve(undefined); }
	save(editors: IEditorIdentifier[], options?: ISaveEditorsOptions): Promise<ISaveEditorsResult> { throw new Error('Method not implemented.'); }
	saveAll(options?: ISaveEditorsOptions): Promise<ISaveEditorsResult> { throw new Error('Method not implemented.'); }
	revert(editors: IEditorIdentifier[], options?: IRevertOptions): Promise<boolean> { throw new Error('Method not implemented.'); }
	revertAll(options?: IRevertAllEditorsOptions): Promise<boolean> { throw new Error('Method not implemented.'); }
}

export class TestFileService implements IFileService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidFilesChange = new Emitter<FileChangesEvent>();
	get onDidFilesChange(): Event<FileChangesEvent> { return this._onDidFilesChange.event; }
	fireFileChanges(event: FileChangesEvent): void { this._onDidFilesChange.fire(event); }

	private readonly _onDidRunOperation = new Emitter<FileOperationEvent>();
	get onDidRunOperation(): Event<FileOperationEvent> { return this._onDidRunOperation.event; }
	fireAfterOperation(event: FileOperationEvent): void { this._onDidRunOperation.fire(event); }

	private readonly _onDidChangeFileSystemProviderCapabilities = new Emitter<IFileSystemProviderCapabilitiesChangeEvent>();
	get onDidChangeFileSystemProviderCapabilities(): Event<IFileSystemProviderCapabilitiesChangeEvent> { return this._onDidChangeFileSystemProviderCapabilities.event; }
	fireFileSystemProviderCapabilitiesChangeEvent(event: IFileSystemProviderCapabilitiesChangeEvent): void { this._onDidChangeFileSystemProviderCapabilities.fire(event); }

	private _onWillActivateFileSystemProvider = new Emitter<IFileSystemProviderActivationEvent>();
	readonly onWillActivateFileSystemProvider = this._onWillActivateFileSystemProvider.event;
	readonly onDidWatchError = Event.None;

	private content = 'Hello Html';
	private lastReadFileUri!: URI;

	readonly = false;

	setContent(content: string): void { this.content = content; }
	getContent(): string { return this.content; }
	getLastReadFileUri(): URI { return this.lastReadFileUri; }

	resolve(resource: URI, _options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
	resolve(resource: URI, _options?: IResolveFileOptions): Promise<IFileStat>;
	async resolve(resource: URI, _options?: IResolveFileOptions): Promise<IFileStat> {
		return createFileStat(resource, this.readonly);
	}

	stat(resource: URI): Promise<IFileStatWithPartialMetadata> {
		return this.resolve(resource, { resolveMetadata: true });
	}

	async resolveAll(toResolve: { resource: URI; options?: IResolveFileOptions }[]): Promise<IFileStatResult[]> {
		const stats = await Promise.all(toResolve.map(resourceAndOption => this.resolve(resourceAndOption.resource, resourceAndOption.options)));

		return stats.map(stat => ({ stat, success: true }));
	}

	readonly notExistsSet = new ResourceMap<boolean>();

	async exists(_resource: URI): Promise<boolean> { return !this.notExistsSet.has(_resource); }

	readShouldThrowError: Error | undefined = undefined;

	async readFile(resource: URI, options?: IReadFileOptions | undefined): Promise<IFileContent> {
		if (this.readShouldThrowError) {
			throw this.readShouldThrowError;
		}

		this.lastReadFileUri = resource;

		return {
			...createFileStat(resource, this.readonly),
			value: VSBuffer.fromString(this.content)
		};
	}

	async readFileStream(resource: URI, options?: IReadFileStreamOptions | undefined): Promise<IFileStreamContent> {
		if (this.readShouldThrowError) {
			throw this.readShouldThrowError;
		}

		this.lastReadFileUri = resource;

		return {
			...createFileStat(resource, this.readonly),
			value: bufferToStream(VSBuffer.fromString(this.content))
		};
	}

	writeShouldThrowError: Error | undefined = undefined;

	async writeFile(resource: URI, bufferOrReadable: VSBuffer | VSBufferReadable, options?: IWriteFileOptions): Promise<IFileStatWithMetadata> {
		await timeout(0);

		if (this.writeShouldThrowError) {
			throw this.writeShouldThrowError;
		}

		return createFileStat(resource, this.readonly);
	}

	move(_source: URI, _target: URI, _overwrite?: boolean): Promise<IFileStatWithMetadata> { return Promise.resolve(null!); }
	copy(_source: URI, _target: URI, _overwrite?: boolean): Promise<IFileStatWithMetadata> { return Promise.resolve(null!); }
	async cloneFile(_source: URI, _target: URI): Promise<void> { }
	createFile(_resource: URI, _content?: VSBuffer | VSBufferReadable, _options?: ICreateFileOptions): Promise<IFileStatWithMetadata> { return Promise.resolve(null!); }
	createFolder(_resource: URI): Promise<IFileStatWithMetadata> { return Promise.resolve(null!); }

	onDidChangeFileSystemProviderRegistrations = Event.None;

	private providers = new Map<string, IFileSystemProvider>();

	registerProvider(scheme: string, provider: IFileSystemProvider) {
		this.providers.set(scheme, provider);

		return toDisposable(() => this.providers.delete(scheme));
	}

	getProvider(scheme: string) {
		return this.providers.get(scheme);
	}

	async activateProvider(_scheme: string): Promise<void> {
		this._onWillActivateFileSystemProvider.fire({ scheme: _scheme, join: () => { } });
	}
	async canHandleResource(resource: URI): Promise<boolean> { return this.hasProvider(resource); }
	hasProvider(resource: URI): boolean { return resource.scheme === Schemas.file || this.providers.has(resource.scheme); }
	listCapabilities() {
		return [
			{ scheme: Schemas.file, capabilities: FileSystemProviderCapabilities.FileOpenReadWriteClose },
			...Iterable.map(this.providers, ([scheme, p]) => { return { scheme, capabilities: p.capabilities }; })
		];
	}
	hasCapability(resource: URI, capability: FileSystemProviderCapabilities): boolean {
		if (capability === FileSystemProviderCapabilities.PathCaseSensitive && isLinux) {
			return true;
		}

		const provider = this.getProvider(resource.scheme);

		return !!(provider && (provider.capabilities & capability));
	}

	async del(_resource: URI, _options?: { useTrash?: boolean; recursive?: boolean }): Promise<void> { }

	createWatcher(resource: URI, options: IWatchOptions): IFileSystemWatcher {
		return {
			onDidChange: Event.None,
			dispose: () => { }
		};
	}


	readonly watches: URI[] = [];
	watch(_resource: URI, options: IWatchOptionsWithCorrelation): IFileSystemWatcher;
	watch(_resource: URI): IDisposable;
	watch(_resource: URI): IDisposable {
		this.watches.push(_resource);

		return toDisposable(() => this.watches.splice(this.watches.indexOf(_resource), 1));
	}

	getWriteEncoding(_resource: URI): IResourceEncoding { return { encoding: 'utf8', hasBOM: false }; }
	dispose(): void { }

	async canCreateFile(source: URI, options?: ICreateFileOptions): Promise<Error | true> { return true; }
	async canMove(source: URI, target: URI, overwrite?: boolean | undefined): Promise<Error | true> { return true; }
	async canCopy(source: URI, target: URI, overwrite?: boolean | undefined): Promise<Error | true> { return true; }
	async canDelete(resource: URI, options?: { useTrash?: boolean | undefined; recursive?: boolean | undefined } | undefined): Promise<Error | true> { return true; }
}

export class TestWorkingCopyBackupService extends InMemoryWorkingCopyBackupService {

	readonly resolved: Set<IWorkingCopyIdentifier> = new Set();

	constructor() {
		super();
	}

	parseBackupContent(textBufferFactory: ITextBufferFactory): string {
		const textBuffer = textBufferFactory.create(DefaultEndOfLine.LF).textBuffer;
		const lineCount = textBuffer.getLineCount();
		const range = new Range(1, 1, lineCount, textBuffer.getLineLength(lineCount) + 1);

		return textBuffer.getValueInRange(range, EndOfLinePreference.TextDefined);
	}

	override async resolve<T extends IWorkingCopyBackupMeta>(identifier: IWorkingCopyIdentifier): Promise<IResolvedWorkingCopyBackup<T> | undefined> {
		this.resolved.add(identifier);

		return super.resolve(identifier);
	}
}

export function toUntypedWorkingCopyId(resource: URI): IWorkingCopyIdentifier {
	return toTypedWorkingCopyId(resource, '');
}

export function toTypedWorkingCopyId(resource: URI, typeId = 'testBackupTypeId'): IWorkingCopyIdentifier {
	return { typeId, resource };
}

export class InMemoryTestWorkingCopyBackupService extends BrowserWorkingCopyBackupService {

	private backupResourceJoiners: Function[];
	private discardBackupJoiners: Function[];

	discardedBackups: IWorkingCopyIdentifier[];

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

	testGetFileService(): IFileService {
		return this.fileService;
	}

	joinBackupResource(): Promise<void> {
		return new Promise(resolve => this.backupResourceJoiners.push(resolve));
	}

	joinDiscardBackup(): Promise<void> {
		return new Promise(resolve => this.discardBackupJoiners.push(resolve));
	}

	override async backup(identifier: IWorkingCopyIdentifier, content?: VSBufferReadableStream | VSBufferReadable, versionId?: number, meta?: any, token?: CancellationToken): Promise<void> {
		await super.backup(identifier, content, versionId, meta, token);

		while (this.backupResourceJoiners.length) {
			this.backupResourceJoiners.pop()!();
		}
	}

	override async discardBackup(identifier: IWorkingCopyIdentifier): Promise<void> {
		await super.discardBackup(identifier);
		this.discardedBackups.push(identifier);

		while (this.discardBackupJoiners.length) {
			this.discardBackupJoiners.pop()!();
		}
	}

	async getBackupContents(identifier: IWorkingCopyIdentifier): Promise<string> {
		const backupResource = this.toBackupResource(identifier);

		const fileContents = await this.fileService.readFile(backupResource);

		return fileContents.value.toString();
	}
}

export class TestLifecycleService extends Disposable implements ILifecycleService {

	declare readonly _serviceBrand: undefined;

	usePhases = false;
	_phase!: LifecyclePhase;
	get phase(): LifecyclePhase { return this._phase; }
	set phase(value: LifecyclePhase) {
		this._phase = value;
		if (value === LifecyclePhase.Starting) {
			this.whenStarted.complete();
		} else if (value === LifecyclePhase.Ready) {
			this.whenReady.complete();
		} else if (value === LifecyclePhase.Restored) {
			this.whenRestored.complete();
		} else if (value === LifecyclePhase.Eventually) {
			this.whenEventually.complete();
		}
	}

	private readonly whenStarted = new DeferredPromise<void>();
	private readonly whenReady = new DeferredPromise<void>();
	private readonly whenRestored = new DeferredPromise<void>();
	private readonly whenEventually = new DeferredPromise<void>();
	async when(phase: LifecyclePhase): Promise<void> {
		if (!this.usePhases) {
			return;
		}
		if (phase === LifecyclePhase.Starting) {
			await this.whenStarted.p;
		} else if (phase === LifecyclePhase.Ready) {
			await this.whenReady.p;
		} else if (phase === LifecyclePhase.Restored) {
			await this.whenRestored.p;
		} else if (phase === LifecyclePhase.Eventually) {
			await this.whenEventually.p;
		}
	}

	startupKind!: StartupKind;

	private readonly _onBeforeShutdown = this._register(new Emitter<InternalBeforeShutdownEvent>());
	get onBeforeShutdown(): Event<InternalBeforeShutdownEvent> { return this._onBeforeShutdown.event; }

	private readonly _onBeforeShutdownError = this._register(new Emitter<BeforeShutdownErrorEvent>());
	get onBeforeShutdownError(): Event<BeforeShutdownErrorEvent> { return this._onBeforeShutdownError.event; }

	private readonly _onShutdownVeto = this._register(new Emitter<void>());
	get onShutdownVeto(): Event<void> { return this._onShutdownVeto.event; }

	private readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>());
	get onWillShutdown(): Event<WillShutdownEvent> { return this._onWillShutdown.event; }

	private readonly _onDidShutdown = this._register(new Emitter<void>());
	get onDidShutdown(): Event<void> { return this._onDidShutdown.event; }

	shutdownJoiners: Promise<void>[] = [];

	fireShutdown(reason = ShutdownReason.QUIT): void {
		this.shutdownJoiners = [];

		this._onWillShutdown.fire({
			join: p => {
				this.shutdownJoiners.push(typeof p === 'function' ? p() : p);
			},
			joiners: () => [],
			force: () => { /* No-Op in tests */ },
			token: CancellationToken.None,
			reason
		});
	}

	fireBeforeShutdown(event: InternalBeforeShutdownEvent): void { this._onBeforeShutdown.fire(event); }

	fireWillShutdown(event: WillShutdownEvent): void { this._onWillShutdown.fire(event); }

	async shutdown(): Promise<void> {
		this.fireShutdown();
	}
}

export class TestBeforeShutdownEvent implements InternalBeforeShutdownEvent {

	value: boolean | Promise<boolean> | undefined;
	finalValue: (() => boolean | Promise<boolean>) | undefined;
	reason = ShutdownReason.CLOSE;

	veto(value: boolean | Promise<boolean>): void {
		this.value = value;
	}

	finalVeto(vetoFn: () => boolean | Promise<boolean>): void {
		this.value = vetoFn();
		this.finalValue = vetoFn;
	}
}

export class TestWillShutdownEvent implements WillShutdownEvent {

	value: Promise<void>[] = [];
	joiners = () => [];
	reason = ShutdownReason.CLOSE;
	token = CancellationToken.None;

	join(promise: Promise<void> | (() => Promise<void>), joiner: IWillShutdownEventJoiner): void {
		this.value.push(typeof promise === 'function' ? promise() : promise);
	}

	force() { /* No-Op in tests */ }
}

export class TestTextResourceConfigurationService implements ITextResourceConfigurationService {

	declare readonly _serviceBrand: undefined;

	constructor(private configurationService = new TestConfigurationService()) { }

	onDidChangeConfiguration() {
		return { dispose() { } };
	}

	getValue<T>(resource: URI, arg2?: any, arg3?: any): T {
		const position: IPosition | null = EditorPosition.isIPosition(arg2) ? arg2 : null;
		const section: string | undefined = position ? (typeof arg3 === 'string' ? arg3 : undefined) : (typeof arg2 === 'string' ? arg2 : undefined);
		return this.configurationService.getValue(section, { resource });
	}

	inspect<T>(resource: URI | undefined, position: IPosition | null, section: string): IConfigurationValue<Readonly<T>> {
		return this.configurationService.inspect<T>(section, { resource });
	}

	updateValue(resource: URI, key: string, value: any, configurationTarget?: ConfigurationTarget): Promise<void> {
		return this.configurationService.updateValue(key, value);
	}
}

export class RemoteFileSystemProvider implements IFileSystemProvider {

	constructor(private readonly wrappedFsp: IFileSystemProvider, private readonly remoteAuthority: string) { }

	readonly capabilities: FileSystemProviderCapabilities = this.wrappedFsp.capabilities;
	readonly onDidChangeCapabilities: Event<void> = this.wrappedFsp.onDidChangeCapabilities;

	readonly onDidChangeFile: Event<readonly IFileChange[]> = Event.map(this.wrappedFsp.onDidChangeFile, changes => changes.map(c => {
		return {
			type: c.type,
			resource: c.resource.with({ scheme: Schemas.vscodeRemote, authority: this.remoteAuthority }),
		};
	}));
	watch(resource: URI, opts: IWatchOptions): IDisposable { return this.wrappedFsp.watch(this.toFileResource(resource), opts); }

	stat(resource: URI): Promise<IStat> { return this.wrappedFsp.stat(this.toFileResource(resource)); }
	mkdir(resource: URI): Promise<void> { return this.wrappedFsp.mkdir(this.toFileResource(resource)); }
	readdir(resource: URI): Promise<[string, FileType][]> { return this.wrappedFsp.readdir(this.toFileResource(resource)); }
	delete(resource: URI, opts: IFileDeleteOptions): Promise<void> { return this.wrappedFsp.delete(this.toFileResource(resource), opts); }

	rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> { return this.wrappedFsp.rename(this.toFileResource(from), this.toFileResource(to), opts); }
	copy(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> { return this.wrappedFsp.copy!(this.toFileResource(from), this.toFileResource(to), opts); }

	readFile(resource: URI): Promise<Uint8Array> { return this.wrappedFsp.readFile!(this.toFileResource(resource)); }
	writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> { return this.wrappedFsp.writeFile!(this.toFileResource(resource), content, opts); }

	open(resource: URI, opts: IFileOpenOptions): Promise<number> { return this.wrappedFsp.open!(this.toFileResource(resource), opts); }
	close(fd: number): Promise<void> { return this.wrappedFsp.close!(fd); }
	read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> { return this.wrappedFsp.read!(fd, pos, data, offset, length); }
	write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> { return this.wrappedFsp.write!(fd, pos, data, offset, length); }

	readFileStream(resource: URI, opts: IFileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> { return this.wrappedFsp.readFileStream!(this.toFileResource(resource), opts, token); }

	private toFileResource(resource: URI): URI { return resource.with({ scheme: Schemas.file, authority: '' }); }
}

export class TestInMemoryFileSystemProvider extends InMemoryFileSystemProvider implements IFileSystemProviderWithFileReadStreamCapability {
	override get capabilities(): FileSystemProviderCapabilities {
		return FileSystemProviderCapabilities.FileReadWrite
			| FileSystemProviderCapabilities.PathCaseSensitive
			| FileSystemProviderCapabilities.FileReadStream;
	}

	override readFileStream(resource: URI): ReadableStreamEvents<Uint8Array> {
		const BUFFER_SIZE = 64 * 1024;
		const stream = newWriteableStream<Uint8Array>(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);

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
			} catch (error) {
				stream.end(error);
			}
		})();

		return stream;
	}
}

export const productService: IProductService = { _serviceBrand: undefined, ...product };

export class TestHostService implements IHostService {

	declare readonly _serviceBrand: undefined;

	private _hasFocus = true;
	get hasFocus() { return this._hasFocus; }
	async hadLastFocus(): Promise<boolean> { return this._hasFocus; }

	private _onDidChangeFocus = new Emitter<boolean>();
	readonly onDidChangeFocus = this._onDidChangeFocus.event;

	private _onDidChangeWindow = new Emitter<number>();
	readonly onDidChangeActiveWindow = this._onDidChangeWindow.event;

	readonly onDidChangeFullScreen: Event<{ windowId: number; fullscreen: boolean }> = Event.None;

	setFocus(focus: boolean) {
		this._hasFocus = focus;
		this._onDidChangeFocus.fire(this._hasFocus);
	}

	async restart(): Promise<void> { }
	async reload(): Promise<void> { }
	async close(): Promise<void> { }
	async withExpectedShutdown<T>(expectedShutdownTask: () => Promise<T>): Promise<T> {
		return await expectedShutdownTask();
	}

	async focus(): Promise<void> { }
	async moveTop(): Promise<void> { }
	async getCursorScreenPoint(): Promise<undefined> { return undefined; }

	async openWindow(arg1?: IOpenEmptyWindowOptions | IWindowOpenable[], arg2?: IOpenWindowOptions): Promise<void> { }

	async toggleFullScreen(): Promise<void> { }

	readonly colorScheme = ColorScheme.DARK;
	onDidChangeColorScheme = Event.None;

	getPathForFile(file: File): string | undefined {
		return undefined;
	}
}

export class TestFilesConfigurationService extends FilesConfigurationService {

	testOnFilesConfigurationChange(configuration: any): void {
		super.onFilesConfigurationChange(configuration, true);
	}
}

export class TestReadonlyTextFileEditorModel extends TextFileEditorModel {

	override isReadonly(): boolean {
		return true;
	}
}

export class TestEditorInput extends EditorInput {

	constructor(public resource: URI, private readonly _typeId: string) {
		super();
	}

	override get typeId(): string {
		return this._typeId;
	}

	override get editorId(): string {
		return this._typeId;
	}

	override resolve(): Promise<IDisposable | null> {
		return Promise.resolve(null);
	}
}

export function registerTestEditor(id: string, inputs: SyncDescriptor<EditorInput>[], serializerInputId?: string): IDisposable {
	const disposables = new DisposableStore();

	class TestEditor extends EditorPane {

		private _scopedContextKeyService: IContextKeyService;

		constructor(group: IEditorGroup) {
			super(id, group, NullTelemetryService, new TestThemeService(), disposables.add(new TestStorageService()));
			this._scopedContextKeyService = new MockContextKeyService();
		}

		override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
			super.setInput(input, options, context, token);

			await input.resolve();
		}

		override getId(): string { return id; }
		layout(): void { }
		protected createEditor(): void { }

		override get scopedContextKeyService() {
			return this._scopedContextKeyService;
		}
	}

	disposables.add(Registry.as<IEditorPaneRegistry>(Extensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(TestEditor, id, 'Test Editor Control'), inputs));

	if (serializerInputId) {

		interface ISerializedTestInput {
			resource: string;
		}

		class EditorsObserverTestEditorInputSerializer implements IEditorSerializer {

			canSerialize(editorInput: EditorInput): boolean {
				return true;
			}

			serialize(editorInput: EditorInput): string {
				const testEditorInput = <TestFileEditorInput>editorInput;
				const testInput: ISerializedTestInput = {
					resource: testEditorInput.resource.toString()
				};

				return JSON.stringify(testInput);
			}

			deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
				const testInput: ISerializedTestInput = JSON.parse(serializedEditorInput);

				return new TestFileEditorInput(URI.parse(testInput.resource), serializerInputId!);
			}
		}

		disposables.add(Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(serializerInputId, EditorsObserverTestEditorInputSerializer));
	}

	return disposables;
}

export function registerTestFileEditor(): IDisposable {
	const disposables = new DisposableStore();

	disposables.add(Registry.as<IEditorPaneRegistry>(Extensions.EditorPane).registerEditorPane(
		EditorPaneDescriptor.create(
			TestTextFileEditor,
			TestTextFileEditor.ID,
			'Text File Editor'
		),
		[new SyncDescriptor(FileEditorInput)]
	));

	return disposables;
}

export function registerTestResourceEditor(): IDisposable {
	const disposables = new DisposableStore();

	disposables.add(Registry.as<IEditorPaneRegistry>(Extensions.EditorPane).registerEditorPane(
		EditorPaneDescriptor.create(
			TestTextResourceEditor,
			TestTextResourceEditor.ID,
			'Text Editor'
		),
		[
			new SyncDescriptor(UntitledTextEditorInput),
			new SyncDescriptor(TextResourceEditorInput)
		]
	));

	return disposables;
}

export function registerTestSideBySideEditor(): IDisposable {
	const disposables = new DisposableStore();

	disposables.add(Registry.as<IEditorPaneRegistry>(Extensions.EditorPane).registerEditorPane(
		EditorPaneDescriptor.create(
			SideBySideEditor,
			SideBySideEditor.ID,
			'Text Editor'
		),
		[
			new SyncDescriptor(SideBySideEditorInput)
		]
	));

	return disposables;
}

export class TestFileEditorInput extends EditorInput implements IFileEditorInput {

	readonly preferredResource = this.resource;

	gotDisposed = false;
	gotSaved = false;
	gotSavedAs = false;
	gotReverted = false;
	dirty = false;
	modified: boolean | undefined;
	private fails = false;

	disableToUntyped = false;

	constructor(
		public resource: URI,
		private _typeId: string
	) {
		super();
	}

	override get typeId() { return this._typeId; }
	override get editorId() { return this._typeId; }

	private _capabilities: EditorInputCapabilities = EditorInputCapabilities.None;
	override get capabilities(): EditorInputCapabilities { return this._capabilities; }
	override set capabilities(capabilities: EditorInputCapabilities) {
		if (this._capabilities !== capabilities) {
			this._capabilities = capabilities;
			this._onDidChangeCapabilities.fire();
		}
	}

	override resolve(): Promise<IDisposable | null> { return !this.fails ? Promise.resolve(null) : Promise.reject(new Error('fails')); }
	override matches(other: EditorInput | IResourceEditorInput | ITextResourceEditorInput | IUntitledTextResourceEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}
		if (other instanceof EditorInput) {
			return !!(other?.resource && this.resource.toString() === other.resource.toString() && other instanceof TestFileEditorInput && other.typeId === this.typeId);
		}
		return isEqual(this.resource, other.resource) && (this.editorId === other.options?.override || other.options?.override === undefined);
	}
	setPreferredResource(resource: URI): void { }
	async setEncoding(encoding: string) { }
	getEncoding() { return undefined; }
	setPreferredName(name: string): void { }
	setPreferredDescription(description: string): void { }
	setPreferredEncoding(encoding: string) { }
	setPreferredContents(contents: string): void { }
	setLanguageId(languageId: string, source?: string) { }
	setPreferredLanguageId(languageId: string) { }
	setForceOpenAsBinary(): void { }
	setFailToOpen(): void {
		this.fails = true;
	}
	override async save(groupId: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | undefined> {
		this.gotSaved = true;
		this.dirty = false;
		return this;
	}
	override async saveAs(groupId: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | undefined> {
		this.gotSavedAs = true;
		return this;
	}
	override async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		this.gotReverted = true;
		this.gotSaved = false;
		this.gotSavedAs = false;
		this.dirty = false;
	}
	override toUntyped(): IUntypedEditorInput | undefined {
		if (this.disableToUntyped) {
			return undefined;
		}
		return { resource: this.resource };
	}
	setModified(): void { this.modified = true; }
	override isModified(): boolean {
		return this.modified === undefined ? this.dirty : this.modified;
	}
	setDirty(): void { this.dirty = true; }
	override isDirty(): boolean {
		return this.dirty;
	}
	isResolved(): boolean { return false; }
	override dispose(): void {
		super.dispose();
		this.gotDisposed = true;
	}
	movedEditor: IMoveResult | undefined = undefined;
	override async rename(): Promise<IMoveResult | undefined> { return this.movedEditor; }

	private moveDisabledReason: string | undefined = undefined;
	setMoveDisabled(reason: string): void {
		this.moveDisabledReason = reason;
	}

	override canMove(sourceGroup: GroupIdentifier, targetGroup: GroupIdentifier): string | true {
		if (typeof this.moveDisabledReason === 'string') {
			return this.moveDisabledReason;
		}
		return super.canMove(sourceGroup, targetGroup);
	}
}

export class TestSingletonFileEditorInput extends TestFileEditorInput {

	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Singleton; }
}

export class TestEditorPart extends MainEditorPart implements IEditorGroupsService {

	declare readonly _serviceBrand: undefined;

	readonly mainPart = this;
	readonly parts: readonly IEditorPart[] = [this];

	readonly onDidCreateAuxiliaryEditorPart: Event<IAuxiliaryEditorPart> = Event.None;

	testSaveState(): void {
		return super.saveState();
	}

	clearState(): void {
		const workspaceMemento = this.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		for (const key of Object.keys(workspaceMemento)) {
			delete workspaceMemento[key];
		}

		const profileMemento = this.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
		for (const key of Object.keys(profileMemento)) {
			delete profileMemento[key];
		}
	}

	registerEditorPart(part: IEditorPart): IDisposable {
		return Disposable.None;
	}

	createAuxiliaryEditorPart(): Promise<IAuxiliaryEditorPart> {
		throw new Error('Method not implemented.');
	}

	getScopedInstantiationService(part: IEditorPart): IInstantiationService {
		throw new Error('Method not implemented.');
	}

	getPart(group: number | IEditorGroup): IEditorPart { return this; }

	saveWorkingSet(name: string): IEditorWorkingSet { throw new Error('Method not implemented.'); }
	getWorkingSets(): IEditorWorkingSet[] { throw new Error('Method not implemented.'); }
	applyWorkingSet(workingSet: IEditorWorkingSet | 'empty', options?: IEditorWorkingSetOptions): Promise<boolean> { throw new Error('Method not implemented.'); }
	deleteWorkingSet(workingSet: IEditorWorkingSet): Promise<boolean> { throw new Error('Method not implemented.'); }

	registerContextKeyProvider<T extends ContextKeyValue>(provider: IEditorGroupContextKeyProvider<T>): IDisposable { throw new Error('Method not implemented.'); }
}

export class TestEditorParts extends EditorParts {
	testMainPart!: TestEditorPart;

	protected override createMainEditorPart(): MainEditorPart {
		this.testMainPart = this.instantiationService.createInstance(TestEditorPart, this);

		return this.testMainPart;
	}
}

export async function createEditorParts(instantiationService: IInstantiationService, disposables: DisposableStore): Promise<TestEditorParts> {
	const parts = instantiationService.createInstance(TestEditorParts);
	const part = disposables.add(parts).testMainPart;
	part.create(document.createElement('div'));
	part.layout(1080, 800, 0, 0);

	await parts.whenReady;

	return parts;
}

export async function createEditorPart(instantiationService: IInstantiationService, disposables: DisposableStore): Promise<TestEditorPart> {
	return (await createEditorParts(instantiationService, disposables)).testMainPart;
}

export class TestListService implements IListService {
	declare readonly _serviceBrand: undefined;

	lastFocusedList: any | undefined = undefined;

	register(): IDisposable {
		return Disposable.None;
	}
}

export class TestPathService implements IPathService {

	declare readonly _serviceBrand: undefined;

	constructor(private readonly fallbackUserHome: URI = URI.from({ scheme: Schemas.file, path: '/' }), public defaultUriScheme = Schemas.file) { }

	hasValidBasename(resource: URI, basename?: string): Promise<boolean>;
	hasValidBasename(resource: URI, os: OperatingSystem, basename?: string): boolean;
	hasValidBasename(resource: URI, arg2?: string | OperatingSystem, name?: string): boolean | Promise<boolean> {
		if (typeof arg2 === 'string' || typeof arg2 === 'undefined') {
			return isValidBasename(arg2 ?? basename(resource));
		}

		return isValidBasename(name ?? basename(resource));
	}

	get path() { return Promise.resolve(isWindows ? win32 : posix); }

	userHome(options?: { preferLocal: boolean }): Promise<URI>;
	userHome(options: { preferLocal: true }): URI;
	userHome(options?: { preferLocal: boolean }): Promise<URI> | URI {
		return options?.preferLocal ? this.fallbackUserHome : Promise.resolve(this.fallbackUserHome);
	}

	get resolvedUserHome() { return this.fallbackUserHome; }

	async fileURI(path: string): Promise<URI> {
		return URI.file(path);
	}
}

export interface ITestTextFileEditorModelManager extends ITextFileEditorModelManager, IDisposable {
	add(resource: URI, model: TextFileEditorModel): void;
	remove(resource: URI): void;
}

interface ITestTextFileEditorModel extends ITextFileEditorModel {
	readonly lastResolvedFileStat: IFileStatWithMetadata | undefined;
}

export function getLastResolvedFileStat(model: unknown): IFileStatWithMetadata | undefined {
	const candidate = model as ITestTextFileEditorModel | undefined;

	return candidate?.lastResolvedFileStat;
}

export class TestWorkspacesService implements IWorkspacesService {
	_serviceBrand: undefined;

	onDidChangeRecentlyOpened = Event.None;

	async createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier> { throw new Error('Method not implemented.'); }
	async deleteUntitledWorkspace(workspace: IWorkspaceIdentifier): Promise<void> { }
	async addRecentlyOpened(recents: IRecent[]): Promise<void> { }
	async removeRecentlyOpened(workspaces: URI[]): Promise<void> { }
	async clearRecentlyOpened(): Promise<void> { }
	async getRecentlyOpened(): Promise<IRecentlyOpened> { return { files: [], workspaces: [] }; }
	async getDirtyWorkspaces(): Promise<(IFolderBackupInfo | IWorkspaceBackupInfo)[]> { return []; }
	async enterWorkspace(path: URI): Promise<IEnterWorkspaceResult | undefined> { throw new Error('Method not implemented.'); }
	async getWorkspaceIdentifier(workspacePath: URI): Promise<IWorkspaceIdentifier> { throw new Error('Method not implemented.'); }
}

export class TestTerminalInstanceService implements ITerminalInstanceService {
	onDidCreateInstance = Event.None;
	declare readonly _serviceBrand: undefined;

	convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile?: IShellLaunchConfig | ITerminalProfile, cwd?: string | URI): IShellLaunchConfig { throw new Error('Method not implemented.'); }
	preparePathForTerminalAsync(path: string, executable: string | undefined, title: string, shellType: TerminalShellType, remoteAuthority: string | undefined): Promise<string> { throw new Error('Method not implemented.'); }
	createInstance(options: ICreateTerminalOptions, target: TerminalLocation): ITerminalInstance { throw new Error('Method not implemented.'); }
	async getBackend(remoteAuthority?: string): Promise<ITerminalBackend | undefined> { throw new Error('Method not implemented.'); }
	didRegisterBackend(remoteAuthority?: string): void { throw new Error('Method not implemented.'); }
	getRegisteredBackends(): IterableIterator<ITerminalBackend> { throw new Error('Method not implemented.'); }
}

export class TestTerminalEditorService implements ITerminalEditorService {
	_serviceBrand: undefined;
	activeInstance: ITerminalInstance | undefined;
	instances: readonly ITerminalInstance[] = [];
	onDidDisposeInstance = Event.None;
	onDidFocusInstance = Event.None;
	onDidChangeInstanceCapability = Event.None;
	onDidChangeActiveInstance = Event.None;
	onDidChangeInstances = Event.None;
	openEditor(instance: ITerminalInstance, editorOptions?: TerminalEditorLocation): Promise<void> { throw new Error('Method not implemented.'); }
	detachInstance(instance: ITerminalInstance): void { throw new Error('Method not implemented.'); }
	splitInstance(instanceToSplit: ITerminalInstance, shellLaunchConfig?: IShellLaunchConfig): ITerminalInstance { throw new Error('Method not implemented.'); }
	revealActiveEditor(preserveFocus?: boolean): Promise<void> { throw new Error('Method not implemented.'); }
	resolveResource(instance: ITerminalInstance): URI { throw new Error('Method not implemented.'); }
	reviveInput(deserializedInput: IDeserializedTerminalEditorInput): TerminalEditorInput { throw new Error('Method not implemented.'); }
	getInputFromResource(resource: URI): TerminalEditorInput { throw new Error('Method not implemented.'); }
	setActiveInstance(instance: ITerminalInstance): void { throw new Error('Method not implemented.'); }
	focusActiveInstance(): Promise<void> { throw new Error('Method not implemented.'); }
	focusInstance(instance: ITerminalInstance): void { throw new Error('Method not implemented.'); }
	getInstanceFromResource(resource: URI | undefined): ITerminalInstance | undefined { throw new Error('Method not implemented.'); }
	focusFindWidget(): void { throw new Error('Method not implemented.'); }
	hideFindWidget(): void { throw new Error('Method not implemented.'); }
	findNext(): void { throw new Error('Method not implemented.'); }
	findPrevious(): void { throw new Error('Method not implemented.'); }
}

export class TestTerminalGroupService implements ITerminalGroupService {
	_serviceBrand: undefined;
	activeInstance: ITerminalInstance | undefined;
	instances: readonly ITerminalInstance[] = [];
	groups: readonly ITerminalGroup[] = [];
	activeGroup: ITerminalGroup | undefined;
	activeGroupIndex: number = 0;
	lastAccessedMenu: 'inline-tab' | 'tab-list' = 'inline-tab';
	onDidChangeActiveGroup = Event.None;
	onDidDisposeGroup = Event.None;
	onDidShow = Event.None;
	onDidChangeGroups = Event.None;
	onDidChangePanelOrientation = Event.None;
	onDidDisposeInstance = Event.None;
	onDidFocusInstance = Event.None;
	onDidChangeInstanceCapability = Event.None;
	onDidChangeActiveInstance = Event.None;
	onDidChangeInstances = Event.None;
	createGroup(instance?: any): ITerminalGroup { throw new Error('Method not implemented.'); }
	getGroupForInstance(instance: ITerminalInstance): ITerminalGroup | undefined { throw new Error('Method not implemented.'); }
	moveGroup(source: ITerminalInstance | ITerminalInstance[], target: ITerminalInstance): void { throw new Error('Method not implemented.'); }
	moveGroupToEnd(source: ITerminalInstance | ITerminalInstance[]): void { throw new Error('Method not implemented.'); }
	moveInstance(source: ITerminalInstance, target: ITerminalInstance, side: 'before' | 'after'): void { throw new Error('Method not implemented.'); }
	unsplitInstance(instance: ITerminalInstance): void { throw new Error('Method not implemented.'); }
	joinInstances(instances: ITerminalInstance[]): void { throw new Error('Method not implemented.'); }
	instanceIsSplit(instance: ITerminalInstance): boolean { throw new Error('Method not implemented.'); }
	getGroupLabels(): string[] { throw new Error('Method not implemented.'); }
	setActiveGroupByIndex(index: number): void { throw new Error('Method not implemented.'); }
	setActiveGroupToNext(): void { throw new Error('Method not implemented.'); }
	setActiveGroupToPrevious(): void { throw new Error('Method not implemented.'); }
	setActiveInstanceByIndex(terminalIndex: number): void { throw new Error('Method not implemented.'); }
	setContainer(container: HTMLElement): void { throw new Error('Method not implemented.'); }
	showPanel(focus?: boolean): Promise<void> { throw new Error('Method not implemented.'); }
	hidePanel(): void { throw new Error('Method not implemented.'); }
	focusTabs(): void { throw new Error('Method not implemented.'); }
	focusHover(): void { throw new Error('Method not implemented.'); }
	setActiveInstance(instance: ITerminalInstance): void { throw new Error('Method not implemented.'); }
	focusActiveInstance(): Promise<void> { throw new Error('Method not implemented.'); }
	focusInstance(instance: ITerminalInstance): void { throw new Error('Method not implemented.'); }
	getInstanceFromResource(resource: URI | undefined): ITerminalInstance | undefined { throw new Error('Method not implemented.'); }
	focusFindWidget(): void { throw new Error('Method not implemented.'); }
	hideFindWidget(): void { throw new Error('Method not implemented.'); }
	findNext(): void { throw new Error('Method not implemented.'); }
	findPrevious(): void { throw new Error('Method not implemented.'); }
	updateVisibility(): void { throw new Error('Method not implemented.'); }
}

export class TestTerminalProfileService implements ITerminalProfileService {
	_serviceBrand: undefined;
	availableProfiles: ITerminalProfile[] = [];
	contributedProfiles: IExtensionTerminalProfile[] = [];
	profilesReady: Promise<void> = Promise.resolve();
	onDidChangeAvailableProfiles = Event.None;
	getPlatformKey(): Promise<string> { throw new Error('Method not implemented.'); }
	refreshAvailableProfiles(): void { throw new Error('Method not implemented.'); }
	getDefaultProfileName(): string | undefined { throw new Error('Method not implemented.'); }
	getDefaultProfile(): ITerminalProfile | undefined { throw new Error('Method not implemented.'); }
	getContributedDefaultProfile(shellLaunchConfig: IShellLaunchConfig): Promise<IExtensionTerminalProfile | undefined> { throw new Error('Method not implemented.'); }
	registerContributedProfile(args: IRegisterContributedProfileArgs): Promise<void> { throw new Error('Method not implemented.'); }
	getContributedProfileProvider(extensionIdentifier: string, id: string): ITerminalProfileProvider | undefined { throw new Error('Method not implemented.'); }
	registerTerminalProfileProvider(extensionIdentifier: string, id: string, profileProvider: ITerminalProfileProvider): IDisposable { throw new Error('Method not implemented.'); }
}

export class TestTerminalProfileResolverService implements ITerminalProfileResolverService {
	_serviceBrand: undefined;
	defaultProfileName = '';
	resolveIcon(shellLaunchConfig: IShellLaunchConfig): void { }
	async resolveShellLaunchConfig(shellLaunchConfig: IShellLaunchConfig, options: IShellLaunchConfigResolveOptions): Promise<void> { }
	async getDefaultProfile(options: IShellLaunchConfigResolveOptions): Promise<ITerminalProfile> { return { path: '/default', profileName: 'Default', isDefault: true }; }
	async getDefaultShell(options: IShellLaunchConfigResolveOptions): Promise<string> { return '/default'; }
	async getDefaultShellArgs(options: IShellLaunchConfigResolveOptions): Promise<string | string[]> { return []; }
	getDefaultIcon(): TerminalIcon & ThemeIcon { return Codicon.terminal; }
	async getEnvironment(): Promise<IProcessEnvironment> { return env; }
	getSafeConfigValue(key: string, os: OperatingSystem): unknown | undefined { return undefined; }
	getSafeConfigValueFullKey(key: string): unknown | undefined { return undefined; }
	createProfileFromShellAndShellArgs(shell?: unknown, shellArgs?: unknown): Promise<string | ITerminalProfile> { throw new Error('Method not implemented.'); }
}

export class TestTerminalConfigurationService extends TerminalConfigurationService {
	get fontMetrics() { return this._fontMetrics; }
	setConfig(config: Partial<ITerminalConfiguration>) { this._config = config as any; }
}

export class TestQuickInputService implements IQuickInputService {
	declare readonly _serviceBrand: undefined;

	readonly onShow = Event.None;
	readonly onHide = Event.None;

	readonly currentQuickInput = undefined;
	readonly quickAccess = undefined!;
	backButton!: IQuickInputButton;

	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }, token?: CancellationToken): Promise<T[]>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }, token?: CancellationToken): Promise<T>;
	async pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>, token?: CancellationToken): Promise<T | undefined> {
		if (Array.isArray(picks)) {
			return <any>{ label: 'selectedPick', description: 'pick description', value: 'selectedPick' };
		} else {
			return undefined;
		}
	}

	async input(options?: IInputOptions, token?: CancellationToken): Promise<string> { return options ? 'resolved' + options.prompt : 'resolved'; }

	createQuickPick<T extends IQuickPickItem>(): IQuickPick<T, { useSeparators: boolean }> { throw new Error('not implemented.'); }
	createInputBox(): IInputBox { throw new Error('not implemented.'); }
	createQuickWidget(): IQuickWidget { throw new Error('Method not implemented.'); }
	focus(): void { throw new Error('not implemented.'); }
	toggle(): void { throw new Error('not implemented.'); }
	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void { throw new Error('not implemented.'); }
	accept(): Promise<void> { throw new Error('not implemented.'); }
	back(): Promise<void> { throw new Error('not implemented.'); }
	cancel(): Promise<void> { throw new Error('not implemented.'); }
}

class TestLanguageDetectionService implements ILanguageDetectionService {

	declare readonly _serviceBrand: undefined;

	isEnabledForLanguage(languageId: string): boolean { return false; }
	async detectLanguage(resource: URI, supportedLangs?: string[] | undefined): Promise<string | undefined> { return undefined; }
}

export class TestRemoteAgentService implements IRemoteAgentService {

	declare readonly _serviceBrand: undefined;

	getConnection(): IRemoteAgentConnection | null { return null; }
	async getEnvironment(): Promise<IRemoteAgentEnvironment | null> { return null; }
	async getRawEnvironment(): Promise<IRemoteAgentEnvironment | null> { return null; }
	async getExtensionHostExitInfo(reconnectionToken: string): Promise<IExtensionHostExitInfo | null> { return null; }
	async getDiagnosticInfo(options: IDiagnosticInfoOptions): Promise<IDiagnosticInfo | undefined> { return undefined; }
	async updateTelemetryLevel(telemetryLevel: TelemetryLevel): Promise<void> { }
	async logTelemetry(eventName: string, data?: ITelemetryData): Promise<void> { }
	async flushTelemetry(): Promise<void> { }
	async getRoundTripTime(): Promise<number | undefined> { return undefined; }
	async endConnection(): Promise<void> { }
}

export class TestRemoteExtensionsScannerService implements IRemoteExtensionsScannerService {
	declare readonly _serviceBrand: undefined;
	async whenExtensionsReady(): Promise<void> { }
	scanExtensions(): Promise<IExtensionDescription[]> { throw new Error('Method not implemented.'); }
}

export class TestWorkbenchExtensionEnablementService implements IWorkbenchExtensionEnablementService {
	_serviceBrand: undefined;
	onEnablementChanged = Event.None;
	getEnablementState(extension: IExtension): EnablementState { return EnablementState.EnabledGlobally; }
	getEnablementStates(extensions: IExtension[], workspaceTypeOverrides?: { trusted?: boolean | undefined } | undefined): EnablementState[] { return []; }
	getDependenciesEnablementStates(extension: IExtension): [IExtension, EnablementState][] { return []; }
	canChangeEnablement(extension: IExtension): boolean { return true; }
	canChangeWorkspaceEnablement(extension: IExtension): boolean { return true; }
	isEnabled(extension: IExtension): boolean { return true; }
	isEnabledEnablementState(enablementState: EnablementState): boolean { return true; }
	isDisabledGlobally(extension: IExtension): boolean { return false; }
	async setEnablement(extensions: IExtension[], state: EnablementState): Promise<boolean[]> { return []; }
	async updateExtensionsEnablementsWhenWorkspaceTrustChanges(): Promise<void> { }
}

export class TestWorkbenchExtensionManagementService implements IWorkbenchExtensionManagementService {
	_serviceBrand: undefined;
	onInstallExtension = Event.None;
	onDidInstallExtensions = Event.None;
	onUninstallExtension = Event.None;
	onDidUninstallExtension = Event.None;
	onDidUpdateExtensionMetadata = Event.None;
	onProfileAwareInstallExtension = Event.None;
	onProfileAwareDidInstallExtensions = Event.None;
	onProfileAwareUninstallExtension = Event.None;
	onProfileAwareDidUninstallExtension = Event.None;
	onDidProfileAwareUninstallExtensions = Event.None;
	onProfileAwareDidUpdateExtensionMetadata = Event.None;
	onDidChangeProfile = Event.None;
	onDidEnableExtensions = Event.None;
	installVSIX(location: URI, manifest: Readonly<IRelaxedExtensionManifest>, installOptions?: InstallOptions | undefined): Promise<ILocalExtension> {
		throw new Error('Method not implemented.');
	}
	installFromLocation(location: URI): Promise<ILocalExtension> {
		throw new Error('Method not implemented.');
	}
	installGalleryExtensions(extensions: InstallExtensionInfo[]): Promise<InstallExtensionResult[]> {
		throw new Error('Method not implemented.');
	}
	async updateFromGallery(gallery: IGalleryExtension, extension: ILocalExtension, installOptions?: InstallOptions | undefined): Promise<ILocalExtension> { return extension; }
	zip(extension: ILocalExtension): Promise<URI> {
		throw new Error('Method not implemented.');
	}
	getManifest(vsix: URI): Promise<Readonly<IRelaxedExtensionManifest>> {
		throw new Error('Method not implemented.');
	}
	install(vsix: URI, options?: InstallOptions | undefined): Promise<ILocalExtension> {
		throw new Error('Method not implemented.');
	}
	async canInstall(extension: IGalleryExtension): Promise<boolean> { return false; }
	installFromGallery(extension: IGalleryExtension, options?: InstallOptions | undefined): Promise<ILocalExtension> {
		throw new Error('Method not implemented.');
	}
	uninstall(extension: ILocalExtension, options?: UninstallOptions | undefined): Promise<void> {
		throw new Error('Method not implemented.');
	}
	uninstallExtensions(extensions: UninstallExtensionInfo[]): Promise<void> {
		throw new Error('Method not implemented.');
	}
	async reinstallFromGallery(extension: ILocalExtension): Promise<ILocalExtension> {
		throw new Error('Method not implemented.');
	}
	async getInstalled(type?: ExtensionType | undefined): Promise<ILocalExtension[]> { return []; }
	getExtensionsControlManifest(): Promise<IExtensionsControlManifest> {
		throw new Error('Method not implemented.');
	}
	async updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>): Promise<ILocalExtension> { return local; }
	registerParticipant(pariticipant: IExtensionManagementParticipant): void { }
	async getTargetPlatform(): Promise<TargetPlatform> { return TargetPlatform.UNDEFINED; }
	async cleanUp(): Promise<void> { }
	download(): Promise<URI> {
		throw new Error('Method not implemented.');
	}
	copyExtensions(): Promise<void> { throw new Error('Not Supported'); }
	toggleAppliationScope(): Promise<ILocalExtension> { throw new Error('Not Supported'); }
	installExtensionsFromProfile(): Promise<ILocalExtension[]> { throw new Error('Not Supported'); }
	whenProfileChanged(from: IUserDataProfile, to: IUserDataProfile): Promise<void> { throw new Error('Not Supported'); }
	getInstalledWorkspaceExtensionLocations(): URI[] { throw new Error('Method not implemented.'); }
	getInstalledWorkspaceExtensions(): Promise<ILocalExtension[]> { throw new Error('Method not implemented.'); }
	installResourceExtension(): Promise<ILocalExtension> { throw new Error('Method not implemented.'); }
	getExtensions(): Promise<IResourceExtension[]> { throw new Error('Method not implemented.'); }
	resetPinnedStateForAllUserExtensions(pinned: boolean): Promise<void> { throw new Error('Method not implemented.'); }
}

export class TestUserDataProfileService implements IUserDataProfileService {

	readonly _serviceBrand: undefined;
	readonly onDidChangeCurrentProfile = Event.None;
	readonly currentProfile = toUserDataProfile('test', 'test', URI.file('tests').with({ scheme: 'vscode-tests' }), URI.file('tests').with({ scheme: 'vscode-tests' }));
	async updateCurrentProfile(): Promise<void> { }
	getShortName(profile: IUserDataProfile): string { return profile.shortName ?? profile.name; }
}

export class TestWebExtensionsScannerService implements IWebExtensionsScannerService {
	_serviceBrand: undefined;
	onDidChangeProfile = Event.None;
	async scanSystemExtensions(): Promise<IExtension[]> { return []; }
	async scanUserExtensions(): Promise<IScannedExtension[]> { return []; }
	async scanExtensionsUnderDevelopment(): Promise<IExtension[]> { return []; }
	async copyExtensions(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	scanExistingExtension(extensionLocation: URI, extensionType: ExtensionType): Promise<IScannedExtension | null> {
		throw new Error('Method not implemented.');
	}
	addExtension(location: URI, metadata?: Partial<IGalleryMetadata & { isApplicationScoped: boolean; isMachineScoped: boolean; isBuiltin: boolean; isSystem: boolean; updated: boolean; preRelease: boolean; installedTimestamp: number }> | undefined): Promise<IExtension> {
		throw new Error('Method not implemented.');
	}
	addExtensionFromGallery(galleryExtension: IGalleryExtension, metadata?: Partial<IGalleryMetadata & { isApplicationScoped: boolean; isMachineScoped: boolean; isBuiltin: boolean; isSystem: boolean; updated: boolean; preRelease: boolean; installedTimestamp: number }> | undefined): Promise<IExtension> {
		throw new Error('Method not implemented.');
	}
	removeExtension(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	updateMetadata(extension: IScannedExtension, metaData: Partial<Metadata>, profileLocation: URI): Promise<IScannedExtension> {
		throw new Error('Method not implemented.');
	}
	scanExtensionManifest(extensionLocation: URI): Promise<Readonly<IRelaxedExtensionManifest> | null> {
		throw new Error('Method not implemented.');
	}
}

export async function workbenchTeardown(instantiationService: IInstantiationService): Promise<void> {
	return instantiationService.invokeFunction(async accessor => {
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
