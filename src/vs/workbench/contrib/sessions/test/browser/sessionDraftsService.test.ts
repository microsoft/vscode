/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { NotificationText } from '../../../../../platform/notification/common/notificationMessage.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { BeforeShutdownEvent, ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IChatScheduledRequest } from '../../../chat/common/model/chatViewModel.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { SessionDraftsService } from '../../browser/sessionDraftsService.js';
import { getPendingSessionAriaLabel, IPendingSessionItem, PendingSessionRenderer } from '../../browser/views/pendingSessions.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ISessionGroupsService } from '../../browser/sessionGroupsService.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { ISavedSessionDraft, SavedSessionDrafts } from '../../common/savedSessionDrafts.js';
import { readNewChatDraftState, writeNewChatDraftState } from '../../common/newChatDraftState.js';
import { ISendRequestSentEvent, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { SESSIONS_DRAFTS_ENABLED_SETTING } from '../../common/sessionConfig.js';

suite('Saved session draft lifecycle', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function create(enabled = true, storage = disposables.add(new InMemoryStorageService())) {
		const config = new TestConfigurationService({ [SESSIONS_DRAFTS_ENABLED_SETTING]: enabled });
		const sent = disposables.add(new Emitter<ISendRequestSentEvent>());
		const navigation: (string | undefined)[] = [];
		const notifications: string[] = [];
		const infoNotifications: NotificationMessage[] = [];
		const beforeShutdown = disposables.add(new Emitter<BeforeShutdownEvent>());
		const lifecycle = new class extends mock<ILifecycleService>() {
			override willShutdown = false;
			override readonly onBeforeShutdown = beforeShutdown.event;
		};
		let openSavedDraft: ((id: string, token: CancellationToken) => Promise<boolean>) | undefined;
		const view = new class extends mock<ISessionsService>() {
			override registerSavedDraftOpener(opener: (id: string, token: CancellationToken) => Promise<boolean>) { openSavedDraft = opener; return Disposable.None; }
			override setCurrentDraftId(id: string | undefined) { navigation.push(id); }
			override async openNewSession(_options?: Parameters<ISessionsService['openNewSession']>[0]) { return { session: undefined, trustDeclined: false }; }
		};
		const management = new class extends mock<ISessionsManagementService>() {
			override readonly onDidSendRequest = sent.event;
			override readonly onDidEndNewSessionRequest = Event.None;
			override readonly onDidReplaceNewDraftSession = Event.None;
		};
		const groups = new class extends mock<ISessionGroupsService>() {
			override getPendingNewSessionGroup() { return 'group'; }
			override setPendingNewSessionGroup() { }
		};
		const entitlement = new class extends mock<IChatEntitlementService>() {
			override readonly sentiment = {};
			override readonly onDidChangeSentiment = Event.None;
		};
		const service = disposables.add(new SessionDraftsService(storage, config, view, management,
			new TestDialogService({ confirmed: true }), new class extends mock<INotificationService>() {
				override error(message: Parameters<INotificationService['error']>[0]) { notifications.push(String(message)); }
				override info(message: NotificationMessage | NotificationMessage[]) { infoNotifications.push(...Array.isArray(message) ? message : [message]); }
			}, new NullLogService(), groups, entitlement, lifecycle));
		return { service, storage, config, sent, navigation, view, notifications, infoNotifications, lifecycle, beforeShutdown, openSavedDraft: (id: string, token: CancellationToken) => openSavedDraft!(id, token) };
	}

	test('default-off preserves the singleton behavior without creating a collection or draft history', () => {
		const { service, storage, navigation } = create(false);
		const composer = service.createComposer();
		const registration = disposables.add(service.registerComposer(composer, async () => { }, () => { }));
		composer.updateInput({ inputText: 'unsent', attachments: [] });
		registration.dispose();
		assert.deepStrictEqual({
			saved: storage.get('sessions.savedDrafts', StorageScope.PROFILE),
			sections: service.sections.get(),
			draftHistory: navigation.filter(Boolean),
		}, { saved: undefined, sections: [], draftHistory: [] });
	});

	test('draft rows show only workspace metadata while retaining accessible draft semantics', () => {
		const { service } = create();
		service.save({ inputText: 'Workspace request', attachments: [] }, { folderUri: URI.file('/workspace/vscode') });
		service.save({ inputText: 'Unscoped request', attachments: [] }, {});
		assert.deepStrictEqual(service.sections.get()[0].items.map(item => ({
			title: item.title, description: item.description, ariaLabel: getPendingSessionAriaLabel(item),
		})).sort((a, b) => a.title.localeCompare(b.title)), [
			{ title: 'Unscoped request', description: '', ariaLabel: 'Unscoped request, draft' },
			{ title: 'Workspace request', description: 'vscode', ariaLabel: 'Workspace request, draft, vscode' },
		]);
	});

	test('only scheduled draft rows refresh relative send times and stop refreshing when recycled', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const container = DOM.append(mainWindow.document.body, DOM.$('div', { role: 'treeitem' }));
		disposables.add(toDisposable(() => container.remove()));
		const renderer = new PendingSessionRenderer(workbenchInstantiationService(undefined, disposables), () => { }, error => { throw error; });
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const item: IPendingSessionItem = {
			pendingSession: true, id: 'scheduled', kind: 'scheduled', title: 'Review',
			description: 'Scheduled for an exact date',
			runAt: new Date(Date.now() + 180_000).toISOString(),
			folderUri: URI.file('/workspace/vscode'), actions: [], open: async () => { },
		};
		const node = upcastPartial<Parameters<PendingSessionRenderer['renderElement']>[0]>({ element: item });
		const read = () => ({
			description: template.description.textContent,
			compactDescription: template.compactDescription.textContent,
			aria: container.getAttribute('aria-label'),
		});
		renderer.renderElement(node, 0, template);
		const initial = read();
		await timeout(60_000);
		const updated = read();
		renderer.disposeElement(node, 0, template);
		renderer.renderElement(upcastPartial<Parameters<PendingSessionRenderer['renderElement']>[0]>({ element: { ...item, kind: 'draft', description: 'vscode' } }), 0, template);
		await timeout(120_000);
		const ordinaryDraft = read();
		renderer.renderElement(upcastPartial<Parameters<PendingSessionRenderer['renderElement']>[0]>({ element: { ...item, runAt: undefined, description: 'Needs attention' } }), 0, template);
		assert.deepStrictEqual({ initial, updated, ordinaryDraft, error: read() }, {
			initial: { description: 'vscode - Sends in 3 minutes', compactDescription: 'vscode - Sends in 3 minutes', aria: 'Review, scheduled, vscode - Sends in 3 minutes' },
			updated: { description: 'vscode - Sends in 2 minutes', compactDescription: 'vscode - Sends in 2 minutes', aria: 'Review, scheduled, vscode - Sends in 2 minutes' },
			ordinaryDraft: { description: 'vscode', compactDescription: 'vscode', aria: 'Review, draft, vscode' },
			error: { description: 'vscode - Needs attention', compactDescription: 'vscode - Needs attention', aria: 'Review, scheduled, vscode - Needs attention' },
		});
	}));

	test('navigation creates an info notification whose link restores the saved draft', async () => {
		const { service, infoNotifications } = create();
		const openedDrafts: string[] = [];
		disposables.add(service.onDidOpenDraft(id => openedDrafts.push(id)));
		const composer = service.createComposer();
		const registration = disposables.add(service.registerComposer(composer, async () => { }, () => { }));
		composer.updateInput({ inputText: 'Keep this draft', attachments: [] });
		const saved = service.stowAndClear(composer)!;
		registration.dispose();
		const message = infoNotifications[0];
		assert.ok(message instanceof NotificationText);
		const link = message.nodes.find(node => typeof node !== 'string');
		assert.ok(link);
		const uri = URI.parse(link.href);
		const command = CommandsRegistry.getCommand(uri.path);
		assert.ok(command);
		const next = service.createComposer();
		disposables.add(service.registerComposer(next, async draft => next.updateInput(draft.input), () => { }));
		const instantiation = disposables.add(new TestInstantiationService());
		const args = JSON.parse(decodeURIComponent(uri.query));
		await instantiation.invokeFunction(command.handler, ...args);
		service.stow(next, { notifyCreated: true });
		assert.deepStrictEqual({
			count: infoNotifications.length, message: message.toString(), label: link.label,
			scheme: uri.scheme, restored: next.input, id: next.id,
			openedDrafts,
		}, {
			count: 1, message: 'Created draft. Open Draft', label: 'Open Draft',
			scheme: 'command', restored: saved.input, id: saved.id,
			openedDrafts: [saved.id],
		});
		await service.sections.get()[0].items.find(item => item.id === saved.id)!.actions.find(action => action.id === 'sessions.drafts.delete')!.run();
		await assert.rejects(async () => instantiation.invokeFunction(command.handler, ...args), /no longer available/);
	});

	test('draft creation notifies only once across new drafts and service recreation', () => {
		const first = create();
		const composer = first.service.createComposer();
		const registration = disposables.add(first.service.registerComposer(composer, async () => { }, () => { }));
		const counts: number[] = [];
		for (const inputText of ['First draft', 'Second draft']) {
			composer.updateInput({ inputText, attachments: [] });
			first.service.stowAndClear(composer);
			counts.push(first.infoNotifications.length);
		}
		registration.dispose();
		first.service.dispose();

		const next = create(true, first.storage);
		const nextComposer = next.service.createComposer();
		disposables.add(next.service.registerComposer(nextComposer, async () => { }, () => { }));
		nextComposer.updateInput({ inputText: 'After reload', attachments: [] });
		nextComposer.updateTarget({ folderUri: URI.file('/another-workspace') });
		next.service.stowAndClear(nextComposer);

		assert.deepStrictEqual({
			counts, afterReload: next.infoNotifications.length,
			drafts: next.service.sections.get().flatMap(section => section.items.map(item => item.title)).sort(),
		}, { counts: [1, 1], afterReload: 0, drafts: ['After reload', 'First draft', 'Second draft'] });
	});

	test('silent saves do not consume the one-time draft creation notification', () => {
		const { service, infoNotifications } = create();
		const composer = service.createComposer();
		composer.updateInput({ inputText: 'Silently saved', attachments: [] });
		service.stow(composer);
		service.stow(composer, { notifyCreated: true });
		const afterSilentSave = infoNotifications.length;

		const next = service.createComposer();
		next.updateInput({ inputText: 'New draft', attachments: [] });
		service.stow(next, { notifyCreated: true });
		assert.deepStrictEqual({
			afterSilentSave, notifications: infoNotifications.map(message => message.toString()),
		}, { afterSilentSave: 0, notifications: ['Created draft. Open Draft'] });
	});

	test('draft notifications exclude disabled, empty, scheduling, restoration, and background saves', () => {
		const results = ['disabled', 'empty', 'scheduling', 'restoring', 'background'].map(reason => {
			const { service, infoNotifications } = create(reason !== 'disabled');
			const composer = service.createComposer();
			composer.updateInput({ inputText: reason === 'empty' ? '  ' : 'Unsent', attachments: [] });
			composer.isScheduling = reason === 'scheduling';
			composer.isRestoring = reason === 'restoring';
			service.stow(composer, { notifyCreated: reason !== 'background' });
			return { reason, count: infoNotifications.length };
		});
		assert.deepStrictEqual(results, ['disabled', 'empty', 'scheduling', 'restoring', 'background'].map(reason => ({ reason, count: 0 })));
	});

	test('repeated navigation and disposal do not duplicate the creation notification', () => {
		const { service, infoNotifications } = create();
		const composer = service.createComposer();
		const registration = disposables.add(service.registerComposer(composer, async () => { }, () => { }));
		composer.updateInput({ inputText: 'Unsent', attachments: [] });
		service.stowAndClear(composer);
		service.stowAndClear(composer);
		registration.dispose();
		assert.deepStrictEqual(infoNotifications.map(message => message.toString()), ['Created draft. Open Draft']);
	});

	for (const enabled of [true, false]) {
		test(`scheduled previews use the New Session composer without creating drafts, drafts enabled: ${enabled}`, async () => {
			const { service, navigation } = create(enabled);
			const composer = service.createComposer();
			const restoredTarget = { modelId: 'restored-model' };
			let cleared = 0;
			disposables.add(service.registerComposer(composer, async draft => {
				composer.updateInput(draft.input);
				composer.updateTarget(restoredTarget);
			}, () => cleared++));
			if (enabled) {
				composer.updateInput({ inputText: 'Unrelated input', attachments: [] });
			}
			await service.preview({ inputText: 'Scheduled input', attachments: [] }, {}, { request: constObservable(undefined), save: async () => { }, sendNow: async () => { }, reschedule: async () => { } });
			const duringPreview = {
				text: composer.input.inputText,
				scheduled: !!composer.preview.get(),
				target: composer.target,
				dirty: composer.hasScheduledChanges.get(),
				stowed: service.stow(composer),
				navigation: navigation.at(-1),
			};
			service.stowAndClear(composer);
			assert.deepStrictEqual({
				duringPreview, cleared, afterPreview: composer.preview.get(), input: composer.input.inputText,
				drafts: service.sections.get().flatMap(section => section.items.map(item => item.title)),
			}, {
				duringPreview: { text: 'Scheduled input', scheduled: true, target: restoredTarget, dirty: false, stowed: undefined, navigation: undefined },
				cleared: 1, afterPreview: undefined, input: '',
				drafts: enabled ? ['Unrelated input'] : [],
			});
		});
	}

	test('opening an ordinary draft exits a scheduled preview', async () => {
		const { service } = create();
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async draft => composer.updateInput(draft.input), () => { }));
		const draft = service.save({ inputText: 'Editable input', attachments: [] }, {});
		await service.preview({ inputText: 'Scheduled input', attachments: [] }, {}, { request: constObservable(undefined), save: async () => { }, sendNow: async () => { }, reschedule: async () => { } });
		await service.open(draft.id);
		assert.deepStrictEqual({ preview: composer.preview.get(), input: composer.input.inputText }, { preview: undefined, input: 'Editable input' });
	});

	test('preview does not replace occupied input when saved drafts are disabled', async () => {
		const { service } = create(false);
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async () => assert.fail('Must not restore over input'), () => { }));
		composer.updateInput({ inputText: 'Unrelated input', attachments: [] });
		await assert.rejects(() => service.preview({ inputText: 'Scheduled input', attachments: [] }, {}, { request: constObservable(undefined), save: async () => { }, sendNow: async () => { }, reschedule: async () => { } }), /empty New Session/);
	});

	test('scheduled draft changes track input and execution settings until saved', async () => {
		const { service } = create();
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async draft => composer.updateInput(draft.input), () => { }));
		await service.preview({ inputText: 'Scheduled input', attachments: [] }, {}, { request: constObservable(upcastPartial<IChatScheduledRequest>({ runAt: '2099-01-01T00:00:00Z' })), save: async () => { }, sendNow: async () => { }, reschedule: async () => { } });
		const states = [composer.hasScheduledChanges.get()];
		composer.updateInput({ inputText: 'Scheduled input', attachments: [], references: [] });
		states.push(composer.hasScheduledChanges.get());
		composer.updateInput({ inputText: 'Edited input', attachments: [] });
		states.push(composer.hasScheduledChanges.get());
		assert.throws(() => service.stowAndClear(composer), /save your changes before replacing/);
		await assert.rejects(() => service.preview({ inputText: 'Another request', attachments: [] }, {}, { request: constObservable(undefined), save: async () => { }, sendNow: async () => { }, reschedule: async () => { } }), /save your changes before replacing/);
		composer.markScheduledSaved();
		states.push(composer.hasScheduledChanges.get());
		composer.updateTarget({ modelId: 'another-model' });
		states.push(composer.hasScheduledChanges.get());
		assert.deepStrictEqual(states, [false, false, true, false, true]);
	});

	test('failed scheduled preview edits do not overwrite a resumed saved draft', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { service, storage } = create();
		const saved = service.save({ inputText: 'Ordinary draft', attachments: [] }, {});
		const persisted = disposables.add(new SavedSessionDrafts(storage));
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async draft => {
			composer.updateInput(draft.input);
			if (composer.preview.get()) {
				throw new Error('Target unavailable');
			}
		}, () => { }));
		await service.open(saved.id);
		await assert.rejects(() => service.preview({ inputText: 'Scheduled input', attachments: [] }, {}, {
			request: constObservable(upcastPartial<IChatScheduledRequest>({ runAt: '2099-01-01T00:00:00Z' })),
			save: async () => { }, sendNow: async () => { }, reschedule: async () => { },
		}), /Target unavailable/);
		composer.updateInput({ inputText: 'Edited scheduled input', attachments: [] });
		composer.updateTarget({ modelId: 'another-model' });
		await timeout(300);
		await storage.flush();
		assert.deepStrictEqual({
			titles: service.sections.get()[0].items.map(item => item.title),
			persisted: persisted.drafts.get().map(draft => ({ text: draft.input.inputText, target: draft.target })),
			dirty: composer.hasScheduledChanges.get(),
		}, {
			titles: ['Ordinary draft'], persisted: [{ text: 'Ordinary draft', target: {} }], dirty: true,
		});
	}));

	for (const enabled of [true, false]) {
		test(`scheduled preview restoration blocks New Session until complete, drafts enabled: ${enabled}`, async () => {
			const { service } = create(enabled);
			const composer = service.createComposer();
			const started = new DeferredPromise<void>();
			const resume = new DeferredPromise<void>();
			let cleared = 0;
			disposables.add(service.registerComposer(composer, async draft => {
				started.complete();
				await resume.p;
				composer.updateInput(draft.input);
			}, () => cleared++));
			const opening = service.preview({ inputText: 'Scheduled input', attachments: [] }, {}, { request: constObservable(undefined), save: async () => { }, sendNow: async () => { }, reschedule: async () => { } });
			await started.p;
			try {
				assert.throws(() => service.stowAndClear(composer), /finish opening/);
			} finally {
				await resume.complete();
				await opening;
			}
			assert.deepStrictEqual({ cleared, preview: !!composer.preview.get(), input: composer.input.inputText, restoring: composer.isRestoring }, {
				cleared: 0, preview: true, input: 'Scheduled input', restoring: false,
			});
		});
	}

	test('scheduled preview restoration failure still protects later edits during navigation and shutdown', async () => {
		const { service, beforeShutdown } = create();
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async draft => {
			composer.updateInput(draft.input);
			throw new Error('Target unavailable');
		}, () => assert.fail('Must retain edited input')));
		await assert.rejects(() => service.preview({ inputText: 'Scheduled input', attachments: [] }, {}, {
			request: constObservable(upcastPartial<IChatScheduledRequest>({ runAt: '2099-01-01T00:00:00Z' })),
			save: async () => { }, sendNow: async () => { }, reschedule: async () => { },
		}), /Target unavailable/);
		composer.updateInput({ inputText: 'Keep these edits', attachments: [] });
		const vetoes: (boolean | Promise<boolean>)[] = [];
		beforeShutdown.fire(upcastPartial<BeforeShutdownEvent>({ veto: value => vetoes.push(value) }));
		await Promise.all(vetoes);
		assert.deepStrictEqual({ dirty: composer.hasScheduledChanges.get(), shutdownPrompts: vetoes.length }, { dirty: true, shutdownPrompts: 1 });
		assert.throws(() => service.stowAndClear(composer), /save your changes before replacing/);
	});

	for (const navigation of ['new session', 'another draft']) {
		test(`scheduled preview edits remain recoverable after the schedule ends and opening ${navigation}`, async () => {
			const { service } = create();
			const composer = service.createComposer();
			disposables.add(service.registerComposer(composer, async draft => composer.updateInput(draft.input), () => { }));
			const other = service.save({ inputText: 'Other draft', attachments: [] }, {});
			const request = observableValue<IChatScheduledRequest | undefined>('request', upcastPartial<IChatScheduledRequest>({ runAt: '2099-01-01T00:00:00Z' }));
			const target = { modelId: 'saved-model' };
			await service.preview({ inputText: 'Scheduled input', attachments: [] }, target, { request, save: async () => { }, sendNow: async () => { }, reschedule: async () => { } });
			const edited = { inputText: 'Keep my edits', attachments: [{ kind: 'file' as const, id: 'file', name: 'file.ts', value: URI.file('/workspace/file.ts') }] };
			composer.updateInput(edited);
			request.set(navigation === 'new session' ? undefined : upcastPartial<IChatScheduledRequest>({ description: 'Cancelled' }), undefined);
			if (navigation === 'new session') {
				service.stowAndClear(composer);
			} else {
				await service.open(other.id);
			}
			const recovered = service.sections.get()[0].items.find(item => item.title === edited.inputText)!;
			const afterLeaving = { preview: composer.preview.get(), input: composer.input.inputText };
			await service.open(recovered.id);
			assert.deepStrictEqual({ afterLeaving, input: composer.input, target: composer.target }, {
				afterLeaving: { preview: undefined, input: navigation === 'new session' ? '' : 'Other draft' },
				input: { ...edited, references: undefined }, target,
			});
		});
	}

	test('scheduled preview edits become ordinary input when the schedule ends with saved drafts disabled', async () => {
		const { service } = create(false);
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async draft => composer.updateInput(draft.input), () => assert.fail('Must keep local edits')));
		await service.preview({ inputText: 'Scheduled input', attachments: [] }, {}, { request: constObservable(undefined), save: async () => { }, sendNow: async () => { }, reschedule: async () => { } });
		composer.updateInput({ inputText: 'Keep my edits', attachments: [] });
		assert.throws(() => service.stowAndClear(composer), /no longer editable.*separate request/);
		assert.deepStrictEqual({ preview: composer.preview.get(), input: composer.input.inputText, drafts: service.sections.get() }, {
			preview: undefined, input: 'Keep my edits', drafts: [],
		});
	});

	test('typing, autosave, reload, and disposal never create drafts or restore one automatically', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const first = create(true, storage);
		const composer = first.service.createComposer();
		const registration = disposables.add(first.service.registerComposer(composer, async () => { }, () => { }));
		composer.updateInput({ inputText: 'Keep across reload', attachments: [] });
		await storage.flush();
		const afterAutosave = first.service.sections.get();
		first.lifecycle.willShutdown = true;
		first.service.stowAndClear(composer);
		registration.dispose();
		first.service.dispose();

		const next = create(true, storage);
		const nextComposer = next.service.createComposer();
		const nextRegistration = disposables.add(next.service.registerComposer(nextComposer, async () => assert.fail('Reload must not restore a saved draft'), () => { }));
		nextComposer.updateInput({ inputText: 'Unsent after reload', attachments: [] });
		nextRegistration.dispose();
		assert.deepStrictEqual({
			afterAutosave, afterReload: next.service.sections.get(),
			notifications: [...first.infoNotifications, ...next.infoNotifications],
		}, { afterAutosave: [], afterReload: [], notifications: [] });
	});

	test('saves several compositions, resumes the same identity, and retains them on live disable', async () => {
		const { service, config } = create();
		const first = service.createComposer();
		const registration = disposables.add(service.registerComposer(first, async () => { }, () => { }));
		first.updateInput({ inputText: 'first', attachments: [] });
		const firstDraft = service.stowAndClear(first)!;
		registration.dispose();
		const second = service.createComposer();
		let restored: ISavedSessionDraft | undefined;
		disposables.add(service.registerComposer(second, async draft => {
			restored = draft;
			second.updateInput(draft.input);
		}, () => { }));
		second.updateInput({ inputText: 'second', attachments: [] });
		await service.open(firstDraft.id);
		const titles = service.sections.get().flatMap(section => section.items.map(item => item.title)).sort();
		await config.setUserConfiguration(SESSIONS_DRAFTS_ENABLED_SETTING, false);
		config.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: key => key === SESSIONS_DRAFTS_ENABLED_SETTING, affectedKeys: new Set([SESSIONS_DRAFTS_ENABLED_SETTING]), source: 1, change: { keys: [SESSIONS_DRAFTS_ENABLED_SETTING], overrides: [] } });
		const hidden = service.sections.get();
		assert.deepStrictEqual({ titles, restoredId: restored?.id, composerId: second.id, hidden }, {
			titles: ['first', 'second'], restoredId: firstDraft.id, composerId: firstDraft.id, hidden: [],
		});
	});

	test('reloading a resumed draft preserves its identity, edited input, and attachments without creating copies', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		let instance = create(true, storage);
		const input = {
			inputText: '#file.ts original',
			attachments: [{ kind: 'file' as const, id: 'file', name: 'file.ts', value: URI.file('/workspace/file.ts') }],
			references: [{ id: 'file', range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 9 }, data: URI.file('/workspace/file.ts'), isFile: true }],
		};
		const draft = instance.service.save(input, { folderUri: URI.file('/workspace'), modelId: 'model' });
		const notifications: NotificationMessage[] = [];
		for (let cycle = 0; cycle < 2; cycle++) {
			const composer = instance.service.createComposer();
			const registration = disposables.add(instance.service.registerComposer(composer, async value => composer.updateInput(value.input), () => { }));
			const backup = readNewChatDraftState(storage);
			if (backup) {
				composer.updateInput(backup);
			}
			await instance.service.open(draft.id);
			composer.updateInput({ ...input, inputText: `#file.ts edit ${cycle}` });
			writeNewChatDraftState(storage, composer.input, composer.id);
			instance.lifecycle.willShutdown = true;
			instance.service.stowAndClear(composer);
			registration.dispose();
			notifications.push(...instance.infoNotifications);
			instance.service.dispose();
			instance = create(true, storage);
		}
		const composer = instance.service.createComposer();
		disposables.add(instance.service.registerComposer(composer, async value => composer.updateInput(value.input), () => { }));
		composer.updateInput(readNewChatDraftState(storage)!);
		await instance.service.open(draft.id);
		assert.deepStrictEqual({
			id: composer.id, input: composer.input, target: composer.target,
			savedIds: instance.service.sections.get()[0].items.map(item => item.id),
			notifications: [...notifications, ...instance.infoNotifications],
		}, {
			id: draft.id, input: { ...input, inputText: '#file.ts edit 1' }, target: draft.target,
			savedIds: [draft.id], notifications: [],
		});
	});

	test('a singleton backup without a live saved identity cannot adopt an unrelated draft', () => {
		const { service, storage } = create();
		const saved = service.save({ inputText: 'saved', attachments: [] }, {});
		const ids = [saved.id, 'removed-draft', undefined].map(id => {
			writeNewChatDraftState(storage, { inputText: 'backup', attachments: [] }, id);
			return service.createComposer().id === saved.id;
		});
		assert.deepStrictEqual(ids, [true, false, false]);
	});

	test('restores the backed-up composer target before startup capture without opening other saved drafts', async () => {
		const { service, storage, view, infoNotifications } = create();
		const target = { folderUri: URI.file('/saved-workspace'), providerId: 'saved-provider', sessionTypeId: 'agent', configuration: { modelId: 'saved-model', branch: 'saved-branch' } };
		const saved = service.save({ inputText: 'saved input', attachments: [] }, target);
		service.save({ inputText: 'another draft', attachments: [] }, { folderUri: URI.file('/another-workspace') });
		const input = { inputText: 'latest backed-up edit', attachments: [], references: undefined };
		writeNewChatDraftState(storage, input, saved.id);
		let opens = 0;
		view.openNewSession = async () => {
			opens++;
			return { session: undefined, trustDeclined: false };
		};
		const opened: string[] = [];
		disposables.add(service.onDidOpenDraft(id => opened.push(id)));
		const composer = service.createComposer();
		const restores: { id: string; inputText: string; target: ISavedSessionDraft['target']; preserveFocus: boolean | undefined }[] = [];
		const restored = new DeferredPromise<void>();
		view.setCurrentDraftId = () => {
			if (!composer.isRestoring) {
				restored.complete();
			}
		};
		disposables.add(service.registerComposer(composer, async (draft, _token, preserveFocus) => {
			restores.push({ id: draft.id, inputText: draft.input.inputText, target: draft.target, preserveFocus });
			composer.updateInput(draft.input);
		}, () => { }));
		const restoringBeforeStartup = composer.isRestoring;
		await restored.p;
		const openedOnStartup = [...opened];
		await service.open(saved.id);
		const changedTarget = { ...target, folderUri: URI.file('/user-picked-workspace'), configuration: { modelId: 'user-picked-model', branch: 'user-picked-branch' } };
		composer.target = changedTarget;
		const changed = service.stow(composer);
		assert.deepStrictEqual({ restoringBeforeStartup, restores, openedOnStartup, opens, target: changed?.target, input: changed?.input, infoNotifications }, {
			restoringBeforeStartup: true,
			restores: [{ id: saved.id, inputText: input.inputText, target, preserveFocus: true }],
			openedOnStartup: [], opens: 1, target: changedTarget, input, infoNotifications: [],
		});
	});

	test('selecting the already restored draft focuses it without rebuilding its target or replacing edits', async () => {
		const { service, view } = create();
		let opens = 0;
		view.openNewSession = async () => {
			opens++;
			return { session: undefined, trustDeclined: false };
		};
		const draft = service.save({ inputText: 'saved', attachments: [] }, {});
		const composer = service.createComposer();
		let restores = 0;
		let focuses = 0;
		disposables.add(service.registerComposer(composer, async value => {
			restores++;
			composer.updateInput(value.input);
		}, () => { }, () => { focuses++; }));
		await service.open(draft.id);
		composer.updateInput({ inputText: 'edited', attachments: [] });
		await service.open(draft.id);
		await service.open(draft.id);
		assert.deepStrictEqual({ opens, restores, focuses, input: composer.input.inputText }, {
			opens: 3, restores: 1, focuses: 2, input: 'edited',
		});
	});

	test('editing a resumed draft updates its sidebar workspace and input without navigating away', async () => {
		const { service } = create();
		const draft = service.save({ inputText: 'original', attachments: [] }, { folderUri: URI.file('/original') });
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async value => {
			composer.updateInput(value.input);
		}, () => { }));
		await service.open(draft.id);
		composer.updateTarget({ folderUri: URI.file('/selected') });
		composer.updateInput({ inputText: 'edited', attachments: [] });
		assert.deepStrictEqual(service.sections.get()[0].items.map(item => ({
			id: item.id, title: item.title, description: item.description,
		})), [{ id: draft.id, title: 'edited', description: 'selected' }]);
	});

	test('typing keeps sidebar labels live while coalescing storage revisions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { service, storage } = create();
		const draft = service.save({ inputText: 'original', attachments: [] }, {});
		const persisted = disposables.add(new SavedSessionDrafts(storage));
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async value => composer.updateInput(value.input), () => { }));
		await service.open(draft.id);
		let writes = 0;
		disposables.add(storage.onDidChangeValue(StorageScope.PROFILE, undefined, disposables.add(new DisposableStore()))(event => {
			if (event.key.startsWith('sessions.savedDrafts.revision.') && storage.get(event.key, StorageScope.PROFILE)) {
				writes++;
			}
		}));
		for (let i = 0; i < 20; i++) {
			composer.updateInput({ inputText: `edit ${i}`, attachments: draft.input.attachments });
		}
		const before = { writes, title: service.sections.get()[0].items[0].title };
		await timeout(299);
		const pending = persisted.drafts.get()[0].input.inputText;
		await timeout(1);
		assert.deepStrictEqual({ before, pending, writes, saved: persisted.drafts.get()[0].input.inputText }, {
			before: { writes: 0, title: 'edit 19' }, pending: 'original', writes: 1, saved: 'edit 19',
		});
	}));

	for (const boundary of ['navigation', 'send', 'shutdown', 'disposal'] as const) {
		test(`flushes pending saved edits on ${boundary}`, async () => {
			const { service, storage, lifecycle } = create();
			const draft = service.save({ inputText: 'original', attachments: [] }, {});
			const persisted = disposables.add(new SavedSessionDrafts(storage));
			const composer = service.createComposer();
			const registration = disposables.add(service.registerComposer(composer, async value => composer.updateInput(value.input), () => { }));
			await service.open(draft.id);
			composer.updateInput({ inputText: 'latest', attachments: [] });
			composer.updateTarget({ folderUri: URI.file('/latest') });
			switch (boundary) {
				case 'navigation':
					service.stowAndClear();
					break;
				case 'send':
					composer.willSend(composer.input);
					break;
				case 'shutdown':
					lifecycle.willShutdown = true;
					await storage.flush();
					break;
				case 'disposal':
					registration.dispose();
					break;
			}
			assert.deepStrictEqual(persisted.drafts.get().map(value => ({ id: value.id, text: value.input.inputText, target: value.target })), [
				{ id: draft.id, text: 'latest', target: { folderUri: URI.file('/latest') } },
			]);
		});
	}

	for (const input of [
		{ inputText: 'saved text', attachments: [] },
		{ inputText: '', attachments: [{ kind: 'file' as const, id: 'file', name: 'file.ts', value: URI.file('/file.ts') }] },
	]) {
		test(`temporarily emptying a resumed draft preserves its identity for Undo (${input.inputText ? 'text' : 'attachments'})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { service, storage } = create();
			const draft = service.save(input, {});
			const composer = service.createComposer();
			disposables.add(service.registerComposer(composer, async value => composer.updateInput(value.input), () => { }));
			await service.open(draft.id);
			composer.updateInput({ inputText: '', attachments: [] });
			await timeout(300);
			const emptyIds = service.sections.get()[0].items.map(item => item.id);
			composer.updateInput(input);
			await storage.flush();
			assert.deepStrictEqual({ emptyIds, id: composer.id, saved: service.sections.get()[0].items.map(item => item.id) }, {
				emptyIds: [draft.id], id: draft.id, saved: [draft.id],
			});
		}));
	}

	for (const accepted of [false, true]) {
		test(`pending persistence respects a scheduling handoff (accepted: ${accepted})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { service, storage } = create();
			const draft = service.save({ inputText: 'original', attachments: [] }, {});
			const persisted = disposables.add(new SavedSessionDrafts(storage));
			const composer = service.createComposer();
			disposables.add(service.registerComposer(composer, async value => composer.updateInput(value.input), () => { }));
			await service.open(draft.id);
			composer.updateInput({ inputText: 'latest', attachments: [] });
			composer.isScheduling = true;
			await timeout(300);
			const pendingRevision = persisted.drafts.get()[0].revision;
			if (accepted) {
				service.finishScheduledComposer(composer, draft.revision);
			}
			composer.isScheduling = false;
			await storage.flush();
			assert.deepStrictEqual({ unchangedWhileScheduling: pendingRevision === draft.revision, saved: persisted.drafts.get().map(value => value.input.inputText) }, {
				unchangedWhileScheduling: true, saved: accepted ? [] : ['latest'],
			});
		}));
	}

	for (const action of ['newSession', 'targetSelection'] as const) {
		test(`${action} cancels reload recovery without restoring stale input or target`, async () => {
			const { service, storage, notifications } = create();
			const saved = service.save({ inputText: 'recovered', attachments: [] }, { folderUri: URI.file('/old') });
			const other = service.save({ inputText: 'other', attachments: [] }, {});
			writeNewChatDraftState(storage, saved.input, saved.id);
			const composer = service.createComposer();
			const started = new DeferredPromise<void>();
			let cancelled = false;
			disposables.add(service.registerComposer(composer, async (draft, token, preserveFocus) => {
				if (draft.id === saved.id && preserveFocus) {
					await new Promise<void>(resolve => {
						disposables.add(token!.onCancellationRequested(() => {
							cancelled = true;
							resolve();
						}));
						started.complete();
					});
					return;
				}
				composer.updateInput(draft.input);
			}, () => { }));
			await started.p;
			if (action === 'newSession') {
				service.stowAndClear();
			} else {
				composer.cancelRecovery();
			}
			const newId = composer.id;
			composer.updateInput({ inputText: 'new choice', attachments: [] });
			composer.updateTarget({ folderUri: URI.file('/new') });
			await service.open(other.id);
			await service.open(newId);
			assert.deepStrictEqual({ cancelled, id: composer.id, input: composer.input.inputText, target: composer.target, notifications }, {
				cancelled: true, id: newId, input: 'new choice', target: { folderUri: URI.file('/new') }, notifications: [],
			});
		});
	}

	test('reveals only the restored destination when a custom surface covers the composer', async () => {
		const { service, view } = create();
		const draft = service.save({ inputText: 'saved', attachments: [] }, {});
		const composer = service.createComposer();
		const revealed: string[] = [];
		disposables.add(service.registerComposer(composer, async value => composer.updateInput(value.input), () => { }));
		view.openNewSession = async options => {
			assert.strictEqual(options?.preserveNavigation, true);
			revealed.push(composer.input.inputText);
			return { session: undefined, trustDeclined: false };
		};
		await service.open(draft.id);
		await service.open(draft.id);
		assert.deepStrictEqual(revealed, ['saved', 'saved']);
	});

	test('opening another draft cancels the recovered composer restoration', async () => {
		const { service, storage, notifications } = create();
		const first = service.save({ inputText: 'backed up', attachments: [] }, { folderUri: URI.file('/first') });
		const second = service.save({ inputText: 'selected', attachments: [] }, { folderUri: URI.file('/second') });
		writeNewChatDraftState(storage, first.input, first.id);
		const composer = service.createComposer();
		const started = new DeferredPromise<void>();
		let cancelled = false;
		disposables.add(service.registerComposer(composer, async (draft, token) => {
			if (draft.id === first.id) {
				await new Promise<void>(resolve => {
					disposables.add(token!.onCancellationRequested(() => {
						cancelled = true;
						resolve();
					}));
					started.complete();
				});
				return;
			}
			composer.updateInput(draft.input);
		}, () => { }));
		await started.p;
		await service.open(second.id);
		assert.deepStrictEqual({ cancelled, input: composer.input.inputText, target: composer.target, restoring: composer.isRestoring, notifications }, {
			cancelled: true, input: second.input.inputText, target: second.target, restoring: false, notifications: [],
		});
	});

	test('starting a new composition saves and clears the input, then resumes its text, attachments and target', async () => {
		const { service } = create();
		const composer = service.createComposer();
		const input = { inputText: 'keep this request', attachments: [{ kind: 'file' as const, id: 'file', name: 'file.ts', value: URI.file('/workspace/file.ts') }], references: undefined };
		const target = { folderUri: URI.file('/workspace'), providerId: 'provider', sessionTypeId: 'agent', modelId: 'model', groupId: 'group' };
		let visibleInput = input;
		disposables.add(service.registerComposer(composer, async draft => {
			composer.updateInput(draft.input);
		}, () => { visibleInput = { inputText: '', attachments: [], references: undefined }; }));
		composer.target = target;
		composer.updateInput(input);
		const id = composer.id;
		const saved = service.stowAndClear();
		const cleared = {
			visibleInput, input: composer.input, newIdentity: composer.id !== id,
			savedInput: saved?.input, savedTarget: saved?.target,
		};
		composer.updateInput({ inputText: 'another request', attachments: [] });
		await service.open(id);
		assert.deepStrictEqual({ cleared, restored: composer.input, titles: service.sections.get()[0].items.map(item => item.title).sort() }, {
			cleared: { visibleInput: { inputText: '', attachments: [], references: undefined }, input: { inputText: '', attachments: [] }, newIdentity: true, savedInput: input, savedTarget: target },
			restored: input, titles: ['another request', 'keep this request'],
		});
	});

	test('starting a new composition preserves disabled drafts and does not create empty drafts', () => {
		const results = [false, true].map(enabled => {
			const { service } = create(enabled);
			const composer = service.createComposer();
			let cleared = false;
			disposables.add(service.registerComposer(composer, async () => { }, () => { cleared = true; }));
			composer.updateInput({ inputText: enabled ? '  ' : 'keep singleton input', attachments: [] });
			const id = composer.id;
			service.stowAndClear();
			return { cleared, sameIdentity: composer.id === id, input: composer.input.inputText, sections: service.sections.get() };
		});
		assert.deepStrictEqual(results, [
			{ cleared: false, sameIdentity: true, input: 'keep singleton input', sections: [] },
			{ cleared: false, sameIdentity: true, input: '  ', sections: [] },
		]);
	});

	test('opening a recovered schedule consumes its saved revision and stows occupied input', async () => {
		const { service } = create();
		const draft = service.save({
			inputText: 'scheduled request',
			attachments: [{ kind: 'file', id: 'file', name: 'file.ts', value: URI.file('/workspace/file.ts') }],
		}, { folderUri: URI.file('/workspace'), providerId: 'provider', modelId: 'model', groupId: 'group' });
		const composer = service.createComposer();
		const registration = disposables.add(service.registerComposer(composer, async value => {
			composer.updateInput(value.input);
		}, () => { }));
		composer.updateInput({ inputText: 'previous input', attachments: [] });

		await service.open(draft.id, { removeFromDrafts: true });

		const opened = {
			input: composer.input, target: composer.target, id: composer.id,
			saved: service.sections.get().flatMap(section => section.items.map(item => item.title)),
		};
		service.stowAndClear(composer);
		registration.dispose();
		assert.deepStrictEqual({
			opened,
			afterLeaving: service.sections.get().flatMap(section => section.items.map(item => item.title)).sort(),
		}, {
			opened: { input: draft.input, target: draft.target, id: draft.id, saved: ['previous input'] },
			afterLeaving: ['previous input', 'scheduled request'],
		});
	});

	for (const outcome of ['failed', 'disposed'] as const) {
		test(`opening a recovered schedule retains its saved revision when restoration is ${outcome}`, async () => {
			const { service } = create();
			const draft = service.save({ inputText: 'recoverable request', attachments: [] }, {});
			const composer = service.createComposer();
			const started = new DeferredPromise<void>();
			const resume = new DeferredPromise<void>();
			const registration = disposables.add(service.registerComposer(composer, async () => {
				started.complete();
				await resume.p;
				if (outcome === 'failed') {
					throw new Error('Restore failed');
				}
			}, () => { }));
			const opening = service.open(draft.id, { removeFromDrafts: true });
			await started.p;
			if (outcome === 'disposed') {
				registration.dispose();
			}
			resume.complete();
			if (outcome === 'failed') {
				await assert.rejects(opening, /Restore failed/);
			} else {
				await opening;
			}
			assert.deepStrictEqual(service.sections.get().flatMap(section => section.items.map(item => item.id)), [draft.id]);
		});
	}

	test('opening a recovered schedule does not consume a newer saved revision', async () => {
		const { service } = create();
		const draft = service.save({ inputText: 'original request', attachments: [] }, {});
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async value => {
			service.save({ inputText: 'newer request', attachments: [] }, {}, draft.id);
			composer.updateInput(value.input);
		}, () => { }));
		await service.open(draft.id, { removeFromDrafts: true });
		assert.deepStrictEqual({
			input: composer.input.inputText,
			saved: service.sections.get().flatMap(section => section.items.map(item => item.title)),
		}, { input: 'original request', saved: ['newer request'] });
	});

	test('a failed save leaves the current input and identity intact', () => {
		const { service, storage } = create();
		const composer = service.createComposer();
		let cleared = false;
		disposables.add(service.registerComposer(composer, async () => { }, () => { cleared = true; }));
		composer.updateInput({ inputText: 'must not lose this', attachments: [] });
		const id = composer.id;
		const store = storage.store;
		storage.store = () => { throw new Error('Storage unavailable'); };
		try {
			assert.throws(() => service.stowAndClear(), /Storage unavailable/);
			assert.deepStrictEqual({ cleared, sameIdentity: composer.id === id, input: composer.input.inputText }, {
				cleared: false, sameIdentity: true, input: 'must not lose this',
			});
		} finally {
			storage.store = store;
		}
	});

	test('overlapping opens cannot save the previous input under the next draft identity', async () => {
		const { service } = create();
		const first = service.save({ inputText: 'first', attachments: [] }, {});
		const second = service.save({ inputText: 'second', attachments: [] }, {});
		const skipped = service.save({ inputText: 'skipped', attachments: [] }, {});
		const composer = service.createComposer();
		const started = new DeferredPromise<void>();
		const resume = new DeferredPromise<void>();
		const restored: string[] = [];
		const opened: string[] = [];
		disposables.add(service.onDidOpenDraft(id => opened.push(id)));
		disposables.add(service.registerComposer(composer, async (draft, token) => {
			restored.push(draft.id);
			if (draft.id === first.id) {
				started.complete();
				await resume.p;
			}
			if (!token?.isCancellationRequested) {
				composer.updateInput(draft.input);
			}
		}, () => { }));
		const openingFirst = service.open(first.id);
		await started.p;
		const openingSkipped = service.open(skipped.id);
		const openingSecond = service.open(second.id);
		resume.complete();
		await Promise.all([openingFirst, openingSkipped, openingSecond]);
		assert.deepStrictEqual({
			input: composer.input.inputText, id: composer.id,
			titles: service.sections.get().flatMap(section => section.items.map(item => item.title)).sort(),
			restored, opened,
		}, { input: 'second', id: second.id, titles: ['first', 'second', 'skipped'], restored: [first.id, second.id], opened: [second.id] });
	});

	test('opening a draft restores only the requested draft when the composer registers', async () => {
		const { service, view } = create();
		const previous = service.save({ inputText: 'previous draft', attachments: [] }, {});
		const requested = service.save({ inputText: 'requested draft', attachments: [] }, {});
		const composer = service.createComposer();
		composer.id = previous.id;
		const restored: string[] = [];
		view.openNewSession = async () => {
			disposables.add(service.registerComposer(composer, async draft => {
				restored.push(draft.id);
				composer.updateInput(draft.input);
			}, () => { }));
			return { session: undefined, trustDeclined: false };
		};

		await service.open(requested.id);

		assert.deepStrictEqual({ restored, input: composer.input, id: composer.id }, {
			restored: [requested.id], input: requested.input, id: requested.id,
		});
	});

	test('registering a composer does not automatically restore an existing draft', async () => {
		const { service, storage } = create();
		const previous = service.save({ inputText: 'previous draft', attachments: [] }, {});
		const requested = service.save({ inputText: 'requested draft', attachments: [] }, {});
		storage.store('sessions.savedDrafts.active', previous.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const composer = service.createComposer();
		const originalId = composer.id;
		composer.id = previous.id;
		const restored: string[] = [];
		disposables.add(service.registerComposer(composer, async draft => {
			restored.push(draft.id);
			composer.updateInput(draft.input);
		}, () => { }));

		await Promise.resolve();
		assert.deepStrictEqual(restored, []);
		composer.id = originalId;
		await service.open(requested.id);

		assert.deepStrictEqual({
			restored, input: composer.input, id: composer.id,
			titles: service.sections.get()[0].items.map(item => item.title).sort(),
		}, {
			restored: [requested.id], input: requested.input, id: requested.id,
			titles: ['previous draft', 'requested draft'],
		});
	});

	test('restoring input does not record an intermediate empty composer in navigation', async () => {
		const { service, navigation, view } = create();
		view.openNewSession = async options => {
			if (!options?.preserveNavigation) {
				navigation.push('intermediate composer');
			}
			return { session: undefined, trustDeclined: false };
		};
		const draft = service.save({ inputText: 'saved', attachments: [] }, {});
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async value => {
			composer.updateInput({ inputText: '', attachments: [] });
			composer.updateInput(value.input);
		}, () => { }));
		navigation.length = 0;
		await service.open(draft.id);
		assert.deepStrictEqual(navigation, [draft.id]);
	});

	test('background completion removes only the submitted draft and never a newer composition', () => {
		const { service, sent } = create();
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async () => { }, () => { }));
		const input = { inputText: 'sent input', attachments: [] };
		composer.updateInput(input);
		service.stow(composer);
		composer.willSend(input);
		const options = { query: input.inputText, background: true };
		composer.trackSend(options, 'first');
		composer.updateInput({ inputText: '', attachments: [] });
		composer.didSend(true);
		composer.updateInput({ inputText: 'new input', attachments: [] });
		service.stow(composer);
		sent.fire({ session: new class extends mock<ISession>() { override readonly sessionId = 'first'; override readonly resource = URI.parse('test:/first'); }, chat: new class extends mock<IChat>() { }, isNewSession: true, isNewChat: true, options });
		assert.deepStrictEqual(service.sections.get().flatMap(section => section.items.map(item => item.title)), ['new input']);
	});

	test('emptying a saved composition removes its old record on navigation away', () => {
		const { service } = create();
		const composer = service.createComposer();
		const registration = disposables.add(service.registerComposer(composer, async () => { }, () => { }));
		composer.updateInput({ inputText: 'old input', attachments: [] });
		service.stow(composer);
		composer.updateInput({ inputText: '  ', attachments: [] });
		service.stowAndClear(composer);
		registration.dispose();
		assert.deepStrictEqual(service.sections.get(), []);
	});

	test('deleting the active draft cannot recreate its input during subsequent disposal', async () => {
		const { service } = create();
		const composer = service.createComposer();
		let restored = false;
		let cleared = false;
		const registration = disposables.add(service.registerComposer(composer, async () => { restored = true; }, () => { cleared = true; }));
		composer.updateInput({ inputText: 'delete me', attachments: [] });
		service.stow(composer);
		await service.sections.get()[0].items[0].actions.find(action => action.id === 'sessions.drafts.delete')!.run();
		registration.dispose();
		assert.deepStrictEqual({ restored, cleared, input: composer.input, sections: service.sections.get() }, { restored: false, cleared: true, input: { inputText: '', attachments: [] }, sections: [] });
	});

	test('a draft cannot replace a composition while its scheduling acknowledgment is pending', async () => {
		const { service } = create();
		const next = service.save({ inputText: 'next', attachments: [] }, {});
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async () => assert.fail('Must not replace input'), () => { }));
		composer.updateInput({ inputText: 'scheduling', attachments: [] });
		composer.isScheduling = true;
		await assert.rejects(service.open(next.id), /finish scheduling/);
		assert.strictEqual(composer.input.inputText, 'scheduling');
	});

	test('a removed active draft does not reuse its scheduling identity on reload', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storage.store('sessions.savedDrafts.active', 'scheduled-composition', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const { service } = create(true, storage);
		assert.notStrictEqual(service.createComposer().id, 'scheduled-composition');
	});

	test('unreadable draft storage reports the read failure without blocking a send', () => {
		const { service, storage, notifications } = create();
		const raw = '{"version":99,"drafts":[]}';
		storage.store('sessions.savedDrafts', raw, StorageScope.PROFILE, StorageTarget.MACHINE);
		const composer = service.createComposer();
		composer.willSend({ inputText: 'send this', attachments: [] });
		assert.deepStrictEqual({
			sending: composer.isSending, input: composer.input.inputText,
			stored: storage.get('sessions.savedDrafts', StorageScope.PROFILE),
			notified: notifications.some(message => message.includes('Could not read saved drafts')),
		}, { sending: true, input: 'send this', stored: raw, notified: true });
		composer.didSend(false);
	});

	test('comparison acceptance removes its captured revision, while failure preserves it', () => {
		const results = [true, false].map(accepted => {
			const { service } = create();
			const composer = service.createComposer();
			composer.updateInput({ inputText: 'compare this', attachments: [] });
			service.stow(composer);
			composer.willSend({ inputText: 'compare this', attachments: [] });
			composer.didSend(accepted);
			return service.sections.get().flatMap(section => section.items.map(item => item.title));
		});
		assert.deepStrictEqual(results, [[], ['compare this']]);
	});

	test('cancelling and disposing during restore cannot persist old input under the requested identity', async () => {
		const { service, openSavedDraft } = create();
		const requested = service.save({ inputText: 'requested', attachments: [] }, {});
		const composer = service.createComposer();
		const previousId = composer.id;
		const started = new DeferredPromise<void>();
		const resume = new DeferredPromise<void>();
		const registration = disposables.add(service.registerComposer(composer, async (draft, token) => {
			started.complete();
			await resume.p;
			if (!token?.isCancellationRequested) {
				composer.updateInput(draft.input);
			}
		}, () => { }));
		composer.updateInput({ inputText: 'previous', attachments: [] });
		const cancellation = disposables.add(new CancellationTokenSource());
		const opening = openSavedDraft(requested.id, cancellation.token);
		await started.p;
		cancellation.cancel();
		registration.dispose();
		resume.complete();
		await opening;
		assert.deepStrictEqual({
			id: composer.id, input: composer.input.inputText,
			drafts: service.sections.get()[0].items.map(item => item.title).sort(),
		}, { id: previousId, input: 'previous', drafts: ['previous', 'requested'] });
	});

	test('failed send after navigation retains the original prompt', () => {
		const { service } = create();
		const composer = service.createComposer();
		const registration = disposables.add(service.registerComposer(composer, async () => { }, () => { }));
		const input = { inputText: 'recover me', attachments: [] };
		composer.updateInput(input);
		service.stow(composer);
		composer.willSend(input);
		composer.updateInput({ inputText: '', attachments: [] });
		registration.dispose();
		composer.didSend(false);
		assert.deepStrictEqual(service.sections.get().flatMap(section => section.items.map(item => item.title)), ['recover me']);
	});

	test('sending a new composition does not create a saved draft', () => {
		const { service, infoNotifications } = create();
		const composer = service.createComposer();
		composer.willSend({ inputText: 'Send without drafting', attachments: [] });
		composer.dispose();
		composer.didSend(false);
		assert.deepStrictEqual({ drafts: service.sections.get(), notifications: infoNotifications }, { drafts: [], notifications: [] });
	});

	test('navigating away with attachments only creates a draft and its notification', () => {
		const { service, infoNotifications } = create();
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async () => { }, () => { }));
		const input = { inputText: '', attachments: [{ kind: 'file' as const, id: 'file', name: 'file.ts', value: URI.file('/workspace/file.ts') }] };
		composer.updateInput(input);
		const saved = service.stowAndClear(composer);
		assert.deepStrictEqual({
			savedInput: saved?.input, titles: service.sections.get()[0].items.map(item => item.title),
			notifications: infoNotifications.map(message => message.toString()), currentInput: composer.input,
		}, { savedInput: { ...input, references: undefined }, titles: ['Attached Context'], notifications: ['Created draft. Open Draft'], currentInput: { inputText: '', attachments: [] } });
	});
});
