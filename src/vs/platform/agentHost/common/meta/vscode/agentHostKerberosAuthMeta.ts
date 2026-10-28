/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const AgentHostKerberosAuthCapabilityMetaKey = 'vscode.kerberosAuth';

export function supportsAgentHostKerberosAuth(value: { readonly _meta?: Record<string, unknown> }): boolean {
	return value._meta?.[AgentHostKerberosAuthCapabilityMetaKey] === true;
}
