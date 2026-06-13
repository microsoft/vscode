/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { SessionTypePicker } from '../sessionTypePicker.js';
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
		session: IObservable<ISession | undefined>,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super(session, actionWidgetService, sessionsManagementService, _sessionsProvidersService, storageService, telemetryService);
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
		if (this._folderSessionTypes.length <= 1) {
			return;
		}

		// Build sheet items — composite id is `providerId\u0000sessionTypeId`
		// so we can map back to the right provider on selection. Show the
		// provider's label as a section title only for provider groups
		// that contain at least one duplicated session type label.
		const labelCounts = new Map<string, number>();
		for (const { sessionType } of this._folderSessionTypes) {
			labelCounts.set(sessionType.label, (labelCounts.get(sessionType.label) ?? 0) + 1);
		}
		const providersWithDuplicates = new Set<string>();
		for (const { providerId, sessionType } of this._folderSessionTypes) {
			if ((labelCounts.get(sessionType.label) ?? 0) > 1) {
				providersWithDuplicates.add(providerId);
			}
		}
		const sheetItems: IMobilePickerSheetItem[] = [];
		let lastProviderId: string | undefined;
		for (const { providerId, sessionType } of this._folderSessionTypes) {
			const isFirstInGroup = providerId !== lastProviderId;
			lastProviderId = providerId;
			sheetItems.push({
				id: `${providerId}\u0000${sessionType.id}`,
				label: sessionType.label,
				icon: sessionType.icon,
				checked: providerId === this._picked?.providerId && sessionType.id === this._picked?.sessionTypeId,
				sectionTitle: providersWithDuplicates.has(providerId) && isFirstInGroup ? (this._sessionsProvidersService.getProvider(providerId)?.label ?? providerId) : undefined,
			});
		}

		const trigger = this._triggerElement;
		trigger.setAttribute('aria-expanded', 'true');
		showMobilePickerSheet(
			this.layoutService.mainContainer,
			localize('mobileSessionTypePicker.title', "Session Type"),
			sheetItems,
		).then(id => {
			trigger.setAttribute('aria-expanded', 'false');
			trigger.focus();
			if (id !== undefined) {
				const [providerId, sessionTypeId] = id.split('\u0000');
				if (providerId && sessionTypeId) {
					this._handleSelectedSessionType({ providerId, sessionTypeId });
				}
			}
		});
	}
}
