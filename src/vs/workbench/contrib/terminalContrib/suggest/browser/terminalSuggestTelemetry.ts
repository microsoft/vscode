/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ICommandDetectionCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IPromptInputModel } from '../../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';
import { ITerminalCompletion, TerminalCompletionItemKind } from './terminalCompletionItem.js';

export class TerminalSuggestTelemetry extends Disposable {
	private _acceptedCompletions: Array<{ label: string; kind?: string; sessionId: string; provider: string }> | undefined;

	private _kindMap = new Map<number, string>([
		[TerminalCompletionItemKind.File, 'File'],
		[TerminalCompletionItemKind.Folder, 'Folder'],
		[TerminalCompletionItemKind.Method, 'Method'],
		[TerminalCompletionItemKind.Alias, 'Alias'],
		[TerminalCompletionItemKind.Argument, 'Argument'],
		[TerminalCompletionItemKind.Option, 'Option'],
		[TerminalCompletionItemKind.OptionValue, 'Option Value'],
		[TerminalCompletionItemKind.Flag, 'Flag'],
		[TerminalCompletionItemKind.InlineSuggestion, 'Inline Suggestion'],
		[TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop, 'Inline Suggestion'],
	]);

	constructor(
		commandDetection: ICommandDetectionCapability,
		private readonly _promptInputModel: IPromptInputModel,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._register(commandDetection.onCommandFinished((e) => {
			this._sendTelemetryInfo(false, e.exitCode);
			this._acceptedCompletions = undefined;
		}));
		this._register(this._promptInputModel.onDidInterrupt(() => {
			this._sendTelemetryInfo(true);
			this._acceptedCompletions = undefined;
		}));
	}
	acceptCompletion(sessionId: string, completion: ITerminalCompletion | undefined, commandLine?: string): void {
		if (!completion || !commandLine) {
			this._acceptedCompletions = undefined;
			return;
		}
		this._acceptedCompletions = this._acceptedCompletions || [];
		this._acceptedCompletions.push({ label: typeof completion.label === 'string' ? completion.label : completion.label.label, kind: this._kindMap.get(completion.kind!), sessionId, provider: completion.provider });
	}

	/**
	 * Logs the latency (ms) from completion request to completions shown.
	 * @param sessionId The terminal session ID
	 * @param latency The measured latency in ms
	 * @param firstShownFor Object indicating if completions have been shown for window/shell
	 */
	logCompletionLatency(sessionId: string, latency: number, firstShownFor: { window: boolean; shell: boolean }): void {
		this._telemetryService.publicLog2<{
			terminalSessionId: string;
			latency: number;
			firstWindow: boolean;
			firstShell: boolean;
		}, {
			owner: 'meganrogge';
			comment: 'Latency in ms from terminal completion request to completions shown.';
			terminalSessionId: {
				classification: 'SystemMetaData';
				purpose: 'FeatureInsight';
				comment: 'The session ID of the terminal session.';
			};
			latency: {
				classification: 'SystemMetaData';
				purpose: 'PerformanceAndHealth';
				comment: 'The latency in milliseconds.';
			};
			firstWindow: {
				classification: 'SystemMetaData';
				purpose: 'FeatureInsight';
				comment: 'Whether this is the first ever showing of completions in the window.';
			};
			firstShell: {
				classification: 'SystemMetaData';
				purpose: 'FeatureInsight';
				comment: 'Whether this is the first ever showing of completions in the shell.';
			};
		}>('terminal.suggest.completionLatency', {
			terminalSessionId: sessionId,
			latency,
			firstWindow: firstShownFor.window,
			firstShell: firstShownFor.shell
		});
	}


	private _sendTelemetryInfo(fromInterrupt?: boolean, exitCode?: number): void {
		const commandLine = this._promptInputModel?.value;
		for (const completion of this._acceptedCompletions || []) {
			const label = completion?.label;
			const kind = completion?.kind;
			const provider = completion?.provider;

			if (label === undefined || commandLine === undefined || kind === undefined || provider === undefined) {
				return;
			}

			let outcome: string;
			if (fromInterrupt) {
				outcome = CompletionOutcome.Interrupted;
			} else if (commandLine.trim() && commandLine.includes(label)) {
				outcome = CompletionOutcome.Accepted;
			} else if (inputContainsFirstHalfOfLabel(commandLine, label)) {
				outcome = CompletionOutcome.AcceptedWithEdit;
			} else {
				outcome = CompletionOutcome.Deleted;
			}
			this._telemetryService.publicLog2<{
				kind: string | undefined;
				outcome: string;
				exitCode: number | undefined;
				terminalSessionId: string;
				provider: string | undefined;
			}, {
				owner: 'meganrogge';
				comment: 'This data is collected to understand the outcome of a terminal completion acceptance.';
				kind: {
					classification: 'SystemMetaData';
					purpose: 'FeatureInsight';
					comment: 'The completion item\'s kind';
				};
				outcome: {
					classification: 'SystemMetaData';
					purpose: 'FeatureInsight';
					comment: 'The outcome of the accepted completion';
				};
				exitCode: {
					classification: 'SystemMetaData';
					purpose: 'FeatureInsight';
					comment: 'The exit code from the command';
				};
				terminalSessionId: {
					classification: 'SystemMetaData';
					purpose: 'FeatureInsight';
					comment: 'The session ID of the terminal session where the completion was accepted';
				};
				provider: {
					classification: 'SystemMetaData';
					purpose: 'FeatureInsight';
					comment: 'The ID of the provider that supplied the completion';
				};
			}>('terminal.suggest.acceptedCompletion', {
				kind,
				outcome,
				exitCode,
				terminalSessionId: completion.sessionId,
				provider
			});
		}
	}
}

const enum CompletionOutcome {
	Accepted = 'Accepted',
	Deleted = 'Deleted',
	AcceptedWithEdit = 'AcceptedWithEdit',
	Interrupted = 'Interrupted'
}

function inputContainsFirstHalfOfLabel(commandLine: string, label: string): boolean {
	return commandLine.includes(label.substring(0, Math.ceil(label.length / 2)));
}

