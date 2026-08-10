/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { getSessionTypeAvailability, getSessionTypeUnavailableLabel, SessionTypeAvailability } from '../../../../../workbench/contrib/chat/browser/agentSessions/sessionTypeAvailability.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IProviderSessionType, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SessionTypePicker, ISessionTypePickerOptions } from '../sessionTypePicker.js';
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
		options: ISessionTypePickerOptions | undefined,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(session, options, actionWidgetService, sessionsManagementService, _sessionsProvidersService, storageService, telemetryService, chatSessionsService, chatEntitlementService, languageModelsService, contextKeyService);
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
		if (this._folderSessionTypes.length <= 1 && this._pickServedByFolder(this._picked)) {
			return;
		}

		// Build sheet items — composite id is `providerId\u0000sessionTypeId`
		// so we can map back to the right provider on selection. Group session
		// types by their provider's display label (preserving first-seen order)
		// so each section title is shown once even when providers are
		// interleaved or share a label. Show titles only when more than one
		// group exists.
		const groups = new Map<string, IProviderSessionType[]>();
		for (const folderType of this._folderSessionTypes) {
			const groupTitle = this._sessionsProvidersService.getProvider(folderType.providerId)?.label ?? folderType.providerId;
			const existing = groups.get(groupTitle);
			if (existing) {
				existing.push(folderType);
			} else {
				groups.set(groupTitle, [folderType]);
			}
		}
		const showSectionHeaders = groups.size > 1;
		const sheetItems: IMobilePickerSheetItem[] = [];
		for (const [groupTitle, types] of groups) {
			let isFirstInGroup = true;
			for (const { providerId, sessionType } of types) {
				const availability = getSessionTypeAvailability(this.chatSessionsService, this.chatEntitlementService, this.languageModelsService, sessionType.chatSessionType ?? sessionType.id);
				sheetItems.push({
					id: `${providerId}\u0000${sessionType.id}`,
					label: sessionType.label,
					icon: sessionType.icon,
					checked: providerId === this._picked?.providerId && sessionType.id === this._picked?.sessionTypeId,
					disabled: availability !== SessionTypeAvailability.Available,
					description: getSessionTypeUnavailableLabel(availability),
					sectionTitle: showSectionHeaders && isFirstInGroup ? groupTitle : undefined,
				});
				isFirstInGroup = false;
			}
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
