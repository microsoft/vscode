/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ICommandDetectionCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IPromptInputModel } from '../../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';
import { ITerminalCompletion } from './terminalCompletionItem.js';

export class TerminalSuggestTelemetry extends Disposable {
	private _acceptedCompletions: Array<{ label: string; kindLabel?: string }> | undefined;

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
	acceptCompletion(completion: ITerminalCompletion | undefined, commandLine?: string): void {
		if (!completion || !commandLine) {
			this._acceptedCompletions = undefined;
			return;
		}
		this._acceptedCompletions = this._acceptedCompletions || [];
		this._acceptedCompletions.push({ label: typeof completion.label === 'string' ? completion.label : completion.label.label, kindLabel: completion.kindLabel });
	}
	private _sendTelemetryInfo(fromInterrupt?: boolean, exitCode?: number): void {
		const commandLine = this._promptInputModel?.value;
		for (const completion of this._acceptedCompletions || []) {
			const label = completion?.label;
			const kind = completion?.kindLabel;
			if (label === undefined || commandLine === undefined || kind === undefined) {
				return;
			}

			let outcome: CompletionOutcome;
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
				outcome: CompletionOutcome;
				exitCode: number | undefined;
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
			}>('terminal.suggest.acceptedCompletion', {
				kind,
				outcome,
				exitCode
			});
		}
	}
}

function inputContainsFirstHalfOfLabel(commandLine: string, label: string): boolean {
	return commandLine.includes(label.substring(0, Math.ceil(label.length / 2)));
}

const enum CompletionOutcome {
	Accepted = 'Accepted',
	Deleted = 'Deleted',
	AcceptedWithEdit = 'AcceptedWithEdit',
	Interrupted = 'Interrupted'
}
