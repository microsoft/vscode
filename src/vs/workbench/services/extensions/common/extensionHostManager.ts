/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as errors from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostCustomersRegistry } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, ExtHostExtensionServiceShape, IExtHostContext, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { ProxyIdentifier } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { IRPCProtocolLogger, RPCProtocol, RequestInitiator, ResponsiveState } from 'vs/workbench/services/extensions/common/rpcProtocol';
import { RemoteAuthorityResolverError, ResolverResult } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as nls from 'vs/nls';
import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { StopWatch } from 'vs/base/common/stopwatch';
import { VSBuffer } from 'vs/base/common/buffer';
import { IExtensionHost, ExtensionHostKind, ActivationKind } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionActivationReason } from 'vs/workbench/api/common/extHostExtensionActivator';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { Barrier, timeout } from 'vs/base/common/async';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';

// Enable to see detailed message communication between window and extension host
const LOG_EXTENSION_HOST_COMMUNICATION = false;
const LOG_USE_COLORS = true;

export interface IExtensionHostManager {
	readonly kind: ExtensionHostKind;
	readonly onDidExit: Event<[number, string | null]>;
	readonly onDidChangeResponsiveState: Event<ResponsiveState>;
	dispose(): void;
	ready(): Promise<void>;
	deltaExtensions(toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): Promise<void>;
	activate(extension: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<boolean>;
	activateByEvent(activationEvent: string, activationKind: ActivationKind): Promise<void>;
	getInspectPort(tryEnableInspector: boolean): Promise<number>;
	resolveAuthority(remoteAuthority: string): Promise<ResolverResult>;
	getCanonicalURI(remoteAuthority: string, uri: URI): Promise<URI>;
	start(enabledExtensionIds: ExtensionIdentifier[]): Promise<void>;
	extensionTestsExecute(): Promise<number>;
	extensionTestsSendExit(exitCode: number): Promise<void>;
	setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void>;
}

export function createExtensionHostManager(instantiationService: IInstantiationService, extensionHost: IExtensionHost, isInitialStart: boolean, initialActivationEvents: string[]): IExtensionHostManager {
	if (extensionHost.lazyStart && isInitialStart && initialActivationEvents.length === 0) {
		return instantiationService.createInstance(LazyStartExtensionHostManager, extensionHost);
	}
	return instantiationService.createInstance(ExtensionHostManager, extensionHost, initialActivationEvents);
}

class ExtensionHostManager extends Disposable implements IExtensionHostManager {

	public readonly kind: ExtensionHostKind;
	public readonly onDidExit: Event<[number, string | null]>;

	private readonly _onDidChangeResponsiveState: Emitter<ResponsiveState> = this._register(new Emitter<ResponsiveState>());
	public readonly onDidChangeResponsiveState: Event<ResponsiveState> = this._onDidChangeResponsiveState.event;

	/**
	 * A map of already requested activation events to speed things up if the same activation event is triggered multiple times.
	 */
	private readonly _cachedActivationEvents: Map<string, Promise<void>>;
	private _rpcProtocol: RPCProtocol | null;
	private readonly _customers: IDisposable[];
	private readonly _extensionHost: IExtensionHost;
	/**
	 * winjs believes a proxy is a promise because it has a `then` method, so wrap the result in an object.
	 */
	private _proxy: Promise<{ value: ExtHostExtensionServiceShape; } | null> | null;
	private _resolveAuthorityAttempt: number;
	private _hasStarted = false;

	constructor(
		extensionHost: IExtensionHost,
		initialActivationEvents: string[],
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._cachedActivationEvents = new Map<string, Promise<void>>();
		this._rpcProtocol = null;
		this._customers = [];

		this._extensionHost = extensionHost;
		this.kind = this._extensionHost.kind;
		this.onDidExit = this._extensionHost.onExit;
		this._proxy = this._extensionHost.start()!.then(
			(protocol) => {
				this._hasStarted = true;
				return { value: this._createExtensionHostCustomers(protocol) };
			},
			(err) => {
				console.error(`Error received from starting extension host (kind: ${this.kind})`);
				console.error(err);
				return null;
			}
		);
		this._proxy.then(() => {
			initialActivationEvents.forEach((activationEvent) => this.activateByEvent(activationEvent, ActivationKind.Normal));
			this._register(registerLatencyTestProvider({
				measure: () => this.measure()
			}));
		});
		this._resolveAuthorityAttempt = 0;
	}

