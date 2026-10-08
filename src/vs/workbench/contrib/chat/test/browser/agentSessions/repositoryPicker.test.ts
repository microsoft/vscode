/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import Severity from '../../../../../../base/common/severity.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { RepositoryPicker } from '../../../browser/agentSessions/repositoryPicker.js';

class TestQuickPick extends mock<IQuickPick<IQuickPickItem>>() {
	private readonly store = new DisposableStore();
	private readonly hideEmitter = this.store.add(new Emitter<IQuickInputHideEvent>());
	private readonly valueEmitter = this.store.add(new Emitter<string>());
	private readonly acceptEmitter = this.store.add(new Emitter<IQuickPickDidAcceptEvent>());

	override readonly onDidHide = this.hideEmitter.event;
	override readonly onDidChangeValue = this.valueEmitter.event;
	override readonly onDidAccept = this.acceptEmitter.event;
	override items: readonly IQuickPickItem[] = [];
	override selectedItems: readonly IQuickPickItem[] = [];
	override value = '';
	override busy = false;
	override matchOnLabel = true;
	override title: string | undefined;
	override prompt: string | undefined;
	shown = false;
	disposed = false;

	override show(): void {
		this.shown = true;
	}

	override hide(): void {
		if (this.shown) {
			this.shown = false;
			this.hideEmitter.fire({ reason: QuickInputHideReason.Other });
		}
	}

	changeValue(value: string): void {
		this.value = value;
		this.valueEmitter.fire(value);
	}

	acceptItem(index = 0): void {
		const item = this.items[index];
		assert.ok(item);
		this.selectedItems = [item];
		this.accept();
	}

	override accept(inBackground = false): void {
		this.acceptEmitter.fire({ inBackground });
	}

	override dispose(): void {
		this.hide();
		this.disposed = true;
		this.store.dispose();
	}
}

