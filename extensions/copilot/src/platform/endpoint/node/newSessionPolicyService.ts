/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../util/vs/base/common/async';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IEnvService } from '../../env/common/envService';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { ICAPIClientService } from '../common/capiClient';
import { IDomainService } from '../common/domainService';
import { INTEGRATION_ID } from '../common/licenseAgreement';
import { NewSessionDefault, parseNewSessionPolicy } from '../common/newSessionPolicy';

export class NewSessionPolicyService extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private _decision: NewSessionDefault | undefined;
	get decision(): NewSessionDefault | undefined { return this._decision; }
	private _generation = 0;
	private _request: AbortController | undefined;
	private _pending: Promise<NewSessionDefault | undefined> | undefined;

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ICAPIClientService private readonly capiClientService: ICAPIClientService,
		@IDomainService domainService: IDomainService,
		@IFetcherService private readonly fetcherService: IFetcherService,
		@IEnvService private readonly envService: IEnvService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(authenticationService.onDidAuthenticationChange(() => this.clear()));
		this._register(domainService.onDidChangeDomains(event => {
			if (event.capiUrlChanged) {
				this.clear();
			}
		}));
	}

	private clear(notify = true): void {
		this._generation++;
		this._request?.abort();
		this._request = undefined;
		this._pending = undefined;
		this._decision = undefined;
		if (notify) {
			this._onDidChange.fire();
		}
	}

	refresh(): Promise<NewSessionDefault | undefined> {
		if (this._pending) {
			return this._pending;
		}
		const fetch = this.fetchPolicy();
		const generation = this._generation;
		const pending = raceTimeout(fetch, 5000, () => {
			if (generation === this._generation) {
				this.logService.warn('[NewSessionPolicy] Session policy request timed out');
				this.clear(false);
			}
		});
		this._pending = pending;
		void pending.finally(() => {
			if (this._pending === pending) {
				this._pending = undefined;
			}
		});
		return pending;
	}

	private async fetchPolicy(): Promise<NewSessionDefault | undefined> {
		this.clear(false);
		if (!this.authenticationService.hasCopilotTokenSource) {
			return;
		}
		const generation = this._generation;
		const request = new AbortController();
		this._request = request;
		try {
			const token = await this.authenticationService.getCopilotToken();
			if (generation !== this._generation || request.signal.aborted) {
				return;
			}
			const response = await this.fetcherService.fetch(new URL('/chat/session-policy', this.capiClientService.capiPingURL).toString(), {
				method: 'GET',
				callSite: 'chat.session-policy',
				signal: request.signal,
				headers: {
					Authorization: `Bearer ${token.token}`,
					'Copilot-Integration-Id': INTEGRATION_ID,
					'Editor-Version': `vscode/${this.envService.vscodeVersion}`,
					'Editor-Plugin-Version': `copilot-chat/${this.envService.getVersion()}`,
					'X-Copilot-New-Session-Policy': '1',
					'Cache-Control': 'no-cache',
				},
			});
			if (generation !== this._generation) {
				return;
			}
			if (response.status === 404) {
				this.logService.debug('[NewSessionPolicy] Endpoint unavailable');
				return;
			}
			if (response.status !== 200) {
				throw new Error(`Session policy request failed (${response.status})`);
			}
			const decision = parseNewSessionPolicy(await response.json());
			if (generation === this._generation && !request.signal.aborted) {
				this._decision = decision;
				return decision;
			}
		} catch (error) {
			if (generation === this._generation) {
				this.logService.warn(`[NewSessionPolicy] Could not resolve session policy: ${error}`);
			}
		} finally {
			if (this._request === request) {
				this._request = undefined;
			}
		}
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}
}
