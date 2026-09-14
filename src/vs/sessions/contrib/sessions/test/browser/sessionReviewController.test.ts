/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions, IModalEditorPartOptions } from '../../../../../platform/editor/common/editor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorIdentifier, IEditorPane, IResourceDiffEditorInput, isResourceEditorInput, ITextDiffEditorPane, ITextResourceDiffEditorInput, IUntypedEditorInput } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { BrowserViewEditorId } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { IChatRequestVariableEntry, toFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorGroup, IEditorGroupsService, IModalEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService, MODAL_GROUP, PreferredGroup } from '../../../../../workbench/services/editor/common/editorService.js';
import { ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISessionArtifact, SessionArtifactKind } from '../../../../services/sessions/common/session.js';
import { ISessionReviewState, SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { OPEN_PULL_REQUEST_REVIEW_ACTION_ID } from '../../../github/common/types.js';
import { SessionReviewController } from '../../browser/sessionReviewController.js';
import { SessionReviewEditorInput } from '../../browser/sessionReviewEditor.js';
import { SessionReviewSidebar } from '../../browser/sessionReviewSidebar.js';

class ResourceInput extends EditorInput {
	constructor(override readonly resource: URI) { super(); }
	override get typeId(): string { return 'test.reviewResource'; }
	override getName(): string { return basename(this.resource); }
}

class ReviewGroup extends mock<IEditorGroup>() {
	override readonly id = 99;
	override readonly editors: EditorInput[] = [];
	override activeEditor: EditorInput | null = null;
}

function isResourceReference(value: unknown): value is { readonly uri: URI } {
	return typeof value === 'object' && value !== null && 'uri' in value && URI.isUri(value.uri);
}

suite('SessionReviewController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(session = makeSession(URI.parse('test:/session'))) {
		const instantiation = store.add(new TestInstantiationService());
		const context = store.add(new MockContextKeyService());
		const review = observableValue<ISessionReviewState | undefined>('review', undefined);
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', session);
		const sessions = observableValue<readonly IActiveSession[]>('sessions', [session]);
		const editorChanged = store.add(new Emitter<void>());
		const opens: { input: EditorInput; options: IEditorOptions | undefined; target: PreferredGroup | undefined }[] = [];
		const modalOptions: (IModalEditorPartOptions | undefined)[] = [];
		const closes: boolean[] = [];
		const errors: unknown[] = [];
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const replies: { chat: IChat; query: string; attachments: readonly IChatRequestVariableEntry[] }[] = [];
		const references: { resource: URI; entries: readonly IChatRequestVariableEntry[] }[] = [];
		let modal: IModalEditorPart | undefined;
		let modalCount = 0;
		let sidebarCount = 0;
		let canClose = true;
		let hidden = false;
		let trust = Promise.resolve(true);
		let openGate: DeferredPromise<void> | undefined;
		let pickerIndex: number | undefined;

		function createModal(options?: IModalEditorPartOptions): IModalEditorPart {
			modalOptions.push(options);
			const group = new ReviewGroup();
			let sidebar: IDisposable = Disposable.None;
			const part = new class extends mock<IModalEditorPart>() {
				override readonly activeGroup = group;
				override readonly groups = [group];
				override async close(options?: { mergeAllEditorsToMainPart?: boolean }): Promise<boolean> {
					closes.push(!!options?.mergeAllEditorsToMainPart);
					if (!canClose && !options?.mergeAllEditorsToMainPart) { return false; }
					if (modal === part) { modal = undefined; }
					sidebar.dispose();
					return true;
				}
			}();
			modal = part;
			modalCount++;
			if (options?.sidebar) {
				sidebarCount++;
				sidebar = store.add(options.sidebar.render(document.createElement('div'), Event.None, context));
			}
			return part;
		}

		const editors = new class extends mock<IEditorService>() {
			override readonly onDidActiveEditorChange = editorChanged.event;
			override async openEditor(input: EditorInput, options?: IEditorOptions, target?: PreferredGroup): Promise<IEditorPane | undefined>;
			override async openEditor(input: ITextResourceDiffEditorInput | IResourceDiffEditorInput, target?: PreferredGroup): Promise<ITextDiffEditorPane | undefined>;
			override async openEditor(input: IUntypedEditorInput, target?: PreferredGroup): Promise<IEditorPane | undefined>;
			override async openEditor(input: EditorInput | IUntypedEditorInput, optionsOrTarget?: IEditorOptions | PreferredGroup, preferredGroup?: PreferredGroup): Promise<IEditorPane | undefined> {
				assert.ok(modal, 'review must create its native host before opening an editor');
				const group = modal.activeGroup;
				const typed = input instanceof EditorInput ? input : isResourceEditorInput(input) ? store.add(new ResourceInput(input.resource)) : undefined;
				assert.ok(typed);
				const options = input instanceof EditorInput ? optionsOrTarget as IEditorOptions | undefined : input.options;
				const target = input instanceof EditorInput ? preferredGroup : optionsOrTarget as PreferredGroup | undefined;
				opens.push({ input: typed, options, target });
				assert.ok(group instanceof ReviewGroup);
				if (!group.editors.includes(typed)) { group.editors.push(typed); }
				group.activeEditor = typed;
				editorChanged.fire();
				await openGate?.p;
				return new class extends mock<IEditorPane>() {
					override readonly input = typed;
					override readonly group = group;
				}();
			}
			override async closeEditor(identifier: IEditorIdentifier): Promise<void> {
				await this.closeEditors([identifier]);
			}
			override async closeEditors(identifiers: IEditorIdentifier[]): Promise<void> {
				const group = modal?.activeGroup;
				if (!(group instanceof ReviewGroup)) { return; }
				for (const { editor } of identifiers) {
					const index = group.editors.indexOf(editor);
					if (index >= 0) { group.editors.splice(index, 1); }
				}
			}
		}();

		instantiation.stub(IContextKeyService, context);
		instantiation.stub(IEditorService, editors);
		instantiation.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override get activeModalEditorPart() { return modal; }
			override async createModalEditorPart(options?: IModalEditorPartOptions): Promise<IModalEditorPart> { return createModal(options); }
		}());
		instantiation.stub(ISessionsService, {
			sessionReview: review,
			activeSession,
			visibleSessions: sessions,
			canOpenSession: () => trust,
			closeSessionReview: () => review.set(undefined, undefined),
			openSessionReview: async (session, section, options) => {
				const target = sessions.get().find(candidate => isEqual(candidate.resource, session.resource));
				transaction(tx => {
					activeSession.set(target, tx);
					review.set({ ...options, sessionResource: session.resource, section }, tx);
				});
			},
		});
		instantiation.stub(ISessionsManagementService, {
			sendRequest: async (_session, chat, request) => { replies.push({ chat, query: request.query, attachments: request.attachedContext ?? [] }); },
		});
		instantiation.stub(ISessionInputDraftService, {
			addAttachments: (resource, entries) => { references.push({ resource, entries }); },
		});
		instantiation.stub(ISessionChangesService, {
			openChangesEditor: async () => { await editors.openEditor(store.add(new ResourceInput(URI.parse('test-changes:/session'))), {}, MODAL_GROUP); },
		});
		instantiation.stub(ICommandService, {
			executeCommand: async (id, ...args) => {
				commands.push({ id, args });
				if (id === OPEN_PULL_REQUEST_REVIEW_ACTION_ID) {
					const reference = args[0];
					assert.ok(isResourceReference(reference));
					await editors.openEditor(store.add(new ResourceInput(reference.uri)), {}, MODAL_GROUP);
				}
				return undefined;
			},
		});
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override get sentiment(): IChatSentiment { return upcastPartial<IChatSentiment>({ hidden }); }
		}());
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(INotificationService, { error: error => { errors.push(error); }, info: () => { } });
		instantiation.stub(IQuickInputService, {
			pick: async picks => { const items = await picks; return pickerIndex === undefined ? undefined : items[pickerIndex]; },
		});
		instantiation.stubInstance(SessionReviewSidebar, { dispose: () => { }, focus: () => { } });
		const controller = store.add(instantiation.createInstance(SessionReviewController));
		return {
			controller, review, session, sessions, activeSession, opens, closes, errors, commands, replies, references, modalOptions,
			modal: () => modal,
			counts: () => ({ modalCount, sidebarCount }),
			setCanClose: (value: boolean) => { canClose = value; },
			setHidden: (value: boolean) => { hidden = value; },
			setTrust: (value: Promise<boolean>) => { trust = value; },
			setOpenGate: (value: DeferredPromise<void>) => { openGate = value; },
			setPickerIndex: (value: number | undefined) => { pickerIndex = value; },
			createUnrelatedModal: () => createModal(),
		};
	}

	test('opens a native catalog and keeps one reply sidebar across result switches', async () => {
		const harness = setup();
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.Artifacts }, undefined);
		await timeout(0);
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.Artifacts, resource: URI.parse('https://example.com/result') }, undefined);
		await timeout(0);
		assert.deepStrictEqual({
			counts: harness.counts(),
			targets: harness.opens.map(open => open.target),
			override: harness.opens[1].options?.override,
			selected: harness.controller.selection.get()?.resource.toString(),
			errors: harness.errors,
		}, { counts: { modalCount: 1, sidebarCount: 1 }, targets: [MODAL_GROUP, MODAL_GROUP], override: BrowserViewEditorId, selected: 'https://example.com/result', errors: [] });
	});

	test('opts into the native adaptive sidebar without replacing native modal layout', async () => {
		const harness = setup();
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.Artifacts }, undefined);
		await timeout(0);
		const sidebar = harness.modalOptions[0]?.sidebar;
		assert.deepStrictEqual({
			placement: sidebar?.placement,
			width: sidebar?.sidebarWidth,
			height: sidebar?.sidebarHeight,
			hidden: sidebar?.sidebarHidden,
		}, { placement: 'auto', width: 320, height: 320, hidden: false });
	});

	test('Back to Board respects native dirty-editor cancellation', async () => {
		const harness = setup();
		const state = { sessionResource: harness.session.resource, section: SessionReviewSection.Artifacts };
		harness.review.set(state, undefined);
		await timeout(0);
		harness.setCanClose(false);
		const cancelled = await harness.controller.close();
		const retained = harness.review.get() === state;
		harness.setCanClose(true);
		const closed = await harness.controller.close();
		assert.deepStrictEqual({ cancelled, retained, closed, state: harness.review.get(), modal: harness.modal(), closes: harness.closes }, {
			cancelled: false, retained: true, closed: true, state: undefined, modal: undefined, closes: [false, false],
		});
	});

	test('does not attach review controls to an unrelated modal when its close is cancelled', async () => {
		const harness = setup();
		const original = harness.createUnrelatedModal();
		harness.setCanClose(false);
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.Artifacts }, undefined);
		await timeout(0);
		assert.deepStrictEqual({ originalRetained: harness.modal() === original, counts: harness.counts(), opens: harness.opens.length, state: harness.review.get() }, {
			originalRetained: true, counts: { modalCount: 1, sidebarCount: 0 }, opens: 0, state: undefined,
		});
	});

	test('creates a fresh native sidebar after closing an unrelated modal', async () => {
		const harness = setup();
		const original = harness.createUnrelatedModal();
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.Artifacts }, undefined);
		await timeout(0);
		assert.deepStrictEqual({ replaced: harness.modal() !== original, counts: harness.counts(), closes: harness.closes, errors: harness.errors }, {
			replaced: true, counts: { modalCount: 2, sidebarCount: 1 }, closes: [false], errors: [],
		});
	});

	test('restores the owning session when switching reviews is cancelled', async () => {
		const harness = setup();
		const other = makeSession(URI.parse('test:/other'));
		harness.sessions.set([harness.session, other], undefined);
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.Artifacts }, undefined);
		await timeout(0);
		harness.setCanClose(false);
		harness.activeSession.set(other, undefined);
		harness.review.set({ sessionResource: other.resource, section: SessionReviewSection.Artifacts }, undefined);
		await timeout(0);
		assert.deepStrictEqual({ owner: harness.review.get()?.sessionResource.toString(), active: harness.activeSession.get()?.resource.toString(), sidebars: harness.counts().sidebarCount }, {
			owner: harness.session.resource.toString(), active: harness.session.resource.toString(), sidebars: 1,
		});
	});

	test('native dismissal during an editor open does not retain or reopen the closed group', async () => {
		const harness = setup();
		const gate = new DeferredPromise<void>();
		harness.setOpenGate(gate);
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.Artifacts }, undefined);
		await timeout(0);
		await harness.modal()?.close();
		await gate.complete();
		await harness.controller.close();
		assert.deepStrictEqual({ state: harness.review.get(), modal: harness.modal(), selection: harness.controller.selection.get(), counts: harness.counts(), errors: harness.errors }, {
			state: undefined, modal: undefined, selection: undefined, counts: { modalCount: 1, sidebarCount: 1 }, errors: [],
		});
	});

	test('Back to Board closes a pending first editor without reopening review', async () => {
		const harness = setup();
		const gate = new DeferredPromise<void>();
		harness.setOpenGate(gate);
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.Artifacts }, undefined);
		await timeout(0);
		const closing = harness.controller.close();
		await gate.complete();
		await closing;
		assert.deepStrictEqual({ state: harness.review.get(), modal: harness.modal(), opens: harness.opens.length, closes: harness.closes }, {
			state: undefined, modal: undefined, opens: 1, closes: [false],
		});
	});

	test('leaving review preserves resource editors through the native merge option', async () => {
		const harness = setup();
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.Artifacts, resource: URI.file('/project/result.md') }, undefined);
		await timeout(0);
		const metadata = harness.opens[0].input;
		const file = harness.opens[1].input;
		harness.setCanClose(false);
		harness.review.set(undefined, undefined);
		await timeout(0);
		assert.deepStrictEqual({ modal: harness.modal(), closes: harness.closes, metadataDisposed: metadata.isDisposed(), fileDisposed: file.isDisposed() }, {
			modal: undefined, closes: [true], metadataDisposed: true, fileDisposed: false,
		});
	});

	test('an unavailable pull request shows an explicit empty state', async () => {
		const harness = setup();
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.PullRequest }, undefined);
		await timeout(0);
		const input = harness.opens[0].input;
		assert.ok(input instanceof SessionReviewEditorInput);
		assert.deepStrictEqual({ message: input.status.get(), commands: harness.commands }, { message: 'This session does not have a pull request.', commands: [] });
	});

	test('chooses among recorded pull requests and opens the selected one in the native modal', async () => {
		const artifacts: ISessionArtifact[] = [42, 43].map(number => ({ id: String(number), kind: SessionArtifactKind.PullRequest, label: `PR ${number}`, isArtifact: true, link: URI.parse(`https://github.com/example/repo/pull/${number}`) }));
		const harness = setup({ ...makeSession(URI.parse('test:/session')), artifacts: constObservable(artifacts) });
		harness.setPickerIndex(1);
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.PullRequest }, undefined);
		await timeout(0);
		assert.deepStrictEqual({ command: harness.commands[0].id, group: harness.commands[0].args[2], selected: harness.controller.selection.get()?.resource.toString(), section: harness.controller.section.get() }, {
			command: OPEN_PULL_REQUEST_REVIEW_ACTION_ID, group: MODAL_GROUP, selected: 'https://github.com/example/repo/pull/43', section: SessionReviewSection.PullRequest,
		});
	});

	test('discussing a file captures a reference for the owning chat', async () => {
		const harness = setup();
		const resource = URI.file('/project/result.md');
		harness.review.set({ sessionResource: harness.session.resource, section: SessionReviewSection.Artifacts, resource }, undefined);
		await timeout(0);
		harness.controller.discuss();
		assert.deepStrictEqual(harness.references, [{ resource: harness.session.activeChat.get().resource, entries: [toFileVariableEntry(resource)] }]);
	});

	test('sending keeps the captured chat and attachments while trust is pending', async () => {
		const harness = setup();
		const trust = new DeferredPromise<boolean>();
		harness.setTrust(trust.p);
		const chat = harness.session.activeChat.get();
		const file = toFileVariableEntry(URI.file('/project/first.md'));
		const attachments = [file];
		const sent = harness.controller.send(harness.session, chat, 'Check this', attachments);
		attachments.push(toFileVariableEntry(URI.file('/project/later.md')));
		harness.activeSession.set(makeSession(URI.parse('test:/other')), undefined);
		await trust.complete(true);
		await sent;
		assert.deepStrictEqual(harness.replies, [{ chat, query: 'Check this', attachments: [file] }]);
	});

	test('two surfaces cannot queue duplicate replies during the same trust check', async () => {
		const harness = setup();
		const trust = new DeferredPromise<boolean>();
		harness.setTrust(trust.p);
		const chat = harness.session.activeChat.get();
		const first = harness.controller.send(harness.session, chat, 'First', []);
		await assert.rejects(harness.controller.send(harness.session, chat, 'Second', []), /already being prepared/);
		await trust.complete(true);
		await first;
		assert.strictEqual(harness.replies.length, 1);
	});

	test('rechecks the AI gate after trust resolves', async () => {
		const harness = setup();
		const trust = new DeferredPromise<boolean>();
		harness.setTrust(trust.p);
		const sent = harness.controller.send(harness.session, harness.session.activeChat.get(), 'Reply', []);
		harness.setHidden(true);
		await trust.complete(true);
		await assert.rejects(sent, /not available for replies/);
		assert.deepStrictEqual(harness.replies, []);
	});
});
