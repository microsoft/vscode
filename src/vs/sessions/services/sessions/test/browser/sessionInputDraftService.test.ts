/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { toFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatModel, IChatModelInputState, IInputModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { SessionInputDraftService } from '../../browser/sessionInputDraftService.js';

suite('SessionInputDraftService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('test:/session/chat');

	function setup(storage = store.add(new InMemoryStorageService())) {
		const created = store.add(new Emitter<IChatModel>());
		const models = new Map<string, IChatModel>();
		let loads = 0;
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidCreateModel = created.event;
			override getSession(uri: URI): IChatModel | undefined { return models.get(uri.toString()); }
			override async acquireOrLoadSession() { loads++; return undefined; }
		};
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IChatService, chatService);
		instantiation.stub(IStorageService, storage);
		instantiation.stub(IUriIdentityService, { extUri });
		instantiation.stub(ILogService, new NullLogService());
		const service = store.add(instantiation.createInstance(SessionInputDraftService));
		return { service, storage, models, created, loads: () => loads };
	}

	function model(text: string, chatResource = resource) {
		const state = observableValue<IChatModelInputState>('nativeInput', {
			inputText: text,
			attachments: [],
			mode: { id: ChatModeKind.Agent, kind: ChatModeKind.Agent },
			selectedModel: undefined,
			selections: [],
			contrib: {},
		});
		const disposed = store.add(new Emitter<void>());
		const inputModel: IInputModel = {
			state,
			intendedModel: undefined,
			setIntendedModel: () => { },
			setState: update => state.set({ ...state.get(), ...update }, undefined),
			clearState: () => state.set({ ...state.get(), inputText: '', attachments: [] }, undefined),
			toJSON: () => undefined,
		};
		const chat = new class extends mock<IChatModel>() {
			override readonly sessionResource = chatResource;
			override readonly onDidDispose = disposed.event;
			override readonly inputModel = inputModel;
		};
		return { chat, state, disposed };
	}

	test('reading and editing an unloaded draft does not acquire a chat model', () => {
		const { service, loads } = setup();
		const state = service.getDraft(resource);
		service.setDraft(resource, { inputText: 'Keep this thought', attachments: [] });
		assert.deepStrictEqual({ state: state.get(), loads: loads(), stable: service.getDraft(resource) === state }, {
			state: { inputText: 'Keep this thought', attachments: [] },
			loads: 0,
			stable: true,
		});

		test('observing a seeded composer does not adopt an empty passive draft', () => {
			const { service, loads } = setup();
			const present = service.getDraftIfPresent(resource);
			const before = present.get();
			service.getDraft(resource).get();
			const passive = present.get();
			service.setDraft(resource, { inputText: 'Seeded outcome', attachments: [] });
			const seeded = present.get();
			service.setDraft(resource, { inputText: '', attachments: [] });
			assert.deepStrictEqual({ before, passive, seeded, cleared: present.get(), loads: loads() }, {
				before: undefined, passive: undefined,
				seeded: { inputText: 'Seeded outcome', attachments: [] },
				cleared: { inputText: '', attachments: [] }, loads: 0,
			});

			test('explicitly adopting a mounted composer captures its existing text and evidence', () => {
				const { service, loads } = setup();
				const attachment = toFileVariableEntry(URI.file('/evidence.png'));
				let reads = 0;
				const registration = store.add(service.registerDraftProvider(resource, () => {
					reads++;
					return { inputText: 'Existing native outcome', attachments: [attachment] };
				}));
				const before = service.getDraftIfPresent(resource).get();
				const observedReads = reads;
				const adopted = service.getDraft(resource).get();
				service.setDraft(resource, { inputText: 'Reviewed task', attachments: [attachment] });
				const updated = service.getDraft(resource).get();
				registration.dispose();
				assert.deepStrictEqual({ before, observedReads, adopted, updated, reads, loads: loads() }, {
					before: undefined, observedReads: 0,
					adopted: { inputText: 'Existing native outcome', attachments: [attachment] },
					updated: { inputText: 'Reviewed task', attachments: [attachment] }, reads: 1, loads: 0,
				});
			});
		});
	});

	test('references preserve text, deduplicate attachments, and stay chat-scoped', () => {
		const { service } = setup();
		const other = URI.parse('test:/other/chat');
		const file = toFileVariableEntry(URI.file('/project/policy.ts'));
		service.setDraft(resource, { inputText: 'Explain this', attachments: [] });
		service.addAttachments(resource, [file, file]);
		service.addAttachments(resource, [file]);
		assert.deepStrictEqual({
			draft: service.getDraft(resource).get(),
			other: service.getDraft(other).get(),
		}, {
			draft: { inputText: 'Explain this', attachments: [file] },
			other: { inputText: '', attachments: [] },
		});
	});

	test('shares input updates with an already-loaded native chat model', () => {
		const { service, models } = setup();
		const { chat, state } = model('Native input');
		models.set(resource.toString(), chat);
		const draft = service.getDraft(resource);
		const initial = draft.get().inputText;
		service.setDraft(resource, { inputText: 'Board input', attachments: [] });
		const fromBoard = state.get().inputText;
		state.set({ ...state.get(), inputText: 'Native input again' }, undefined);
		assert.deepStrictEqual({ initial, fromBoard, final: draft.get().inputText }, {
			initial: 'Native input',
			fromBoard: 'Board input',
			final: 'Native input again',
		});
	});

	test('applies pending user text and references when that chat model is created', () => {
		const { service, created } = setup();
		const file = toFileVariableEntry(URI.file('/project/review.md'));
		service.setDraft(resource, { inputText: 'Review this artifact', attachments: [file] });
		const { chat, state } = model('Older stored text');
		created.fire(chat);
		assert.deepStrictEqual({ text: state.get().inputText, attachments: state.get().attachments }, {
			text: 'Review this artifact',
			attachments: [file],
		});
	});

	test('detaches model observers when a native model is disposed', () => {
		const { service, created } = setup();
		const { chat, state, disposed } = model('Latest text');
		created.fire(chat);
		disposed.fire();
		state.set({ ...state.get(), inputText: 'Disposed model' }, undefined);
		assert.strictEqual(service.getDraft(resource).get().inputText, 'Latest text');
	});

	test('rebinding a chat preserves existing draft handles and late send completion', () => {
		const { service, loads } = setup();
		const target = URI.parse('test:/replacement/chat');
		const handle = service.getDraft(resource);
		service.setDraft(resource, { inputText: 'Send this', attachments: [] });
		service.rebindDraft(resource, target);
		const transferred = service.getDraft(target).get();
		service.setDraft(resource, { inputText: '', attachments: [] });
		assert.deepStrictEqual({ transferred, original: handle.get(), replacement: service.getDraft(target).get(), loads: loads() }, {
			transferred: { inputText: 'Send this', attachments: [] },
			original: { inputText: '', attachments: [] },
			replacement: { inputText: '', attachments: [] },
			loads: 0,
		});
	});

	test('rebinding detaches the retired model and shares the replacement model', () => {
		const { service, models, created } = setup();
		const target = URI.parse('test:/replacement/chat');
		const original = model('Original draft');
		models.set(resource.toString(), original.chat);
		const handle = service.getDraft(resource);
		service.setDraft(resource, { inputText: 'Local edit', attachments: [] });
		const replacement = model('Stored replacement draft', target);
		models.set(target.toString(), replacement.chat);
		created.fire(replacement.chat);
		service.rebindDraft(resource, target);
		const transferred = replacement.state.get().inputText;
		original.state.set({ ...original.state.get(), inputText: 'Retired model' }, undefined);
		replacement.state.set({ ...replacement.state.get(), inputText: 'Replacement edit' }, undefined);
		assert.deepStrictEqual({ transferred, draft: handle.get().inputText }, {
			transferred: 'Local edit',
			draft: 'Replacement edit',
		});
	});

	test('persists drafts and references without persisting a loaded model', async () => {
		const { service, storage, loads } = setup();
		const file = toFileVariableEntry(URI.file('/project/policy.ts'));
		service.setDraft(resource, { inputText: 'Check these changes', attachments: [file] });
		await storage.flush();
		service.dispose();
		const restored = setup(storage);
		assert.deepStrictEqual({ draft: restored.service.getDraft(resource).get(), loads: loads() + restored.loads() }, {
			draft: { inputText: 'Check these changes', attachments: [file] },
			loads: 0,
		});
	});
});
