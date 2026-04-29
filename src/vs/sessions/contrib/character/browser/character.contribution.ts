/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/character.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { SessionsCharacterActiveContext } from '../../../common/contextkeys.js';
import { CharacterStage } from './characterStage.js';

/**
 * Lifecycle owner for the Agents window character easter egg. Instantiates
 * the character stage (which mounts itself into the auxiliary bar and owns
 * its own toggle/customization buttons).
 *
 * Exposed as a singleton so the toggle/customize commands can route to it.
 */
class SessionsCharacterContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsCharacter';

	private static _instance: CharacterStage | undefined;

	static getStage(): CharacterStage | undefined {
		return SessionsCharacterContribution._instance;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const stage = this._register(instantiationService.createInstance(CharacterStage));
		SessionsCharacterContribution._instance = stage;
		this._register({ dispose: () => { SessionsCharacterContribution._instance = undefined; } });
	}
}

registerWorkbenchContribution2(SessionsCharacterContribution.ID, SessionsCharacterContribution, WorkbenchPhase.AfterRestored);

class ToggleCharacterAction extends Action2 {
	static readonly ID = 'workbench.sessions.character.toggle';

	constructor() {
		super({
			id: ToggleCharacterAction.ID,
			title: localize2('character.toggle.title', "Toggle Character"),
			category: Categories.View,
			f1: true,
		});
	}

	run(_accessor: ServicesAccessor): void {
		SessionsCharacterContribution.getStage()?.toggle();
	}
}

class CustomizeCharacterAction extends Action2 {
	static readonly ID = 'workbench.sessions.character.customize';

	constructor() {
		super({
			id: CustomizeCharacterAction.ID,
			title: localize2('character.customize.title', "Customize Character"),
			category: Categories.View,
			f1: true,
			precondition: ContextKeyExpr.equals(SessionsCharacterActiveContext.key, true),
			metadata: {
				description: localize('character.customize.metadata', "Open the character customization panel."),
			},
		});
	}

	run(_accessor: ServicesAccessor): void {
		SessionsCharacterContribution.getStage()?.openCustomization();
	}
}

registerAction2(ToggleCharacterAction);
registerAction2(CustomizeCharacterAction);
