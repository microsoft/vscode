/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatInputPickerOptions } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { PermissionPickerActionItem } from '../../../../../workbench/contrib/chat/browser/widget/input/permissionPickerActionItem.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { AgentHostPermissionPickerDelegate } from './agentHostPermissionPickerDelegate.js';

/**
 * Agent host wrapper around the workbench {@link PermissionPickerActionItem}
 * for use in the running chat widget's secondary toolbar
 * (`MenuId.ChatInputSecondary`). Owns its
 * {@link AgentHostPermissionPickerDelegate} and reactively hides itself when
 * the active session's `autoApprove` schema doesn't match the well-known
 * shape.
 */
export class AgentHostPermissionPickerActionItem extends PermissionPickerActionItem {

	private readonly _delegate: AgentHostPermissionPickerDelegate;

	constructor(
		action: MenuItemAction,
		pickerOptions: IChatInputPickerOptions,
		session: IObservable<IActiveSession | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IDialogService dialogService: IDialogService,
		@IOpenerService openerService: IOpenerService,
		@IStorageService storageService: IStorageService,
		@IHoverService hoverService: IHoverService,
	) {
		const delegate = instantiationService.createInstance(AgentHostPermissionPickerDelegate, session);
		super(
			action,
			delegate,
			pickerOptions,
			actionWidgetService,
			keybindingService,
			contextKeyService,
			telemetryService,
			configurationService,
			dialogService,
			openerService,
			storageService,
			hoverService,
		);
		this._delegate = this._register(delegate);

		// The base widget's label is rendered on demand via `refresh()`. Keep it
		// in sync with the delegate's level observable.
		this._register(autorun(reader => {
			delegate.currentPermissionLevel.read(reader);
			this.refresh();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		// The active session can change while this view item is alive (the
		// `IActionViewItemService` factory only runs once per render), so gate
		// visibility reactively rather than at construction time.
		this._register(autorun(reader => {
			const visible = this._delegate.isApplicable.read(reader);
			container.style.display = visible ? '' : 'none';
		}));

		// Reflect the resolving state. The underlying ActionWidgetDropdown
		// still handles Enter/Space on its label and pointer-events: none
		// doesn't block keyboard, so the delegate also bails at the
		// provider boundary.
		this._register(autorun(reader => {
			const isResolving = this._delegate.isResolving.read(reader);
			const element = this.element;
			if (!element) {
				return;
			}
			element.classList.toggle('sessions-chat-config-resolving', isResolving);
			this.setDropdownEnabled(!isResolving);
			if (isResolving) {
				element.setAttribute('aria-disabled', 'true');
			} else {
				element.removeAttribute('aria-disabled');
			}
		}));
	}

	protected override updateEnabled(): void {
		super.updateEnabled();
		this.setDropdownEnabled(!this._delegate.isResolving.get());
	}
}
