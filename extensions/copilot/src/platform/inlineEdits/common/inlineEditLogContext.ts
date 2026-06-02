/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import type { InlineCompletionContext } from 'vscode';
import * as yaml from 'yaml';
import { ErrorUtils } from '../../../util/common/errors';
import { isCancellationError } from '../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { ThemeIcon } from '../../../util/vs/base/common/themables';
import { SerializedLineEdit } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { SerializedEdit } from './dataTypes/editUtils';
import { FetchCancellationError } from './dataTypes/fetchCancellationError';
import { LanguageContextResponse, SerializedContextResponse, serializeLanguageContext } from './dataTypes/languageContext';
import { RootedLineEdit } from './dataTypes/rootedLineEdit';
import { DebugRecorderBookmark } from './debugRecorderBookmark';
import { ISerializedNextEditRequest, StatelessNextEditRequest } from './statelessNextEditProvider';
import { stringifyChatMessages } from './utils/stringifyChatMessages';
import { Icon, now } from './utils/utils';
import { HistoryContext } from './workspaceEditTracker/historyContextProvider';

export interface MarkdownLoggable {
	toMarkdown(): string;
}

/**
 * The outcome of a log context request. Determines the icon shown in the log tree.
 * - `pending`: no outcome yet (shows spinner or check depending on completion)
 * - `succeeded`: model returned suggestions
 * - `noSuggestions`: model returned no suggestions
 * - `cached`: result is from NES cache
 * - `cachedFromGhostText`: result is from ghost text cache
 * - `skipped`: request was skipped or fetch-cancelled
 * - `cancelled`: request was cancelled via CancellationToken (shown as skipped)
 * - `errored`: an error occurred
 * - `previouslyRejected`: result matches a suggestion that was previously rejected
 */
type LogContextOutcome = 'pending' | 'succeeded' | 'noSuggestions' | 'cached' | 'cachedFromGhostText' | 'reusedInFlight' | 'skipped' | 'cancelled' | 'errored' | 'previouslyRejected';

export class InlineEditRequestLogContext {

	private static _id = 0;

	public readonly requestId = InlineEditRequestLogContext._id++;

	public readonly time = now();

	/** Tweaks visibility of this log element in the log tree */
	protected _isVisible: boolean = false;

	get includeInLogTree(): boolean {
		return this._isVisible;
	}

	private _isCompleted: boolean = false;

	/** Mark this request as completed (no longer in progress). */
	markCompleted(): void {
		if (this._isCompleted) {
			console.warn(`[InlineEditRequestLogContext] markCompleted called twice (request #${this.requestId})`);
		}
		this._isCompleted = true;
		this.fireDidChange();
	}

	private readonly _onDidChange = new Emitter<void>();
	/** Fires when state changes, allowing live log entries to refresh their content. */
	public readonly onDidChange: Event<void> = this._onDidChange.event;

	protected fireDidChange(): void {
		this._onDidChange.fire();
	}

	constructor(
		public readonly filePath: string,
		public readonly version: number,
		private _context: InlineCompletionContext | undefined,
	) { }

	public recordingBookmark: DebugRecorderBookmark | undefined = undefined;

