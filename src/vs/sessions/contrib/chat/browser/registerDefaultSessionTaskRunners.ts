/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionTaskRunnerRegistry } from './sessionTaskRunner.js';
import { WorkbenchSessionTaskRunner } from './workbenchSessionTaskRunner.js';

/**
 * Registers the default {@link WorkbenchSessionTaskRunner} with the
 * {@link ISessionTaskRunnerRegistry}. The workbench runner is the lowest
 * priority fallback; specialized runners (e.g. for agent hosts) register
 * themselves separately from their own contributions.
 */
export class RegisterDefaultSessionTaskRunnersContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.registerDefaultTaskRunners';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionTaskRunnerRegistry registry: ISessionTaskRunnerRegistry,
	) {
		super();
		const runner = instantiationService.createInstance(WorkbenchSessionTaskRunner);
		this._register(registry.register(runner));
	}
}
