/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import * as vscode from 'vscode';
import { getExperimentationServiceFromConfig, IExperimentationFilterProvider, TargetPopulation } from 'vscode-tas-client';
import { platform, PlatformToString } from '../../../util/vs/base/common/platform';
import { isObject } from '../../../util/vs/base/common/types';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { IEnvService } from '../../env/common/envService';
import { packageJson } from '../../env/common/packagejson';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { FetcherService } from '../../networking/vscode-node/fetcherServiceImpl';
import { IExperimentationTelemetry, ITelemetryService } from '../common/telemetry';
import { BaseExperimentationService, RevocationGate, UserInfoStore } from '../node/baseExperimentationService';
import { createTasFetch } from './tasFetch';

function getTargetPopulation(isPreRelease: boolean): TargetPopulation {
	if (isPreRelease) {
		return TargetPopulation.Insiders;
	}

	return TargetPopulation.Public;
}

function trimVersionSuffix(version: string): string {
	return version.split('-')[0];
}

/**
 * Formats an ISO date into the `yyyymmddHH` form the experimentation backend expects
 * (10 digits: yyyymmddHH). Returns an empty string when unavailable.
 */
function formatReleaseDate(iso: string): string {
	if (!iso) {
		return '';
	}
	const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2})/.exec(iso);
	if (!match) {
		return '';
	}
	return match.slice(1, 5).join('');
}

/**
 * Reads and formats the product release date from `product.json`, or `undefined` on failure.
 */
function readReleaseDate(logService: ILogService, tag: string): string | undefined {
	try {
		const product = require(path.join(vscode.env.appRoot, 'product.json'));
		return formatReleaseDate(product.date ?? '');
	} catch (error) {
		logService.warn(`${tag} Failed to read product.json for release date: ${error}`);
		return undefined;
	}
}

const CopilotRelatedPluginVersionPrefix = 'X-Copilot-RelatedPluginVersion-';

export enum RelatedExtensionsFilter {
	CopilotRelatedPluginVersionCppTools = CopilotRelatedPluginVersionPrefix + 'msvscodecpptools',
	CopilotRelatedPluginVersionCMakeTools = CopilotRelatedPluginVersionPrefix + 'msvscodecmaketools',
	CopilotRelatedPluginVersionMakefileTools = CopilotRelatedPluginVersionPrefix + 'msvscodemakefiletools',
	CopilotRelatedPluginVersionCSharpDevKit = CopilotRelatedPluginVersionPrefix + 'msdotnettoolscsdevkit',
	CopilotRelatedPluginVersionPython = CopilotRelatedPluginVersionPrefix + 'mspythonpython',
	CopilotRelatedPluginVersionPylance = CopilotRelatedPluginVersionPrefix + 'mspythonvscodepylance',
	CopilotRelatedPluginVersionJavaPack = CopilotRelatedPluginVersionPrefix + 'vscjavavscodejavapack',
	CopilotRelatedPluginVersionTypescript = CopilotRelatedPluginVersionPrefix + 'vscodetypescriptlanguagefeatures',
	CopilotRelatedPluginVersionTypescriptNext = CopilotRelatedPluginVersionPrefix + 'msvscodevscodetypescriptnext',
	CopilotRelatedPluginVersionCSharp = CopilotRelatedPluginVersionPrefix + 'msdotnettoolscsharp',
	// Copilot related plugins
	CopilotRelatedPluginVersionCopilot = CopilotRelatedPluginVersionPrefix + 'githubcopilot',
	CopilotRelatedPluginVersionCopilotChat = CopilotRelatedPluginVersionPrefix + 'githubcopilotchat',
}

class RelatedExtensionsFilterProvider implements IExperimentationFilterProvider {
	constructor(private _logService: ILogService) { }

	private _getRelatedExtensions(): { name: string; version: string }[] {
		return [
			'ms-vscode.cpptools',
			'ms-vscode.cmake-tools',
			'ms-vscode.makefile-tools',
			'ms-dotnettools.csdevkit',
			'ms-python.python',
			'ms-python.vscode-pylance',
			'vscjava.vscode-java-pack',
			'vscode.typescript-language-features',
			'ms-vscode.vscode-typescript-next',
			'ms-dotnettools.csharp',
		]
			.map(name => {
				const extpj = vscode.extensions.getExtension(name)?.packageJSON as unknown;
				if (extpj && typeof extpj === 'object' && 'version' in extpj && typeof extpj.version === 'string') {
					return { name, version: extpj.version };
				}
			})
			.filter(plugin => plugin !== undefined);
	}

