/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { OAuthChannelClient } from '../../../../platform/oauth/common/oauthIpc.js';
import { IOAuthCallbackService, IOAuthResult } from '../common/oauthCallbackService.js';

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

		this.oauthClient = new OAuthChannelClient(this.mainProcessService.getChannel('oauth'));

		this._register(this.oauthClient.onDidCompleteOAuth((result: IOAuthResult) => {
			this.logService.info('OAuth completion received from main process:', result);
			this._onAuthenticationComplete.fire(result);
		}));
	}

	async startOAuthFlow(authUrl: string): Promise<void> {
		try {
			this.logService.info('Starting OAuth flow via main process with URL:', authUrl);
			await this.oauthClient.startOAuthFlow(authUrl);
		} catch (error) {
			this.logService.error('Failed to start OAuth flow:', error);
			throw error;
		}
	}

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
