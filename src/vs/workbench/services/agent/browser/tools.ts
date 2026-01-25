/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Nikolaas Bender. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITool } from '../../../../platform/agent/common/agent.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

export class ReadFileTool implements ITool {
	readonly name = 'readFile';
	readonly description = 'Read the contents of a file';

	constructor(
		@IFileService private readonly fileService: IFileService
	) { }

	async execute(args: { path: string }): Promise<string> {
		if (!args.path) {
			throw new Error('Missing path argument');
		}
		const resource = URI.file(args.path);
		try {
			const content = await this.fileService.readFile(resource);
			return content.value.toString();
		} catch (error) {
			throw new Error(`Failed to read file ${args.path}: ${error}`);
		}
	}
}

import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Severity } from '../../../../platform/notification/common/notification.js';

export class WriteFileTool implements ITool {
	readonly name = 'writeFile';
	readonly description = 'Write content to a file';

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IDialogService private readonly dialogService: IDialogService
	) { }

	async execute(args: { path: string, content: string }): Promise<void> {
		if (!args.path || args.content === undefined) {
			throw new Error('Missing path or content argument');
		}

		// Safety Check
		const confirmed = await this.dialogService.confirm({
			message: `Agent wants to write to file: ${args.path}`,
			detail: 'Allow this action?',
			primaryButton: 'Allow',
			type: Severity.Warning
		});

		if (!confirmed.confirmed) {
			throw new Error('User denied file write');
		}

		const resource = URI.file(args.path);
		try {
			await this.fileService.writeFile(resource, VSBuffer.fromString(args.content));
		} catch (error) {
			throw new Error(`Failed to write file ${args.path}: ${error}`);
		}
	}
}

import { ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';

export class ExecCommandTool implements ITool {
	readonly name = 'execCommand';
	readonly description = 'Execute a shell command';

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService,
		@IDialogService private readonly dialogService: IDialogService
	) { }

	async execute(args: { command: string }): Promise<string> {
		if (!args.command) {
			throw new Error('Missing command argument');
		}

		// Guardrail: Block rm -rf
		if (/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b/.test(args.command)) {
			throw new Error('Safety: "rm -rf" is blocked by agent guardrails.');
		}

		// Safety Check
		const confirmed = await this.dialogService.confirm({
			message: `Agent wants to execute command: ${args.command}`,
			detail: 'Allow this action?',
			primaryButton: 'Allow',
			type: Severity.Warning
		});

		if (!confirmed.confirmed) {
			throw new Error('User denied command execution');
		}

		try {
			const instance = await this.terminalService.createTerminal({ config: { name: 'Agent Execution' } });
			instance.sendText(args.command, true);
			return 'Command sent to terminal';
		} catch (error) {
			throw new Error(`Failed to execute command: ${error}`);
		}
	}
}
