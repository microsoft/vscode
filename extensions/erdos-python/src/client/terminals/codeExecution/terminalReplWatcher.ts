import { Disposable, TerminalShellExecutionStartEvent } from 'vscode';
import { onDidStartTerminalShellExecution } from '../../common/vscodeApis/windowApis';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';

function checkREPLCommand(command: string): undefined | 'manualTerminal' | `runningScript` {
    const lower = command.toLowerCase().trimStart();
    if (lower.startsWith('python') || lower.startsWith('py ')) {
        const parts = lower.split(' ');
        if (parts.length === 1) {
            return 'manualTerminal';
        }
        return 'runningScript';
    }
    return undefined;
}

export function registerTriggerForTerminalREPL(disposables: Disposable[]): void {
    disposables.push(
        onDidStartTerminalShellExecution(async (e: TerminalShellExecutionStartEvent) => {
            const replType = checkREPLCommand(e.execution.commandLine.value);
            if (e.execution.commandLine.isTrusted && replType) {
                sendTelemetryEvent(EventName.REPL, undefined, { replType });
            }
        }),
    );
}
