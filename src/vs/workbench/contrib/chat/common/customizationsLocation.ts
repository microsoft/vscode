/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export type ChatCustomizationsLocation = 'auto' | 'sidebar' | 'sessionsHeader' | 'chatToolbar' | 'chatInput';

export const ChatCustomizationsLocationContext = new RawContextKey<Exclude<ChatCustomizationsLocation, 'auto'>>('chatCustomizationsLocation', 'chatToolbar');

export function resolveChatCustomizationsLocation(location: ChatCustomizationsLocation, isSessionsWindow: boolean, navigationIncludesCustomizations: boolean): Exclude<ChatCustomizationsLocation, 'auto'> {
	if (!isSessionsWindow) {
		return location === 'chatInput' ? 'chatInput' : 'chatToolbar';
	}
	if (location === 'auto') {
		return navigationIncludesCustomizations ? 'sessionsHeader' : 'sidebar';
	}
	return location;
}
