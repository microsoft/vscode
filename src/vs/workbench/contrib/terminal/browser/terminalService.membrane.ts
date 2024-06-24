/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from 'vs/base/common/decorators';
import { Event, IDynamicListEventMultiplexer } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICreateContributedTerminalProfileOptions, ITerminalBackend, ITerminalLaunchError, TerminalLocation, TerminalLocationString } from 'vs/platform/terminal/common/terminal';
import { IEditableData } from 'vs/workbench/common/views';
import { ICreateTerminalOptions, IDetachedTerminalInstance, IDetachedXTermOptions, ITerminalConfigHelper, ITerminalGroup, ITerminalInstance, ITerminalInstanceHost, ITerminalLocationOptions, ITerminalService, ITerminalServiceNativeDelegate, TerminalConnectionState } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IRemoteTerminalAttachTarget, IStartExtensionTerminalRequest, ITerminalProcessExtHostProxy } from 'vs/workbench/contrib/terminal/common/terminal';
import { ACTIVE_GROUP_TYPE, AUX_WINDOW_GROUP_TYPE, SIDE_GROUP_TYPE } from 'vs/workbench/services/editor/common/editorService';
import { ITerminalCapabilityImplMap, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { GroupIdentifier } from 'vs/workbench/common/editor';

export class TerminalService extends Disposable implements ITerminalService {
	readonly _serviceBrand: undefined;

	get isProcessSupportRegistered(): boolean { throw new Error('Unsupported'); }

	get connectionState(): TerminalConnectionState { throw new Error('Unsupported'); }

	// Never resolve
	get whenConnected(): Promise<void> { return new Promise(() => { }); }

	get restoredGroupCount(): number { throw new Error('Unsupported'); }

	get configHelper(): ITerminalConfigHelper { throw new Error('Unsupported'); }
	get instances(): ITerminalInstance[] {

		throw new Error('Unsupported');
	}
	get detachedInstances(): Iterable<IDetachedTerminalInstance> {
		throw new Error('Unsupported');
	}


	getReconnectedTerminals(_reconnectionOwner: string): ITerminalInstance[] | undefined {
		return undefined;
	}

	get defaultLocation(): TerminalLocation { return this.configHelper.config.defaultLocation === TerminalLocationString.Editor ? TerminalLocation.Editor : TerminalLocation.Panel; }

	get activeInstance(): ITerminalInstance | undefined {
		return undefined;
	}

	get onDidCreateInstance(): Event<ITerminalInstance> { throw new Error('Unsupported'); }
	get onDidChangeInstanceDimensions(): Event<ITerminalInstance> { throw new Error('Unsupported'); }
	get onDidRegisterProcessSupport(): Event<void> { throw new Error('Unsupported'); }
	get onDidChangeConnectionState(): Event<void> { throw new Error('Unsupported'); }
	get onDidRequestStartExtensionTerminal(): Event<IStartExtensionTerminalRequest> { throw new Error('Unsupported'); }

	// ITerminalInstanceHost events
	get onDidDisposeInstance(): Event<ITerminalInstance> { throw new Error('Unsupported'); }
	get onDidFocusInstance(): Event<ITerminalInstance> { throw new Error('Unsupported'); }
	get onDidChangeActiveInstance(): Event<ITerminalInstance | undefined> { throw new Error('Unsupported'); }
	get onDidChangeInstances(): Event<void> { throw new Error('Unsupported'); }
	get onDidChangeInstanceCapability(): Event<ITerminalInstance> { throw new Error('Unsupported'); }

	// Terminal view events
	get onDidChangeActiveGroup(): Event<ITerminalGroup | undefined> { throw new Error('Unsupported'); }

	// Lazily initialized events that fire when the specified event fires on _any_ terminal
	@memoize get onAnyInstanceDataInput() { return this.createOnInstanceEvent(e => e.onDidInputData); }
	@memoize get onAnyInstanceIconChange() { return this.createOnInstanceEvent(e => e.onIconChanged); }
	@memoize get onAnyInstanceMaximumDimensionsChange() { return this.createOnInstanceEvent(e => Event.map(e.onMaximumDimensionsChanged, () => e, e.store)); }
	@memoize get onAnyInstancePrimaryStatusChange() { return this.createOnInstanceEvent(e => Event.map(e.statusList.onDidChangePrimaryStatus, () => e, e.store)); }
	@memoize get onAnyInstanceProcessIdReady() { return this.createOnInstanceEvent(e => e.onProcessIdReady); }
	@memoize get onAnyInstanceSelectionChange() { return this.createOnInstanceEvent(e => e.onDidChangeSelection); }
	@memoize get onAnyInstanceTitleChange() { return this.createOnInstanceEvent(e => e.onTitleChanged); }

	constructor(
		// @IContextKeyService private _contextKeyService: IContextKeyService,
		// @ILifecycleService private readonly _lifecycleService: ILifecycleService,
		// @ITerminalLogService private readonly _logService: ITerminalLogService,
		// @IDialogService private _dialogService: IDialogService,
		// @IInstantiationService private _instantiationService: IInstantiationService,
		// @IRemoteAgentService private _remoteAgentService: IRemoteAgentService,
		// @IViewsService private _viewsService: IViewsService,
		// @IConfigurationService private readonly _configurationService: IConfigurationService,
		// @IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		// @ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		// @ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		// @ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService,
		// @IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		// @ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		// @IExtensionService private readonly _extensionService: IExtensionService,
		// @INotificationService private readonly _notificationService: INotificationService,
		// @IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		// @ICommandService private readonly _commandService: ICommandService,
		// @IKeybindingService private readonly _keybindingService: IKeybindingService,
		// @ITimerService private readonly _timerService: ITimerService
		...args: any[]
	) {
		super();

	}

	async showProfileQuickPick(type: 'setDefault' | 'createInstance', cwd?: string | URI): Promise<ITerminalInstance | undefined> {
		throw new Error('Unsupported');
	}

	async initializePrimaryBackend() {
		throw new Error('Unsupported');
	}

	getPrimaryBackend(): ITerminalBackend | undefined {
		throw new Error('Unsupported');
	}

	setActiveInstance(value: ITerminalInstance) {
		throw new Error('Unsupported');
	}

	async focusActiveInstance(): Promise<void> {
		throw new Error('Unsupported');
	}

	async createContributedTerminalProfile(extensionIdentifier: string, id: string, options: ICreateContributedTerminalProfileOptions): Promise<void> {
		throw new Error('Unsupported');
	}

	async safeDisposeTerminal(instance: ITerminalInstance): Promise<void> {
		throw new Error('Unsupported');
	}

	async getActiveOrCreateInstance(options?: { acceptsInput?: boolean }): Promise<ITerminalInstance> {
		throw new Error('Unsupported');
	}

	async revealActiveTerminal(preserveFocus?: boolean): Promise<void> {
		throw new Error('Unsupported');
	}

	setEditable(instance: ITerminalInstance, data?: IEditableData | null): void {
		throw new Error('Unsupported');
	}

	isEditable(instance: ITerminalInstance | undefined): boolean {
		throw new Error('Unsupported');
	}

	getEditableData(instance: ITerminalInstance): IEditableData | undefined {
		throw new Error('Unsupported');
	}

	requestStartExtensionTerminal(proxy: ITerminalProcessExtHostProxy, cols: number, rows: number): Promise<ITerminalLaunchError | undefined> {
		throw new Error('Unsupported');
	}

	setNativeDelegate(nativeDelegate: ITerminalServiceNativeDelegate): void {
		throw new Error('Unsupported');
	}

	refreshActiveGroup(): void {
		throw new Error('Unsupported');
	}

	getInstanceFromId(terminalId: number): ITerminalInstance | undefined {
		throw new Error('Unsupported');
	}

	getInstanceFromIndex(terminalIndex: number): ITerminalInstance {
		throw new Error('Unsupported');
	}

	getInstanceFromResource(resource: URI | undefined): ITerminalInstance | undefined {
		throw new Error('Unsupported');
	}

	isAttachedToTerminal(remoteTerm: IRemoteTerminalAttachTarget): boolean {
		throw new Error('Unsupported');
	}

	moveToEditor(source: ITerminalInstance, group?: GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE): void {
		throw new Error('Unsupported');
	}

	moveIntoNewEditor(source: ITerminalInstance): void {
		throw new Error('Unsupported');
	}

	async moveToTerminalView(source?: ITerminalInstance | URI, target?: ITerminalInstance, side?: 'before' | 'after'): Promise<void> {
		throw new Error('Unsupported');
	}

	registerProcessSupport(isSupported: boolean): void {
		throw new Error('Unsupported');
	}

	protected async _showTerminalCloseConfirmation(singleTerminal?: boolean): Promise<boolean> {
		throw new Error('Unsupported');
	}

	getDefaultInstanceHost(): ITerminalInstanceHost {
		throw new Error('Unsupported');
	}

	async getInstanceHost(location: ITerminalLocationOptions | undefined): Promise<ITerminalInstanceHost> {
		throw new Error('Unsupported');
	}

	async createTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance> {
		throw new Error('Unsupported');
	}

	async createDetachedTerminal(options: IDetachedXTermOptions): Promise<IDetachedTerminalInstance> {
		throw new Error('Unsupported');
	}

	async resolveLocation(location?: ITerminalLocationOptions): Promise<TerminalLocation | undefined> {
		throw new Error('Unsupported');
	}

	async setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): Promise<void> {
		throw new Error('Unsupported');
	}

	getEditingTerminal(): ITerminalInstance | undefined {
		return undefined;
	}

	setEditingTerminal(instance: ITerminalInstance | undefined) {
		return undefined;
	}

	createOnInstanceEvent<T>(getEvent: (instance: ITerminalInstance) => Event<T>): Event<T> {
		throw new Error('Unsupported');
	}

	createOnInstanceCapabilityEvent<T extends TerminalCapability, K>(capabilityId: T, getEvent: (capability: ITerminalCapabilityImplMap[T]) => Event<K>): IDynamicListEventMultiplexer<{ instance: ITerminalInstance; data: K }> {
		throw new Error('Unsupported');
	}
}
