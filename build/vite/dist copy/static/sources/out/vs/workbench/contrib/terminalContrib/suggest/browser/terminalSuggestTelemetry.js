/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isString } from '../../../../../base/common/types.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TerminalCompletionItemKind } from './terminalCompletionItem.js';
let TerminalSuggestTelemetry = class TerminalSuggestTelemetry extends Disposable {
    constructor(commandDetection, _promptInputModel, _telemetryService) {
        super();
        this._promptInputModel = _promptInputModel;
        this._telemetryService = _telemetryService;
        this._kindMap = new Map([
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
        this._register(commandDetection.onCommandFinished((e) => {
            this._sendTelemetryInfo(false, e.exitCode);
            this._acceptedCompletions = undefined;
        }));
        this._register(this._promptInputModel.onDidInterrupt(() => {
            this._sendTelemetryInfo(true);
            this._acceptedCompletions = undefined;
        }));
    }
    acceptCompletion(sessionId, completion, commandLine) {
        if (!completion || !commandLine) {
            this._acceptedCompletions = undefined;
            return;
        }
        this._acceptedCompletions = this._acceptedCompletions || [];
        this._acceptedCompletions.push({ label: isString(completion.label) ? completion.label : completion.label.label, kind: this._kindMap.get(completion.kind), sessionId, provider: completion.provider });
    }
    /**
     * Logs the latency (ms) from completion request to completions shown.
     * @param sessionId The terminal session ID
     * @param latency The measured latency in ms
     * @param firstShownFor Object indicating if completions have been shown for window/shell
     */
    logCompletionLatency(sessionId, latency, firstShownFor) {
        this._telemetryService.publicLog2('terminal.suggest.completionLatency', {
            terminalSessionId: sessionId,
            latency,
            firstWindow: firstShownFor.window,
            firstShell: firstShownFor.shell
        });
    }
    _sendTelemetryInfo(fromInterrupt, exitCode) {
        const commandLine = this._promptInputModel?.value;
        for (const completion of this._acceptedCompletions || []) {
            const label = completion?.label;
            const kind = completion?.kind;
            const provider = completion?.provider;
            if (label === undefined || commandLine === undefined || kind === undefined || provider === undefined) {
                return;
            }
            let outcome;
            if (fromInterrupt) {
                outcome = "Interrupted" /* CompletionOutcome.Interrupted */;
            }
            else if (commandLine.trim() && commandLine.includes(label)) {
                outcome = "Accepted" /* CompletionOutcome.Accepted */;
            }
            else if (inputContainsFirstHalfOfLabel(commandLine, label)) {
                outcome = "AcceptedWithEdit" /* CompletionOutcome.AcceptedWithEdit */;
            }
            else {
                outcome = "Deleted" /* CompletionOutcome.Deleted */;
            }
            this._telemetryService.publicLog2('terminal.suggest.acceptedCompletion', {
                kind,
                outcome,
                exitCode,
                terminalSessionId: completion.sessionId,
                provider
            });
        }
    }
};
TerminalSuggestTelemetry = __decorate([
    __param(2, ITelemetryService)
], TerminalSuggestTelemetry);
export { TerminalSuggestTelemetry };
var CompletionOutcome;
(function (CompletionOutcome) {
    CompletionOutcome["Accepted"] = "Accepted";
    CompletionOutcome["Deleted"] = "Deleted";
    CompletionOutcome["AcceptedWithEdit"] = "AcceptedWithEdit";
    CompletionOutcome["Interrupted"] = "Interrupted";
})(CompletionOutcome || (CompletionOutcome = {}));
function inputContainsFirstHalfOfLabel(commandLine, label) {
    return commandLine.includes(label.substring(0, Math.ceil(label.length / 2)));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTdWdnZXN0VGVsZW1ldHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3N1Z2dlc3QvYnJvd3Nlci90ZXJtaW5hbFN1Z2dlc3RUZWxlbWV0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUcxRixPQUFPLEVBQXVCLDBCQUEwQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFdkYsSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSxVQUFVO0lBZ0J2RCxZQUNDLGdCQUE2QyxFQUM1QixpQkFBb0MsRUFDbEMsaUJBQXFEO1FBRXhFLEtBQUssRUFBRSxDQUFDO1FBSFMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFtQjtRQUNqQixzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO1FBaEJqRSxhQUFRLEdBQUcsSUFBSSxHQUFHLENBQWlCO1lBQzFDLENBQUMsMEJBQTBCLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQztZQUN6QyxDQUFDLDBCQUEwQixDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUM7WUFDN0MsQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDO1lBQzdDLENBQUMsMEJBQTBCLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQztZQUMzQyxDQUFDLDBCQUEwQixDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUM7WUFDakQsQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDO1lBQzdDLENBQUMs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