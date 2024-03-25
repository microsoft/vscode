/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, Disposable, IDisposable, MutableDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { ExtHostContext, ExtHostTerminalServiceShape, MainThreadTerminalServiceShape, MainContext, TerminalLaunchConfig, ITerminalDimensionsDto, ExtHostTerminalIdentifier, TerminalQuickFix, ITerminalCommandDto } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProcessProperty, IProcessReadyWindowsPty, IShellLaunchConfig, IShellLaunchConfigDto, ITerminalOutputMatch, ITerminalOutputMatcher, ProcessPropertyType, TerminalExitReason, TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { TerminalDataBufferer } from 'vs/platform/terminal/common/terminalDataBuffering';
import { ITerminalEditorService, ITerminalExternalLinkProvider, ITerminalGroupService, ITerminalInstance, ITerminalLink, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalProcessExtHostProxy } from 'vs/workbench/contrib/terminal/browser/terminalProcessExtHostProxy';
import { IEnvironmentVariableService } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { deserializeEnvironmentDescriptionMap, deserializeEnvironmentVariableCollection, serializeEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariableShared';
import { IStartExtensionTerminalRequest, ITerminalProcessExtHostProxy, ITerminalProfileResolverService, ITerminalProfileService } from 'vs/workbench/contrib/terminal/common/terminal';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { OperatingSystem, OS } from 'vs/base/common/platform';
import { TerminalEditorLocationOptions } from 'vscode';
import { Promises } from 'vs/base/common/async';
import { ISerializableEnvironmentDescriptionMap, ISerializableEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariable';
import { ITerminalLinkProviderService } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { ITerminalQuickFixService, ITerminalQuickFix, TerminalQuickFixType } from 'vs/workbench/contrib/terminalContrib/quickFix/browser/quickFix';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';

@extHostNamedCustomer(MainContext.MainThreadTerminalService)
export class MainThreadTerminalService implements MainThreadTerminalServiceShape {

	private readonly _store = new DisposableStore();
	private readonly _proxy: ExtHostTerminalServiceShape;

	/**
	 * Stores a map from a temporary terminal id (a UUID generated on the extension host side)
	 * to a numeric terminal id (an id generated on the renderer side)
	 * This comes in play only when dealing with terminals created on the extension host side
	 */
	private readonly _extHostTerminals = new Map<string, Promise<ITerminalInstance>>();
	private readonly _terminalProcessProxies = new Map<number, ITerminalProcessExtHostProxy>();
	private readonly _profileProviders = new Map<string, IDisposable>();
	private readonly _quickFixProviders = new Map<string, IDisposable>();
	private readonly _dataEventTracker = new MutableDisposable<TerminalDataEventTracker>();
	private readonly _sendCommandEventListener = new MutableDisposable();

	/**
	 * A single shared terminal link provider for the exthost. When an ext registers a link
	 * provider, this is registered with the terminal on the renderer side and all links are
	 * provided through this, even from multiple ext link providers. Xterm should remove lower
	 * priority intersecting links itself.
	 */
	private _linkProvider = this._store.add(new MutableDisposable());

	private _os: OperatingSystem = OS;

	constructor(
		private readonly _extHostContext: IExtHostContext,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalLinkProviderService private readonly _terminalLinkProviderService: ITerminalLinkProviderService,
		@ITerminalQuickFixService private readonly _terminalQuickFixService: ITerminalQuickFixService,
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
		this._store.add(_terminalService.onDidCreateInstance((instance) => {
			this._onTerminalOpened(instance);
			this._onInstanceDimensionsChanged(instance);
		}));

		this._store.add(_terminalService.onDidDisposeInstance(instance => this._onTerminalDisposed(instance)));
		this._store.add(_terminalService.onAnyInstanceProcessIdReady(instance => this._onTerminalProcessIdReady(instance)));
		this._store.add(_terminalService.onDidChangeInstanceDimensions(instance => this._onInstanceDimensionsChanged(instance)));
		this._store.add(_terminalService.onAnyInstanceMaximumDimensionsChange(instance => this._onInstanceMaximumDimensionsChanged(instance)));
		this._store.add(_terminalService.onDidRequestStartExtensionTerminal(e => this._onRequestStartExtensionTerminal(e)));
		this._store.add(_terminalService.onDidChangeActiveInstance(instance => this._onActiveTerminalChanged(instance ? instance.instanceId : null)));
		this._store.add(_terminalService.onAnyInstanceTitleChange(instance => instance && this._onTitleChanged(instance.instanceId, instance.title)));
		this._store.add(_terminalService.onAnyInstanceDataInput(instance => this._proxy.$acceptTerminalInteraction(instance.instanceId)));
		this._store.add(_terminalService.onAnyInstanceSelectionChange(instance => this._proxy.$acceptTerminalSelection(instance.instanceId, instance.selection)));

		// Set initial ext host state
		for (const instance of this._terminalService.instances) {
			this._onTerminalOpened(instance);
			instance.processReady.then(() => this._onTerminalProcessIdReady(instance));
		}
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
		this._store.add(this._terminalProfileService.onDidChangeAvailableProfiles(() => this._updateDefaultProfile()));
	}

	public dispose(): void {
		this._store.dispose();
		for (const provider of this._profileProviders.values()) {
			provider.dispose();
		}
		for (const provider of this._quickFixProviders.values()) {
			provider.dispose();
		}
	}

	private async _updateDefaultProfile() {
		const remoteAuthority = this._extHostContext.remoteAuthority ?? undefined;
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
			forceShellIntegration: launchConfig.forceShellIntegration,
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
		this._store.add(terminalInstance.onDisposed(() => {
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
				await this._terminalEditorService.revealActiveEditor(preserveFocus);
			} else {
				await this._terminalGroupService.showPanel(!preserveFocus);
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

	public async $sendText(id: ExtHostTerminalIdentifier, text: string, shouldExecute: boolean): Promise<void> {
		const instance = await this._getTerminalInstance(id);
		await instance?.sendText(text, shouldExecute);
	}

	public $sendProcessExit(terminalId: number, exitCode: number | undefined): void {
		this._terminalProcessProxies.get(terminalId)?.emitExit(exitCode);
	}

	public $startSendingDataEvents(): void {
		if (!this._dataEventTracker.value) {
			this._dataEventTracker.value = this._instantiationService.createInstance(TerminalDataEventTracker, (id, data) => {
				this._onTerminalData(id, data);
			});
			// Send initial events if they exist
			for (const instance of this._terminalService.instances) {
				for (const data of instance.initialDataEvents || []) {
					this._onTerminalData(instance.instanceId, data);
				}
			}
		}
	}

	public $stopSendingDataEvents(): void {
		this._dataEventTracker.clear();
	}

	public $startSendingCommandEvents(): void {
		if (this._sendCommandEventListener.value) {
			return;
		}

		const multiplexer = this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, capability => capability.onCommandFinished);
		const sub = multiplexer.event(e => {
			this._onDidExecuteCommand(e.instance.instanceId, {
				commandLine: e.data.command,
				// TODO: Convert to URI if possible
				cwd: e.data.cwd,
				exitCode: e.data.exitCode,
				output: e.data.getOutput()
			});
		});
		this._sendCommandEventListener.value = combinedDisposable(multiplexer, sub);
	}

	public $stopSendingCommandEvents(): void {
		this._sendCommandEventListener.clear();
	}

	public $startLinkProvider(): void {
		this._linkProvider.value = this._terminalLinkProviderService.registerLinkProvider(new ExtensionTerminalLinkProvider(this._proxy));
	}

	public $stopLinkProvider(): void {
		this._linkProvider.clear();
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

	public async $registerQuickFixProvider(id: string, extensionId: string): Promise<void> {
		this._quickFixProviders.set(id, this._terminalQuickFixService.registerQuickFixProvider(id, {
			provideTerminalQuickFixes: async (terminalCommand, lines, options, token) => {
				if (token.isCancellationRequested) {
					return;
				}
				if (options.outputMatcher?.length && options.outputMatcher.length > 40) {
					options.outputMatcher.length = 40;
					this._logService.warn('Cannot exceed output matcher length of 40');
				}
				const commandLineMatch = terminalCommand.command.match(options.commandLineMatcher);
				if (!commandLineMatch || !lines) {
					return;
				}
				const outputMatcher = options.outputMatcher;
				let outputMatch;
				if (outputMatcher) {
					outputMatch = getOutputMatchForLines(lines, outputMatcher);
				}
				if (!outputMatch) {
					return;
				}
				const matchResult = { commandLineMatch, outputMatch, commandLine: terminalCommand.command };

				if (matchResult) {
					const result = await this._proxy.$provideTerminalQuickFixes(id, matchResult, token);
					if (result && Array.isArray(result)) {
						return result.map(r => parseQuickFix(id, extensionId, r));
					} else if (result) {
						return parseQuickFix(id, extensionId, result);
					}
				}
				return;
			}
		}));
	}

	public $unregisterQuickFixProvider(id: string): void {
		this._quickFixProviders.get(id)?.dispose();
		this._quickFixProviders.delete(id);
	}

	private _onActiveTerminalChanged(terminalId: number | null): void {
		this._proxy.$acceptActiveTerminalChanged(terminalId);
	}

	private _onTerminalData(terminalId: number, data: string): void {
		this._proxy.$acceptTerminalProcessData(terminalId, data);
	}

	private _onDidExecuteCommand(terminalId: number, command: ITerminalCommandDto): void {
		this._proxy.$acceptDidExecuteCommand(terminalId, command);
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
	}

	public $sendProcessData(terminalId: number, data: string): void {
		this._terminalProcessProxies.get(terminalId)?.emitData(data);
	}

	public $sendProcessReady(terminalId: number, pid: number, cwd: string, windowsPty: IProcessReadyWindowsPty | undefined): void {
		this._terminalProcessProxies.get(terminalId)?.emitReady(pid, cwd, windowsPty);
	}

	public $sendProcessProperty(terminalId: number, property: IProcessProperty<any>): void {
		if (property.type === ProcessPropertyType.Title) {
			const instance = this._terminalService.getInstanceFromId(terminalId);
			instance?.rename(property.value);
		}
		this._terminalProcessProxies.get(terminalId)?.emitProcessProperty(property);
	}

	$setEnvironmentVariableCollection(extensionIdentifier: string, persistent: boolean, collection: ISerializableEnvironmentVariableCollection | undefined, descriptionMap: ISerializableEnvironmentDescriptionMap): void {
		if (collection) {
			const translatedCollection = {
				persistent,
				map: deserializeEnvironmentVariableCollection(collection),
				descriptionMap: deserializeEnvironmentDescriptionMap(descriptionMap)
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

		for (const instance of this._terminalService.instances) {
			this._registerInstance(instance);
		}
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

export function getOutputMatchForLines(lines: string[], outputMatcher: ITerminalOutputMatcher): ITerminalOutputMatch | undefined {
	const match: RegExpMatchArray | null | undefined = lines.join('\n').match(outputMatcher.lineMatcher);
	return match ? { regexMatch: match, outputLines: lines } : undefined;
}

function parseQuickFix(id: string, source: string, fix: TerminalQuickFix): ITerminalQuickFix {
	let type = TerminalQuickFixType.TerminalCommand;
	if ('uri' in fix) {
		fix.uri = URI.revive(fix.uri);
		type = TerminalQuickFixType.Opener;
	} else if ('id' in fix) {
		type = TerminalQuickFixType.VscodeCommand;
	}
	return { id, type, source, ...fix };
}
