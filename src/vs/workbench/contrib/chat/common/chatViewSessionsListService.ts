/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, IObservable } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ChatConfiguration } from './constants.js';

export const IChatViewSessionsListService = createDecorator<IChatViewSessionsListService>('chatViewSessionsListService');

/**
 * Whether the Chat view of a window shows the sessions of the Agents window ({@link ChatConfiguration.ChatViewSessionsListEnabled}),
 * and so which local agent host agents the window surfaces.
 */
export interface IChatViewSessionsListService {
	readonly _serviceBrand: undefined;

	/** Whether the Chat view shows the sessions of the Agents window, as its setting changes. */
	readonly enabled: IObservable<boolean>;

	/**
	 * Whether the window surfaces every local agent host agent, as the Agents window does: the Agents window, and a local editor
	 * window while its Chat view shows the sessions of the Agents window, so that its list and chats are those of the Agents
	 * window. A remote window never does.
	 */
	readonly surfacesAllLocalAgentHostAgents: IObservable<boolean>;
}

export class ChatViewSessionsListService implements IChatViewSessionsListService {

	declare readonly _serviceBrand: undefined;

	readonly enabled: IObservable<boolean>;
	readonly surfacesAllLocalAgentHostAgents: IObservable<boolean>;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		const setting = observableConfigValue<boolean>(ChatConfiguration.ChatViewSessionsListEnabled, false, configurationService);
		this.enabled = derived(this, reader => setting.read(reader) === true);
		this.surfacesAllLocalAgentHostAgents = environmentService.isSessionsWindow
			? constObservable(true)
			: environmentService.remoteAuthority ? constObservable(false) : this.enabled;
	}
}

registerSingleton(IChatViewSessionsListService, ChatViewSessionsListService, InstantiationType.Delayed);
