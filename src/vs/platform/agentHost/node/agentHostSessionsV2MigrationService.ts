/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentProvider } from '../common/agent.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION } from './agentHostCatalogProjection.js';
import { AgentHostCatalogSyncService, IAgentHostCatalogSyncRequest, matchesAcknowledgedCatalogReceipt } from './agentHostCatalogSyncService.js';
import { AgentHostSessionsV2ExclusionReason, IAgentHostDatabase, IAgentHostDatabaseSession, IAgentHostDatabaseSessionsV2Exclusion, IAgentHostDatabaseSessionOptions, IAgentHostDatabaseSessionV2Receipt } from './agentHostDatabase.js';

const IMPORT_CONCURRENCY = 4;

export interface IAgentHostSessionsV2ProviderCandidate<T> {
	readonly session: URI;
	readonly startTime: number;
	readonly fingerprint: string;
	readonly value: T;
}

export interface IAgentHostSessionsV2Candidate<T> {
	readonly session: URI;
	readonly current: IAgentHostDatabaseSession | undefined;
	readonly legacy: IAgentHostDatabaseSession | undefined;
	readonly catalog: IAgentHostDatabaseSessionV2Receipt | undefined;
	readonly provider: IAgentHostSessionsV2ProviderCandidate<T> | undefined;
	readonly exclusion: IAgentHostDatabaseSessionsV2Exclusion | undefined;
}

export interface IAgentHostSessionsV2Exclusion {
	readonly reason: AgentHostSessionsV2ExclusionReason;
	readonly fingerprint: string;
}

export type AgentHostSessionsV2CandidateResolution<T> =
	| ({ readonly status: 'excluded' } & IAgentHostSessionsV2Exclusion)
	| { readonly status: 'incomplete' }
	| {
		readonly status: 'ready';
		readonly identity: IAgentHostDatabaseSessionOptions;
		readonly external: boolean;
		readonly request: IAgentHostCatalogSyncRequest;
		readonly value: T;
	};

export interface IAgentHostSessionsV2ImportedCandidate<T> {
	readonly session: URI;
	readonly external: boolean;
	readonly value: T;
}

export interface IAgentHostSessionsV2MigrationReport<T> {
	readonly skipped: number;
	readonly synchronized: number;
	readonly excluded: number;
	readonly incomplete: number;
	readonly failed: number;
	readonly marked: boolean;
	readonly imported: readonly IAgentHostSessionsV2ImportedCandidate<T>[];
}

type AgentHostSessionsV2MigrationStatus = 'skipped' | 'synchronized' | 'excluded' | 'incomplete' | 'failed';

interface IAgentHostSessionsV2MigrationOutcome<T> {
	readonly status: AgentHostSessionsV2MigrationStatus;
	readonly imported?: IAgentHostSessionsV2ImportedCandidate<T>;
}

export class AgentHostSessionsV2MigrationService<T> {

	constructor(
		private readonly _database: IAgentHostDatabase,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _catalogSyncService: AgentHostCatalogSyncService,
		private readonly _logService: ILogService,
	) { }

