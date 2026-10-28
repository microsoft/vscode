/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotClientOptions, CopilotSession } from '@github/copilot-sdk';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import { DeferredPromise, disposableTimeout } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { isAbsolute, join } from '../../../../base/common/path.js';
import { isObject } from '../../../../base/common/types.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import type { ILogService } from '../../../log/common/log.js';
import type { AuthenticateParams } from '../../common/agent.js';
import { isNativeEmuResource, isNativeLokiResource, nativeLokiActiveAccountMeta, nativeLokiAuthenticationMeta, NATIVE_EMU_PROTECTED_RESOURCE, NATIVE_EMU_SCOPE, NATIVE_LOKI_PROTECTED_RESOURCE, NATIVE_LOKI_SCOPE, readNativeLokiAuthentication, type INativeLokiProtectedResource } from '../../common/meta/nativeLoki.js';

interface IHostTokenRequest {
	readonly scopes: readonly string[];
	readonly audience?: string;
	readonly accountId?: string;
	readonly reason: 'signIn' | 'renewal';
	readonly signal: AbortSignal;
}

type HostTokenResult = { readonly kind: 'ok'; readonly accessToken: string; readonly accountId: string } | { readonly kind: 'unavailable' };
type NativeModel = Awaited<ReturnType<CopilotClient['rpc']['models']['list']>>['models'][number] & { readonly modelProviderId: 'copilot' | 'loki' | `loki:${string}` };
type NativeCatalogModel = Omit<NativeModel, 'name' | 'capabilities'> & Partial<Pick<NativeModel, 'name' | 'capabilities'>>;
type LoginStep = { readonly kind: 'needs-interaction' | 'awaiting' } | { readonly kind: 'completed'; readonly result: { readonly status: string } } | { readonly kind: 'error'; readonly message: string };

interface INativeLokiRpc {
	readonly accounts: {
		readonly login: {
			begin(params: { kind: 'entra' }): Promise<{ flowId: string; step: LoginStep }>;
			advance(params: { flowId: string }): Promise<LoginStep>;
			cancel(params: { flowId: string }): Promise<void>;
		};
		enumerate(params: { query: { kind: 'accounts' } }): Promise<{ items: readonly { kind: string }[] }>;
	};
}

function hasNativeLokiRpc(rpc: CopilotSession['rpc']): rpc is CopilotSession['rpc'] & INativeLokiRpc {
	return 'accounts' in rpc && isObject(rpc.accounts) && 'login' in rpc.accounts && isObject(rpc.accounts.login)
		&& 'begin' in rpc.accounts.login && typeof rpc.accounts.login.begin === 'function'
		&& 'advance' in rpc.accounts.login && typeof rpc.accounts.login.advance === 'function'
		&& 'cancel' in rpc.accounts.login && typeof rpc.accounts.login.cancel === 'function'
		&& 'enumerate' in rpc.accounts && typeof rpc.accounts.enumerate === 'function';
}

function isNativeCopilotModel(value: unknown): value is NativeCatalogModel {
	if (!isObject(value) || !('modelProviderId' in value) || typeof value.modelProviderId !== 'string'
		|| (value.modelProviderId !== 'copilot' && value.modelProviderId !== 'loki' && !value.modelProviderId.startsWith('loki:'))) {
		return false;
	}
	if (value.modelProviderId !== 'loki' && value.modelProviderId !== 'copilot'
		&& (!('modelProviderAccountLogin' in value) || typeof value.modelProviderAccountLogin !== 'string'
			|| !value.modelProviderAccountLogin || value.modelProviderId !== `loki:${value.modelProviderAccountLogin}`)) {
		throw new Error(localize('nativeLoki.invalidProviderAccount', "The native Loki catalog returned invalid provider account metadata."));
	}
	if (!('id' in value) || typeof value.id !== 'string' || !value.id
		|| ('name' in value && typeof value.name !== 'string')
		|| ('capabilities' in value && !isObject(value.capabilities))) {
		throw new Error(localize('nativeLoki.invalidModel', "The native Loki catalog returned invalid model metadata."));
	}
	return true;
}

