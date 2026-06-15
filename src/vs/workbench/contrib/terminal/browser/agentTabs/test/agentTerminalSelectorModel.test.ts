/*---------------------------------------------------------------------------------------------
 *  Copyright (c) stokd. Thin-patch fork — agent-aware terminal selector (AX-TERMINAL-AGENT-TABS).
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// DOM-free unit test for the model's merge/de-dupe/sectioning logic. Imports use
// the VS Code `.js` extension convention (so the file compiles with the rest of
// `src/` under gulp); run it against the compiled output:
//   node --test out/vs/workbench/contrib/terminal/browser/agentTabs/test/agentTerminalSelectorModel.test.js
// The unit under test (mergeSelectorRows) is the pure core of
// AgentTerminalSelectorModel; the stateful model is a thin event-fan-in over it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSelectorRows } from '../agentTerminalSelectorRows.js';
import type { SelectorRow, IAgentEntry, ISelectorInstanceRef } from '../agentTerminalSelectorRows.js';

interface FakeInstance extends ISelectorInstanceRef {
	readonly instanceId: number;
	readonly title: string;
}

const term = (id: number, title = `term-${id}`): FakeInstance => ({ instanceId: id, title });
const agent = (id: number, title = `agent-${id}`): IAgentEntry<FakeInstance> => ({
	instance: { instanceId: id, title },
	meta: { sessionTitle: title, runState: 'idle', pendingApprovals: 0, isBackground: false },
});

const headers = (rows: SelectorRow<FakeInstance>[]) =>
	rows.filter(r => r.kind === 'group-header') as Extract<SelectorRow<FakeInstance>, { kind: 'group-header' }>[];

test('merges terminals and agents into two ordered, counted sections', () => {
	const rows = mergeSelectorRows<FakeInstance>({ terminals: [term(1), term(2)], agents: [agent(10)] });
	const h = headers(rows);
	assert.deepEqual(h.map(x => x.section), ['Terminals', 'Agents'], 'Terminals section comes before Agents');
	assert.equal(h[0].count, 2);
	assert.equal(h[1].count, 1);
	assert.equal(rows.filter(r => r.kind === 'terminal').length, 2);
	assert.equal(rows.filter(r => r.kind === 'agent').length, 1);
	// Total = 2 headers + 2 terminals + 1 agent.
	assert.equal(rows.length, 5);
});

test('de-duplicates an instance that is both a terminal and an agent (agent wins)', () => {
	// Instance 5 appears in both lists; it must render once, in the Agents section.
	const rows = mergeSelectorRows<FakeInstance>({ terminals: [term(5), term(6)], agents: [agent(5)] });
	const ids = rows.filter(r => r.kind !== 'group-header').map(r => (r as any).instance.instanceId);
	assert.deepEqual([...ids].sort((a, b) => a - b), [5, 6]);
	const h = headers(rows);
	assert.equal(h.find(x => x.section === 'Terminals')!.count, 1, 'only term 6 is a human terminal');
	assert.equal(h.find(x => x.section === 'Agents')!.count, 1, 'term 5 is counted as an agent');
	const five = rows.find(r => r.kind !== 'group-header' && (r as any).instance.instanceId === 5)!;
	assert.equal(five.kind, 'agent');
});

test('de-duplicates repeated ids within a single list', () => {
	const rows = mergeSelectorRows<FakeInstance>({ terminals: [term(1), term(1), term(2)], agents: [] });
	assert.equal(headers(rows).find(x => x.section === 'Terminals')!.count, 2);
	assert.equal(rows.filter(r => r.kind === 'terminal').length, 2);
});

test('a collapsed section keeps its header (with full count) but omits its rows', () => {
	const rows = mergeSelectorRows<FakeInstance>({
		terminals: [term(1), term(2)],
		agents: [agent(10)],
		collapsed: { terminals: true },
	});
	const termHeader = headers(rows).find(x => x.section === 'Terminals')!;
	assert.equal(termHeader.collapsed, true);
	assert.equal(termHeader.count, 2, 'count reflects all terminals even when collapsed');
	assert.equal(rows.filter(r => r.kind === 'terminal').length, 0, 'collapsed terminals are hidden');
	assert.equal(rows.filter(r => r.kind === 'agent').length, 1, 'other sections unaffected');
});

test('empty input produces no rows (no empty section headers)', () => {
	assert.deepEqual(mergeSelectorRows<FakeInstance>({ terminals: [], agents: [] }), []);
});

test('a section with only agents renders no Terminals header', () => {
	const rows = mergeSelectorRows<FakeInstance>({ terminals: [], agents: [agent(10), agent(11)] });
	assert.deepEqual(headers(rows).map(x => x.section), ['Agents']);
	assert.equal(headers(rows)[0].count, 2);
});