	toLogDocument(): string {
		const lines: string[] = [];
		lines.push('# ' + this.getMarkdownTitle() + ` (Request #${this.requestId})`);

		if (!this._isCompleted) {
			lines.push('\n⏳ **In progress…**\n');
		}

		lines.push('💡 Tip: double-click anywhere to open this file as text to copy-paste content into an issue.\n');

		lines.push('<details><summary>Explanation for icons</summary>\n');
		lines.push(`- ${Icon.lightbulbFull.svg} - model had suggestions\n`);
		lines.push(`- ${Icon.circleSlash.svg} - model had NO suggestions\n`);
		lines.push(`- ${Icon.database.svg} - response is from cache\n`);
		lines.push(`- ${Icon.gitMerge.svg} - joined an in-flight request (async or speculative reuse)\n`);
		lines.push(`- ${Icon.error.svg} - error happened\n`);
		lines.push(`- ${Icon.skipped.svg} - fetching started but got cancelled\n`);
		lines.push('</details>\n');

		lines.push(`Inline Edit Provider: ${this._statelessNextEditProviderId ?? '<NOT-SET>'}\n`);

		lines.push(`Chat Endpoint`);
		lines.push('```');
		lines.push(`Model name: ${this._endpointInfo?.modelName ?? '<NOT-SET>'}`);
		lines.push(`URL: ${this._endpointInfo?.url ?? '<NOT-SET>'}`);
		lines.push('```');

		const fromCacheStatus = this._logContextOfCachedEdit ? `(cached #${this._logContextOfCachedEdit.requestId})` : '(not cached)';

		lines.push(`Opportunity ID: ${this._context ? this._context.requestUuid : '<NOT-SET>'}`);
		if (this.headerRequestId) {
			lines.push('');
			lines.push(`Header Request ID: ${this.headerRequestId} ${fromCacheStatus}`);
		}

		if (this._nextEditRequest) {
			lines.push(`## Latest user edits ${fromCacheStatus}`);
			lines.push('<details open><summary>Edit</summary>\n');
			lines.push(this._nextEditRequest.toMarkdown());
			lines.push('\n</details>\n');
		}

		if (this._diagnosticsResultEdit) {
			lines.push(`## Proposed diagnostics suggestion ${this._nesTypePicked === 'diagnostics' ? '(Picked)' : '(Not Picked)'}`);
			lines.push('<details open><summary>Edit</summary>\n');
			lines.push('``` patch');
			lines.push(this._diagnosticsResultEdit.toString());
			lines.push('```');
			lines.push('\n</details>\n');
		}

		if (this._resultEdit) {
			lines.push(`## Proposed inline suggestion ${fromCacheStatus}`);
			lines.push('<details open><summary>Edit</summary>\n');
			lines.push('``` patch');
			lines.push(this._resultEdit.toString());
			lines.push('```');
			lines.push('\n</details>\n');
		}

		if (this.prompt) {
			lines.push(`## Prompt ${fromCacheStatus}`);
			lines.push('<details><summary>Click to view</summary>\n');
			const e = this.prompt;
			lines.push('````');
			lines.push(...e.split('\n'));
			lines.push('````');
			lines.push('\n</details>\n');
		}

		if (this.error) {
			lines.push(`## Error ${fromCacheStatus}`);
			lines.push('```');
			lines.push(ErrorUtils.toString(ErrorUtils.fromUnknown(this.error)));
			lines.push('```');
		}

		if (this.response) {
			lines.push(`## Response ${fromCacheStatus}`);
			lines.push('<details><summary>Click to view</summary>\n');
			lines.push('````');
			lines.push(this.response);
			lines.push('````');
			lines.push('\n</details>\n');
		}

		if (this._responseResults) {
			lines.push(`## Response Results ${fromCacheStatus}`);
			lines.push('<details><summary>Click to view</summary>\n');
			lines.push('```');
			lines.push(yaml.stringify(this._responseResults, null, '\t'));
			lines.push('```');
			lines.push('\n</details>\n');
		}

		if (this._isAccepted !== undefined) {
			lines.push(`## Accepted : ${this._isAccepted ? 'Yes' : 'No'}`);
		}

		if (this._rebaseFailure) {
			lines.push('## Rebase Failure');
			lines.push('<details><summary>Click to view</summary>\n');
			lines.push(this._rebaseFailure.toMarkdown());
			lines.push('\n</details>\n');
		}

		if (this._logs.length > 0) {
			lines.push('## Logs');
			lines.push('<details open><summary>Logs</summary>\n');
			lines.push(...this._logs);
			lines.push('\n</details>\n');
		}

		lines.push(...this._renderTraceDiagram());

		if (this._trace.length > 0) {
			lines.push('## Trace');
			lines.push('<details><summary>Trace</summary>\n');
			lines.push('```');
			lines.push(...this._trace);
			lines.push('```');
			lines.push('\n</details>\n');
		}

		return lines.join('\n');
	}

