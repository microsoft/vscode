/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { TestEditorGroupView } from '../../../../test/browser/workbenchTestServices.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { LiquidCanvasEditor } from '../../browser/views/liquidCanvasEditor.js';
import { LiquidModuleRegistry } from '../../browser/liquidModuleRegistry.js';
import type { ILiquidDataResolver } from '../../browser/liquidMoleculeBridge.js';
import type { ICompositionIntent, ILiquidMolecule } from '../../common/liquidModuleTypes.js';
import type { IFileService, IFileContent } from '../../../../../platform/files/common/files.js';

/**
 * Mock ILiquidDataResolver - returns empty arrays for all fetches.
 */
class MockDataResolver implements ILiquidDataResolver {
	declare readonly _serviceBrand: undefined;

	async fetch(_entity: string, _query?: Record<string, unknown>): Promise<unknown[]> {
		return [];
	}

	async mutate(_entity: string, _operation: 'create' | 'update' | 'delete', _data: unknown): Promise<void> {
		// no-op
	}
}

/**
 * Mock IFileService - only implements readFile for molecule HTML loading.
 */
function createMockFileService(files: Map<string, string>): IFileService {
	return {
		_serviceBrand: undefined,
		readFile(resource: URI): Promise<IFileContent> {
			const content = files.get(resource.toString());
			if (content === undefined) {
				return Promise.reject(new Error(`File not found: ${resource.toString()}`));
			}
			return Promise.resolve({
				value: VSBuffer.fromString(content),
				resource,
				name: resource.path.split('/').pop() ?? '',
				mtime: 0,
				ctime: 0,
				etag: '',
				size: content.length,
				readonly: false,
				locked: false,
				children: undefined,
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
			} as unknown as IFileContent);
		},
	} as unknown as IFileService;
}

function makeMolecule(overrides: Partial<ILiquidMolecule> & { id: string; label: string; entryUri: URI; extensionId: string }): ILiquidMolecule {
	return {
		description: '',
		domain: 'general',
		category: 'stat',
		tags: [],
		layout: { minCols: 4, maxCols: 12, minHeight: 150 },
		shows: [],
		relatesTo: [],
		...overrides,
	};
}

