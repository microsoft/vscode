/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../base/common/async.js';
import { equals } from '../../../base/common/objects.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession, type IAgentSessionMetadata } from '../common/agent.js';
import { readSessionArtifacts } from '../common/sessionArtifacts.js';
import { isSessionStatusArchived, isSessionStatusRead, readSessionEhcliAdoptable, readSessionFolderPickerDecision, readSessionGitHubState, readSessionGitState, readSessionMultiRootMetadata, readSessionOrchestration, readSessionSourceControlState, readSessionWorkspaceless } from '../common/state/sessionState.js';
import { parseAgentHostDatabaseCatalog, projectAgentHostCatalog, type IAgentHostCatalogSource } from './agentHostCatalogProjection.js';
import type { IAgentHostDatabase } from './agentHostDatabase.js';
import type { IRegisteredSession } from './agentSessionRegistry.js';

const DEFAULT_CONCURRENCY = 4;

export type AgentHostCatalogReadMode = 'legacy' | 'shadow' | 'centralWithFallback' | 'central';

export const agentHostCatalogShadowDiagnosticCategories = [
	'matched',
	'missing',
	'malformed',
	'validationError',
	'identityMismatch',
	'providerMismatch',
	'startTimeMismatch',
	'modifiedTimeMismatch',
	'titleMismatch',
	'readMismatch',
	'archiveMismatch',
	'projectMismatch',
	'workspacelessMismatch',
	'adoptableMismatch',
	'multiRootMismatch',
	'folderPickerMismatch',
	'changesMismatch',
	'githubMismatch',
	'gitMismatch',
	'sourceControlMismatch',
	'artifactsMismatch',
	'orchestrationMismatch',
	'workingDirectoriesMismatch',
	'topLevelEligibilityMismatch',
	'titleSourceNotComparable',
	'chatsNotComparable',
] as const;

export type AgentHostCatalogShadowDiagnosticCategory = typeof agentHostCatalogShadowDiagnosticCategories[number];

export interface IAgentHostCatalogShadowValidationReport {
	readonly total: number;
	readonly counts: Readonly<Record<AgentHostCatalogShadowDiagnosticCategory, number>>;
}

export interface IAgentHostCatalogShadowValidationReporter {
	report(report: IAgentHostCatalogShadowValidationReport): void;
}

export interface IAgentHostCatalogShadowValidatorOptions {
	readonly concurrency?: number;
}

interface ISessionValidation {
	readonly categories: readonly AgentHostCatalogShadowDiagnosticCategory[];
	readonly repair: boolean;
}

interface IValidationRequest {
	readonly legacySessions: readonly IAgentSessionMetadata[];
	readonly registeredSessions: readonly IRegisteredSession[];
}

const repairableMismatchCategories: ReadonlySet<AgentHostCatalogShadowDiagnosticCategory> = new Set([
	'identityMismatch',
	'modifiedTimeMismatch',
	'titleMismatch',
	'readMismatch',
	'archiveMismatch',
	'projectMismatch',
	'workspacelessMismatch',
	'adoptableMismatch',
	'multiRootMismatch',
	'folderPickerMismatch',
	'changesMismatch',
	'githubMismatch',
	'gitMismatch',
	'sourceControlMismatch',
	'artifactsMismatch',
	'orchestrationMismatch',
	'workingDirectoriesMismatch',
	'topLevelEligibilityMismatch',
]);

export class AgentHostCatalogShadowValidator {

	private readonly _concurrency: number;
	private _activeValidation: Promise<void> | undefined;
	private _pendingValidation: IValidationRequest | undefined;

	constructor(
		private readonly _catalogDatabase: IAgentHostDatabase,
		private readonly _reporter: IAgentHostCatalogShadowValidationReporter,
		private readonly _scheduleRepair: () => void,
		private readonly _logService: ILogService,
		options: IAgentHostCatalogShadowValidatorOptions = {},
	) {
		const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
		if (!Number.isInteger(concurrency) || concurrency <= 0) {
			throw new Error('Agent Host catalog shadow validation concurrency must be a positive integer');
		}
		this._concurrency = concurrency;
	}

	schedule(legacySessions: readonly IAgentSessionMetadata[], registeredSessions: readonly IRegisteredSession[]): void {
		this._pendingValidation = {
			legacySessions: [...legacySessions],
			registeredSessions: [...registeredSessions],
		};
		if (!this._activeValidation) {
			this._startPendingValidation();
		}
	}

