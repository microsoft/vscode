/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { localize } from '../../../../../nls.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SESSIONS_LIST_COLLECTIONS_SETTING } from '../../../../common/sessionConfig.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { SessionTextColorMode, SessionPaletteColor } from '../../../../services/sessions/common/sessionColors.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { buildTestSession, ITestSession } from '../../../../services/sessions/test/common/testSessionBuilder.js';
import { ISessionCollectionsService, SessionCollectionsService } from '../../../../services/sessions/browser/sessionCollectionsService.js';
import { ISessionGroupsService, SessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { getGroupSectionId, ISessionSectionColorsService, PINNED_SECTION_COLOR_ID, SessionSectionColorsService } from '../../../../services/sessions/browser/sessionSectionColorsService.js';
import { renderSessionCollectionEditor, renderSessionHeaderEditor } from '../../browser/views/sessionHeaderEditors.js';

interface IFixtureServices {
	readonly instantiationService: TestInstantiationService;
	readonly groupId: string;
	readonly releaseCollectionId: string;
	readonly sessions: ReadonlyMap<string, ITestSession>;
}

class FixtureSessionsManagementService extends mock<ISessionsManagementService>() {
	override readonly onDidChangeSessions: Event<ISessionsChangeEvent> = Event.None;
	override readonly onDidChangeSessionTypes = Event.None;
	override readonly onDidStartSession = Event.None;
	override readonly onWillSendRequest = Event.None;
	override readonly onDidSendRequest = Event.None;
	override readonly onDidDeleteSession = Event.None;
	override readonly onDidDeleteChat = Event.None;
	override readonly onDidRenameChat = Event.None;
	override readonly onDidRenameSession = Event.None;
	override readonly onDidReplaceSession = Event.None;
	override readonly onDidDiscardNewSession = Event.None;
	override readonly onDidReplaceNewDraftSession = Event.None;
	override readonly onDidArchiveSession = Event.None;
	override readonly onDidUnarchiveSession = Event.None;

	constructor(private readonly sessions: ReadonlyMap<string, ITestSession>) {
		super();
	}

	override getSessions(): ISession[] {
		return [...this.sessions.values()].map(session => session.session);
	}

	override getSession(resource: URI): ISession | undefined {
		return [...this.sessions.values()].find(session => session.session.resource.toString() === resource.toString())?.session;
	}
}

async function createFixtureServices(context: ComponentFixtureContext): Promise<IFixtureServices> {
	const sessions = new Map([
		['auth', buildTestSession({ id: 'auth', title: 'Fix authentication redirect loop', workspace: 'vscode', minutesAgo: 12 })],
		['backoff', buildTestSession({ id: 'backoff', title: 'Add reconnect backoff', workspace: 'agent-host-protocol', minutesAgo: 64 })],
		['netmon', buildTestSession({ id: 'netmon', title: 'Add per-device bandwidth chart', workspace: 'netmon', minutesAgo: 4 })],
		['docs', buildTestSession({ id: 'docs', title: 'Refresh the getting started guide', workspace: 'vscode-docs', minutesAgo: 90 })],
	]);
	const instantiationService = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(ISessionsManagementService, new FixtureSessionsManagementService(sessions));
			reg.define(ISessionGroupsService, SessionGroupsService);
			reg.define(ISessionSectionColorsService, SessionSectionColorsService);
			reg.define(ISessionCollectionsService, SessionCollectionsService);
		},
	});

	const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	await configurationService.setUserConfiguration(SESSIONS_LIST_COLLECTIONS_SETTING, true);

	const groupsService = instantiationService.get(ISessionGroupsService);
	const group = groupsService.createGroup('Iteration Plan', ['auth', 'backoff']);
	const colorsService = instantiationService.get(ISessionSectionColorsService);
	colorsService.setColor(getGroupSectionId(group.id), { color: SessionPaletteColor.Blue, textColor: SessionTextColorMode.Auto });
	colorsService.setColor(PINNED_SECTION_COLOR_ID, { color: SessionPaletteColor.Orange, textColor: SessionTextColorMode.Auto });

	const collectionsService = instantiationService.get(ISessionCollectionsService);
	collectionsService.createCollection({ name: 'Personal', icon: Codicon.heart.id, color: SessionPaletteColor.Pink });
	const releaseCollection = collectionsService.createCollection({ name: 'Release', icon: Codicon.rocket.id, color: SessionPaletteColor.Green });

	return { instantiationService, groupId: group.id, releaseCollectionId: releaseCollection.id, sessions };
}

