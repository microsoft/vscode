/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyValue, IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IChatViewHostService } from '../../../../chat/browser/chatViewHost.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { EditorWindowChatPartService } from '../../../browser/agentsView/agentsChatPartContribution.js';
import { AgentsChatPartFrame, IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { AgentsChatViewHost } from '../../../browser/agentsView/agentsChatViewHost.js';
import { IEditorWindowSessionsPresenterService } from '../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { IEditorWindowSessionsRuntime } from '../../../browser/editorWindow/editorWindowSessionsRuntime.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { SessionChangesEditorInput } from '../../../../sessionChanges/browser/sessionChangesEditorInput.js';

/**
 * The instantiation service of the editor factory as the window's editors start, which the factory keeps for the editor
 * serializers registered later, also of other tests: shared, and never disposed, as editor tests have it.
 */
let editorFactoryServices: TestInstantiationService | undefined;
function editorFactoryInstantiationService(): TestInstantiationService {
	editorFactoryServices ??= new TestInstantiationService();
	return editorFactoryServices;
}

suite('EditorWindowChatPartService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** The service, as the window starts with the chat part shown or not, recording what it does. */
	function createService(state: { visible: boolean }, frame?: IAgentsChatPartFrame) {
		const events: string[] = [];
		const ownsNewChat: IObservable<boolean>[] = [];
		const layoutService = upcastPartial<IWorkbenchLayoutService>({
			setChatPartAnchor: anchor => events.push(`anchor ${anchor?.viewId}`),
			onDidChangePartVisibility: Event.None,
			isVisible: part => part === Parts.CHAT_PART && state.visible,
			setPartHidden: (hidden, part) => {
				if (part === Parts.CHAT_PART) {
					state.visible = !hidden;
					events.push(hidden ? 'hide' : 'show');
				}
			},
		});
		const contextKeyService = upcastPartial<IContextKeyService>({
			createKey: <T extends ContextKeyValue>() => upcastPartial<IContextKey<T>>({ set: () => { }, reset: () => { } }),
			contextMatchesRules: () => true,
		});
		const chatPart = upcastPartial<IAgentsChatPartService>({ restore: async () => { events.push('restore'); } });
		const instantiationService = upcastPartial<IInstantiationService>({
			createInstance: (ctor: unknown, ...args: unknown[]) => {
				if (ctor === AgentsChatViewHost) {
					ownsNewChat.push(args[0] as IObservable<boolean>);
					return upcastPartial<AgentsChatViewHost>({ deactivate: () => events.push('deactivate host') });
				}
				return toDisposable(() => { });
			},
			invokeFunction: <R, TS extends unknown[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R => fn(upcastPartial<ServicesAccessor>({ get: <T>(): T => chatPart as T }), ...args),
		});
		const service = disposables.add(new EditorWindowChatPartService(
			instantiationService,
			layoutService,
			contextKeyService,
			upcastPartial<ILifecycleService>({ when: () => Promise.resolve() }),
			upcastPartial<IChatViewHostService>({ registerHost: () => { events.push('register host'); return toDisposable(() => events.push('unregister host')); } }),
			upcastPartial<IEditorWindowSessionsPresenterService>({
				registerPresenter: () => { events.push('register presenter'); return toDisposable(() => events.push('unregister presenter')); },
				registerComposerHolder: () => { events.push('register composer holder'); return toDisposable(() => events.push('unregister composer holder')); },
			}),
			upcastPartial<IEditorWindowSessionsRuntime>({ enable: () => { events.push('hold providers'); return toDisposable(() => events.push('release providers')); } }),
			frame ?? upcastPartial<IAgentsChatPartFrame>({ get part() { events.push('create part'); return undefined!; }, contentCreated: constObservable(false) }),
		));
		return { service, events, ownsNewChat };
	}

	test('does nothing until a feature enables it; features share the chat part, which docks beside the anchor of the highest priority', async () => {
		const { service, events } = createService({ visible: false });
		const step = (label: string) => events.push(`-- ${label}`);

		step('nothing enabled');
		const list = service.enable({ anchorViewId: 'list', anchorPriority: 1, enabled: constObservable(true) });
		step('the list enables it');
		const view = service.enable({ anchorViewId: 'view', anchorPriority: 2, enabled: constObservable(true) });
		step('the view enables it');
		view.dispose();
		step('the view no longer does');
		list.dispose();
		await timeout(0);

		assert.deepStrictEqual(events, [
			'-- nothing enabled',
			'create part', 'hold providers', 'register composer holder', 'register host', 'register presenter', 'anchor list',
			'-- the list enables it',
			'anchor view',
			'-- the view enables it',
			'anchor list',
			'-- the view no longer does',
			'unregister host', 'deactivate host', 'unregister presenter', 'anchor undefined', 'release providers', 'unregister composer holder',
		]);
	});

	test('while chats do not open in it, it neither restores nor shows, and the Chat view keeps its chats, and until they first do, the window has only its empty part; once they do, it replaces the Chat view, and its composers hold the providers from then on', async () => {
		const enabled = observableValue('enabled', false);
		const { service, events } = createService({ visible: true });
		const step = (label: string) => events.push(`-- ${label}`);

		const registration = disposables.add(service.enable({ anchorViewId: 'chat', anchorPriority: 1, enabled }));
		// The window gets ready and restores
		await timeout(0);
		step('chats open in the chat part');
		enabled.set(true, undefined);
		step('they no longer do');
		enabled.set(false, undefined);
		registration.dispose();

		assert.deepStrictEqual(events, [
			'create part', 'anchor chat',
			'hide',
			'-- chats open in the chat part',
			'hold providers', 'register composer holder', 'register host', 'register presenter',
			'-- they no longer do',
			'unregister host', 'deactivate host', 'unregister presenter',
			'anchor undefined', 'release providers', 'unregister composer holder',
		]);
	});

	test('resolving it creates no part, also once its delayed frame is created, as at idle, after the workbench created its grid: enabling it does, as the window starts', async () => {
		const registered: string[] = [];
		const frameServices = disposables.add(new TestInstantiationService());
		frameServices.stub(IThemeService, new TestThemeService());
		frameServices.stub(IStorageService, disposables.add(new TestStorageService()));
		frameServices.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ registerPart: part => { registered.push(part.getId()); return toDisposable(() => { }); } }));
		const frame = disposables.add(frameServices.createInstance(AgentsChatPartFrame));
		const { service } = createService({ visible: false }, frame);
		const beforeEnable = registered.splice(0);

		const enabled = service.enable({ anchorViewId: 'view', anchorPriority: 1, enabled: constObservable(false) });
		const onEnable = registered.splice(0);
		enabled.dispose();
		await timeout(0);

		assert.deepStrictEqual({ beforeEnable, onEnable }, { beforeEnable: [], onEnable: [Parts.CHAT_PART] });
	});

	test('a feature that enables it twice with the same options keeps it until it disposes both', async () => {
		const { service, events } = createService({ visible: false });
		const options = { anchorViewId: 'list', anchorPriority: 1, enabled: constObservable(true) };

		const first = service.enable(options);
		const second = service.enable(options);
		first.dispose();
		const afterFirst = { enabled: service.enabled.get(), events: [...events] };
		second.dispose();
		await timeout(0);

		assert.deepStrictEqual({ afterFirst, afterBoth: service.enabled.get() }, {
			afterFirst: { enabled: true, events: ['create part', 'hold providers', 'register composer holder', 'register host', 'register presenter', 'anchor list', 'anchor list', 'anchor list'] },
			afterBoth: false,
		});
	});

	test('restores a Changes editor saved as the window closed also while chats do not open in it, and provisions the sessions of its changes as it does', async () => {
		const { service, events } = createService({ visible: false });
		disposables.add(service.enable({ anchorViewId: 'chat', anchorPriority: 1, enabled: constObservable(false) }));
		const beforeRestore = [...events];

		// The window restores a Changes editor that it saved, as its editors start
		const editorFactory = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);
		editorFactoryInstantiationService().invokeFunction(accessor => editorFactory.start(accessor));
		const serializer = editorFactory.getEditorSerializer(SessionChangesEditorInput.ID);
		const restored = serializer?.deserialize(upcastPartial<IInstantiationService>({ createInstance: () => upcastPartial<EditorInput>({}) }), JSON.stringify({ multiDiffSourceUri: 'session-changes:/session' }));

		assert.deepStrictEqual({ beforeRestore, restored: !!restored, afterRestore: events.slice(beforeRestore.length) }, {
			beforeRestore: ['create part', 'anchor chat'],
			restored: true,
			afterRestore: ['hold providers', 'register composer holder'],
		});
	});

	test('registers its actions only while chats open in it', async () => {
		const enabled = observableValue('enabled', false);
		const { service } = createService({ visible: false });
		const registered = () => !!CommandsRegistry.getCommand('workbench.action.agentsView.focusChatPart');

		const registration = service.enable({ anchorViewId: 'chat', anchorPriority: 1, enabled });
		const whileNot = registered();
		enabled.set(true, undefined);
		const whileEnabled = registered();
		registration.dispose();
		await timeout(0);

		assert.deepStrictEqual({ whileNot, whileEnabled, afterDispose: registered() }, { whileNot: false, whileEnabled: true, afterDispose: false });
	});

	test('takes New Chat of the Chat view while a feature that has chats open in it takes it, by default; not for a feature that leaves it to the Chat view', async () => {
		const { service, ownsNewChat } = createService({ visible: false });
		const listEnabled = observableValue('listEnabled', true);

		const plain = service.enable({ anchorViewId: 'chat', anchorPriority: 1, enabled: constObservable(true), ownsNewChat: false });
		const onlyPlain = ownsNewChat.at(-1)!.get();
		const viewlet = service.enable({ anchorViewId: 'list', anchorPriority: 2, enabled: listEnabled });
		const withViewlet = ownsNewChat.at(-1)!.get();
		listEnabled.set(false, undefined);
		const viewletOff = ownsNewChat.at(-1)!.get();
		viewlet.dispose();
		plain.dispose();
		await timeout(0);

		assert.deepStrictEqual({ onlyPlain, withViewlet, viewletOff }, { onlyPlain: false, withViewlet: true, viewletOff: false });
	});

	test('restores the chats it showed as the window last closed, while chats open in it', async () => {
		const { service, events } = createService({ visible: true });

		disposables.add(service.enable({ anchorViewId: 'list', anchorPriority: 1, enabled: constObservable(true) }));
		await timeout(0);

		assert.deepStrictEqual(events, ['create part', 'hold providers', 'register composer holder', 'register host', 'register presenter', 'anchor list', 'restore']);
	});
});
