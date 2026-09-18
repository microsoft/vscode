/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { OPEN_AI_CUSTOMIZATIONS_COMMAND_ID } from './customizationsConstants.js';

async function openCustomizationOverviewPage(editorService: IEditorService, harnessService: ICustomizationHarnessService, sessionsService: ISessionsService): Promise<void> {
	const session = sessionsService.activeSession.get();
	if (session) {
		harnessService.setActiveSession(session.resource);
	}

	const input = AICustomizationManagementEditorInput.getOrCreate();
	input.setTargetLabels(harnessService.getActiveDescriptor().label, session?.workspace.get()?.folders[0]?.name);
	const pane = await editorService.openEditor(input, { pinned: true });
	if (pane instanceof AICustomizationManagementEditor) {
		pane.showWelcomePage();
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OPEN_AI_CUSTOMIZATIONS_COMMAND_ID,
			title: localize2('customizations', "Customizations"),
			precondition: ChatContextKeys.enabled,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await openCustomizationOverviewPage(
			accessor.get(IEditorService),
			accessor.get(ICustomizationHarnessService),
			accessor.get(ISessionsService),
		);
	}
});

/**
 * Returns the harness id that matches a given session, or `undefined` if no
 * harness is registered for it.
 *
 * The session's `resource.scheme` is the per-host harness id (e.g. local AHP
 * uses `agent-host-${provider}` and remote AHP uses `remote-${authority}-${provider}`),
 * while {@link ISession.sessionType} is the agent provider name shared across
 * hosts (e.g. `copilotcli`). Lookup therefore prefers the resource scheme so
 * that an AHP remote session selects its remote harness rather than the local
 * harness with the same `sessionType`. The `sessionType` is kept as a fallback
 * for harnesses whose id matches it directly.
 */
export function findHarnessIdForSession(session: ISession | undefined, harnessService: ICustomizationHarnessService): string | undefined {
	if (!session) {
		return undefined;
	}
	const schemeId = session.resource.scheme;
	if (harnessService.findHarnessById(schemeId)) {
		return schemeId;
	}
	if (harnessService.findHarnessById(session.sessionType)) {
		return session.sessionType;
	}
	return undefined;
}

/**
 * Keeps the active customization harness in sync with the currently active
 * session. This drives the customizations editor so it reflects the harness
 * that matches the session the user is interacting with.
 */
export class ActiveSessionHarnessSyncContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsActiveHarnessSync';

	constructor(
		@ISessionsService sessionsService: ISessionsService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
	) {
		super();

		this._register(autorun(reader => {
			const session = sessionsService.activeSession.read(reader);
			if (!session) {
				return;
			}
			harnessService.availableHarnesses.read(reader);
			harnessService.setActiveSession(session.resource);
		}));
	}
}

registerWorkbenchContribution2(ActiveSessionHarnessSyncContribution.ID, ActiveSessionHarnessSyncContribution, WorkbenchPhase.AfterRestored);
