/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { getSingletonServiceDescriptors } from '../../../../../../platform/instantiation/common/extensions.js';
import { _util, ServiceIdentifier } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService, OpenOptions } from '../../../../../../platform/opener/common/opener.js';
import { IURLService } from '../../../../../../platform/url/common/url.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { OPEN_ISSUE_ACTION_ID, OPEN_PULL_REQUEST_ACTION_ID } from '../../../common/github/types.js';
import { IFocusedSessionHostService, ISessionHost, ISessionHostService } from '../../../../../services/sessions/browser/sessionHost.js';
import { ISessionsPartService } from '../../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsNavigationService } from '../../../browser/sessionsNavigationService.js';
import { ISessionsService } from '../../../browser/sessionsService.js';
import '../../../browser/editorWindow/editorWindowSessions.contribution.js';
import { ChatHostOpenerService, IChatHostOpenerService } from '../../../../../services/sessions/browser/chatHostOpener.js';
import { ISessionsHostLayoutService } from '../../../../../services/sessions/browser/sessionsHostLayoutService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from '../../../../../services/sessions/browser/sessionSectionOrderService.js';
import { ISessionChangesStatsCache, SessionChangesStatsCache } from '../../../../../services/sessions/common/sessionChangesStatsCache.js';
import { IAutomationService } from '../../../../chat/common/automations/automationService.js';
import { AgentHostFilterService } from '../../../browser/agentHostFilterService.js';
import { AgentsWindowExtensionSuggestionsService, IAgentsWindowExtensionSuggestionsService } from '../../../browser/agentsWindowExtensionSuggestions.js';
import { AICustomizationMcpServerCountService, IAICustomizationMcpServerCountService } from '../../../browser/customizationMcpServerCount.js';
import { ICustomViewService } from '../../../browser/customView.js';
import { DefaultSessionRepositoryPicker } from '../../../browser/defaultSessionRepositoryPicker.js';
import { DefaultSessionsListPresentation } from '../../../browser/defaultSessionsListPresentation.js';
import { IPullRequestIconCache, PullRequestIconCache } from '../../../browser/github/pullRequestIconCache.js';
import { IPinnedCanvasService } from '../../../browser/pinnedCanvases.js';
import { SessionComparisonService } from '../../../browser/sessionComparisonService.js';
import { ISessionGroupsService, SessionGroupsService } from '../../../browser/sessionGroupsService.js';
import { ISessionOpenTelemetryService, SessionOpenTelemetryService } from '../../../browser/sessionOpenTelemetryService.js';
import { ISessionRepositoryPicker } from '../../../browser/sessionRepositoryPicker.js';
import { ISessionsListPresentation } from '../../../browser/sessionsListPresentation.js';
import { SessionsManagementService } from '../../../browser/sessionsManagementService.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { EditorWindowSessionsProvidersService } from '../../../browser/editorWindow/editorWindowSessionsProvidersService.js';
import { ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService } from '../../../browser/sessionsRecentWorkspacesService.js';
import { IAgentHostFilterService } from '../../../common/agentHostFilter.js';
import { ISessionComparisonService } from '../../../common/sessionComparison.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { EditorWindowAgentFeedbackService, EditorWindowAquariumService, EditorWindowAutomationService, EditorWindowCodeReviewService, EditorWindowCustomViewService, EditorWindowPinnedCanvasService } from '../../../browser/editorWindow/editorWindowNullServices.js';
import { ISessionsChatViewStateService, SessionsChatViewStateService } from '../../../browser/chat/chatViewStateService.js';
import { ISessionsChatBackgroundService, SessionsChatBackgroundService } from '../../../browser/chatBackgroundService.js';
import { INewSessionComposerService, NewSessionComposerService } from '../../../browser/newSessionComposerService.js';
import { IAgentFeedbackService } from '../../../browser/agentFeedback.js';
import { IAquariumService } from '../../../browser/aquarium.js';
import { ICodeReviewService } from '../../../browser/codeReviewService.js';
import { ISessionActivityBarActivityService, SessionActivityBarActivityService } from '../../../common/sessionActivityBarActivityService.js';
import { IDiffEditorOptionsService } from '../../../../../services/editor/common/diffEditorOptionsService.js';
import { DiffEditorOptionsService } from '../../../../../services/editor/browser/diffEditorOptionsService.js';
import { EditorWindowSessionsHostLayout } from '../../../browser/editorWindow/editorWindowSessionsHostLayout.js';

