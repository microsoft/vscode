/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentSession } from '../../common/agent.js';
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
	lastSnapshot: string;
	sourceTruncated: boolean;
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

const enum StitchConstants {
	/** Minimum characters of overlap required to treat a rewritten snapshot as a rolling tail. */
	MinimumOverlapLength = 8
}

const partialOutputTruncationMarker = /<output too long - dropped \d+ (?:characters|lines) from the end>\n?$/;

function getTruncatedOutputPrefix(output: string): string | undefined {
	const match = partialOutputTruncationMarker.exec(output);
	return match ? output.slice(0, match.index) : undefined;
}

/**
 * Finds where `next` overlaps the end of `previous` when the runtime rewrote
 * its cumulative snapshot as a rolling tail.
 */
function findStitchOverlap(previous: string, next: string): number | undefined {
	const probe = next.slice(0, StitchConstants.MinimumOverlapLength);
	if (probe.length < StitchConstants.MinimumOverlapLength) {
		return undefined;
	}
	let index = previous.indexOf(probe);
	while (index !== -1) {
		const overlapLength = previous.length - index;
		if (overlapLength <= next.length && next.startsWith(previous.slice(index))) {
			return overlapLength;
		}
		index = previous.indexOf(probe, index + 1);
	}
	return undefined;
}

export interface INonPtyShellToolCompletion {
	readonly uri: string;
	readonly result?: TerminalCommandResult;
	readonly shouldRetire: boolean;
}

/**
 * Streams output of SDK-runtime-executed shell tool calls into output-only
 * AHP terminal channels. The runtime reports ANSI-stripped plain-text output
 * via `tool.execution_partial_result` as throttled cumulative snapshots that
 * may be rewritten once output is truncated (a trailing truncation marker
 * under the emit cap, a rolling tail past the large-output threshold); this
 * class preserves the streamed transcript across those lossy rewrites.
 *
 * Created once per chat and disposed with it, matching the pty-backed
 * `ShellManager` lifecycle.
 */
export class NonPtyShellTerminalStreams extends Disposable {

	private readonly _streams = new Map<string, INonPtyShellStream>();

	constructor(
		private readonly _sessionUri: URI,
		private readonly _chatUri: URI,
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
				lastSnapshot: '',
				sourceTruncated: false,
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
		if (stream.finalized || cumulativeOutput === stream.lastSnapshot) {
			return { uri: stream.uri, created };
		}
		const truncatedPrefix = getTruncatedOutputPrefix(cumulativeOutput);
		if (truncatedPrefix !== undefined) {
			if (!stream.sourceTruncated) {
				if (cumulativeOutput.startsWith(stream.lastSnapshot)) {
					this._terminalManager.appendOutputTerminalData(stream.uri, cumulativeOutput.slice(stream.lastSnapshot.length));
				} else {
					const overlap = findStitchOverlap(stream.lastSnapshot, cumulativeOutput);
					this._terminalManager.appendOutputTerminalData(stream.uri, overlap === undefined ? cumulativeOutput.slice(truncatedPrefix.length) : cumulativeOutput.slice(overlap));
				}
				stream.sourceTruncated = true;
			}
		} else if (cumulativeOutput.startsWith(stream.lastSnapshot)) {
			this._terminalManager.appendOutputTerminalData(stream.uri, cumulativeOutput.slice(stream.lastSnapshot.length));
		} else {
			const previousSnapshot = getTruncatedOutputPrefix(stream.lastSnapshot) ?? stream.lastSnapshot;
			const overlap = findStitchOverlap(previousSnapshot, cumulativeOutput);
			if (overlap !== undefined) {
				const unseen = cumulativeOutput.slice(overlap);
				if (unseen) {
					this._terminalManager.appendOutputTerminalData(stream.uri, unseen);
				}
			} else if (stream.sourceTruncated || cumulativeOutput.length < stream.lastSnapshot.length) {
				this._terminalManager.appendOutputTerminalData(stream.uri, cumulativeOutput);
				stream.sourceTruncated = true;
			} else {
				this._terminalManager.resetOutputTerminal(stream.uri);
				this._terminalManager.appendOutputTerminalData(stream.uri, cumulativeOutput);
			}
		}
		stream.lastSnapshot = cumulativeOutput;
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
			if (!stream.created) {
				this._streams.delete(toolCallId);
				return undefined;
			}
			return { uri: stream.uri, shouldRetire: false };
		}
		const created = !stream.created;
		if (created) {
			this._createTerminal(toolCallId, stream);
		}
		if (!stream.finalized && result.preview !== undefined) {
			if (created) {
				this.append(toolCallId, result.preview);
			} else if (!result.truncated) {
				if (stream.sourceTruncated || !result.preview.startsWith(stream.lastSnapshot)) {
					this._replaceOutput(stream, result.preview);
				} else {
					this.append(toolCallId, result.preview);
				}
			}
		}
		this._finalize(stream, result.exitCode);
		return {
			uri: stream.uri,
			result,
			shouldRetire: stream.finalized && result.preview !== undefined,
		};
	}

	/**
	 * Releases the live output resource after its static completion has been
	 * published. Repeated calls are safe and do not dispose the resource twice.
	 */
	retire(toolCallId: string): void {
		const stream = this._streams.get(toolCallId);
		if (!stream) {
			return;
		}
		this._streams.delete(toolCallId);
		if (stream.created) {
			this._terminalManager.disposeTerminal(stream.uri);
		}
	}

	private _finalize(stream: INonPtyShellStream, exitCode: number | undefined): void {
		if (stream.finalized) {
			return;
		}
		stream.finalized = true;
		this._terminalManager.finalizeOutputTerminal(stream.uri, exitCode);
	}

	private _replaceOutput(stream: INonPtyShellStream, output: string): void {
		this._terminalManager.resetOutputTerminal(stream.uri);
		if (output) {
			this._terminalManager.appendOutputTerminalData(stream.uri, output);
		}
		stream.lastSnapshot = output;
		stream.sourceTruncated = false;
	}

	private _createTerminal(toolCallId: string, stream: INonPtyShellStream): void {
		const claim: TerminalSessionClaim = {
			kind: TerminalClaimKind.Session,
			session: this._sessionUri.toString(),
			chat: this._chatUri.toString(),
			toolCallId,
		};
		this._terminalManager.createOutputTerminal(stream.uri, { title: stream.title, claim });
		stream.created = true;
	}
}