	public override dispose(): void {
		if (this._extensionHost) {
			this._extensionHost.dispose();
		}
		if (this._rpcProtocol) {
			this._rpcProtocol.dispose();
		}
		for (let i = 0, len = this._customers.length; i < len; i++) {
			const customer = this._customers[i];
			try {
				customer.dispose();
			} catch (err) {
				errors.onUnexpectedError(err);
			}
		}
		this._proxy = null;

		super.dispose();
	}

	private async measure(): Promise<ExtHostLatencyResult | null> {
		const proxy = await this._getProxy();
		if (!proxy) {
			return null;
		}
		const latency = await this._measureLatency(proxy);
		const down = await this._measureDown(proxy);
		const up = await this._measureUp(proxy);
		return {
			remoteAuthority: this._extensionHost.remoteAuthority,
			latency,
			down,
			up
		};
	}

	private async _getProxy(): Promise<ExtHostExtensionServiceShape | null> {
		if (!this._proxy) {
			return null;
		}
		const p = await this._proxy;
		if (!p) {
			return null;
		}
		return p.value;
	}

	public async ready(): Promise<void> {
		await this._getProxy();
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
		return ExtensionHostManager._convert(SIZE, sw.elapsed());
	}

	private async _measureDown(proxy: ExtHostExtensionServiceShape): Promise<number> {
		const SIZE = 10 * 1024 * 1024; // 10MB

		const sw = StopWatch.create(true);
		await proxy.$test_down(SIZE);
		sw.stop();
		return ExtensionHostManager._convert(SIZE, sw.elapsed());
	}

	private _createExtensionHostCustomers(protocol: IMessagePassingProtocol): ExtHostExtensionServiceShape {

		let logger: IRPCProtocolLogger | null = null;
		if (LOG_EXTENSION_HOST_COMMUNICATION || this._environmentService.logExtensionHostCommunication) {
			logger = new RPCLogger();
		}

		this._rpcProtocol = new RPCProtocol(protocol, logger);
		this._register(this._rpcProtocol.onDidChangeResponsiveState((responsiveState: ResponsiveState) => this._onDidChangeResponsiveState.fire(responsiveState)));
		const extHostContext: IExtHostContext = {
			remoteAuthority: this._extensionHost.remoteAuthority,
			extensionHostKind: this.kind,
			getProxy: <T>(identifier: ProxyIdentifier<T>): T => this._rpcProtocol!.getProxy(identifier),
			set: <T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R => this._rpcProtocol!.set(identifier, instance),
			assertRegistered: (identifiers: ProxyIdentifier<any>[]): void => this._rpcProtocol!.assertRegistered(identifiers),
			drain: (): Promise<void> => this._rpcProtocol!.drain(),
		};

		// Named customers
		const namedCustomers = ExtHostCustomersRegistry.getNamedCustomers();
		for (let i = 0, len = namedCustomers.length; i < len; i++) {
			const [id, ctor] = namedCustomers[i];
			const instance = this._instantiationService.createInstance(ctor, extHostContext);
			this._customers.push(instance);
			this._rpcProtocol.set(id, instance);
		}

		// Customers
		const customers = ExtHostCustomersRegistry.getCustomers();
		for (const ctor of customers) {
			const instance = this._instantiationService.createInstance(ctor, extHostContext);
			this._customers.push(instance);
		}

		// Check that no named customers are missing
		const expected: ProxyIdentifier<any>[] = Object.keys(MainContext).map((key) => (<any>MainContext)[key]);
		this._rpcProtocol.assertRegistered(expected);

		return this._rpcProtocol.getProxy(ExtHostContext.ExtHostExtensionService);
	}

