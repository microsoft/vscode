/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProtectedResourceMetadata } from './state/protocol/state.js';

export const copilotEntraClientId = 'aebc6443-996d-45c2-90f0-388ff96faa56';
export const copilotEntraAuthorizationServer = 'https://login.microsoftonline.com/organizations';
export const copilotEntraDiscoveryResource = 'https://graph.microsoft.com';
export const copilotEntraEmuAudience = '12f6db80-0741-4a7e-b9c5-b85d737b3a31';
export const copilotEntraM365Audience = '42c8f7bd-c7a8-4ba9-bc1c-91edfb716247';

/** Resource identifiers corresponding to the packaged runtime's Entra audiences. */
export const copilotEntraResources: ReadonlyMap<string, string> = new Map([
	[copilotEntraEmuAudience, 'https://github.com/login/oauth/access_token'],
	[copilotEntraM365Audience, 'https://df.loki.delve.office.com/api/v1/llmapi'],
]);

export function isCopilotEntraResource(resource: ProtectedResourceMetadata): boolean {
	return (resource.resource === copilotEntraDiscoveryResource || [...copilotEntraResources.values()].includes(resource.resource))
		&& resource.authorization_servers?.length === 1
		&& resource.authorization_servers[0] === copilotEntraAuthorizationServer;
}
