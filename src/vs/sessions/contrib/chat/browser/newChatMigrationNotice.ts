/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/newChatMigrationNotice.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatCustomizationMigrationNotice, IChatCustomizationMigrationNoticeContext } from '../../../../workbench/contrib/chat/browser/aiCustomization/chatCustomizationMigrationNotice.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { isAgentHostSessionResource } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

export class NewChatMigrationNotice extends Disposable {
	readonly element: HTMLElement;

	constructor(
		container: HTMLElement,
		session: IObservable<IActiveSession | undefined>,
		focusInput: () => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAICustomizationWorkspaceService workspaceService: IAICustomizationWorkspaceService,
	) {
		super();
		const context = derived<IChatCustomizationMigrationNoticeContext | undefined>(this, reader => {
			const currentSession = session.read(reader);
			if (!currentSession
				|| currentSession.isCreated.read(reader)
				|| currentSession.loading.read(reader)
				|| !isAgentHostSessionResource(currentSession.resource)) {
				return undefined;
			}
			const workspace = currentSession.workspace.read(reader);
			return {
				sessionResource: currentSession.resource,
				workspace: workspace?.uri,
				projectRoot: workspaceService.activeProjectRoot.read(reader),
			};
		});
		const showNotice = derived(this, reader => !!context.read(reader));
		const notice = this._register(instantiationService.createInstance(
			ChatCustomizationMigrationNotice,
			container,
			context,
			showNotice,
			focusInput,
			() => { },
			() => { },
			{ skipDiscoveryWhenDismissed: true },
		));
		this.element = notice.element;
		this.element.classList.add('new-chat-migration-notice');
	}
}
