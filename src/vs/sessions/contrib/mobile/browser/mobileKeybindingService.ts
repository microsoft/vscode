/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IKeyboardLayoutService } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { WorkbenchKeybindingService } from '../../../../workbench/services/keybinding/browser/keybindingService.js';
import { IUserDataProfileService } from '../../../../workbench/services/userDataProfile/common/userDataProfile.js';

/**
 * Phone presentation of the keybinding service.
 *
 * Keybindings still resolve and dispatch, so a paired hardware keyboard works
 * and every command keeps its shortcut. What changes is what the UI *says*:
 * tooltips and labels no longer advertise shortcuts (`Add context (⌘/)`),
 * because on a touch screen a shortcut hint is noise the user cannot act on.
 */
export class MobileKeybindingService extends WorkbenchKeybindingService {

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IHostService hostService: IHostService,
		@IExtensionService extensionService: IExtensionService,
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService,
		@IKeyboardLayoutService keyboardLayoutService: IKeyboardLayoutService,
	) {
		super(contextKeyService, commandService, telemetryService, notificationService, userDataProfileService, hostService, extensionService, fileService, uriIdentityService, logService, keyboardLayoutService);
	}

	override appendKeybinding(label: string): string {
		return label;
	}
}
