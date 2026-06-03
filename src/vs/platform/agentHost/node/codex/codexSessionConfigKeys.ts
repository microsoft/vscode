/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-export shim — the canonical declarations live in the common/ layer
// so that browser-only pickers (`AgentHostCodexSandboxPicker`,
// `AgentHostCodexApprovalPolicyPicker`) can consume them without importing
// from `node/`. Keep this file so existing imports from `node/codex/...`
// continue to work without churn.
export * from '../../common/codexSessionConfigKeys.js';
