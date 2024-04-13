/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IChatWidget, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';

export class MockChatWidgetService implements IChatWidgetService {
	readonly _serviceBrand: undefined;

	/**
	 * Returns the most recently focused widget if any.
	 */
	readonly lastFocusedWidget: IChatWidget | undefined;

	getWidgetByInputUri(uri: URI): IChatWidget | undefined {
		return undefined;
	}

	getWidgetBySessionId(sessionId: string): IChatWidget | undefined {
		return undefined;
	}
}
