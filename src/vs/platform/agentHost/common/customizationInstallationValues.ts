/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared value rules for configured customization installation, mirroring the
 * runtime CLI: the workbench validates prompts with them and the host
 * revalidates. The runtime remains authoritative.
 */
export const maxConfiguredValueBytes = 8192;
export const configuredNumberPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
export const configuredVariableReferencePattern = /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*/;
