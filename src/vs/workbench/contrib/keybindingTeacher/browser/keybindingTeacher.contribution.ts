/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IKeybindingTeacherService } from '../common/keybindingTeacher.js';
import { KeybindingTeacherService } from './keybindingTeacherService.js';
import '../common/keybindingTeacherConfiguration.js'; // Load configuration

/**
 * Workbench contribution that initializes the keybinding teacher service
 */
class KeybindingTeacherContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.keybindingTeacher';

	constructor(
		@IKeybindingTeacherService private readonly keybindingTeacherService: IKeybindingTeacherService
	) {
		super();
		// Service is instantiated and ready via dependency injection
	}
}

// Register the service as Eager so it starts immediately
registerSingleton(IKeybindingTeacherService, KeybindingTeacherService, InstantiationType.Eager);

// Register the contribution
registerWorkbenchContribution2(KeybindingTeacherContribution.ID, KeybindingTeacherContribution, WorkbenchPhase.BlockRestore);
