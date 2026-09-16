/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { AnythingQuickAccessProviderRunOptions, IQuickAccessController, IQuickAccessOptions } from '../../../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickItem, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { AttachContextAction } from '../../../browser/actions/chatContextActions.js';
import { ChatAttachmentModel } from '../../../browser/attachments/chatAttachmentModel.js';
import { ChatContextPick, ChatContextPickService, IChatContextPickService, IChatContextValueItem } from '../../../browser/attachments/chatContextPickService.js';
import { IChatWidget, IChatWidgetService, IQuickChatService } from '../../../browser/chat.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';

class ContextActionQuickInput extends mock<IQuickInputService>() {
	readonly shown = new DeferredPromise<void>();
	rootOptions: IQuickAccessOptions | undefined;
	rootShows = 0;
	disposedPickers = 0;
	select: (label: string) => void = () => { throw new Error('No picker'); };
	acceptSelection: () => void = () => { throw new Error('No picker'); };
	hidePicker: () => void = () => { throw new Error('No picker'); };

	override readonly quickAccess = upcastPartial<IQuickAccessController>({
		show: (_value, options) => {
			this.rootShows++;
			this.rootOptions = options;
		},
	});

	constructor(private readonly store: Pick<DisposableStore, 'add'>) {
		super();
	}

	override createQuickPick<T extends IQuickPickItem>(): IQuickPick<T, { useSeparators: boolean }> {
		const didHide = this.store.add(new Emitter<IQuickInputHideEvent>());
		const didAccept = this.store.add(new Emitter<{ inBackground: boolean }>());
		const didChangeValue = this.store.add(new Emitter<string>());
		let hidden = false;
		const hide = () => {
			if (!hidden) {
				hidden = true;
				didHide.fire({ reason: QuickInputHideReason.Gesture });
			}
		};
		const picker = upcastPartial<IQuickPick<T, { useSeparators: boolean }>>({
			value: '', items: [], selectedItems: [],
			onDidHide: didHide.event,
			onDidAccept: didAccept.event,
			onDidChangeValue: didChangeValue.event,
			show: () => { this.shown.complete(); },
			hide,
			dispose: () => { this.disposedPickers++; hide(); },
		});
		this.select = label => { picker.selectedItems = picker.items.filter(item => item.label === label); };
		this.acceptSelection = () => didAccept.fire({ inBackground: false });
		this.hidePicker = hide;
		return picker;
	}
}

