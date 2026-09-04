/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customizationsToolbar.css';
import * as DOM from '../../../../base/browser/dom.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { ICustomizationMigrationAvailabilityService } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationMigrationAvailabilityService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { localize, localize2 } from '../../../../nls.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionIsCreatedContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { OPEN_CUSTOMIZATIONS_COMMAND_ID } from '../../../common/customizations.js';

function isActiveSessionContext(context: unknown): context is IActiveSession {
	return typeof context === 'object' && context !== null && 'sessionId' in context && 'resource' in context && 'workspace' in context;
}

class CustomizationsToolbarActionViewItem extends ActionViewItem {
	private readonly session = observableValue<IActiveSession | undefined>(this, undefined);
	private tooltip = '';
	private hasMigrations = false;

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		@ISessionsService sessionsService: ISessionsService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@ICustomizationMigrationAvailabilityService migrationAvailabilityService: ICustomizationMigrationAvailabilityService,
	) {
		super(undefined, action, { ...options, icon: true, label: true });

		this._register(autorun(reader => {
			const session = this.session.read(reader);
			const activeSession = sessionsService.activeSession.read(reader);
			harnessService.activeHarness.read(reader);
			harnessService.availableHarnesses.read(reader);
			const isActiveSession = session?.sessionId === activeSession?.sessionId;
			const harnessLabel = session
				? isActiveSession
					? harnessService.getActiveDescriptor().label
					: harnessService.findHarnessById(session.sessionType)?.label
				: undefined;
			const workspaceLabel = session?.workspace.read(reader)?.folders[0]?.name;
			const hasMigrations = isActiveSession && migrationAvailabilityService.candidateCount.read(reader) > 0;
			this.updatePresentation(harnessLabel, workspaceLabel, hasMigrations);
		}));
	}

	override setActionContext(context: unknown): void {
		super.setActionContext(context);
		this.session.set(isActiveSessionContext(context) ? context : undefined, undefined);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('sessions-customize-toolbar-action');
		container.classList.toggle('has-migrations', this.hasMigrations);
	}

	protected override getTooltip(): string {
		return this.tooltip;
	}

	protected override updateLabel(): void {
		if (this.label) {
			const text = DOM.$('span.sessions-customize-toolbar-label');
			text.textContent = localize('customizeActionLabel', "Customize");
			DOM.reset(this.label, text);
		}
	}

	private updatePresentation(harnessLabel: string | undefined, workspaceLabel: string | undefined, hasMigrations: boolean): void {
		let tooltip: string;
		if (harnessLabel && workspaceLabel) {
			tooltip = localize('customizeHarnessForWorkspace', "Customize {0} for {1}", harnessLabel, workspaceLabel);
		} else if (harnessLabel) {
			tooltip = localize('customizeHarness', "Customize {0}", harnessLabel);
		} else if (workspaceLabel) {
			tooltip = localize('customizeWorkspace', "Customize for {0}", workspaceLabel);
		} else {
			tooltip = localize('openCustomizationsTooltip', "Open Customizations");
		}
		this.tooltip = hasMigrations
			? localize('customizeMigrationsAvailable', "{0}, migrations available", tooltip)
			: tooltip;
		this.hasMigrations = hasMigrations;
		this.element?.classList.toggle('has-migrations', hasMigrations);
		this.updateTooltip();
	}
}

registerAction2(class OpenCustomizationsAction extends Action2 {
	constructor() {
		super({
			id: OPEN_CUSTOMIZATIONS_COMMAND_ID,
			title: localize2('openCustomizations', "Open Customizations"),
			icon: Codicon.tools,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: Menus.SessionBarToolbar,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.and(SessionIsCreatedContext, ChatContextKeys.enabled),
			}, {
				id: Menus.SessionHeaderContext,
				group: '2_edit',
				order: 2,
				when: ContextKeyExpr.and(SessionIsCreatedContext, ChatContextKeys.enabled),
			}],
		});
	}

	async run(accessor: ServicesAccessor, session?: IActiveSession): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		if (session) {
			sessionsService.setActive(session);
		}
		const targetSession = session ?? sessionsService.activeSession.get();
		const harnessService = accessor.get(ICustomizationHarnessService);
		if (targetSession) {
			harnessService.setActiveSession(targetSession.resource);
		}

		const input = AICustomizationManagementEditorInput.getOrCreate();
		input.setTargetLabels(
			harnessService.getActiveDescriptor().label,
			accessor.get(IAICustomizationWorkspaceService).activeProjectLabel.get(),
		);
		const pane = await accessor.get(IEditorService).openEditor(input, { pinned: true });
		if (pane instanceof AICustomizationManagementEditor) {
			pane.showWelcomePage();
		}
	}
});

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

export class CustomizationsToolbarContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessionsCustomizationsToolbar';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		this._register(actionViewItemService.register(
			Menus.SessionBarToolbar,
			OPEN_CUSTOMIZATIONS_COMMAND_ID,
			(action, options, instantiationService) => instantiationService.createInstance(CustomizationsToolbarActionViewItem, action, options),
		));
	}
}

registerWorkbenchContribution2(ActiveSessionHarnessSyncContribution.ID, ActiveSessionHarnessSyncContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(CustomizationsToolbarContribution.ID, CustomizationsToolbarContribution, WorkbenchPhase.AfterRestored);
