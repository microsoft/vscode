/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { renderSCMHistoryItemIdentifier } from '../../browser/scmHistoryItemIdentifier.js';
import { renderSCMHistoryItemGraph, toISCMHistoryItemViewModelArray } from '../../browser/scmHistory.js';
import { ISCMHistoryItem } from '../../common/history.js';

suite('SCM history item identifier', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const item: ISCMHistoryItem = {
		id: 'commit', parentIds: ['parent'], subject: 'Subject', message: 'Message',
		identifier: [
			{ text: 'uoz', color: { id: 'terminal.ansiMagenta' } },
			{ text: 'xntwl', color: { id: 'descriptionForeground' } },
			{ text: ' ' },
			{ text: '6c99', color: { id: 'terminal.ansiBlue' } },
			{ text: 'aaa1', color: { id: 'descriptionForeground' } }
		]
	};

	test('does not create an element without both provider and user opt-in', () => {
		assert.deepStrictEqual([
			renderSCMHistoryItemIdentifier(item, false),
			renderSCMHistoryItemIdentifier({ ...item, identifier: undefined }, true),
			renderSCMHistoryItemIdentifier({ ...item, identifier: [] }, true),
			renderSCMHistoryItemIdentifier({ ...item, identifier: [{ text: '' }] }, true)
		], [undefined, undefined, undefined, undefined]);
	});

	test('preserves both identifiers and provider-selected color boundaries', () => {
		const element = renderSCMHistoryItemIdentifier(item, true)!;
		assert.deepStrictEqual({
			text: element.textContent,
			parts: Array.from(element.children, child => ({ text: child.textContent, color: (child as HTMLElement).style.color }))
		}, {
			text: 'uozxntwl 6c99aaa1',
			parts: [
				{ text: 'uoz', color: 'var(--vscode-terminal-ansiMagenta, inherit)' },
				{ text: 'xntwl', color: 'var(--vscode-descriptionForeground, inherit)' },
				{ text: ' ', color: '' },
				{ text: '6c99', color: 'var(--vscode-terminal-ansiBlue, inherit)' },
				{ text: 'aaa1', color: 'var(--vscode-descriptionForeground, inherit)' }
			]
		});
	});

	test('renders numeric revisions and untrusted text literally', () => {
		const element = renderSCMHistoryItemIdentifier({ ...item, identifier: [{ text: '42 <img src=x> $(git-commit)' }] }, true)!;
		assert.deepStrictEqual([element.textContent, element.querySelectorAll('img, .codicon').length], ['42 <img src=x> $(git-commit)', 0]);
	});

	test('does not change graph geometry or snapshot identity', () => {
		const plain = { ...item, identifier: undefined };
		const richModel = toISCMHistoryItemViewModelArray([item])[0];
		const plainModel = toISCMHistoryItemViewModelArray([plain])[0];
		assert.deepStrictEqual({
			id: richModel.historyItem.id,
			parents: richModel.historyItem.parentIds,
			graph: renderSCMHistoryItemGraph(richModel).outerHTML
		}, {
			id: plainModel.historyItem.id,
			parents: plainModel.historyItem.parentIds,
			graph: renderSCMHistoryItemGraph(plainModel).outerHTML
		});
	});
});
