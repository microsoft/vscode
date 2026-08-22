/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession, type IAgentSessionMetadata } from '../../common/agent.js';
import { SessionArtifactType, withSessionArtifacts } from '../../common/sessionArtifacts.js';
import { SessionSourceControlOutcome, SessionStatus, withSessionEhcliAdoptable, withSessionFolderPickerDecision, withSessionGitHubState, withSessionGitState, withSessionMultiRootMetadata, withSessionOrchestration, withSessionSourceControlState, withSessionWorkspaceless, type SessionMeta } from '../../common/state/sessionState.js';
import { projectAgentHostCatalog, type IAgentHostCatalogSource } from '../../node/agentHostCatalogProjection.js';
import { AgentHostCatalogShadowValidator, type IAgentHostCatalogShadowValidationReport, type IAgentHostCatalogShadowValidationReporter } from '../../node/agentHostCatalogShadowValidator.js';
import { AgentHostDatabase, type IAgentHostDatabaseSessionV2 } from '../../node/agentHostDatabase.js';
import type { IRegisteredSession } from '../../node/agentSessionRegistry.js';

class RecordingReporter implements IAgentHostCatalogShadowValidationReporter {
	readonly reports: IAgentHostCatalogShadowValidationReport[] = [];

	report(report: IAgentHostCatalogShadowValidationReport): void {
		this.reports.push(report);
	}
}

class ShadowCatalogDatabase extends AgentHostDatabase {
	readonly catalogs = new Map<string, IAgentHostDatabaseSessionV2 | Error | undefined>();
	activeReads = 0;
	maxConcurrentActiveReads = 0;
	activeReadDelay = 0;

	constructor() {
		super(':memory:');
	}

	override async getSessionV2(session: string): Promise<IAgentHostDatabaseSessionV2 | undefined> {
		this.activeReads++;
		this.maxConcurrentActiveReads = Math.max(this.maxConcurrentActiveReads, this.activeReads);
		try {
			if (this.activeReadDelay > 0) {
				await timeout(this.activeReadDelay);
			}
			const value = this.catalogs.get(session);
			if (value instanceof Error) {
				throw value;
			}
			return value;
		} finally {
			this.activeReads--;
		}
	}
}

