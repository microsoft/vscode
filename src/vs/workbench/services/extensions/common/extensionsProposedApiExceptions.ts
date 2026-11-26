/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Extensions that may use every API proposal they declare in their package.json, in every build,
 * regardless of `product.json#extensionEnabledApiProposals`.
 *
 * Keep this list as short as possible. Changes require approval from the API owners (see .github/CODEOWNERS).
 * Entries are extension identifiers in lower case.
 */
export const extensionsAllowedAnyApiProposal: ReadonlySet<string> = new Set([
	'ms-vscode.vscode-team-tools',
]);