	public async activate(extension: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<boolean> {
		const proxy = await this._getProxy();
		if (!proxy) {
			return false;
		}
		return proxy.$activate(extension, reason);
	}

	public activateByEvent(activationEvent: string, activationKind: ActivationKind): Promise<void> {
		if (activationKind === ActivationKind.Immediate && !this._hasStarted) {
			return Promise.resolve();
		}

		if (!this._cachedActivationEvents.has(activationEvent)) {
			this._cachedActivationEvents.set(activationEvent, this._activateByEvent(activationEvent, activationKind));
		}
		return this._cachedActivationEvents.get(activationEvent)!;
	}

	private async _activateByEvent(activationEvent: string, activationKind: ActivationKind): Promise<void> {
		if (!this._proxy) {
			return;
		}
		const proxy = await this._proxy;
		if (!proxy) {
			// this case is already covered above and logged.
			// i.e. the extension host could not be started
			return;
		}
		return proxy.value.$activateByEvent(activationEvent, activationKind);
	}

	public async getInspectPort(tryEnableInspector: boolean): Promise<number> {
		if (this._extensionHost) {
			if (tryEnableInspector) {
				await this._extensionHost.enableInspectPort();
			}
			let port = this._extensionHost.getInspectPort();
			if (port) {
				return port;
			}
		}
		return 0;
	}

	public async resolveAuthority(remoteAuthority: string): Promise<ResolverResult> {
		const authorityPlusIndex = remoteAuthority.indexOf('+');
		if (authorityPlusIndex === -1) {
			// This authority does not need to be resolved, simply parse the port number
			const lastColon = remoteAuthority.lastIndexOf(':');
			return Promise.resolve({
				authority: {
					authority: remoteAuthority,
					host: remoteAuthority.substring(0, lastColon),
					port: parseInt(remoteAuthority.substring(lastColon + 1), 10),
					connectionToken: undefined
				}
			});
		}
		const proxy = await this._getProxy();
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

	public async getCanonicalURI(remoteAuthority: string, uri: URI): Promise<URI> {
		const proxy = await this._getProxy();
		if (!proxy) {
			throw new Error(`Cannot resolve canonical URI`);
		}
		const result = await proxy.$getCanonicalURI(remoteAuthority, uri);
		return URI.revive(result);
	}

	public async start(enabledExtensionIds: ExtensionIdentifier[]): Promise<void> {
		const proxy = await this._getProxy();
		if (!proxy) {
			return;
		}
		return proxy.$startExtensionHost(enabledExtensionIds);
	}

	public async extensionTestsExecute(): Promise<number> {
		const proxy = await this._getProxy();
		if (!proxy) {
			throw new Error('Could not obtain Extension Host Proxy');
		}
		return proxy.$extensionTestsExecute();
	}

	public async extensionTestsSendExit(exitCode: number): Promise<void> {
		const proxy = await this._getProxy();
		if (!proxy) {
			return;
		}
		// This method does not wait for the actual RPC to be confirmed
		// It waits for the socket to drain (i.e. the message has been sent)
		// It also times out after 5s in case drain takes too long
		proxy.$extensionTestsExit(exitCode);
		if (this._rpcProtocol) {
			await Promise.race([this._rpcProtocol.drain(), timeout(5000)]);
		}
	}

	public async deltaExtensions(toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): Promise<void> {
		const proxy = await this._getProxy();
		if (!proxy) {
			return;
		}
		return proxy.$deltaExtensions(toAdd, toRemove);
	}

	public async setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void> {
		const proxy = await this._getProxy();
		if (!proxy) {
			return;
		}

		return proxy.$setRemoteEnvironment(env);
	}
}

/**
 * Waits until `start()` and only if it has extensions proceeds to really start.
 */
class LazyStartExtensionHostManager extends Disposable implements IExtensionHostManager {
	public readonly kind: ExtensionHostKind;
	public readonly onDidExit: Event<[number, string | null]>;
	private readonly _onDidChangeResponsiveState: Emitter<ResponsiveState> = this._register(new Emitter<ResponsiveState>());
	public readonly onDidChangeResponsiveState: Event<ResponsiveState> = this._onDidChangeResponsiveState.event;

	private readonly _extensionHost: IExtensionHost;
	private _startCalled: Barrier;
	private _actual: ExtensionHostManager | null;

	constructor(
		extensionHost: IExtensionHost,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._extensionHost = extensionHost;
		this.kind = extensionHost.kind;
		this.onDidExit = extensionHost.onExit;
		this._startCalled = new Barrier();
		this._actual = null;
	}

	private _createActual(reason: string): ExtensionHostManager {
		this._logService.info(`Creating lazy extension host: ${reason}`);
		this._actual = this._register(this._instantiationService.createInstance(ExtensionHostManager, this._extensionHost, []));
		this._register(this._actual.onDidChangeResponsiveState((e) => this._onDidChangeResponsiveState.fire(e)));
		return this._actual;
	}

	private async _getOrCreateActualAndStart(reason: string): Promise<ExtensionHostManager> {
		if (this._actual) {
			// already created/started
			return this._actual;
		}
		const actual = this._createActual(reason);
		await actual.start([]);
		return actual;
	}

	public async ready(): Promise<void> {
		await this._startCalled.wait();
		if (this._actual) {
			await this._actual.ready();
		}
	}
	public async deltaExtensions(toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): Promise<void> {
		await this._startCalled.wait();
		const extensionHostAlreadyStarted = Boolean(this._actual);
		const shouldStartExtensionHost = (toAdd.length > 0);
		if (extensionHostAlreadyStarted || shouldStartExtensionHost) {
			const actual = await this._getOrCreateActualAndStart(`contains ${toAdd.length} new extension(s) (installed or enabled)`);
			return actual.deltaExtensions(toAdd, toRemove);
		}
	}
	public async activate(extension: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<boolean> {
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.activate(extension, reason);
		}
		return false;
	}
	public async activateByEvent(activationEvent: string, activationKind: ActivationKind): Promise<void> {
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.activateByEvent(activationEvent, activationKind);
		}
	}
	public async getInspectPort(tryEnableInspector: boolean): Promise<number> {
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.getInspectPort(tryEnableInspector);
		}
		return 0;
	}
	public async resolveAuthority(remoteAuthority: string): Promise<ResolverResult> {
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.resolveAuthority(remoteAuthority);
		}
		throw new Error(`Cannot resolve authority`);
	}
	public async getCanonicalURI(remoteAuthority: string, uri: URI): Promise<URI> {
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.getCanonicalURI(remoteAuthority, uri);
		}
		throw new Error(`Cannot resolve canonical URI`);
	}
	public async start(enabledExtensionIds: ExtensionIdentifier[]): Promise<void> {
		if (enabledExtensionIds.length > 0) {
			// there are actual extensions, so let's launch the extension host
			const actual = this._createActual(`contains ${enabledExtensionIds.length} extension(s).`);
			const result = actual.start(enabledExtensionIds);
			this._startCalled.open();
			return result;
		}
		// there are no actual extensions
		this._startCalled.open();
	}
	public async extensionTestsExecute(): Promise<number> {
		await this._startCalled.wait();
		const actual = await this._getOrCreateActualAndStart(`execute tests.`);
		return actual.extensionTestsExecute();
	}
	public async extensionTestsSendExit(exitCode: number): Promise<void> {
		await this._startCalled.wait();
		const actual = await this._getOrCreateActualAndStart(`execute tests.`);
		return actual.extensionTestsSendExit(exitCode);
	}
	public async setRemoteEnvironment(env: { [key: string]: string | null; }): Promise<void> {
		await this._startCalled.wait();
		if (this._actual) {
			return this._actual.setRemoteEnvironment(env);
		}
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
		let args = [`%c[${direction}]%c[${String(totalLength).padStart(7)}]%c[len: ${String(msgLength).padStart(5)}]%c${String(req).padStart(5)} - ${str}`, 'color: darkgreen', 'color: grey', 'color: grey', `color: ${color}`];
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
	remoteAuthority: string | null;
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

registerAction2(class MeasureExtHostLatencyAction extends Action2 {

	constructor() {
		super({
			id: 'editor.action.measureExtHostLatency',
			title: {
				value: nls.localize('measureExtHostLatency', "Measure Extension Host Latency"),
				original: 'Measure Extension Host Latency'
			},
			category: CATEGORIES.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor) {

		const editorService = accessor.get(IEditorService);

		const measurements = await Promise.all(getLatencyTestProviders().map(provider => provider.measure()));
		editorService.openEditor({ resource: undefined, contents: measurements.map(MeasureExtHostLatencyAction._print).join('\n\n'), options: { pinned: true } });
	}

	private static _print(m: ExtHostLatencyResult | null): string {
		if (!m) {
			return '';
		}
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
});
