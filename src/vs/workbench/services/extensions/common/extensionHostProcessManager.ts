/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as errors from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostCustomersRegistry } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, ExtHostExtensionServiceShape, IExtHostContext, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { ProxyIdentifier } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { IRPCProtocolLogger, RPCProtocol, RequestInitiator, ResponsiveState } from 'vs/workbench/services/extensions/common/rpcProtocol';
import { RemoteAuthorityResolverError, ResolverResult } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledResourceInput } from 'vs/workbench/common/editor';
import { StopWatch } from 'vs/base/common/stopwatch';
import { VSBuffer } from 'vs/base/common/buffer';
import { IExtensionHostStarter } from 'vs/workbench/services/extensions/common/extensions';

// Enable to see detailed message communication between window and extension host
const LOG_EXTENSION_HOST_COMMUNICATION = false;
const LOG_USE_COLORS = true;

const NO_OP_VOID_PROMISE = Promise.resolve<void>(undefined);

export class ExtensionHostProcessManager extends Disposable {

	public readonly onDidExit: Event<[number, string | null]>;

	private readonly _onDidChangeResponsiveState: Emitter<ResponsiveState> = this._register(new Emitter<ResponsiveState>());
	public readonly onDidChangeResponsiveState: Event<ResponsiveState> = this._onDidChangeResponsiveState.event;

	/**
	 * A map of already activated events to speed things up if the same activation event is triggered multiple times.
	 */
	private readonly _extensionHostProcessFinishedActivateEvents: { [activationEvent: string]: boolean; };
	private _extensionHostProcessRPCProtocol: RPCProtocol | null;
	private readonly _extensionHostProcessCustomers: IDisposable[];
	private readonly _extensionHostProcessWorker: IExtensionHostStarter;
	/**
	 * winjs believes a proxy is a promise because it has a `then` method, so wrap the result in an object.
	 */
	private _extensionHostProcessProxy: Promise<{ value: ExtHostExtensionServiceShape; } | null> | null;
	private _resolveAuthorityAttempt: number;

	constructor(
		public readonly isLocal: boolean,
		extensionHostProcessWorker: IExtensionHostStarter,
		private readonly _remoteAuthority: string,
		initialActivationEvents: string[],
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
	) {
		super();
		this._extensionHostProcessFinishedActivateEvents = Object.create(null);
		this._extensionHostProcessRPCProtocol = null;
		this._extensionHostProcessCustomers = [];

		this._extensionHostProcessWorker = extensionHostProcessWorker;
		this.onDidExit = this._extensionHostProcessWorker.onExit;
		this._extensionHostProcessProxy = this._extensionHostProcessWorker.start()!.then(
			(protocol) => {
				return { value: this._createExtensionHostCustomers(protocol) };
			},
			(err) => {
				console.error('Error received from starting extension host');
				console.error(err);
				return null;
			}
		);
		this._extensionHostProcessProxy.then(() => {
			initialActivationEvents.forEach((activationEvent) => this.activateByEvent(activationEvent));
			this._register(registerLatencyTestProvider({
				measure: () => this.measure()
			}));
		});
		this._resolveAuthorityAttempt = 0;
	}

	public dispose(): void {
		if (this._extensionHostProcessWorker) {
			this._extensionHostProcessWorker.dispose();
		}
		if (this._extensionHostProcessRPCProtocol) {
			this._extensionHostProcessRPCProtocol.dispose();
		}
		for (let i = 0, len = this._extensionHostProcessCustomers.length; i < len; i++) {
			const customer = this._extensionHostProcessCustomers[i];
			try {
				customer.dispose();
			} catch (err) {
				errors.onUnexpectedError(err);
			}
		}
		this._extensionHostProcessProxy = null;

		super.dispose();
	}

	private async measure(): Promise<ExtHostLatencyResult | null> {
		const proxy = await this._getExtensionHostProcessProxy();
		if (!proxy) {
			return null;
		}
		const latency = await this._measureLatency(proxy);
		const down = await this._measureDown(proxy);
		const up = await this._measureUp(proxy);
		return {
			remoteAuthority: this._remoteAuthority,
			latency,
			down,
			up
		};
	}

	private async _getExtensionHostProcessProxy(): Promise<ExtHostExtensionServiceShape | null> {
		if (!this._extensionHostProcessProxy) {
			return null;
		}
		const p = await this._extensionHostProcessProxy;
		if (!p) {
			return null;
		}
		return p.value;
	}

	private async _measureLatency(proxy: ExtHostExtensionServiceShape): Promise<number> {
		const COUNT = 10;

		let sum = 0;
		for (let i = 0; i < COUNT; i++) {
			const sw = StopWatch.create(true);
			await proxy.$test_latency(i);
			sw.stop();
			sum += sw.elapsed();
		}
		return (sum / COUNT);
	}

	private static _convert(byteCount: number, elapsedMillis: number): number {
		return (byteCount * 1000 * 8) / elapsedMillis;
	}

