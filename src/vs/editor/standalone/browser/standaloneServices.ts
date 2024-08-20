/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/editor/standalone/browser/standaloneCodeEditorService';
import 'vs/editor/standalone/browser/standaloneLayoutService';
import 'vs/platform/undoRedo/common/undoRedoService';
import 'vs/editor/common/services/languageFeatureDebounce';
import 'vs/editor/common/services/semanticTokensStylingService';
import 'vs/editor/common/services/languageFeaturesService';
import 'vs/editor/browser/services/hoverService/hoverService';

import * as strings from 'vs/base/common/strings';
import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Emitter, Event, IValueWithChangeEvent, ValueWithChangeEvent } from 'vs/base/common/event';
import { ResolvedKeybinding, KeyCodeChord, Keybinding, decodeKeybinding } from 'vs/base/common/keybindings';
import { IDisposable, IReference, ImmortalReference, toDisposable, DisposableStore, Disposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { OS, isLinux, isMacintosh } from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { IBulkEditOptions, IBulkEditResult, IBulkEditService, ResourceEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { isDiffEditorConfigurationKey, isEditorConfigurationKey } from 'vs/editor/common/config/editorConfigurationSchema';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { IPosition, Position as Pos } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel, ITextSnapshot } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { IResolvedTextEditorModel, ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextResourceConfigurationService, ITextResourcePropertiesService, ITextResourceConfigurationChangeEvent } from 'vs/editor/common/services/textResourceConfiguration';
import { CommandsRegistry, ICommandEvent, ICommandHandler, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationChangeEvent, IConfigurationData, IConfigurationOverrides, IConfigurationService, IConfigurationModel, IConfigurationValue, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { Configuration, ConfigurationModel, ConfigurationChangeEvent } from 'vs/platform/configuration/common/configurationModels';
import { IContextKeyService, ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { IConfirmation, IConfirmationResult, IDialogService, IInputResult, IPrompt, IPromptResult, IPromptWithCustomCancel, IPromptResultWithCancel, IPromptWithDefaultCancel, IPromptBaseButton } from 'vs/platform/dialogs/common/dialogs';
import { createDecorator, IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { AbstractKeybindingService } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { IKeybindingService, IKeyboardEvent, KeybindingsSchemaContribution } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { IKeybindingItem, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { ILabelService, ResourceLabelFormatter, IFormatterChangeEvent, Verbosity } from 'vs/platform/label/common/label';
import { INotification, INotificationHandle, INotificationService, IPromptChoice, IPromptOptions, NoOpNotification, IStatusMessageOptions, INotificationSource, INotificationSourceFilter, NotificationsFilter } from 'vs/platform/notification/common/notification';
import { IProgressRunner, IEditorProgressService, IProgressService, IProgress, IProgressCompositeOptions, IProgressDialogOptions, IProgressNotificationOptions, IProgressOptions, IProgressStep, IProgressWindowOptions } from 'vs/platform/progress/common/progress';
import { ITelemetryService, TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier, IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, IWorkspaceFoldersWillChangeEvent, WorkbenchState, WorkspaceFolder, STANDALONE_EDITOR_WORKSPACE_ID } from 'vs/platform/workspace/common/workspace';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { StandaloneServicesNLS } from 'vs/editor/common/standaloneStrings';
import { basename } from 'vs/base/common/resources';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ConsoleLogger, ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceTrustManagementService, IWorkspaceTrustTransitionParticipant, IWorkspaceTrustUriInfo } from 'vs/platform/workspace/common/workspaceTrust';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IContextMenuService, IContextViewDelegate, IContextViewService, IOpenContextView } from 'vs/platform/contextview/browser/contextView';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
import { LanguageService } from 'vs/editor/common/services/languageService';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { getSingletonServiceDescriptors, InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { EditorWorkerService } from 'vs/editor/browser/services/editorWorkerService';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { MarkerDecorationsService } from 'vs/editor/common/services/markerDecorationsService';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markerDecorations';
import { ModelService } from 'vs/editor/common/services/modelService';
import { StandaloneQuickInputService } from 'vs/editor/standalone/browser/quickInput/standaloneQuickInputService';
import { StandaloneThemeService } from 'vs/editor/standalone/browser/standaloneThemeService';
import { IStandaloneThemeService } from 'vs/editor/standalone/common/standaloneTheme';
import { AccessibilityService } from 'vs/platform/accessibility/browser/accessibilityService';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { MenuService } from 'vs/platform/actions/common/menuService';
import { BrowserClipboardService } from 'vs/platform/clipboard/browser/clipboardService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService, InMemoryStorageService } from 'vs/platform/storage/common/storage';
import { DefaultConfiguration } from 'vs/platform/configuration/common/configurations';
import { WorkspaceEdit } from 'vs/editor/common/languages';
import { AccessibilitySignal, AccessibilityModality, IAccessibilitySignalService, Sound } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { LogService } from 'vs/platform/log/common/logService';
import { getEditorFeatures } from 'vs/editor/common/editorFeatures';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ExtensionKind, IEnvironmentService, IExtensionHostDebugParams } from 'vs/platform/environment/common/environment';
import { mainWindow } from 'vs/base/browser/window';
import { ResourceMap } from 'vs/base/common/map';
import { ITreeSitterParserService } from 'vs/editor/common/services/treeSitterParserService';
import { StandaloneTreeSitterParserService } from 'vs/editor/standalone/browser/standaloneTreeSitterService';
import { IWorkerDescriptor } from 'vs/base/common/worker/simpleWorker';

class SimpleModel implements IResolvedTextEditorModel {

	private readonly model: ITextModel;
	private readonly _onWillDispose: Emitter<void>;

	constructor(model: ITextModel) {
		this.model = model;
		this._onWillDispose = new Emitter<void>();
	}

	public get onWillDispose(): Event<void> {
		return this._onWillDispose.event;
	}

	public resolve(): Promise<void> {
		return Promise.resolve();
	}

	public get textEditorModel(): ITextModel {
		return this.model;
	}

	public createSnapshot(): ITextSnapshot {
		return this.model.createSnapshot();
	}

	public isReadonly(): boolean {
		return false;
	}

	private disposed = false;
	public dispose(): void {
		this.disposed = true;

		this._onWillDispose.fire();
	}

	public isDisposed(): boolean {
		return this.disposed;
	}

	public isResolved(): boolean {
		return true;
	}

	public getLanguageId(): string | undefined {
		return this.model.getLanguageId();
	}
}

class StandaloneTextModelService implements ITextModelService {
	public _serviceBrand: undefined;

	constructor(
		@IModelService private readonly modelService: IModelService
	) { }

	public createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
		const model = this.modelService.getModel(resource);

		if (!model) {
			return Promise.reject(new Error(`Model not found`));
		}

		return Promise.resolve(new ImmortalReference(new SimpleModel(model)));
	}

	public registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
		return {
			dispose: function () { /* no op */ }
		};
	}

	public canHandleResource(resource: URI): boolean {
		return false;
	}
}

class StandaloneEditorProgressService implements IEditorProgressService {
	declare readonly _serviceBrand: undefined;

	private static NULL_PROGRESS_RUNNER: IProgressRunner = {
		done: () => { },
		total: () => { },
		worked: () => { }
	};

	show(infinite: true, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;
	show(): IProgressRunner {
		return StandaloneEditorProgressService.NULL_PROGRESS_RUNNER;
	}

	async showWhile(promise: Promise<any>, delay?: number): Promise<void> {
		await promise;
	}
}

class StandaloneProgressService implements IProgressService {

	declare readonly _serviceBrand: undefined;

	withProgress<R>(_options: IProgressOptions | IProgressDialogOptions | IProgressNotificationOptions | IProgressWindowOptions | IProgressCompositeOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>, onDidCancel?: ((choice?: number | undefined) => void) | undefined): Promise<R> {
		return task({
			report: () => { },
		});
	}
}

class StandaloneEnvironmentService implements IEnvironmentService {

	declare readonly _serviceBrand: undefined;

	readonly stateResource: URI = URI.from({ scheme: 'monaco', authority: 'stateResource' });
	readonly userRoamingDataHome: URI = URI.from({ scheme: 'monaco', authority: 'userRoamingDataHome' });
	readonly keyboardLayoutResource: URI = URI.from({ scheme: 'monaco', authority: 'keyboardLayoutResource' });
	readonly argvResource: URI = URI.from({ scheme: 'monaco', authority: 'argvResource' });
	readonly untitledWorkspacesHome: URI = URI.from({ scheme: 'monaco', authority: 'untitledWorkspacesHome' });
	readonly workspaceStorageHome: URI = URI.from({ scheme: 'monaco', authority: 'workspaceStorageHome' });
	readonly localHistoryHome: URI = URI.from({ scheme: 'monaco', authority: 'localHistoryHome' });
	readonly cacheHome: URI = URI.from({ scheme: 'monaco', authority: 'cacheHome' });
	readonly userDataSyncHome: URI = URI.from({ scheme: 'monaco', authority: 'userDataSyncHome' });
	readonly sync: 'on' | 'off' | undefined = undefined;
	readonly continueOn?: string | undefined = undefined;
	readonly editSessionId?: string | undefined = undefined;
	readonly debugExtensionHost: IExtensionHostDebugParams = { port: null, break: false };
	readonly isExtensionDevelopment: boolean = false;
	readonly disableExtensions: boolean | string[] = false;
	readonly enableExtensions?: readonly string[] | undefined = undefined;
	readonly extensionDevelopmentLocationURI?: URI[] | undefined = undefined;
	readonly extensionDevelopmentKind?: ExtensionKind[] | undefined = undefined;
	readonly extensionTestsLocationURI?: URI | undefined = undefined;
	readonly logsHome: URI = URI.from({ scheme: 'monaco', authority: 'logsHome' });
	readonly logLevel?: string | undefined = undefined;
	readonly extensionLogLevel?: [string, string][] | undefined = undefined;
	readonly verbose: boolean = false;
	readonly isBuilt: boolean = false;
	readonly disableTelemetry: boolean = false;
	readonly serviceMachineIdResource: URI = URI.from({ scheme: 'monaco', authority: 'serviceMachineIdResource' });
	readonly policyFile?: URI | undefined = undefined;
}

class StandaloneDialogService implements IDialogService {

	_serviceBrand: undefined;

	readonly onWillShowDialog = Event.None;
	readonly onDidShowDialog = Event.None;

	async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		const confirmed = this.doConfirm(confirmation.message, confirmation.detail);

		return {
			confirmed,
			checkboxChecked: false // unsupported
		};
	}

	private doConfirm(message: string, detail?: string): boolean {
		let messageText = message;
		if (detail) {
			messageText = messageText + '\n\n' + detail;
		}

		return mainWindow.confirm(messageText);
	}

	prompt<T>(prompt: IPromptWithCustomCancel<T>): Promise<IPromptResultWithCancel<T>>;
	prompt<T>(prompt: IPrompt<T>): Promise<IPromptResult<T>>;
	prompt<T>(prompt: IPromptWithDefaultCancel<T>): Promise<IPromptResult<T>>;
	async prompt<T>(prompt: IPrompt<T> | IPromptWithCustomCancel<T>): Promise<IPromptResult<T> | IPromptResultWithCancel<T>> {
		let result: T | undefined = undefined;
		const confirmed = this.doConfirm(prompt.message, prompt.detail);
		if (confirmed) {
			const promptButtons: IPromptBaseButton<T>[] = [...(prompt.buttons ?? [])];
			if (prompt.cancelButton && typeof prompt.cancelButton !== 'string' && typeof prompt.cancelButton !== 'boolean') {
				promptButtons.push(prompt.cancelButton);
			}

			result = await promptButtons[0]?.run({ checkboxChecked: false });
		}

		return { result };
	}

	async info(message: string, detail?: string): Promise<void> {
		await this.prompt({ type: Severity.Info, message, detail });
	}

	async warn(message: string, detail?: string): Promise<void> {
		await this.prompt({ type: Severity.Warning, message, detail });
	}

	async error(message: string, detail?: string): Promise<void> {
		await this.prompt({ type: Severity.Error, message, detail });
	}

	input(): Promise<IInputResult> {
		return Promise.resolve({ confirmed: false }); // unsupported
	}

	about(): Promise<void> {
		return Promise.resolve(undefined);
	}
}

export class StandaloneNotificationService implements INotificationService {

	readonly onDidAddNotification: Event<INotification> = Event.None;

	readonly onDidRemoveNotification: Event<INotification> = Event.None;

	readonly onDidChangeFilter: Event<void> = Event.None;

	public _serviceBrand: undefined;

	private static readonly NO_OP: INotificationHandle = new NoOpNotification();

	public info(message: string): INotificationHandle {
		return this.notify({ severity: Severity.Info, message });
	}

	public warn(message: string): INotificationHandle {
		return this.notify({ severity: Severity.Warning, message });
	}

	public error(error: string | Error): INotificationHandle {
		return this.notify({ severity: Severity.Error, message: error });
	}

	public notify(notification: INotification): INotificationHandle {
		switch (notification.severity) {
			case Severity.Error:
				console.error(notification.message);
				break;
			case Severity.Warning:
				console.warn(notification.message);
				break;
			default:
				console.log(notification.message);
				break;
		}

		return StandaloneNotificationService.NO_OP;
	}

	public prompt(severity: Severity, message: string, choices: IPromptChoice[], options?: IPromptOptions): INotificationHandle {
		return StandaloneNotificationService.NO_OP;
	}

	public status(message: string | Error, options?: IStatusMessageOptions): IDisposable {
		return Disposable.None;
	}


	public setFilter(filter: NotificationsFilter | INotificationSourceFilter): void { }

	public getFilter(source?: INotificationSource): NotificationsFilter {
		return NotificationsFilter.OFF;
	}

	public getFilters(): INotificationSourceFilter[] {
		return [];
	}

	public removeFilter(sourceId: string): void { }
}

export class StandaloneCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	private readonly _instantiationService: IInstantiationService;

	private readonly _onWillExecuteCommand = new Emitter<ICommandEvent>();
	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	public readonly onWillExecuteCommand: Event<ICommandEvent> = this._onWillExecuteCommand.event;
	public readonly onDidExecuteCommand: Event<ICommandEvent> = this._onDidExecuteCommand.event;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this._instantiationService = instantiationService;
	}

	public executeCommand<T>(id: string, ...args: any[]): Promise<T> {
		const command = CommandsRegistry.getCommand(id);
		if (!command) {
			return Promise.reject(new Error(`command '${id}' not found`));
		}

		try {
			this._onWillExecuteCommand.fire({ commandId: id, args });
			const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler, ...args]) as T;

			this._onDidExecuteCommand.fire({ commandId: id, args });
			return Promise.resolve(result);
		} catch (err) {
			return Promise.reject(err);
		}
	}
}

