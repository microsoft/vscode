/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IBrowserViewKeyRoutingEvent {
	key: string;
	code: string;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	metaKey: boolean;
}

export interface IBrowserViewKeyRoutingContext {
	isMac: boolean;
	isEditableTarget: boolean;
}

function isNativeTextNavigationShortcut(event: IBrowserViewKeyRoutingEvent, isMac: boolean): boolean {
	const ctrlCmd = isMac ? event.metaKey : event.ctrlKey;
	if (!ctrlCmd || event.altKey) {
		return false;
	}

	switch (event.key) {
		case 'ArrowLeft':
		case 'ArrowRight':
		case 'ArrowUp':
		case 'ArrowDown':
			return true;
		default:
			return false;
	}
}

export function shouldForwardBrowserViewKeydown(event: IBrowserViewKeyRoutingEvent, context: IBrowserViewKeyRoutingContext): boolean {
	const isNonEditingKey =
		event.key === 'Escape' ||
		/^F\d+$/.test(event.key) ||
		event.key.startsWith('Audio') || event.key.startsWith('Media') || event.key.startsWith('Browser');

	// Most plain key events should be handled natively by the browser and not forwarded.
	if (!(event.ctrlKey || event.altKey || event.metaKey) && !isNonEditingKey) {
		return false;
	}

	// Alt+Key special character handling (Alt + Numpad keys on Windows/Linux, Alt + any key on Mac).
	if (event.altKey && !event.ctrlKey && !event.metaKey) {
		if (context.isMac || /^Numpad\d+$/.test(event.code)) {
			return false;
		}
	}

	// Allow common native editing shortcuts to stay within the browser.
	const ctrlCmd = context.isMac ? event.metaKey : event.ctrlKey;
	if (ctrlCmd && !event.altKey) {
		const key = event.key.toLowerCase();
		if (!event.shiftKey && (key === 'a' || key === 'c' || key === 'v' || key === 'x' || key === 'z')) {
			return false;
		}
		if (event.shiftKey && (key === 'v' || key === 'z')) {
			return false;
		}
		if (!event.shiftKey && key === 'y' && !context.isMac) {
			return false;
		}
		if (context.isEditableTarget && isNativeTextNavigationShortcut(event, context.isMac)) {
			return false;
		}
	}

	return true;
}
