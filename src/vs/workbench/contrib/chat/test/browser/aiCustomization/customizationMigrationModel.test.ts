/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue, waitForState } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { CustomizationMigrationCategoryId } from '../../../browser/aiCustomization/customizationMigrationCategories.js';
import { CustomizationMigrationModel } from '../../../browser/aiCustomization/customizationMigrationModel.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { CustomizationMigration, CustomizationMigrationType, FileCustomizationMigration, FileCustomizationMigrationType, ICustomizationMigrationService, IMcpServerMigrationResult, isMcpServerCustomizationMigrationCandidate, McpServerCustomizationMigration } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { MockPromptsService } from '../../common/promptSyntax/service/mockPromptsService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';

class TestMigrationService implements ICustomizationMigrationService {
	declare readonly _serviceBrand: undefined;
	readonly requestedSessions: URI[] = [];
	beforeCompute?: (sessionResource: URI, type: CustomizationMigrationType) => Promise<void>;

	computeMigration(sessionResource: URI, type: FileCustomizationMigrationType): Promise<FileCustomizationMigration>;
	computeMigration(sessionResource: URI, type: CustomizationMigrationType.McpServers): Promise<McpServerCustomizationMigration>;
	async computeMigration(sessionResource: URI, type: CustomizationMigrationType): Promise<CustomizationMigration> {
		this.requestedSessions.push(sessionResource);
		await this.beforeCompute?.(sessionResource, type);
		if (type === CustomizationMigrationType.McpServers) {
			return {
				type,
				servers: [],
				candidates: [],
				discoveryComplete: true,
				coverage: {
					restrictedByMcpAccess: false,
					restrictedByCustomizationPolicy: false,
				},
			};
		}
		const candidates = type === CustomizationMigrationType.UserData
			? [{
				uri: URI.file(`/user-data${sessionResource.path}.instructions.md`),
				storage: PromptsStorage.user,
				type: PromptsType.instructions,
			}]
			: [];
		return { type, files: candidates.map(candidate => candidate.uri), candidates };
	}

	async migrateMcpServers(): Promise<IMcpServerMigrationResult> {
		return { migratedCount: 0, failures: [] };
	}

	async computeMigrations(sessionResource: URI): Promise<CustomizationMigration[]> {
		return [
			await this.computeMigration(sessionResource, CustomizationMigrationType.UserData),
			await this.computeMigration(sessionResource, CustomizationMigrationType.PromptFiles),
			await this.computeMigration(sessionResource, CustomizationMigrationType.McpServers),
		];
	}

	async computeMigrationHint(): Promise<string | undefined> {
		return undefined;
	}
}

