/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';
import { IExtensionContribution } from '../../common/contributions';
import { ITerminalMonitor, RecentTerminalFailure, ResolvedTerminalError } from '../../xtab/common/terminalOutput';

/**
 * Debounce window for the NES trigger. Multiple terminal commands may finish
 * back-to-back (e.g. a watch task); we collapse them into a single trigger.
 */
const TRIGGER_DEBOUNCE_MS = 150;

/**
 * Listens for parsed terminal failures captured by {@link ITerminalMonitor} and
 * — when the user opted in via `github.copilot.nextEditSuggestions.fixesFromTerminal`
 * and there is an active text editor — asks VS Code to surface an inline
 * suggestion via the `editor.action.inlineSuggest.trigger` command.
 *
 * The {@link import('../../xtab/node/xtabProvider').XtabProvider} owns the
 * actual prompt enrichment: it pulls the failure back from `ITerminalMonitor`
 * during request construction. This contribution is purely the "wake NES up"
 * half of the feature.
 */
export class TerminalErrorNesTriggerContribution extends Disposable implements IExtensionContribution {

	readonly id = 'terminalErrorNesTrigger';

	private _pendingTriggerHandle: TimeoutHandle | undefined;

	constructor(
		@ITerminalMonitor terminalMonitor: ITerminalMonitor,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IExperimentationService private readonly expService: IExperimentationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// eslint-disable-next-line no-console
		console.debug(`[TerminalErrorNesTrigger] contribution constructed and listening for terminal failures`);

		this._register(terminalMonitor.onDidObserveTerminalFailure(failure => {
			// eslint-disable-next-line no-console
			console.debug(`[TerminalErrorNesTrigger] onDidObserveTerminalFailure received: errors=${failure.errors.length}, commandLine=${failure.commandLine ?? '<unknown>'}`);
			if (!this.configService.getExperimentBasedConfig(ConfigKey.InlineEditsFixesFromTerminal, this.expService)) {
				this.logService.debug(`[TerminalErrorNesTrigger] setting nextEditSuggestions.fixesFromTerminal is off, not triggering`);
				// eslint-disable-next-line no-console
				console.debug(`[TerminalErrorNesTrigger] setting nextEditSuggestions.fixesFromTerminal is off, not triggering`);
				return;
			}
			const target = pickTriggerTarget(failure);
			if (target === undefined) {
				this.logService.debug(`[TerminalErrorNesTrigger] no resolvable error file in failure, not triggering`);
				// eslint-disable-next-line no-console
				console.debug(`[TerminalErrorNesTrigger] no resolvable error file in failure, not triggering`);
				return;
			}
			this._scheduleTrigger(target, failure.errors.length, failure.commandLine);
		}));

		this._register({
			dispose: () => {
				if (this._pendingTriggerHandle !== undefined) {
					clearTimeout(this._pendingTriggerHandle);
					this._pendingTriggerHandle = undefined;
				}
			},
		});
	}

	private _scheduleTrigger(target: TriggerTarget, errorCount: number, commandLine: string | undefined): void {
		if (this._pendingTriggerHandle !== undefined) {
			clearTimeout(this._pendingTriggerHandle);
		}
		this._pendingTriggerHandle = setTimeout(() => {
			this._pendingTriggerHandle = undefined;
			void this._fireTrigger(target, errorCount, commandLine);
		}, TRIGGER_DEBOUNCE_MS);
	}