	async migrateProvider(
		provider: AgentProvider,
		enumerate: () => Promise<readonly IAgentHostSessionsV2ProviderCandidate<T>[] | undefined>,
		getPermanentExclusion: (candidate: IAgentHostSessionsV2Candidate<T>) => IAgentHostSessionsV2Exclusion | undefined,
		resolve: (candidate: IAgentHostSessionsV2Candidate<T>) => Promise<AgentHostSessionsV2CandidateResolution<T>>,
		force = false,
	): Promise<IAgentHostSessionsV2MigrationReport<T> | undefined> {
		const wasBackfilled = await this._database.isSessionsV2Backfilled(provider, AGENT_HOST_CATALOG_PAYLOAD_VERSION);
		const providerCandidates = !force && wasBackfilled ? [] : await enumerate();
		if (providerCandidates === undefined) {
			return undefined;
		}

		const [currentRegistrations, currentCatalog, legacyRegistrations, exclusions] = await Promise.all([
			this._database.listSessionV2RegistrationsForImport(),
			this._database.listSessionsV2Receipts(),
			this._database.listSessions(),
			this._database.listSessionsV2Exclusions(provider),
		]);
		const candidates = new Map<string, IAgentHostSessionsV2Candidate<T>>();
		const getCandidate = (session: string): IAgentHostSessionsV2Candidate<T> => {
			let candidate = candidates.get(session);
			if (!candidate) {
				candidate = {
					session: URI.parse(session),
					current: undefined,
					legacy: undefined,
					catalog: undefined,
					provider: undefined,
					exclusion: undefined,
				};
				candidates.set(session, candidate);
			}
			return candidate;
		};
		for (const current of currentRegistrations) {
			candidates.set(current.session, { ...getCandidate(current.session), current });
		}
		for (const catalog of currentCatalog) {
			candidates.set(catalog.session, { ...getCandidate(catalog.session), catalog });
		}
		for (const legacy of legacyRegistrations) {
			candidates.set(legacy.session, { ...getCandidate(legacy.session), legacy });
		}
		for (const providerCandidate of providerCandidates) {
			const session = providerCandidate.session.toString();
			candidates.set(session, { ...getCandidate(session), provider: providerCandidate });
		}
		for (const exclusion of exclusions) {
			candidates.set(exclusion.session, { ...getCandidate(exclusion.session), exclusion });
		}

		const providerCandidatesToMigrate = [...candidates.values()].filter(candidate => this._belongsToProvider(candidate, provider));
		const selectedCandidates = !force && wasBackfilled
			? providerCandidatesToMigrate.filter(candidate => {
				if (candidate.exclusion) {
					return false;
				}
				return (!candidate.current && !!candidate.legacy)
					|| (!!candidate.current && (
						candidate.current.external === undefined
						|| (!!candidate.legacy && candidate.legacy.external !== undefined && !this._registrationsEqual(candidate.current, candidate.legacy))
						|| !candidate.catalog
						|| candidate.catalog.payloadVersion !== AGENT_HOST_CATALOG_PAYLOAD_VERSION
					));
			})
			: providerCandidatesToMigrate;
		const limiter = new Limiter<IAgentHostSessionsV2MigrationOutcome<T>>(IMPORT_CONCURRENCY);
		const outcomes = await Promise.all(selectedCandidates
			.sort((a, b) => a.session.toString().localeCompare(b.session.toString()))
			.map(candidate => limiter.queue(() => this._migrateCandidate(
				provider,
				candidate,
				getPermanentExclusion,
				resolve,
				!wasBackfilled || force,
			))));
		const report: IAgentHostSessionsV2MigrationReport<T> = {
			skipped: outcomes.filter(outcome => outcome.status === 'skipped').length,
			synchronized: outcomes.filter(outcome => outcome.status === 'synchronized').length,
			excluded: outcomes.filter(outcome => outcome.status === 'excluded').length,
			incomplete: outcomes.filter(outcome => outcome.status === 'incomplete').length,
			failed: outcomes.filter(outcome => outcome.status === 'failed').length,
			marked: false,
			imported: outcomes.flatMap(outcome => outcome.imported ? [outcome.imported] : []),
		};
		if (report.incomplete === 0 && report.failed === 0) {
			if (!wasBackfilled) {
				await this._database.markSessionsV2Backfilled(provider, AGENT_HOST_CATALOG_PAYLOAD_VERSION);
			}
			return { ...report, marked: true };
		}
		return report;
	}

