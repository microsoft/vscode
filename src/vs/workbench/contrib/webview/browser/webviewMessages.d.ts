/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMouseWheelEvent } from '../../../../base/browser/mouseEvent.js';
import type { WebviewStyles } from './webview.js';

type KeyEvent = {
	key: string;
	keyCode: number;
	code: string;
	shiftKey: boolean;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	repeat: boolean;
}

type WebViewDragEvent = {
	shiftKey: boolean;
}

export type FromWebviewMessage = {
	'onmessage': { message: any; transfer?: ArrayBuffer[] };
	'did-click-link': { uri: string };
	'did-scroll': { scrollYPercentage: number };
	'did-focus': void;
	'did-blur': void;
	'did-load': void;
	'did-find': { didFind: boolean };
	'do-update-state': string;
	'do-reload': void;
	'load-resource': { id: number; path: string; query: string; scheme: string; authority: string; ifNoneMatch?: string };
	'load-localhost': { id: string; origin: string };
	'did-scroll-wheel': IMouseWheelEvent;
	'fatal-error': { message: string };
	'no-csp-found': void;
	'did-keydown': KeyEvent;
	'did-keyup': KeyEvent;
	'did-context-menu': { clientX: number; clientY: number; context: { [key: string]: unknown } };
	'drag-start': void;
	'drag': WebViewDragEvent
};

interface UpdateContentEvent {
	contents: string;
	title: string | undefined;
	options: {
		allowMultipleAPIAcquire: boolean;
		allowScripts: boolean;
		allowForms: boolean;
	};
	state: any;
	cspSource: string;
	confirmBeforeClose: string;
}

export type ToWebviewMessage = {
	'focus': void;
	'message': { message: any; transfer?: ArrayBuffer[] };
	'execCommand': string;
	'did-load-resource':
	| { id: number; status: 401 | 404; path: string }
	| { id: number; status: 304; path: string; mime: string; mtime: number | undefined }
	| { id: number; status: 200; path: string; mime: string; data: any; etag: string | undefined; mtime: number | undefined }
	;
	'did-load-localhost': {
		id: string;
		origin: string;
		location: string | undefined;
	};
	'set-confirm-before-close': string;
	'set-context-menu-visible': { visible: boolean };
	'initial-scroll-position': number;
	'content': UpdateContentEvent;
	'set-title': string | undefined;
	'styles': {
		styles: WebviewStyles;
		activeTheme: string;
		themeId: string;
		themeLabel: string;
		reduceMotion: boolean;
		screenReader: boolean;
	};
	'find': { value: string; previous?: boolean };
	'find-stop': { clearSelection?: boolean };
};


export interface WebviewHostMessaging {
	postMessage<K extends keyof FromWebviewMessage>(channel: K, data: FromWebviewMessage[K], transfer?: []): void;

	onMessage<K extends keyof ToWebviewMessage>(channel: K, handler: (e: Event, data: ToWebviewMessage[K]) => void): void;
}
