/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentSession } from '../../common/agentService.js';
import { TerminalClaimKind, type TerminalCommandResult, type TerminalSessionClaim } from '../../common/state/protocol/state.js';
import { IAgentHostTerminalManager } from '../agentHostTerminalManager.js';

/**
 * Builds the terminal channel URI for a runtime-executed (non-pty) shell tool
 * call. The session owns the terminal namespace and each tool call addresses a
 * distinct child terminal, keeping the URI stable across live streaming and
 * history replay without colliding with other sessions or tool calls.
 */
export function buildNonPtyShellTerminalUri(session: URI | string, toolCallId: string): string {
	return `agenthost-terminal://shell/${encodeURIComponent(AgentSession.id(session))}/${encodeURIComponent(toolCallId)}`;
}

interface INonPtyShellStream {
	readonly uri: string;
	readonly title: string;
	created: boolean;
	/** The last cumulative snapshot written to the channel. */
	lastEmitted: string;
	finalized: boolean;
}

/**
 * Extracts the command result from the runtime's stable text fallback. The
 * external SDK bridge currently removes the equivalent `shell_exit` content
 * block for compatibility with older SDK clients.
 */
function parseCompletedShell(text: string | undefined): TerminalCommandResult | undefined {
	const match = text && /<shellId: ([^>\r\n]+) completed with exit code (-?\d+)>\s*$/.exec(text);
	if (!match) {
		return undefined;
	}
	return {
		exitCode: Number(match[2]),
		preview: text.slice(0, match.index),
	};
}

export interface INonPtyShellToolCompletion {
	readonly uri: string;
	readonly result?: TerminalCommandResult;
}

/**
 * Streams output of SDK-runtime-executed shell tool calls into output-only
 * AHP terminal channels. The runtime reports ANSI-stripped plain-text output
 * via `tool.execution_partial_result` as throttled cumulative snapshots that
 * may be rewritten once output is truncated (a trailing truncation marker
 * under the emit cap, a rolling tail past the large-output threshold); this
 * class emits only the unseen suffix as `terminal/data` while the snapshot
 * grows in place, and resets the channel when the snapshot was rewritten, so
 * subscribed clients receive live plain-text output (`isPty: false` — no VT
 * parsing needed).
 *
 * Created once per session and disposed with it, matching the pty-backed
 * `ShellManager` lifecycle.
 */
export class NonPtyShellTerminalStreams extends Disposable {

	private readonly _streams = new Map<string, INonPtyShellStream>();

	constructor(
		private readonly _sessionUri: URI,
		@IAgentHostTerminalManager private readonly _terminalManager: IAgentHostTerminalManager,
	) {
		super();

		this._register(toDisposable(() => {
			for (const stream of this._streams.values()) {
				if (stream.created) {
					this._terminalManager.disposeTerminal(stream.uri);
				}
			}
			this._streams.clear();
		}));
	}

	/**
	 * Appends the unseen suffix of `cumulativeOutput` to the tool call's
	 * output terminal, creating the channel on first call. Returns the channel
	 * URI and whether this call created it (so the caller can attach the
	 * terminal content block exactly once).
	 */
	track(toolCallId: string, title: string): void {
		if (!this._streams.has(toolCallId)) {
			this._streams.set(toolCallId, {
				uri: buildNonPtyShellTerminalUri(this._sessionUri, toolCallId),
				title,
				lastEmitted: '',
				finalized: false,
				created: false,
			});
		}
	}

	append(toolCallId: string, cumulativeOutput: string): { uri: string; created: boolean } | undefined {
		const stream = this._streams.get(toolCallId);
		if (!stream) {
			return undefined;
		}
		const created = !stream.created;
		if (created) {
			this._createTerminal(toolCallId, stream);
		}
		if (stream.finalized || cumulativeOutput === stream.lastEmitted) {
			return { uri: stream.uri, created };
		}
		if (cumulativeOutput.startsWith(stream.lastEmitted)) {
			this._terminalManager.appendOutputTerminalData(stream.uri, cumulativeOutput.slice(stream.lastEmitted.length));
		} else {
			// The snapshot no longer extends what we emitted — the runtime
			// rewrote it after truncation (marker under the emit cap, rolling
			// tail past the large-output threshold). Start the channel over.
			this._terminalManager.resetOutputTerminal(stream.uri);
			this._terminalManager.appendOutputTerminalData(stream.uri, cumulativeOutput);
		}
		stream.lastEmitted = cumulativeOutput;
		return { uri: stream.uri, created };
	}

	/**
	 * Records the process lifecycle information carried by tool completion.
	 * A structured shell exit settles the channel.
	 */
	completeToolCall(toolCallId: string, toolOutput: string | undefined, shellExit: { shellId: string; result: TerminalCommandResult } | undefined): INonPtyShellToolCompletion | undefined {
		const stream = this._streams.get(toolCallId);
		if (!stream) {
			return undefined;
		}

		const result = shellExit?.result ?? parseCompletedShell(toolOutput);
		if (!result) {
			return stream.created ? { uri: stream.uri } : undefined;
		}
		if (!stream.created) {
			this._createTerminal(toolCallId, stream);
		}
		if (result.preview !== undefined) {
			this.append(toolCallId, result.preview);
		}
		if (result.exitCode !== undefined) {
			this._finalize(stream, result.exitCode);
		}
		return { uri: stream.uri, result };
	}

	private _finalize(stream: INonPtyShellStream, exitCode: number): void {
		if (stream.finalized) {
			return;
		}
		stream.finalized = true;
		this._terminalManager.finalizeOutputTerminal(stream.uri, exitCode);
	}

	private _createTerminal(toolCallId: string, stream: INonPtyShellStream): void {
		const claim: TerminalSessionClaim = {
			kind: TerminalClaimKind.Session,
			session: this._sessionUri.toString(),
			toolCallId,
		};
		this._terminalManager.createOutputTerminal(stream.uri, { title: stream.title, claim });
		stream.created = true;
	}
}
