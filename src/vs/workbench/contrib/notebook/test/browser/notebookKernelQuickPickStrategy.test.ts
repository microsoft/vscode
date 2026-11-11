/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, QuickInputHideReason, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IExtensionManagementServerService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IActiveNotebookEditor } from '../../browser/notebookBrowser.js';
import { NotebookKernelService } from '../../browser/services/notebookKernelServiceImpl.js';
import { KernelPickerMRUStrategy } from '../../browser/viewParts/notebookKernelQuickPickStrategy.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { INotebookKernelSourceAction } from '../../common/notebookCommon.js';
import { INotebookKernelHistoryService } from '../../common/notebookKernelService.js';
import { INotebookService } from '../../common/notebookService.js';

class RecordingQuickPick<T extends IQuickPickItem> extends Disposable {
	private readonly hideEvent = this._register(new Emitter<IQuickInputHideEvent>());
	private readonly acceptEvent = this._register(new Emitter<IQuickPickDidAcceptEvent>());
	readonly onDidHide = this.hideEvent.event;
	readonly onDidAccept = this.acceptEvent.event;
	readonly onDidTriggerButton = Event.None;
	readonly onDidTriggerItemButton = Event.None;
	selectedItems: readonly T[] = [];
	busy = false;
	updates = 0;
	private visible = false;
	private _items: readonly QuickPickInput<T>[] = [];

	get items(): readonly QuickPickInput<T>[] { return this._items; }
	set items(items: readonly QuickPickInput<T>[]) {
		this.updates++;
		this._items = items;
	}

	show(): void { this.visible = true; }
	hide(): void {
		if (this.visible) {
			this.visible = false;
			this.hideEvent.fire({ reason: QuickInputHideReason.Gesture });
		}
	}

	acceptFirst(): void {
		this.selectedItems = this.items.filter((item): item is T => item.type !== 'separator').slice(0, 1);
		this.acceptEvent.fire({ inBackground: false });
	}
}

