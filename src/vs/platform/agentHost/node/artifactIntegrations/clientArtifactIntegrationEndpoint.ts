/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { ILogService } from '../../../log/common/log.js';
import { ArtifactIntegrationDescriptor } from '../../../artifactIntegrations/common/artifactIntegration.js';
import type { IClientArtifactIntegrationRegistry } from '../../common/clientArtifactIntegrations.js';
import { ArtifactIntegrationClient, ArtifactIntegrationRequest, ArtifactIntegrationResponse, ArtifactIntegrationUpdate, isArtifactIntegrationResponse, isArtifactIntegrationUpdate } from '../../../artifactIntegrations/common/artifactIntegrationProtocol.js';
import { isArtifactIntegrationDescriptor, isRecord } from '../../../artifactIntegrations/common/artifactIntegrationValidation.js';
import { ClientArtifactIntegrationUpdateExtensionMethod, RegisterClientArtifactIntegrationsExtensionMethod } from '../../common/agentHostExtensionProtocol.js';

const MAX_CLIENT_INTEGRATIONS = 100;

/** How long the host waits for the client before treating the outcome of a request as uncertain. */
const CLIENT_REQUEST_TIMEOUT = 60_000;

/** Accepts one connection's offer of the integrations its client coordinates and relays host requests to them. */
export class ClientArtifactIntegrationEndpoint extends Disposable {
	private readonly updates = this._register(new Emitter<ArtifactIntegrationUpdate>());
	private readonly integrations = observableValue<readonly ArtifactIntegrationDescriptor[]>(this, []);
	private readonly registration = this._register(new MutableDisposable<DisposableStore>());

	/**
	 * @param sendRequest Sends a request to the client over this endpoint's connection; it should stop waiting for
	 * an answer after the given number of milliseconds.
	 */
	constructor(
		private readonly clientId: string,
		private readonly registry: IClientArtifactIntegrationRegistry,
		private readonly sendRequest: (request: ArtifactIntegrationRequest, timeout: number) => Promise<unknown>,
		private readonly logService: ILogService,
	) {
		super();
	}

	/** Handles this endpoint's client requests, returning `undefined` for any other method. */
	handleRequest(method: string, params: unknown): Promise<void> | undefined {
		if (method === RegisterClientArtifactIntegrationsExtensionMethod) {
			return Promise.resolve().then(() => this.register(params));
		}
		if (method === ClientArtifactIntegrationUpdateExtensionMethod) {
			if (!isArtifactIntegrationUpdate(params)) {
				return Promise.reject(new Error('Invalid client artifact integration update'));
			}
			this.updates.fire(params);
			return Promise.resolve();
		}
		return undefined;
	}

	private register(params: unknown): void {
		const offered = isRecord(params) && Array.isArray(params.integrations) ? params.integrations : undefined;
		if (this._store.isDisposed || !offered) {
			throw new Error('Invalid client artifact integrations');
		}
		// Integrations come from independent extensions, so one malformed entry must not withdraw the others.
		const integrations = offered.filter(isArtifactIntegrationDescriptor).slice(0, MAX_CLIENT_INTEGRATIONS);
		if (integrations.length !== offered.length) {
			this.logService.warn(`[ArtifactIntegrations] Ignored ${offered.length - integrations.length} invalid or excess client artifact integrations`);
		}
		this.integrations.set(integrations, undefined);
		if (!integrations.length) {
			this.registration.clear();
			return;
		}
		if (this.registration.value) {
			return;
		}
		const store = new DisposableStore();
		const access = store.add(new ArtifactIntegrationClient({
			onDidUpdate: this.updates.event,
			request: request => this.request(request),
		}, this.logService));
		store.add(this.registry.register(this.clientId, { access, integrations: this.integrations }));
		this.registration.value = store;
	}

	private async request(request: ArtifactIntegrationRequest): Promise<ArtifactIntegrationResponse> {
		if (this._store.isDisposed) {
			// The client drops everything it served on a connection when that connection ends.
			if (request.kind === 'release') {
				return { kind: 'ok' };
			}
			throw new Error('The VS Code window disconnected; the request was not sent');
		}
		// Armed before sending so that this deadline, not the connection's equal one that only forgets the request, reports the silence.
		const deadline = timeout(CLIENT_REQUEST_TIMEOUT);
		try {
			const response = await Promise.race([
				this.sendRequest(request, CLIENT_REQUEST_TIMEOUT),
				deadline.then(() => { throw new Error('The VS Code window did not respond in time; the outcome of this request is uncertain.'); }),
			]);
			if (!isArtifactIntegrationResponse(response)) {
				throw new Error('Invalid client artifact integration response');
			}
			return response;
		} finally {
			deadline.cancel();
		}
	}
}
