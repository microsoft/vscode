/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { CheckboxActionViewItem } from '../../../../../base/browser/ui/toggle/toggle.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import type { IChatExecuteActionContext } from '../actions/chatExecuteActions.js';
import { IChatWidgetService } from '../chat.js';

const sandboxAvailable = new RawContextKey<boolean>('chatCloudSandboxAvailable', false);
const sandboxEnabled = new RawContextKey<boolean>('chatCloudSandboxEnabled', false);
const sandboxChecked = new RawContextKey<boolean>('chatCloudSandboxChecked', false);

/** Keeps the composer checkbox and its overflow action scoped to their own Cloud draft. */
export class CloudSandboxCheckbox extends Disposable {
	static readonly ID = 'workbench.action.chat.toggleCloudSandbox';

	constructor(
		private readonly _sessionResource: IObservable<URI | undefined>,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const available = sandboxAvailable.bindTo(contextKeyService);
		const enabled = sandboxEnabled.bindTo(contextKeyService);
		const checked = sandboxChecked.bindTo(contextKeyService);
		const optionsChanged = observableSignalFromEvent(this, Event.any(
			_chatSessionsService.onDidChangeSessionCreationOptions,
			_chatSessionsService.onDidChangeSessionOptions,
		));
		this._register(autorun(reader => {
			optionsChanged.read(reader);
			const resource = _sessionResource.read(reader);
			const option = resource && getChatSessionType(resource) === SessionType.CopilotCloud
				? _chatSessionsService.getChatSessionCreationOption(resource)
				: undefined;
			contextKeyService.bufferChangeEvents(() => {
				available.set(!!option);
				enabled.set(!!option?.enabled);
				checked.set(!!option?.checked);
			});
		}));
	}

	createActionViewItem(action: IAction, options: IActionViewItemOptions): CheckboxActionViewItem {
		const resource = this._sessionResource.get();
		const option = resource ? this._chatSessionsService.getChatSessionCreationOption(resource) : undefined;
		return new CheckboxActionViewItem(undefined, {
			id: action.id,
			label: action.label,
			tooltip: option?.description ?? action.tooltip,
			enabled: action.enabled,
			checked: action.checked,
			class: undefined,
			run: context => action.run(context),
		}, { ...options, label: true, checkboxStyles: { ...defaultCheckboxStyles, size: 14 } });
	}
}

registerAction2(class ToggleCloudSandboxAction extends Action2 {
	constructor() {
		super({
			id: CloudSandboxCheckbox.ID,
			title: localize2('cloudSandbox.checkbox', "Sandbox"),
			tooltip: localize('cloudSandbox.checkboxDescription', "Run in a GitHub-managed sandbox. A GitHub repository is required."),
			f1: false,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.chatSessionIsEmpty, sandboxEnabled),
			toggled: sandboxChecked,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 0.55,
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
					ChatContextKeys.inQuickChat.negate(),
					IsSessionsWindowContext.negate(),
					ChatContextKeys.chatSessionIsEmpty,
					sandboxAvailable,
				),
			}],
		});
	}

	override run(accessor: ServicesAccessor, context?: IChatExecuteActionContext): void {
		const widget = context?.widget ?? accessor.get(IChatWidgetService).lastFocusedWidget;
		const resource = widget?.viewModel?.sessionResource;
		const option = resource ? accessor.get(IChatSessionsService).getChatSessionCreationOption(resource) : undefined;
		if (option?.enabled) {
			option.setChecked(!option.checked);
		}
	}
});