suite('Editor window sessions services', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const registered: readonly [ServiceIdentifier<unknown>, Function][] = [
		[ISessionsHostLayoutService, EditorWindowSessionsHostLayout],
		[ISessionsProvidersService, EditorWindowSessionsProvidersService],
		[ISessionsManagementService, SessionsManagementService],
		[IChatHostOpenerService, ChatHostOpenerService],
		[ISessionChangesStatsCache, SessionChangesStatsCache],
		[ISessionOpenTelemetryService, SessionOpenTelemetryService],
		[ISessionSectionOrderService, SessionSectionOrderService],
		[ISessionGroupsService, SessionGroupsService],
		[ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService],
		[ISessionComparisonService, SessionComparisonService],
		[IAgentHostFilterService, AgentHostFilterService],
		[ISessionRepositoryPicker, DefaultSessionRepositoryPicker],
		[ISessionsListPresentation, DefaultSessionsListPresentation],
		[IPullRequestIconCache, PullRequestIconCache],
		[IAICustomizationMcpServerCountService, AICustomizationMcpServerCountService],
		[IAgentsWindowExtensionSuggestionsService, AgentsWindowExtensionSuggestionsService],
		[ICustomViewService, EditorWindowCustomViewService],
		[IAutomationService, EditorWindowAutomationService],
		[IPinnedCanvasService, EditorWindowPinnedCanvasService],
		[IAgentFeedbackService, EditorWindowAgentFeedbackService],
		[IAquariumService, EditorWindowAquariumService],
		[ICodeReviewService, EditorWindowCodeReviewService],
		[ISessionsChatViewStateService, SessionsChatViewStateService],
		[ISessionsChatBackgroundService, SessionsChatBackgroundService],
		[INewSessionComposerService, NewSessionComposerService],
		[ISessionActivityBarActivityService, SessionActivityBarActivityService],
		[IDiffEditorOptionsService, DiffEditorOptionsService],
	];

	test('registers every service to be created only as it is first used', () => {
		const descriptors = getSingletonServiceDescriptors();
		assert.deepStrictEqual(
			registered.map(([id, ctor]) => {
				const own = descriptors.filter(([candidate, descriptor]) => candidate === id && descriptor.ctor === ctor);
				// The Agents window registers some of them too, the same way, where its modules load in the same run
				return { id: id.toString(), registered: own.length > 0, delayed: own.every(([, descriptor]) => descriptor.supportsDelayedInstantiation) };
			}),
			registered.map(([id]) => ({ id: id.toString(), registered: true, delayed: true })),
		);
	});

	test('none of the services depends, also through another of them, on a service only the Agents window has', () => {
		const agentsWindowOnly = new Set<ServiceIdentifier<unknown>>([ISessionsService, ISessionsNavigationService, ISessionHost, ISessionHostService, IFocusedSessionHostService, ISessionsPartService]);
		const ctors = new Map(registered);
		const dependsOnAgentsWindow = (id: ServiceIdentifier<unknown>, seen: Set<ServiceIdentifier<unknown>>): string[] => {
			const ctor = ctors.get(id);
			if (!ctor || seen.has(id)) {
				return [];
			}
			seen.add(id);
			return _util.getServiceDependencies(ctor as _util.DI_TARGET_OBJ).flatMap(({ id: dependency }) => agentsWindowOnly.has(dependency)
				? [`${id} -> ${dependency}`]
				: dependsOnAgentsWindow(dependency, seen));
		};
		assert.deepStrictEqual(registered.flatMap(([id]) => dependsOnAgentsWindow(id, new Set())), []);
	});

	test('registers the commands that the pull request and issue pills of a chat open them with', async () => {
		const opened: { resource: string; openExternal: boolean | undefined; allowContributedOpeners: boolean | string | undefined }[] = [];
		const instantiationService = new TestInstantiationService();
		instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(resource: URI | string, options?: OpenOptions): Promise<boolean> {
				opened.push({ resource: resource.toString(), openExternal: options?.openExternal, allowContributedOpeners: options?.allowContributedOpeners });
				return true;
			}
		});
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override async getExtension(): Promise<IExtensionDescription | undefined> {
				return undefined;
			}
		});
		instantiationService.stub(IURLService, new class extends mock<IURLService>() { });
		const run = async (id: string, context: object) => {
			const command = CommandsRegistry.getCommand(id);
			if (command) {
				await instantiationService.invokeFunction(accessor => command.handler(accessor, context));
			}
			return { id, registered: !!command };
		};
		const pullRequestUri = URI.parse('https://github.com/owner/repo/pull/1');
		const issueUri = URI.parse('https://github.com/owner/repo/issues/2');

		const commands = [
			await run(OPEN_PULL_REQUEST_ACTION_ID, { pullRequest: { owner: 'owner', repo: 'repo', number: 1, uri: pullRequestUri } }),
			await run(OPEN_ISSUE_ACTION_ID, { issue: { owner: 'owner', repo: 'repo', number: 2, uri: issueUri } }),
		];

		assert.deepStrictEqual({ commands, opened }, {
			commands: [{ id: OPEN_PULL_REQUEST_ACTION_ID, registered: true }, { id: OPEN_ISSUE_ACTION_ID, registered: true }],
			opened: [
				{ resource: pullRequestUri.toString(), openExternal: true, allowContributedOpeners: true },
				{ resource: issueUri.toString(), openExternal: true, allowContributedOpeners: undefined },
			],
		});
	});
});