	private async _fireTrigger(
		target: TriggerTarget,
		errorCount: number,
		commandLine: string | undefined,
	): Promise<void> {
		// Open the failing file and position the cursor on the error line.
		// `showTextDocument` performs three things in one shot that NES needs:
		//   1. Opens the doc (registering it with the ObservableWorkspace and
		//      therefore with NesHistoryContextProvider._documentState).
		//   2. Focuses the editor so it becomes vscode.window.activeTextEditor.
		//   3. Sets a selection, which fires onDidChangeTextEditorSelection and
		//      pushes the doc into NesHistoryContextProvider._lastDocuments.
		// Without (3) NES bails with DocumentMissingInHistoryContext.
		//
		// Crucially: when the target position equals VS Code's default cursor
		// position for a freshly-opened editor — (0, 0) — VS Code value-dedupes
		// the assignment and the selection-change event never fires. To make
		// the event reliable we follow the open with an explicit two-step
		// selection: first to a *guaranteed-distinct* probe position, then to
		// the actual target. At least one transition is a real change.
		const targetSelection = new vscode.Range(target.position, target.position);
		let editor: vscode.TextEditor;
		try {
			editor = await vscode.window.showTextDocument(target.uri, {
				selection: targetSelection,
				preserveFocus: false,
				preview: false,
			});
		} catch (err) {
			this.logService.debug(`[TerminalErrorNesTrigger] showTextDocument failed for ${target.uri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
			// eslint-disable-next-line no-console
			console.debug(`[TerminalErrorNesTrigger] showTextDocument failed for ${target.uri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
			return;
		}

		try {
			const doc = editor.document;
			const probeLine = pickProbeLine(target.position, doc);
			if (probeLine !== target.position.line) {
				const probePos = new vscode.Position(probeLine, 0);
				editor.selections = [new vscode.Selection(probePos, probePos)];
				// Yield so VS Code applies the probe selection and the
				// ObservableWorkspace propagates the change to NES.
				await new Promise<void>(resolve => setTimeout(resolve, 0));
				if (vscode.window.activeTextEditor === editor) {
					editor.selections = [new vscode.Selection(target.position, target.position)];
					// Yield again so the restore propagates before the
					// inline-suggest provider chain reads the editor state.
					await new Promise<void>(resolve => setTimeout(resolve, 0));
				}
			} else {
				// Pathological case: single-line file *and* the error is on
				// line 0. Yield once anyway to let any selection change from
				// the showTextDocument call propagate.
				await new Promise<void>(resolve => setTimeout(resolve, 0));
			}
		} catch (err) {
			this.logService.debug(`[TerminalErrorNesTrigger] selection probe failed: ${err instanceof Error ? err.message : String(err)}`);
			// eslint-disable-next-line no-console
			console.debug(`[TerminalErrorNesTrigger] selection probe failed: ${err instanceof Error ? err.message : String(err)}`);
		}

		this.logService.debug(`[TerminalErrorNesTrigger] triggering inline suggest at ${target.uri.toString()}:${target.position.line + 1} (${errorCount} error(s) from \`${commandLine ?? '<unknown>'}\`)`);
		// eslint-disable-next-line no-console
		console.debug(`[TerminalErrorNesTrigger] triggering inline suggest at ${target.uri.toString()}:${target.position.line + 1} (${errorCount} error(s) from \`${commandLine ?? '<unknown>'}\`)`);
		void vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
	}
}

/**
 * Picks a line that is *guaranteed* different from {@link target.line} (when
 * possible) so that a follow-up selection assignment forces VS Code to fire
 * `onDidChangeTextEditorSelection`. Returns {@link target.line} only for the
 * degenerate single-line-document case.
 */
function pickProbeLine(target: vscode.Position, doc: vscode.TextDocument): number {
	if (doc.lineCount <= 1) {
		return target.line;
	}
	return target.line === 0 ? 1 : 0;
}

/**
 * Where to navigate the user before firing the NES trigger.
 */
interface TriggerTarget {
	readonly uri: URI;
	readonly position: vscode.Position;
}

/**
 * Selects the first resolvable error from the failure as the NES trigger
 * target. The "first" error in {@link parseTerminalErrors}' output is
 * intentionally the most relevant one for each supported parser (e.g. tsc/
 * eslint emit in source order; the Python parser keeps only the innermost
 * frame, which is the one that actually threw).
 */
function pickTriggerTarget(failure: RecentTerminalFailure): TriggerTarget | undefined {
	const first: ResolvedTerminalError | undefined = failure.errors.at(0);
	if (first === undefined) {
		return undefined;
	}
	const line = Math.max(0, first.line - 1);
	const column = first.column !== undefined ? Math.max(0, first.column - 1) : 0;
	return {
		uri: first.uri,
		position: new vscode.Position(line, column),
	};
}
