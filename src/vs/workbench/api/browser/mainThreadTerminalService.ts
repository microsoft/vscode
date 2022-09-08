/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ExtHostContext, ExtHostTerminalServiceShape, MainThreadTerminalServiceShape, MainContext, TerminalLaunchConfig, ITerminalDimensionsDto, ExtHostTerminalIdentifier } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { URI } from 'vs/base/common/uri';
import { StopWatch } from 'vs/base/common/stopwatch';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProcessProperty, IShellLaunchConfig, IShellLaunchConfigDto, ProcessPropertyType, TerminalExitReason, TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { TerminalDataBufferer } from 'vs/platform/terminal/common/terminalDataBuffering';
import { ITerminalEditorService, ITerminalExternalLinkProvider, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalLink, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalProcessExtHostProxy } from 'vs/workbench/contrib/terminal/browser/terminalProcessExtHostProxy';
import { IEnvironmentVariableService, ISerializableEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { deserializeEnvironmentVariableCollection, serializeEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableShared';
import { IStartExtensionTerminalRequest, ITerminalProcessExtHostProxy, ITerminalProfileResolverService, ITerminalProfileService } from 'vs/workbench/contrib/terminal/common/terminal';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { withNullAsUndefined } from 'vs/base/common/types';
import { OperatingSystem, OS } from 'vs/base/common/platform';
import { TerminalEditorLocationOptions } from 'vscode';
import { Promises } from 'vs/base/common/async';

@extHostNamedCustomer(MainContext.MainThreadTerminalService)
export class MainThreadTerminalService implements MainThreadTerminalServiceShape {

	private _proxy: ExtHostTerminalServiceShape;
	/**
	 * Stores a map from a temporary terminal id (a UUID generated on the extension host side)
	 * to a numeric terminal id (an id generated on the renderer side)
	 * This comes in play only when dealing with terminals created on the extension host side
	 */
	private _extHostTerminals = new Map<string, Promise<ITerminalInstance>>();
	private readonly _toDispose = new DisposableStore();
	private readonly _terminalProcessProxies = new Map<number, ITerminalProcessExtHostProxy>();
	private readonly _profileProviders = new Map<string, IDisposable>();
	private _dataEventTracker: TerminalDataEventTracker | undefined;
	/**
	 * A single shared terminal link provider for the exthost. When an ext registers a link
	 * provider, this is registered with the terminal on the renderer side and all links are
	 * provided through this, even from multiple ext link providers. Xterm should remove lower
	 * priority intersecting links itself.
	 */
	private _linkProvider: IDisposable | undefined;

	private _os: OperatingSystem = OS;

	constructor(
		private readonly _extHostContext: IExtHostContext,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalInstanceService readonly terminalInstanceService: ITerminalInstanceService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEnvironmentVariableService private readonly _environmentVariableService: IEnvironmentVariableService,
		@ILogService private readonly _logService: ILogService,
		@ITerminalProfileResolverService private readonly _terminalProfileResolverService: ITerminalProfileResolverService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService
	) {
		this._proxy = _extHostContext.getProxy(ExtHostContext.ExtHostTerminalService);

		// ITerminalService listeners
		this._toDispose.add(_terminalService.onDidCreateInstance((instance) => {
			this._onTerminalOpened(instance);
			this._onInstanceDimensionsChanged(instance);
		}));

		this._toDispose.add(_terminalService.onDidDisposeInstance(instance => this._onTerminalDisposed(instance)));
		this._toDispose.add(_terminalService.onDidReceiveProcessId(instance => this._onTerminalProcessIdReady(instance)));
		this._toDispose.add(_terminalService.onDidChangeInstanceDimensions(instance => this._onInstanceDimensionsChanged(instance)));
		this._toDispose.add(_terminalService.onDidMaximumDimensionsChange(instance => this._onInstanceMaximumDimensionsChanged(instance)));
		this._toDispose.add(_terminalService.onDidRequestStartExtensionTerminal(e => this._onRequestStartExtensionTerminal(e)));
		this._toDispose.add(_terminalService.onDidChangeActiveInstance(instance => this._onActiveTerminalChanged(instance ? instance.instanceId : null)));
		this._toDispose.add(_terminalService.onDidChangeInstanceTitle(instance => instance && this._onTitleChanged(instance.instanceId, instance.title)));
		this._toDispose.add(_terminalService.onDidInputInstanceData(instance => this._proxy.$acceptTerminalInteraction(instance.instanceId)));

		// Set initial ext host state
		this._terminalService.instances.forEach(t => {
			this._onTerminalOpened(t);
			t.processReady.then(() => this._onTerminalProcessIdReady(t));
		});
		const activeInstance = this._terminalService.activeInstance;
		if (activeInstance) {
			this._proxy.$acceptActiveTerminalChanged(activeInstance.instanceId);
		}
		if (this._environmentVariableService.collections.size > 0) {
			const collectionAsArray = [...this._environmentVariableService.collections.entries()];
			const serializedCollections: [string, ISerializableEnvironmentVariableCollection][] = collectionAsArray.map(e => {
				return [e[0], serializeEnvironmentVariableCollection(e[1].map)];
			});
			this._proxy.$initEnvironmentVariableCollections(serializedCollections);
		}

		remoteAgentService.getEnvironment().then(async env => {
			this._os = env?.os || OS;
			this._updateDefaultProfile();
		});
		this._terminalProfileService.onDidChangeAvailableProfiles(() => this._updateDefaultProfile());
	}

	public dispose(): void {
		this._toDispose.dispose();
		this._linkProvider?.dispose();
	}

	private async _updateDefaultProfile() {
		const remoteAuthority = withNullAsUndefined(this._extHostContext.remoteAuthority);
		const defaultProfile = this._terminalProfileResolverService.getDefaultProfile({ remoteAuthority, os: this._os });
		const defaultAutomationProfile = this._terminalProfileResolverService.getDefaultProfile({ remoteAuthority, os: this._os, allowAutomationShell: true });
		this._proxy.$acceptDefaultProfile(...await Promise.all([defaultProfile, defaultAutomationProfile]));
	}

	private async _getTerminalInstance(id: ExtHostTerminalIdentifier): Promise<ITerminalInstance | undefined> {
		if (typeof id === 'string') {
			return this._extHostTerminals.get(id);
		}
		return this._terminalService.getInstanceFromId(id);
	}

	public async $createTerminal(extHostTerminalId: string, launchConfig: TerminalLaunchConfig): Promise<void> {
		const shellLaunchConfig: IShellLaunchConfig = {
			name: launchConfig.name,
			executable: launchConfig.shellPath,
			args: launchConfig.shellArgs,
			cwd: typeof launchConfig.cwd === 'string' ? launchConfig.cwd : URI.revive(launchConfig.cwd),
			icon: launchConfig.icon,
			color: launchConfig.color,
			initialText: launchConfig.initialText,
			waitOnExit: launchConfig.waitOnExit,
			ignoreConfigurationCwd: true,
			env: launchConfig.env,
			strictEnv: launchConfig.strictEnv,
			hideFromUser: launchConfig.hideFromUser,
			customPtyImplementation: launchConfig.isExtensionCustomPtyTerminal
				? (id, cols, rows) => new TerminalProcessExtHostProxy(id, cols, rows, this._terminalService)
				: undefined,
			extHostTerminalId,
			isFeatureTerminal: launchConfig.isFeatureTerminal,
			isExtensionOwnedTerminal: launchConfig.isExtensionOwnedTerminal,
			useShellEnvironment: launchConfig.useShellEnvironment,
			isTransient: launchConfig.isTransient
		};
		const terminal = Promises.withAsyncBody<ITerminalInstance>(async r => {
			const terminal = await this._terminalService.createTerminal({
				config: shellLaunchConfig,
				location: await this._deserializeParentTerminal(launchConfig.location)
			});
			r(terminal);
		});
		this._extHostTerminals.set(extHostTerminalId, terminal);
		const terminalInstance = await terminal;
		this._toDispose.add(terminalInstance.onDisposed(() => {
			this._extHostTerminals.delete(extHostTerminalId);
		}));
	}

	private async _deserializeParentTerminal(location?: TerminalLocation | TerminalEditorLocationOptions | { parentTerminal: ExtHostTerminalIdentifier } | { splitActiveTerminal: boolean; location?: TerminalLocation }): Promise<TerminalLocation | TerminalEditorLocationOptions | { parentTerminal: ITerminalInstance } | { splitActiveTerminal: boolean } | undefined> {
		if (typeof location === 'object' && 'parentTerminal' in location) {
			const parentTerminal = await this._extHostTerminals.get(location.parentTerminal.toString());
			return parentTerminal ? { parentTerminal } : undefined;
		}
		return location;
	}

	public async $show(id: ExtHostTerminalIdentifier, preserveFocus: boolean): Promise<void> {
		const terminalInstance = await this._getTerminalInstance(id);
		if (terminalInstance) {
			this._terminalService.setActiveInstance(terminalInstance);
			if (terminalInstance.target === TerminalLocation.Editor) {
				this._terminalEditorService.revealActiveEditor(preserveFocus);
			} else {
				this._terminalGroupService.showPanel(!preserveFocus);
			}
		}
	}

	public async $hide(id: ExtHostTerminalIdentifier): Promise<void> {
		const instanceToHide = await this._getTerminalInstance(id);
		const activeInstance = this._terminalService.activeInstance;
		if (activeInstance && activeInstance.instanceId === instanceToHide?.instanceId && activeInstance.target !== TerminalLocation.Editor) {
			this._terminalGroupService.hidePanel();
		}
	}

	public async $dispose(id: ExtHostTerminalIdentifier): Promise<void> {
		(await this._getTerminalInstance(id))?.dispose(TerminalExitReason.Extension);
	}

	public async $sendText(id: ExtHostTerminalIdentifier, text: string, addNewLine: boolean): Promise<void> {
		const instance = await this._getTerminalInstance(id);
		await instance?.sendText(text, addNewLine);
	}

	public $sendProcessExit(terminalId: number, exitCode: number | undefined): void {
		this._terminalProcessProxies.get(terminalId)?.emitExit(exitCode);
	}

	public $startSendingDataEvents(): void {
		if (!this._dataEventTracker) {
			this._dataEventTracker = this._instantiationService.createInstance(TerminalDataEventTracker, (id, data) => {
				this._onTerminalData(id, data);
			});
			// Send initial events if they exist
			this._terminalService.instances.forEach(t => {
				t.initialDataEvents?.forEach(d => this._onTerminalData(t.instanceId, d));
			});
		}
	}

	public $stopSendingDataEvents(): void {
		this._dataEventTracker?.dispose();
		this._dataEventTracker = undefined;
	}

	public $startLinkProvider(): void {
		this._linkProvider?.dispose();
		this._linkProvider = this._terminalService.registerLinkProvider(new ExtensionTerminalLinkProvider(this._proxy));
	}

	public $stopLinkProvider(): void {
		this._linkProvider?.dispose();
		this._linkProvider = undefined;
	}

	public $registerProcessSupport(isSupported: boolean): void {
		this._terminalService.registerProcessSupport(isSupported);
	}

	public $registerProfileProvider(id: string, extensionIdentifier: string): void {
		// Proxy profile provider requests through the extension host
		this._profileProviders.set(id, this._terminalProfileService.registerTerminalProfileProvider(extensionIdentifier, id, {
			createContributedTerminalProfile: async (options) => {
				return this._proxy.$createContributedProfileTerminal(id, options);
			}
		}));
	}

	public $unregisterProfileProvider(id: string): void {
		this._profileProviders.get(id)?.dispose();
		this._profileProviders.delete(id);
	}

	private _onActiveTerminalChanged(terminalId: number | null): void {
		this._proxy.$acceptActiveTerminalChanged(terminalId);
	}

	private _onTerminalData(terminalId: number, data: string): void {
		this._proxy.$acceptTerminalProcessData(terminalId, data);
	}

	private _onTitleChanged(terminalId: number, name: string): void {
		this._proxy.$acceptTerminalTitleChange(terminalId, name);
	}

	private _onTerminalDisposed(terminalInstance: ITerminalInstance): void {
		this._proxy.$acceptTerminalClosed(terminalInstance.instanceId, terminalInstance.exitCode, terminalInstance.exitReason ?? TerminalExitReason.Unknown);
	}

	private _onTerminalOpened(terminalInstance: ITerminalInstance): void {
		const extHostTerminalId = terminalInstance.shellLaunchConfig.extHostTerminalId;
		const shellLaunchConfigDto: IShellLaunchConfigDto = {
			name: terminalInstance.shellLaunchConfig.name,
			executable: terminalInstance.shellLaunchConfig.executable,
			args: terminalInstance.shellLaunchConfig.args,
			cwd: terminalInstance.shellLaunchConfig.cwd,
			env: terminalInstance.shellLaunchConfig.env,
			hideFromUser: terminalInstance.shellLaunchConfig.hideFromUser
		};
		this._proxy.$acceptTerminalOpened(terminalInstance.instanceId, extHostTerminalId, terminalInstance.title, shellLaunchConfigDto);
	}

	private _onTerminalProcessIdReady(terminalInstance: ITerminalInstance): void {
		if (terminalInstance.processId === undefined) {
			return;
		}
		this._proxy.$acceptTerminalProcessId(terminalInstance.instanceId, terminalInstance.processId);
	}

	private _onInstanceDimensionsChanged(instance: ITerminalInstance): void {
		this._proxy.$acceptTerminalDimensions(instance.instanceId, instance.cols, instance.rows);
	}

	private _onInstanceMaximumDimensionsChanged(instance: ITerminalInstance): void {
		this._proxy.$acceptTerminalMaximumDimensions(instance.instanceId, instance.maxCols, instance.maxRows);
	}

	private _onRequestStartExtensionTerminal(request: IStartExtensionTerminalRequest): void {
		const proxy = request.proxy;
		this._terminalProcessProxies.set(proxy.instanceId, proxy);

		// Note that onResize is not being listened to here as it needs to fire when max dimensions
		// change, excluding the dimension override
		const initialDimensions: ITerminalDimensionsDto | undefined = request.cols && request.rows ? {
			columns: request.cols,
			rows: request.rows
		} : undefined;

		this._proxy.$startExtensionTerminal(
			proxy.instanceId,
			initialDimensions
		).then(request.callback);

		proxy.onInput(data => this._proxy.$acceptProcessInput(proxy.instanceId, data));
		proxy.onShutdown(immediate => this._proxy.$acceptProcessShutdown(proxy.instanceId, immediate));
		proxy.onRequestCwd(() => this._proxy.$acceptProcessRequestCwd(proxy.instanceId));
		proxy.onRequestInitialCwd(() => this._proxy.$acceptProcessRequestInitialCwd(proxy.instanceId));
		proxy.onRequestLatency(() => this._onRequestLatency(proxy.instanceId));
	}

	public $sendProcessData(terminalId: number, data: string): void {
		this._terminalProcessProxies.get(terminalId)?.emitData(data);
	}

	public $sendProcessReady(terminalId: number, pid: number, cwd: string): void {
		this._terminalProcessProxies.get(terminalId)?.emitReady(pid, cwd);
	}

	public $sendProcessProperty(terminalId: number, property: IProcessProperty<any>): void {
		if (property.type === ProcessPropertyType.Title) {
			const instance = this._terminalService.getInstanceFromId(terminalId);
			instance?.rename(property.value);
		}
		this._terminalProcessProxies.get(terminalId)?.emitProcessProperty(property);
	}

	private async _onRequestLatency(terminalId: number): Promise<void> {
		const COUNT = 2;
		let sum = 0;
		for (let i = 0; i < COUNT; i++) {
			const sw = StopWatch.create(true);
			await this._proxy.$acceptProcessRequestLatency(terminalId);
			sw.stop();
			sum += sw.elapsed();
		}
		this._getTerminalProcess(terminalId)?.emitLatency(sum / COUNT);
	}

	private _getTerminalProcess(terminalId: number): ITerminalProcessExtHostProxy | undefined {
		const terminal = this._terminalProcessProxies.get(terminalId);
		if (!terminal) {
			this._logService.error(`Unknown terminal: ${terminalId}`);
			return undefined;
		}
		return terminal;
	}

	$setEnvironmentVariableCollection(extensionIdentifier: string, persistent: boolean, collection: ISerializableEnvironmentVariableCollection | undefined): void {
		if (collection) {
			const translatedCollection = {
				persistent,
				map: deserializeEnvironmentVariableCollection(collection)
			};
			this._environmentVariableService.set(extensionIdentifier, translatedCollection);
		} else {
			this._environmentVariableService.delete(extensionIdentifier);
		}
	}
}

/**
 * Encapsulates temporary tracking of data events from terminal instances, once disposed all
 * listeners are removed.
 */
class TerminalDataEventTracker extends Disposable {
	private readonly _bufferer: TerminalDataBufferer;

	constructor(
		private readonly _callback: (id: number, data: string) => void,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();

		this._register(this._bufferer = new TerminalDataBufferer(this._callback));

		this._terminalService.instances.forEach(instance => this._registerInstance(instance));
		this._register(this._terminalService.onDidCreateInstance(instance => this._registerInstance(instance)));
		this._register(this._terminalService.onDidDisposeInstance(instance => this._bufferer.stopBuffering(instance.instanceId)));
	}

	private _registerInstance(instance: ITerminalInstance): void {
		// Buffer data events to reduce the amount of messages going to the extension host
		this._register(this._bufferer.startBuffering(instance.instanceId, instance.onData));
	}
}

class ExtensionTerminalLinkProvider implements ITerminalExternalLinkProvider {
	constructor(
		private readonly _proxy: ExtHostTerminalServiceShape
	) {
	}

	async provideLinks(instance: ITerminalInstance, line: string): Promise<ITerminalLink[] | undefined> {
		const proxy = this._proxy;
		const extHostLinks = await proxy.$provideLinks(instance.instanceId, line);
		return extHostLinks.map(dto => ({
			id: dto.id,
			startIndex: dto.startIndex,
			length: dto.length,
			label: dto.label,
			activate: () => proxy.$activateLink(instance.instanceId, dto.id)
		}));
	}
}