suite('AttachContextAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create() {
		const instantiation = store.add(new TestInstantiationService());
		const quickInput = new ContextActionQuickInput(store);
		const contextPicks: IChatContextPickService = new ChatContextPickService();
		const attached: IChatRequestVariableEntry[] = [];
		let focusedAttachments = 0;
		let lastFocusedWidget: IChatWidget | undefined = upcastPartial<IChatWidget>({
			attachmentModel: upcastPartial<ChatAttachmentModel>({ addContext: () => focusedAttachments++ }),
		});
		const widget = upcastPartial<IChatWidget>({
			attachmentModel: upcastPartial<ChatAttachmentModel>({ addContext: (...entries: IChatRequestVariableEntry[]) => attached.push(...entries) }),
		});
		instantiation.set(IChatWidgetService, upcastPartial<IChatWidgetService>({
			get lastFocusedWidget() { return lastFocusedWidget; },
		}));
		instantiation.set(IContextKeyService, new MockContextKeyService());
		instantiation.set(IKeybindingService, new MockKeybindingService());
		instantiation.set(IChatContextPickService, contextPicks);
		instantiation.set(IQuickInputService, quickInput);
		instantiation.set(IQuickChatService, upcastPartial<IQuickChatService>({}));
		instantiation.set(ICommandService, upcastPartial<ICommandService>({}));
		const action = new AttachContextAction();
		return {
			instantiation, quickInput, contextPicks, widget, attached, action,
			get lastFocusedWidget() { return lastFocusedWidget; },
			get focusedAttachments() { return focusedAttachments; },
			clearLastFocusedWidget: () => { lastFocusedWidget = undefined; },
		};
	}

	function valueItem(overrides: Partial<IChatContextValueItem> = {}): IChatContextValueItem {
		return {
			type: 'valuePick',
			commandId: 'test.context',
			label: 'Context',
			icon: Codicon.issues,
			asAttachment: async () => ({ kind: 'generic', id: 'selected', name: 'Selected', value: 'selected' }),
			...overrides,
		};
	}

	test('keeps the existing no-widget behavior without opening Chat', async () => {
		const test = create();
		test.clearLastFocusedWidget();
		await test.action.run(test.instantiation);
		assert.deepStrictEqual({ rootShows: test.quickInput.rootShows, attached: test.attached.length }, { rootShows: 0, attached: 0 });
	});

	test('keeps the default picker and last-focused fallback, including placeholder and enabled filtering', async () => {
		const test = create();
		let boundWidget: IChatWidget | undefined;
		store.add(test.contextPicks.registerChatContextItem(valueItem({ isEnabled: widget => { boundWidget = widget; return true; } })));
		store.add(test.contextPicks.registerChatContextItem(valueItem({ label: 'Disabled', isEnabled: () => false })));
		await test.action.run(test.instantiation, { placeholder: 'Existing placeholder' });
		const options = test.quickInput.rootOptions?.providerOptions as AnythingQuickAccessProviderRunOptions;
		assert.deepStrictEqual({
			rootShows: test.quickInput.rootShows,
			placeholder: test.quickInput.rootOptions?.placeholder,
			labels: options.additionPicks?.map(item => item.label),
			boundToFocused: boundWidget === test.lastFocusedWidget,
		}, { rootShows: 1, placeholder: 'Existing placeholder', labels: ['Context'], boundToFocused: true });
	});

	test('keeps explicit-widget binding for existing callers of the full Add Context picker', async () => {
		const test = create();
		let boundWidget: IChatWidget | undefined;
		store.add(test.contextPicks.registerChatContextItem(valueItem({ isEnabled: widget => { boundWidget = widget; return true; } })));
		await test.action.run(test.instantiation, { widget: test.widget });
		assert.deepStrictEqual({ boundToExplicit: boundWidget === test.widget, rootShows: test.quickInput.rootShows }, { boundToExplicit: true, rootShows: 1 });
	});

	test('deep-opens only the identified registered item on the explicit widget', async () => {
		const test = create();
		let boundWidget: IChatWidget | undefined;
		store.add(test.contextPicks.registerChatContextItem(valueItem({
			asAttachment: async widget => {
				boundWidget = widget;
				return { kind: 'generic', id: 'selected', name: 'Selected', value: 'selected' };
			},
		})));
		store.add(test.contextPicks.registerChatContextItem(valueItem({
			commandId: 'unrelated', label: 'Context',
			isEnabled: () => { throw new Error('An unrelated picker must not be consulted'); },
		})));
		await test.action.run(test.instantiation, { widget: test.widget, contextItemCommandId: 'test.context' });
		assert.deepStrictEqual({
			exactWidget: boundWidget === test.widget,
			attached: test.attached.map(entry => entry.id),
			focusedAttachments: test.focusedAttachments,
			rootShows: test.quickInput.rootShows,
		}, { exactWidget: true, attached: ['selected'], focusedAttachments: 0, rootShows: 0 });
	});

	test('reports a missing or disabled selected picker without broadening to the full picker', async () => {
		const test = create();
		store.add(test.contextPicks.registerChatContextItem(valueItem({ isEnabled: () => false })));
		await assert.rejects(test.action.run(test.instantiation, { widget: test.widget, contextItemCommandId: 'test.context' }), /attachment picker is not available/);
		await assert.rejects(test.action.run(test.instantiation, { widget: test.widget, contextItemCommandId: 'missing' }), /attachment picker is not available/);
		assert.deepStrictEqual({ rootShows: test.quickInput.rootShows, attached: test.attached.length }, { rootShows: 0, attached: 0 });
	});

	test('does not attach a late value after cancellation', async () => {
		const test = create();
		const cancellation = store.add(new CancellationTokenSource());
		const reached = new DeferredPromise<void>();
		const pending = new DeferredPromise<IChatRequestVariableEntry | undefined>();
		store.add(test.contextPicks.registerChatContextItem(valueItem({ asAttachment: () => { reached.complete(); return pending.p; } })));
		const running = test.action.run(test.instantiation, { widget: test.widget, contextItemCommandId: 'test.context', token: cancellation.token });
		await reached.p;
		cancellation.cancel();
		await running;
		pending.complete({ kind: 'generic', id: 'late', name: 'Late', value: 'late' });
		await pending.p;
		assert.deepStrictEqual({ attached: test.attached.length, focusedAttachments: test.focusedAttachments }, { attached: 0, focusedAttachments: 0 });
	});

	test('opens a registered sub-picker with its exact widget and adds only the user selection', async () => {
		const test = create();
		let boundWidget: IChatWidget | undefined;
		let disposed = 0;
		store.add(test.contextPicks.registerChatContextItem({
			type: 'pickerPick', commandId: 'test.picker', label: 'Picker', icon: Codicon.issues,
			asPicker: widget => {
				boundWidget = widget;
				return {
					placeholder: 'Choose context',
					picks: () => constObservable({ busy: false, picks: [{ label: 'Selected', asAttachment: () => ({ kind: 'generic', id: 'selected', name: 'Selected', value: 'selected' }) }] }),
					dispose: () => disposed++,
				};
			},
		}));
		const running = test.action.run(test.instantiation, { widget: test.widget, contextItemCommandId: 'test.picker' });
		await test.quickInput.shown.p;
		test.quickInput.select('Selected');
		test.quickInput.acceptSelection();
		await running;
		assert.deepStrictEqual({ exactWidget: boundWidget === test.widget, attached: test.attached.map(entry => entry.id), disposed, disposedPickers: test.quickInput.disposedPickers }, {
			exactWidget: true, attached: ['selected'], disposed: 1, disposedPickers: 1,
		});
	});

	test('resolves services before awaiting a selected picker enablement check', async () => {
		const test = create();
		let awaiting = false;
		const accessor: ServicesAccessor = {
			get: id => {
				assert.strictEqual(awaiting, false, 'The action accessor is only valid synchronously');
				return test.instantiation.get(id);
			},
		};
		store.add(test.contextPicks.registerChatContextItem({
			type: 'pickerPick', commandId: 'test.picker', label: 'Picker', icon: Codicon.issues,
			isEnabled: async () => { awaiting = true; return true; },
			asPicker: () => ({ placeholder: 'Choose', picks: () => constObservable({ busy: false, picks: [] }) }),
		}));
		const running = test.action.run(accessor, { widget: test.widget, contextItemCommandId: 'test.picker' });
		await Promise.race([running, test.quickInput.shown.p]);
		test.quickInput.hidePicker();
		await running;
		assert.strictEqual(test.quickInput.disposedPickers, 1);
	});

	test('disposes a cancelled sub-picker even while its items are loading', async () => {
		const test = create();
		const cancellation = store.add(new CancellationTokenSource());
		const pending = new DeferredPromise<ChatContextPick[]>();
		let disposed = 0;
		store.add(test.contextPicks.registerChatContextItem({
			type: 'pickerPick', commandId: 'test.picker', label: 'Picker', icon: Codicon.issues,
			asPicker: () => ({ placeholder: 'Loading', picks: pending.p, dispose: () => disposed++ }),
		}));
		const running = test.action.run(test.instantiation, { widget: test.widget, contextItemCommandId: 'test.picker', token: cancellation.token });
		await test.quickInput.shown.p;
		cancellation.cancel();
		await running;
		pending.complete([]);
		assert.deepStrictEqual({ disposed, disposedPickers: test.quickInput.disposedPickers, attached: test.attached.length }, { disposed: 1, disposedPickers: 1, attached: 0 });
	});

	test('surfaces picker failures and disposes their resources', async () => {
		const test = create();
		let disposed = 0;
		store.add(test.contextPicks.registerChatContextItem({
			type: 'pickerPick', commandId: 'test.picker', label: 'Picker', icon: Codicon.issues,
			asPicker: () => ({ placeholder: 'Loading', picks: Promise.reject(new Error('Picker failed')), dispose: () => disposed++ }),
		}));
		await assert.rejects(test.action.run(test.instantiation, { widget: test.widget, contextItemCommandId: 'test.picker' }), /Picker failed/);
		assert.deepStrictEqual({ disposed, disposedPickers: test.quickInput.disposedPickers }, { disposed: 1, disposedPickers: 1 });
	});
});