/** Development-only host-token bridge for the real Copilot Agent Host connection. */
export class CopilotNativeLoki extends Disposable {
	private readonly _protectedResource: INativeLokiProtectedResource;
	private _identity: { readonly accountId: string; readonly tokens: ReadonlyMap<string, string> } | undefined;
	private readonly _pending = new Map<string, { readonly accountId: string; readonly resource: string; readonly scope: string; readonly result: DeferredPromise<HostTokenResult> }>();

	constructor(
		private readonly _runtimeRoot: string,
		baseUrl: string | undefined,
		private readonly _requestToken: (resource: INativeLokiProtectedResource) => void,
		private readonly _logService: ILogService,
		private readonly _tokenTimeoutMs = 30_000,
		private readonly _selectedAccountId?: string,
		private readonly _enableEmu = false,
	) {
		if (!isAbsolute(_runtimeRoot)) {
			throw new Error(localize('nativeLoki.absolutePath', "The local Loki runtime directory must be an absolute path."));
		}
		const resource = baseUrl ?? NATIVE_LOKI_PROTECTED_RESOURCE.resource;
		if (!isNativeLokiResource(resource)) {
			throw new Error(localize('nativeLoki.invalidEndpoint', "The local Loki experiment only supports the fixed HTTPS DF and MSIT endpoints."));
		}
		super();
		this._protectedResource = {
			...NATIVE_LOKI_PROTECTED_RESOURCE, resource,
			...(_selectedAccountId ? { _meta: nativeLokiAuthenticationMeta({ accountId: _selectedAccountId }) } : {}),
		};
	}

	get protectedResource(): INativeLokiProtectedResource {
		return this._identity?.tokens.has(NATIVE_LOKI_SCOPE) ? {
			...this._protectedResource,
			_meta: { ...this._protectedResource._meta, ...nativeLokiActiveAccountMeta(this._identity.accountId) },
		} : this._protectedResource;
	}

	get emuProtectedResource(): INativeLokiProtectedResource {
		const accountId = this._selectedAccountId;
		const metadata = {
			...(accountId ? nativeLokiAuthenticationMeta({ accountId }) : {}),
			...(this._identity?.tokens.has(NATIVE_EMU_SCOPE) ? nativeLokiActiveAccountMeta(this._identity.accountId) : {}),
		};
		return {
			...NATIVE_EMU_PROTECTED_RESOURCE,
			...(Object.keys(metadata).length > 0 ? { _meta: metadata } : {}),
		};
	}

	get accountId(): string | undefined {
		return this._identity?.accountId;
	}

	get emuEnabled(): boolean {
		return this._enableEmu;
	}

	handlesResource(resource: string): boolean {
		return resource === this.protectedResource.resource || (this._enableEmu && isNativeEmuResource(resource));
	}

	get clientOptions(): CopilotClientOptions & { hostTokenSource: (request: IHostTokenRequest) => Promise<HostTokenResult> } {
		return { hostTokenSource: request => this.acquireToken(request) };
	}

	async resolveRuntimePath(): Promise<string> {
		const root = await fs.realpath(this._runtimeRoot);
		const directory = join(root, 'prebuilds', `${process.platform}-${process.arch}`);
		const executable = join(directory, process.platform === 'win32' ? 'copilot-runtime.exe' : 'copilot-runtime');
		await fs.access(executable);
		const hash = createHash('sha256').update(await fs.readFile(join(directory, 'runtime.node'))).digest('hex');
		this._logService.info(`[Copilot][Native Loki] Runtime=${executable}; native addon SHA-256=${hash}; endpoint=${this.protectedResource.resource}; transport=SDK stdio; no diagnostic network wrapper`);
		return executable;
	}

