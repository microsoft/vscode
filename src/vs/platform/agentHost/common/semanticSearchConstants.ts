/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** VS Code setting that exposes the workbench semantic search to Copilot agent sessions. */
export const CopilotSemanticSearchEnabledSettingId = 'chat.copilot.semanticSearch.enabled';

/** Stable contribution id of the Copilot extension's workbench semantic-search tool. */
export const CLIENT_SEMANTIC_SEARCH_TOOL_ID = 'copilot_searchCodebase';

/** Runtime/model-facing name; overrides the Copilot SDK's built-in tool of the same name. */
export const SEMANTIC_SEARCH_TOOL_NAME = 'semantic_search';

/** Client/workbench-facing tool reference name (`#codebase`). */
export const CLIENT_SEMANTIC_SEARCH_REFERENCE_NAME = 'codebase';
