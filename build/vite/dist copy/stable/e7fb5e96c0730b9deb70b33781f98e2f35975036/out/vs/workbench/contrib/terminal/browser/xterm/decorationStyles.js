/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { fromNow, getDurationString } from '../../../../../base/common/date.js';
import { isNumber } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { terminalDecorationError, terminalDecorationIncomplete, terminalDecorationSuccess } from '../terminalIcons.js';
var DecorationStyles;
(function (DecorationStyles) {
    DecorationStyles[DecorationStyles["DefaultDimension"] = 16] = "DefaultDimension";
    DecorationStyles[DecorationStyles["MarginLeft"] = -17] = "MarginLeft";
})(DecorationStyles || (DecorationStyles = {}));
export var DecorationSelector;
(function (DecorationSelector) {
    DecorationSelector["CommandDecoration"] = "terminal-command-decoration";
    DecorationSelector["Hide"] = "hide";
    DecorationSelector["ErrorColor"] = "error";
    DecorationSelector["DefaultColor"] = "default-color";
    DecorationSelector["Default"] = "default";
    DecorationSelector["Codicon"] = "codicon";
    DecorationSelector["XtermDecoration"] = "xterm-decoration";
    DecorationSelector["OverviewRuler"] = ".xterm-decoration-overview-ruler";
})(DecorationSelector || (DecorationSelector = {}));
export function getTerminalDecorationHoverContent(command, hoverMessage, showCommandActions) {
    let hoverContent = showCommandActions ? `${localize('terminalPromptContextMenu', "Show Command Actions")}\n\n---\n\n` : '';
    if (!command) {
        if (hoverMessage) {
            hoverContent = hoverMessage;
        }
        else {
            return '';
        }
    }
    else if (command.markProperties || hoverMessage) {
        if (command.markProperties?.hoverMessage || hoverMessage) {
            hoverContent = command.markProperties?.hoverMessage || hoverMessage || '';
        }
        else {
            return '';
        }
    }
    else {
        if (isNumber(command.duration)) {
            const durationText = getDurationString(command.duration);
            if (command.exitCode) {
                if (command.exitCode === -1) {
                    hoverContent += localize('terminalPromptCommandFailed.duration', 'Command executed {0}, took {1} and failed', fromNow(command.timestamp, true), durationText);
                }
                else {
                    hoverContent += localize('terminalPromptCommandFailedWithExitCode.duration', 'Command executed {0}, took {1} and failed (Exit Code {2})', fromNow(command.timestamp, true), durationText, command.exitCode);
                }
            }
            else {
                hoverContent += localize('terminalPromptCommandSuccess.duration', 'Command executed {0} and took {1}', fromNow(command.timestamp, true), durationText);
            }
        }
        else {
            if (command.exitCode) {
                if (command.exitCode === -1) {
                    hoverContent += localize('terminalPromptCommandFailed', 'Command executed {0} and failed', fromNow(command.timestamp, true));
                }
                else {
                    hoverContent += localize('terminalPromptCommandFailedWithExitCode', 'Command executed {0} and failed (Exit Code {1})', fromNow(command.timestamp, true), command.exitCode);
                }
            }
            else {
                hoverContent += localize('terminalPromptCommandSuccess', 'Command executed {0} now');
            }
        }
    }
    return hoverContent;
}
export var TerminalCommandDecorationStatus;
(function (TerminalCommandDecorationStatus) {
    TerminalCommandDecorationStatus["Unknown"] = "unknown";
    TerminalCommandDecorationStatus["Running"] = "running";
    TerminalCommandDecorationStatus["Success"] = "success";
    TerminalCommandDecorationStatus["Error"] = "error";
})(TerminalCommandDecorationStatus || (TerminalCommandDecorationStatus = {}));
const unknownText = localize('terminalCommandDecoration.unknown', 'Unknown');
const runningText = localize('terminalCommandDecoration.running', 'Running');
export function getTerminalCommandDecorationTooltip(command, storedState) {
    if (command) {
        return getTerminalDecorationHoverContent(command);
    }
    if (!storedState) {
        return '';
    }
    const timestamp = storedState.timestamp;
    const exitCode = storedState.exitCode;
    const duration = storedState.duration;
    if (typeof timestamp !== 'number' || timestamp === undefined) {
        return '';
    }
    let hoverContent = '';
    const fromNowText = fromNow(timestamp, true);
    if (typeof duration === 'number') {
        const durationText = getDurationString(Math.max(duration, 0));
        if (exitCode) {
            if (exitCode === -1) {
                hoverContent += localize('terminalPromptCommandFailed.duration', 'Command executed {0}, took {1} and failed', fromNowText, durationText);
            }
            else {
                hoverContent += localize('terminalPromptCommandFailedWithExitCode.duration', 'Command executed {0}, took {1} and failed (Exit Code {2})', fromNowText, durationText, exitCode);
            }
        }
        else {
            hoverContent += localize('terminalPromptCommandSuccess.duration', 'Command executed {0} and took {1}', fromNowText, durationText);
        }
    }
    else {
        if (exitCode) {
            if (exitCode === -1) {
                hoverContent += localize('terminalPromptCommandFailed', 'Command executed {0} and failed', fromNowText);
            }
            else {
                hoverContent += localize('terminalPromptCommandFailedWithExitCode', 'Command executed {0} and failed (Exit Code {1})', fromNowText, exitCode);
            }
        }
        else {
            hoverContent += localize('terminalPromptCommandSuccess.', 'Command executed {0} ', fromNowText);
        }
    }
    return hoverContent;
}
export function getTerminalCommandDecorationState(command, storedState, now = Date.now()) {
    let status = "unknown" /* TerminalCommandDecorationStatus.Unknown */;
    const exitCode = command?.exitCode ?? storedState?.exitCode;
    let exitCodeText = unknownText;
    const startTimestamp = command?.timestamp ?? storedState?.timestamp;
    let startText = unknownText;
    let durationMs;
    let durationText = unknownText;
    if (typeof startTimestamp === 'number') {
        startText = new Date(startTimestamp).toLocaleString();
    }
    if (command) {
        if (command.exitCode === undefined) {
            status = "running" /* TerminalCommandDecorationStatus.Running */;
            exitCodeText = runningText;
            durationMs = startTimestamp !== undefined ? Math.max(0, now - startTimestamp) : undefined;
        }
        else if (command.exitCode !== 0) {
            status = "error" /* TerminalCommandDecorationStatus.Error */;
            exitCodeText = String(command.exitCode);
            durationMs = command.duration ?? (startTimestamp !== undefined ? Math.max(0, now - startTimestamp) : undefined);
        }
        else {
            status = "success" /* TerminalCommandDecorationStatus.Success */;
            exitCodeText = String(command.exitCode);
            durationMs = command.duration ?? (startTimestamp !== undefined ? Math.max(0, now - startTimestamp) : undefined);
        }
    }
    else if (storedState) {
        if (storedState.exitCode === undefined) {
            status = "running" /* TerminalCommandDecorationStatus.Running */;
            exitCodeText = runningText;
            durationMs = startTimestamp !== undefined ? Math.max(0, now - startTimestamp) : undefined;
        }
        else if (storedState.exitCode !== 0) {
            status = "error" /* TerminalCommandDecorationStatus.Error */;
            exitCodeText = String(storedState.exitCode);
            durationMs = storedState.duration;
        }
        else {
            status = "success" /* TerminalCommandDecorationStatus.Success */;
            exitCodeText = String(storedState.exitCode);
            durationMs = storedState.duration;
        }
    }
    if (typeof durationMs === 'number') {
        durationText = getDurationString(Math.max(durationMs, 0));
    }
    const classNames = [];
    let icon = terminalDecorationIncomplete;
    switch (status) {
        case "running" /* TerminalCommandDecorationStatus.Running */:
        case "unknown" /* TerminalCommandDecorationStatus.Unknown */:
            classNames.push("default-color" /* DecorationSelector.DefaultColor */, "default" /* DecorationSelector.Default */);
            icon = terminalDecorationIncomplete;
            break;
        case "error" /* TerminalCommandDecorationStatus.Error */:
            classNames.push("error" /* DecorationSelector.ErrorColor */);
            icon = terminalDecorationError;
            break;
        case "success" /* TerminalCommandDecorationStatus.Success */:
            classNames.push('success');
            icon = terminalDecorationSuccess;
            break;
    }
    const hoverMessage = getTerminalCommandDecorationTooltip(command, storedState);
    return {
        status,
        icon,
        classNames,
        exitCode,
        exitCodeText,
        startTimestamp,
        startText,
        duration: durationMs,
        durationText,
        hoverMessage
    };
}
export function updateLayout(configurationService, element) {
    if (!element) {
        return;
    }
    const fontSize = configurationService.inspect("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */).value;
    const defaultFontSize = configurationService.inspect("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */).defaultValue;
    const lineHeight = configurationService.inspect("terminal.integrated.lineHeight" /* TerminalSettingId.LineHeight */).value;
    if (isNumber(fontSize) && isNumber(defaultFontSize) && isNumber(lineHeight)) {
        const scalar = (fontSize / defaultFontSize) <= 1 ? (fontSize / defaultFontSize) : 1;
        // must be inlined to override the inlined styles from xterm
        element.style.width = `${scalar * 16 /* DecorationStyles.DefaultDimension */}px`;
        element.style.height = `${scalar * 16 /* DecorationStyles.DefaultDimension */ * lineHeight}px`;
        element.style.fontSize = `${scalar * 16 /* DecorationStyles.DefaultDimension */}px`;
        element.style.marginLeft = `${scalar * -17 /* DecorationStyles.MarginLeft */}px`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdGlvblN0eWxlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIveHRlcm0vZGVjb3JhdGlvblN0eWxlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUlqRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsNEJBQTRCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUV2SCxJQUFXLGdCQUdWO0FBSEQsV0FBVyxnQkFBZ0I7SUFDMUIsZ0ZBQXFCLENBQUE7SUFDckIscUVBQWdCLENBQUE7QUFDakIsQ0FBQyxFQUhVLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFHMUI7QUFFRCxNQUFNLENBQU4sSUFBa0Isa0JBU2pCO0FBVEQsV0FBa0Isa0JBQWtCO0lBQ25DLHVFQUFpRCxDQUFBO0lBQ2pELG1DQUFhLENBQUE7SUFDYiwwQ0FBb0IsQ0FBQTtJQUNwQixvREFBOEIsQ0FBQTtJQUM5Qix5Q0FBbUIsQ0FBQTtJQUNuQix5Q0FBbUIsQ0FBQTtJQUNuQiwwREFBb0MsQ0FBQTtJQUNwQyx3RUFBa0QsQ0FBQTtBQUNuRCxDQUFDLEVBVGlCLGtCQUFrQixLQUFsQixrQkFBa0IsUUFTbkM7QUFFRCxNQUFNLFVBQVUsaUNBQWlDLENBQUMsT0FBcUMsRUFBRSxZQUFxQixFQUFFLGtCQUE0QjtJQUMzSSxJQUFJLFlBQVksR0FBRyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsc0JBQXNCLENB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