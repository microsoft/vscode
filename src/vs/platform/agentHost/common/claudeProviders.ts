/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Transport-provider tokens for the Claude agent host's per-session provider
 * selection. Each token is the value stamped onto an {@link IAgentModelInfo}'s
 * `provider` field by the merged catalog and, crucially, the value the chat
 * model picker buckets a model's group under — so the frontend vendor descriptor
 * it registers for a group MUST use the same token. Keeping both tokens here (a
 * `common` module importable from both the node backend that stamps them and the
 * browser contribution that names them) makes that group ↔ vendor link a single,
 * compile-checked source of truth rather than two literals that can drift apart.
 */

/**
 * Provider token for Copilot-CAPI routing (the `proxy` transport). This is the
 * default: a bare, un-prefixed model-selection id decodes to it, so every id
 * persisted before per-session provider selection existed keeps routing through
 * the proxy with no migration. Models stamped with it group under the global
 * `copilot` picker vendor.
 */
export const CLAUDE_PROVIDER_COPILOT = 'copilot';

/**
 * Provider token for the user's own Anthropic account (the `native` transport —
 * API key or Claude subscription). Models stamped with it group under the
 * `anthropic` picker vendor the Claude agent host registers.
 */
export const CLAUDE_PROVIDER_ANTHROPIC = 'anthropic';
