/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { Event, ExtensionTerminalOptions, Terminal, TerminalExecutedCommand, TerminalOptions, TerminalShellExecutionEndEvent, TerminalShellIntegrationChangeEvent, window, type TerminalDataWriteEvent } from 'vscode';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import * as path from '../../../util/vs/base/common/path';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { ITerminalService } from '../common/terminalService';
import { getActiveTerminalBuffer, getActiveTerminalLastCommand, getActiveTerminalSelection, getActiveTerminalShellType, getBufferForTerminal, getLastCommandForTerminal, installTerminalBufferListeners } from './terminalBufferListener';

export class TerminalServiceImpl extends Disposable implements ITerminalService {

	declare readonly _serviceBrand: undefined;

	// Ensure the order is preserved, as that matters for PATH contributions.
	// VS Code will apply them in order from its own cache.
	// So when re-loading VS Code vscode first applies it from its cache, then we apply our contributions.
	// If they are different, then user will be prompted to restart terminal to apply changes.
	private readonly pathContributions: { contributor: string; path: string; description?: string | { command: string }; prepend: boolean }[] = [];

	constructor(
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
	) {
		super();
		// This used to be setup in the past for Copilot CLI auth in terminals.
		// It was only ever shipped in the VSCode insiders and never got into stable.
		// So this is only required for users who had insiders installed before it was removed.
		// Safe to remove this after a few months or so (https://github.com/microsoft/vscode/issues/275692).
		this.context.environmentVariableCollection.delete('GH_TOKEN');

		for (const l of installTerminalBufferListeners()) {
			this._register(l);
		}
	}

	get terminals(): readonly Terminal[] {
		return window.terminals;
	}

	get onDidChangeTerminalShellIntegration(): Event<TerminalShellIntegrationChangeEvent> {
		return window.onDidChangeTerminalShellIntegration;
	}

	get onDidEndTerminalShellExecution(): Event<TerminalShellExecutionEndEvent> {
		return window.onDidEndTerminalShellExecution;
	}

	get onDidCloseTerminal(): Event<Terminal> {
		return window.onDidCloseTerminal;
	}
	get onDidWriteTerminalData(): Event<TerminalDataWriteEvent> {
		return window.onDidWriteTerminalData;
	}

	createTerminal(name?: string, shellPath?: string, shellArgs?: readonly string[] | string): Terminal;
	createTerminal(options: TerminalOptions): Terminal;
	createTerminal(options: ExtensionTerminalOptions): Terminal;
	createTerminal(name?: any, shellPath?: any, shellArgs?: any): Terminal {
		const terminal = window.createTerminal(name, shellPath, shellArgs);
		return terminal;
	}

	getBufferForTerminal(terminal: Terminal, maxChars?: number): string {
		return getBufferForTerminal(terminal, maxChars);
	}

	async getBufferWithPid(pid: number, maxChars?: number): Promise<string> {
		let terminal: Terminal | undefined;
		for (const t of this.terminals) {
			const tPid = await t.processId;
			if (tPid === pid) {
				terminal = t;
				break;
			}
		}
		if (terminal) {
			return this.getBufferForTerminal(terminal, maxChars);
		}
		return '';
	}

	getLastCommandForTerminal(terminal: Terminal): TerminalExecutedCommand | undefined {
		return getLastCommandForTerminal(terminal);
	}

	get terminalBuffer(): string {
		return getActiveTerminalBuffer();
	}

	get terminalLastCommand(): TerminalExecutedCommand | undefined {
		return getActiveTerminalLastCommand();
	}

	get terminalSelection(): string {
		return getActiveTerminalSelection();
	}

	get terminalShellType(): string {
		return getActiveTerminalShellType();
	}

	contributePath(contributor: string, pathLocation: string, description?: string | { command: string }, prepend: boolean = false): void {
		const entry = this.pathContributions.find(c => c.contributor === contributor);
		if (entry) {
			entry.path = pathLocation;
			entry.description = description;
			entry.prepend = prepend;
		} else {
			this.pathContributions.push({ contributor, path: pathLocation, description, prepend });
		}
		this.updateEnvironmentPath();
	}

	removePathContribution(contributor: string): void {
		const index = this.pathContributions.findIndex(c => c.contributor === contributor);
		if (index !== -1) {
			this.pathContributions.splice(index, 1);
		}
		this.updateEnvironmentPath();
	}

	private updateEnvironmentPath(): void {
		const pathVariable = 'PATH';

		// Clear existing PATH modification
		this.context.environmentVariableCollection.delete(pathVariable);

		if (this.pathContributions.length === 0) {
			return;
		}


		// Build combined description
		const allDescriptions = coalesce(this.pathContributions
			.map(c => c.description && typeof c.description === 'string' ? c.description : undefined)
			.filter(d => d));
		let descriptions = '';
		if (allDescriptions.length === 1) {
			descriptions = allDescriptions[0];
		} else if (allDescriptions.length > 1) {
			descriptions = `${allDescriptions.slice(0, -1).join(', ')} ${l10n.t('and')} ${allDescriptions[allDescriptions.length - 1]}`;
		}

		const allCommands = coalesce(this.pathContributions
			.map(c => (c.description && typeof c.description !== 'string') ? `\`${c.description.command}\`` : undefined)
			.filter(d => d));

		let commandsDescription = '';
		if (allCommands.length === 1) {
			commandsDescription = l10n.t('Enables use of {0} command in the terminal', allCommands[0]);
		} else if (allCommands.length > 1) {
			const commands = `${allCommands.slice(0, -1).join(', ')} ${l10n.t('and')} ${allCommands[allCommands.length - 1]}`;
			commandsDescription = l10n.t('Enables use of {0} commands in the terminal', commands);
		}

		const description = [descriptions, commandsDescription].filter(d => d).join(' and ');
		this.context.environmentVariableCollection.description = description || 'Enables additional commands in the terminal.';

		// Build combined path from all contributions
		// Since we cannot mix and match append/prepend, if there are any prepend paths, then prepend everything.
		const allPaths = this.pathContributions.map(c => c.path);
		if (this.pathContributions.some(c => c.prepend)) {
			const pathVariableChange = allPaths.join(path.delimiter) + path.delimiter;
			this.context.environmentVariableCollection.prepend(pathVariable, pathVariableChange);
		} else {
			const pathVariableChange = path.delimiter + allPaths.join(path.delimiter);
			this.context.environmentVariableCollection.append(pathVariable, pathVariableChange);
		}
	}
}
