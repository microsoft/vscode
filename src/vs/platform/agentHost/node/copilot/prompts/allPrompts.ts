/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Side-effect import hub for per-model Copilot CLI agent-host prompt
// contributors. Importing this module registers every contributor into the
// shared `agentHostPromptRegistry`. Mirrors the Copilot extension's
// `allAgentPrompts.ts`.
//
// Add per-model modules here as they are ported over, e.g.:
//
//   import './geminiPrompt.js';
//   import './openaiPrompt.js';

import './anthropicPrompt.js';