suite('CustomizationMigrationModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('refreshes from session, MCP inventory, and working-directory changes', async () => {
		const sessionA = URI.parse('agent-host-test:/session-a');
		const sessionB = URI.parse('agent-host-test:/session-b');
		const activeSessionResource = observableValue('activeSessionResource', sessionA);
		const activeHarness = observableValue('activeHarness', sessionA.scheme);
		const migrationService = new TestMigrationService();
		const promptsService = store.add(new MockPromptsService());
		const mcpServers = observableValue<readonly never[]>('mcpServers', []);
		const onDidChangeCustomizations = store.add(new Emitter<void>());
		let workingDirectories: readonly string[] = [];
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeSessionResource = activeSessionResource;
			override readonly activeHarness = activeHarness;
			override findHarnessById() {
				return {
					id: sessionA.scheme,
					label: 'Test',
					icon: Codicon.beaker,
					itemProvider: {
						onDidChange: Event.None,
						provideChatSessionCustomizations: async () => [],
						provideSourceFolders: async (_resource: URI, type: PromptsType) => type === PromptsType.instructions
							? [{ uri: URI.file('/instructions'), label: 'Instructions', source: PromptsStorage.user }]
							: [],
					},
				};
			}
		}();
		const configurationService = {
			onDidChangeConfiguration: Event.None,
			getValue: () => true,
		} as Partial<IConfigurationService> as IConfigurationService;
		const mcpService = {
			servers: mcpServers,
		} as Partial<IMcpService> as IMcpService;
		const agentHostCustomizationService = {
			onDidChangeCustomizations: onDidChangeCustomizations.event,
			getWorkingDirectories: () => workingDirectories,
		} as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService;
		const model = store.add(new CustomizationMigrationModel(
			migrationService,
			harnessService,
			promptsService,
			configurationService,
			mcpService,
			agentHostCustomizationService,
		));
		await waitForState(model.state, state => !state.loading && state.candidatesByCategory.size > 0);
		const requestsAfterInitialRefresh = migrationService.requestedSessions.length;

		const sessionBRefreshStarted = new DeferredPromise<void>();
		const releaseSessionBRefresh = new DeferredPromise<void>();
		migrationService.beforeCompute = async (sessionResource, type) => {
			if (sessionResource.path === sessionB.path && type === CustomizationMigrationType.UserData) {
				sessionBRefreshStarted.complete();
				await releaseSessionBRefresh.p;
			}
		};
		activeSessionResource.set(sessionB, undefined);
		await sessionBRefreshStarted.p;
		mcpServers.set([], undefined);
		await timeout(10);
		const candidateDuringSessionSwitch = model.state.get().candidatesByCategory.get(CustomizationMigrationCategoryId.UserData);
		releaseSessionBRefresh.complete();
		const getUserDataCandidatePath = () => {
			const candidate = model.state.get().candidatesByCategory.get(CustomizationMigrationCategoryId.UserData)?.[0];
			return candidate && !isMcpServerCustomizationMigrationCandidate(candidate) ? candidate.uri.path : undefined;
		};
		await waitForState(model.state, state =>
			!state.loading
			&& getUserDataCandidatePath() === '/user-data/session-b.instructions.md'
			&& migrationService.requestedSessions.length >= requestsAfterInitialRefresh + 4
		);
		const requestsAfterSessionChange = requestsAfterInitialRefresh + 3;
		const requestsAfterMcpChange = migrationService.requestedSessions.length;
		workingDirectories = ['file:///workspace'];
		onDidChangeCustomizations.fire();
		await waitForState(model.state, state => !state.loading && migrationService.requestedSessions.length > requestsAfterMcpChange);

		assert.deepStrictEqual({
			lastCandidate: getUserDataCandidatePath(),
			candidateDuringSessionSwitch,
			lastTarget: model.state.get().targetFoldersByType.get(PromptsType.instructions)?.[0].uri.path,
			requestsAfterInitialRefresh,
			requestsAddedBySessionChange: requestsAfterSessionChange - requestsAfterInitialRefresh,
			requestsAddedByMcpChange: requestsAfterMcpChange - requestsAfterSessionChange,
			requestsAddedByRootChange: migrationService.requestedSessions.length - requestsAfterMcpChange,
			requestedSessions: [...new Set(migrationService.requestedSessions.map(resource => resource.path))],
		}, {
			lastCandidate: '/user-data/session-b.instructions.md',
			candidateDuringSessionSwitch: undefined,
			lastTarget: '/instructions',
			requestsAfterInitialRefresh: 3,
			requestsAddedBySessionChange: 3,
			requestsAddedByMcpChange: 1,
			requestsAddedByRootChange: 3,
			requestedSessions: ['/session-a', '/session-b'],
		});
	});

	test('records load errors without discarding the last successful state', async () => {
		const session = URI.parse('agent-host-test:/session');
		let shouldFail = false;
		const migrationService = new class extends TestMigrationService {
			override async computeMigration(sessionResource: URI, type: FileCustomizationMigrationType): Promise<FileCustomizationMigration>;
			override async computeMigration(sessionResource: URI, type: CustomizationMigrationType.McpServers): Promise<McpServerCustomizationMigration>;
			override async computeMigration(sessionResource: URI, type: CustomizationMigrationType): Promise<CustomizationMigration> {
				if (shouldFail) {
					throw new Error('expected migration discovery failure');
				}
				return super.computeMigration(sessionResource, type as FileCustomizationMigrationType);
			}
		}();
		const promptsService = store.add(new MockPromptsService());
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override readonly activeSessionResource = observableValue('activeSessionResource', session);
			override readonly activeHarness = observableValue('activeHarness', session.scheme);
			override findHarnessById() {
				return { id: session.scheme, label: 'Test', icon: Codicon.beaker };
			}
		}();
		const model = store.add(new CustomizationMigrationModel(
			migrationService,
			harnessService,
			promptsService,
			{ onDidChangeConfiguration: Event.None, getValue: () => true } as Partial<IConfigurationService> as IConfigurationService,
			{ servers: observableValue<readonly never[]>('mcpServers', []) } as Partial<IMcpService> as IMcpService,
			{ onDidChangeCustomizations: Event.None, getWorkingDirectories: () => [] } as Partial<IAgentHostCustomizationService> as IAgentHostCustomizationService,
		));
		await waitForState(model.state, state => !state.loading && state.candidatesByCategory.size > 0);
		shouldFail = true;

		const unexpectedErrors: Error[] = [];
		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => unexpectedErrors.push(error));
		try {
			await model.refresh();
		} finally {
			setUnexpectedErrorHandler(originalErrorHandler);
		}

		assert.deepStrictEqual({
			error: model.state.get().loadError,
			candidateCount: model.state.get().candidatesByCategory.get(CustomizationMigrationCategoryId.UserData)?.length,
			unexpectedErrors: unexpectedErrors.map(error => error.message),
		}, {
			error: 'expected migration discovery failure',
			candidateCount: 1,
			unexpectedErrors: ['expected migration discovery failure'],
		});
	});
});
