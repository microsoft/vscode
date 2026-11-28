/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';
import { ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import type { ClientForwardingSocket, ClientGitCredentialOperation } from '../common/clientForwardingProtocol.js';

/*
 * Telemetry of the forwarding a client's connection sets up and uses, with the vocabulary of the Dev Containers
 * extension's `forward*` resolver properties and `forwardingUse` event, so the two can be compared. Only fixed values are
 * reported: no host names, user names, paths, URLs or credentials.
 */

/** `local` when the client's agent is forwarded, the Dev Containers extension's value for a local host's, else why not. */
export type ClientForwardingSshAgentSetup = 'local' | 'none' | 'withheld' | 'failed';
export type ClientForwardingGpgAgentSetup = ClientForwardingSshAgentSetup | 'windows' | 'noGnuPG' | 'ownKeys';
export type ClientForwardingGitCredentialHelperSetup = 'environment' | 'legacyEnvironment' | 'noGit' | 'failed' | 'withheld';
export type ClientForwardingGitConfigSetup = 'copied' | 'xdgOnly' | 'ownConfig' | 'none' | 'withheld' | 'sandboxed' | 'noGit' | 'failed';
export type ClientForwardingGitIdentitySetup = 'set' | 'existing' | 'none' | 'noGit' | 'failed';

/** What a client's connection forwards. */
export interface IClientForwardingSetup {
	readonly forwardSshAgent: ClientForwardingSshAgentSetup;
	readonly forwardGpgAgent: ClientForwardingGpgAgentSetup;
	readonly forwardKeyboxd: 'local' | 'none';
	readonly forwardGitCredentialHelper: ClientForwardingGitCredentialHelperSetup;
	readonly forwardGitConfig: ClientForwardingGitConfigSetup;
	readonly forwardGitIdentity: ClientForwardingGitIdentitySetup;
}

/**
 * How a connection to an agent socket was served: forwarded to the client (`success` or `error`), to the agent the agent
 * host had (`fallback`), by an SSH agent without keys (`emptyAgent`), or closed (`noClient`), also when a session is
 * sandboxed (`sandboxed`).
 */
export type ClientForwardingSocketOutcome = 'success' | 'error' | 'fallback' | 'emptyAgent' | 'noClient' | 'sandboxed';
export type ClientGitCredentialOutcome = 'credential' | 'none' | 'success' | 'error' | 'noClient' | 'sandboxed';
export type GitProtocolCategory = 'https' | 'http' | 'other' | 'none';
export type GitHostCategory = 'github' | 'ghe' | 'azureDevOps' | 'gitlab' | 'bitbucket' | 'other' | 'none';

interface IClientForwardingUse {
	readonly service: ClientForwardingSocket | 'git-credential-helper';
	readonly operation: 'connect' | ClientGitCredentialOperation;
	readonly outcome: ClientForwardingSocketOutcome | ClientGitCredentialOutcome;
	readonly protocol?: GitProtocolCategory;
	readonly hostCategory?: GitHostCategory;
}

type ClientForwardingSetupEvent = {
	clientId: string;
	forwardSshAgent: string;
	forwardGpgAgent: string;
	forwardKeyboxd: string;
	forwardGitCredentialHelper: string;
	forwardGitConfig: string;
	forwardGitIdentity: string;
};

type ClientForwardingSetupClassification = {
	owner: 'chrmarti';
	comment: 'Reports which of a client\'s agents, Git credentials and Git configuration an agent host started to forward them, e.g., in a Dev Container, forwards, like the forward* properties of the Dev Containers extension\'s resolver event. Sent once per client connection. Each value is local when the client\'s is forwarded, otherwise the first reason that applies.';
	clientId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The opaque AHP client identifier, which stays the same across reconnects of a connection, to join with agentHost.forwardingUse and agentHost.clientConnection.' };
	forwardSshAgent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the client\'s SSH agent is forwarded: local, none (the client has none), withheld (the client forwards only the Git identity, e.g., to a sandboxed container or with the setting off) or failed.' };
	forwardGpgAgent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the client\'s GPG agent is forwarded: local, none (the client has none), withheld, windows (not forwarded to Windows), noGnuPG (no GnuPG agent socket), ownKeys (GnuPG has private keys of its own) or failed.' };
	forwardKeyboxd: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the client\'s GnuPG keyboxd is forwarded: local or none.' };
	forwardGitCredentialHelper: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the Git credential helper forwarding to the client is configured: environment (GIT_CONFIG_COUNT), legacyEnvironment (GIT_CONFIG_PARAMETERS, for Git before 2.31), noGit (no Git), failed or withheld.' };
	forwardGitConfig: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the client\'s global Git configuration was copied: copied (.gitconfig, possibly with the XDG configuration), xdgOnly (only the XDG configuration), ownConfig (the agent host\'s own configuration was kept), none (the client has none), withheld, sandboxed (a session is sandboxed, so only the identity is set), noGit or failed.' };
	forwardGitIdentity: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the client\'s Git user name or email was set: set (also over a copied configuration with the same), existing (the agent host\'s own identity was kept), none (the client has none), noGit or failed.' };
};

