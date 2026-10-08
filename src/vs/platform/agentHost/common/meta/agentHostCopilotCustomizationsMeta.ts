/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const AgentHostCopilotCustomizationsCapabilityMetaKey = 'vscode.copilotCustomizations';

export function supportsAgentHostCopilotCustomizations(result: { readonly _meta?: Readonly<Record<string, unknown>> } | undefined): boolean {
	return result?._meta?.[AgentHostCopilotCustomizationsCapabilityMetaKey] === true;
}
