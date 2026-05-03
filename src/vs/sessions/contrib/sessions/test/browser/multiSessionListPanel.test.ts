/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { MultiSessionListPanel } from '../../browser/multiSessionListPanel.js';
import { MultiSessionListRow, MultiSessionListRowStatus } from '../../common/multiSessionListModel.js';

function uri(id: string): URI {
	return URI.parse(`agent-session:/${id}`);
}

function row(overrides: Partial<MultiSessionListRow> & { id: string }): MultiSessionListRow {
	return {
		resource: uri(overrides.id),
		label: overrides.label ?? `session-${overrides.id}`,
		providerType: overrides.providerType ?? 'local',
		status: overrides.status ?? MultiSessionListRowStatus.InProgress,
		description: overrides.description,
		elapsedMs: overrides.elapsedMs ?? 12_000,
		depth: overrides.depth ?? 0,
		hasChildren: overrides.hasChildren ?? false,
		parentResource: overrides.parentResource,
	};
}

interface CallLog {
	opened: string[];
}

suite('MultiSessionListPanel', () => {

	const store = new DisposableStore();

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function makePanel(): { panel: MultiSessionListPanel; container: HTMLElement; log: CallLog } {
		const container = document.createElement('div');
		const log: CallLog = { opened: [] };

		const panel = store.add(new MultiSessionListPanel(container, {
			openSession: u => log.opened.push(u.toString()),
		}));

		return { panel, container, log };
	}

	function rowEls(container: HTMLElement): HTMLElement[] {
		return Array.from(container.querySelectorAll<HTMLElement>('.multi-session-panel-row'));
	}

	function rowFor(container: HTMLElement, id: string): HTMLElement {
		const r = container.querySelector<HTMLElement>(`[data-resource="${uri(id).toString()}"]`);
		assert.ok(r, `row for "${id}" should exist`);
		return r;
	}

	test('empty state renders when no rows are set', () => {
		const { container } = makePanel();
		const empty = container.querySelector<HTMLElement>('.multi-session-panel-empty');
		assert.ok(empty);
		assert.strictEqual(empty.classList.contains('hidden'), false);
	});

	test('setRows renders one element per row in the order given and hides empty state', () => {
		const { panel, container } = makePanel();
		panel.setRows([
			row({ id: 'orchestrator', depth: 0 }),
			row({ id: 'tester', depth: 1, parentResource: uri('orchestrator') }),
		]);

		assert.deepStrictEqual({
			rowResources: rowEls(container).map(el => el.getAttribute('data-resource')),
			emptyHidden: container.querySelector('.multi-session-panel-empty')?.classList.contains('hidden'),
		}, {
			rowResources: [uri('orchestrator').toString(), uri('tester').toString()],
			emptyHidden: true,
		});
	});

	test('row depth drives the --multi-session-depth CSS variable', () => {
		const { panel, container } = makePanel();
		panel.setRows([
			row({ id: 'a', depth: 0 }),
			row({ id: 'b', depth: 2 }),
		]);

		assert.deepStrictEqual({
			a: rowFor(container, 'a').style.getPropertyValue('--multi-session-depth'),
			b: rowFor(container, 'b').style.getPropertyValue('--multi-session-depth'),
		}, {
			a: '0',
			b: '2',
		});
	});

	test('row reflects label, provider, description, elapsed, status', () => {
		const { panel, container } = makePanel();
		panel.setRows([
			row({
				id: 'a',
				label: 'Plan refactor',
				providerType: 'cloud',
				description: 'Drafting plan...',
				elapsedMs: 65_000,
				status: MultiSessionListRowStatus.NeedsInput,
			}),
		]);

		const r = rowFor(container, 'a');
		assert.deepStrictEqual({
			label: r.querySelector<HTMLElement>('.multi-session-panel-row-label')?.textContent,
			provider: r.querySelector<HTMLElement>('.multi-session-panel-row-provider')?.textContent,
			description: r.querySelector<HTMLElement>('.multi-session-panel-row-description')?.textContent,
			descriptionHidden: r.querySelector<HTMLElement>('.multi-session-panel-row-description')?.classList.contains('hidden'),
			elapsed: r.querySelector<HTMLElement>('.multi-session-panel-row-elapsed')?.textContent,
			statusClass: [...r.classList].find(c => c.startsWith('status-')),
		}, {
			label: 'Plan refactor',
			provider: 'cloud',
			description: 'Drafting plan...',
			descriptionHidden: false,
			elapsed: '1m',
			statusClass: 'status-needs-input',
		});
	});

	test('description element is hidden when description is undefined', () => {
		const { panel, container } = makePanel();
		panel.setRows([row({ id: 'a' })]);

		const desc = rowFor(container, 'a').querySelector<HTMLElement>('.multi-session-panel-row-description');
		assert.strictEqual(desc?.classList.contains('hidden'), true);
		assert.strictEqual(desc?.textContent, '');
	});

	test('clicking a row invokes openSession with the right URI', () => {
		const { panel, container, log } = makePanel();
		panel.setRows([row({ id: 'a' })]);

		rowFor(container, 'a').click();

		assert.deepStrictEqual(log.opened, [uri('a').toString()]);
	});

	test('Enter and Space keys also fire openSession', () => {
		const { panel, container, log } = makePanel();
		panel.setRows([row({ id: 'a' })]);

		const r = rowFor(container, 'a');
		r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		r.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

		assert.deepStrictEqual(log.opened, [uri('a').toString(), uri('a').toString()]);
	});

	test('setRows updates an existing row in place rather than re-creating it', () => {
		const { panel, container } = makePanel();
		panel.setRows([row({ id: 'a', label: 'first', elapsedMs: 1_000 })]);
		const before = rowFor(container, 'a');
		panel.setRows([row({ id: 'a', label: 'updated', elapsedMs: 90_000 })]);
		const after = rowFor(container, 'a');

		assert.deepStrictEqual({
			sameElement: before === after,
			label: after.querySelector<HTMLElement>('.multi-session-panel-row-label')?.textContent,
			elapsed: after.querySelector<HTMLElement>('.multi-session-panel-row-elapsed')?.textContent,
		}, {
			sameElement: true,
			label: 'updated',
			elapsed: '1m',
		});
	});

	test('setRows removes rows whose resource is no longer present', () => {
		const { panel, container } = makePanel();
		panel.setRows([row({ id: 'a' }), row({ id: 'b' })]);
		panel.setRows([row({ id: 'a' })]);

		assert.deepStrictEqual({
			a: !!container.querySelector(`[data-resource="${uri('a').toString()}"]`),
			b: !!container.querySelector(`[data-resource="${uri('b').toString()}"]`),
		}, {
			a: true,
			b: false,
		});
	});

	test('setActiveResource toggles the active class on the matching row only', () => {
		const { panel, container } = makePanel();
		panel.setRows([row({ id: 'a' }), row({ id: 'b' })]);

		panel.setActiveResource(uri('b'));

		assert.deepStrictEqual({
			aActive: rowFor(container, 'a').classList.contains('active'),
			bActive: rowFor(container, 'b').classList.contains('active'),
		}, {
			aActive: false,
			bActive: true,
		});

		panel.setActiveResource(undefined);
		assert.strictEqual(rowFor(container, 'b').classList.contains('active'), false);
	});

	test('onDidSelectSession event mirrors openSession handler invocations', () => {
		const { panel, container } = makePanel();
		const events: string[] = [];
		store.add(panel.onDidSelectSession(u => events.push(u.toString())));

		panel.setRows([row({ id: 'a' })]);
		rowFor(container, 'a').click();

		assert.deepStrictEqual(events, [uri('a').toString()]);
	});
});
