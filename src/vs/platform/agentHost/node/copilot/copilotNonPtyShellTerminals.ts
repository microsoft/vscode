/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { TerminalClaimKind, type TerminalCommandResult, type TerminalSessionClaim } from '../../common/state/protocol/state.js';
import { buildNonPtyShellTerminalUri } from '../../common/nonPtyShellTerminalUri.js';
import { IAgentHostTerminalManager } from '../agentHostTerminalManager.js';

export function buildNonPtyShellTerminalClaim(session: URI | string, chat: URI | string, toolCallId: string): TerminalSessionClaim {
	return {
		kind: TerminalClaimKind.Session,
		session: session.toString(),
		chat: chat.toString(),
		toolCallId,
	};
}

interface INonPtyShellStream {
	readonly uri: string;
	readonly title: string;
	created: boolean;
	/** The last cumulative snapshot, or the streamed transcript once the call streams chunks. */
	lastSnapshot: string;
	sourceTruncated: boolean;
	finalized: boolean;
	/** Set once the call streams `tool.shell_output` chunks, which replace its lossy snapshots. */
	chunks?: {
		lastSequence: number;
		/** The stream whose output ended without a line feed, if any. */
		openLineStream?: string;
		/** Per stream, an escape sequence that a chunk boundary cut short. */
		readonly pendingEscapes: Map<string, string>;
	};
	/** The attached shell that keeps running after the tool call returned, if any. */
	backgroundShellId?: string;
	/** The last task-list read started before the call went to the background; only later reads can settle the shell. */
	backgroundSinceRead?: number;
}

/**
 * An escape sequence at the end of a chunk that the stream's next chunk can still
 * complete: the unterminated forms of the CSI, OSC, and ESC sequences that
 * {@link removeAnsiEscapeCodes} strips.
 */
