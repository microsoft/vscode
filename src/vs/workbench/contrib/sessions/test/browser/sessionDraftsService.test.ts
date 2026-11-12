/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { SessionDraftsService } from '../../browser/sessionDraftsService.js';
import { ISessionGroupsService } from '../../browser/sessionGroupsService.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { ISavedSessionDraft } from '../../common/savedSessionDrafts.js';
import { ISendRequestSentEvent, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { SESSIONS_DRAFTS_ENABLED_SETTING } from '../../common/sessionConfig.js';

suite('Saved session draft lifecycle', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function create(enabled = true) {
		const storage = disposables.add(new InMemoryStorageService());
		const config = new TestConfigurationService({ [SESSIONS_DRAFTS_ENABLED_SETTING]: enabled });
		const sent = disposables.add(new Emitter<ISendRequestSentEvent>());
		const navigation: (string | undefined)[] = [];
		const view = new class extends mock<ISessionsService>() {
			override registerSavedDraftOpener() { return Disposable.None; }
			override setCurrentDraftId(id: string | undefined) { navigation.push(id); }
			override async openNewSession() { return { session: undefined, trustDeclined: false }; }
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
			new TestDialogService({ confirmed: true }), new class extends mock<INotificationService>() { }, new NullLogService(), groups, entitlement));
		return { service, storage, config, sent, navigation };
	}

	test('default-off preserves the singleton behavior without creating a collection or draft history', () => {
		const { service, storage, navigation } = create(false);
		const composer = service.createComposer();
		const registration = disposables.add(service.registerComposer(composer, async () => { }));
		composer.updateInput({ inputText: 'unsent', attachments: [] });
		registration.dispose();
		assert.deepStrictEqual({
			saved: storage.get('sessions.savedDrafts', StorageScope.PROFILE),
			sections: service.sections.get(),
			draftHistory: navigation.filter(Boolean),
		}, { saved: undefined, sections: [], draftHistory: [] });
	});

	test('saves several compositions, resumes the same identity, and retains them on live disable', async () => {
		const { service, config } = create();
		const first = service.createComposer();
		const registration = disposables.add(service.registerComposer(first, async () => { }));
		first.updateInput({ inputText: 'first', attachments: [] });
		registration.dispose();
		const second = service.createComposer();
		let restored: ISavedSessionDraft | undefined;
		disposables.add(service.registerComposer(second, async draft => {
			restored = draft;
			second.updateInput(draft.input);
		}));
		second.updateInput({ inputText: 'second', attachments: [] });
		await service.open(first.id);
		const titles = service.sections.get().flatMap(section => section.items.map(item => item.title)).sort();
		await config.setUserConfiguration(SESSIONS_DRAFTS_ENABLED_SETTING, false);
		config.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: key => key === SESSIONS_DRAFTS_ENABLED_SETTING, affectedKeys: new Set([SESSIONS_DRAFTS_ENABLED_SETTING]), source: 1, change: { keys: [SESSIONS_DRAFTS_ENABLED_SETTING], overrides: [] } });
		const hidden = service.sections.get();
		assert.deepStrictEqual({ titles, restoredId: restored?.id, composerId: second.id, hidden }, {
			titles: ['first', 'second'], restoredId: first.id, composerId: first.id, hidden: [],
		});
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
		}));
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

	test('restoring input does not record an intermediate empty composer in navigation', async () => {
		const { service, navigation } = create();
		const draft = service.save({ inputText: 'saved', attachments: [] }, {});
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async value => {
			composer.updateInput({ inputText: '', attachments: [] });
			composer.updateInput(value.input);
		}));
		navigation.length = 0;
		await service.open(draft.id);
		assert.deepStrictEqual(navigation, [draft.id]);
	});

	test('background completion removes only the submitted draft and never a newer composition', () => {
		const { service, sent } = create();
		const composer = service.createComposer();
		disposables.add(service.registerComposer(composer, async () => { }));
		const input = { inputText: 'sent input', attachments: [] };
		composer.updateInput(input);
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
		const registration = disposables.add(service.registerComposer(composer, async () => { }));
		composer.updateInput({ inputText: 'old input', attachments: [] });
		service.stow(composer);
		composer.updateInput({ inputText: '  ', attachments: [] });
		registration.dispose();
		assert.deepStrictEqual(service.sections.get(), []);
	});

	test('deleting the active draft cannot recreate its input during subsequent disposal', async () => {
		const { service } = create();
		const composer = service.createComposer();
		let restored: ISavedSessionDraft | undefined;
		const registration = disposables.add(service.registerComposer(composer, async draft => { restored = draft; }));
		composer.updateInput({ inputText: 'delete me', attachments: [] });
		service.stow(composer);
		await service.sections.get()[0].items[0].actions.find(action => action.id === 'sessions.drafts.delete')!.run();
		registration.dispose();
		assert.deepStrictEqual({ input: restored?.input, sections: service.sections.get() }, { input: { inputText: '', attachments: [] }, sections: [] });
	});

	test('failed send after navigation retains the original prompt', () => {
		const { service } = create();
		const composer = service.createComposer();
		const registration = disposables.add(service.registerComposer(composer, async () => { }));
		const input = { inputText: 'recover me', attachments: [] };
		composer.updateInput(input);
		composer.willSend(input);
		composer.updateInput({ inputText: '', attachments: [] });
		registration.dispose();
		composer.didSend(false);
		assert.deepStrictEqual(service.sections.get().flatMap(section => section.items.map(item => item.title)), ['recover me']);
	});
});