export interface IKeybindingRule {
	keybinding: number;
	command?: string | null;
	commandArgs?: any;
	when?: ContextKeyExpression | null;
}

export class StandaloneKeybindingService extends AbstractKeybindingService {
	private _cachedResolver: KeybindingResolver | null;
	private _dynamicKeybindings: IKeybindingItem[];
	private readonly _domNodeListeners: DomNodeListeners[];

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
		@ILogService logService: ILogService,
		@ICodeEditorService codeEditorService: ICodeEditorService
	) {
		super(contextKeyService, commandService, telemetryService, notificationService, logService);

		this._cachedResolver = null;
		this._dynamicKeybindings = [];
		this._domNodeListeners = [];

		const addContainer = (domNode: HTMLElement) => {
			const disposables = new DisposableStore();

			// for standard keybindings
			disposables.add(dom.addDisposableListener(domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				const keyEvent = new StandardKeyboardEvent(e);
				const shouldPreventDefault = this._dispatch(keyEvent, keyEvent.target);
				if (shouldPreventDefault) {
					keyEvent.preventDefault();
					keyEvent.stopPropagation();
				}
			}));

			// for single modifier chord keybindings (e.g. shift shift)
			disposables.add(dom.addDisposableListener(domNode, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
				const keyEvent = new StandardKeyboardEvent(e);
				const shouldPreventDefault = this._singleModifierDispatch(keyEvent, keyEvent.target);
				if (shouldPreventDefault) {
					keyEvent.preventDefault();
				}
			}));

			this._domNodeListeners.push(new DomNodeListeners(domNode, disposables));
		};
		const removeContainer = (domNode: HTMLElement) => {
			for (let i = 0; i < this._domNodeListeners.length; i++) {
				const domNodeListeners = this._domNodeListeners[i];
				if (domNodeListeners.domNode === domNode) {
					this._domNodeListeners.splice(i, 1);
					domNodeListeners.dispose();
				}
			}
		};

		const addCodeEditor = (codeEditor: ICodeEditor) => {
			if (codeEditor.getOption(EditorOption.inDiffEditor)) {
				return;
			}
			addContainer(codeEditor.getContainerDomNode());
		};
		const removeCodeEditor = (codeEditor: ICodeEditor) => {
			if (codeEditor.getOption(EditorOption.inDiffEditor)) {
				return;
			}
			removeContainer(codeEditor.getContainerDomNode());
		};
		this._register(codeEditorService.onCodeEditorAdd(addCodeEditor));
		this._register(codeEditorService.onCodeEditorRemove(removeCodeEditor));
		codeEditorService.listCodeEditors().forEach(addCodeEditor);

		const addDiffEditor = (diffEditor: IDiffEditor) => {
			addContainer(diffEditor.getContainerDomNode());
		};
		const removeDiffEditor = (diffEditor: IDiffEditor) => {
			removeContainer(diffEditor.getContainerDomNode());
		};
		this._register(codeEditorService.onDiffEditorAdd(addDiffEditor));
		this._register(codeEditorService.onDiffEditorRemove(removeDiffEditor));
		codeEditorService.listDiffEditors().forEach(addDiffEditor);
	}

	public addDynamicKeybinding(command: string, keybinding: number, handler: ICommandHandler, when: ContextKeyExpression | undefined): IDisposable {
		return combinedDisposable(
			CommandsRegistry.registerCommand(command, handler),
			this.addDynamicKeybindings([{
				keybinding,
				command,
				when
			}])
		);
	}

	public addDynamicKeybindings(rules: IKeybindingRule[]): IDisposable {
		const entries: IKeybindingItem[] = rules.map((rule) => {
			const keybinding = decodeKeybinding(rule.keybinding, OS);
			return {
				keybinding,
				command: rule.command ?? null,
				commandArgs: rule.commandArgs,
				when: rule.when,
				weight1: 1000,
				weight2: 0,
				extensionId: null,
				isBuiltinExtension: false
			};
		});
		this._dynamicKeybindings = this._dynamicKeybindings.concat(entries);

		this.updateResolver();

		return toDisposable(() => {
			// Search the first entry and remove them all since they will be contiguous
			for (let i = 0; i < this._dynamicKeybindings.length; i++) {
				if (this._dynamicKeybindings[i] === entries[0]) {
					this._dynamicKeybindings.splice(i, entries.length);
					this.updateResolver();
					return;
				}
			}
		});
	}

	private updateResolver(): void {
		this._cachedResolver = null;
		this._onDidUpdateKeybindings.fire();
	}

	protected _getResolver(): KeybindingResolver {
		if (!this._cachedResolver) {
			const defaults = this._toNormalizedKeybindingItems(KeybindingsRegistry.getDefaultKeybindings(), true);
			const overrides = this._toNormalizedKeybindingItems(this._dynamicKeybindings, false);
			this._cachedResolver = new KeybindingResolver(defaults, overrides, (str) => this._log(str));
		}
		return this._cachedResolver;
	}

	protected _documentHasFocus(): boolean {
		return mainWindow.document.hasFocus();
	}

	private _toNormalizedKeybindingItems(items: IKeybindingItem[], isDefault: boolean): ResolvedKeybindingItem[] {
		const result: ResolvedKeybindingItem[] = [];
		let resultLen = 0;
		for (const item of items) {
			const when = item.when || undefined;
			const keybinding = item.keybinding;

			if (!keybinding) {
				// This might be a removal keybinding item in user settings => accept it
				result[resultLen++] = new ResolvedKeybindingItem(undefined, item.command, item.commandArgs, when, isDefault, null, false);
			} else {
				const resolvedKeybindings = USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS);
				for (const resolvedKeybinding of resolvedKeybindings) {
					result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, null, false);
				}
			}
		}

		return result;
	}

	public resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[] {
		return USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS);
	}

	public resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding {
		const chord = new KeyCodeChord(
			keyboardEvent.ctrlKey,
			keyboardEvent.shiftKey,
			keyboardEvent.altKey,
			keyboardEvent.metaKey,
			keyboardEvent.keyCode
		);
		return new USLayoutResolvedKeybinding([chord], OS);
	}

	public resolveUserBinding(userBinding: string): ResolvedKeybinding[] {
		return [];
	}

	public _dumpDebugInfo(): string {
		return '';
	}

	public _dumpDebugInfoJSON(): string {
		return '';
	}

	public registerSchemaContribution(contribution: KeybindingsSchemaContribution): void {
		// noop
	}

	/**
	 * not yet supported
	 */
	public override enableKeybindingHoldMode(commandId: string): Promise<void> | undefined {
		return undefined;
	}
}

