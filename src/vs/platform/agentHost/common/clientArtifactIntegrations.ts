/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../base/common/lifecycle.js';
import type { IObservable } from '../../../base/common/observable.js';
import type { ArtifactIntegrationDescriptor, IArtifactIntegrationAccess } from '../../artifactIntegrations/common/artifactIntegration.js';

/** Integrations that a connected client coordinates, exposed to an agent host without moving their authority. */
export interface IClientArtifactIntegrations {
	readonly access: IArtifactIntegrationAccess;
	readonly integrations: IObservable<readonly ArtifactIntegrationDescriptor[]>;
}

/** Receives the integrations each connected client offers to the agent host. */
export interface IClientArtifactIntegrationRegistry {
	register(clientId: string, integrations: IClientArtifactIntegrations): IDisposable;
}