	acceptToken(params: AuthenticateParams): { readonly identityChanged: boolean; readonly tokenChanged: boolean } {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const metadata = readNativeLokiAuthentication(params);
		if (metadata?.requestId) {
			const pending = this._pending.get(metadata.requestId);
			if (!pending || pending.accountId !== metadata.accountId || this._identity?.accountId !== metadata.accountId) {
				throw new CancellationError();
			}
			if (params.resource !== pending.resource || params.scopes?.length !== 1 || params.scopes[0] !== pending.scope) {
				throw new Error(localize('nativeLoki.invalidCallbackToken', "The local Microsoft bridge requires an account-bound token for the requested resource and scope."));
			}
			pending.result.complete(params.token ? { kind: 'ok', accessToken: params.token, accountId: metadata.accountId } : { kind: 'unavailable' });
			return { identityChanged: false, tokenChanged: false };
		}
		const scope = params.scopes?.length === 1 ? params.scopes[0] : undefined;
		if (!scope || ((params.resource !== this.protectedResource.resource || scope !== NATIVE_LOKI_SCOPE)
			&& (!this._enableEmu || params.resource !== NATIVE_EMU_PROTECTED_RESOURCE.resource || scope !== NATIVE_EMU_SCOPE))
			|| (params.token && (!metadata || (this._selectedAccountId && metadata.accountId !== this._selectedAccountId)))) {
			throw new Error(this._enableEmu
				? localize('nativeLoki.invalidDualToken', "The local Microsoft bridge requires an account-bound token for a supported resource and scope.")
				: localize('nativeLoki.invalidToken', "The local Loki bridge requires a Microsoft account-bound token for the exact Loki scope."));
		}
		const previous = this._identity;
		if (metadata?.accountId && previous && metadata.accountId !== previous.accountId) {
			throw new CancellationError();
		}
		const tokens = new Map(previous?.tokens);
		if (params.token) {
			tokens.set(scope, params.token);
		} else {
			tokens.delete(scope);
		}
		const identity = params.token && metadata ? { accountId: metadata.accountId, tokens }
			: previous && tokens.size > 0 ? { accountId: previous.accountId, tokens } : undefined;
		const identityChanged = previous?.accountId !== identity?.accountId;
		const tokenChanged = previous?.tokens.get(scope) !== identity?.tokens.get(scope) || identityChanged;
		this._identity = identity;
		if (tokenChanged) {
			this.cancelTokenRequests();
		}
		return { identityChanged, tokenChanged };
	}

	async acquireToken(request: IHostTokenRequest): Promise<HostTokenResult> {
		const identity = this._identity;
		if (request.signal.aborted || !identity || (request.accountId && request.accountId !== identity.accountId)) {
			return { kind: 'unavailable' };
		}
		if (request.reason === 'signIn' && request.scopes.length === 0) {
			if (request.audience !== undefined) {
				throw new Error(localize('nativeLoki.unexpectedRequest', "The runtime requested an unexpected Microsoft resource or account."));
			}
			const accessToken = identity.tokens.get(NATIVE_LOKI_SCOPE) ?? identity.tokens.get(NATIVE_EMU_SCOPE);
			return accessToken ? { kind: 'ok', accessToken, accountId: identity.accountId } : { kind: 'unavailable' };
		}
		const scope = request.scopes[0];
		if (request.scopes.length !== 1 || (scope !== NATIVE_LOKI_SCOPE && (!this._enableEmu || scope !== NATIVE_EMU_SCOPE))
			|| request.audience !== scope.split('/')[0] || !request.accountId) {
			throw new Error(localize('nativeLoki.unexpectedRequest', "The runtime requested an unexpected Microsoft resource or account."));
		}
		const resource = scope === NATIVE_LOKI_SCOPE ? this.protectedResource : NATIVE_EMU_PROTECTED_RESOURCE;
		const requestId = generateUuid();
		const result = new DeferredPromise<HostTokenResult>();
		const store = new DisposableStore();
		const cancel = () => result.complete({ kind: 'unavailable' });
		store.add(toDisposable(() => request.signal.removeEventListener('abort', cancel)));
		request.signal.addEventListener('abort', cancel, { once: true });
		store.add(disposableTimeout(() => result.error(new Error(localize('nativeLoki.tokenTimeout', "Timed out waiting for VS Code to renew the Microsoft token."))), this._tokenTimeoutMs));
		this._pending.set(requestId, { accountId: identity.accountId, resource: resource.resource, scope, result });
		try {
			this._logService.info('[Copilot][Native Loki] Requesting account-bound Microsoft token from VS Code');
			this._requestToken({
				...resource,
				_meta: nativeLokiAuthenticationMeta({ requestId, accountId: identity.accountId }),
			});
			return await result.p;
		} finally {
			this._pending.delete(requestId);
			store.dispose();
		}
	}

