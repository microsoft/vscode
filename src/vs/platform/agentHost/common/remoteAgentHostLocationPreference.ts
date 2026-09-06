/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

/**
 * Where a remote host's agents should run: a dedicated (standalone) agent
 * host process, or inside a remote VS Code editor window.
 */
export type RemoteAgentHostLocationPreference = 'dedicated' | 'editor';

/** Narrow an unknown value to a valid {@link RemoteAgentHostLocationPreference}. */
export function isRemoteAgentHostLocationPreference(value: unknown): value is RemoteAgentHostLocationPreference {
	return value === 'dedicated' || value === 'editor';
}

export const IRemoteAgentHostLocationPreferenceService = createDecorator<IRemoteAgentHostLocationPreferenceService>('remoteAgentHostLocationPreferenceService');

/**
 * Tracks the user's preferred agent run location per remote host, keyed by a
 * stable host key (e.g. `ssh:<alias>` or `tunnel:<tunnelId>`). Setting a
 * preference only persists it; it does not itself connect, disconnect, or
 * migrate any running session.
 */
export interface IRemoteAgentHostLocationPreferenceService {
	readonly _serviceBrand: undefined;

	/** Fires with the host key whose preference changed. */
	readonly onDidChangePreference: Event<string>;

	/** Get the stored preference for `hostKey`, or `undefined` if none is set. */
	getPreference(hostKey: string): RemoteAgentHostLocationPreference | undefined;

	/** Store the preference for `hostKey`. */
	setPreference(hostKey: string, preference: RemoteAgentHostLocationPreference): void;
}
