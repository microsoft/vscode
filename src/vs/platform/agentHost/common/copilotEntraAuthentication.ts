/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotServiceKind } from '../../../base/common/defaultAccount.js';

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

/** Returns the Copilot service whose Entra resource is `resource`, or `undefined` for any other resource. */
export function copilotServiceForResource(resource: string): CopilotServiceKind | undefined {
	switch (resource) {
		case copilotEntraResources.get(copilotEntraEmuAudience): return 'github';
		case copilotEntraResources.get(copilotEntraM365Audience): return 'm365';
		default: return undefined;
	}
}
