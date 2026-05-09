/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { SessionTypePicker, STORAGE_KEY_LAST_SESSION_TYPE } from '../sessionTypePicker.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import { IMobilePickerSheetItem, showMobilePickerSheet } from '../../../../browser/parts/mobile/mobilePickerSheet.js';

/**
 * Phone variant of {@link SessionTypePicker} that renders the picker as
 * a bottom sheet instead of the desktop action-widget popup. Falls back
 * to the inherited implementation when the viewport is no longer phone
 * (e.g. user rotated past the phone breakpoint).
 *
 * The trigger is rendered on every viewport so phone users can switch
 * session types — same functionality, different presentation. Tapping
 * the trigger on phone calls {@link showMobilePickerSheet}; on desktop
 * it falls through to the inherited action-widget popup.
 */
export class MobileSessionTypePicker extends SessionTypePicker {

	constructor(
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super(actionWidgetService, sessionsManagementService, sessionsProvidersService, storageService);
	}

	override render(container: HTMLElement, options?: { className?: string }): void {
		// Always render so the session-type chip is visible in the chip
		// row on phone. The base class renders a trigger that the mobile
		// `_showPicker` override routes to a bottom sheet, while desktop
		// uses the inherited action-widget popup. Rendering on all
		// viewports also means rotation across the phone breakpoint
		// keeps the trigger alive — consistent with MOBILE.md's
		// principle of same functionality, different presentation.
		super.render(container, options);
	}

	protected override _showPicker(): void {
		if (!this._triggerElement) {
			return;
		}
		if (!isPhoneLayout(this.layoutService)) {
			super._showPicker();
			return;
		}
		if (this._allProviderSessionTypes.length <= 1) {
			return;
		}

		const supportedTypeIds = new Set(this._supportedSessionTypes.map(t => t.id));
		const sheetItems: IMobilePickerSheetItem[] = this._allProviderSessionTypes.map(type => ({
			id: type.id,
			label: type.label,
			icon: type.icon,
			disabled: !supportedTypeIds.has(type.id),
			checked: type.id === this._sessionType,
		}));

		const trigger = this._triggerElement;
		trigger.setAttribute('aria-expanded', 'true');
		showMobilePickerSheet(
			this.layoutService.mainContainer,
			localize('mobileSessionTypePicker.title', "Session Type"),
			sheetItems,
		).then(id => {
			trigger.setAttribute('aria-expanded', 'false');
			trigger.focus();
			if (id !== undefined && id !== this._sessionType) {
				this.storageService.store(STORAGE_KEY_LAST_SESSION_TYPE, id, StorageScope.PROFILE, StorageTarget.MACHINE);
				this._onDidSelectSessionType.fire(id);
			}
		});
	}
}
