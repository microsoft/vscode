/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const agentSandboxDiagnosticsMetaKey = 'vscode.sandboxDiagnostics';
export const agentSandboxLocalNetworkRequiredMetaKey = 'vscode.sandboxLocalNetworkRequired';

/** Windows host guidance, published only after the backend and all capabilities report support. */
export function readAgentSandboxLocalNetworkRequired(source: { readonly _meta?: Record<string, unknown> }): boolean {
	return source._meta?.[agentSandboxLocalNetworkRequiredMetaKey] === true;
}

/** Reads host-reported sandbox diagnostics without interpreting runtime policy. */
export function readAgentSandboxDiagnostics(source: { readonly _meta?: Record<string, unknown> }): readonly string[] | undefined {
	const value = source._meta?.[agentSandboxDiagnosticsMetaKey];
	return Array.isArray(value) && value.length > 0 && value.every((reason): reason is string => typeof reason === 'string' && reason.length > 0)
		? value
		: undefined;
}
