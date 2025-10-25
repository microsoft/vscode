/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IExtensionRecommendationNotificationService, IExtensionRecommendations, RecommendationsNotificationResult } from './extensionRecommendations.js';

export class ExtensionRecommendationNotificationServiceChannelClient implements IExtensionRecommendationNotificationService {

	declare readonly _serviceBrand: undefined;

	constructor(private readonly channel: IChannel) { }

	get ignoredRecommendations(): string[] { throw new Error('not supported'); }

	promptImportantExtensionsInstallNotification(extensionRecommendations: IExtensionRecommendations): Promise<RecommendationsNotificationResult> {
		return this.channel.call('promptImportantExtensionsInstallNotification', [extensionRecommendations]);
	}

	promptWorkspaceRecommendations(recommendations: string[]): Promise<void> {
		throw new Error('not supported');
	}

	hasToIgnoreRecommendationNotifications(): boolean {
		throw new Error('not supported');
	}

}

export class ExtensionRecommendationNotificationServiceChannel implements IServerChannel {

	constructor(private service: IExtensionRecommendationNotificationService) { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'promptImportantExtensionsInstallNotification': return this.service.promptImportantExtensionsInstallNotification(args[0]);
		}

		throw new Error(`Call not found: ${command}`);
	}
}
