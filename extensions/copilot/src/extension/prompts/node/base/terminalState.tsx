/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement } from '@vscode/prompt-tsx';
import { ITasksService } from '../../../../platform/tasks/common/tasksService';
import { ITerminalService } from '../../../../platform/terminal/common/terminalService';

export interface TerminalStateProps extends BasePromptElementProps {
	sessionId?: string;
}

/**
 * PromptElement that gets the current task and terminal state for the chat context.
 */
export class TerminalStatePromptElement extends PromptElement<TerminalStateProps> {
	constructor(
		props: TerminalStateProps,
		@ITasksService private readonly tasksService: ITasksService,
		@ITerminalService private readonly terminalService: ITerminalService
	) {
		super(props);
	}
	async render() {
		const allTasks = this.tasksService.getTasks()?.[0]?.[1] ?? [];
		const tasks = Array.isArray(allTasks) ? allTasks : [];
		const activeTaskNames = tasks.filter(t => this.tasksService.isTaskActive(t)).map(t => t.label);

		if (this.terminalService && Array.isArray(this.terminalService.terminals)) {
			const terminals = await Promise.all(this.terminalService.terminals.map(async (term) => {
				const lastCommand = await this.terminalService.getLastCommandForTerminal(term);
				return {
					name: term.name,
					lastCommand: lastCommand ? {
						commandLine: lastCommand.commandLine ?? '(no last command)',
						cwd: lastCommand.cwd?.toString() ?? '(unknown)',
						exitCode: lastCommand.exitCode,
					} : undefined
				} as ITerminalPromptInfo;
			}));
			const resultTerminals = terminals.filter(t => !!t && !activeTaskNames.includes(t.name));

			if (resultTerminals.length === 0) {
				return;
			}

			const renderTerminals = () => (
				<>
					{resultTerminals.length > 0 && (
						<>
							Terminals:<br />
							{resultTerminals.map((term: ITerminalPromptInfo) => (
								<>
									Terminal: {term.name}<br />
									{term.lastCommand ? (
										<>
											Last Command: {term.lastCommand.commandLine ?? '(no last command)'}<br />
											Cwd: {term.lastCommand.cwd ?? '(unknown)'}<br />
											Exit Code: {term.lastCommand.exitCode ?? '(unknown)'}<br />
										</>
									) : ''}
								</>
							))}
						</>
					)}
				</>
			);
			return (
				<>
					{resultTerminals.length > 0 ? renderTerminals() : 'Terminals: No terminals found.\n'}
				</>
			);
		}
	}
}
interface ITerminalPromptInfo {
	name: string;
	pid: number | undefined;
	lastCommand: { commandLine: string; cwd: string; exitCode: number | undefined } | undefined;
}