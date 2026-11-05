/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/newChatMigrationNotice.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatCustomizationMigrationNotice, IChatCustomizationMigrationNoticeContext } from '../../../../workbench/contrib/chat/browser/aiCustomization/chatCustomizationMigrationNotice.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { isAgentHostSessionResource } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { NewSessionBannerPriority, NewSessionBanners } from '../common/newSessionBanners.js';

export class NewChatMigrationNotice extends Disposable {
	readonly element: HTMLElement;

	constructor(
		container: HTMLElement,
		banners: NewSessionBanners,
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
		// Whether the notice has a migration to show that the user did not dismiss, as it reports once discovered.
		const hasMigration = observableValue(this, false);
		const banner = this._register(banners.register(NewSessionBannerPriority.Migration, hasMigration));
		const showNotice = derived(this, reader => !!context.read(reader) && banner.isShowing.read(reader));
		const notice = this._register(instantiationService.createInstance(
			ChatCustomizationMigrationNotice,
			container,
			context,
			showNotice,
			focusInput,
			available => hasMigration.set(available, undefined),
			() => { },
			{ skipDiscoveryWhenDismissed: true },
		));
		this.element = notice.element;
		this.element.classList.add('new-chat-migration-notice');
	}
}
