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
	private _acceptedCompletions: Array<{ label: string; type?: string }> | undefined;

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
		this._acceptedCompletions.push({ label: typeof completion.label === 'string' ? completion.label : completion.label.label, type: completion.type });
	}
	private _sendTelemetryInfo(fromInterrupt?: boolean, exitCode?: number): void {
		const commandLine = this._promptInputModel?.value;
		for (const completion of this._acceptedCompletions || []) {
			const label = completion?.label;
			const type = completion?.type;
			if (label === undefined || commandLine === undefined || type === undefined) {
				return;
			}

			let outcome: string;
			if (fromInterrupt) {
				outcome = 'Interrupted';
			} else if (commandLine.trim() && commandLine.includes(label)) {
				outcome = 'Accepted';
			} else if (inputContainsFirstHalfOfLabel(commandLine, label)) {
				outcome = 'AcceptedWithEdit';
			} else {
				outcome = 'Deleted';
			}
			this._telemetryService.publicLog2<{
				type: string | undefined;
				outcome: string;
				exitCode: number | undefined;
			}, {
				owner: 'meganrogge';
				comment: 'This data is collected to understand the outcome of a terminal completion acceptance.';
				type: {
					classification: 'SystemMetaData';
					purpose: 'FeatureInsight';
					comment: 'The completion item\'s type';
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
				type,
				outcome,
				exitCode
			});
		}
	}
}

function inputContainsFirstHalfOfLabel(commandLine: string, label: string): boolean {
	return commandLine.includes(label.substring(0, Math.ceil(label.length / 2)));
}
