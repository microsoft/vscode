/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool reference names for the integrated browser tools.
 */
export const BrowserChatToolReferenceName = {
	OpenBrowserPage: 'openBrowserPage',
	ReadPage: 'readPage',
	ScreenshotPage: 'screenshotPage',
	NavigatePage: 'navigatePage',
	ClickElement: 'clickElement',
	TypeInPage: 'typeInPage',
	HoverElement: 'hoverElement',
	DragElement: 'dragElement',
	HandleDialog: 'handleDialog',
	RunPlaywrightCode: 'runPlaywrightCode',
} as const;

/**
 * All browser-tool reference names as a flat list.
 */
export const browserChatToolReferenceNames = Object.values(BrowserChatToolReferenceName);