type ClientForwardingUseEvent = {
	clientId: string | undefined;
	service: string;
	operation: string;
	outcome: string;
	protocol: string | undefined;
	hostCategory: string | undefined;
};

type ClientForwardingUseClassification = {
	owner: 'chrmarti';
	comment: 'Reports the first use per client connection of each forwarded service with a given operation, outcome, protocol and host category, like the Dev Containers extension\'s forwardingUse event. The agent host\'s own import of the client\'s GPG keys is not counted.';
	clientId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The opaque AHP client identifier of the client serving the request, else of the newest connected client, to join with agentHost.forwardingSetup. Absent when no client is connected.' };
	service: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed id of the forwarded service a process of the agent host used: ssh-agent, gpg-agent, keyboxd or git-credential-helper.' };
	operation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed operation: connect for agent sockets; get, store or erase for the Git credential helper.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed outcome. Sockets: success or error (connecting to the client\'s agent), fallback (the agent the agent host had), emptyAgent (an SSH agent without keys), noClient or sandboxed (not forwarded because a session is sandboxed). Git credentials: credential or none for gets, success for other operations, error, noClient or sandboxed.' };
	protocol: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Protocol of a Git credential request: https, http, other or none.' };
	hostCategory: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed category of the host of a Git credential request: github, ghe, azureDevOps, gitlab, bitbucket, other or none.' };
};

/**
 * Reports the forwarding of client connections: what each sets up, and the first use of each service with a given
 * operation and outcome per client connection, which survives reconnects as the client keeps its identifier.
 */
export class ClientForwardingTelemetry {

	private readonly _setups = new Set<string>();
	private readonly _uses = new Set<string>();

	constructor(
		private readonly _telemetryService: ITelemetryService,
		private readonly _logService: ILogService,
	) { }

	/** Reports what a client's connection forwards, once per client. */
	reportSetup(clientId: string, getSetup: () => IClientForwardingSetup): void {
		this._report(() => {
			if (this._setups.has(clientId)) {
				return;
			}
			const setup = getSetup();
			this._setups.add(clientId);
			this._telemetryService.publicLog2<ClientForwardingSetupEvent, ClientForwardingSetupClassification>('agentHost.forwardingSetup', {
				clientId,
				forwardSshAgent: setup.forwardSshAgent,
				forwardGpgAgent: setup.forwardGpgAgent,
				forwardKeyboxd: setup.forwardKeyboxd,
				forwardGitCredentialHelper: setup.forwardGitCredentialHelper,
				forwardGitConfig: setup.forwardGitConfig,
				forwardGitIdentity: setup.forwardGitIdentity,
			});
		});
	}

	reportSocketUse(clientId: string | undefined, service: ClientForwardingSocket, outcome: ClientForwardingSocketOutcome): void {
		this._reportUse(clientId, () => ({ service, operation: 'connect', outcome }));
	}