class DomNodeListeners extends Disposable {
	constructor(
		public readonly domNode: HTMLElement,
		disposables: DisposableStore
	) {
		super();
		this._register(disposables);
	}
}

function isConfigurationOverrides(thing: any): thing is IConfigurationOverrides {
	return thing
		&& typeof thing === 'object'
		&& (!thing.overrideIdentifier || typeof thing.overrideIdentifier === 'string')
		&& (!thing.resource || thing.resource instanceof URI);
}

export class StandaloneConfigurationService implements IConfigurationService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConfiguration = new Emitter<IConfigurationChangeEvent>();
	public readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	private readonly _configuration: Configuration;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		const defaultConfiguration = new DefaultConfiguration(logService);
		this._configuration = new Configuration(
			defaultConfiguration.reload(),
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			new ResourceMap<ConfigurationModel>(),
			ConfigurationModel.createEmptyModel(logService),
			new ResourceMap<ConfigurationModel>(),
			logService
		);
		defaultConfiguration.dispose();
	}

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: any, arg2?: any): any {
		const section = typeof arg1 === 'string' ? arg1 : undefined;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : {};
		return this._configuration.getValue(section, overrides, undefined);
	}

	public updateValues(values: [string, any][]): Promise<void> {
		const previous = { data: this._configuration.toData() };

		const changedKeys: string[] = [];

		for (const entry of values) {
			const [key, value] = entry;
			if (this.getValue(key) === value) {
				continue;
			}
			this._configuration.updateValue(key, value);
			changedKeys.push(key);
		}

		if (changedKeys.length > 0) {
			const configurationChangeEvent = new ConfigurationChangeEvent({ keys: changedKeys, overrides: [] }, previous, this._configuration, undefined, this.logService);
			configurationChangeEvent.source = ConfigurationTarget.MEMORY;
			this._onDidChangeConfiguration.fire(configurationChangeEvent);
		}

		return Promise.resolve();
	}

	public updateValue(key: string, value: any, arg3?: any, arg4?: any): Promise<void> {
		return this.updateValues([[key, value]]);
	}

	public inspect<C>(key: string, options: IConfigurationOverrides = {}): IConfigurationValue<C> {
		return this._configuration.inspect<C>(key, options, undefined);
	}

	public keys() {
		return this._configuration.keys(undefined);
	}

	public reloadConfiguration(): Promise<void> {
		return Promise.resolve(undefined);
	}

	public getConfigurationData(): IConfigurationData | null {
		const emptyModel: IConfigurationModel = {
			contents: {},
			keys: [],
			overrides: []
		};
		return {
			defaults: emptyModel,
			policy: emptyModel,
			application: emptyModel,
			user: emptyModel,
			workspace: emptyModel,
			folders: []
		};
	}
}

