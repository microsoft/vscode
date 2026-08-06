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
 * grouping/default provider: a bare, un-prefixed model-selection id decodes to
 * it, and models stamped with it group under the global `copilot` picker vendor.
 * Note this token only names the *provider* a bare id falls back to; it does not
 * by itself pin the *transport*. A bare/legacy id keeps following the host
 * default transport (see `resolveClaudeSessionTransport` in the node
 * `claudeModelSelection` module), so per-session selection never migrates an
 * already-persisted session — including a native BYO-Anthropic one — onto the
 * proxy.
 */
export const CLAUDE_PROVIDER_COPILOT = 'copilot';

/**
 * Provider token for the user's own Anthropic account (the `native` transport —
 * API key or Claude subscription). Models stamped with it group under the
 * `anthropic` picker vendor the Claude agent host registers.
 */
export const CLAUDE_PROVIDER_ANTHROPIC = 'anthropic';
