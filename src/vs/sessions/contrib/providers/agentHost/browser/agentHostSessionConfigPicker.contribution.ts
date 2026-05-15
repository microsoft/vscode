/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ChatContextKeyExprs } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import { Menus } from '../../../../browser/menus.js';
import { ActiveSessionProviderIdContext, IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_RE } from '../../../../common/agentHostSessionsProvider.js';
import { MobilePermissionPicker } from '../../copilotChatSessions/browser/mobilePermissionPicker.js';
import { MobileAgentHostModePicker } from './mobile/mobileAgentHostModePicker.js';
import { MobileAgentHostSessionConfigPicker } from './mobile/mobileAgentHostSessionConfigPicker.js';
import { AgentHostModePicker } from './agentHostModePicker.js';
import { AgentHostPermissionPickerDelegate } from './agentHostPermissionPickerDelegate.js';
import { AgentHostSessionConfigPicker } from './agentHostSessionConfigPicker.js';

const IsActiveSessionRemoteAgentHost = ContextKeyExpr.regex(ActiveSessionProviderIdContext.key, REMOTE_AGENT_HOST_PROVIDER_RE);
const IsActiveSessionLocalAgentHost = ContextKeyExpr.equals(ActiveSessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.agentHost.sessionConfigPicker',
			title: localize2('agentHostSessionConfigPicker', "Session Configuration"),
			f1: false,
			menu: [{
				id: Menus.NewSessionRepositoryConfig,
				group: 'navigation',
				order: 3,
				when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
			}],
		});
	}

	override async run(): Promise<void> { }
});

interface IConfigPickerWidget extends IDisposable {
	render(container: HTMLElement): void;
}

class PickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly _picker: IConfigPickerWidget, disposable?: IDisposable) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
		if (disposable) {
			this._register(disposable);
		}
	}

	override render(container: HTMLElement): void {
		this._picker.render(container);
	}

	override dispose(): void {
		this._picker.dispose();
		super.dispose();
	}
}

class AgentHostSessionConfigPickersContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.agentHostSessionConfigPicker';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super();
		// The picker factories below pick the mobile subclass at view-item
		// construction time when the viewport is phone, and the desktop
		// class otherwise. The static import of the mobile picker classes
		// creates a circular dependency (mobile → base → mobile), but ESM
		// handles it because the classes are only accessed inside these
		// factory callbacks, which run at `AfterRestored` — well after
		// both modules have finished evaluating.
		this._register(actionViewItemService.register(
			Menus.NewSessionRepositoryConfig,
			'sessions.agentHost.sessionConfigPicker',
			() => new PickerActionViewItem(this._instantiationService.createInstance(
				isPhoneLayout(this._layoutService) ? MobileAgentHostSessionConfigPicker : AgentHostSessionConfigPicker,
			)),
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionConfig,
			NEW_SESSION_MODE_PICKER_ID,
			() => new PickerActionViewItem(this._instantiationService.createInstance(
				isPhoneLayout(this._layoutService) ? MobileAgentHostModePicker : AgentHostModePicker,
			)),
		));
		this._register(actionViewItemService.register(
			MenuId.ChatInput,
			RUNNING_SESSION_MODE_PICKER_ID,
			() => new PickerActionViewItem(this._instantiationService.createInstance(
				isPhoneLayout(this._layoutService) ? MobileAgentHostModePicker : AgentHostModePicker,
			)),
		));
		this._register(actionViewItemService.register(
			Menus.NewSessionControl,
			NEW_SESSION_APPROVE_PICKER_ID,
			() => this._createNewSessionPermissionPicker(),
		));
	}

	/**
	 * On the new-chat page (left of the toolbar), use the sessions
	 * {@link PermissionPicker} so the styling matches the surrounding sessions
	 * pickers (font size, padding, icon size).
	 */
	private _createNewSessionPermissionPicker(): PickerActionViewItem {
		const delegate = this._instantiationService.createInstance(AgentHostPermissionPickerDelegate);
		const picker = this._instantiationService.createInstance(MobilePermissionPicker, delegate);
		return new PickerActionViewItem(picker, delegate);
	}
}

// ---- New session auto-approve picker (left side, NewSessionControl) ----

const NEW_SESSION_APPROVE_PICKER_ID = 'sessions.agentHost.newSessionApprovePicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_APPROVE_PICKER_ID,
			title: localize2('agentHostNewSessionApprovePicker', "Session Approvals"),
			f1: false,
			menu: [{
				id: Menus.NewSessionControl,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
			}],
		});
	}

	override async run(): Promise<void> { }
});


// ---- New session mode picker (NewSessionConfig) ----

const NEW_SESSION_MODE_PICKER_ID = 'sessions.agentHost.newSessionModePicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_MODE_PICKER_ID,
			title: localize2('agentHostNewSessionModePicker', "Agent Mode"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 0,
				// On phone the {@link MobileChatInputConfigPicker} replaces
				// this picker with a unified mode + model bottom sheet, so
				// gate this desktop-only Action out of phone layouts.
				when: ContextKeyExpr.and(
					ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
					IsPhoneLayoutContext.negate(),
				),
			}],
		});
	}

	override async run(): Promise<void> { }
});


// ---- Running session mode picker (ChatInput, beside the model picker) ----

const RUNNING_SESSION_MODE_PICKER_ID = 'sessions.agentHost.runningSessionModePicker';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUNNING_SESSION_MODE_PICKER_ID,
			title: localize2('agentHostRunningSessionModePicker', "Agent Mode"),
			f1: false,
			menu: [{
				id: MenuId.ChatInput,
				group: 'navigation',
				// `OpenModelPickerAction` (the "Auto" model picker) is at order 3
				// in the same menu — sit just before it so the mode pill renders
				// to the left of "Pick Model".
				order: 2,
				when: ChatContextKeyExprs.isAgentHostSession,
			}],
		});
	}

	override async run(): Promise<void> { }
});


registerWorkbenchContribution2(AgentHostSessionConfigPickersContribution.ID, AgentHostSessionConfigPickersContribution, WorkbenchPhase.AfterRestored);