	getFilters(): Map<string, string> {
		this._logService.trace(`[RelatedExtensionsFilterProvider]::getFilters looking up related extensions`);
		const filters = new Map<string, string>();

		for (const extension of this._getRelatedExtensions()) {
			const filterName = CopilotRelatedPluginVersionPrefix + extension.name.replace(/[^A-Za-z]/g, '').toLowerCase();
			if (!Object.values<string>(RelatedExtensionsFilter).includes(filterName)) {
				this._logService.warn(`[RelatedExtensionsFilterProvider]::getFilters A filter could not be registered for the unrecognized related plugin "${extension.name}".`);
				continue;
			}
			filters.set(filterName, trimVersionSuffix(extension.version));
		}

		this._logService.trace(`[RelatedExtensionsFilterProvider]::getFilters Filters: ${JSON.stringify(Array.from(filters.entries()))}`);

		return filters;
	}
}

class CopilotExtensionsFilterProvider implements IExperimentationFilterProvider {
	constructor(private _logService: ILogService) { }

	getFilters(): Map<string, string> {
		const copilotExtensionversion = vscode.extensions.getExtension('github.copilot')?.packageJSON.version;
		const copilotChatExtensionVersion = packageJson.version;
		const completionsCoreVersion = packageJson.completionsCoreVersion;

		this._logService.trace(`[CopilotExtensionsFilterProvider]::getFilters Copilot Extension Version: ${copilotExtensionversion}, Copilot Chat Extension Version: ${copilotChatExtensionVersion}, Completions Core Version: ${completionsCoreVersion}`);
		const filters = new Map<string, string>();
		filters.set(RelatedExtensionsFilter.CopilotRelatedPluginVersionCopilot, copilotExtensionversion);
		filters.set(RelatedExtensionsFilter.CopilotRelatedPluginVersionCopilotChat, copilotChatExtensionVersion);
		filters.set('X-VSCode-CompletionsInChatExtensionVersion', completionsCoreVersion);
		return filters;
	}
}

class CopilotCompletionsFilterProvider implements IExperimentationFilterProvider {
	constructor(private _getCompletionsFilters: () => Map<string, string>, private _logService: ILogService) { }

	getFilters(): Map<string, string> {
		const filters = new Map<string, string>();
		for (const [key, value] of this._getCompletionsFilters()) {
			if (value !== '') {
				filters.set(key, value);
			}
		}
		this._logService.trace(`[CopilotCompletionsFilterProvider]::getFilters Filters: ${JSON.stringify(Array.from(filters.entries()))}`);
		return filters;
	}
}

class GithubAccountFilterProvider implements IExperimentationFilterProvider {
	constructor(private _userInfoStore: UserInfoStore, private _logService: ILogService) { }

	getFilters(): Map<string, string | undefined> {
		const orgListString = this._userInfoStore.organizationList?.join(',');
		this._logService.trace(`[GithubAccountFilterProvider]::getFilters SKU: ${this._userInfoStore.sku}, Internal Org: ${this._userInfoStore.internalOrg}, IsFcv1: ${this._userInfoStore.isFcv1}, IsSn: ${this._userInfoStore.isSn}, IsVscodeTeamMember: ${this._userInfoStore.isVscodeTeamMember}, OrganizationList: ${orgListString}`);
		const filters = new Map<string, string | undefined>();
		filters.set('X-GitHub-Copilot-SKU', this._userInfoStore.sku);
		filters.set('X-Microsoft-Internal-Org', this._userInfoStore.internalOrg);
		filters.set('X-GitHub-Copilot-IsFcv1', this._userInfoStore.isFcv1 ? '1' : '0');
		filters.set('X-GitHub-Copilot-IsSn', this._userInfoStore.isSn ? '1' : '0');
		filters.set('X-GitHub-Copilot-IsVscodeTeamMember', this._userInfoStore.isVscodeTeamMember ? '1' : '0');
		filters.set('X-GitHub-Copilot-OrganizationList', orgListString);
		return filters;
	}

}

class DevDeviceIdFilterProvider implements IExperimentationFilterProvider {
	constructor(private _devDeviceId: string) { }

	getFilters(): Map<string, string> {
		const filters = new Map<string, string>();
		filters.set('X-VSCode-DevDeviceId', this._devDeviceId);
		return filters;
	}
}

class PlatformAndReleaseDateFilterProvider implements IExperimentationFilterProvider {
	private readonly _releaseDate: string | undefined;

