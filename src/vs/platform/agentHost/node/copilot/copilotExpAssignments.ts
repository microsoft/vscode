/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotExpAssignmentResponse, ExpConfigEntry, ExpFlagValue } from '@github/copilot-sdk';
import { raceTimeout } from '../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { isValidAssignmentContext } from '../../../telemetry/common/assignmentContext.js';
import { CopilotCliVSCodeExperimentsEnabledKey } from '../../common/copilotCliConfig.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { ICopilotApiService, type FetchFunction, type ICopilotExpAccount } from '../shared/copilotApiService.js';

/** The ExP `extensionname` that VS Code's Copilot runtime progressions target. */
export const COPILOT_EXP_EXTENSION_NAME = 'CopilotVSCode';

/** Matches the runtime's default assignment request timeout. */
const COPILOT_EXP_TIMEOUT_MS = 2000;
const COPILOT_EXP_REFRESH_MS = 30 * 60 * 1000;
const COPILOT_EXP_RETRY_MS = 5 * 60 * 1000;
const MAX_CACHED_ACCOUNTS = 4;
const DEFAULT_CONFIG_ID = 'default';

export type CopilotExpAudience = 'github' | 'microsoft' | 'external';

/**
 * Maps a Copilot runtime version to the ExP version format, as the runtime does for `github_copilotcli_cliversion`:
 * `X.Y.Z` becomes `X.Y.Z.9999`, a prerelease `X.Y.Z-N...` becomes `X.Y.Z.N`, and development builds report
 * `999.0.0.9999`.
 */
export function toCopilotExpVersion(version: string): string {
	if (version === '0.0.1' || version.startsWith('0.0.1-') || version === '0.0.0-development') {
		return '999.0.0.9999';
	}
	const prerelease = /^(\d+\.\d+\.\d+)-(\d+)/.exec(version);
	if (prerelease) {
		return `${prerelease[1]}.${prerelease[2]}`;
	}
	const plain = /^(\d+\.\d+\.\d+)/.exec(version);
	return plain ? `${plain[1]}.9999` : version;
}

/** The ExP audience bucket, as the runtime derives it: GitHub staff, other (Microsoft) staff, or external. */
export function getCopilotExpAudience(account: Pick<ICopilotExpAccount, 'isStaff' | 'organizations'>): CopilotExpAudience {
	if (!account.isStaff) {
		return 'external';
	}
	return account.organizations.includes('github') ? 'github' : 'microsoft';
}

/**
 * The `userParams` of VS Code's assignment request. These mirror the Copilot CLI's, except that `extensionname` and
 * the audience dimension identify VS Code, and `github_copilotcli_cliversion` is the runtime version VS Code
 * bundles. CLI-specific parameters (experimentation opt-in, prerelease channel, first launch) are omitted.
 */
export function buildCopilotExpUserParams(account: ICopilotExpAccount, runtimeVersion: string): Record<string, string> {
	const audience = getCopilotExpAudience(account);
	return {
		copilottrackingid: account.trackingId,
		extensionname: COPILOT_EXP_EXTENSION_NAME,
		github_copilotcli_cliversion: toCopilotExpVersion(runtimeVersion),
		github_copilotvscode_audience: audience,
		gh_core_ghmsftorexternal: audience,
		...(account.copilotPlan ? { github_copilotcli_copilotplan: account.copilotPlan } : {}),
	};
}

/** The assignments URL for an `endpoints.exp` base URL: empty path segments dropped, fragment removed. */
export function resolveCopilotExpAssignmentsUrl(endpoint: string): string {
	const url = new URL(endpoint);
	const path = url.pathname.split('/').filter(segment => segment.length > 0).join('/');
	url.pathname = path ? `/${path}/api/v1/assignments` : '/api/v1/assignments';
	url.hash = '';
	return url.toString();
}