	async validate(legacySessions: readonly IAgentSessionMetadata[], registeredSessions: readonly IRegisteredSession[]): Promise<void> {
		const registeredBySession = new Map(registeredSessions.map(registered => [registered.session.toString(), registered]));
		const legacyBySession = new Map(legacySessions.map(legacy => [legacy.session.toString(), legacy]));
		const limiter = new Limiter<ISessionValidation>(this._concurrency);
		const validations = await Promise.all([
			...legacySessions.map(legacy => limiter.queue(async () => {
				try {
					return await this._validateSession(legacy, registeredBySession.get(legacy.session.toString()));
				} catch {
					return { categories: ['validationError', 'titleSourceNotComparable', 'chatsNotComparable'], repair: true };
				}
			})),
			...registeredSessions
				.filter(registered => !legacyBySession.has(registered.session.toString()))
				.map(registered => limiter.queue(async () => {
					try {
						return await this._validateCentralOnlySession(registered);
					} catch {
						return { categories: ['validationError', 'titleSourceNotComparable', 'chatsNotComparable'], repair: true };
					}
				})),
		]);
		const counts = this._emptyCounts();
		let repair = false;
		for (const validation of validations) {
			repair ||= validation.repair;
			for (const category of validation.categories) {
				counts[category]++;
			}
		}
		const report: IAgentHostCatalogShadowValidationReport = { total: validations.length, counts };
		this._logService.info(`[AgentHostCatalogShadowValidator] ${JSON.stringify(report)}`);
		if (repair) {
			try {
				this._scheduleRepair();
			} catch {
				this._logService.warn('[AgentHostCatalogShadowValidator] Failed to schedule catalog reconciliation');
			}
		}
		try {
			this._reporter.report(report);
		} catch {
			this._logService.warn('[AgentHostCatalogShadowValidator] Diagnostic reporter failed');
		}
	}

	private _startPendingValidation(): void {
		const request = this._pendingValidation;
		if (!request) {
			return;
		}
		this._pendingValidation = undefined;
		const validation = Promise.resolve().then(() => this.validate(request.legacySessions, request.registeredSessions));
		this._activeValidation = validation;
		void validation.then(
			() => this._completeValidation(validation),
			() => {
				this._logService.warn('[AgentHostCatalogShadowValidator] Background validation failed');
				this._completeValidation(validation);
			},
		);
	}

	private _completeValidation(validation: Promise<void>): void {
		if (this._activeValidation !== validation) {
			return;
		}
		this._activeValidation = undefined;
		this._startPendingValidation();
	}

	private async _validateSession(legacy: IAgentSessionMetadata, registered: IRegisteredSession | undefined): Promise<ISessionValidation> {
		const categories: AgentHostCatalogShadowDiagnosticCategory[] = ['titleSourceNotComparable', 'chatsNotComparable'];
		const session = legacy.session.toString();
		if (!registered) {
			categories.push('missing');
			return { categories, repair: true };
		}
		const catalog = await this._catalogDatabase.getSessionV2(session);
		if (!catalog) {
			categories.push('missing');
			return { categories, repair: true };
		}
		if (catalog.session !== session) {
			categories.push('identityMismatch');
			return { categories, repair: true };
		}
		if (catalog.isChatBacking) {
			categories.push('topLevelEligibilityMismatch');
			return { categories, repair: true };
		}
		const parsed = parseAgentHostDatabaseCatalog(catalog);
		if (!parsed.ok) {
			categories.push('malformed');
			return { categories, repair: true };
		}

		const legacyProjection = projectAgentHostCatalog(this._legacySource(legacy), {
			session,
			sessionGeneration: catalog.sessionGeneration,
			sourceRevision: catalog.sourceRevision,
		});
		if (!legacyProjection.ok) {
			categories.push('validationError');
			return { categories, repair: false };
		}

		const expected = legacyProjection.value.source;
		const actual = parsed.value.source;
		if (AgentSession.provider(legacy.session) !== registered.provider || registered.provider !== catalog.provider) {
			categories.push('providerMismatch');
		}
		if (legacy.startTime !== registered.startTime || registered.startTime !== catalog.startTime) {
			categories.push('startTimeMismatch');
		}
		this._compare(categories, 'modifiedTimeMismatch', expected.modifiedTime, actual.modifiedTime);
		this._compare(categories, 'titleMismatch', expected.title, actual.title);
		this._compare(categories, 'readMismatch', expected.isRead, actual.isRead);
		this._compare(categories, 'archiveMismatch', expected.isArchived, actual.isArchived);
		this._compare(categories, 'projectMismatch', expected.project, actual.project);
		this._compare(categories, 'workspacelessMismatch', expected.workspaceless, actual.workspaceless);
		this._compare(categories, 'adoptableMismatch', expected.ehcliAdoptable, actual.ehcliAdoptable);
		this._compare(categories, 'multiRootMismatch', expected.multiRoot, actual.multiRoot);
		this._compare(categories, 'folderPickerMismatch', expected.folderPicker, actual.folderPicker);
		this._compare(categories, 'changesMismatch', expected.changes, actual.changes);
		this._compare(categories, 'githubMismatch', expected.github, actual.github);
		this._compare(categories, 'gitMismatch', expected.git, actual.git);
		this._compare(categories, 'sourceControlMismatch', expected.sourceControl, actual.sourceControl);
		this._compare(categories, 'artifactsMismatch', expected.artifacts, actual.artifacts);
		this._compare(categories, 'orchestrationMismatch', expected.orchestration, actual.orchestration);
		this._compare(categories, 'workingDirectoriesMismatch', expected.workingDirectories, actual.workingDirectories);

		const mismatches = categories.filter(category => category.endsWith('Mismatch'));
		if (mismatches.length === 0) {
			categories.push('matched');
		}
		return {
			categories,
			repair: mismatches.some(category => repairableMismatchCategories.has(category)),
		};
	}

