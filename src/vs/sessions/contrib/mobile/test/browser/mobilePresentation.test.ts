/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IChatExternalEdit } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ScreenshotContextValuePick } from '../../../../../workbench/contrib/chat/browser/actions/chatContext.js';
import { IChatWidget } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatWindowProvider } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ScreenshotToolSurface } from '../../../../../workbench/contrib/screenshotTool/browser/screenshotTool.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { AbstractChatView, IChatViewOptions } from '../../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { IMobileDiffViewData, MOBILE_OPEN_DIFF_VIEW_COMMAND_ID } from '../../../../browser/parts/mobile/contributions/mobileDiffView.js';
import { IAgentHostFilterService } from '../../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { ISessionsListPresentation, SessionNameKind } from '../../../../../workbench/contrib/sessions/browser/sessionsListPresentation.js';
import { createListHarness, createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { DefaultChatViewFactory } from '../../../../../workbench/contrib/sessions/browser/chat/defaultChatViewFactory.js';
import { IChatViewFactory } from '../../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { IWorktreeSuggestion } from '../../../../../workbench/contrib/sessions/browser/worktreeSuggestion/worktreeSuggestionService.js';
import { WorktreeSuggestionVariant } from '../../../../../workbench/contrib/sessions/common/worktreeSuggestion.js';
import { ISessionsChatBackgroundService } from '../../../../../workbench/contrib/sessions/browser/chatBackgroundService.js';
import { SessionsGridContent } from '../../../../../workbench/contrib/sessions/browser/parts/sessionsGridContent.js';
import { ISessionsPartContentHost } from '../../../../../workbench/browser/parts/sessions/sessionsPartContent.js';
import { MobileChatEditPresenter } from '../../browser/mobileChatEditPresenter.js';
import { MobileChatViewFactory } from '../../browser/mobileChatViewFactory.js';
import { MobileNullChatWindowService } from '../../browser/mobileNullChatWindowService.js';
import { MobileNullScreenshotToolService } from '../../browser/mobileNullScreenshotToolService.js';
import { MobileNullWorktreeSuggestionService } from '../../browser/mobileNullWorktreeSuggestionService.js';
import { MobileSessionsListPresentation } from '../../browser/mobileSessionsListPresentation.js';

suite('Mobile presentation composition', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('separate chat windows cannot be activated by mobile consumers', async () => {
		const windows = new MobileNullChatWindowService();
		await assert.rejects(windows.open(URI.parse('chat:/test')), /Separate chat windows are not available/);
		assert.throws(() => windows.registerProvider(upcastPartial<IChatWindowProvider>({})), /Separate chat windows are not available/);
	});

	test('desktop screenshot capture and markup cannot be activated by mobile consumers', async () => {
		const screenshots = new MobileNullScreenshotToolService();
		await assert.rejects(screenshots.capture(dom.getWindow(document.body)), /screenshot tool is not available/);
		await assert.rejects(screenshots.edit({
			original: { dataUrl: 'data:image/png;base64,', width: 1, height: 1 },
			annotationState: undefined,
		}, ScreenshotToolSurface.Chat), /screenshot tool is not available/);
	});

	test('chat screenshot attachments retain the existing browser capture path on mobile', async () => {
		let captures = 0;
		const host = new class extends mock<IHostService>() {
			override async getScreenshot() {
				captures++;
				return VSBuffer.fromString('screenshot');
			}
		}();
		const picker = new ScreenshotContextValuePick(host, new MobileNullScreenshotToolService());
		const attachment = await picker.asAttachment(upcastPartial<IChatWidget>({}));
		assert.deepStrictEqual({ captures, kind: attachment?.kind }, { captures: 1, kind: 'image' });
	});

	test('unsupported worktree suggestions report failure instead of claiming to switch isolation', async () => {
		const errors: string[] = [];
		const suggestions = new MobileNullWorktreeSuggestionService(upcastPartial<ConstructorParameters<typeof MobileNullWorktreeSuggestionService>[0]>({
			error: message => errors.push(String(message)),
		}));
		const switched = await suggestions.useWorktree(WorktreeSuggestionVariant.SpotlightOnSend, upcastPartial<IWorktreeSuggestion>({}));
		assert.deepStrictEqual({ switched, errors }, {
			switched: false,
			errors: ['Worktree suggestions are not available on this device.'],
		});
	});

	test('new-session headers retain the instantiation scope of their own view', () => {
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const factory = new MobileChatViewFactory();
		const views = [false, true].map(isNewChatInSession => {
			const scope = store.add(new TestInstantiationService());
			const createInstance = sinon.stub(scope, 'createInstance');
			createInstance.onFirstCall().returns(upcastPartial<AbstractChatView>({}));
			createInstance.onSecondCall().returns(upcastPartial<MenuWorkbenchToolBar>({
				getItemsLength: () => 1,
				onDidChangeMenuItems: Event.None,
				dispose: () => { },
			}));
			factory.createNewChatView(isNewChatInSession, {}, scope);
			const options = createInstance.firstCall.args.at(-1) as IChatViewOptions;
			return { createInstance, options };
		});
		for (const { options } of views) {
			const before = dom.append(container, dom.$('div'));
			store.add(options.renderNewSessionHeader!(container, before));
		}
		assert.deepStrictEqual(views.map(({ createInstance }) => ({
			calls: createInstance.callCount,
			headerConstructor: createInstance.secondCall.args[0],
		})), views.map(() => ({ calls: 2, headerConstructor: MenuWorkbenchToolBar })));
	});

	for (const mobile of [false, true]) {
		test(`all chat views receive entry-owned input options (${mobile})`, () => {
			const instantiationService = store.add(new TestInstantiationService());
			const createInstance = sinon.stub(instantiationService, 'createInstance').returns(upcastPartial<AbstractChatView>({}));
			const factory: IChatViewFactory = mobile ? new MobileChatViewFactory() : new DefaultChatViewFactory(upcastPartial<ISessionsChatBackgroundService>({
				onDidChangeBackground: Event.None,
				getBackground: () => ({ kind: 'codicons' }),
			}));
			assert.deepStrictEqual(factory.inputEditorOptions, mobile ? { fontSize: 16, lineHeight: 24 } : undefined);
			const options: IChatViewOptions = { renderChatPet: false };
			factory.createNewChatView(false, options, instantiationService);
			factory.createNewChatView(true, options, instantiationService);
			factory.createChatView(instantiationService, options);
			const passedOptions = createInstance.getCalls().map(call => call.args.at(-1) as IChatViewOptions);
			assert.deepStrictEqual(passedOptions.map(value => ({
				input: value.inputEditorOptions, icon: value.showEmptyStateIcon, header: typeof value.renderNewSessionHeader, pet: value.renderChatPet,
				background: value.background?.hasBackground() ?? false,
			})), Array.from({ length: 3 }, (_, index) => ({
				input: mobile ? { fontSize: 16, lineHeight: 24 } : undefined,
				icon: mobile ? false : undefined, header: mobile && index < 2 ? 'function' : 'undefined', pet: false,
				background: !mobile,
			})));
		});
	}

	test('mobile session grids create no background surface and require no background service', () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IChatViewFactory, new MobileChatViewFactory());
		const grid = store.add(instantiationService.createInstance(SessionsGridContent, upcastPartial<ISessionsPartContentHost>({})));
		const createInstance = sinon.spy(instantiationService, 'createInstance');
		const container = dom.$('div');
		grid.renderBackground(container);
		assert.deepStrictEqual({ content: container.innerHTML, classes: container.className, created: createInstance.callCount }, {
			content: '', classes: '', created: 0,
		});
	});

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