function typeName(value: unknown): string {
	return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Re-types a feature variable that the assignment service flattened to a string, like the runtime's
 * `parse_exp_flag_value`; an empty string stays a real (empty) assignment and non-strings pass through.
 */
function toExpFlagValue(value: unknown): ExpFlagValue {
	if (typeof value !== 'string') {
		return value as ExpFlagValue;
	}
	switch (value) {
		case 'true': return true;
		case 'false': return false;
		case 'null': return null;
	}
	if (value.trim().length > 0) {
		const number = Number(value);
		if (Number.isFinite(number)) {
			return number;
		}
	}
	return value;
}

function splitFeatureVariableKey(key: string): [configId: string, name: string] {
	const rest = key.startsWith('/') ? key.slice(1) : key;
	const separator = key.startsWith('/') ? rest.indexOf('/') : -1;
	if (separator > 0 && separator < rest.length - 1) {
		return [rest.slice(0, separator), rest.slice(separator + 1)];
	}
	return [DEFAULT_CONFIG_ID, rest];
}

/**
 * Maps the assignment service's `POST /api/v1/assignments` payload onto the `CopilotExpAssignmentResponse` shape
 * the runtime consumes, as the runtime's `map_tas_assignment_response_json` does. Absent or null fields default to
 * empty; a field of the wrong type throws.
 */
export function mapTasAssignmentResponse(response: unknown): CopilotExpAssignmentResponse {
	if (!isPlainObject(response)) {
		throw new Error('response is not an object');
	}

	const features: string[] = [];
	const flights: Record<string, string> = {};
	const variants = response.assignedVariants ?? [];
	if (!Array.isArray(variants)) {
		throw new Error(`assignedVariants: Expected array, received ${typeName(variants)}`);
	}
	for (const variant of variants) {
		if (!isPlainObject(variant)) {
			throw new Error('assignedVariants entry is not an object');
		}
		if (typeof variant.name !== 'string') {
			throw new Error(`assignedVariants[].name: Expected string, received ${typeName(variant.name)}`);
		}
		if (typeof variant.numberline !== 'string') {
			throw new Error(`assignedVariants[].numberline: Expected string, received ${typeName(variant.numberline)}`);
		}
		features.push(variant.name);
		flights[variant.numberline] = variant.name;
	}

	const configs: ExpConfigEntry[] = [];
	const featureVariables = response.featureVariables ?? {};
	if (!isPlainObject(featureVariables)) {
		throw new Error(`featureVariables: Expected object, received ${typeName(featureVariables)}`);
	}
	for (const [key, value] of Object.entries(featureVariables)) {
		const [configId, name] = splitFeatureVariableKey(key);
		let config = configs.find(entry => entry.Id === configId);
		if (!config) {
			config = { Id: configId, Parameters: {} };
			configs.push(config);
		}
		config.Parameters[name] = toExpFlagValue(value);
	}

	const dataVersion = response.dataVersion ?? 0;
	if (typeof dataVersion !== 'number') {
		throw new Error(`dataVersion: Expected number, received ${typeName(dataVersion)}`);
	}
	const assignmentContext = response.assignmentContext ?? '';
	if (typeof assignmentContext !== 'string') {
		throw new Error(`assignmentContext: Expected string, received ${typeName(assignmentContext)}`);
	}

	return {
		Features: features,
		Flights: flights,
		Configs: configs,
		FlightingVersion: dataVersion,
		AssignmentContext: assignmentContext,
	};
}

function assignmentContextEntries(context: string): string[] {
	return context.split(';').filter(entry => entry.length > 0);
}

/**
 * Combines VS Code's ExP assignment context with the Copilot runtime's. VS Code's entries come first, unchanged, and
 * the Copilot entries it doesn't already contain follow, so both experimentation groups can attribute the session's
 * telemetry and CAPI requests. An invalid Copilot context is dropped rather than corrupting VS Code's.
 */
export function combineAssignmentContexts(vscodeContext: string, copilotContext: string): string {
	if (!copilotContext || !isValidAssignmentContext(copilotContext)) {
		return vscodeContext;
	}
	if (!vscodeContext) {
		return copilotContext;
	}
	const entries = assignmentContextEntries(vscodeContext);
	const seen = new Set(entries);
	for (const entry of assignmentContextEntries(copilotContext)) {
		if (!seen.has(entry)) {
			seen.add(entry);
			entries.push(entry);
		}
	}
	return entries.join(';');
}

export interface ICopilotExpAssignmentsResolver {
	/**
	 * Resolves the Copilot runtime's ExP assignments for VS Code, or `undefined` when they are disabled or
	 * unavailable. Never rejects.
	 */
	resolve(githubToken: string | undefined): Promise<CopilotExpAssignmentResponse | undefined>;
}

interface IAssignmentsEntry {
	readonly githubToken: string;
	value: CopilotExpAssignmentResponse | undefined;
	refreshAt: number;
	pending: Promise<void> | undefined;
}

/**
 * Requests the Copilot runtime's ExP assignments with `extensionname=CopilotVSCode`, so the Copilot CLI's
 * experiments that opt in to VS Code reach the runtime VS Code bundles. Only the first resolve for an account
 * waits, for at most the request timeout; later ones return the cached assignment at once and refresh it in the
 * background. Every failure fails open: the previous assignment, or none.
 */
export class CopilotExpAssignments extends Disposable implements ICopilotExpAssignmentsResolver {

	private readonly _fetch: FetchFunction;
	/** Most recently used last; bounded because chats can use credentials other than the agent's. */
	private readonly _entries = new Map<string, IAssignmentsEntry>();

	constructor(
		fetchFn: FetchFunction | undefined,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IProductService private readonly _productService: IProductService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._fetch = fetchFn ?? globalThis.fetch;
		this._register(toDisposable(() => this._entries.clear()));
	}

	async resolve(githubToken: string | undefined): Promise<CopilotExpAssignmentResponse | undefined> {
		const runtimeVersion = this._productService.copilotVersions?.runtime;
		if (!githubToken || !runtimeVersion || this._store.isDisposed
			|| this._configurationService.getRootConfigValues?.()[CopilotCliVSCodeExperimentsEnabledKey] !== true) {
			return undefined;
		}
		let entry = this._entries.get(githubToken);
		if (entry) {
			this._entries.delete(githubToken);
			this._entries.set(githubToken, entry);
		} else {
			entry = { githubToken, value: undefined, refreshAt: 0, pending: undefined };
			this._entries.set(githubToken, entry);
			if (this._entries.size > MAX_CACHED_ACCOUNTS) {
				this._entries.delete(this._entries.keys().next().value!);
			}
			this._fetchInto(entry, runtimeVersion);
		}
		if (entry.value === undefined && entry.refreshAt === 0) {
			// Only an account's first resolution waits, and never longer than the request timeout.
			await raceTimeout(entry.pending!, COPILOT_EXP_TIMEOUT_MS);
			return entry.value;
		}
		if (!entry.pending && Date.now() >= entry.refreshAt) {
			this._fetchInto(entry, runtimeVersion);
		}
		return entry.value;
	}

	private _fetchInto(entry: IAssignmentsEntry, runtimeVersion: string): void {
		entry.pending = this._fetchAssignments(entry.githubToken, runtimeVersion).then(value => {
			entry.pending = undefined;
			if (value) {
				entry.value = value;
			}
			entry.refreshAt = Date.now() + (value ? COPILOT_EXP_REFRESH_MS : COPILOT_EXP_RETRY_MS);
		});
	}

	private async _fetchAssignments(githubToken: string, runtimeVersion: string): Promise<CopilotExpAssignmentResponse | undefined> {
		try {
			const account = await this._copilotApiService.resolveExpAccount?.(githubToken);
			if (!account) {
				this._logService.trace('[CopilotExpAssignments] No Copilot experimentation endpoint for this account');
				return undefined;
			}
			const response = await this._fetch(resolveCopilotExpAssignmentsUrl(account.endpoint), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userParams: buildCopilotExpUserParams(account, runtimeVersion) }),
				signal: AbortSignal.timeout(COPILOT_EXP_TIMEOUT_MS),
			});
			if (!response.ok) {
				throw new Error(`${response.status} ${response.statusText}`);
			}
			const assignments = mapTasAssignmentResponse(await response.json());
			this._logService.trace(`[CopilotExpAssignments] Fetched ${assignments.Features.length} Copilot experiment assignments`);
			return assignments;
		} catch (error) {
			this._logService.warn(`[CopilotExpAssignments] Failed to fetch Copilot experiment assignments: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}
}