class StandaloneResourceConfigurationService implements ITextResourceConfigurationService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConfiguration = new Emitter<ITextResourceConfigurationChangeEvent>();
	public readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	constructor(
		@IConfigurationService private readonly configurationService: StandaloneConfigurationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService
	) {
		this.configurationService.onDidChangeConfiguration((e) => {
			this._onDidChangeConfiguration.fire({ affectedKeys: e.affectedKeys, affectsConfiguration: (resource: URI, configuration: string) => e.affectsConfiguration(configuration) });
		});
	}

	getValue<T>(resource: URI, section?: string): T;
	getValue<T>(resource: URI, position?: IPosition, section?: string): T;
	getValue<T>(resource: URI | undefined, arg2?: any, arg3?: any) {
		const position: IPosition | null = Pos.isIPosition(arg2) ? arg2 : null;
		const section: string | undefined = position ? (typeof arg3 === 'string' ? arg3 : undefined) : (typeof arg2 === 'string' ? arg2 : undefined);
		const language = resource ? this.getLanguage(resource, position) : undefined;
		if (typeof section === 'undefined') {
			return this.configurationService.getValue<T>({
				resource,
				overrideIdentifier: language
			});
		}
		return this.configurationService.getValue<T>(section, {
			resource,
			overrideIdentifier: language
		});
	}

	inspect<T>(resource: URI | undefined, position: IPosition | null, section: string): IConfigurationValue<Readonly<T>> {
		const language = resource ? this.getLanguage(resource, position) : undefined;
		return this.configurationService.inspect<T>(section, { resource, overrideIdentifier: language });
	}

	private getLanguage(resource: URI, position: IPosition | null): string | null {
		const model = this.modelService.getModel(resource);
		if (model) {
			return position ? model.getLanguageIdAtPosition(position.lineNumber, position.column) : model.getLanguageId();
		}
		return this.languageService.guessLanguageIdByFilepathOrFirstLine(resource);
	}

	updateValue(resource: URI, key: string, value: any, configurationTarget?: ConfigurationTarget): Promise<void> {
		return this.configurationService.updateValue(key, value, { resource }, configurationTarget);
	}
}