	constructor(
		private _logService: ILogService
	) {
		this._releaseDate = readReleaseDate(_logService, '[PlatformAndReleaseDateFilterProvider]::readReleaseDate');
	}

	getFilters(): Map<string, string> {
		const filters = new Map<string, string>();

		const platformString = PlatformToString(platform);
		filters.set('X-VSCode-Platform', platformString);

		if (this._releaseDate) {
			filters.set('X-VSCode-ReleaseDate', this._releaseDate);
		}

		this._logService.trace(`[PlatformAndReleaseDateFilterProvider]::getFilters Filters: ${JSON.stringify(Array.from(filters.entries()))}`);
		return filters;
	}
}

class WindowKindFilterProvider implements IExperimentationFilterProvider {
	constructor(
		private _logService: ILogService
	) { }

	getFilters(): Map<string, string> {
		const filters = new Map<string, string>();

		// Mirrors the core `X-VSCode-WindowKind` filter (`editor` or `agents`).
		const windowKind = vscode.workspace.isAgentSessionsWorkspace ? 'agents' : 'editor';
		filters.set('X-VSCode-WindowKind', windowKind);

		this._logService.trace(`[WindowKindFilterProvider]::getFilters Filters: ${JSON.stringify(Array.from(filters.entries()))}`);
		return filters;
	}
}

/**
 * Emits the Copilot-side filters for the new TAS assignments API (POST /api/v1/assignments)
 * using the new userParam key names. Reads the Copilot token fresh on each call so refreshed
 * assignments pick up account changes. The generic `vscode_core_*` app/build/extension/target
 * filters are added automatically by `vscode-tas-client`.
 */
class CopilotAssignmentsFilterProvider implements IExperimentationFilterProvider {
	private readonly _releaseDate: string | undefined;

	constructor(
		private readonly _copilotTokenStore: ICopilotTokenStore,
		private readonly _logService: ILogService
	) {
		this._releaseDate = readReleaseDate(_logService, '[CopilotAssignmentsFilterProvider]::readReleaseDate');
	}

	getFilters(): Map<string, string | undefined> {
		const token = this._copilotTokenStore.copilotToken;
		const internalOrg = token
			? (token.isVscodeTeamMember ? 'vscode' : token.isGitHubInternal ? 'github' : token.isMicrosoftInternal ? 'microsoft' : undefined)
			: undefined;

		const filters = new Map<string, string | undefined>();
		filters.set('vscode_core_platform', PlatformToString(platform));
		if (this._releaseDate) {
			filters.set('vscode_core_releasedate', this._releaseDate);
		}
		filters.set('vscode_core_windowkind', vscode.workspace.isAgentSessionsWorkspace ? 'agents' : 'editor');
		filters.set('devdeviceid', vscode.env.devDeviceId);
		filters.set('copilottrackingid', token?.getTokenValue('tid'));
		filters.set('github_core_organizationid', token?.organizationList.join(','));
		filters.set('github_core_businessid', token?.enterpriseList.join(','));
		filters.set('github_core_isghormsftstaff', internalOrg ? '1' : '0');
		filters.set('github_core_ghmsftorexternal', internalOrg === 'github' ? 'github' : (internalOrg === 'microsoft' || internalOrg === 'vscode') ? 'microsoft' : 'external');

		this._logService.trace(`[CopilotAssignmentsFilterProvider]::getFilters Filters: ${JSON.stringify(Array.from(filters.entries()))}`);
		return filters;
	}
}

