/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationHandle, INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatAcceptInputOptions, IChatWidget, IChatWidgetViewModelChangeEvent } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatInputPart, IChatPetHorizontalPlatformProvider } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { IChatResponseFileChangesService } from '../../../../../workbench/contrib/chat/browser/chatResponseFileChangesService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatMode } from '../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { emptySessionEntryDiff, IEditSessionEntryDiff } from '../../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { ChatModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { ChatAgentService, IChatAgentService } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { MockChatService } from '../../../../../workbench/contrib/chat/test/common/chatService/mockChatService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { hasAppFileChanges, SessionTestAppButton } from '../../browser/sessionTestAppButton.js';

suite('SessionTestAppButton', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const diff = (path: string): IEditSessionEntryDiff => ({
		...emptySessionEntryDiff(URI.file(path), URI.file(path)), identical: false, added: 1,
	});
	const workspaceFor = (...directories: URI[]): ISessionWorkspace => upcastPartial<ISessionWorkspace>({
		folders: directories.map(directory => ({ root: directory, workingDirectory: directory, name: 'app', description: undefined })),
	});

	function setup(workingDirectory = URI.file('/app'), options: { storageService?: IStorageService; sessionResource?: URI } = {}) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatAgentService, store.add(instantiationService.createInstance(ChatAgentService)));
		const storageService = options.storageService ?? store.add(new InMemoryStorageService());
		const readOnly = observableValue('readOnly', false);
		const model = store.add(instantiationService.createInstance(ChatModel, undefined, {
			initialLocation: ChatAgentLocation.Chat, canUseTools: true, resource: options.sessionResource, isReadOnly: readOnly,
		}));
		const workspace = observableValue<ISessionWorkspace | undefined>('workspace', workspaceFor(workingDirectory));
		const session = observableValue<ISession | undefined>('session', upcastPartial<ISession>({ workspace }));
		const changes = observableValue<readonly IEditSessionEntryDiff[]>('changes', []);
		const interactive = observableValue('interactive', true);
		const mode = observableValue<IChatMode>('mode', upcastPartial<IChatMode>({ kind: ChatModeKind.Agent }));
		const sentiment = observableValue('sentiment', { hidden: false });
		const viewChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const errors: unknown[] = [];
		const warnings: unknown[][] = [];
		const requests: { prompt: string | undefined; options: IChatAcceptInputOptions | undefined }[] = [];
		const files = new Map<string, string | Error>();
		const reads: URI[] = [];
		let readFile = async (uri: URI): Promise<string> => {
			const content = files.get(uri.path);
			if (content instanceof Error) {
				throw content;
			}
			if (content === undefined) {
				throw new FileOperationError('Not found', FileOperationResult.FILE_NOT_FOUND);
			}
			return content;
		};
		const input = $('input');
		let viewModel: IChatViewModel | undefined = upcastPartial<IChatViewModel>({ model });
		const setModel = (value: ChatModel | undefined) => {
			const previousSessionResource = viewModel?.model.sessionResource;
			viewModel = value ? upcastPartial<IChatViewModel>({ model: value }) : undefined;
			viewChanged.fire({ previousSessionResource, currentSessionResource: value?.sessionResource });
		};
		let send = async (options: IChatAcceptInputOptions | undefined): Promise<IChatResponseModel | undefined> => {
			options?.onRequestAccepted?.();
			return model.lastRequest?.response;
		};
		const widget = upcastPartial<IChatWidget>({
			onDidChangeViewModel: viewChanged.event,
			get viewModel() { return viewModel; },
			input: upcastPartial<ChatInputPart>({ currentModeObs: mode }),
			focusInput: () => input.focus(),
			acceptInput: async (prompt, options) => { requests.push({ prompt, options }); return send(options); },
		});
		const button = store.add(new SessionTestAppButton(widget, interactive, session,
			upcastPartial<IChatResponseFileChangesService>({ getChangesForRequest: () => changes }),
			upcastPartial<IChatEntitlementService>({ sentimentObs: sentiment }),
			upcastPartial<INotificationService>({ error: error => { errors.push(error); return upcastPartial<INotificationHandle>({}); } }),
			upcastPartial<IFileService>({
				readFile: async uri => {
					reads.push(uri);
					return upcastPartial<IFileContent>({ value: VSBuffer.fromString(await readFile(uri)) });
				}
			}),
			upcastPartial<ILogService>({ warn: (...args) => warnings.push(args) }),
			storageService,
		));
		const container = $('div', undefined, button.element, input);
		store.add(toDisposable(() => container.remove()));
		document.body.appendChild(container);
		const request = model.addRequest({ text: 'Implement the app', parts: [] }, { variables: [] }, 0);
		const primary = button.element.querySelector<HTMLElement>('.monaco-text-button')!;
		return {
			model, request, changes, interactive, mode, sentiment, button, errors, requests, files, reads, warnings, input, primary, container,
			storageService, readOnly, setModel, workspace, session,
			setSend: (value: typeof send) => send = value,
			setReadFile: (value: typeof readFile) => readFile = value,
			clearViewModel: () => setModel(undefined),
		};
	}

	test('detects app UI changes without tool signals or a file-count threshold', () => {
		const paths = ['/app/index.html', '/app/App.tsx', '/app/App.vue', '/app/style.css', '/app/ContentView.swift', '/app/MainWindow.xaml', '/app/chatWidget.ts',
			'/app/script.py', '/app/lib.ts', '/app/docs/index.html', '/app/tests/App.tsx', '/app/App.spec.tsx'];
		assert.deepStrictEqual(paths.map(path => hasAppFileChanges([diff(path)], [URI.file('/app')])), [
			true, true, true, true, true, true, true, false, false, false, false, false,
		]);
		assert.deepStrictEqual([
			hasAppFileChanges([{ ...diff('/app/index.html'), identical: true }]),
			hasAppFileChanges([{ ...diff('/app/index.html'), isDeleted: true }]),
			hasAppFileChanges([]),
		], [false, true, false]);
		assert.deepStrictEqual([
			hasAppFileChanges([diff('/home/test/styles.css')], [URI.file('/home/test')]),
			hasAppFileChanges([diff('/home/test/tests/App.tsx')], [URI.file('/home/test')]),
			hasAppFileChanges([diff('/outside/docs/index.html')], [URI.file('/app')]),
			hasAppFileChanges([diff('/outside/tests/App.tsx')], [URI.file('/app')]),
		], [true, false, false, false]);
	});

	test('includes deleted UI changes while retaining path exclusions', async () => {
		const { request, changes, button } = setup();
		request.response!.complete();
		const paths = ['/app/index.html', '/app/components/Button.tsx', '/app/styles.css', '/app/docs/index.html', '/app/tests/Button.tsx', '/app/script.py', '/outside/index.html'];
		const states = [];
		for (const path of paths) {
			changes.set([{ ...diff(path), isDeleted: true }], undefined);
			await timeout(0);
			states.push(button.visible.get());
		}
		assert.deepStrictEqual(states, [true, true, true, false, false, false, false]);
	});

	test('preserves directory exclusions without workspace metadata and skips known outside files', () => {
		const directories = [URI.file('/app'), URI.file('/second')];
		const paths = ['/app/src/App.tsx', '/app/tests/App.tsx', '/app/__tests__/App.tsx', '/app/docs/index.html', '/app/fixtures/view.html', '/outside/index.html', '/second/src/App.tsx'];
		assert.deepStrictEqual({
			unknownWorkspace: paths.map(path => hasAppFileChanges([diff(path)])),
			knownWorkspace: paths.map(path => hasAppFileChanges([diff(path)], directories)),
		}, {
			unknownWorkspace: [true, false, false, false, false, true, true],
			knownWorkspace: [true, false, false, false, false, false, true],
		});
	});

	test('classifies remote paths only within the matching host workspace', () => {
		const directory = toAgentHostUri(URI.file('/app'), 'host-a');
		const changes = [
			toAgentHostUri(URI.file('/app/src/App.tsx'), 'host-a'),
			toAgentHostUri(URI.file('/app/tests/App.tsx'), 'host-a'),
			toAgentHostUri(URI.file('/outside/index.html'), 'host-a'),
			toAgentHostUri(URI.file('/app/index.html'), 'host-b'),
			URI.file('/app/index.html'),
		];
		assert.deepStrictEqual(changes.map(uri => hasAppFileChanges([{ ...diff(uri.path), modifiedURI: uri }], [directory])), [
			true, false, false, false, false,
		]);
	});

	test('recognizes Android activities without widening other source-language hints', () => {
		const paths = ['/app/android/MainActivity.kt', '/app/android/MainActivity.java', '/app/android/mainactivity.KT', '/app/tests/MainActivity.kt', '/app/android/MainActivity.test.kt', '/app/activity.ts', '/app/activity.py'];
		assert.deepStrictEqual(paths.map(path => hasAppFileChanges([diff(path)], [URI.file('/app')])), [
			true, true, true, false, false, false, false,
		]);
	});

	test('exposes the visible button as a chat pet platform and reports state changes', async () => {
		const { request, changes, button, primary, input, container } = setup();
		const platformChanged = store.add(new Emitter<void>());
		const inputPart: ChatInputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			_chatPetHorizontalPlatformProviders: new Set<IChatPetHorizontalPlatformProvider>(),
			_onDidChangeChatPetHorizontalPlatforms: platformChanged,
			container,
			inputContainer: input,
			persistentContentContainer: button.element,
		});
		const registration = store.add(inputPart.registerChatPetHorizontalPlatformProvider(button.chatPetPlatform));
		const states = [button.chatPetPlatform.getElements().length];
		let notifications = 0;
		store.add(platformChanged.event(() => notifications++));
		changes.set([diff('/app/index.html')], undefined);
		request.response!.complete();
		states.push(button.chatPetPlatform.getElements().length);
		const bounds = primary.getBoundingClientRect();
		const platformTop = inputPart.getChatPetPlatformTop(bounds.left + bounds.width / 2);
		const raisedAboveInput = bounds.top < input.getBoundingClientRect().top;
		const shownNotification = notifications > 0;
		const beforeRetest = notifications;
		primary.click();
		await timeout(0);
		const retestNotification = notifications > beforeRetest;
		const label = primary.getAttribute('aria-label');
		const beforeHide = notifications;
		changes.set([], undefined);
		const hiddenNotification = notifications > beforeHide;
		states.push(button.chatPetPlatform.getElements().length);
		const fallbackTop = inputPart.getChatPetPlatformTop(bounds.left + bounds.width / 2);
		registration.dispose();
		button.dispose();
		states.push(button.chatPetPlatform.getElements().length);
		assert.deepStrictEqual({
			states, shownNotification, retestNotification, hiddenNotification, label, raisedAboveInput,
			buttonIsPlatform: platformTop === bounds.top,
			inputIsFallback: fallbackTop === input.getBoundingClientRect().top,
		}, {
			states: [0, 1, 0, 0], shownNotification: true, retestNotification: true, hiddenNotification: true, label: 'Retest App', raisedAboveInput: true,
			buttonIsPlatform: true, inputIsFallback: true,
		});
	});

	test('notifies chat pet hosts when the button is resized', async () => {
		const { request, changes, button, primary } = setup();
		changes.set([diff('/app/index.html')], undefined);
		request.response!.complete();
		const before = primary.getBoundingClientRect().width;
		const resizeStore = store.add(new DisposableStore());
		const resized = Event.toPromise(Event.filter(button.chatPetPlatform.onDidChange, () => primary.getBoundingClientRect().width !== before), resizeStore);
		primary.style.width = `${before + 40}px`;
		await resized;
		assert.strictEqual(primary.getBoundingClientRect().width > before, true);
	});

	test('tracks completion, async file changes, permissions, mode and the next request', () => {
		const { request, model, button, changes, interactive, mode, sentiment } = setup();
		const visible = () => !button.element.hidden;
		const states = [visible()];
		request.response!.complete();
		states.push(visible());
		changes.set([diff('/app/index.html')], undefined);
		states.push(visible());
		interactive.set(false, undefined);
		states.push(visible());
		interactive.set(true, undefined);
		mode.set(upcastPartial<IChatMode>({ kind: ChatModeKind.Ask }), undefined);
		states.push(visible());
		mode.set(upcastPartial<IChatMode>({ kind: ChatModeKind.Agent }), undefined);
		sentiment.set({ hidden: true }, undefined);
		states.push(visible());
		sentiment.set({ hidden: false }, undefined);
		states.push(visible());
		model.addRequest({ text: 'Next request', parts: [] }, { variables: [] }, 0);
		states.push(visible());
		assert.deepStrictEqual(states, [false, false, true, false, false, false, true, false]);
	});

	test('detects UI projects for ordinary source files without scanning the workspace', async () => {
		const cases = [
			{ path: 'main.ts', file: 'package.json', content: '{"dependencies":{"react-native":"0.81"}}', visible: true },
			{ path: 'main.js', file: 'package.json', content: '{"devDependencies":{"electron":"38"}}', visible: true },
			{ path: 'main.ts', file: 'package.json', content: '{"dependencies":{"express":"5"}}', visible: false },
			{ path: 'main.ts', file: 'package.json', content: '{"dependencies":{"react":false}}', visible: false },
			{ path: 'lib/main.dart', file: 'pubspec.yaml', content: 'dependencies:\n  flutter:\n    sdk: flutter\n', visible: true },
			{ path: 'lib/main.dart', file: 'pubspec.yaml', content: 'dependencies: {flutter: {sdk: "flutter"}}', visible: true },
			{ path: 'bin/main.dart', file: 'pubspec.yaml', content: 'dependencies:\n  args: ^2.0.0\n', visible: false },
			{ path: 'bin/main.dart', file: 'pubspec.yaml', content: 'description: |\n  flutter:\n    sdk: flutter\n', visible: false },
		];
		const actual = [];
		for (const entry of cases) {
			const { model, request, changes, button, files, reads, warnings } = setup(URI.parse('vscode-remote://host/app'));
			files.set(`/app/${entry.file}`, entry.content);
			changes.set([{ ...diff(`/app/${entry.path}`), modifiedURI: URI.parse(`vscode-remote://host/app/${entry.path}`) }], undefined);
			request.response!.complete();
			await timeout(0);
			actual.push({ path: entry.path, visible: button.visible.get(), reads: reads.map(uri => uri.toString()), warnings: warnings.length });
			model.dispose();
			button.dispose();
		}
		assert.deepStrictEqual(actual, cases.map(entry => ({
			path: entry.path, visible: entry.visible, reads: [`vscode-remote://host/app/${entry.file}`], warnings: 0,
		})));
	});

	test('uses the session workspace for project hints and directory exclusions', async () => {
		const directories = [
			URI.file('/worktrees/test'),
			URI.parse('vscode-remote://host/worktrees/test'),
			toAgentHostUri(URI.file('/worktrees/test'), 'test-host'),
		];
		for (const directory of directories) {
			const { model, request, changes, button, files, reads, workspace } = setup(directory);
			workspace.set(upcastPartial<ISessionWorkspace>({
				folders: [{ root: URI.file('/source'), workingDirectory: directory, name: 'app', description: undefined }],
			}), undefined);
			files.set('/worktrees/test/package.json', '{"dependencies":{"react-native":"0.81"}}');
			request.response!.complete();
			const actual = [];
			for (const path of ['main.ts', 'docs/index.html', '__tests__/App.tsx', 'fixtures/App.tsx', 'src/App.tsx']) {
				const uri = joinPath(directory, path);
				changes.set([{ ...diff(uri.path), modifiedURI: uri }], undefined);
				await timeout(0);
				actual.push({ path, visible: button.visible.get(), reads: reads.splice(0).map(uri => uri.toString()) });
			}
			assert.deepStrictEqual({ modelWorkingDirectory: model.workingDirectory, actual }, {
				modelWorkingDirectory: undefined,
				actual: [
					{ path: 'main.ts', visible: true, reads: [joinPath(directory, 'package.json').toString()] },
					{ path: 'docs/index.html', visible: false, reads: [] },
					{ path: '__tests__/App.tsx', visible: false, reads: [] },
					{ path: 'fixtures/App.tsx', visible: false, reads: [] },
					{ path: 'src/App.tsx', visible: true, reads: [] },
				],
			});
		}
	});

	test('reevaluates project hints when the owning session workspace becomes available', async () => {
		const { request, changes, button, files, reads, workspace, session } = setup();
		workspace.set(undefined, undefined);
		files.set('/app/package.json', '{"dependencies":{"react":"19"}}');
		changes.set([diff('/app/main.ts')], undefined);
		request.response!.complete();
		await timeout(0);
		const states = [{ visible: button.visible.get(), reads: reads.length }];
		workspace.set(workspaceFor(URI.file('/app')), undefined);
		await timeout(0);
		states.push({ visible: button.visible.get(), reads: reads.length });
		session.set(upcastPartial<ISession>({
			workspace: observableValue('otherWorkspace', workspaceFor(URI.file('/other'))),
		}), undefined);
		await timeout(0);
		states.push({ visible: button.visible.get(), reads: reads.length });
		assert.deepStrictEqual(states, [
			{ visible: false, reads: 0 },
			{ visible: true, reads: 1 },
			{ visible: false, reads: 1 },
		]);
	});

	test('recognizes source changes in an additional session workspace folder', async () => {
		const { request, changes, button, files, reads, workspace } = setup();
		workspace.set(workspaceFor(URI.file('/app'), URI.file('/second')), undefined);
		files.set('/app/package.json', '{"dependencies":{"express":"5"}}');
		files.set('/second/pubspec.yaml', 'dependencies:\n  flutter:\n    sdk: flutter\n');
		changes.set([diff('/second/lib/main.dart')], undefined);
		request.response!.complete();
		await timeout(0);
		assert.deepStrictEqual({ visible: button.visible.get(), reads: reads.map(uri => uri.path) }, {
			visible: true, reads: ['/second/pubspec.yaml'],
		});
	});

	test('skips configuration reads for UI fast paths, excluded files, outside files and busy chats', async () => {
		const { request, changes, button, files, reads } = setup();
		files.set('/app/package.json', '{"dependencies":{"react":"19"}}');
		changes.set([diff('/app/main.ts')], undefined);
		await timeout(0);
		const states = [button.visible.get()];
		changes.set([diff('/app/index.html')], undefined);
		request.response!.complete();
		states.push(button.visible.get());
		for (const path of ['/app/README.md', '/app/tests/main.ts', '/app/main.spec.ts', '/app/docs/main.ts', '/outside/main.ts', '/outside/index.html', '/app/script.py']) {
			changes.set([diff(path)], undefined);
			await timeout(0);
			states.push(button.visible.get());
		}
		assert.deepStrictEqual({ states, reads }, { states: [false, true, false, false, false, false, false, false, false], reads: [] });
	});

	test('logs invalid or unreadable manifests but treats missing manifests as a negative hint', async () => {
		const { request, changes, button, files, warnings } = setup();
		request.response!.complete();
		const actual = [];
		for (const content of [undefined, '{', 'null', new Error('Permission denied')]) {
			files.clear();
			if (content !== undefined) {
				files.set('/app/package.json', content);
			}
			changes.set([diff('/app/main.ts')], undefined);
			await timeout(0);
			actual.push({ visible: button.visible.get(), warnings: warnings.length });
		}
		files.set('/app/pubspec.yaml', 'dependencies: [flutter');
		changes.set([diff('/app/main.dart')], undefined);
		await timeout(0);
		actual.push({ visible: button.visible.get(), warnings: warnings.length });
		assert.deepStrictEqual(actual, [
			{ visible: false, warnings: 0 }, { visible: false, warnings: 1 },
			{ visible: false, warnings: 2 }, { visible: false, warnings: 3 }, { visible: false, warnings: 4 },
		]);
	});

	test('does not apply a pending project hint after the changes, turn, chat or workspace changes', async () => {
		for (const scenario of ['changes', 'turn', 'chat', 'workspace', 'session', 'dispose']) {
			const { request, changes, button, setReadFile, model, clearViewModel, workspace, session } = setup();
			const pending = new DeferredPromise<string>();
			setReadFile(() => pending.p);
			changes.set([diff('/app/main.ts')], undefined);
			request.response!.complete();
			if (scenario === 'changes') {
				changes.set([diff('/app/script.py')], undefined);
			} else if (scenario === 'turn') {
				model.addRequest({ text: 'Next request', parts: [] }, { variables: [] }, 0);
			} else if (scenario === 'chat') {
				clearViewModel();
			} else if (scenario === 'workspace') {
				workspace.set(workspaceFor(URI.file('/other')), undefined);
			} else if (scenario === 'session') {
				session.set(undefined, undefined);
			} else {
				button.dispose();
			}
			await pending.complete('{"dependencies":{"react":"19"}}');
			await timeout(0);
			assert.strictEqual(button.element.hidden, true, scenario);
		}
	});

	test('offers a single testing action with the same prompt before and after retesting', async () => {
		const { request, changes, requests, primary, button } = setup();
		changes.set([diff('/app/index.html')], undefined);
		request.response!.complete();
		const initialLabel = primary.getAttribute('aria-label');
		primary.click();
		await timeout(0);
		primary.click();
		await timeout(0);
		assert.deepStrictEqual({
			initialLabel,
			buttonCount: button.element.querySelectorAll('[role="button"]').length,
			dropdownCount: button.element.querySelectorAll('.monaco-dropdown-button').length,
			requestCount: requests.length,
			samePrompt: requests[0].prompt === requests[1].prompt,
			subagentPrompt: requests.some(request => request.prompt?.toLowerCase().includes('subagent')),
			diffFirst: requests.every(request => request.prompt?.includes('First review the original requirements')),
			nativeTarget: requests.every(request => request.prompt?.includes('A browser preview does not verify a native target')),
			preserved: requests.every(request => request.options?.preserveInput && request.options.enableImplicitContext === false),
			primaryLabel: primary.getAttribute('aria-label'),
		}, {
			initialLabel: 'Test App', buttonCount: 1, dropdownCount: 0, requestCount: 2,
			samePrompt: true, subagentPrompt: false, diffFirst: true, nativeTarget: true,
			preserved: true, primaryLabel: 'Retest App',
		});
	});

	test('shows Retest App after testing modifies the app', async () => {
		const { model, request, changes, button, primary, setSend } = setup();
		changes.set([diff('/app/index.html')], undefined);
		request.response!.complete();
		const state = () => ({
			visible: button.visible.get(), label: primary.textContent?.trim(), ariaLabel: primary.getAttribute('aria-label'),
		});
		const states = [state()];
		setSend(async options => {
			const testing = model.addRequest({ text: 'Test the app', parts: [] }, { variables: [] }, 0);
			changes.set([], undefined);
			options?.onRequestAccepted?.();
			return testing.response;
		});
		primary.click();
		await timeout(0);
		states.push(state());
		changes.set([diff('/app/style.css')], undefined);
		model.lastRequest!.response!.complete();
		states.push(state());
		model.addRequest({ text: 'Make another UI change', parts: [] }, { variables: [] }, 0).response!.complete();
		states.push(state());
		changes.set([], undefined);
		await timeout(0);
		states.push(state());
		assert.deepStrictEqual({
			states, playIcon: primary.querySelector('.codicon-play')?.getAttribute('aria-hidden'),
		}, {
			states: [
				{ visible: true, label: 'Test App', ariaLabel: 'Test App' },
				{ visible: false, label: 'Retest App', ariaLabel: 'Retest App' },
				{ visible: true, label: 'Retest App', ariaLabel: 'Retest App' },
				{ visible: true, label: 'Retest App', ariaLabel: 'Retest App' },
				{ visible: false, label: 'Retest App', ariaLabel: 'Retest App' },
			],
			playIcon: 'true',
		});
	});

	test('keeps Retest App subject to the existing chat gates', async () => {
		const { model, request, changes, button, primary, interactive, readOnly, mode, sentiment } = setup();
		changes.set([diff('/app/index.html')], undefined);
		request.response!.complete();
		primary.click();
		await timeout(0);
		const states = [button.visible.get()];
		for (const gate of [interactive, readOnly]) {
			const initial = gate.get();
			gate.set(!initial, undefined);
			states.push(button.visible.get());
			gate.set(initial, undefined);
		}
		mode.set(upcastPartial<IChatMode>({ kind: ChatModeKind.Ask }), undefined);
		states.push(button.visible.get());
		mode.set(upcastPartial<IChatMode>({ kind: ChatModeKind.Agent }), undefined);
		sentiment.set({ hidden: true }, undefined);
		states.push(button.visible.get());
		sentiment.set({ hidden: false }, undefined);
		states.push(button.visible.get());
		model.addRequest({ text: 'Next request', parts: [] }, { variables: [] }, 0);
		states.push(button.visible.get());
		assert.deepStrictEqual({ states, label: primary.getAttribute('aria-label') }, {
			states: [true, false, false, false, false, true, false], label: 'Retest App',
		});
	});

	test('shares testing history between views and restores it only for the same chat', async () => {
		const first = setup();
		const mirror = setup(undefined, { storageService: first.storageService, sessionResource: first.model.sessionResource });
		first.changes.set([diff('/app/index.html')], undefined);
		first.request.response!.complete();
		first.primary.click();
		await timeout(0);
		const mirroredLabel = mirror.primary.getAttribute('aria-label');
		const saved = first.storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE).map(key => ({
			key, value: first.storageService.getBoolean(key, StorageScope.PROFILE), scope: StorageScope.PROFILE, target: StorageTarget.MACHINE,
		}));
		first.button.dispose();
		mirror.button.dispose();
		const restoredStorage = store.add(new InMemoryStorageService());
		restoredStorage.storeAll(saved, false);
		const restored = setup(undefined, { storageService: restoredStorage, sessionResource: first.model.sessionResource });
		const other = setup(undefined, { storageService: restoredStorage });
		for (const view of [restored, other]) {
			view.changes.set([diff('/app/index.html')], undefined);
			view.request.response!.complete();
		}
		restored.setModel(other.model);
		const switchedLabel = restored.primary.getAttribute('aria-label');
		restored.setModel(restored.model);
		assert.deepStrictEqual({
			mirroredLabel, savedValues: saved.map(entry => entry.value), switchedLabel,
			restoredLabel: restored.primary.getAttribute('aria-label'), otherLabel: other.primary.getAttribute('aria-label'),
		}, {
			mirroredLabel: 'Retest App', savedValues: [true], switchedLabel: 'Test App',
			restoredLabel: 'Retest App', otherLabel: 'Test App',
		});
	});

	test('does not remember rejected or failed-to-start testing requests', async () => {
		const { request, changes, primary, errors, storageService, setSend } = setup();
		changes.set([diff('/app/index.html')], undefined);
		request.response!.complete();
		const labels = [];
		setSend(async () => undefined);
		primary.click();
		await timeout(0);
		labels.push(primary.getAttribute('aria-label'));
		setSend(async () => { throw new Error('Cannot submit'); });
		primary.click();
		await timeout(0);
		labels.push(primary.getAttribute('aria-label'));
		assert.deepStrictEqual({
			labels, saved: storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE), errors: errors.map(String),
		}, {
			labels: ['Test App', 'Test App'], saved: [],
			errors: ['The app test request could not be started.', 'Error: Cannot submit'],
		});
	});

	test('records acceptance for the originating chat after switching chats or disposing the view', async () => {
		for (const dispose of [false, true]) {
			const first = setup();
			const other = setup(undefined, { storageService: first.storageService });
			first.changes.set([diff('/app/index.html')], undefined);
			first.request.response!.complete();
			const pending = new DeferredPromise<IChatResponseModel | undefined>();
			first.setSend(() => pending.p);
			first.primary.click();
			if (dispose) {
				first.button.dispose();
			} else {
				first.setModel(other.model);
			}
			first.requests[0].options?.onRequestAccepted?.();
			await pending.complete(first.request.response);
			await timeout(0);
			const restored = setup(undefined, { storageService: first.storageService, sessionResource: first.model.sessionResource });
			assert.deepStrictEqual({
				currentLabel: first.primary.getAttribute('aria-label'),
				otherLabel: other.primary.getAttribute('aria-label'),
				restoredLabel: restored.primary.getAttribute('aria-label'),
				expectedSessionResource: first.requests[0].options?.expectedSessionResource,
			}, {
				currentLabel: 'Test App', otherLabel: 'Test App', restoredLabel: 'Retest App',
				expectedSessionResource: first.model.sessionResource,
			});
		}
	});

	test('keeps accepted testing history after a later error or cancellation', async () => {
		for (const cancel of [false, true]) {
			const { model, request, changes, button, primary, setSend } = setup();
			changes.set([diff('/app/index.html')], undefined);
			request.response!.complete();
			setSend(async options => {
				const testing = model.addRequest({ text: 'Test the app', parts: [] }, { variables: [] }, 0);
				options?.onRequestAccepted?.();
				return testing.response;
			});
			primary.click();
			await timeout(0);
			if (cancel) {
				model.lastRequest!.response!.cancel();
			} else {
				model.lastRequest!.response!.setResult({ errorDetails: { message: 'Testing failed' } });
				model.lastRequest!.response!.complete();
			}
			const hiddenAfterFailure = !button.visible.get();
			model.addRequest({ text: 'Fix the UI', parts: [] }, { variables: [] }, 0).response!.complete();
			assert.deepStrictEqual({
				hiddenAfterFailure, visibleAfterEdit: button.visible.get(), label: primary.getAttribute('aria-label'),
			}, { hiddenAfterFailure: true, visibleAfterEdit: true, label: 'Retest App' });
		}
	});

	test('rejects hidden activation and restores focus when the button disappears', () => {
		const { request, changes, button, primary, input, requests } = setup();
		changes.set([diff('/app/index.html')], undefined);
		request.response!.complete();
		const focusAccepted = button.focus();
		const focused = document.activeElement === primary;
		changes.set([], undefined);
		const hiddenFocusAccepted = button.focus();
		primary.click();
		assert.deepStrictEqual({
			focusAccepted, focused, hiddenFocusAccepted, restoredFocus: document.activeElement === input, hidden: button.element.hidden, requests,
		}, { focusAccepted: true, focused: true, hiddenFocusAccepted: false, restoredFocus: true, hidden: true, requests: [] });
	});

	test('does not submit after disposal', () => {
		const { request, changes, button, requests, primary } = setup();
		changes.set([diff('/app/index.html')], undefined);
		request.response!.complete();
		button.dispose();
		primary.click();
		assert.deepStrictEqual(requests, []);
	});

	test('submits once to the owning widget, preserves the draft and reports failures', async () => {
		const { request, button, changes, requests, errors, setSend } = setup();
		request.response!.complete();
		changes.set([diff('/app/index.html')], undefined);
		const pending = new DeferredPromise<IChatResponseModel | undefined>();
		setSend(options => {
			options?.onRequestAccepted?.();
			return pending.p;
		});
		const control = button.element.querySelector<HTMLElement>('[role="button"]')!;
		control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		control.click();
		await pending.complete(request.response);
		await timeout(0);
		assert.deepStrictEqual({
			count: requests.length,
			options: { preserveInput: requests[0].options?.preserveInput, enableImplicitContext: requests[0].options?.enableImplicitContext },
			expectedSessionResource: requests[0].options?.expectedSessionResource,
			fixAndRetest: requests[0].prompt?.includes('Fix issues you find, then rerun the affected UI flows'),
			blue: control.style.backgroundColor,
			playIcon: !!control.querySelector('.codicon-play[aria-hidden="true"]'),
			errors,
		}, {
			count: 1, options: { preserveInput: true, enableImplicitContext: false }, fixAndRetest: true,
			expectedSessionResource: request.response!.session.sessionResource,
			blue: 'var(--vscode-button-background)', playIcon: true, errors: [],
		});
		setSend(async () => { throw new Error('Cannot submit'); });
		control.click();
		await timeout(0);
		assert.deepStrictEqual({ errors: errors.map(String), canRetry: button.visible.get() }, { errors: ['Error: Cannot submit'], canRetry: true });
		setSend(async () => undefined);
		control.click();
		await timeout(0);
		assert.deepStrictEqual({ lastError: errors.at(-1), canRetry: button.visible.get() }, { lastError: 'The app test request could not be started.', canRetry: true });
	});

	test('does not offer a test for failed or cancelled responses', () => {
		const { request, changes, button } = setup();
		changes.set([diff('/app/index.html')], undefined);
		request.response!.setResult({ errorDetails: { message: 'Failed' } });
		request.response!.complete();
		assert.strictEqual(button.visible.get(), false);
		request.response!.cancel();
		assert.strictEqual(button.visible.get(), false);
	});
});
