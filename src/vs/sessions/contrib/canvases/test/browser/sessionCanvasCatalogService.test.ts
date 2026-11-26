/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISessionCanvasDefinition } from '../../../../../workbench/services/sessions/common/session.js';
import { SessionCanvasCatalogService } from '../../browser/sessionCanvasCatalogService.js';

function canvas(canvasId: string, overrides: Partial<ISessionCanvasDefinition> = {}): ISessionCanvasDefinition {
	return { canvasId, extensionId: 'ext', extensionSource: 'user', displayName: canvasId, description: '', requiresInput: false, ...overrides };
}

function ids(canvases: readonly ISessionCanvasDefinition[]): string[] {
	return canvases.map(entry => `${entry.extensionId}/${entry.canvasId}:${entry.displayName}`);
}

suite('SessionCanvasCatalogService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('remembers the listed canvas types that can start a session across restarts, replacing them with each listing', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const catalog = disposables.add(new SessionCanvasCatalogService(storage));
		const initial = ids(catalog.entries.get());
		catalog.replace([
			canvas('board', { displayName: 'Board' }),
			canvas('needs-input', { requiresInput: true }),
			canvas('project-only', { extensionSource: 'project' }),
			canvas('agenda', { extensionId: 'plugin-ext', extensionSource: 'plugin', displayName: 'Agenda' }),
		]);
		const listed = ids(catalog.entries.get());
		catalog.replace([canvas('board', { displayName: 'Board v2' })]);
		const restored = disposables.add(new SessionCanvasCatalogService(storage));

		assert.deepStrictEqual({ initial, listed, afterRestart: ids(restored.entries.get()) }, {
			initial: [],
			listed: ['plugin-ext/agenda:Agenda', 'ext/board:Board'],
			afterRestart: ['ext/board:Board v2'],
		});
	});
});
