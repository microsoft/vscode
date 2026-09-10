/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { parseAnnotationsUri } from './annotationsUri.js';
import { parseChangesetUri } from './changesetUri.js';
import { parseDefaultChatUri, parseSubagentSessionUri } from './state/sessionState.js';

export const IAgentHostSubscriptionService = createDecorator<IAgentHostSubscriptionService>('agentHostSubscriptionService');

/**
 * Authoritative registry of logical protocol clients observing Agent Host state.
 */
export interface IAgentHostSubscriptionService {
	readonly _serviceBrand: undefined;

	readonly subscribedResources: Iterable<URI>;

	addSubscriber(resource: URI, clientId: string): boolean;
	removeSubscriber(resource: URI, clientId: string): boolean;
	hasSubscribers(resource: URI): boolean;
	hasSessionSubscribers(resource: URI): boolean;
}

export function resolveAgentHostSession(resource: URI): URI {
	const resourceString = resource.toString();
	const changesetSession = parseChangesetUri(resourceString)?.sessionUri;
	const annotationsSession = parseAnnotationsUri(resourceString)?.sessionUri;
	const chatSession = parseDefaultChatUri(resourceString);
	let session = URI.parse(changesetSession ?? annotationsSession ?? chatSession ?? resourceString);
	let subagent;
	while ((subagent = parseSubagentSessionUri(session))) {
		session = subagent.parentSession;
	}
	return session;
}