	private async _validateCentralOnlySession(registered: IRegisteredSession): Promise<ISessionValidation> {
		const categories: AgentHostCatalogShadowDiagnosticCategory[] = ['titleSourceNotComparable', 'chatsNotComparable'];
		const catalog = await this._catalogDatabase.getSessionV2(registered.session.toString());
		if (!catalog) {
			categories.push('missing');
			return { categories, repair: true };
		}
		if (catalog.isChatBacking) {
			categories.push('matched');
			return { categories, repair: false };
		}
		categories.push('topLevelEligibilityMismatch');
		return { categories, repair: true };
	}

	private _legacySource(legacy: IAgentSessionMetadata): IAgentHostCatalogSource {
		return {
			modifiedTime: legacy.modifiedTime,
			title: legacy.summary || undefined,
			isRead: isSessionStatusRead(legacy.status),
			isArchived: isSessionStatusArchived(legacy.status),
			project: legacy.project ? { uri: legacy.project.uri.toString(), displayName: legacy.project.displayName } : undefined,
			workspaceless: readSessionWorkspaceless(legacy._meta),
			ehcliAdoptable: readSessionEhcliAdoptable(legacy._meta),
			multiRoot: readSessionMultiRootMetadata(legacy._meta),
			folderPicker: readSessionFolderPickerDecision(legacy._meta),
			changes: legacy.changes,
			github: readSessionGitHubState(legacy._meta),
			git: readSessionGitState(legacy._meta),
			sourceControl: readSessionSourceControlState(legacy._meta),
			artifacts: readSessionArtifacts(legacy._meta),
			orchestration: readSessionOrchestration(legacy._meta),
			workingDirectories: legacy.workingDirectories?.map(directory => directory.toString()) ?? [],
			chats: [],
		};
	}

	private _compare(
		categories: AgentHostCatalogShadowDiagnosticCategory[],
		category: AgentHostCatalogShadowDiagnosticCategory,
		expected: unknown,
		actual: unknown,
	): void {
		if (!equals(expected, actual)) {
			categories.push(category);
		}
	}

	private _emptyCounts(): Record<AgentHostCatalogShadowDiagnosticCategory, number> {
		return {
			matched: 0,
			missing: 0,
			malformed: 0,
			validationError: 0,
			identityMismatch: 0,
			providerMismatch: 0,
			startTimeMismatch: 0,
			modifiedTimeMismatch: 0,
			titleMismatch: 0,
			readMismatch: 0,
			archiveMismatch: 0,
			projectMismatch: 0,
			workspacelessMismatch: 0,
			adoptableMismatch: 0,
			multiRootMismatch: 0,
			folderPickerMismatch: 0,
			changesMismatch: 0,
			githubMismatch: 0,
			gitMismatch: 0,
			sourceControlMismatch: 0,
			artifactsMismatch: 0,
			orchestrationMismatch: 0,
			workingDirectoriesMismatch: 0,
			topLevelEligibilityMismatch: 0,
			titleSourceNotComparable: 0,
			chatsNotComparable: 0,
		};
	}
}