suite('LiquidCanvasEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let parent: HTMLElement;
	let registry: LiquidModuleRegistry;
	let dataResolver: MockDataResolver;

	setup(() => {
		parent = document.createElement('div');
		registry = store.add(new LiquidModuleRegistry());
		dataResolver = new MockDataResolver();
	});

	function createEditor(fileService?: IFileService): LiquidCanvasEditor {
		const group = new TestEditorGroupView(0);
		const fs = fileService ?? createMockFileService(new Map());
		const editor = new LiquidCanvasEditor(
			group,
			NullTelemetryService,
			new TestThemeService(),
			store.add(new TestStorageService()),
			fs,
			dataResolver,
			registry,
			new NullLogService(),
		);
		store.add(editor);
		editor.create(parent);
		return editor;
	}

	// ---- Container creation ----

	test('createEditor appends liquid-canvas-container to parent', () => {
		createEditor();
		const container = parent.querySelector('.liquid-canvas-container');
		assert.ok(container, 'Expected .liquid-canvas-container in parent');
	});

	// ---- Layout strategies ----

	test('single layout renders 1fr x 1fr grid', () => {
		const editor = createEditor();
		const intent: ICompositionIntent = {
			layout: 'single',
			slots: [{ viewId: 'dashboard' }],
		};
		editor.composeIntent(intent);
		const grid = parent.querySelector('.liquid-canvas-grid') as HTMLElement;
		assert.ok(grid);
		assert.strictEqual(grid.style.gridTemplateColumns, '1fr');
		assert.strictEqual(grid.style.gridTemplateRows, '1fr');
	});

	test('split-horizontal layout distributes columns', () => {
		const editor = createEditor();
		const intent: ICompositionIntent = {
			layout: 'split-horizontal',
			slots: [
				{ viewId: 'a', weight: 2 },
				{ viewId: 'b' },
			],
		};
		editor.composeIntent(intent);
		const grid = parent.querySelector('.liquid-canvas-grid') as HTMLElement;
		assert.strictEqual(grid.style.gridTemplateColumns, '2fr 1fr');
		assert.strictEqual(grid.style.gridTemplateRows, '1fr');
	});

	test('split-vertical layout distributes rows', () => {
		const editor = createEditor();
		const intent: ICompositionIntent = {
			layout: 'split-vertical',
			slots: [{ viewId: 'top' }, { viewId: 'bottom', weight: 3 }],
		};
		editor.composeIntent(intent);
		const grid = parent.querySelector('.liquid-canvas-grid') as HTMLElement;
		assert.strictEqual(grid.style.gridTemplateColumns, '1fr');
		assert.strictEqual(grid.style.gridTemplateRows, '1fr 3fr');
	});

	test('grid layout computes columns and rows from slot count', () => {
		const editor = createEditor();
		const intent: ICompositionIntent = {
			layout: 'grid',
			slots: [{ viewId: 'a' }, { viewId: 'b' }, { viewId: 'c' }, { viewId: 'd' }, { viewId: 'e' }, { viewId: 'f' }],
		};
		editor.composeIntent(intent);
		const grid = parent.querySelector('.liquid-canvas-grid') as HTMLElement;
		// sqrt(6) = 2.44 -> ceil = 3 cols, ceil(6/3) = 2 rows
		assert.strictEqual(grid.style.gridTemplateColumns, 'repeat(3, 1fr)');
		assert.strictEqual(grid.style.gridTemplateRows, 'repeat(2, 1fr)');
	});

	test('stack layout uses minmax rows', () => {
		const editor = createEditor();
		const intent: ICompositionIntent = {
			layout: 'stack',
			slots: [{ viewId: 'a' }, { viewId: 'b' }],
		};
		editor.composeIntent(intent);
		const grid = parent.querySelector('.liquid-canvas-grid') as HTMLElement;
		assert.strictEqual(grid.style.gridTemplateColumns, '1fr');
		assert.strictEqual(grid.style.gridTemplateRows, 'minmax(150px, 1fr) minmax(150px, 1fr)');
	});

	// ---- Slot rendering ----

	test('each slot renders header and body elements', () => {
		const editor = createEditor();
		editor.composeIntent({
			layout: 'split-horizontal',
			slots: [
				{ viewId: 'orders', label: 'Ordini' },
				{ viewId: 'dishes', label: 'Piatti' },
			],
		});
		const slots = parent.querySelectorAll('.liquid-canvas-slot');
		assert.strictEqual(slots.length, 2);

		const headers = parent.querySelectorAll('.liquid-canvas-slot-header');
		assert.strictEqual(headers.length, 2);
		assert.strictEqual(headers[0].textContent, 'Ordini');
		assert.strictEqual(headers[1].textContent, 'Piatti');

		const bodies = parent.querySelectorAll('.liquid-canvas-slot-body');
		assert.strictEqual(bodies.length, 2);
	});

	test('slot without label falls back to viewId', () => {
		const editor = createEditor();
		editor.composeIntent({
			layout: 'single',
			slots: [{ viewId: 'dashboard' }],
		});
		const header = parent.querySelector('.liquid-canvas-slot-header');
		assert.strictEqual(header?.textContent, 'dashboard');
	});

	test('slot with params renders JSON block', () => {
		const editor = createEditor();
		editor.composeIntent({
			layout: 'single',
			slots: [{ viewId: 'detail', params: { id: 42 } }],
		});
		const paramsBlock = parent.querySelector('.liquid-canvas-slot-params');
		assert.ok(paramsBlock, 'Expected params block');
		assert.ok(paramsBlock.textContent?.includes('"id": 42'));
	});

	test('unknown moleculeId renders fallback text', () => {
		const editor = createEditor();
		editor.composeIntent({
			layout: 'single',
			slots: [{ moleculeId: 'nonexistent-molecule' }],
		});
		const body = parent.querySelector('.liquid-canvas-slot-body');
		assert.ok(body?.textContent?.includes('Molecule: nonexistent-molecule'));
	});

	// ---- Molecule rendering (with mock file service) ----

	test('known molecule renders HTML from file service', async () => {
		const moleculeHtml = '<div class="test-molecule"><h2>Food Cost</h2><p>32%</p></div>';
		const moleculeUri = URI.parse('vscode-resource://ext/molecules/food-cost.html');
		const files = new Map([[moleculeUri.toString(), moleculeHtml]]);

		const molecules: ILiquidMolecule[] = [
			makeMolecule({
				id: 'foodCost',
				label: 'Food Cost',
				entryUri: moleculeUri,
				entity: 'dish',
				tags: ['cost'],
				extensionId: 'test',
			}),
		];
		registry.updateMolecules(molecules);

		const editor = createEditor(createMockFileService(files));
		editor.composeIntent({
			layout: 'single',
			slots: [{ moleculeId: 'foodCost', label: 'Food Cost' }],
		});

		// Molecule rendering is async (fileService.readFile). setTimeout(0) flushes
		// all pending microtasks deterministically (mock readFile resolves immediately).
		await new Promise(resolve => setTimeout(resolve, 0));

		const body = parent.querySelector('.liquid-canvas-slot-body');
		assert.ok(body, 'Expected slot body');
		const testMolecule = body.querySelector('.test-molecule');
		assert.ok(testMolecule, 'Expected molecule HTML to be injected into body');
		assert.ok(testMolecule.querySelector('h2')?.textContent?.includes('Food Cost'));
	});

	test('molecule file read error renders error message', async () => {
		const moleculeUri = URI.parse('vscode-resource://ext/molecules/missing.html');
		const molecules: ILiquidMolecule[] = [
			makeMolecule({
				id: 'missingMolecule',
				label: 'Missing',
				entryUri: moleculeUri,
				entity: 'dish',
				extensionId: 'test',
			}),
		];
		registry.updateMolecules(molecules);

		const editor = createEditor(createMockFileService(new Map()));
		editor.composeIntent({
			layout: 'single',
			slots: [{ moleculeId: 'missingMolecule' }],
		});

		await new Promise(resolve => setTimeout(resolve, 0));

		const body = parent.querySelector('.liquid-canvas-slot-body');
		assert.ok(body?.textContent?.includes('Molecule load error'));
	});

	// ---- Re-render on new intent ----

	test('composeIntent replaces previous content', () => {
		const editor = createEditor();
		editor.composeIntent({
			layout: 'single',
			slots: [{ viewId: 'first', label: 'First' }],
		});
		assert.strictEqual(parent.querySelectorAll('.liquid-canvas-slot').length, 1);
		assert.strictEqual(parent.querySelector('.liquid-canvas-slot-header')?.textContent, 'First');

		editor.composeIntent({
			layout: 'split-horizontal',
			slots: [
				{ viewId: 'a', label: 'Alpha' },
				{ viewId: 'b', label: 'Beta' },
			],
		});
		assert.strictEqual(parent.querySelectorAll('.liquid-canvas-slot').length, 2);
		const headers = parent.querySelectorAll('.liquid-canvas-slot-header');
		assert.strictEqual(headers[0].textContent, 'Alpha');
		assert.strictEqual(headers[1].textContent, 'Beta');
	});

	// ---- Title ----

	test('getTitle returns intent title or default', () => {
		const editor = createEditor();
		assert.strictEqual(editor.getTitle(), 'Phonon Canvas');

		editor.composeIntent({
			layout: 'single',
			slots: [{ viewId: 'dash' }],
			title: 'Dashboard Ristorante',
		});
		assert.strictEqual(editor.getTitle(), 'Dashboard Ristorante');
	});
});
