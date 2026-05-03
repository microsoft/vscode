/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * Per-session wrapper held by {@link import('./claudeAgent.js').ClaudeAgent}
 * inside its in-memory `_sessions` map.
 *
 * Phase 5 holds only the bare minimum: the session id, the agent-host
 * session URI, and the working directory the user picked when creating
 * the session. The class grows in subsequent phases to own the SDK
 * `Query` object, abort controller, in-flight metadata writes, and the
 * subagent transcript cursor.
 *
 * The constructor is intentionally public so tests can inject a
 * subclass via {@link import('./claudeAgent.js').ClaudeAgent}'s
 * protected `_createSessionWrapper` factory hook.
 */
export class ClaudeAgentSession extends Disposable {
	constructor(
		readonly sessionId: string,
		readonly sessionUri: URI,
		readonly workingDirectory: URI | undefined,
	) {
		super();
	}
}