	toMinimalLog(): string {
		// Does not include the users files, but just the relevant edits
		const lines: string[] = [];

		if (this._nesTypePicked === 'diagnostics' && this._diagnosticsResultEdit) {
			lines.push(`## Result (Diagnostics):`);
			lines.push('``` patch');
			lines.push(this._diagnosticsResultEdit.toString());
			lines.push('```');
		} else if (this._nesTypePicked === 'llm' && this._resultEdit) {
			lines.push(`## Result:`);
			lines.push('``` patch');
			if (typeof this._resultEdit === 'string') {
				lines.push(this._resultEdit);
			} else {
				lines.push(this._resultEdit.toString());
			}
			lines.push('```');
		} else {
			lines.push(`## Result: <NOT-SET>`);
		}

		if (this.error) {
			lines.push(`## Error:`);
			lines.push('```');
			lines.push(ErrorUtils.toString(ErrorUtils.fromUnknown(this.error)));
			lines.push('```');
		}

		lines.push(`### Info:`);
		lines.push(`**From cache:** ${this._logContextOfCachedEdit ? `YES (Request: ${this._logContextOfCachedEdit.requestId})` : 'NO'}`);
		if (this._context) {
			lines.push(`**Trigger Kind:** ${this._context.triggerKind === 0 ? 'Manual' : 'Automatic'}`);
			lines.push(`**Request UUID:** ${this._context.requestUuid}`);
		}

		return lines.join('\n');
	}

	private _statelessNextEditProviderId: string | undefined = undefined;

	setStatelessNextEditProviderId(id: string) {
		this._statelessNextEditProviderId = id;
	}

	private _nextEditRequest: StatelessNextEditRequest | undefined = undefined;

	setRequestInput(nextEditRequest: StatelessNextEditRequest): void {
		this._isVisible = true;
		this._nextEditRequest = nextEditRequest;
		this.fireDidChange();
	}

	private _resultEdit: RootedLineEdit | string | undefined = undefined;

	setResult(resultEditOrPatchString: RootedLineEdit | string) {
		this._isVisible = true;
		this._resultEdit = resultEditOrPatchString;
		this.fireDidChange();
	}

	protected _diagnosticsResultEdit: RootedLineEdit | undefined = undefined;

	setDiagnosticsResult(resultEdit: RootedLineEdit) {
		this._isVisible = true;
		this._diagnosticsResultEdit = resultEdit;
		this.fireDidChange();
	}

	private _nesTypePicked: 'llm' | 'diagnostics' | undefined;

	public setPickedNESType(nesTypePicked: 'llm' | 'diagnostics'): this {
		this._nesTypePicked = nesTypePicked;
		return this;
	}

	private _logContextOfCachedEdit: InlineEditRequestLogContext | undefined = undefined;

	setIsCachedResult(logContextOfCachedEdit: InlineEditRequestLogContext): void {
		this._logContextOfCachedEdit = logContextOfCachedEdit;

		// Direct field copy — avoids triggering outcome transitions from the
		// public setters (e.g. setResponseResults -> succeeded, setError -> errored).
		// The final outcome is always 'cached'.
		this.recordingBookmark = logContextOfCachedEdit.recordingBookmark;
		this._nextEditRequest = logContextOfCachedEdit._nextEditRequest ?? this._nextEditRequest;
		this._resultEdit = logContextOfCachedEdit._resultEdit ?? this._resultEdit;
		this._diagnosticsResultEdit = logContextOfCachedEdit._diagnosticsResultEdit ?? this._diagnosticsResultEdit;
		this._endpointInfo = logContextOfCachedEdit._endpointInfo ?? this._endpointInfo;
		this._headerRequestId = logContextOfCachedEdit._headerRequestId ?? this._headerRequestId;
		if (logContextOfCachedEdit._prompt) {
			this._prompt = logContextOfCachedEdit._prompt;
		}
		this.response = logContextOfCachedEdit.response ?? this.response;
		this._responseResults = logContextOfCachedEdit._responseResults ?? this._responseResults;
		if (logContextOfCachedEdit.fullResponsePromise) {
			this.setFullResponse(logContextOfCachedEdit.fullResponsePromise);
		}
		this._error = logContextOfCachedEdit._error ?? this._error;

		this._isVisible = true;
		this._outcome = 'cached';
		this.fireDidChange();
	}