	private async _measureUp(proxy: ExtHostExtensionServiceShape): Promise<number> {
		const SIZE = 10 * 1024 * 1024; // 10MB

		let buff = VSBuffer.alloc(SIZE);
		let value = Math.ceil(Math.random() * 256);
		for (let i = 0; i < buff.byteLength; i++) {
			buff.writeUInt8(i, value);
		}
		const sw = StopWatch.create(true);
		await proxy.$test_up(buff);
		sw.stop();
		return ExtensionHostProcessManager._convert(SIZE, sw.elapsed());
	}

	private async _measureDown(proxy: ExtHostExtensionServiceShape): Promise<number> {
		const SIZE = 10 * 1024 * 1024; // 10MB

		const sw = StopWatch.create(true);
		await proxy.$test_down(SIZE);
		sw.stop();
		return ExtensionHostProcessManager._convert(SIZE, sw.elapsed());
	}

	private _createExtensionHostCustomers(protocol: IMessagePassingProtocol): ExtHostExtensionServiceShape {

		let logger: IRPCProtocolLogger | null = null;
		if (LOG_EXTENSION_HOST_COMMUNICATION || this._environmentService.logExtensionHostCommunication) {
			logger = new RPCLogger();
		}

		this._extensionHostProcessRPCProtocol = new RPCProtocol(protocol, logger);
		this._register(this._extensionHostProcessRPCProtocol.onDidChangeResponsiveState((responsiveState: ResponsiveState) => this._onDidChangeResponsiveState.fire(responsiveState)));
		const extHostContext: IExtHostContext = {
			remoteAuthority: this._remoteAuthority,
			getProxy: <T>(identifier: ProxyIdentifier<T>): T => this._extensionHostProcessRPCProtocol!.getProxy(identifier),
			set: <T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R => this._extensionHostProcessRPCProtocol!.set(identifier, instance),
			assertRegistered: (identifiers: ProxyIdentifier<any>[]): void => this._extensionHostProcessRPCProtocol!.assertRegistered(identifiers),
		};

		// Named customers
		const namedCustomers = ExtHostCustomersRegistry.getNamedCustomers();
		for (let i = 0, len = namedCustomers.length; i < len; i++) {
			const [id, ctor] = namedCustomers[i];
			const instance = this._instantiationService.createInstance(ctor, extHostContext);
			this._extensionHostProcessCustomers.push(instance);
			this._extensionHostProcessRPCProtocol.set(id, instance);
		}

		// Customers
		const customers = ExtHostCustomersRegistry.getCustomers();
		for (const ctor of customers) {
			const instance = this._instantiationService.createInstance(ctor, extHostContext);
			this._extensionHostProcessCustomers.push(instance);
		}

		// Check that no named customers are missing
		const expected: ProxyIdentifier<any>[] = Object.keys(MainContext).map((key) => (<any>MainContext)[key]);
		this._extensionHostProcessRPCProtocol.assertRegistered(expected);

		return this._extensionHostProcessRPCProtocol.getProxy(ExtHostContext.ExtHostExtensionService);
	}

	public async activate(extension: ExtensionIdentifier, activationEvent: string): Promise<boolean> {
		const proxy = await this._getExtensionHostProcessProxy();
		if (!proxy) {
			return false;
		}
		return proxy.$activate(extension, activationEvent);
	}

	public activateByEvent(activationEvent: string): Promise<void> {
		if (this._extensionHostProcessFinishedActivateEvents[activationEvent] || !this._extensionHostProcessProxy) {
			return NO_OP_VOID_PROMISE;
		}
		return this._extensionHostProcessProxy.then((proxy) => {
			if (!proxy) {
				// this case is already covered above and logged.
				// i.e. the extension host could not be started
				return NO_OP_VOID_PROMISE;
			}
			return proxy.value.$activateByEvent(activationEvent);
		}).then(() => {
			this._extensionHostProcessFinishedActivateEvents[activationEvent] = true;
		});
	}

	public getInspectPort(): number {
		if (this._extensionHostProcessWorker) {
			let port = this._extensionHostProcessWorker.getInspectPort();
			if (port) {
				return port;
			}
		}
		return 0;
	}

	public canProfileExtensionHost(): boolean {
		return this._extensionHostProcessWorker && Boolean(this._extensionHostProcessWorker.getInspectPort());
	}

	public async resolveAuthority(remoteAuthority: string): Promise<ResolverResult> {
		const authorityPlusIndex = remoteAuthority.indexOf('+');
		if (authorityPlusIndex === -1) {
			// This authority does not need to be resolved, simply parse the port number
			const pieces = remoteAuthority.split(':');
			return Promise.resolve({
				authority: {
					authority: remoteAuthority,
					host: pieces[0],
					port: parseInt(pieces[1], 10)
				}
			});
		}
		const proxy = await this._getExtensionHostProcessProxy();
		if (!proxy) {
			throw new Error(`Cannot resolve authority`);
		}
		this._resolveAuthorityAttempt++;
		const result = await proxy.$resolveAuthority(remoteAuthority, this._resolveAuthorityAttempt);
		if (result.type === 'ok') {
			return result.value;
		} else {
			throw new RemoteAuthorityResolverError(result.error.message, result.error.code, result.error.detail);
		}
	}

