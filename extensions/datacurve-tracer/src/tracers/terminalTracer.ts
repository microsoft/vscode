import * as vscode from 'vscode';
import path from 'path';
import { IRecorder } from '../types';
import { Tracer } from './tracer';
import { ThoughtsTracker } from './thoughtsTracker';
import {
	createTerminalBeginShellExecutionAction,
	createTerminalEndShellExecutionAction,
} from '../utils/typedTracers';
/**
 * TerminalTracer class is responsible for recording terminal related events.
 * It listens for the following events:
 * - onDidStartTerminalShellExecution
 * - onDidEndTerminalShellExecution
 */
export class TerminalTracer extends Tracer {
	private terminalProfileName = 'Dash';
	private trackedTerminals: Set<vscode.Terminal> = new Set();

	constructor(
		context: vscode.ExtensionContext,
		traceRecorder: IRecorder,
		thoughtsTracker?: ThoughtsTracker,
	) {
		super(context, traceRecorder, thoughtsTracker);
	}

	initializeDisposables() {
		this.disposables.push(
			vscode.window.registerTerminalProfileProvider(
				'datacurve.terminal-profile',
				{
					provideTerminalProfile: () =>
						this.terminalProfileProvider(),
				},
			),
			vscode.window.onDidStartTerminalShellExecution((e) =>
				this.startTerminalShellExecution(e),
			),
			vscode.window.onDidEndTerminalShellExecution((e) =>
				this.endTerminalShellExecution(e),
			),
			vscode.window.onDidChangeTerminalShellIntegration((e) =>
				this.changeTerminalShellIntegration(e),
			),
		);
	}

	private terminalProfileProvider(): vscode.ProviderResult<vscode.TerminalProfile> {
		return {
			options: {
				name: this.terminalProfileName,
				shellPath:
					process.platform === 'win32'
						? 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
						: process.platform === 'darwin'
							? '/bin/zsh'
							: '/bin/bash',
			},
		};
	}

	private async startTerminalShellExecution(
		e: vscode.TerminalShellExecutionStartEvent,
	): Promise<void> {
		// Add a delay to ensure terminal execution data is available
		let buffer = '';
		for await (const data of e.execution.read()) {
			buffer += data;
		}

		const actionId = 'terminalBeginShellExecution';
		createTerminalBeginShellExecutionAction(e, buffer);

		// Signal to the ThoughtsTracker
		this.signalAction(actionId);

		if (
			e.terminal.name === this.terminalProfileName &&
			!this.trackedTerminals.has(e.terminal)
		) {
			this.trackedTerminals.add(e.terminal);
		}
	}

	private async endTerminalShellExecution(
		e: vscode.TerminalShellExecutionEndEvent,
	): Promise<void> {
		if (
			e.terminal.name === this.terminalProfileName &&
			this.trackedTerminals.has(e.terminal)
		) {
			this.trackedTerminals.delete(e.terminal);
		}
		let buffer = '';
		for await (const data of e.execution.read()) {
			buffer += data;
		}

		const actionId = 'terminalEndShellExecution';
		createTerminalEndShellExecutionAction(e, buffer);

		// Signal to the ThoughtsTracker
		this.signalAction(actionId);
	}

	private changeTerminalShellIntegration(
		e: vscode.TerminalShellIntegrationChangeEvent,
	): void {
		if (
			e.terminal.name === this.terminalProfileName &&
			!this.trackedTerminals.has(e.terminal)
		) {
			this.trackedTerminals.add(e.terminal);
			// Execute the shell integration script supported by vscode terminal
			// integration, based on code https://github.com/microsoft/vscode/blob/f4c602693743d533b0a5b96b8d0bc1bd6d041d32/src/vs/code/node/cli.ts#L102
			const command =
				'. "' +
				path.join(
					vscode.env.appRoot,
					'out',
					'vs',
					'workbench',
					'contrib',
					'terminal',
					'common',
					'scripts',
					process.platform === 'win32'
						? 'shellIntegration.ps1'
						: process.platform === 'darwin'
							? 'shellIntegration-rc.zsh'
							: 'shellIntegration-bash.sh',
				) +
				'"';

			e.terminal.shellIntegration?.executeCommand(command);
		}
	}

	dispose(): void {
		this.disposeDisposables();
		this.traceRecorder.dispose();
	}
}