	/**
	 * Marks this log context as having joined an already in-flight request
	 * (async pending or speculative). The icon shows git-merge to distinguish
	 * from a true cache hit.
	 */
	setIsReusedInFlightResult(logContextOfReusedRequest: InlineEditRequestLogContext): void {
		this._logContextOfCachedEdit = logContextOfReusedRequest;

		this.recordingBookmark = logContextOfReusedRequest.recordingBookmark;
		this._nextEditRequest = logContextOfReusedRequest._nextEditRequest ?? this._nextEditRequest;
		this._resultEdit = logContextOfReusedRequest._resultEdit ?? this._resultEdit;
		this._diagnosticsResultEdit = logContextOfReusedRequest._diagnosticsResultEdit ?? this._diagnosticsResultEdit;
		this._endpointInfo = logContextOfReusedRequest._endpointInfo ?? this._endpointInfo;
		this._headerRequestId = logContextOfReusedRequest._headerRequestId ?? this._headerRequestId;
		if (logContextOfReusedRequest._prompt) {
			this._prompt = logContextOfReusedRequest._prompt;
		}
		this.response = logContextOfReusedRequest.response ?? this.response;
		this._responseResults = logContextOfReusedRequest._responseResults ?? this._responseResults;
		if (logContextOfReusedRequest.fullResponsePromise) {
			this.setFullResponse(logContextOfReusedRequest.fullResponsePromise);
		}
		this._error = logContextOfReusedRequest._error ?? this._error;

		this._isVisible = true;
		this._outcome = 'reusedInFlight';
		this.fireDidChange();
	}

	private _endpointInfo: { url: string; modelName: string } | undefined;

	public setEndpointInfo(url: string, modelName: string): void {
		this._endpointInfo = { url, modelName };
		this.fireDidChange();
	}

	public get endpointInfo(): { url: string; modelName: string } | undefined {
		return this._endpointInfo;
	}

	private _headerRequestId: string | undefined = undefined;
	public setHeaderRequestId(headerRequestId: string): void {
		this._headerRequestId = headerRequestId;
		this.fireDidChange();
	}
	get headerRequestId(): string | undefined {
		return this._headerRequestId;
	}

	public _prompt: string | undefined = undefined;
	private _rawMessages: Raw.ChatMessage[] | undefined = undefined;

	get prompt(): string | undefined {
		return this._prompt;
	}

	get rawMessages(): Raw.ChatMessage[] | undefined {
		return this._rawMessages;
	}

	setPrompt(prompt: string | Raw.ChatMessage[]) {
		this._isVisible = true;
		if (typeof prompt === 'string') {
			this._prompt = prompt;
		} else {
			this._rawMessages = prompt;
			this._prompt = stringifyChatMessages(prompt);
		}
		this.fireDidChange();
	}

	private _outcome: LogContextOutcome = 'pending';

	/**
	 * Sets the outcome, warning if already set (i.e., not `pending`).
	 * Use direct `this._outcome = ...` assignment to bypass the guard
	 * (e.g., in `setIsCachedResult` which intentionally overrides any inherited outcome).
	 */
	private _setOutcome(outcome: LogContextOutcome): void {
		// 'reusedInFlight' is an intermediate state set when joining an in-flight
		// request (before the result arrives), so it can legitimately transition
		// to the final outcome (skipped, errored, etc.) just like 'pending'.
		if (this._outcome !== 'pending' && this._outcome !== 'reusedInFlight') {
			console.warn(`[InlineEditRequestLogContext] outcome transition from '${this._outcome}' to '${outcome}' (request #${this.requestId})`);
		}
		this._outcome = outcome;
	}

	private _resolveIcon(): Icon.t {
		switch (this._outcome) {
			case 'pending': return this._isCompleted ? Icon.check : Icon.loading;
			case 'succeeded': return Icon.lightbulbFull;
			case 'noSuggestions': return Icon.circleSlash;
			case 'cached':
			case 'cachedFromGhostText': return Icon.database;
			case 'reusedInFlight': return Icon.gitMerge;
			case 'skipped':
			case 'cancelled': return Icon.skipped;
			case 'errored': return Icon.error;
			case 'previouslyRejected': return Icon.thumbsdown;
		}
	}

