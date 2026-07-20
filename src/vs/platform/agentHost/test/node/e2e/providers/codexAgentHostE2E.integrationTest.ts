/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Deterministic Agent Host end-to-end tests for the bundled Codex provider.
 */

import { defineAgentHostE2ETests } from '../suites/agentHostE2ESuites.js';
import { CODEX_CONFIG } from './codexTestConfiguration.js';

defineAgentHostE2ETests(CODEX_CONFIG);
