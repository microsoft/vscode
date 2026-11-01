/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IChatExternalEdit } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { AbstractChatView, IChatViewOptions } from '../../../../browser/parts/chatView.js';
import { IMobileDiffViewData, MOBILE_OPEN_DIFF_VIEW_COMMAND_ID } from '../../../../browser/parts/mobile/contributions/mobileDiffView.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsListPresentation, SessionNameKind } from '../../../../services/presentation/browser/sessionsListPresentation.js';
import { createListHarness, createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../../sessions/browser/views/sessionsList.js';
import { ChatViewFactory } from '../../../chat/browser/chatView.js';
import { MobileChatEditPresenter } from '../../browser/mobileChatEditPresenter.js';
import { MobileChatViewFactory } from '../../browser/mobileChatViewFactory.js';
import { MobileSessionsListPresentation } from '../../browser/mobileSessionsListPresentation.js';

suite('Mobile presentation composition', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	for (const mobile of [false, true]) {
		test(`all chat views receive entry-owned input options (${mobile})`, () => {
			const instantiationService = store.add(new TestInstantiationService());
			const createInstance = sinon.stub(instantiationService, 'createInstance').returns(upcastPartial<AbstractChatView>({}));
			const factory = mobile ? new MobileChatViewFactory(instantiationService) : new ChatViewFactory(instantiationService);
			assert.deepStrictEqual(factory.inputEditorOptions, mobile ? { fontSize: 16, lineHeight: 24 } : undefined);
			const options: IChatViewOptions = { renderChatPet: false };
			factory.createNewChatView(false, options);
			factory.createNewChatView(true, options);
			factory.createChatView(undefined, options);
			const passedOptions = createInstance.getCalls().map(call => call.args.at(-1) as IChatViewOptions);
			assert.deepStrictEqual(passedOptions.map(value => ({
				input: value.inputEditorOptions, icon: value.showEmptyStateIcon, header: typeof value.renderNewSessionHeader, pet: value.renderChatPet,
			})), Array.from({ length: 3 }, () => ({
				input: mobile ? { fontSize: 16, lineHeight: 24 } : undefined,
				icon: mobile ? false : undefined, header: mobile ? 'function' : 'undefined', pet: false,
			})));
		});
	}

	for (const kind of ['newGroup', 'group', 'session', 'chat'] satisfies SessionNameKind[]) {
		for (const value of [undefined, '  New name  ']) {
			test(`mobile ${kind} naming uses the prompt without inline fallback (${value})`, async () => {
				const result = new DeferredPromise<string | undefined>();
				const accepted: string[] = [];
				let inputOptions: IInputOptions | undefined;
				const quickInput = new class extends mock<IQuickInputService>() {
					override input(options: IInputOptions) { inputOptions = options; return result.p; }
				}();
				const presenter = new MobileSessionsListPresentation(store.add(new TestInstantiationService()), quickInput, new class extends mock<IAgentHostFilterService>() { }());
				const started = presenter.editName(kind, 'Original', () => assert.fail('Inline editor must not be constructed'), name => { accepted.push(name); });
				await result.complete(value);
				await timeout(0);
				assert.deepStrictEqual({ started, selectedValue: inputOptions?.value, selection: inputOptions?.valueSelection, accepted, sectionRowHeight: presenter.sectionRowHeight }, {
					started: true, selectedValue: 'Original', selection: [0, 8], accepted: value === undefined ? [] : ['New name'], sectionRowHeight: 44,
				});
			});
		}
	}

	for (const deleted of [false, true]) {
		test(`external edit opens the mobile overlay, including missing diff counts (${deleted})`, async () => {
			const calls: { id: string; data: IMobileDiffViewData }[] = [];
			const command = new class extends mock<ICommandService>() {
				override async executeCommand<T>(id: string, data: IMobileDiffViewData): Promise<T> {
					calls.push({ id, data });
					return undefined as T;
				}
			}();
			const presenter = new MobileChatEditPresenter(command, store.add(new TestInstantiationService()));
			const uri = URI.parse('test:/file.ts');
			const original = URI.parse('test:/original.ts');
			await presenter.openExternalEdit(upcastPartial<IChatExternalEdit>({ uri, beforeContentUri: original, editKind: deleted ? 'delete' : 'edit' }));
			assert.deepStrictEqual(calls, [{
				id: MOBILE_OPEN_DIFF_VIEW_COMMAND_ID,
				data: { diff: { originalURI: original, modifiedURI: deleted ? undefined : uri, identical: false, added: 0, removed: 0 } },
			}]);
		});
	}

	for (const disposeBeforeAcceptance of [false, true]) {
		test(`a prompted session rename remains list-owned and ignores a disposed list (${disposeBeforeAcceptance})`, async () => {
			const { session } = createTestSession('Original');
			const prompt = new DeferredPromise<string | undefined>();
			const harness = createListHarness(store, [session], instantiationService => {
				const quickInput = new class extends mock<IQuickInputService>() {
					override input() { return prompt.p; }
				}();
				instantiationService.stub(ISessionsListPresentation, new MobileSessionsListPresentation(instantiationService, quickInput, new class extends mock<IAgentHostFilterService>() { }()));
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace, sorting: () => SessionsSorting.Created, onSessionOpen: () => { }, sectionRowHeight: 44,
			}));
			list.layout(390, 600);
			const started = list.beginRenameSession(session);
			const inlineInput = container.querySelector('.session-title-input input');
			if (disposeBeforeAcceptance) {
				list.dispose();
			}
			await prompt.complete('Renamed');
			await timeout(0);
			assert.deepStrictEqual({ started, inlineInput: !!inlineInput, renamed: harness.managementService.renamed.map(change => change.title) }, {
				started: true, inlineInput: false, renamed: disposeBeforeAcceptance ? [] : ['Renamed'],
			});
		});
	}
});
