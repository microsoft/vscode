/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import Severity from '../../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getSingleTabLabel, getSingleTabTitle } from '../../browser/terminalView.js';
import { ITerminalStatus } from '../../common/terminal.js';
import { ITerminalInstance } from '../../browser/terminal.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import type { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';

function createInstance(opts: { title?: string; description?: string; icon?: ThemeIcon; primaryStatus?: ITerminalStatus }): ITerminalInstance {
	return {
		title: opts.title,
		description: opts.description,
		icon: opts.icon,
		statusList: { primary: opts.primaryStatus },
	} as unknown as ITerminalInstance;
}

suite('Workbench - TerminalView single tab', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let accessor: ServicesAccessor;

	setup(() => {
		accessor = workbenchInstantiationService(undefined, store);
	});

	test('getSingleTabTitle returns empty for undefined instance', () => {
		strictEqual(getSingleTabTitle(undefined, '—'), '');
	});

	test('getSingleTabTitle returns title when no description', () => {
		const instance = createInstance({ title: 'zsh' });
		strictEqual(getSingleTabTitle(instance, '—'), 'zsh');
	});

	test('getSingleTabTitle joins title, separator and description', () => {
		const instance = createInstance({ title: 'node', description: '/home/cham/project' });
		strictEqual(getSingleTabTitle(instance, '—'), 'node — /home/cham/project');
	});

	test('getSingleTabLabel returns no nodes when title is missing', () => {
		deepStrictEqual(getSingleTabLabel(accessor, undefined, '—'), []);
		deepStrictEqual(getSingleTabLabel(accessor, createInstance({ title: '' }), '—'), []);
	});

	test('getSingleTabLabel wraps title in a single-terminal-tab-label span', () => {
		const instance = createInstance({ title: 'zsh' });
		const nodes = getSingleTabLabel(accessor, instance, '—');
		strictEqual(nodes.length, 2);
		strictEqual((nodes[0] as HTMLElement).tagName, 'SPAN');
		strictEqual((nodes[0] as HTMLElement).classList.contains('codicon'), true);
		const label = nodes[1] as HTMLElement;
		strictEqual(label.tagName, 'SPAN');
		strictEqual(label.classList.contains('single-terminal-tab-label'), true);
		strictEqual(label.textContent, 'zsh');
	});

	test('getSingleTabLabel renders the long title inside the label span', () => {
		const long = 'A very long terminal title that should definitely truncate with ellipsis';
		const instance = createInstance({ title: long });
		const nodes = getSingleTabLabel(accessor, instance, '—');
		const label = nodes[1] as HTMLElement;
		strictEqual(label.textContent, long);
	});

	test('getSingleTabLabel appends a status icon when the instance has a primary status', () => {
		const instance = createInstance({
			title: 'zsh',
			primaryStatus: { id: 'disconnected', severity: Severity.Error, icon: Codicon.debugDisconnect },
		});
		const nodes = getSingleTabLabel(accessor, instance, '—');
		strictEqual(nodes.length, 3);
		strictEqual((nodes[2] as HTMLElement).classList.contains('codicon'), true);
	});

	test('getSingleTabLabel uses the explicit icon when provided', () => {
		const instance = createInstance({ title: 'zsh', icon: Codicon.terminal });
		const nodes = getSingleTabLabel(accessor, instance, '—', Codicon.zap);
		const icon = nodes[0] as HTMLElement;
		strictEqual(icon.classList.contains('codicon-zap'), true);
	});
});
