/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun } from '../../../../../base/common/observable.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatInputPickerOptions } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { PermissionPickerActionItem } from '../../../../../workbench/contrib/chat/browser/widget/input/permissionPickerActionItem.js';
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
		@IInstantiationService instantiationService: IInstantiationService,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IDialogService dialogService: IDialogService,
		@IOpenerService openerService: IOpenerService,
		@IStorageService storageService: IStorageService,
	) {
		const delegate = instantiationService.createInstance(AgentHostPermissionPickerDelegate);
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
			if (this.element) {
				this.element.style.display = visible ? '' : 'none';
			}
		}));
	}
}