const incompleteEscapeSequencePattern = /(?:\x1b(?:\[[=?>!]?[\d;:]*["$#'* ]?|\][^\x07\x9c\x1b\r\n\u2028\u2029]*\x1b?|[ #%()*+\-./])?|\x9b[=?>!]?[\d;:]*["$#'* ]?|\x9d[^\x07\x9c\x1b\r\n\u2028\u2029]*\x1b?)$/;

/** Bounds a held-back escape sequence, so one that never completes cannot hold back output. */
const maxIncompleteEscapeSequenceLength = 1024;

/** The runtime's text when a command exits, ending a shell tool or read result. */
const completedShellPattern = /<shellId: (?<shellId>[^>\r\n]+) completed with exit code (?<exitCode>-?\d+)>\s*$/;

/** The runtime's whole result when a stop tool ends a shell's command; it reports no exit code. */
const stoppedShellPattern = /^\s*<command with id: (?<shellId>[^\s>]+) (?:stopped|had already stopped)>\s*$/;

/**
 * Extracts the command result from the runtime's stable text fallback. The
 * external SDK bridge currently removes the equivalent `shell_exit` content
 * block for compatibility with older SDK clients.
 */
function parseCompletedShell(text: string | undefined): TerminalCommandResult | undefined {
	if (!text) {
		return undefined;
	}
	const match = completedShellPattern.exec(text);
	if (!match?.groups) {
		return undefined;
	}
	return {
		exitCode: Number(match.groups.exitCode),
		preview: text.slice(0, match.index),
	};
}

/** The runtime's text when output was spilled to a file; the preview length is in UTF-16 code units. */
const spilledOutputPattern = /^[^\n]* too large to read at once \([^\n]*\)\. Saved to: [^\n]*\n(?:[^\n]*\n)*?Preview \(first (?<length>\d+) chars\):\n/;

/** The exit marker directly after a spilled preview; sandbox notices may follow it. */
const spilledShellExitPattern = /^\r?\n<shellId: [^>\r\n]+ completed with exit code (?<exitCode>-?\d+)>/;

/**
 * Extracts the command result from the runtime's text for a command whose
 * output was spilled to a file, since session history omits the `shell_exit`
 * block that carries the structured preview.
 */
export function parseSpilledShellCompletion(text: string | undefined): TerminalCommandResult | undefined {
	if (!text) {
		return undefined;
	}
	const header = spilledOutputPattern.exec(text);
	if (!header?.groups) {
		return undefined;
	}
	const length = Number(header.groups.length);
	const preview = text.slice(header[0].length, header[0].length + length);
	const trailer = text.slice(header[0].length + length);
	if (preview.length < length) {
		return undefined;
	}
	if (!trailer.trim()) {
		return { preview, truncated: true };
	}
	const exit = spilledShellExitPattern.exec(trailer);
	if (!exit?.groups) {
		return undefined;
	}
	return { exitCode: Number(exit.groups.exitCode), preview, truncated: true };
}

/**
 * The runtime's texts for an attached command that keeps running after its
 * tool call returns: started in the background, moved there by the user, or
 * still running past a sync command's initial wait. Detached commands say
 * "detached background" and stream no partial output, and a shell ID that is
 * already in use fails without starting anything, so neither matches.
 */
const runningShellPatterns = [
	/<command started in background with shellId: (?<shellId>[^\s>]+)>/,
	/<command with shellId: (?<shellId>[^\s>]+) moved to background by the user\./,
	/<command with shellId: (?<shellId>[^\s>]+) is running in the background after the user moved it off the main turn\./,
	/<command with shellId: (?<shellId>[^\s>]+) is still running after [\d.]+ seconds\./,
];

function parseRunningShellId(text: string | undefined): string | undefined {
	if (!text) {
		return undefined;
	}
	for (const pattern of runningShellPatterns) {
		const shellId = pattern.exec(text)?.groups?.shellId;
		if (shellId !== undefined) {
			return shellId;
		}
	}
	return undefined;
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
	/** Set when the command keeps running after the tool call returns; its output keeps streaming into {@link uri}. */
	readonly backgroundShellId?: string;
}

/**
 * Streams output of SDK-runtime-executed shell tool calls into output-only
 * AHP terminal channels. The runtime reports ANSI-stripped plain-text output
 * via `tool.execution_partial_result` as throttled cumulative snapshots that
 * may be rewritten once output is truncated (a trailing truncation marker
 * under the emit cap, a rolling tail past the large-output threshold); this
 * class preserves the streamed transcript across those lossy rewrites.
 * Runtimes that publish `tool.shell_output` send every chunk instead, so a
 * call that streams chunks appends them and ignores its snapshots.
 *
 * An attached command that keeps running after its tool call returns keeps
 * receiving the call's partial output, so its channel stays live until the
 * shell exits.
 *
 * Created once per chat and disposed with it, matching the pty-backed
 * `ShellManager` lifecycle.
 */
export class NonPtyShellTerminalStreams extends Disposable {

	private readonly _streams = new Map<string, INonPtyShellStream>();
	/** Tool call that started each shell still running in the background, keyed by shell ID. */
	private readonly _backgroundShells = new Map<string, string>();
	private _shellTaskReads = 0;

	constructor(
		private readonly _sessionUri: URI,
		private readonly _storageUri: URI,
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
				uri: buildNonPtyShellTerminalUri(this._storageUri, this._sessionUri, this._chatUri, toolCallId),
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
		if (stream.finalized || stream.chunks || cumulativeOutput === stream.lastSnapshot) {
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
	 * Appends a `tool.shell_output` chunk, which carries new output rather than
	 * a snapshot. A call switches to chunks only at its first one, so its
	 * transcript never misses output.
	 */
	appendChunk(toolCallId: string, chunk: { readonly text: string; readonly sequence: number; readonly stream?: string }): { uri: string; created: boolean } | undefined {
		const stream = this._streams.get(toolCallId);
		if (!stream || (!stream.chunks && chunk.sequence !== 0)) {
			return undefined;
		}
		const created = !stream.created;
		if (created) {
			this._createTerminal(toolCallId, stream);
		}
		if (!stream.chunks) {
			stream.chunks = { lastSequence: -1, pendingEscapes: new Map() };
		}
		const chunks = stream.chunks;
		if (stream.finalized || chunk.sequence <= chunks.lastSequence) {
			return { uri: stream.uri, created };
		}
		chunks.lastSequence = chunk.sequence;
		const source = chunk.stream ?? 'stdout';
		// An escape sequence can span chunks, so hold back one this chunk cuts short until the stream's next chunk completes it.
		let output = (chunks.pendingEscapes.get(source) ?? '') + chunk.text;
		const incomplete = incompleteEscapeSequencePattern.exec(output);
		if (incomplete && incomplete[0].length <= maxIncompleteEscapeSequenceLength) {
			chunks.pendingEscapes.set(source, incomplete[0]);
			output = output.slice(0, incomplete.index);
		} else {
			chunks.pendingEscapes.delete(source);
		}
		// Match the runtime's plain-text snapshots, which drop ANSI escapes and Windows line endings.
		let text = removeAnsiEscapeCodes(output);
		if (isWindows) {
			text = text.replace(/\r\n/g, '\n');
		}
		if (!text) {
			return { uri: stream.uri, created };
		}
		if (chunks.openLineStream !== undefined && chunks.openLineStream !== source) {
			text = `\n${text}`;
		}
		// Only a line feed ends the line: after a bare carriage return, another stream's output would overwrite it.
		chunks.openLineStream = text.endsWith('\n') ? undefined : source;
		this._terminalManager.appendOutputTerminalData(stream.uri, text);
		stream.lastSnapshot += text;
		return { uri: stream.uri, created };
	}

	/**
	 * Records the process lifecycle information carried by tool completion.
	 * A structured shell exit settles the channel.
	 */
	completeToolCall(toolCallId: string, toolOutput: string | undefined, shellExit: { shellId: string; result: TerminalCommandResult; outputFilePath?: string } | undefined): INonPtyShellToolCompletion | undefined {
		const stream = this._streams.get(toolCallId);
		if (!stream) {
			return undefined;
		}

		const completionResult = shellExit?.result ?? parseCompletedShell(toolOutput);
		if (!completionResult) {
			const backgroundShellId = parseRunningShellId(toolOutput);
			if (backgroundShellId !== undefined) {
				return this._continueInBackground(toolCallId, stream, backgroundShellId);
			}
			if (!stream.created) {
				this._streams.delete(toolCallId);
				return undefined;
			}
			return { uri: stream.uri, shouldRetire: false };
		}
		const result = completionResult.preview === undefined ? {
			...completionResult,
			preview: this._terminalManager.getTerminalState(stream.uri)?.content.map(part => part.type === 'command' ? part.output : part.value).join('')
				?? (completionResult.truncated ? '' : toolOutput ?? ''),
		} : completionResult;
		const created = !stream.created;
		if (created) {
			this._createTerminal(toolCallId, stream);
		}
		if (!stream.finalized && result.preview !== undefined) {
			if (created) {
				this.append(toolCallId, result.preview);
			} else if (!result.truncated) {
				if (stream.chunks) {
					if (result.preview !== stream.lastSnapshot) {
						this._replaceOutput(stream, result.preview);
					}
				} else if (stream.sourceTruncated || !result.preview.startsWith(stream.lastSnapshot)) {
					this._replaceOutput(stream, result.preview);
				} else {
					this.append(toolCallId, result.preview);
				}
			}
		}
		if (!shellExit?.outputFilePath) {
			this._finalize(stream, result.exitCode);
		}
		return {
			uri: stream.uri,
			result,
			shouldRetire: true,
		};
	}

	/** Whether a tool call that already returned still streams partial output for its running command. */
	isStreamingInBackground(toolCallId: string): boolean {
		const stream = this._streams.get(toolCallId);
		return stream?.backgroundShellId !== undefined && !stream.finalized;
	}

	/** The channel of a shell that keeps running after the tool call that started it returned. */
	getBackgroundShellTerminal(shellId: string): string | undefined {
		const toolCallId = this._backgroundShells.get(shellId);
		return toolCallId === undefined ? undefined : this._streams.get(toolCallId)?.uri;
	}

	/**
	 * Settles a background shell's channel once the shell exits. The channel
	 * stays subscribable, because the completed tool call still references it.
	 */
	completeBackgroundShell(shellId: string, exitCode: number | undefined): void {
		const toolCallId = this._backgroundShells.get(shellId);
		if (toolCallId === undefined) {
			return;
		}
		this._backgroundShells.delete(shellId);
		const stream = this._streams.get(toolCallId);
		if (stream) {
			this._finalize(stream, exitCode);
		}
	}

	/**
	 * Settles a background shell from a shell helper tool's result. A read or
	 * write that saw the command exit reports its exit code, and a stop says
	 * the command ended. When a read sees the exit, the runtime doesn't send
	 * `shell_completed`, so the result is the only place that exit code arrives.
	 */
	completeBackgroundShellFromHelperResult(toolOutput: string | undefined): void {
		if (!toolOutput) {
			return;
		}
		const completed = completedShellPattern.exec(toolOutput)?.groups;
		if (completed) {
			this.completeBackgroundShell(completed.shellId, Number(completed.exitCode));
			return;
		}
		const stopped = stoppedShellPattern.exec(toolOutput)?.groups;
		if (stopped) {
			this.completeBackgroundShell(stopped.shellId, undefined);
		}
	}

	/** Starts a read of the runtime's task list. Pass the returned read to {@link reconcileBackgroundShells}. */
	beginShellTaskRead(): number {
		return ++this._shellTaskReads;
	}

	/**
	 * Settles background shells the runtime no longer lists as running, for
	 * exits that arrive without a `shell_completed` notification or a helper
	 * result. Only a read started after the call went to the background
	 * counts, because the shell is listed from the moment it starts. A read
	 * that a newer one superseded still counts.
	 */
	reconcileBackgroundShells(runningShellIds: ReadonlySet<string>, read: number): void {
		for (const [shellId, toolCallId] of [...this._backgroundShells]) {
			const since = this._streams.get(toolCallId)?.backgroundSinceRead;
			if (!runningShellIds.has(shellId) && since !== undefined && read > since) {
				this.completeBackgroundShell(shellId, undefined);
			}
		}
	}

	finalizeToolCall(toolCallId: string, exitCode: number | undefined, authoritativeOutput?: string): void {
		const stream = this._streams.get(toolCallId);
		if (!stream || stream.finalized) {
			return;
		}
		if (authoritativeOutput !== undefined) {
			this._terminalManager.replaceOutputTerminalData(stream.uri, authoritativeOutput);
			stream.lastSnapshot = authoritativeOutput;
			stream.sourceTruncated = false;
		}
		this._finalize(stream, exitCode);
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
		const claim = buildNonPtyShellTerminalClaim(this._sessionUri, this._chatUri, toolCallId);
		this._terminalManager.createOutputTerminal(stream.uri, { title: stream.title, claim });
		stream.created = true;
	}

	/**
	 * Keeps a tool call's channel live after the call returns while its
	 * command runs on. The runtime keeps sending the call's partial output, so
	 * the completed tool call and the chat's background work can both show it.
	 */
	private _continueInBackground(toolCallId: string, stream: INonPtyShellStream, shellId: string): INonPtyShellToolCompletion {
		if (!stream.created) {
			this._createTerminal(toolCallId, stream);
		}
		if (this._backgroundShells.get(shellId) !== toolCallId) {
			// A reused shell ID means the command that held it has finished.
			this.completeBackgroundShell(shellId, undefined);
		}
		stream.backgroundShellId = shellId;
		stream.backgroundSinceRead = this._shellTaskReads;
		this._backgroundShells.set(shellId, toolCallId);
		return { uri: stream.uri, shouldRetire: false, backgroundShellId: shellId };
	}
}
