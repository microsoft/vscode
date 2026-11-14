/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorWindowChatPartService } from '../agentsView/agentsChatPartContribution.js';
import { registerChatBackgroundConfiguration } from '../chatBackgroundActions.js';
import { SessionsChatBackgroundTint } from '../chatBackgroundTint.js';

/**
 * Has the chat background's settings, and its tint of the window's theme, in an editor window while its chat area is
 * enabled, whose chats show over the chat background, as the Agents window always has them. Disabling the chat area
 * removes the tint, also one saved in the settings.
 */
export class EditorWindowChatBackgroundConfiguration extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.editorWindowChatBackgroundConfiguration';

	constructor(
		@IEditorWindowChatPartService chatPartService: IEditorWindowChatPartService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(autorun(reader => {
			if (chatPartService.enabled.read(reader)) {
				reader.store.add(registerChatBackgroundConfiguration());
				reader.store.add(this.createTint(instantiationService));
			}
		}));
	}

	protected createTint(instantiationService: IInstantiationService): SessionsChatBackgroundTint {
		return instantiationService.createInstance(SessionsChatBackgroundTint);
	}
}
