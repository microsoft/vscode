/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISessionManagement } from '../common/sessionManagement.js';
import { IRuntimeSessionService, RuntimeStartMode } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { LanguageRuntimeSessionMode } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { IRuntimeStartupService } from '../../../services/runtimeStartup/common/runtimeStartupService.js';

export class SessionManagement extends Disposable implements ISessionManagement {
	readonly _serviceBrand: undefined;

	constructor(
		@IRuntimeSessionService private readonly runtimeSessionService: IRuntimeSessionService,
		@IRuntimeStartupService private readonly runtimeStartupService: IRuntimeStartupService
	) {
		super();
	}

	/**
	 * Ensure R session is available
	 */
	async ensureRSession(): Promise<void> {
		const existingRSession = this.runtimeSessionService.getConsoleSessionForLanguage('r');
		if (existingRSession) {
			return;
		}

		const rRuntime = this.runtimeStartupService.getPreferredRuntime('r');
		if (!rRuntime) {
			throw new Error('No R interpreter is available');
		}

		await this.runtimeSessionService.startNewRuntimeSession(
			rRuntime.runtimeId,
			rRuntime.runtimeName,
			LanguageRuntimeSessionMode.Console,
			undefined,
			'Erdos AI session request',
			RuntimeStartMode.Starting,
			false
		);

		await new Promise(resolve => setTimeout(resolve, 1000));
	}

	/**
	 * Ensure Python session is available
	 */
	async ensurePythonSession(): Promise<void> {
		const existingPythonSession = this.runtimeSessionService.getConsoleSessionForLanguage('python');
		if (existingPythonSession) {
			return;
		}

		const pythonRuntime = this.runtimeStartupService.getPreferredRuntime('python');
		if (!pythonRuntime) {
			throw new Error('No Python interpreter is available');
		}

		await this.runtimeSessionService.startNewRuntimeSession(
			pythonRuntime.runtimeId,
			pythonRuntime.runtimeName,
			LanguageRuntimeSessionMode.Console,
			undefined,
			'Erdos AI session request',
			RuntimeStartMode.Starting,
			false
		);

		await new Promise(resolve => setTimeout(resolve, 1000));
	}
}