	/** @param input The request Git sent the credential helper, of which only the protocol and host category are reported. */
	reportGitCredentialUse(clientId: string | undefined, operation: ClientGitCredentialOperation, input: string, outcome: ClientGitCredentialOutcome): void {
		this._reportUse(clientId, () => {
			const { protocol, host } = parseGitCredentialRequest(input);
			return { service: 'git-credential-helper', operation, outcome, protocol: categorizeProtocol(protocol), hostCategory: categorizeGitHost(host) };
		});
	}

	private _reportUse(clientId: string | undefined, getUse: () => IClientForwardingUse): void {
		this._report(() => {
			const { service, operation, outcome, protocol, hostCategory } = getUse();
			const key = JSON.stringify([clientId, service, operation, outcome, protocol, hostCategory]);
			if (this._uses.has(key)) {
				return;
			}
			this._uses.add(key);
			this._telemetryService.publicLog2<ClientForwardingUseEvent, ClientForwardingUseClassification>('agentHost.forwardingUse', {
				clientId,
				service,
				operation,
				outcome,
				protocol,
				hostCategory,
			});
		});
	}

	private _report(report: () => void): void {
		// Telemetry must not interfere with forwarding.
		try {
			if (this._telemetryService.telemetryLevel >= TelemetryLevel.USAGE) {
				report();
			}
		} catch (error) {
			this._logService.error('[AgentHostClientForwarding] Failed to report telemetry', error);
		}
	}
}

/** The outcome of a Git credential operation the client answered with `output`. */
export function getGitCredentialOutcome(operation: ClientGitCredentialOperation, output: string): ClientGitCredentialOutcome {
	if (operation === 'get') {
		return /^(password|credential)=./m.test(output) ? 'credential' : 'none';
	}
	return 'success';
}

/** The protocol and host of a Git credential helper request, also from its `url`. */
export function parseGitCredentialRequest(input: string): { protocol?: string; host?: string } {
	const values = new Map<string, string>();
	for (const line of input.split('\n')) {
		const index = line.indexOf('=');
		if (index > 0) {
			values.set(line.substring(0, index), line.substring(index + 1).replace(/\r$/, ''));
		}
	}
	let protocol = values.get('protocol');
	let host = values.get('host');
	const url = values.get('url');
	if (url && (!protocol || !host)) {
		try {
			const parsed = new URL(url);
			protocol ||= parsed.protocol.replace(/:$/, '');
			host ||= parsed.host;
		} catch {
			// Not a URL.
		}
	}
	return { protocol, host };
}

export function categorizeProtocol(protocol: string | undefined): GitProtocolCategory {
	const normalized = protocol?.trim().toLowerCase();
	if (!normalized) {
		return 'none';
	}
	return normalized === 'https' || normalized === 'http' ? normalized : 'other';
}

export function categorizeGitHost(host: string | undefined): GitHostCategory {
	const hostname = normalizeHostname(host);
	if (!hostname) {
		return 'none';
	}
	if (isDomainOrSubdomain(hostname, 'github.com')) {
		return 'github';
	}
	if (isDomainOrSubdomain(hostname, 'ghe.com')) {
		return 'ghe';
	}
	if (isDomainOrSubdomain(hostname, 'dev.azure.com') || isDomainOrSubdomain(hostname, 'visualstudio.com')) {
		return 'azureDevOps';
	}
	if (isDomainOrSubdomain(hostname, 'gitlab.com')) {
		return 'gitlab';
	}
	if (isDomainOrSubdomain(hostname, 'bitbucket.org')) {
		return 'bitbucket';
	}
	return 'other';
}

function normalizeHostname(host: string | undefined): string | undefined {
	const lower = host?.trim().toLowerCase();
	if (!lower) {
		return undefined;
	}
	if (lower.startsWith('[')) {
		const end = lower.indexOf(']');
		return end !== -1 ? lower.substring(0, end + 1) : lower;
	}
	return lower.replace(/:\d*$/, '').replace(/\.$/, '') || undefined;
}

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
	return hostname === domain || hostname.endsWith(`.${domain}`);
}