class StandaloneResourcePropertiesService implements ITextResourcePropertiesService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
	}

	getEOL(resource: URI, language?: string): string {
		const eol = this.configurationService.getValue('files.eol', { overrideIdentifier: language, resource });
		if (eol && typeof eol === 'string' && eol !== 'auto') {
			return eol;
		}
		return (isLinux || isMacintosh) ? '\n' : '\r\n';
	}
}

class StandaloneTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.NONE;
	readonly sessionId = 'someValue.sessionId';
	readonly machineId = 'someValue.machineId';
	readonly sqmId = 'someValue.sqmId';
	readonly devDeviceId = 'someValue.devDeviceId';
	readonly firstSessionDate = 'someValue.firstSessionDate';
	readonly sendErrorTelemetry = false;
	setEnabled(): void { }
	setExperimentProperty(): void { }
	publicLog() { }
	publicLog2() { }
	publicLogError() { }
	publicLogError2() { }
}

class StandaloneWorkspaceContextService implements IWorkspaceContextService {

	public _serviceBrand: undefined;

	private static readonly SCHEME = 'inmemory';

	private readonly _onDidChangeWorkspaceName = new Emitter<void>();
	public readonly onDidChangeWorkspaceName: Event<void> = this._onDidChangeWorkspaceName.event;

