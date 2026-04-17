/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// test-workbench_change - new file

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js'; // test-workbench_change
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js'; // test-workbench_change
import {
	ITsCodeAuthService,
	ITsCodeTokenStore,
	StoredToken,
	TokenResponse,
	TSCODE_BASE_URL,
	TSCODE_GATEWAY_BASE_URL,
	TSCODE_AUTH_MOCK_TOKEN,
} from '../common/tsCodeAuth.js';

export class TsCodeAuthService extends Disposable implements ITsCodeAuthService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidLogin = this._register(new Emitter<void>());
	readonly onDidLogin: Event<void> = this._onDidLogin.event;

	private readonly _onDidLogout = this._register(new Emitter<void>());
	readonly onDidLogout: Event<void> = this._onDidLogout.event;

	private readonly _onDidNeedLogin = this._register(new Emitter<void>());
	readonly onDidNeedLogin: Event<void> = this._onDidNeedLogin.event;

	private readonly _onDidStartOAuth = this._register(new Emitter<void>());
	readonly onDidStartOAuth: Event<void> = this._onDidStartOAuth.event;

	private readonly _onDidLoginError = this._register(new Emitter<string>());
	readonly onDidLoginError: Event<string> = this._onDidLoginError.event;

	private readonly _onDidSecurityError = this._register(new Emitter<string>());
	readonly onDidSecurityError: Event<string> = this._onDidSecurityError.event;

	// test-workbench_change start
	private _pollingTimer: ReturnType<typeof setTimeout> | undefined;
	private _currentAppCode: string | undefined;
	// test-workbench_change end

	constructor(
		@ITsCodeTokenStore private readonly tokenStore: ITsCodeTokenStore,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService, // test-workbench_change
		@ITelemetryService private readonly telemetryService: ITelemetryService, // test-workbench_change
	) {
		super();
	}

	async checkAndHandleAuth(): Promise<void> {
		try {
			const token = await this.tokenStore.getToken();
			if (token) {
				return;
			}
			this._onDidNeedLogin.fire();
		} catch (err) {
			this.logService.error('[TsCodeAuthService] checkAndHandleAuth failed', err);
			this._onDidNeedLogin.fire();
		}
	}

	buildAuthorizationUrl(): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const randomSegment = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
		this._currentAppCode = `${randomSegment(4)}-${randomSegment(4)}`;
		return `${TSCODE_BASE_URL}/sign-in?app_code=${this._currentAppCode}`;
	}

	async startOAuthFlow(): Promise<void> {
		const url = this.buildAuthorizationUrl();
		// test-workbench_change start: pass url as string to preserve %2F encoding in redirect_uri
		await this.openerService.open(url, { openExternal: true });
		// test-workbench_change end
		this._onDidStartOAuth.fire();
		this._startPolling();
	}

	// test-workbench_change start
	private _startPolling(): void {
		this.stopPolling();
		if (!this._currentAppCode) {
			return;
		}
		const appCode = this._currentAppCode;

		if (this.productService.tsCodeAuthMockEnabled) { // test-workbench_change
			this._pollingTimer = setTimeout(async () => {
				await this.tokenStore.saveToken(TSCODE_AUTH_MOCK_TOKEN);
				this._onDidLogin.fire();
			}, 10000);
			return;
		}

		const poll = async () => {
			try {
				const response = await fetch(`${TSCODE_GATEWAY_BASE_URL}/login/relate-token?appCode=${encodeURIComponent(appCode)}`, {
					method: 'GET',
				});
				if (response.ok) {
					const data = await response.json() as TokenResponse;
					if (data.returnCode === 'SUC0000' && data.body) {
						this.stopPolling();
						const storedToken: StoredToken = {
							token: data.body.token,
							refreshToken: data.body.refreshToken,
							idToken: data.body.idToken,
							userName: data.body.userName,
							employeeId: data.body.employeeId,
							rtcId: data.body.rtcId,
							pathId: data.body.pathId,
							pathName: data.body.pathName,
						};
						await this.tokenStore.saveToken(storedToken);
						this._sendLoginTelemetry(storedToken.employeeId, storedToken.userName); // test-workbench_change
						this._onDidLogin.fire();
						return;
					}
				}
			} catch (err) {
				this.logService.warn('[TsCodeAuthService] polling relate-token failed, will retry', err);
			}
			this._pollingTimer = setTimeout(poll, 3000);
		};

		this._pollingTimer = setTimeout(poll, 3000);
	}

	stopPolling(): void {
		if (this._pollingTimer !== undefined) {
			clearTimeout(this._pollingTimer);
			this._pollingTimer = undefined;
		}
	}

	// test-workbench_change start
	private _sendLoginTelemetry(userId?: string, userName?: string): void {
		type TsCodeLoginCompletedClassification = {
			owner: 'tsCodeTeam';
			comment: 'Tracks when TsCode authentication login completes successfully';
			userId: { classification: 'EndUserPseudonymizedInformation'; purpose: 'FeatureInsight'; comment: 'The employee id of the logged-in user' };
			userName: { classification: 'EndUserPseudonymizedInformation'; purpose: 'FeatureInsight'; comment: 'The username of the logged-in user' };
		};
		type TsCodeLoginCompletedEvent = {
			userId: string;
			userName: string;
		};
		this.telemetryService.publicLog2<TsCodeLoginCompletedEvent, TsCodeLoginCompletedClassification>(
			'tsCodeAuth.loginCompleted',
			{
				userId: userId ?? '',
				userName: userName ?? '',
			}
		);
	}
	// test-workbench_change end

	reportSecurityError(message: string): void {
		this.logService.error('[TsCodeAuthService] Security error:', message);
		this._onDidSecurityError.fire(message);
	}

	async signOut(): Promise<void> { // test-workbench_change
		await this.tokenStore.clearToken();
		this._onDidLogout.fire();
		this._onDidNeedLogin.fire();
	}
}
