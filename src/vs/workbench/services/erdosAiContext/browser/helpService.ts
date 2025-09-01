/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IHelpService } from '../common/helpService.js';
import { ISessionManagement } from '../../../services/erdosAiUtils/common/sessionManagement.js';

export class HelpService extends Disposable implements IHelpService {
	readonly _serviceBrand: undefined;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@ISessionManagement private readonly sessionManagement: ISessionManagement
	) {
		super();
	}


	async suggestTopics(query: string): Promise<Array<{name: string, topic: string, language: 'R' | 'Python'}>> {
		const allTopics: Array<{name: string, topic: string, language: 'R' | 'Python'}> = [];

		try {
			await this.sessionManagement.ensureRSession();
			const rTopics = await this.commandService.executeCommand<string[]>('r.suggestHelpTopics', query);
			if (Array.isArray(rTopics)) {
				allTopics.push(...rTopics.map(topic => ({
					name: `${topic} (R)`,
					topic,
					language: 'R' as const
				})));
			}
		} catch (error) {
		}

		try {
			await this.sessionManagement.ensurePythonSession();
			const pythonTopics = await this.commandService.executeCommand<string[]>('python.suggestHelpTopics', query);
			if (Array.isArray(pythonTopics)) {
				allTopics.push(...pythonTopics.map(topic => ({
					name: `${topic} (Python)`,
					topic,
					language: 'Python' as const
				})));
			}
		} catch (error) {
		}

		return allTopics;
	}
}
