/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentCanvasIconsMetaKey, MAX_CANVAS_ICON_DATA_URI_LENGTH, readCanvasIcon, toCanvasIconDataUri, withCanvasIcon, type CanvasStateWithMeta } from '../../common/meta/agentCanvasIconMeta.js';
import type { CanvasState } from '../../common/state/protocol/channels-canvas/state.js';

suite('Agent canvas icon metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), character => character.charCodeAt(0));
	const icon = toCanvasIconDataUri(png);
	const canvas: CanvasState = { instanceId: 'board', extensionId: 'user:board', canvasId: 'board' };
	const withIcons = (icons: unknown): CanvasStateWithMeta => ({ ...canvas, _meta: { [AgentCanvasIconsMetaKey]: icons } });

	test('adds and removes the icon while keeping other metadata, and reads only a bounded PNG data URI', () => {
		const shown = withCanvasIcon({ ...canvas, _meta: { 'vscode.other': 1 } }, icon);
		assert.deepStrictEqual({
			shown,
			read: readCanvasIcon(shown),
			removed: withCanvasIcon(shown, undefined),
			removedWithoutOtherMetadata: withCanvasIcon(withCanvasIcon(canvas, icon), undefined),
			absent: readCanvasIcon(canvas),
			rejected: [
				withIcons({ src: icon }),
				withIcons([{ src: icon, contentType: 'image/svg+xml' }]),
				withIcons([{ src: 'data:image/svg+xml;base64,PHN2Zy8+' }]),
				withIcons([{ src: 'https://example.com/icon.png' }]),
				withIcons([{ src: 'file:///Users/me/icon.png' }]),
				withIcons([{ src: 'data:image/png;base64,PHN2Zy8+' }]),
				withIcons([{ src: `${icon}"` }]),
				withIcons([{ src: icon + 'A'.repeat(MAX_CANVAS_ICON_DATA_URI_LENGTH) }]),
			].map(readCanvasIcon),
			firstValid: readCanvasIcon(withIcons([{ src: 'https://example.com/icon.png' }, { src: icon }])),
		}, {
			shown: { ...canvas, _meta: { 'vscode.other': 1, [AgentCanvasIconsMetaKey]: [{ src: icon, contentType: 'image/png' }] } },
			read: icon,
			removed: { ...canvas, _meta: { 'vscode.other': 1 } },
			removedWithoutOtherMetadata: canvas,
			absent: undefined,
			rejected: new Array(8).fill(undefined),
			firstValid: icon,
		});
	});
});