suite('AgentHostCatalogShadowValidator', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function source(overrides: Partial<IAgentHostCatalogSource> = {}): IAgentHostCatalogSource {
		return {
			modifiedTime: 2,
			title: 'Session',
			titleSource: 'user',
			isRead: true,
			isArchived: true,
			project: { uri: 'file:///project', displayName: 'Project' },
			workspaceless: true,
			ehcliAdoptable: true,
			multiRoot: { workspaceFile: 'file:///workspace.code-workspace' },
			folderPicker: { hidden: true, primary: 'file:///project' },
			changes: { additions: 1, deletions: 2, files: 3 },
			github: { owner: 'owner', repo: 'repo', pullRequestUrls: ['https://example.invalid/pr/1'] },
			git: {
				hasGitHubRemote: true,
				branchName: 'feature',
				baseBranchName: 'main',
				upstreamBranchName: 'origin/feature',
				incomingChanges: 1,
				outgoingChanges: 2,
				uncommittedChanges: 3,
				hasBaseBranchChanges: true,
				githubOwner: 'owner',
				githubHeadOwner: 'contributor',
				githubRepo: 'repo',
			},
			sourceControl: { merge: { commit: 'abc' }, latestOutcome: 'merge' },
			artifacts: [{ id: 'artifact', type: 'file', label: 'Artifact', uri: 'file:///artifact' }],
			orchestration: {
				parentSession: 'copilot:/parent',
				creatorSession: 'copilot:/creator',
				coordinateWithCreator: true,
				notifyOnIdle: 'once',
			},
			workingDirectories: ['file:///project'],
			chats: [],
			...overrides,
		};
	}

	function metadata(id: string, value = source()): IAgentSessionMetadata {
		const session = AgentSession.uri('copilot', id);
		let meta: SessionMeta | undefined;
		meta = withSessionWorkspaceless(meta, value.workspaceless);
		if (value.ehcliAdoptable) {
			meta = withSessionEhcliAdoptable(meta);
		}
		meta = withSessionMultiRootMetadata(meta, value.multiRoot);
		meta = withSessionFolderPickerDecision(meta, value.folderPicker);
		meta = withSessionGitHubState(meta, value.github);
		meta = withSessionGitState(meta, value.git);
		meta = withSessionSourceControlState(meta, value.sourceControl ? {
			merge: value.sourceControl.merge,
			latestOutcome: value.sourceControl.latestOutcome === 'merge' ? SessionSourceControlOutcome.Merge : SessionSourceControlOutcome.PullRequest,
		} : undefined);
		meta = withSessionArtifacts(meta, value.artifacts?.map(artifact => ({ ...artifact, type: artifact.type as SessionArtifactType })) ?? []);
		if (value.orchestration) {
			meta = withSessionOrchestration(meta, value.orchestration);
		}
		return {
			session,
			startTime: 1,
			modifiedTime: value.modifiedTime,
			summary: value.title,
			status: SessionStatus.Idle | (value.isRead ? SessionStatus.IsRead : 0) | (value.isArchived ? SessionStatus.IsArchived : 0),
			project: value.project ? { uri: URI.parse(value.project.uri), displayName: value.project.displayName } : undefined,
			workingDirectories: value.workingDirectories.map(directory => URI.parse(directory)),
			changes: value.changes,
			_meta: meta,
		};
	}

	function registered(legacy: IAgentSessionMetadata, overrides: Partial<IRegisteredSession> = {}): IRegisteredSession {
		return {
			session: legacy.session,
			provider: 'copilot',
			startTime: legacy.startTime,
			external: false,
			source: 'explicit',
			...overrides,
		};
	}

	function catalog(session: string, value = source(), options: { sessionGeneration?: string; provider?: IRegisteredSession['provider']; startTime?: number } = {}): IAgentHostDatabaseSessionV2 {
		const projected = projectAgentHostCatalog(value, {
			session,
			sessionGeneration: options.sessionGeneration ?? 'incarnation',
			sourceRevision: 0,
		});
		assert.ok(projected.ok);
		return {
			...projected.value.catalog,
			provider: options.provider ?? 'copilot',
			startTime: options.startTime ?? 1,
			external: false,
			source: 'explicit',
		};
	}

	function seed(database: ShadowCatalogDatabase, legacy: IAgentSessionMetadata, value = source(), options: { sessionGeneration?: string; provider?: IRegisteredSession['provider']; startTime?: number } = {}): void {
		const session = legacy.session.toString();
		database.catalogs.set(session, catalog(session, value, options));
	}

	function createValidator(database: ShadowCatalogDatabase, reporter: RecordingReporter, repair: () => void, concurrency?: number): AgentHostCatalogShadowValidator {
		return new AgentHostCatalogShadowValidator(database, reporter, repair, new NullLogService(), concurrency === undefined ? {} : { concurrency });
	}

	test('reports a normalized match without exposing non-comparable title source or chats', async () => {
		const database = disposables.add(new ShadowCatalogDatabase());
		const reporter = new RecordingReporter();
		const legacy = metadata('matched');
		seed(database, legacy);
		let repairs = 0;

		await createValidator(database, reporter, () => repairs++).validate([legacy], [registered(legacy)]);

		assert.deepStrictEqual({
			total: reporter.reports[0].total,
			matched: reporter.reports[0].counts.matched,
			titleSourceNotComparable: reporter.reports[0].counts.titleSourceNotComparable,
			chatsNotComparable: reporter.reports[0].counts.chatsNotComparable,
			repairs,
		}, {
			total: 1,
			matched: 1,
			titleSourceNotComparable: 1,
			chatsNotComparable: 1,
			repairs: 0,
		});
	});

	test('categorizes missing, malformed, and validator exceptions and schedules one repair', async () => {
		const database = disposables.add(new ShadowCatalogDatabase());
		const reporter = new RecordingReporter();
		const missing = metadata('missing');
		const malformed = metadata('malformed');
		const failed = metadata('failed');
		seed(database, malformed);
		database.catalogs.set(malformed.session.toString(), { ...database.catalogs.get(malformed.session.toString()) as IAgentHostDatabaseSessionV2, title: 'not canonical' });
		database.catalogs.set(failed.session.toString(), new Error('sensitive: file:///private/path'));
		let repairs = 0;

		await createValidator(database, reporter, () => repairs++).validate(
			[missing, malformed, failed],
			[missing, malformed, failed].map(entry => registered(entry)),
		);

		const report = reporter.reports[0];
		assert.deepStrictEqual({
			missing: report.counts.missing,
			malformed: report.counts.malformed,
			validationError: report.counts.validationError,
			repairs,
			containsSensitiveData: JSON.stringify(report).includes('private'),
		}, {
			missing: 1,
			malformed: 1,
			validationError: 1,
			repairs: 1,
			containsSensitiveData: false,
		});
	});

	test('reports every comparable field mismatch category', async () => {
		const database = disposables.add(new ShadowCatalogDatabase());
		const reporter = new RecordingReporter();
		const cases: Array<{ category: keyof IAgentHostCatalogShadowValidationReport['counts']; mutate: (value: IAgentHostCatalogSource) => IAgentHostCatalogSource }> = [
			{ category: 'modifiedTimeMismatch', mutate: value => ({ ...value, modifiedTime: 3 }) },
			{ category: 'titleMismatch', mutate: value => ({ ...value, title: 'Different' }) },
			{ category: 'readMismatch', mutate: value => ({ ...value, isRead: false }) },
			{ category: 'archiveMismatch', mutate: value => ({ ...value, isArchived: false }) },
			{ category: 'projectMismatch', mutate: value => ({ ...value, project: { uri: 'file:///other', displayName: 'Other' } }) },
			{ category: 'workspacelessMismatch', mutate: value => ({ ...value, workspaceless: false }) },
			{ category: 'adoptableMismatch', mutate: value => ({ ...value, ehcliAdoptable: false }) },
			{ category: 'multiRootMismatch', mutate: value => ({ ...value, multiRoot: { workspaceFile: 'file:///other.code-workspace' } }) },
			{ category: 'folderPickerMismatch', mutate: value => ({ ...value, folderPicker: { hidden: true } }) },
			{ category: 'changesMismatch', mutate: value => ({ ...value, changes: { additions: 10 } }) },
			{ category: 'githubMismatch', mutate: value => ({ ...value, github: { owner: 'other' } }) },
			{ category: 'gitMismatch', mutate: value => ({ ...value, git: { ...value.git, branchName: 'other' } }) },
			{ category: 'sourceControlMismatch', mutate: value => ({ ...value, sourceControl: { latestOutcome: 'pullRequest' } }) },
			{ category: 'artifactsMismatch', mutate: value => ({ ...value, artifacts: [] }) },
			{ category: 'orchestrationMismatch', mutate: value => ({ ...value, orchestration: { ...value.orchestration!, notifyOnIdle: 'always' } }) },
			{ category: 'workingDirectoriesMismatch', mutate: value => ({ ...value, workingDirectories: ['file:///other'] }) },
		];
		const legacySessions = cases.map((entry, index) => {
			const legacy = metadata(`mismatch-${index}`);
			seed(database, legacy, entry.mutate(source()));
			return legacy;
		});
		let repairs = 0;

		await createValidator(database, reporter, () => repairs++).validate(legacySessions, legacySessions.map(entry => registered(entry)));

		const counts = reporter.reports[0].counts;
		assert.deepStrictEqual({
			mismatchCounts: cases.map(entry => [entry.category, counts[entry.category]]),
			matched: counts.matched,
			repairs,
		}, {
			mismatchCounts: cases.map(entry => [entry.category, 1]),
			matched: 0,
			repairs: 1,
		});
	});

	test('reports identity, provider, and start-time mismatches with only catalog identity repairable', async () => {
		const database = disposables.add(new ShadowCatalogDatabase());
		const reporter = new RecordingReporter();
		const identity = metadata('identity');
		const provider = metadata('provider');
		const start = metadata('start');
		seed(database, identity);
		seed(database, provider);
		seed(database, start);
		database.catalogs.set(identity.session.toString(), { ...database.catalogs.get(identity.session.toString()) as IAgentHostDatabaseSessionV2, session: 'copilot:/other' });
		database.catalogs.set(provider.session.toString(), { ...database.catalogs.get(provider.session.toString()) as IAgentHostDatabaseSessionV2, provider: 'claude' });
		database.catalogs.set(start.session.toString(), { ...database.catalogs.get(start.session.toString()) as IAgentHostDatabaseSessionV2, startTime: 99 });
		let repairs = 0;

		await createValidator(database, reporter, () => repairs++).validate(
			[identity, provider, start],
			[
				registered(identity),
				registered(provider),
				registered(start),
			],
		);

		assert.deepStrictEqual({
			identityMismatch: reporter.reports[0].counts.identityMismatch,
			providerMismatch: reporter.reports[0].counts.providerMismatch,
			startTimeMismatch: reporter.reports[0].counts.startTimeMismatch,
			repairs,
		}, {
			identityMismatch: 1,
			providerMismatch: 1,
			startTimeMismatch: 1,
			repairs: 1,
		});

		test('validates central-only rows against durable top-level eligibility', async () => {
			const database = disposables.add(new ShadowCatalogDatabase());
			const reporter = new RecordingReporter();
			const backing = metadata('backing');
			const unexpectedTopLevel = metadata('unexpected-top-level');
			seed(database, backing, source({ isChatBacking: true }));
			seed(database, unexpectedTopLevel);
			let repairs = 0;

			await createValidator(database, reporter, () => repairs++).validate([], [
				registered(backing),
				registered(unexpectedTopLevel),
			]);

			assert.deepStrictEqual({
				total: reporter.reports[0].total,
				matched: reporter.reports[0].counts.matched,
				topLevelEligibilityMismatch: reporter.reports[0].counts.topLevelEligibilityMismatch,
				repairs,
			}, {
				total: 2,
				matched: 1,
				topLevelEligibilityMismatch: 1,
				repairs: 1,
			});
		});

		test('detects a backing catalog row that legacy lists as top-level', async () => {
			const database = disposables.add(new ShadowCatalogDatabase());
			const reporter = new RecordingReporter();
			const legacy = metadata('listed-backing');
			seed(database, legacy, source({ isChatBacking: true }));
			let repairs = 0;

			await createValidator(database, reporter, () => repairs++).validate([legacy], [registered(legacy)]);

			assert.deepStrictEqual({
				topLevelEligibilityMismatch: reporter.reports[0].counts.topLevelEligibilityMismatch,
				repairs,
			}, {
				topLevelEligibilityMismatch: 1,
				repairs: 1,
			});
		});
	});

	test('bounds central validation concurrency', async () => {
		const database = disposables.add(new ShadowCatalogDatabase());
		database.activeReadDelay = 5;
		const reporter = new RecordingReporter();
		const sessions = Array.from({ length: 8 }, (_, index) => metadata(`concurrency-${index}`));
		for (const legacy of sessions) {
			seed(database, legacy);
		}

		await createValidator(database, reporter, () => { }, 2).validate(sessions, sessions.map(entry => registered(entry)));

		assert.deepStrictEqual({
			maxConcurrent: database.maxConcurrentActiveReads,
			matched: reporter.reports[0].counts.matched,
		}, {
			maxConcurrent: 2,
			matched: 8,
		});
	});

	test('logs and isolates a rejected background validation', async () => {
		const database = disposables.add(new ShadowCatalogDatabase());
		const reporter = new RecordingReporter();
		const warning = new DeferredPromise<string>();
		const logService = new class extends NullLogService {
			override info(): void {
				throw new Error('validation failed');
			}

			override warn(message: string): void {
				warning.complete(message);
			}
		};
		const validator = new AgentHostCatalogShadowValidator(database, reporter, () => { }, logService);

		validator.schedule([], []);

		assert.strictEqual(await warning.p, '[AgentHostCatalogShadowValidator] Background validation failed');
	});
});
