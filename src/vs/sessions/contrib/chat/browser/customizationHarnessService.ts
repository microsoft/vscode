/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { CustomizationHarnessServiceBase, IHarnessDescriptor } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';

/**
 * Sessions-window override of the customization harness service.
 *
 * Harnesses are provided by chat session providers and AHP remote servers.
 */
export class SessionsCustomizationHarnessService extends CustomizationHarnessServiceBase {

	constructor(
		@IPromptsService promptsService: IPromptsService,
	) {
		super([], '', promptsService);
	}

	override registerExternalHarness(descriptor: IHarnessDescriptor): IDisposable {
		const registration = super.registerExternalHarness(descriptor);
		if (!this.findHarnessById(this.activeHarness.get())) {
			this.setActiveSession(this.getSessionResourceForHarness(descriptor.id));
		}
		return registration;
	}
}
