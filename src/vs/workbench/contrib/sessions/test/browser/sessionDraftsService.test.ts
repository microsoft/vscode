/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { NotificationText } from '../../../../../platform/notification/common/notificationMessage.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { SessionDraftsService } from '../../browser/sessionDraftsService.js';
import { getPendingSessionAriaLabel } from '../../browser/views/pendingSessions.js';
import { ISessionGroupsService } from '../../browser/sessionGroupsService.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { ISavedSessionDraft } from '../../common/savedSessionDrafts.js';
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
		const lifecycle = new class extends mock<ILifecycleService>() {
			override willShutdown = false;
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
		return { service, storage, config, sent, navigation, view, notifications, infoNotifications, lifecycle, openSavedDraft: (id: string, token: CancellationToken) => openSavedDraft!(id, token) };
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
		const composer = service.createComposer();
		const started = new DeferredPromise<void>();
		const resume = new DeferredPromise<void>();
		disposables.add(service.registerComposer(composer, async draft => {
			if (draft.id === first.id) {
				started.complete();
				await resume.p;
			}
			composer.updateInput(draft.input);
		}, () => { }));
		const openingFirst = service.open(first.id);
		await started.p;
		const openingSecond = service.open(second.id);
		resume.complete();
		await Promise.all([openingFirst, openingSecond]);
		assert.deepStrictEqual({
			input: composer.input.inputText, id: composer.id,
			titles: service.sections.get().flatMap(section => section.items.map(item => item.title)).sort(),
		}, { input: 'second', id: second.id, titles: ['first', 'second'] });
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
