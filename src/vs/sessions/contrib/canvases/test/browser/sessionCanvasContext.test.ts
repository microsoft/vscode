/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { unsupportedAgentHostCanvasState, type IAgentHostCanvasInstance, type IAgentHostCanvasState } from '../../../../../platform/agentHost/common/agentHostCanvases.js';
import type { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { QuickInputHideReason, type IQuickInputHideEvent, type IQuickInputService, type IQuickPick, type IQuickPickDidAcceptEvent, type IQuickPickItem, type QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import type { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import type { IChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { AttachContextAction } from '../../../../../workbench/contrib/chat/browser/actions/chatContextActions.js';
import { IChatContextPickService, isChatContextPickerPickItem, type ChatContextPick, type IChatContextPickerItem } from '../../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';
import type { ChatAttachmentModel } from '../../../../../workbench/contrib/chat/browser/attachments/chatAttachmentModel.js';
import type { IChatWidget } from '../../../../../workbench/contrib/chat/browser/chat.js';
import type { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatInteractivity, SessionStatus, type IChat, type ISession } from '../../../../services/sessions/common/session.js';
import type { ISessionCanvases } from '../../../../services/sessions/common/sessionCanvases.js';
import { SessionCanvasContextContribution } from '../../browser/sessionCanvasContext.contribution.js';
import { ISessionCanvasService, type ISessionCanvasTarget } from '../../browser/sessionCanvasService.js';
import { collectCanvasContextReferences, getCanvasContextReference, isCanvasContextVariableEntry, toCanvasContextVariableEntry } from '../../browser/sessionCanvasContext.js';

suite('Session Canvas Context', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('variable entry round trip (pure helpers)', () => {
		test('round-trips a reference through the variable entry', () => {
			const entry = toCanvasContextVariableEntry({ resource: 'ahp-canvas:/one', incarnation: 'abc' }, 'Counter');
			assert.strictEqual(entry.kind, 'generic');
			assert.ok(isCanvasContextVariableEntry(entry));
			assert.deepStrictEqual(getCanvasContextReference(entry), { resource: 'ahp-canvas:/one', incarnation: 'abc' });
		});

		test('rejects entries that are not canvas context entries', () => {
			const other: IChatRequestVariableEntry = { kind: 'generic', id: 'x', name: 'x', value: { $mid: 'somethingElse' } };
			assert.strictEqual(getCanvasContextReference(other), undefined);
			assert.strictEqual(isCanvasContextVariableEntry(other), false);

			const notGeneric: IChatRequestVariableEntry = { kind: 'file', id: 'f', name: 'f', value: URI.parse('file:///a') } as unknown as IChatRequestVariableEntry;
			assert.strictEqual(getCanvasContextReference(notGeneric), undefined);

			// A `$mid` match with an invalid shape is corrupt data, not merely
			// "not a canvas entry" — the shared helper throws rather than
			// silently treating it as absent.
			const malformed: IChatRequestVariableEntry = { kind: 'generic', id: 'm', name: 'm', value: { $mid: 'sessionCanvasContext', resource: 123, incarnation: 'x' } };
			assert.throws(() => getCanvasContextReference(malformed));
		});

		test('collectCanvasContextReferences de-duplicates by resource, in order', () => {
			const a = toCanvasContextVariableEntry({ resource: 'ahp-canvas:/one', incarnation: '1' }, 'A');
			// Same resource *and* incarnation — a genuine duplicate attachment,
			// as opposed to the conflicting-incarnation case covered below.
			const aAgain = toCanvasContextVariableEntry({ resource: 'ahp-canvas:/one', incarnation: '1' }, 'A again');
			const b = toCanvasContextVariableEntry({ resource: 'ahp-canvas:/two', incarnation: '3' }, 'B');
			const other: IChatRequestVariableEntry = { kind: 'generic', id: 'x', name: 'x', value: { $mid: 'somethingElse' } };
			const result = collectCanvasContextReferences([a, other, aAgain, b]);
			assert.deepStrictEqual(result, [
				{ resource: 'ahp-canvas:/one', incarnation: '1' },
				{ resource: 'ahp-canvas:/two', incarnation: '3' },
			]);
		});

		test('collectCanvasContextReferences rejects conflicting incarnations for the same resource', () => {
			const a = toCanvasContextVariableEntry({ resource: 'ahp-canvas:/one', incarnation: '1' }, 'A');
			const aConflict = toCanvasContextVariableEntry({ resource: 'ahp-canvas:/one', incarnation: '2' }, 'A');
			// The shared helper's de-dup keeps the *last* value seen per
			// resource (a plain `Map#set` overwrite), so a genuine conflict —
			// same resource, different incarnation — is treated as corrupt
			// input and throws rather than silently picking one.
			assert.throws(() => collectCanvasContextReferences([a, aConflict]));
		});

		// NOTE: unlike this package's now-removed local implementation, the
		// shared `collectCanvasContextReferences` does not cap its output at
		// `CanvasContextLimits.references` (flagged to the shared helper's
		// owner as a follow-up: `withCanvasContextReferences` performs no
		// validation on write, so an oversized reference list only fails
		// later, when something calls `readCanvasContextReferences`).
	});

	suite('SessionCanvasContextContribution (manager-level)', () => {
		const instance: IAgentHostCanvasInstance = { extensionId: 'user:test', canvasId: 'counter', instanceId: 'one', title: 'Counter', availability: 'ready', url: 'http://localhost:41000/' };
		const readyState: IAgentHostCanvasState = {
			supported: true,
			catalog: [{ extensionId: instance.extensionId, canvasId: instance.canvasId, displayName: 'Counter', description: '', actions: [] }],
			instances: [instance],
		};

		function chat(resource: string, canvases: ISessionCanvases): IChat {
			return upcastPartial<IChat>({
				resource: URI.parse(resource), title: constObservable(resource), canvases,
				status: constObservable(SessionStatus.Completed), interactivity: constObservable(ChatInteractivity.Full),
			});
		}

		function canvasesFixture(state: IAgentHostCanvasState, reference?: { resource: string; incarnation: string }) {
			const refreshCalls: string[] = [];
			const generation = observableValue('generation', 0);
			const canvases: ISessionCanvases = upcastPartial<ISessionCanvases>({
				hostId: 'local',
				state: observableValue('state', state),
				connectionGeneration: generation,
				refresh: async () => { refreshCalls.push('refresh'); return state; },
				getContextReference: id => (reference && id === instance.instanceId) ? reference : undefined,
			});
			return { canvases, generation, refreshCalls };
		}

		function fakeSession(resource: string): ISession {
			return upcastPartial<ISession>({ resource: URI.parse(resource) });
		}

		function composer(resource: string) {
			let model = upcastPartial<IChatViewModel>({ sessionResource: URI.parse(resource) });
			const attachments: IChatRequestVariableEntry[] = [];
			const inputDisposed = store.add(new Emitter<void>());
			let inputEditor = upcastPartial<ICodeEditor>({ onDidDispose: inputDisposed.event });
			let attachmentModel = upcastPartial<ChatAttachmentModel>({
				addContext: (...values) => { attachments.push(...values); },
			});
			const widget = upcastPartial<IChatWidget>({
				get viewModel() { return model; },
				get inputEditor() { return inputEditor; },
				get attachmentModel() { return attachmentModel; },
			});
			return {
				widget, attachments,
				bind: (resource: string) => { model = upcastPartial<IChatViewModel>({ sessionResource: URI.parse(resource) }); },
				replaceInput: () => { inputEditor = upcastPartial<ICodeEditor>({ onDidDispose: Event.None }); },
				replaceAttachments: () => { attachmentModel = upcastPartial<ChatAttachmentModel>({ addContext: (...values) => { attachments.push(...values); } }); },
				disposeInput: () => inputDisposed.fire(),
			};
		}

		class EnabledFlag {
			readonly value = observableValue(this, false);
			set(value: boolean): void {
				this.value.set(value, undefined);
			}
		}

		function fixture() {
			const registered: IChatContextPickerItem[] = [];
			const disposedItems: IChatContextPickerItem[] = [];
			const pickService = upcastPartial<IChatContextPickService>({
				registerChatContextItem: item => {
					assert.strictEqual(item.type, 'pickerPick');
					if (item.type !== 'pickerPick') {
						throw new Error('Expected a picker item');
					}
					registered.push(item);
					return toDisposable(() => disposedItems.push(item));
				},
			});
			const config = new EnabledFlag();
			const contextKeys = new EnabledFlag();
			const targets = new Map<string, ISessionCanvasTarget>();
			const management = upcastPartial<ISessionsManagementService>({
				getSessionForChatResource: resource => targets.get(resource.toString()),
			});
			const getTargetCalls: { session: string; chat: string }[] = [];
			const canvasService = upcastPartial<ISessionCanvasService>({
				enabled: derived(reader => config.value.read(reader) && contextKeys.value.read(reader)),
				getTarget: (session, chatUri) => {
					getTargetCalls.push({ session: session.toString(), chat: chatUri.toString() });
					if (!config.value.get() || !contextKeys.value.get()) {
						throw new Error('Local canvases are disabled');
					}
					const target = targets.get(chatUri.toString());
					if (!target) {
						throw new Error(`no target registered for ${chatUri.toString()}`);
					}
					return target;
				},
			});
			const contribution = store.add(new SessionCanvasContextContribution(
				pickService,
				management,
				canvasService,
			));
			return {
				contribution, registered, disposedItems, config, contextKeys, targets, getTargetCalls,
				enable: () => { config.set(true); contextKeys.set(true); },
				registerTarget: (chatResource: string, target: ISessionCanvasTarget) => { targets.set(URI.parse(chatResource).toString(), target); },
			};
		}

		function showPicker(item: IChatContextPickerItem, widget: IChatWidget) {
			const lifetime = store.add(new DisposableStore());
			const cts = new CancellationTokenSource();
			lifetime.add(toDisposable(() => cts.dispose(true)));
			const picker = item.asPicker(widget);
			assert.strictEqual(typeof picker.picks, 'function');
			if (typeof picker.picks !== 'function') {
				throw new Error('Expected observable canvas picks');
			}
			const observable = picker.picks(constObservable(''), cts.token);
			const changed = lifetime.add(new Emitter<void>());
			let current: { busy: boolean; picks: ChatContextPick[] } = { busy: true, picks: [] };
			lifetime.add(autorun(reader => {
				current = observable.read(reader);
				changed.fire();
			}));
			return {
				get busy() { return current.busy; },
				get picks() { return current.picks.filter(isChatContextPickerPickItem); },
				settled: async () => {
					if (current.busy) {
						await Event.toPromise(Event.filter(changed.event, () => !current.busy));
					}
				},
				dispose: () => lifetime.dispose(),
			};
		}

		async function pick(item: IChatContextPickerItem, widget: IChatWidget = composer('agent-host-copilot:/unbound').widget) {
			const picker = showPicker(item, widget);
			await picker.settled();
			return picker.picks;
		}

		function quickInputFixture() {
			const changed = store.add(new Emitter<void>());
			let busy = false;
			let disposed = false;
			let items: readonly IQuickPickItem[] = [];
			let accept: (label: string) => void = () => assert.fail('Picker has not been created');
			let hide: () => void = () => assert.fail('Picker has not been created');
			const service = new class extends mock<IQuickInputService>() {
				override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
				override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T>;
				override createQuickPick<T extends IQuickPickItem>(): IQuickPick<T, { useSeparators: true }> | IQuickPick<T> {
					const accepted = store.add(new Emitter<IQuickPickDidAcceptEvent>());
					const hidden = store.add(new Emitter<IQuickInputHideEvent>());
					let selected: readonly T[] = [];
					let choices: readonly QuickPickInput<T>[] = [];
					const picker = upcastPartial<IQuickPick<T, { useSeparators: true }>>({
						value: '',
						get items() { return choices; },
						set items(value) {
							choices = value;
							items = choices.filter((item): item is T => item.type !== 'separator');
						},
						get busy() { return busy; },
						set busy(value) { busy = value; changed.fire(); },
						get selectedItems() { return selected; },
						onDidChangeValue: Event.None,
						onDidAccept: accepted.event,
						onDidHide: hidden.event,
						show: () => { },
						hide: () => hidden.fire({ reason: QuickInputHideReason.Gesture }),
						dispose: () => { disposed = true; busy = false; accepted.dispose(); hidden.dispose(); },
					});
					accept = label => {
						const choice = choices.find((item): item is T => item.type !== 'separator' && item.label === label);
						assert.ok(choice, `Missing pick: ${label}`);
						selected = [choice];
						accepted.fire({ inBackground: false });
					};
					hide = () => picker.hide();
					return picker;
				}
			}();
			return {
				service,
				get items() { return items; },
				get busy() { return busy; },
				get disposed() { return disposed; },
				accept: (label: string) => accept(label),
				hide: () => hide(),
				settled: async () => {
					if (busy) {
						await Event.toPromise(Event.filter(changed.event, () => !busy));
					}
				},
			};
		}

		function runPicker(quickInput: IQuickInputService, item: IChatContextPickerItem, widget: IChatWidget): Promise<boolean> {
			const action: {
				_handleContextPickerItem(quickInput: IQuickInputService, commands: ICommandService, item: IChatContextPickerItem, widget: IChatWidget): Promise<boolean>;
			} = Object.create(AttachContextAction.prototype);
			return action._handleContextPickerItem(quickInput, upcastPartial<ICommandService>({}), item, widget);
		}

		test('is not registered while the setting is off, even with chat enabled', () => {
			const f = fixture();
			f.contextKeys.set(true);
			assert.strictEqual(f.registered.length, 0);
		});

		test('is not registered while chat is disabled, even with the setting on', () => {
			const f = fixture();
			f.config.set(true);
			assert.strictEqual(f.registered.length, 0);
		});

		test('registers once both the setting and chat context are enabled, and unregisters when either turns off', () => {
			const f = fixture();
			f.enable();
			assert.strictEqual(f.registered.length, 1);
			assert.strictEqual(f.disposedItems.length, 0);

			f.config.set(false);
			assert.strictEqual(f.disposedItems.length, 1);

			f.config.set(true);
			assert.strictEqual(f.registered.length, 2);
		});

		test('reports an unbound composer without falling back to another session', async () => {
			const f = fixture();
			f.enable();
			const picks = await pick(f.registered[0]);
			assert.strictEqual(picks.length, 1);
			assert.strictEqual(await picks[0].asAttachment(), 'noop');
			assert.strictEqual(f.getTargetCalls.length, 0);
		});

		test('reports "unsupported" and "empty" placeholder states truthfully', async () => {
			const f = fixture();
			f.enable();
			const canvasesOne = canvasesFixture(unsupportedAgentHostCanvasState).canvases;
			const c1 = chat('agent-host-copilot:/one', canvasesOne);
			f.registerTarget('agent-host-copilot:/one', { session: fakeSession('agent-host-copilot:/one'), chat: c1, canvases: canvasesOne });
			let picks = await pick(f.registered[0], composer(c1.resource.toString()).widget);
			assert.strictEqual(picks.length, 1);
			assert.strictEqual(await picks[0].asAttachment(), 'noop');

			const emptyState: IAgentHostCanvasState = { supported: true, catalog: [], instances: [] };
			const canvasesTwo = canvasesFixture(emptyState).canvases;
			const c2 = chat('agent-host-copilot:/two', canvasesTwo);
			f.registerTarget('agent-host-copilot:/two', { session: fakeSession('agent-host-copilot:/two'), chat: c2, canvases: canvasesTwo });
			picks = await pick(f.registered[0], composer(c2.resource.toString()).widget);
			assert.strictEqual(picks.length, 1);
			assert.strictEqual(await picks[0].asAttachment(), 'noop');
		});

		test('lists live instances and builds an attachment from the captured target when a reference is available', async () => {
			const f = fixture();
			f.enable();
			const { canvases } = canvasesFixture(readyState, { resource: 'ahp-canvas:/one', incarnation: 'abc' });
			const c = chat('agent-host-copilot:/one', canvases);
			f.registerTarget('agent-host-copilot:/one', { session: fakeSession('agent-host-copilot:/one'), chat: c, canvases });
			const picks = await pick(f.registered[0], composer(c.resource.toString()).widget);
			assert.strictEqual(picks.length, 1);
			const attachment = await picks[0].asAttachment();
			assert.ok(!Array.isArray(attachment) && attachment !== 'noop');
			assert.deepStrictEqual(getCanvasContextReference(attachment), { resource: 'ahp-canvas:/one', incarnation: 'abc' });
		});

		test('returns "noop" for an instance whose reference has gone stale by attachment time', async () => {
			const f = fixture();
			f.enable();
			const { canvases } = canvasesFixture(readyState /* no reference registered */);
			const c = chat('agent-host-copilot:/one', canvases);
			f.registerTarget('agent-host-copilot:/one', { session: fakeSession('agent-host-copilot:/one'), chat: c, canvases });
			const picks = await pick(f.registered[0], composer(c.resource.toString()).widget);
			assert.strictEqual(await picks[0].asAttachment(), 'noop');
		});

		test('two composers independently capture their own chat and never attach another composer canvas', async () => {
			const f = fixture();
			f.enable();
			const { canvases: canvasesOne } = canvasesFixture(readyState, { resource: 'ahp-canvas:/one', incarnation: 'abc' });
			const cOne = chat('agent-host-copilot:/one', canvasesOne);
			f.registerTarget('agent-host-copilot:/one', { session: fakeSession('agent-host-copilot:/one'), chat: cOne, canvases: canvasesOne });

			const twoInstance: IAgentHostCanvasInstance = { ...instance, title: 'Other', url: 'http://localhost:41001/' };
			const twoState: IAgentHostCanvasState = { supported: true, catalog: [], instances: [twoInstance] };
			const { canvases: canvasesTwo } = canvasesFixture(twoState, { resource: 'ahp-canvas:/two', incarnation: 'def' });
			const cTwo = chat('agent-host-copilot:/two', canvasesTwo);
			f.registerTarget('agent-host-copilot:/two', { session: fakeSession('agent-host-copilot:/two'), chat: cTwo, canvases: canvasesTwo });

			const one = composer(cOne.resource.toString());
			const two = composer(cTwo.resource.toString());
			const firstPicker = quickInputFixture();
			const secondPicker = quickInputFixture();
			const first = runPicker(firstPicker.service, f.registered[0], one.widget);
			const second = runPicker(secondPicker.service, f.registered[0], two.widget);
			await Promise.all([firstPicker.settled(), secondPicker.settled()]);
			secondPicker.accept('Other');
			firstPicker.accept('Counter');
			await Promise.all([first, second]);
			assert.deepStrictEqual({
				one: one.attachments, two: two.attachments, disposed: [firstPicker.disposed, secondPicker.disposed],
			}, {
				one: [toCanvasContextVariableEntry({ resource: 'ahp-canvas:/one', incarnation: 'abc' }, 'Counter')],
				two: [toCanvasContextVariableEntry({ resource: 'ahp-canvas:/two', incarnation: 'def' }, 'Other')],
				disposed: [true, true],
			});
		});

		for (const change of ['composer', 'input', 'attachments', 'disposal', 'target', 'generation', 'feature'] as const) {
			test(`rejects a selected canvas after its ${change} changes`, async () => {
				const f = fixture();
				f.enable();
				const { canvases, generation } = canvasesFixture(readyState, { resource: 'ahp-canvas:/one', incarnation: 'abc' });
				const c = chat('agent-host-copilot:/one', canvases);
				const target = { session: fakeSession(c.resource.toString()), chat: c, canvases };
				f.registerTarget(c.resource.toString(), target);
				const input = composer(c.resource.toString());
				const picks = await pick(f.registered[0], input.widget);
				switch (change) {
					case 'composer': input.bind('agent-host-copilot:/two'); break;
					case 'input': input.replaceInput(); break;
					case 'attachments': input.replaceAttachments(); break;
					case 'disposal': input.disposeInput(); break;
					case 'target': f.registerTarget(c.resource.toString(), { ...target, canvases: { ...canvases } }); break;
					case 'generation': generation.set(1, undefined); break;
					case 'feature': f.config.set(false); break;
				}
				assert.deepStrictEqual({ attachment: await picks[0].asAttachment(), attachments: input.attachments }, { attachment: 'noop', attachments: [] });
			});
		}

		test('revalidates the requesting composer when initial refresh completes', async () => {
			const f = fixture();
			f.enable();
			const { canvases } = canvasesFixture(readyState, { resource: 'ahp-canvas:/one', incarnation: 'abc' });
			const refreshed = new DeferredPromise<IAgentHostCanvasState>();
			canvases.refresh = () => refreshed.p;
			const c = chat('agent-host-copilot:/one', canvases);
			f.registerTarget(c.resource.toString(), { session: fakeSession(c.resource.toString()), chat: c, canvases });
			const input = composer(c.resource.toString());
			const picker = showPicker(f.registered[0], input.widget);
			input.bind('agent-host-copilot:/two');
			await refreshed.complete(readyState);
			await picker.settled();
			assert.deepStrictEqual({
				busy: picker.busy,
				changed: picker.picks[0].label.includes('composer or canvas connection changed'),
				attachment: await picker.picks[0].asAttachment(),
			}, { busy: false, changed: true, attachment: 'noop' });
		});

		test('initial refresh rejection clears busy state, supports retry, and disposes the real attachment picker', async () => {
			const f = fixture();
			f.enable();
			const { canvases } = canvasesFixture(readyState, { resource: 'ahp-canvas:/one', incarnation: 'abc' });
			const refreshed = new DeferredPromise<IAgentHostCanvasState>();
			canvases.refresh = () => refreshed.p;
			const c = chat('agent-host-copilot:/one', canvases);
			f.registerTarget(c.resource.toString(), { session: fakeSession(c.resource.toString()), chat: c, canvases });
			const input = composer(c.resource.toString());
			const quickInput = quickInputFixture();
			const result = runPicker(quickInput.service, f.registered[0], input.widget);
			await refreshed.error(new Error('Provider disconnected'));
			await quickInput.settled();
			const failed = { busy: quickInput.busy, label: quickInput.items[0].label, detail: quickInput.items[0].detail };
			canvases.refresh = async () => readyState;
			quickInput.accept('Retry Loading Canvas Instances');
			await quickInput.settled();
			quickInput.accept('Counter');
			await result;
			assert.deepStrictEqual({
				failed,
				disposed: quickInput.disposed,
				busy: quickInput.busy,
				attachments: input.attachments,
			}, {
				failed: { busy: false, label: 'Retry Loading Canvas Instances', detail: 'Could not load canvas instances: Provider disconnected' },
				disposed: true, busy: false,
				attachments: [toCanvasContextVariableEntry({ resource: 'ahp-canvas:/one', incarnation: 'abc' }, 'Counter')],
			});
		});

		test('closing during initial refresh settles and disposes without waiting for the provider', async () => {
			const f = fixture();
			f.enable();
			const { canvases } = canvasesFixture(readyState);
			const refreshed = new DeferredPromise<IAgentHostCanvasState>();
			canvases.refresh = () => refreshed.p;
			const c = chat('agent-host-copilot:/one', canvases);
			f.registerTarget(c.resource.toString(), { session: fakeSession(c.resource.toString()), chat: c, canvases });
			const input = composer(c.resource.toString());
			const quickInput = quickInputFixture();
			const result = runPicker(quickInput.service, f.registered[0], input.widget);
			quickInput.hide();
			await result;
			await refreshed.error(new Error('Late provider failure'));
			assert.deepStrictEqual({ disposed: quickInput.disposed, busy: quickInput.busy, attachments: input.attachments }, { disposed: true, busy: false, attachments: [] });
		});

		for (const disable of ['canvases', 'AI'] as const) {
			test(`disabling ${disable} during refresh shows unavailable guidance and cleans up the picker`, async () => {
				const f = fixture();
				f.enable();
				const { canvases } = canvasesFixture(readyState);
				const refreshed = new DeferredPromise<IAgentHostCanvasState>();
				canvases.refresh = () => refreshed.p;
				const c = chat('agent-host-copilot:/one', canvases);
				f.registerTarget(c.resource.toString(), { session: fakeSession(c.resource.toString()), chat: c, canvases });
				const input = composer(c.resource.toString());
				const quickInput = quickInputFixture();
				const result = runPicker(quickInput.service, f.registered[0], input.widget);
				(disable === 'canvases' ? f.config : f.contextKeys).set(false);
				const disabled = { busy: quickInput.busy, label: quickInput.items[0].label };
				quickInput.hide();
				await result;
				await refreshed.complete(readyState);
				assert.deepStrictEqual({
					disabled, disposed: quickInput.disposed, attachments: input.attachments, registrationsDisposed: f.disposedItems.length,
				}, {
					disabled: { busy: false, label: 'Local canvases are unavailable. Re-enable local canvases and AI features in Settings to attach a canvas.' },
					disposed: true, attachments: [], registrationsDisposed: 1,
				});
			});
		}
	});
});