	public async start(enabledExtensionIds: ExtensionIdentifier[]): Promise<void> {
		const proxy = await this._getExtensionHostProcessProxy();
		if (!proxy) {
			return;
		}
		return proxy.$startExtensionHost(enabledExtensionIds);
	}

	public async deltaExtensions(toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): Promise<void> {
		const proxy = await this._getExtensionHostProcessProxy();
		if (!proxy) {
			return;
		}
		return proxy.$deltaExtensions(toAdd, toRemove);
	}

	public async setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void> {
		const proxy = await this._getExtensionHostProcessProxy();
		if (!proxy) {
			return;
		}

		return proxy.$setRemoteEnvironment(env);
	}
}

const colorTables = [
	['#2977B1', '#FC802D', '#34A13A', '#D3282F', '#9366BA'],
	['#8B564C', '#E177C0', '#7F7F7F', '#BBBE3D', '#2EBECD']
];

function prettyWithoutArrays(data: any): any {
	if (Array.isArray(data)) {
		return data;
	}
	if (data && typeof data === 'object' && typeof data.toString === 'function') {
		let result = data.toString();
		if (result !== '[object Object]') {
			return result;
		}
	}
	return data;
}

function pretty(data: any): any {
	if (Array.isArray(data)) {
		return data.map(prettyWithoutArrays);
	}
	return prettyWithoutArrays(data);
}

class RPCLogger implements IRPCProtocolLogger {

	private _totalIncoming = 0;
	private _totalOutgoing = 0;

	private _log(direction: string, totalLength: number, msgLength: number, req: number, initiator: RequestInitiator, str: string, data: any): void {
		data = pretty(data);

		const colorTable = colorTables[initiator];
		const color = LOG_USE_COLORS ? colorTable[req % colorTable.length] : '#000000';
		let args = [`%c[${direction}]%c[${strings.pad(totalLength, 7, ' ')}]%c[len: ${strings.pad(msgLength, 5, ' ')}]%c${strings.pad(req, 5, ' ')} - ${str}`, 'color: darkgreen', 'color: grey', 'color: grey', `color: ${color}`];
		if (/\($/.test(str)) {
			args = args.concat(data);
			args.push(')');
		} else {
			args.push(data);
		}
		console.log.apply(console, args as [string, ...string[]]);
	}

	logIncoming(msgLength: number, req: number, initiator: RequestInitiator, str: string, data?: any): void {
		this._totalIncoming += msgLength;
		this._log('Ext \u2192 Win', this._totalIncoming, msgLength, req, initiator, str, data);
	}

	logOutgoing(msgLength: number, req: number, initiator: RequestInitiator, str: string, data?: any): void {
		this._totalOutgoing += msgLength;
		this._log('Win \u2192 Ext', this._totalOutgoing, msgLength, req, initiator, str, data);
	}
}

interface ExtHostLatencyResult {
	remoteAuthority: string;
	up: number;
	down: number;
	latency: number;
}

interface ExtHostLatencyProvider {
	measure(): Promise<ExtHostLatencyResult | null>;
}

let providers: ExtHostLatencyProvider[] = [];
function registerLatencyTestProvider(provider: ExtHostLatencyProvider): IDisposable {
	providers.push(provider);
	return {
		dispose: () => {
			for (let i = 0; i < providers.length; i++) {
				if (providers[i] === provider) {
					providers.splice(i, 1);
					return;
				}
			}
		}
	};
}

function getLatencyTestProviders(): ExtHostLatencyProvider[] {
	return providers.slice(0);
}

export class MeasureExtHostLatencyAction extends Action {
	public static readonly ID = 'editor.action.measureExtHostLatency';
	public static readonly LABEL = nls.localize('measureExtHostLatency', "Measure Extension Host Latency");

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly _editorService: IEditorService
	) {
		super(id, label);
	}

	public async run(): Promise<any> {
		const measurements = await Promise.all(getLatencyTestProviders().map(provider => provider.measure()));
		this._editorService.openEditor({ contents: measurements.map(MeasureExtHostLatencyAction._print).join('\n\n'), options: { pinned: true } } as IUntitledResourceInput);
	}

	private static _print(m: ExtHostLatencyResult): string {
		return `${m.remoteAuthority ? `Authority: ${m.remoteAuthority}\n` : ``}Roundtrip latency: ${m.latency.toFixed(3)}ms\nUp: ${MeasureExtHostLatencyAction._printSpeed(m.up)}\nDown: ${MeasureExtHostLatencyAction._printSpeed(m.down)}\n`;
	}

	private static _printSpeed(n: number): string {
		if (n <= 1024) {
			return `${n} bps`;
		}
		if (n < 1024 * 1024) {
			return `${(n / 1024).toFixed(1)} kbps`;
		}
		return `${(n / 1024 / 1024).toFixed(1)} Mbps`;
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(MeasureExtHostLatencyAction, MeasureExtHostLatencyAction.ID, MeasureExtHostLatencyAction.LABEL), 'Developer: Measure Extension Host Latency', nls.localize('developer', "Developer"));