	private readonly _onWillChangeWorkspaceFolders = new Emitter<IWorkspaceFoldersWillChangeEvent>();
	public readonly onWillChangeWorkspaceFolders: Event<IWorkspaceFoldersWillChangeEvent> = this._onWillChangeWorkspaceFolders.event;

	private readonly _onDidChangeWorkspaceFolders = new Emitter<IWorkspaceFoldersChangeEvent>();
	public readonly onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent> = this._onDidChangeWorkspaceFolders.event;

	private readonly _onDidChangeWorkbenchState = new Emitter<WorkbenchState>();
	public readonly onDidChangeWorkbenchState: Event<WorkbenchState> = this._onDidChangeWorkbenchState.event;

	private readonly workspace: IWorkspace;

	constructor() {
		const resource = URI.from({ scheme: StandaloneWorkspaceContextService.SCHEME, authority: 'model', path: '/' });
		this.workspace = { id: STANDALONE_EDITOR_WORKSPACE_ID, folders: [new WorkspaceFolder({ uri: resource, name: '', index: 0 })] };
	}

	getCompleteWorkspace(): Promise<IWorkspace> {
		return Promise.resolve(this.getWorkspace());
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}

	public getWorkbenchState(): WorkbenchState {
		if (this.workspace) {
			if (this.workspace.configuration) {
				return WorkbenchState.WORKSPACE;
			}
			return WorkbenchState.FOLDER;
		}
		return WorkbenchState.EMPTY;
	}

	public getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
		return resource && resource.scheme === StandaloneWorkspaceContextService.SCHEME ? this.workspace.folders[0] : null;
	}

	public isInsideWorkspace(resource: URI): boolean {
		return resource && resource.scheme === StandaloneWorkspaceContextService.SCHEME;
	}

	public isCurrentWorkspace(workspaceIdOrFolder: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI): boolean {
		return true;
	}
}

export function updateConfigurationService(configurationService: IConfigurationService, source: any, isDiffEditor: boolean): void {
	if (!source) {
		return;
	}
	if (!(configurationService instanceof StandaloneConfigurationService)) {
		return;
	}
	const toUpdate: [string, any][] = [];
	Object.keys(source).forEach((key) => {
		if (isEditorConfigurationKey(key)) {
			toUpdate.push([`editor.${key}`, source[key]]);
		}
		if (isDiffEditor && isDiffEditorConfigurationKey(key)) {
			toUpdate.push([`diffEditor.${key}`, source[key]]);
		}
	});
	if (toUpdate.length > 0) {
		configurationService.updateValues(toUpdate);
	}
}

class StandaloneBulkEditService implements IBulkEditService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IModelService private readonly _modelService: IModelService
	) {
		//
	}

	hasPreviewHandler(): false {
		return false;
	}

	setPreviewHandler(): IDisposable {
		return Disposable.None;
	}

	async apply(editsIn: ResourceEdit[] | WorkspaceEdit, _options?: IBulkEditOptions): Promise<IBulkEditResult> {
		const edits = Array.isArray(editsIn) ? editsIn : ResourceEdit.convert(editsIn);
		const textEdits = new Map<ITextModel, ISingleEditOperation[]>();

		for (const edit of edits) {
			if (!(edit instanceof ResourceTextEdit)) {
				throw new Error('bad edit - only text edits are supported');
			}
			const model = this._modelService.getModel(edit.resource);
			if (!model) {
				throw new Error('bad edit - model not found');
			}
			if (typeof edit.versionId === 'number' && model.getVersionId() !== edit.versionId) {
				throw new Error('bad state - model changed in the meantime');
			}
			let array = textEdits.get(model);
			if (!array) {
				array = [];
				textEdits.set(model, array);
			}
			array.push(EditOperation.replaceMove(Range.lift(edit.textEdit.range), edit.textEdit.text));
		}


		let totalEdits = 0;
		let totalFiles = 0;
		for (const [model, edits] of textEdits) {
			model.pushStackElement();
			model.pushEditOperations([], edits, () => []);
			model.pushStackElement();
			totalFiles += 1;
			totalEdits += edits.length;
		}

		return {
			ariaSummary: strings.format(StandaloneServicesNLS.bulkEditServiceSummary, totalEdits, totalFiles),
			isApplied: totalEdits > 0
		};
	}
}

class StandaloneUriLabelService implements ILabelService {

	declare readonly _serviceBrand: undefined;

	public readonly onDidChangeFormatters: Event<IFormatterChangeEvent> = Event.None;

	public getUriLabel(resource: URI, options?: { relative?: boolean; forceNoTildify?: boolean }): string {
		if (resource.scheme === 'file') {
			return resource.fsPath;
		}
		return resource.path;
	}