	cancelTokenRequests(): void {
		for (const pending of this._pending.values()) {
			pending.result.complete({ kind: 'unavailable' });
		}
		this._pending.clear();
	}

	private async _authenticateSession(session: CopilotSession): Promise<INativeLokiRpc> {
		const rpc = session.rpc;
		if (!hasNativeLokiRpc(rpc)) {
			throw new Error(localize('nativeLoki.sdkRequired', "The local Loki experiment requires the SDK build with host-token RPC support."));
		}
		const flow = await rpc.accounts.login.begin({ kind: 'entra' });
		let step = flow.step;
		try {
			while (step.kind === 'needs-interaction' || step.kind === 'awaiting') {
				step = await rpc.accounts.login.advance({ flowId: flow.flowId });
			}
			if (step.kind !== 'completed' || step.result.status !== 'completed') {
				throw new Error(localize('nativeLoki.signInFailed', "The runtime could not establish the VS Code-owned Microsoft identity."));
			}
		} finally {
			if (step.kind !== 'completed' && step.kind !== 'error') {
				await rpc.accounts.login.cancel({ flowId: flow.flowId });
			}
		}
		const accounts = await rpc.accounts.enumerate({ query: { kind: 'accounts' } });
		const kinds = new Set(accounts.items.map(account => account.kind));
		if (!kinds.has('entra')
			|| (this._enableEmu ? !kinds.has('loki') && !kinds.has('entraEmu') : !kinds.has('loki') || kinds.size !== 2)) {
			throw new Error(localize('nativeLoki.unexpectedAccounts', "The local Copilot runtime did not register the expected Microsoft accounts."));
		}
		this._logService.info(`[Copilot][Native Loki] SDK session ${session.sessionId} authenticated with the VS Code-owned Microsoft account`);
		return rpc;
	}

	private async _listSessionModels(session: CopilotSession): Promise<NativeModel[]> {
		const request = { skipCache: true, pickerFacing: false };
		const { list } = await session.rpc.model.list(request);
		const models: NativeModel[] = [];
		for (const model of list) {
			if (typeof model === 'object' && model !== null && isNativeCopilotModel(model)
				&& (this._enableEmu || model.modelProviderId !== 'copilot')) {
				models.push({ ...model, name: model.name ?? model.id, capabilities: model.capabilities ?? {} });
			}
		}
		if (models.length === 0) {
			throw new Error(this._enableEmu
				? localize('nativeLoki.noModelsDual', "The native Copilot runtime returned no available models for this Microsoft account.")
				: localize('nativeLoki.noModels', "The native Loki catalog returned no models. No Copilot fallback will be used."));
		}
		return models;
	}

	async listModels(client: CopilotClient): Promise<NativeModel[]> {
		const session = await client.createSession({
			availableTools: [],
			enableConfigDiscovery: false,
			infiniteSessions: { enabled: false },
			onPermissionRequest: () => ({ kind: 'denied-interactively-by-user' }),
		});
		try {
			await this._authenticateSession(session);
			this._logService.info(`[Copilot][Native Loki] Requesting native catalog via SDK session ${session.sessionId}`);
			return await this._listSessionModels(session);
		} finally {
			await client.deleteSession(session.sessionId);
		}
	}

	async prepareSession(session: CopilotSession, modelId: string | undefined): Promise<void> {
		await this._authenticateSession(session);
		const models = await this._listSessionModels(session);
		const model = modelId ? models.find(model => model.id === modelId) : models.find(model => model.id.includes('gpt-5-mini')) ?? models[0];
		if (!model) {
			throw new Error(localize('nativeLoki.modelUnavailable', "The selected model is not in the native Loki catalog."));
		}
		await session.setModel(model.id);
		this._logService.info(`[Copilot][Native Loki] SDK session ${session.sessionId} selected native model ${model.id}`);
	}

	override dispose(): void {
		this._identity = undefined;
		this.cancelTokenRequests();
		super.dispose();
	}
}