function prepareContainer(container: HTMLElement): HTMLElement {
	container.style.width = '360px';
	container.style.height = '520px';
	container.style.boxSizing = 'border-box';
	container.style.padding = '16px';
	container.style.background = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
	const host = DOM.append(container, DOM.$('.session-header-editor-fixture-host'));
	return host;
}

function fixtureAction(context: ComponentFixtureContext, id: string, label: string): Action {
	return context.disposableStore.add(new Action(id, label));
}

function fixtureActions(context: ComponentFixtureContext): readonly Action[] {
	return [
		fixtureAction(context, 'sessionHeaderEditorFixture.newSession', localize('sessionHeaderEditorFixture.newSession', "New Session in Group")),
		fixtureAction(context, 'sessionHeaderEditorFixture.ungroup', localize('sessionHeaderEditorFixture.ungroup', "Ungroup")),
		fixtureAction(context, 'sessionHeaderEditorFixture.done', localize('sessionHeaderEditorFixture.done', "Mark Group as Done")),
	];
}

function renderGroupEditor(custom: boolean) {
	return defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		render: async context => {
			const host = prepareContainer(context.container);
			const services = await createFixtureServices(context);
			const colorsService = services.instantiationService.get(ISessionSectionColorsService);
			const sectionId = getGroupSectionId(services.groupId);
			if (custom) {
				colorsService.setColor(sectionId, { color: '#7f42d1', textColor: SessionTextColorMode.Auto });
			}
			context.disposableStore.add(renderSessionHeaderEditor(host, {
				target: {
					sectionId,
					kind: 'group',
					label: 'Iteration Plan',
					groupId: services.groupId,
				},
				actions: fixtureActions(context),
				close: () => { },
			}, services.instantiationService));
			if (custom) {
				host.querySelector<HTMLButtonElement>('.session-header-editor-swatch-custom')?.click();
			}
		},
	});
}

function renderWorkspaceEditor() {
	return defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		render: async context => {
			const host = prepareContainer(context.container);
			const services = await createFixtureServices(context);
			context.disposableStore.add(renderSessionHeaderEditor(host, {
				target: {
					sectionId: 'workspace:netmon',
					kind: 'workspace',
					label: 'netmon',
					icon: Codicon.folder,
					sessions: [services.sessions.get('netmon')!.session],
				},
				actions: [fixtureAction(context, 'sessionHeaderEditorFixture.newSession', localize('sessionHeaderEditorFixture.newSessionWorkspace', "New Session"))],
				close: () => { },
			}, services.instantiationService));
		},
	});
}

function renderPinnedEditor() {
	return defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		render: async context => {
			const host = prepareContainer(context.container);
			const services = await createFixtureServices(context);
			context.disposableStore.add(renderSessionHeaderEditor(host, {
				target: {
					sectionId: PINNED_SECTION_COLOR_ID,
					kind: 'section',
					label: localize('sessionHeaderEditorFixture.pinned', "Pinned"),
					icon: Codicon.pinned,
				},
				actions: [fixtureAction(context, 'sessionHeaderEditorFixture.removeColor', localize('sessionHeaderEditorFixture.removeColor', "Remove Color"))],
				close: () => { },
			}, services.instantiationService));
		},
	});
}

function renderCollectionEditorFixture() {
	return defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		render: async context => {
			const host = prepareContainer(context.container);
			const services = await createFixtureServices(context);
			context.disposableStore.add(renderSessionCollectionEditor(host, {
				collectionId: services.releaseCollectionId,
				close: () => { },
			}, services.instantiationService));
		},
	});
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	SessionHeaderEditor_Group: renderGroupEditor(false),
	SessionHeaderEditor_CustomColor: renderGroupEditor(true),
	SessionHeaderEditor_Workspace: renderWorkspaceEditor(),
	SessionHeaderEditor_Pinned: renderPinnedEditor(),
	SessionHeaderEditor_Collection: renderCollectionEditorFixture(),
});