	getIcon(): ThemeIcon {
		return this._resolveIcon().themeIcon;
	}

	public setIsSkipped() {
		this._setOutcome('skipped');
		this._isVisible = false;
		this.fireDidChange();
	}

	public markAsFromCache() {
		this._setOutcome('cachedFromGhostText');
		this._isVisible = true;
		this.fireDidChange();
	}

	public markAsNoSuggestions() {
		this._setOutcome('noSuggestions');
		this._isVisible = true;
		this.fireDidChange();
	}

	public markAsPreviouslyRejected() {
		// Direct assignment — bypasses _setOutcome guard because this transition
		// legitimately overrides 'succeeded' when a fetched edit turns out to be rejected.
		this._outcome = 'previouslyRejected';
		this._isVisible = true;
		this.fireDidChange();
	}

	private _error: unknown | undefined = undefined;

	get error(): unknown | undefined {
		return this._error;
	}

	setError(e: unknown): void {
		this._isVisible = true;
		this._error = e;

		if (this._error instanceof FetchCancellationError) {
			this._setOutcome('skipped');
		} else if (isCancellationError(this._error)) {
			this._setOutcome('cancelled');
			this._isVisible = false;
		} else {
			this._setOutcome('errored');
		}
		this.fireDidChange();
	}

	/**
	 * Model Response
	 */
	private response: string | undefined = undefined;
	setResponse(v: string): void {
		this._isVisible = true;
		this.response = v;
		this.fireDidChange();
	}

	private fullResponsePromise: Promise<string | undefined> | undefined = undefined;
	private fullResponse: string | undefined = undefined;
	setFullResponse(promise: Promise<string | undefined>): void {
		this.fullResponsePromise = promise;
		promise.then(response => this.fullResponse = response);
	}

	async allPromisesResolved(): Promise<void> {
		await this.fullResponsePromise;
	}

	private providerStartTime: number | undefined = undefined;
	setProviderStartTime(): void {
		this.providerStartTime = Date.now();
		this.fireDidChange();
	}

	private providerEndTime: number | undefined = undefined;
	setProviderEndTime(): void {
		this.providerEndTime = Date.now();
		this.fireDidChange();
	}

	private fetchStartTime: number | undefined = undefined;
	setFetchStartTime(): void {
		this.fetchStartTime = Date.now();
		this.fireDidChange();
	}

	private fetchEndTime: number | undefined = undefined;
	setFetchEndTime(): void {
		this.fetchEndTime = Date.now();
		this.fireDidChange();
	}

	/**
	 * Each of edit suggestions from model
	 */
	private _responseResults: readonly unknown[] | undefined = undefined;

	get responseResults(): readonly unknown[] | undefined {
		return this._responseResults;
	}

	setResponseResults(v: readonly unknown[]): void {
		this._isVisible = true;
		this._responseResults = v;
		if (this._outcome === 'pending') {
			this._outcome = 'succeeded';
		}
		this.fireDidChange();
	}

	getDebugName(): string {
		return `NES | ${basename(this.filePath)} (v${this.version})`;
	}

	getMarkdownTitle(): string {
		const icon = this._resolveIcon();
		return `${icon.svg} ` + this.getDebugName();
	}

	protected _recentEdit: HistoryContext | undefined = undefined;

	setRecentEdit(edit: HistoryContext): void {
		this._recentEdit = edit;
	}

	private _trace: string[] = [];
	trace(msg: string): void {
		this._trace.push(msg);
		this.fireDidChange();
	}

