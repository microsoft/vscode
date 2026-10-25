/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeParams, ReconnectParams } from '../../state/protocol/common/commands.js';

export const AgentHostClientCertificatesCapabilityMetaKey = 'vscode.clientCertificates';

export function supportsAgentHostClientCertificates(params: InitializeParams | ReconnectParams): boolean {
	return params._meta?.[AgentHostClientCertificatesCapabilityMetaKey] === true;
}
