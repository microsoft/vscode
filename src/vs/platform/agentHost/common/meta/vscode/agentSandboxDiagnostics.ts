/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const agentSandboxDiagnosticsMetaKey = 'vscode.sandboxDiagnostics';

/** Reads host-reported sandbox diagnostics without interpreting runtime policy. */
export function readAgentSandboxDiagnostics(source: { readonly _meta?: Record<string, unknown> }): readonly string[] | undefined {
	const value = source._meta?.[agentSandboxDiagnosticsMetaKey];
	return Array.isArray(value) && value.length > 0 && value.every((reason): reason is string => typeof reason === 'string' && reason.length > 0)
		? value
		: undefined;
}
