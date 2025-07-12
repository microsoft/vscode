/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServerDefinitionProvider, McpServerDefinition, ProviderResult, Uri, McpHttpServerDefinition, l10n } from 'vscode';

export class GitHubMcpServerDefinitionProvider implements McpServerDefinitionProvider {
	provideMcpServerDefinitions(): ProviderResult<McpServerDefinition[]> {
		return [new McpHttpServerDefinition(l10n.t('GitHub'), Uri.parse('https://api.githubcopilot.com/mcp/'))];
	}
}