	private async _migrateCandidate(
		provider: AgentProvider,
		candidate: IAgentHostSessionsV2Candidate<T>,
		getPermanentExclusion: (candidate: IAgentHostSessionsV2Candidate<T>) => IAgentHostSessionsV2Exclusion | undefined,
		resolve: (candidate: IAgentHostSessionsV2Candidate<T>) => Promise<AgentHostSessionsV2CandidateResolution<T>>,
		enumerated: boolean,
	): Promise<IAgentHostSessionsV2MigrationOutcome<T>> {
		const session = candidate.session.toString();
		try {
			if (await this._database.isSessionTombstoned(session)) {
				return { status: 'excluded' };
			}
			const priorProviderExclusion = candidate.current && candidate.current.provider !== provider
				? await this._database.getSessionsV2Exclusion(candidate.current.provider, session)
				: undefined;
			if (priorProviderExclusion) {
				return { status: 'excluded' };
			}
			if (candidate.exclusion && this._isExclusionCurrent(candidate.exclusion, candidate.provider)) {
				return { status: 'excluded' };
			}
			if (candidate.exclusion) {
				await this._database.clearSessionsV2Exclusion(candidate.exclusion.provider, session);
			}
			const permanentExclusion = getPermanentExclusion(candidate);
			if (permanentExclusion) {
				await this._exclude(provider, candidate, permanentExclusion);
				return { status: 'excluded' };
			}
			const hasMatchingReceipt = candidate.catalog ? await this._hasMatchingReceipt(candidate.session, candidate.catalog) : false;
			let effectiveCandidate = candidate;
			if (candidate.current && candidate.legacy && candidate.legacy.external !== undefined && !this._registrationsEqual(candidate.current, candidate.legacy)
				&& !this._isLaterExplicitCurrentIncarnation(candidate.current, candidate.legacy, hasMatchingReceipt)) {
				await this._database.reconcileSessionV2RegistrationFromLegacy(session, candidate.legacy);
				effectiveCandidate = { ...candidate, current: candidate.legacy };
				if (candidate.legacy.external !== undefined && hasMatchingReceipt) {
					return { status: 'synchronized' };
				}
			}
			if (effectiveCandidate.current?.external !== undefined && effectiveCandidate.catalog && hasMatchingReceipt) {
				return { status: 'skipped' };
			}

			const resolution = await resolve(effectiveCandidate);
			if (resolution.status === 'excluded') {
				await this._exclude(provider, candidate, resolution);
				return { status: 'excluded' };
			}
			if (resolution.status === 'incomplete') {
				if (enumerated && !candidate.provider && !candidate.catalog && (candidate.current || candidate.legacy)) {
					await this._exclude(provider, candidate, { reason: 'providerAbsent', fingerprint: 'enumeration-v1' });
					return { status: 'excluded' };
				}
				return { status: 'incomplete' };
			}

			const newlyRegistered = !effectiveCandidate.current;
			if (!effectiveCandidate.current) {
				const registered = await this._database.registerSessionV2(session, resolution.identity, { checkTombstone: true });
				if (!registered) {
					return { status: 'excluded' };
				}
			} else if (effectiveCandidate.current.external === undefined) {
				await this._database.updateSessionV2External([{ session, external: resolution.external }]);
			}

			const result = await this._catalogSyncService.synchronize(candidate.session, resolution.request);
			return result.status === 'acknowledged'
				? {
					status: 'synchronized',
					...(newlyRegistered ? { imported: { session: candidate.session, external: resolution.external, value: resolution.value } } : {}),
				}
				: { status: 'incomplete' };
		} catch (error) {
			this._logService.warn(`[AgentHostSessionsV2Migration] Failed to import ${session}`, error);
			return { status: 'failed' };
		}
	}

	private _belongsToProvider(candidate: IAgentHostSessionsV2Candidate<T>, provider: AgentProvider): boolean {
		if (candidate.provider) {
			return true;
		}
		if (candidate.current && candidate.legacy && candidate.legacy.external !== undefined && !this._registrationsEqual(candidate.current, candidate.legacy)) {
			return candidate.legacy.provider === provider;
		}
		return (candidate.current?.provider ?? candidate.legacy?.provider ?? candidate.catalog?.provider ?? candidate.exclusion?.provider) === provider;
	}

	private _registrationsEqual(a: IAgentHostDatabaseSession, b: IAgentHostDatabaseSession): boolean {
		return a.provider === b.provider
			&& a.startTime === b.startTime
			&& a.external === b.external
			&& a.source === b.source;
	}

	private _isLaterExplicitCurrentIncarnation(current: IAgentHostDatabaseSession, legacy: IAgentHostDatabaseSession, hasMatchingReceipt: boolean): boolean {
		return hasMatchingReceipt
			&& current.source === 'explicit'
			&& current.startTime > legacy.startTime;
	}

	private _isExclusionCurrent(
		exclusion: IAgentHostDatabaseSessionsV2Exclusion,
		providerCandidate: IAgentHostSessionsV2ProviderCandidate<T> | undefined,
	): boolean {
		switch (exclusion.reason) {
			case 'backing':
			case 'subagent':
				return true;
			case 'providerAbsent':
				return providerCandidate === undefined;
			case 'staleExternal':
				return providerCandidate === undefined || providerCandidate.fingerprint === exclusion.fingerprint;
		}
	}

	private async _exclude(provider: AgentProvider, candidate: IAgentHostSessionsV2Candidate<T>, exclusion: IAgentHostSessionsV2Exclusion): Promise<void> {
		await this._database.excludeSessionV2({
			provider,
			session: candidate.session.toString(),
			reason: exclusion.reason,
			fingerprint: exclusion.fingerprint,
		});
	}

	private async _hasMatchingReceipt(session: URI, catalog: IAgentHostDatabaseSessionV2Receipt): Promise<boolean> {
		if (catalog.payloadVersion !== AGENT_HOST_CATALOG_PAYLOAD_VERSION) {
			return false;
		}
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return false;
		}
		try {
			return matchesAcknowledgedCatalogReceipt(await ref.object.getCatalogSyncSnapshot(), catalog);
		} finally {
			ref.dispose();
		}
	}
}
