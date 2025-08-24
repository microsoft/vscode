/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the AGPL v3 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { OAuthChannelClient } from '../../../../../platform/oauth/common/oauthIpc.js';

export const IOAuthCallbackService = createDecorator<IOAuthCallbackService>('oauthCallbackService');

export interface IOAuthResult {
	api_key?: string;
	error?: string;
	error_description?: string;
}

export interface IOAuthCallbackService {
	readonly _serviceBrand: undefined;
	
	/**
	 * Event fired when OAuth authentication completes
	 */
	readonly onAuthenticationComplete: Event<IOAuthResult>;

	/**
	 * Start OAuth flow by opening a new BrowserWindow
	 * @param authUrl The OAuth authorization URL to load
	 */
	startOAuthFlow(authUrl: string): Promise<void>;

	/**
	 * Stop OAuth flow and close any open windows
	 */
	stopOAuthFlow(): Promise<void>;
}

/**
 * OAuth callback service for Erdos AI authentication
 * Uses IPC communication with main process for BrowserWindow management
 */
export class OAuthCallbackService extends Disposable implements IOAuthCallbackService {
	declare readonly _serviceBrand: undefined;

	private readonly _onAuthenticationComplete = this._register(new Emitter<IOAuthResult>());
	readonly onAuthenticationComplete: Event<IOAuthResult> = this._onAuthenticationComplete.event;

	private readonly oauthClient: OAuthChannelClient;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService
	) {
		super();

		// Set up IPC communication with main process OAuth service
		this.oauthClient = new OAuthChannelClient(this.mainProcessService.getChannel('oauth'));

		// Forward OAuth completion events from main process
		this._register(this.oauthClient.onDidCompleteOAuth((result: IOAuthResult) => {
			this.logService.info('OAuth completion received from main process:', result);
			this._onAuthenticationComplete.fire(result);
		}));
	}

	/**
	 * Start OAuth flow using IPC communication with main process
	 * This delegates to the main process which can safely create BrowserWindows
	 */
	async startOAuthFlow(authUrl: string): Promise<void> {
		try {
			this.logService.info('Starting OAuth flow via main process with URL:', authUrl);
			await this.oauthClient.startOAuthFlow(authUrl);
		} catch (error) {
			this.logService.error('Failed to start OAuth flow:', error);
			throw error;
		}
	}

	/**
	 * Stop OAuth flow and close auth window via main process
	 */
	async stopOAuthFlow(): Promise<void> {
		try {

			await this.oauthClient.stopOAuthFlow();
		} catch (error) {
			this.logService.error('Error stopping OAuth flow:', error);
		}
	}

	override dispose(): void {
		this.stopOAuthFlow();
		super.dispose();
	}
}