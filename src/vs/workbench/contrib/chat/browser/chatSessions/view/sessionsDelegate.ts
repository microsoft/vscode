/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListVirtualDelegate } from '../../../../../../base/browser/ui/list/list.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ChatSessionItemWithProvider } from '../common.js';
import { SessionsRenderer } from './sessionsRenderer.js';

export class SessionsDelegate implements IListVirtualDelegate<ChatSessionItemWithProvider> {
	static readonly ITEM_HEIGHT = 22;
	static readonly ITEM_HEIGHT_WITH_DESCRIPTION = 44; // Slightly smaller for cleaner look

	constructor(private readonly configurationService: IConfigurationService) { }

	getHeight(element: ChatSessionItemWithProvider): number {
		// Return consistent height for all items (single-line layout)
		if (element.description && this.configurationService.getValue(ChatConfiguration.ShowAgentSessionsViewDescription) && element.provider.chatSessionType !== 'local') {
			return SessionsDelegate.ITEM_HEIGHT_WITH_DESCRIPTION;
		} else {
			return SessionsDelegate.ITEM_HEIGHT;
		}
	}

	getTemplateId(element: ChatSessionItemWithProvider): string {
		return SessionsRenderer.TEMPLATE_ID;
	}
}