export class MicrosoftExperimentationService extends BaseExperimentationService {
	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IVSCodeExtensionContext context: IVSCodeExtensionContext,
		@IEnvService envService: IEnvService,
		@ICopilotTokenStore copilotTokenStore: ICopilotTokenStore,
		@IConfigurationService configurationService: IConfigurationService,
		@IFetcherService fetcherService: IFetcherService,
		@ILogService logService: ILogService
	) {

		const id = context.extension.id;
		const version = context.extension.packageJSON['version'];
		const targetPopulation = getTargetPopulation(envService.isPreRelease());
		let self: MicrosoftExperimentationService | undefined = undefined;
		const delegateFn = (memento: vscode.Memento, userInfoStore: UserInfoStore, gate: RevocationGate) => {
			const wrappedMemento = new ExpMementoWrapper(memento, envService);
			const exp = copilotTokenStore.copilotToken?.endpoints?.exp;
			const assignmentsEndpoint = exp ? `${exp.replace(/\/+$/, '')}/api/v1/assignments` : undefined;
			// Route both the legacy (GET) and assignments (POST) requests through the extension's
			// fetcher service so they get proxy handling, retries/fallback, and the standard user-agent.
			const tasFetch = createTasFetch(fetcherService);
			return getExperimentationServiceFromConfig({
				extensionName: id,
				extensionVersion: version,
				targetPopulation,
				// Wrapped per generation so a superseded delegate's in-flight fetch cannot write
				// telemetry (e.g. overwrite `abexp.assignmentcontext`) after being replaced.
				telemetry: new RevocableExpTelemetry(telemetryService, gate),
				memento: wrappedMemento,
				filterProviders: [
					new GithubAccountFilterProvider(userInfoStore, logService),
					new RelatedExtensionsFilterProvider(logService),
					new CopilotExtensionsFilterProvider(logService),
					// The callback is called in super ctor. At that time, self/this is not initialized yet (but also, no filter could have been possibly set).
					new CopilotCompletionsFilterProvider(() => self?.getCompletionsFilters() ?? new Map(), logService),
					new DevDeviceIdFilterProvider(vscode.env.devDeviceId),
					new PlatformAndReleaseDateFilterProvider(logService),
					new WindowKindFilterProvider(logService),
				],
				fetch: tasFetch,
				assignmentsEndpoint,
				assignmentsFilterProviders: assignmentsEndpoint ? [new CopilotAssignmentsFilterProvider(copilotTokenStore, logService)] : undefined,
			});
		};

		super(delegateFn, context, copilotTokenStore, configurationService, logService);

		self = this; // This is now fully initialized.

		// The assignments endpoint is sourced from the Copilot token, which may arrive after
		// this service is created. Recreate the delegate when its `exp` endpoint changes.
		let currentExp = copilotTokenStore.copilotToken?.endpoints?.exp;
		this._register(copilotTokenStore.onDidStoreUpdate(() => {
			const token = copilotTokenStore.copilotToken;
			const newExp = token?.endpoints?.exp;
			if (newExp !== currentExp) {
				currentExp = newExp;
				this.recreateDelegate();
			}
		}));

		if (fetcherService instanceof FetcherService) {
			fetcherService.setExperimentationService(this);
		}
	}
}

/**
 * Wraps the telemetry service so a superseded delegate's writes are dropped once its generation
 * gate is revoked, preventing a stale in-flight fetch from overwriting shared telemetry
 * properties (notably `abexp.assignmentcontext`) after a newer delegate has replaced it.
 */
class RevocableExpTelemetry implements IExperimentationTelemetry {
	constructor(
		private readonly _actual: IExperimentationTelemetry,
		private readonly _gate: RevocationGate,
	) { }

	setSharedProperty(name: string, value: string): void {
		if (this._gate.isRevoked) {
			return;
		}
		this._actual.setSharedProperty(name, value);
	}

	postEvent(eventName: string, props: Map<string, string>): void {
		if (this._gate.isRevoked) {
			return;
		}
		this._actual.postEvent(eventName, props);
	}
}

class ExpMementoWrapper implements vscode.Memento {

	constructor(
		private readonly _actual: vscode.Memento,
		@IEnvService private readonly _envService: IEnvService
	) {
	}

	keys(): readonly string[] {
		return this._actual.keys();
	}

	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(key: string, defaultValue?: T): T | undefined {
		const value = this._actual.get(key, defaultValue);
		if (!isWrappedExpValue(value)) {
			return defaultValue;
		}
		if (value.extensionVersion !== this._envService.getVersion()) {
			// The extension has been updated since this value was stored, so ignore it.
			return defaultValue;
		}
		const age = (new Date()).getTime() - (new Date(value.savedDateTime)).getTime();
		const maxAge = 1000 * 60 * 60 * 24 * 3; // 3 days
		if (age > maxAge) {
			// The value is too old, so ignore it.
			return defaultValue;
		}
		return value.value as T;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	update(key: string, value: any): Thenable<void> {
		const wrapped: IWrappedExpValue = {
			$$$isWrappedExpValue: true,
			savedDateTime: (new Date()).toISOString(),
			extensionVersion: this._envService.getVersion(),
			value
		};
		return this._actual.update(key, wrapped);
	}
}

function isWrappedExpValue(obj: unknown): obj is IWrappedExpValue {
	return isObject(obj) && '$$$isWrappedExpValue' in obj;
}

interface IWrappedExpValue {
	$$$isWrappedExpValue: true;
	savedDateTime: string;
	extensionVersion: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value: any;
}
