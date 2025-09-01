/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRuntimeSessionService } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { IRuntimeStartupService } from '../../../services/runtimeStartup/common/runtimeStartupService.js';
import { IHelpContentService } from '../common/helpContentService.js';

export class HelpContentService extends Disposable implements IHelpContentService {
	readonly _serviceBrand: undefined;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
		@IRuntimeSessionService private readonly runtimeSessionService: IRuntimeSessionService,
		@IRuntimeStartupService private readonly runtimeStartupService: IRuntimeStartupService
	) {
		super();
	}

	/**
	 * Get help as markdown for both R and Python topics
	 * Based on the proper implementation from erdosAiService
	 */
	async getHelpAsMarkdown(topic: string, packageName?: string, language?: 'R' | 'Python'): Promise<string> {
		try {
			// If language is specified, ensure that session is started and use that specific command
			if (language === 'Python') {
				try {
					await this.ensurePythonSession();
					const markdown = await this.commandService.executeCommand<string>('python.getHelpAsMarkdown', topic);
					return typeof markdown === 'string' ? markdown : `Help topic: ${topic}\n\nNo Python help content available.`;
				} catch (error) {
					return `Help topic: ${topic}\n\nCould not start Python session for help content.`;
				}
			} else if (language === 'R') {
				try {
					await this.ensureRSession();
					const markdown = await this.commandService.executeCommand<string>('r.getHelpAsMarkdown', topic, packageName || '');
					return typeof markdown === 'string' ? markdown : `Help topic: ${topic}\n\nNo R help content available.`;
				} catch (error) {
					return `Help topic: ${topic}\n\nCould not start R session for help content.`;
				}
			}

			// If no language specified, try R first
			try {
				await this.ensureRSession();
				const rMarkdown = await this.commandService.executeCommand<string>('r.getHelpAsMarkdown', topic, packageName || '');
				if (typeof rMarkdown === 'string' && rMarkdown.length > 0) {
					return rMarkdown;
				}
			} catch (rError) {
				// R failed, try Python
			}

			// Try Python if R failed or returned empty
			try {
				await this.ensurePythonSession();
				const pythonMarkdown = await this.commandService.executeCommand<string>('python.getHelpAsMarkdown', topic);
				if (typeof pythonMarkdown === 'string' && pythonMarkdown.length > 0) {
					return pythonMarkdown;
				}
			} catch (pythonError) {
				// Both failed
			}

			return `Help topic: ${topic}\n\nNo help content available from R or Python.`;
		} catch (error) {
			this.logService.error('Failed to get help as markdown:', error);
			return `Help topic: ${topic}\n\nError retrieving help content.`;
		}
	}

	private async ensureRSession(): Promise<void> {
		if (!this.runtimeSessionService.foregroundSession || 
			this.runtimeSessionService.foregroundSession.runtimeMetadata.languageId !== 'r') {
			return;
		}

		const rRuntime = this.runtimeStartupService.getPreferredRuntime('r');
		if (!rRuntime) {
			throw new Error('No R interpreter is available');
		}
	}

	private async ensurePythonSession(): Promise<void> {
		if (!this.runtimeSessionService.foregroundSession || 
			this.runtimeSessionService.foregroundSession.runtimeMetadata.languageId !== 'python') {
			return;
		}

		const pythonRuntime = this.runtimeStartupService.getPreferredRuntime('python');
		if (!pythonRuntime) {
			throw new Error('No Python interpreter is available');
		}
	}
}