	getUriBasenameLabel(resource: URI): string {
		return basename(resource);
	}

	public getWorkspaceLabel(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI | IWorkspace, options?: { verbose: Verbosity }): string {
		return '';
	}

	public getSeparator(scheme: string, authority?: string): '/' | '\\' {
		return '/';
	}

	public registerFormatter(formatter: ResourceLabelFormatter): IDisposable {
		throw new Error('Not implemented');
	}

	public registerCachedFormatter(formatter: ResourceLabelFormatter): IDisposable {
		return this.registerFormatter(formatter);
	}

	public getHostLabel(): string {
		return '';
	}

	public getHostTooltip(): string | undefined {
		return undefined;
	}
}


class StandaloneContextViewService extends ContextViewService {

	constructor(
		@ILayoutService layoutService: ILayoutService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
	) {
		super(layoutService);
	}

	override showContextView(delegate: IContextViewDelegate, container?: HTMLElement, shadowRoot?: boolean): IOpenContextView {
		if (!container) {
			const codeEditor = this._codeEditorService.getFocusedCodeEditor() || this._codeEditorService.getActiveCodeEditor();
			if (codeEditor) {
				container = codeEditor.getContainerDomNode();
			}
		}
		return super.showContextView(delegate, container, shadowRoot);
	}
}

class StandaloneWorkspaceTrustManagementService implements IWorkspaceTrustManagementService {
	_serviceBrand: undefined;

	private _neverEmitter = new Emitter<never>();
	public readonly onDidChangeTrust: Event<boolean> = this._neverEmitter.event;
	onDidChangeTrustedFolders: Event<void> = this._neverEmitter.event;
	public readonly workspaceResolved = Promise.resolve();
	public readonly workspaceTrustInitialized = Promise.resolve();
	public readonly acceptsOutOfWorkspaceFiles = true;

	isWorkspaceTrusted(): boolean {
		return true;
	}
	isWorkspaceTrustForced(): boolean {
		return false;
	}
	canSetParentFolderTrust(): boolean {
		return false;
	}
	async setParentFolderTrust(trusted: boolean): Promise<void> {
		// noop
	}
	canSetWorkspaceTrust(): boolean {
		return false;
	}
	async setWorkspaceTrust(trusted: boolean): Promise<void> {
		// noop
	}
	getUriTrustInfo(uri: URI): Promise<IWorkspaceTrustUriInfo> {
		throw new Error('Method not supported.');
	}
	async setUrisTrust(uri: URI[], trusted: boolean): Promise<void> {
		// noop
	}
	getTrustedUris(): URI[] {
		return [];
	}
	async setTrustedUris(uris: URI[]): Promise<void> {
		// noop
	}
	addWorkspaceTrustTransitionParticipant(participant: IWorkspaceTrustTransitionParticipant): IDisposable {
		throw new Error('Method not supported.');
	}
}

class StandaloneLanguageService extends LanguageService {
	constructor() {
		super();
	}
}

class StandaloneLogService extends LogService {
	constructor() {
		super(new ConsoleLogger());
	}
}

class StandaloneContextMenuService extends ContextMenuService {
	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
		@IContextViewService contextViewService: IContextViewService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(telemetryService, notificationService, contextViewService, keybindingService, menuService, contextKeyService);
		this.configure({ blockMouse: false }); // we do not want that in the standalone editor
	}
}

export const standaloneEditorWorkerDescriptor: IWorkerDescriptor = {
	amdModuleId: 'vs/editor/common/services/editorSimpleWorker',
	esmModuleLocation: undefined,
	label: 'editorWorkerService'
};

class StandaloneEditorWorkerService extends EditorWorkerService {
	constructor(
		@IModelService modelService: IModelService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@ILogService logService: ILogService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super(standaloneEditorWorkerDescriptor, modelService, configurationService, logService, languageConfigurationService, languageFeaturesService);
	}
}

class StandaloneAccessbilitySignalService implements IAccessibilitySignalService {
	_serviceBrand: undefined;
	async playSignal(cue: AccessibilitySignal, options: {}): Promise<void> {
	}

	async playSignals(cues: AccessibilitySignal[]): Promise<void> {
	}

	getEnabledState(signal: AccessibilitySignal, userGesture: boolean, modality?: AccessibilityModality | undefined): IValueWithChangeEvent<boolean> {
		return ValueWithChangeEvent.const(false);
	}

	getDelayMs(signal: AccessibilitySignal, modality: AccessibilityModality): number {
		return 0;
	}

	isSoundEnabled(cue: AccessibilitySignal): boolean {
		return false;
	}

	isAnnouncementEnabled(cue: AccessibilitySignal): boolean {
		return false;
	}

	onSoundEnabledChanged(cue: AccessibilitySignal): Event<void> {
		return Event.None;
	}

	async playSound(cue: Sound, allowManyInParallel?: boolean | undefined): Promise<void> {
	}
	playSignalLoop(cue: AccessibilitySignal): IDisposable {
		return toDisposable(() => { });
	}
}

export interface IEditorOverrideServices {
	[index: string]: any;
}

