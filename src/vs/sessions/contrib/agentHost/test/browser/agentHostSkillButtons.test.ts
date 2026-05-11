/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IChat } from '../../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID, IsAgentHostSession, IsAgentHostSessionContextContribution, isAgentHostSkillButtonId } from '../../browser/agentHostSkillButtons.js';
import { BaseAgentHostSessionsProvider } from '../../browser/baseAgentHostSessionsProvider.js';
// Importing this contribution registers the apply submenu on the changes toolbar,
// which is the slot that hosts our skill buttons as a dropdown.
import '../../../applyCommitsToParentRepo/browser/applyChangesToParentRepo.js';

function makeActiveSession(providerId: string): IActiveSession {
	const chat: IChat = {
		resource: URI.parse('file:///session'),
		createdAt: new Date(),
		title: observableValue('t', 'Test'),
		updatedAt: observableValue('u', new Date()),
		status: observableValue('s', 0),
		changesets: observableValue('cs', []),
		changes: observableValue('c', []),
		modelId: observableValue('m', undefined),
		mode: observableValue('mo', undefined),
		isArchived: observableValue('ia', false),
		isRead: observableValue('ir', true),
		lastTurnEnd: observableValue('lte', undefined),
		description: observableValue('d', undefined),
	};
	return {
		sessionId: `${providerId}:x`,
		resource: chat.resource,
		providerId,
		sessionType: 'copilotcli',
		icon: Codicon.copilot,
		createdAt: chat.createdAt,
		workspace: observableValue('w', undefined),
		title: chat.title,
		updatedAt: chat.updatedAt,
		status: chat.status,
		changesets: chat.changesets,
		changes: chat.changes,
		modelId: chat.modelId,
		mode: chat.mode,
		loading: observableValue('l', false),
		isArchived: chat.isArchived,
		isRead: chat.isRead,
		lastTurnEnd: chat.lastTurnEnd,
		description: chat.description,
		gitHubInfo: observableValue('gh', undefined),
		chats: observableValue('chats', [chat]),
		activeChat: observableValue('ac', chat),
		mainChat: chat,
		capabilities: { supportsMultipleChats: false },
	} as IActiveSession;
}

class FakeAgentHostProvider {
	constructor(public readonly id: string) { }
}
// Make `instanceof BaseAgentHostSessionsProvider` return true without actually constructing one.
Object.setPrototypeOf(FakeAgentHostProvider.prototype, BaseAgentHostSessionsProvider.prototype);

class FakeNonAgentHostProvider {
	constructor(public readonly id: string) { }
}

class FakeSessionsManagementService extends mock<ISessionsManagementService>() {
	declare readonly _serviceBrand: undefined;
	override readonly activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
	setActive(s: IActiveSession | undefined): void {
		this.activeSession.set(s, undefined);
	}
}

class FakeSessionsProvidersService extends mock<ISessionsProvidersService>() {
	declare readonly _serviceBrand: undefined;
	private readonly _providers = new Map<string, ISessionsProvider>();
	register(p: { id: string }): void {
		this._providers.set(p.id, p as unknown as ISessionsProvider);
	}
	override getProvider<T extends ISessionsProvider>(id: string): T | undefined {
		return this._providers.get(id) as T | undefined;
	}
	override getProviders(): ISessionsProvider[] {
		return [...this._providers.values()];
	}
}