	private _renderTraceDiagram(): string[] {
		if (this._trace.length === 0) {
			return [];
		}

		const lines: string[] = [];
		lines.push('## Trace Diagram');
		lines.push('<details open><summary>Trace Diagram</summary>\n');
		lines.push('```');

		// Parse trace lines into structured data
		const parsedTraces = this._trace.map(line => {
			const timeMatch = line.match(/^\[\s*(\d+)ms\]/);
			const timestamp = timeMatch ? parseInt(timeMatch[1], 10) : 0;

			// Extract the bracketed path segments and the message
			const afterTime = line.replace(/^\[\s*\d+ms\]\s*/, '');
			const segments: string[] = [];
			let remaining = afterTime;
			let bracketMatch;
			while ((bracketMatch = remaining.match(/^\[([^\]]+)\]/))) {
				segments.push(bracketMatch[1]);
				remaining = remaining.slice(bracketMatch[0].length);
			}
			const message = remaining.trim();

			return { timestamp, segments, message };
		});

		if (parsedTraces.length === 0) {
			lines.push('(no trace data)');
			lines.push('```');
			lines.push('\n</details>\n');
			return lines;
		}

		// Find the maximum timestamp for time width calculation
		const maxTime = Math.max(...parsedTraces.map(t => t.timestamp));
		const timeWidth = Math.max(6, String(maxTime).length + 3);

		// Build a map of segment paths to track when they start/end
		const activeSegments = new Map<string, { startTime: number; depth: number }>();
		const segmentLifetimes: { path: string; startTime: number; endTime: number; depth: number; name: string }[] = [];

		parsedTraces.forEach((trace, idx) => {
			const currentPath = trace.segments.join('|');

			// Check for segments that are no longer active
			for (const [path, info] of activeSegments) {
				if (!currentPath.startsWith(path) && currentPath !== path) {
					segmentLifetimes.push({
						path,
						startTime: info.startTime,
						endTime: trace.timestamp,
						depth: info.depth,
						name: path.split('|').pop() || ''
					});
					activeSegments.delete(path);
				}
			}

			// Add new segments
			let pathSoFar = '';
			trace.segments.forEach((segment, depth) => {
				pathSoFar = pathSoFar ? `${pathSoFar}|${segment}` : segment;
				if (!activeSegments.has(pathSoFar)) {
					activeSegments.set(pathSoFar, { startTime: trace.timestamp, depth });
				}
			});
		});

		// Close any remaining active segments
		const lastTimestamp = parsedTraces[parsedTraces.length - 1]?.timestamp || 0;
		for (const [path, info] of activeSegments) {
			segmentLifetimes.push({
				path,
				startTime: info.startTime,
				endTime: lastTimestamp,
				depth: info.depth,
				name: path.split('|').pop() || ''
			});
		}

		// Render timeline header
		lines.push('');
		lines.push('Timeline (nested call hierarchy):');
		lines.push('─'.repeat(60));

		// Track what's currently shown at each depth to avoid redundant output
		const currentAtDepth: string[] = [];

		for (const trace of parsedTraces) {
			const timeStr = `[${String(trace.timestamp).padStart(timeWidth - 3)}ms]`;
			const indentUnit = '│   ';
			const newBranchUnit = '├── ';

			// Determine which segments are new vs continuing
			let indent = '';
			let displaySegment = '';
			let hasNewSegment = false;

			for (let d = 0; d < trace.segments.length; d++) {
				const seg = trace.segments[d];
				if (currentAtDepth[d] !== seg) {
					// This is a new segment at this depth
					hasNewSegment = true;
					currentAtDepth[d] = seg;
					// Clear deeper levels
					currentAtDepth.length = d + 1;
					displaySegment = seg;
					indent = indentUnit.repeat(d);
					break;
				}
				indent = indentUnit.repeat(d + 1);
			}

			if (hasNewSegment) {
				// Show the new segment
				const prefix = indent + newBranchUnit;
				lines.push(`${timeStr} ${prefix}[${displaySegment}]`);
				if (trace.message) {
					const msgIndent = indentUnit.repeat(trace.segments.length);
					lines.push(`${' '.repeat(timeWidth + 1)} ${msgIndent}↳ ${trace.message}`);
				}
			} else if (trace.message) {
				// Just a message at the current depth
				const msgIndent = indentUnit.repeat(trace.segments.length);
				lines.push(`${timeStr} ${msgIndent}↳ ${trace.message}`);
			}
		}