suite('RepositoryPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		clock = sinon.useFakeTimers();
	});

	teardown(() => sinon.restore());

	function createPicker() {
		const quickPicks: TestQuickPick[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IQuickInputService, {}, 'createQuickPick', () => {
			const quickPick = new TestQuickPick();
			quickPicks.push(quickPick);
			return quickPick;
		});
		const picker = store.add(instantiationService.createInstance(RepositoryPicker));
		return { picker, quickPicks };
	}

	test('preserves the original plain, alphabetically sorted repository picker', async () => {
		const { picker, quickPicks } = createPicker();
		const queries: string[] = [];
		const result = picker.pickRepository(async query => {
			queries.push(query);
			return ['microsoft/vscode-docs', 'microsoft/vscode'];
		});
		await clock.tickAsync(0);
		const quickPick = quickPicks[0];
		const presentation = {
			title: quickPick.title,
			prompt: quickPick.prompt,
			placeholder: quickPick.placeholder,
			ariaLabel: quickPick.ariaLabel,
			items: quickPick.items,
		};
		quickPick.acceptItem();

		assert.deepStrictEqual({
			presentation,
			queries,
			selection: await result,
			disposed: quickPick.disposed,
		}, {
			presentation: {
				title: undefined,
				prompt: undefined,
				placeholder: 'Search for a repository...',
				ariaLabel: 'Search for a repository...',
				items: [
					{ label: 'microsoft/vscode', repository: 'microsoft/vscode' },
					{ label: 'microsoft/vscode-docs', repository: 'microsoft/vscode-docs' },
				],
			},
			queries: [''],
			selection: { repository: 'microsoft/vscode' },
			disposed: true,
		});
	});

	for (const allowRepositoryUrl of [false, true]) {
		test(`preserves the existing opt-in clone URL item (allowed: ${allowRepositoryUrl})`, async () => {
			const { picker, quickPicks } = createPicker();
			const result = picker.pickRepository(async () => ['microsoft/vscode'], { allowRepositoryUrl });
			await clock.tickAsync(0);
			const quickPick = quickPicks[0];
			quickPick.changeValue('https://gitlab.com/example/project.git');
			await clock.tickAsync(300);
			const items = quickPick.items;
			if (allowRepositoryUrl) {
				quickPick.acceptItem();
			} else {
				quickPick.hide();
			}

			assert.deepStrictEqual({
				placeholder: quickPick.placeholder,
				items,
				selection: await result,
			}, {
				placeholder: allowRepositoryUrl ? 'Search for a repository or paste a repository URL...' : 'Search for a repository...',
				items: [
					...(allowRepositoryUrl ? [{ label: 'Clone from URL', description: 'https://gitlab.com/example/project.git', cloneUrl: 'https://gitlab.com/example/project.git' }] : []),
					{ label: 'microsoft/vscode', repository: 'microsoft/vscode' },
				],
				selection: allowRepositoryUrl ? { cloneUrl: 'https://gitlab.com/example/project.git' } : undefined,
			});
		});
	}

	test('preserves supported Git clone URL formats', async () => {
		const selections = [];
		for (const url of ['HTTPS://GITHUB.COM/microsoft/vscode.git', 'ssh://git@gitlab.com/example/project.git', 'git://github.com/microsoft/vscode.git', 'git@gitlab.com:example/project.git']) {
			const { picker, quickPicks } = createPicker();
			const result = picker.pickRepository(async () => [], { allowRepositoryUrl: true });
			await clock.tickAsync(0);
			quickPicks[0].changeValue(url);
			await clock.tickAsync(300);
			quickPicks[0].acceptItem();
			selections.push(await result);
		}

		assert.deepStrictEqual(selections, [
			{ cloneUrl: 'HTTPS://GITHUB.COM/microsoft/vscode.git' },
			{ cloneUrl: 'ssh://git@gitlab.com/example/project.git' },
			{ cloneUrl: 'git://github.com/microsoft/vscode.git' },
			{ cloneUrl: 'git@gitlab.com:example/project.git' },
		]);
	});

	test('debounces searches and replaces the repository list', async () => {
		const { picker, quickPicks } = createPicker();
		const queries: string[] = [];
		const result = picker.pickRepository(async query => {
			queries.push(query);
			return [query ? 'microsoft/vscode' : 'microsoft/typescript'];
		});
		await clock.tickAsync(0);
		const quickPick = quickPicks[0];
		quickPick.changeValue('vs');
		await clock.tickAsync(150);
		quickPick.changeValue('vscode');
		await clock.tickAsync(299);
		const beforeSearch = [...queries];
		await clock.tickAsync(1);
		quickPick.acceptItem();

		assert.deepStrictEqual({ beforeSearch, queries, selection: await result }, {
			beforeSearch: [''],
			queries: ['', 'vscode'],
			selection: { repository: 'microsoft/vscode' },
		});
	});

	test('ignores stale results and selections after the search changes', async () => {
		const { picker, quickPicks } = createPicker();
		const pending = new DeferredPromise<readonly string[]>();
		const result = picker.pickRepository(async query => query === 'old' ? pending.p : [`owner/${query || 'initial'}`]);
		await clock.tickAsync(0);
		const quickPick = quickPicks[0];
		const initialItem = quickPick.items[0];
		quickPick.changeValue('old');
		await clock.tickAsync(300);
		quickPick.changeValue('new');
		quickPick.selectedItems = [initialItem];
		quickPick.accept();
		await clock.tickAsync(300);
		await pending.complete(['owner/old']);
		await clock.tickAsync(0);
		const items = quickPick.items;
		quickPick.acceptItem();

		assert.deepStrictEqual({ items, selection: await result }, {
			items: [{ label: 'owner/new', repository: 'owner/new' }],
			selection: { repository: 'owner/new' },
		});
	});

	test('Escape can cancel while the initial repositories are still loading', async () => {
		const { picker, quickPicks } = createPicker();
		const pending = new DeferredPromise<readonly string[]>();
		const tokens: CancellationToken[] = [];
		const result = picker.pickRepository((_query, token) => {
			tokens.push(token);
			return pending.p;
		});
		quickPicks[0].hide();
		const selection = await result;
		await pending.complete(['owner/late']);
		await clock.tickAsync(0);

		assert.deepStrictEqual({
			selection,
			cancelled: tokens.map(token => token.isCancellationRequested),
			disposed: quickPicks[0].disposed,
			items: quickPicks[0].items,
		}, {
			selection: undefined,
			cancelled: [true],
			disposed: true,
			items: [],
		});
	});

	test('external cancellation closes the picker and cancels its request', async () => {
		const { picker, quickPicks } = createPicker();
		const source = store.add(new CancellationTokenSource());
		const pending = new DeferredPromise<readonly string[]>();
		const result = picker.pickRepository(() => pending.p, undefined, source.token);
		source.cancel();

		assert.deepStrictEqual({ selection: await result, disposed: quickPicks[0].disposed }, {
			selection: undefined,
			disposed: true,
		});
	});

	test('disposal cancels a scheduled search', async () => {
		const { picker, quickPicks } = createPicker();
		const queries: string[] = [];
		const result = picker.pickRepository(async query => {
			queries.push(query);
			return [];
		});
		await clock.tickAsync(0);
		quickPicks[0].changeValue('vscode');
		picker.dispose();
		await clock.tickAsync(300);

		assert.deepStrictEqual({ queries, selection: await result, disposed: quickPicks[0].disposed }, {
			queries: [''],
			selection: undefined,
			disposed: true,
		});
	});

	test('a second invocation disposes the previous picker', async () => {
		const { picker, quickPicks } = createPicker();
		const first = picker.pickRepository(async () => ['owner/first']);
		await clock.tickAsync(0);
		const second = picker.pickRepository(async () => ['owner/second']);
		await clock.tickAsync(0);
		quickPicks[1].acceptItem();

		assert.deepStrictEqual({
			selections: [await first, await second],
			disposed: quickPicks.map(pick => pick.disposed),
		}, {
			selections: [undefined, { repository: 'owner/second' }],
			disposed: [true, true],
		});
	});

	test('surfaces search errors and clears them when the user searches again', async () => {
		const { picker, quickPicks } = createPicker();
		const result = picker.pickRepository(async query => {
			if (!query) {
				throw new Error('Search failed');
			}
			return ['owner/recovered'];
		});
		await clock.tickAsync(0);
		const quickPick = quickPicks[0];
		const failure = { message: quickPick.validationMessage, severity: quickPick.severity, busy: quickPick.busy };
		quickPick.changeValue('recovered');
		await clock.tickAsync(300);
		quickPick.acceptItem();

		assert.deepStrictEqual({
			failure,
			message: quickPick.validationMessage,
			selection: await result,
		}, {
			failure: { message: 'Could not load repositories. Check your GitHub sign-in and connection, then try searching again.', severity: Severity.Error, busy: false },
			message: undefined,
			selection: { repository: 'owner/recovered' },
		});
	});
});