suite('agentHostSkillButtons - IsAgentHostSession context key', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const contextKeyService = store.add(new MockContextKeyService());
		const sessions = new FakeSessionsManagementService();
		const providers = new FakeSessionsProvidersService();

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(ISessionsManagementService, sessions);
		instantiationService.stub(ISessionsProvidersService, providers);

		store.add(instantiationService.createInstance(IsAgentHostSessionContextContribution));

		return { contextKeyService, sessions, providers };
	}

	test('is false when no active session', () => {
		const { contextKeyService } = setup();
		assert.strictEqual(contextKeyService.getContextKeyValue(IsAgentHostSession.key), false);
	});

	test('is true when active session comes from an agent-host provider', () => {
		const { contextKeyService, sessions, providers } = setup();
		providers.register(new FakeAgentHostProvider('local-agent-host'));
		sessions.setActive(makeActiveSession('local-agent-host'));
		assert.strictEqual(contextKeyService.getContextKeyValue(IsAgentHostSession.key), true);
	});

	test('is false when active session comes from a non agent-host provider', () => {
		const { contextKeyService, sessions, providers } = setup();
		providers.register(new FakeNonAgentHostProvider('copilot-cloud-agent'));
		sessions.setActive(makeActiveSession('copilot-cloud-agent'));
		assert.strictEqual(contextKeyService.getContextKeyValue(IsAgentHostSession.key), false);
	});

	test('is false when active session references an unknown provider', () => {
		const { contextKeyService, sessions } = setup();
		sessions.setActive(makeActiveSession('no-such-provider'));
		assert.strictEqual(contextKeyService.getContextKeyValue(IsAgentHostSession.key), false);
	});

	test('updates reactively when active session changes', () => {
		const { contextKeyService, sessions, providers } = setup();
		providers.register(new FakeAgentHostProvider('local-agent-host'));
		providers.register(new FakeNonAgentHostProvider('copilot-cloud-agent'));

		sessions.setActive(makeActiveSession('local-agent-host'));
		assert.strictEqual(contextKeyService.getContextKeyValue(IsAgentHostSession.key), true);

		sessions.setActive(makeActiveSession('copilot-cloud-agent'));
		assert.strictEqual(contextKeyService.getContextKeyValue(IsAgentHostSession.key), false);

		sessions.setActive(undefined);
		assert.strictEqual(contextKeyService.getContextKeyValue(IsAgentHostSession.key), false);
	});
});

suite('agentHostSkillButtons - menu registration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function skillButtonItems() {
		const all = MenuRegistry.getMenuItems(MenuId.AgentsChangesPrimaryActionSubMenu);
		const menuItems: { command: { id: string }; when?: ContextKeyExpression }[] = [];
		for (const item of all) {
			if (!isIMenuItem(item)) {
				continue;
			}
			if (isAgentHostSkillButtonId(item.command.id)) {
				menuItems.push(item);
			}
		}
		return menuItems;
	}

	test('registers four skill button menu items on the apply submenu', () => {
		const ids = skillButtonItems().map(item => item.command.id).sort();
		assert.deepStrictEqual(ids, [
			'workbench.action.agentSessions.runSkill.createDraftPR',
			'workbench.action.agentSessions.runSkill.createPR',
			'workbench.action.agentSessions.runSkill.merge',
			'workbench.action.agentSessions.runSkill.updatePR',
		]);
	});

	test('every skill button `when` clause includes sessions.isAgentHostSession and isSessionsWindow', () => {
		for (const item of skillButtonItems()) {
			const whenStr = item.when?.serialize() ?? '';
			assert.ok(
				whenStr.includes(IsAgentHostSession.key),
				`expected ${item.command.id} to gate on ${IsAgentHostSession.key}, got: ${whenStr}`,
			);
			assert.ok(
				whenStr.includes('isSessionsWindow'),
				`expected ${item.command.id} to gate on isSessionsWindow, got: ${whenStr}`,
			);
		}
	});

	test('exported updatePR id matches the registered command', () => {
		assert.ok(isAgentHostSkillButtonId(AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID));
		assert.ok(CommandsRegistry.getCommand(AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID),
			`expected command ${AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID} to be registered`);
	});

	test('the apply submenu is contributed to the changes toolbar in the navigation group', () => {
		const toolbarItems = MenuRegistry.getMenuItems(MenuId.AgentsChangesToolbar);
		const submenuEntry = toolbarItems.find(item => isISubmenuItem(item) && item.submenu === MenuId.AgentsChangesPrimaryActionSubMenu);
		assert.ok(submenuEntry, 'expected AgentsChangesPrimaryActionSubMenu to be registered on AgentsChangesToolbar');
		assert.strictEqual((submenuEntry as { group?: string }).group, 'navigation');
	});

	test('isAgentHostSkillButtonId only matches our prefix', () => {
		assert.strictEqual(isAgentHostSkillButtonId('workbench.action.agentSessions.runSkill.merge'), true);
		assert.strictEqual(isAgentHostSkillButtonId('github.copilot.sessions.commit'), false);
		assert.strictEqual(isAgentHostSkillButtonId(''), false);
	});
});
