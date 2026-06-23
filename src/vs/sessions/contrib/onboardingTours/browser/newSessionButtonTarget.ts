/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { markOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { SessionSectionToolbarMenuId } from '../../sessions/browser/views/sessionsList.js';

/** Command id of the per-workspace-section "New Session" toolbar action. */
const NEW_SESSION_COMMAND_ID = 'sessionsView.sectionNewSession';

/** Onboarding target id for the "New Session" button, referenced by the tour. */
export const SESSIONS_NEW_SESSION_BUTTON_TARGET = 'sessions.newSession.button';

/**
 * The "New Session" button is rendered by the sessions list section toolbar from
 * a registered action, so it has no creation site we can tag directly. This view
 * item renders like the default one and additionally marks its element as an
 * onboarding target — registered via {@link IActionViewItemService} so it
 * applies wherever that toolbar action is shown, without touching the renderer.
 */
class OnboardingNewSessionActionViewItem extends MenuEntryActionViewItem {

	private readonly _tag = this._register(new MutableDisposable());

	override render(container: HTMLElement): void {
		super.render(container);
		if (this.element) {
			this._tag.value = markOnboardingTarget(this.element, SESSIONS_NEW_SESSION_BUTTON_TARGET);
		}
	}
}

class OnboardingNewSessionButtonTargetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.onboardingTours.newSessionButtonTarget';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();
		this._register(actionViewItemService.register(
			SessionSectionToolbarMenuId,
			NEW_SESSION_COMMAND_ID,
			(action: IAction, options: IActionViewItemOptions, instantiationService: IInstantiationService) =>
				instantiationService.createInstance(OnboardingNewSessionActionViewItem, action as MenuItemAction, options),
		));
	}
}

registerWorkbenchContribution2(OnboardingNewSessionButtonTargetContribution.ID, OnboardingNewSessionButtonTargetContribution, WorkbenchPhase.BlockRestore);