registerSingleton(ILogService, StandaloneLogService, InstantiationType.Eager);
registerSingleton(IConfigurationService, StandaloneConfigurationService, InstantiationType.Eager);
registerSingleton(ITextResourceConfigurationService, StandaloneResourceConfigurationService, InstantiationType.Eager);
registerSingleton(ITextResourcePropertiesService, StandaloneResourcePropertiesService, InstantiationType.Eager);
registerSingleton(IWorkspaceContextService, StandaloneWorkspaceContextService, InstantiationType.Eager);
registerSingleton(ILabelService, StandaloneUriLabelService, InstantiationType.Eager);
registerSingleton(ITelemetryService, StandaloneTelemetryService, InstantiationType.Eager);
registerSingleton(IDialogService, StandaloneDialogService, InstantiationType.Eager);
registerSingleton(IEnvironmentService, StandaloneEnvironmentService, InstantiationType.Eager);
registerSingleton(INotificationService, StandaloneNotificationService, InstantiationType.Eager);
registerSingleton(IMarkerService, MarkerService, InstantiationType.Eager);
registerSingleton(ILanguageService, StandaloneLanguageService, InstantiationType.Eager);
registerSingleton(IStandaloneThemeService, StandaloneThemeService, InstantiationType.Eager);
registerSingleton(IModelService, ModelService, InstantiationType.Eager);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService, InstantiationType.Eager);
registerSingleton(IContextKeyService, ContextKeyService, InstantiationType.Eager);
registerSingleton(IProgressService, StandaloneProgressService, InstantiationType.Eager);
registerSingleton(IEditorProgressService, StandaloneEditorProgressService, InstantiationType.Eager);
registerSingleton(IStorageService, InMemoryStorageService, InstantiationType.Eager);
registerSingleton(IEditorWorkerService, StandaloneEditorWorkerService, InstantiationType.Eager);
registerSingleton(IBulkEditService, StandaloneBulkEditService, InstantiationType.Eager);
registerSingleton(IWorkspaceTrustManagementService, StandaloneWorkspaceTrustManagementService, InstantiationType.Eager);
registerSingleton(ITextModelService, StandaloneTextModelService, InstantiationType.Eager);
registerSingleton(IAccessibilityService, AccessibilityService, InstantiationType.Eager);
registerSingleton(IListService, ListService, InstantiationType.Eager);
registerSingleton(ICommandService, StandaloneCommandService, InstantiationType.Eager);
registerSingleton(IKeybindingService, StandaloneKeybindingService, InstantiationType.Eager);
registerSingleton(IQuickInputService, StandaloneQuickInputService, InstantiationType.Eager);
registerSingleton(IContextViewService, StandaloneContextViewService, InstantiationType.Eager);
registerSingleton(IOpenerService, OpenerService, InstantiationType.Eager);
registerSingleton(IClipboardService, BrowserClipboardService, InstantiationType.Eager);
registerSingleton(IContextMenuService, StandaloneContextMenuService, InstantiationType.Eager);
registerSingleton(IMenuService, MenuService, InstantiationType.Eager);
registerSingleton(IAccessibilitySignalService, StandaloneAccessbilitySignalService, InstantiationType.Eager);
registerSingleton(ITreeSitterParserService, StandaloneTreeSitterParserService, InstantiationType.Eager);

/**
 * We don't want to eagerly instantiate services because embedders get a one time chance
 * to override services when they create the first editor.
 */
export module StandaloneServices {

	const serviceCollection = new ServiceCollection();
	for (const [id, descriptor] of getSingletonServiceDescriptors()) {
		serviceCollection.set(id, descriptor);
	}

	const instantiationService = new InstantiationService(serviceCollection, true);
	serviceCollection.set(IInstantiationService, instantiationService);

	export function get<T>(serviceId: ServiceIdentifier<T>): T {
		if (!initialized) {
			initialize({});
		}
		const r = serviceCollection.get(serviceId);
		if (!r) {
			throw new Error('Missing service ' + serviceId);
		}
		if (r instanceof SyncDescriptor) {
			return instantiationService.invokeFunction((accessor) => accessor.get(serviceId));
		} else {
			return r;
		}
	}

	let initialized = false;
	const onDidInitialize = new Emitter<void>();
	export function initialize(overrides: IEditorOverrideServices): IInstantiationService {
		if (initialized) {
			return instantiationService;
		}
		initialized = true;

		// Add singletons that were registered after this module loaded
		for (const [id, descriptor] of getSingletonServiceDescriptors()) {
			if (!serviceCollection.get(id)) {
				serviceCollection.set(id, descriptor);
			}
		}

		// Initialize the service collection with the overrides, but only if the
		// service was not instantiated in the meantime.
		for (const serviceId in overrides) {
			if (overrides.hasOwnProperty(serviceId)) {
				const serviceIdentifier = createDecorator(serviceId);
				const r = serviceCollection.get(serviceIdentifier);
				if (r instanceof SyncDescriptor) {
					serviceCollection.set(serviceIdentifier, overrides[serviceId]);
				}
			}
		}

		// Instantiate all editor features
		const editorFeatures = getEditorFeatures();
		for (const feature of editorFeatures) {
			try {
				instantiationService.createInstance(feature);
			} catch (err) {
				onUnexpectedError(err);
			}
		}

		onDidInitialize.fire();

		return instantiationService;
	}

	/**
	 * Executes callback once services are initialized.
	 */
	export function withServices(callback: () => IDisposable): IDisposable {
		if (initialized) {
			return callback();
		}

		const disposable = new DisposableStore();

		const listener = disposable.add(onDidInitialize.event(() => {
			listener.dispose();
			disposable.add(callback());
		}));

		return disposable;
	}

}