		lines.push('─'.repeat(60));
		lines.push('```');
		lines.push('\n</details>\n');

		return lines;
	}

	private _logs: string[] = [];
	addLog(content: string): void {
		this._logs.push(content.replace('\n', '\\n').replace('\t', '\\t').replace('`', '\`') + '\n');
		this.fireDidChange();
	}

	private _rebaseFailure: MarkdownLoggable | undefined;

	setRebaseFailure(failure: MarkdownLoggable): void {
		this._rebaseFailure = failure;
	}


	private _isAccepted: boolean | undefined = undefined;
	setAccepted(isAccepted: boolean): void {
		this._isAccepted = isAccepted;
	}

	addListToLog(list: string[]): void {
		list.forEach(l => this.addLog(`- ${l}`));
	}

	addCodeblockToLog(code: string, language: string = ''): void {
		this._logs.push(`\`\`\`${language}\n${code}\n\`\`\`\n`);
	}

	private _fileDiagnostics: string | undefined;
	setDiagnosticsData(fileDiagnostics: string): void {
		this._fileDiagnostics = fileDiagnostics;
	}

	private _terminalOutput: string | undefined;
	setTerminalData(terminalOutput: string): void {
		this._terminalOutput = terminalOutput;
	}

	private _languageContext: LanguageContextResponse | undefined;
	setLanguageContext(langCtx: LanguageContextResponse): void {
		this._languageContext = langCtx;
	}

	/**
	 * Convert the current instance into a JSON format to enable serialization
	 * @returns JSON representation of the current state
	 */
	toJSON(): ISerializedInlineEditLogContext {
		return {
			requestId: this.requestId,
			time: this.time,
			filePath: this.filePath,
			version: this.version,
			statelessNextEditProviderId: this._statelessNextEditProviderId,
			nextEditRequest: this._nextEditRequest?.serialize(),
			diagnosticsResultEdit: this._diagnosticsResultEdit?.toString(),
			resultEdit: this._resultEdit?.toString(),
			isCachedResult: !!this._logContextOfCachedEdit,
			prompt: this.prompt,
			error: String(this.error),
			response: this.fullResponse,
			responseResults: yaml.stringify(this._responseResults, null, '\t'),
			providerStartTime: this.providerStartTime,
			providerEndTime: this.providerEndTime,
			fetchStartTime: this.fetchStartTime,
			fetchEndTime: this.fetchEndTime,
			logs: this._logs,
			isAccepted: this._isAccepted,
			languageContext: this._languageContext ? serializeLanguageContext(this._languageContext) : undefined,
			diagnostics: this._fileDiagnostics,
			terminalOutput: this._terminalOutput,
		};
	}
}

function basename(path: string): string {
	const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
	if (slash === -1) { return path; }
	return path.slice(slash + 1);
}

export interface INextEditProviderTest {
	// from least recent to most recent
	recentWorkspaceEdits: { path: string; initialText: string; edit: SerializedEdit }[];
	recentWorkspaceEditsActiveDocumentIdx?: number; // by default the last document
	statelessDocuments?: { initialText: string; edit: SerializedLineEdit }[];
	statelessActiveDocumentIdx?: number; // by default the last document
	statelessLLMPrompt?: string;
	statelessLLMResponse?: string;
	statelessNextEdit?: SerializedLineEdit;

	nextEdit?: SerializedEdit;
}

export interface ISerializedInlineEditLogContext {
	requestId: number;
	time: number;
	filePath: string;
	version: number;
	statelessNextEditProviderId: string | undefined;
	nextEditRequest: ISerializedNextEditRequest | undefined;
	diagnosticsResultEdit: string | undefined;
	resultEdit: string | undefined;
	isCachedResult: boolean;
	prompt: string | undefined;
	error: string;
	response: string | undefined;
	responseResults: string;
	providerStartTime: number | undefined;
	providerEndTime: number | undefined;
	fetchStartTime: number | undefined;
	fetchEndTime: number | undefined;
	logs: string[];
	isAccepted: boolean | undefined;
	languageContext: SerializedContextResponse | undefined;
	diagnostics: string | undefined;
	terminalOutput: string | undefined;
}
