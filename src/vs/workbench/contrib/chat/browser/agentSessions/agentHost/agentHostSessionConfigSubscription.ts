/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { NotificationType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';

/** Retries an early subscription failure once the host announces that the session exists. */
export function retrySessionConfigSubscriptionOnCreation(connection: IAgentConnection, session: URI, subscription: IAgentSubscription<SessionState>, retry: () => void): IDisposable {
	const store = new DisposableStore();
	let creationAnnounced = false;
	const retryIfFailed = () => {
		if (creationAnnounced && subscription.value instanceof Error) {
			creationAnnounced = false;
			// Let every consumer observe the error before retrying disposes the shared subscription.
			queueMicrotask(() => {
				if (!store.isDisposed) {
					retry();
				}
			});
		}
	};
	store.add(connection.onDidNotification(notification => {
		if (notification.type === NotificationType.SessionAdded && isEqual(URI.parse(notification.summary.resource), session)) {
			creationAnnounced = subscription.value === undefined || subscription.value instanceof Error;
			retryIfFailed();
		}
	}));
	store.add(subscription.onDidChange(() => creationAnnounced = false));
	if (subscription.onDidError) {
		store.add(subscription.onDidError(retryIfFailed));
	}
	return store;
}