suite('Notebook kernel source picker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPicker() {
		const changes = store.add(new Emitter<void>());
		const requests: DeferredPromise<INotebookKernelSourceAction[]>[] = [];
		const requested = store.add(new Emitter<void>());
		const contextKeyService = upcastPartial<IContextKeyService>({});
		const kernelService = store.add(new NotebookKernelService(
			upcastPartial<INotebookService>({ onDidAddNotebookDocument: Event.None, onWillRemoveNotebookDocument: Event.None }),
			store.add(new TestStorageService()),
			upcastPartial<IMenuService>({ createMenu: () => upcastPartial<IMenu>({ onDidChange: Event.None, getActions: () => [], dispose: () => { } }) }),
			contextKeyService,
		));
		store.add(kernelService.registerKernelSourceActionProvider('test', {
			viewType: 'test',
			onDidChangeSourceActions: changes.event,
			provideKernelSourceActions: () => {
				const request = new DeferredPromise<INotebookKernelSourceAction[]>();
				requests.push(request);
				requested.fire();
				return request.p;
			},
		}));
		const picks: RecordingQuickPick<IQuickPickItem>[] = [];
		const quickInput = new class extends mock<IQuickInputService>() {
			override readonly backButton = { iconClass: 'test-back' };
			override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
			override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
			override createQuickPick<T extends IQuickPickItem>(): IQuickPick<T, { useSeparators: true }> | IQuickPick<T, { useSeparators: false }> {
				const pick = store.add(new RecordingQuickPick<T>());
				picks.push(pick);
				return upcastPartial<IQuickPick<T, { useSeparators: true }>>(pick);
			}
		};
		const executed: { id: string; args: unknown[] }[] = [];
		const strategy = new KernelPickerMRUStrategy(
			kernelService, upcastPartial<IProductService>({}), quickInput, upcastPartial<ILabelService>({}), new NullLogService(),
			upcastPartial<IExtensionsWorkbenchService>({}), upcastPartial<IExtensionService>({ extensions: [] }),
			upcastPartial<IExtensionManagementServerService>({}),
			upcastPartial<ICommandService>({ executeCommand: async <T>(id: string, ...args: unknown[]) => { executed.push({ id, args }); return 'selected-kernel' as T; } }),
			upcastPartial<INotebookKernelHistoryService>({ getKernels: () => ({ selected: undefined, all: [] }) }), upcastPartial<IOpenerService>({}),
		);
		const editor = upcastPartial<IActiveNotebookEditor>({
			textModel: upcastPartial<NotebookTextModel>({ uri: URI.parse('test:///notebook'), notebookType: 'test', viewType: 'test', metadata: {}, cells: [] }),
			scopedContextKeyService: contextKeyService,
		});
		const action: INotebookKernelSourceAction = { label: 'Current source', command: { title: 'Select', id: 'test.kernel', arguments: [{ label: 'current' }] } };
		const oldAction: INotebookKernelSourceAction = { label: 'Old source', command: 'test.oldKernel' };
		return {
			strategy, editor, picks, changes, executed, action, oldAction,
			async request(index: number) {
				while (requests.length <= index) {
					await Event.toPromise(requested.event);
				}
				return requests[index];
			},
			async complete(index: number, actions: INotebookKernelSourceAction[]) {
				await requests[index].complete(actions);
				await timeout(0);
			},
		};
	}

	for (const initialPending of [true, false]) {
		test(`keeps newer source actions when an older ${initialPending ? 'initial calculation' : 'refresh'} finishes last`, async () => {
			const fixture = createPicker();
			const result = fixture.strategy.showQuickPick(fixture.editor);
			await fixture.request(0);
			const pick = fixture.picks[1];
			try {
				let older = 0;
				if (!initialPending) {
					await fixture.complete(0, [fixture.action]);
					fixture.changes.fire();
					await fixture.request(1);
					older = 1;
				}
				fixture.changes.fire();
				await fixture.request(older + 1);
				await fixture.complete(older + 1, [fixture.action]);
				const items = pick.items;
				await fixture.complete(older, [fixture.oldAction]);
				assert.deepStrictEqual({ preserved: pick.items === items, labels: pick.items.map(item => item.label), busy: pick.busy }, {
					preserved: true, labels: [fixture.action.label], busy: false,
				});
				pick.acceptFirst();
				assert.deepStrictEqual({ selected: await result, executed: fixture.executed }, { selected: true, executed: [{ id: 'test.kernel', args: [{ label: 'current' }] }] });
			} finally {
				pick.hide();
				await result;
			}
		});
	}

	test('does not clear current actions or loading state when an obsolete refresh finishes before the latest', async () => {
		const fixture = createPicker();
		const result = fixture.strategy.showQuickPick(fixture.editor);
		await fixture.request(0);
		const pick = fixture.picks[1];
		try {
			await fixture.complete(0, [fixture.action]);
			const items = pick.items;
			fixture.changes.fire();
			await fixture.request(1);
			fixture.changes.fire();
			await fixture.request(2);
			await fixture.complete(1, [fixture.oldAction]);
			assert.deepStrictEqual({ preserved: pick.items === items, busy: pick.busy }, { preserved: true, busy: true });
			await fixture.complete(2, [fixture.action]);
			assert.deepStrictEqual({ labels: pick.items.map(item => item.label), busy: pick.busy }, { labels: [fixture.action.label], busy: false });
		} finally {
			pick.hide();
			await result;
		}
	});

	test('accepts a genuinely empty latest response without allowing an older response to replace it', async () => {
		const fixture = createPicker();
		const result = fixture.strategy.showQuickPick(fixture.editor);
		await fixture.request(0);
		const pick = fixture.picks[1];
		try {
			fixture.changes.fire();
			await fixture.request(1);
			await fixture.complete(1, []);
			const items = pick.items;
			await fixture.complete(0, [fixture.oldAction]);
			assert.deepStrictEqual({ preserved: pick.items === items, ids: pick.items.map(item => item.type === 'separator' ? undefined : item.id), busy: pick.busy }, {
				preserved: true, ids: ['install'], busy: false,
			});
		} finally {
			pick.hide();
			await result;
		}
	});

	test('ignores source calculations that complete after the picker closes', async () => {
		const fixture = createPicker();
		const result = fixture.strategy.showQuickPick(fixture.editor);
		await fixture.request(0);
		const pick = fixture.picks[1];
		pick.hide();
		await result;
		const updates = pick.updates;
		await fixture.complete(0, [fixture.action]);
		assert.strictEqual(pick.updates, updates);
	});
});
