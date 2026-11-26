/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IAgentsViewProvidersService = createDecorator<IAgentsViewProvidersService>('agentsViewProvidersService');

/**
 * Holds the sessions providers of an editor window. Their sessions are known only while something holds them: what shows
 * sessions while it shows (see `IEditorWindowSessionsRuntime`), or an open of a session until it shows.
 */
export interface IAgentsViewProvidersService {
	readonly _serviceBrand: undefined;

	/** Registers the providers, unless they are, and holds them until the returned disposable is disposed. */
	acquire(): IDisposable;

	/** Asks `participant` before it releases the providers, until the returned disposable is disposed. */
	registerReleaseParticipant(participant: IAgentsViewProvidersReleaseParticipant): IDisposable;
}

/** What takes part as the providers of an editor window are released, such as what holds new-session composers, whose drafts are their sessions. */
export interface IAgentsViewProvidersReleaseParticipant {
	/** Prepares for the providers to go, such as by closing the composers the user left; resolves to whether they can go. */
	prepareRelease(): Promise<boolean>;
}
