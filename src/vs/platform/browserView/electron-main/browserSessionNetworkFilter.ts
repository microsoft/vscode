/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CallbackResponse, OnBeforeRequestListenerDetails } from 'electron';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IAgentNetworkFilterService } from '../../networkFilter/common/networkFilterService.js';

type RetainedPolicyErrors = { malformedRequest: boolean; deniedUris: Map<string, URI> };
type AgentAction = { webContentsId: number; webContentsIds: Set<number>; policyErrors: RetainedPolicyErrors };

type RequestClassification = {
	readonly isMainFrame: boolean;
	readonly matchingAgentActions: readonly AgentAction[];
	readonly attributableFilteredReferrerOwners: readonly number[];
	readonly policyErrorTargets: readonly number[];
	readonly shouldFilter: boolean;
};

type RequestClassificationContext = {
	readonly webContentsId: number | undefined;
	readonly webContentsWasKnown: boolean;
	readonly webContentsIsFiltered: boolean;
	readonly referrerOwners: ReadonlySet<number> | undefined;
	readonly filteredReferrerOwners: readonly number[];
	readonly isMainFrame: boolean;
	readonly agentActions: readonly AgentAction[];
	readonly hasFilteredWebContents: boolean;
};

function classifyRequest(context: RequestClassificationContext): RequestClassification {
	const { webContentsId, webContentsWasKnown, webContentsIsFiltered, referrerOwners, filteredReferrerOwners, isMainFrame, agentActions, hasFilteredWebContents } = context;
	const shouldUseReferrerOwnership = webContentsId === undefined || !webContentsWasKnown;
	const attributableFilteredReferrerOwners = shouldUseReferrerOwnership ? filteredReferrerOwners : [];
	let matchingAgentActions: readonly AgentAction[] = agentActions.filter(action =>
		(webContentsId !== undefined && action.webContentsIds.has(webContentsId))
		|| (shouldUseReferrerOwnership && referrerOwners !== undefined && [...referrerOwners].some(id => action.webContentsIds.has(id)))
	);
	if (
		matchingAgentActions.length === 0
		&& agentActions.length > 0
		&& referrerOwners === undefined
		&& (webContentsId === undefined || (isMainFrame && !webContentsWasKnown))
	) {
		matchingAgentActions = agentActions;
	}

	const isAgentRequest = matchingAgentActions.length > 0;
	const shouldFilterMainFrame = isMainFrame && (
		isAgentRequest
		|| webContentsIsFiltered
		|| attributableFilteredReferrerOwners.length > 0
		|| (!webContentsWasKnown && referrerOwners === undefined && hasFilteredWebContents)
	);
	const policyErrorTargets = isAgentRequest ? []
		: isMainFrame
			? [...new Set([
				...(webContentsId !== undefined && (webContentsIsFiltered || !webContentsWasKnown) ? [webContentsId] : []),
				...attributableFilteredReferrerOwners,
			])]
			: webContentsId === undefined
				? referrerOwners ? filteredReferrerOwners : []
				: webContentsIsFiltered ? [webContentsId] : [];

	return {
		isMainFrame,
		matchingAgentActions,
		attributableFilteredReferrerOwners,
		policyErrorTargets,
		// Unknown ownerless requests fail closed whenever tracked content exists.
		shouldFilter: shouldFilterMainFrame
			|| isAgentRequest
			|| policyErrorTargets.length > 0
			|| (!webContentsWasKnown && referrerOwners === undefined && hasFilteredWebContents),
	};
}

export class BrowserSessionNetworkFilter {
	private readonly filteredWebContents = new Set<number>();
	private readonly policyErrors = new Map<number, RetainedPolicyErrors>();
	private readonly navigationPolicyErrors = new Map<number, RetainedPolicyErrors>();
	private readonly agentActions = new Map<string, AgentAction>();
	private readonly derivedFilterOwners = new Map<number, Set<number>>();
	private readonly derivedWebContentsByOwner = new Map<number, Set<number>>();
	private readonly webContentsByOrigin = new Map<string, Set<number>>();
	private readonly originsByWebContents = new Map<number, Set<string>>();
	private readonly knownWebContents = new Set<number>();
	private readonly observedWebContents = new Set<number>();

	constructor(private readonly agentNetworkFilterService: IAgentNetworkFilterService) { }

	registerWebContents(webContentsId: number): void {
		this.knownWebContents.add(webContentsId);
	}

	unregisterWebContents(webContentsId: number): void {
		this.knownWebContents.delete(webContentsId);
	}

	setFiltering(webContentsId: number, enabled: boolean): void {
		if (enabled) {
			this.filteredWebContents.add(webContentsId);
		} else {
			this.filteredWebContents.delete(webContentsId);
			this.clearDerivedFilteringOwner(webContentsId);
			this.policyErrors.delete(webContentsId);
			this.navigationPolicyErrors.delete(webContentsId);
			this.clearWebContentsOrigins(webContentsId);
		}
	}

	setAgentAction(webContentsId: number, sourceId: string, enabled: boolean): void {
		if (enabled) {
			this.agentActions.set(sourceId, { webContentsId, webContentsIds: new Set([webContentsId]), policyErrors: this.createPolicyErrors() });
		} else {
			this.agentActions.delete(sourceId);
		}
	}

	getPolicyError(webContentsId: number, navigationOnly = false): string | undefined {
		if (!navigationOnly) {
			const policyError = this.getPolicyErrorFromMap(this.policyErrors, webContentsId);
			if (policyError) {
				return policyError;
			}
		}
		const navigationPolicyError = this.getPolicyErrorFromMap(this.navigationPolicyErrors, webContentsId);
		if (navigationPolicyError || navigationOnly) {
			return navigationPolicyError;
		}
		for (const action of this.agentActions.values()) {
			if (action.webContentsId === webContentsId) {
				const error = this.getCurrentPolicyError(action.policyErrors);
				if (error) {
					return error;
				}
			}
		}
		return undefined;
	}

	onBeforeRequest(details: OnBeforeRequestListenerDetails, callback: (response: CallbackResponse) => void): void {
		const webContents = details.webContents;
		const webContentsId = this.getWebContentsId(details, webContents);
		const webContentsWasKnown = webContentsId !== undefined && (
			this.knownWebContents.has(webContentsId)
			|| this.isWebContentsFiltered(webContentsId)
			|| this.observedWebContents.has(webContentsId)
			|| this.originsByWebContents.has(webContentsId)
		);
		const referrerOwners = this.getReferrerOwners(details.referrer);
		if (webContentsId !== undefined) {
			this.recordRequestOrigins(webContentsId, details);
			if (webContents && !this.observedWebContents.has(webContentsId)) {
				this.observedWebContents.add(webContentsId);
				webContents.once('destroyed', () => {
					this.knownWebContents.delete(webContentsId);
					this.observedWebContents.delete(webContentsId);
					this.filteredWebContents.delete(webContentsId);
					this.clearDerivedFilteringOwner(webContentsId);
					this.removeDerivedWebContents(webContentsId);
					this.policyErrors.delete(webContentsId);
					this.navigationPolicyErrors.delete(webContentsId);
					for (const [sourceId, action] of this.agentActions) {
						if (action.webContentsId === webContentsId) {
							this.agentActions.delete(sourceId);
						} else {
							action.webContentsIds.delete(webContentsId);
						}
					}
					this.clearWebContentsOrigins(webContentsId);
				});
			}
		}
		const filteredReferrerOwners = referrerOwners
			? [...new Set([...referrerOwners].flatMap(id => this.getFilteringRootOwners(id)))]
			: [];
		const classification = classifyRequest({
			webContentsId,
			webContentsWasKnown,
			webContentsIsFiltered: webContentsId !== undefined && this.isWebContentsFiltered(webContentsId),
			referrerOwners,
			filteredReferrerOwners,
			isMainFrame: details.resourceType === 'mainFrame',
			agentActions: [...this.agentActions.values()],
			hasFilteredWebContents: this.filteredWebContents.size > 0,
		});
		if (classification.isMainFrame && webContentsId !== undefined) {
			for (const action of classification.matchingAgentActions) {
				action.webContentsIds.add(webContentsId);
				this.addDerivedWebContents(action.webContentsId, webContentsId);
			}
			for (const ownerId of classification.attributableFilteredReferrerOwners) {
				this.addDerivedWebContents(ownerId, webContentsId);
			}
		}
		if (classification.isMainFrame) {
			if (webContentsId !== undefined) {
				this.policyErrors.delete(webContentsId);
				this.navigationPolicyErrors.delete(webContentsId);
			}
			if (!classification.shouldFilter) {
				callback({ cancel: false });
				return;
			}
		}

		if (!classification.shouldFilter) {
			callback({ cancel: false });
			return;
		}

		let uri: URI;
		try {
			uri = URI.parse(details.url, true);
		} catch {
			this.addPolicyErrors(classification.policyErrorTargets, classification.matchingAgentActions, undefined, classification.isMainFrame);
			callback({ cancel: true });
			return;
		}

		const allowed = this.agentNetworkFilterService.isUriAllowed(uri);
		if (!allowed) {
			this.addPolicyErrors(classification.policyErrorTargets, classification.matchingAgentActions, uri, classification.isMainFrame);
		}
		callback({ cancel: !allowed });
	}

	private isWebContentsFiltered(webContentsId: number): boolean {
		return this.getFilteringRootOwners(webContentsId).length > 0;
	}

	private getFilteringRootOwners(webContentsId: number): readonly number[] {
		if (this.filteredWebContents.has(webContentsId)) {
			return [webContentsId];
		}
		return [...this.derivedFilterOwners.get(webContentsId) ?? []].filter(ownerId => this.filteredWebContents.has(ownerId));
	}

	private addDerivedWebContents(ownerId: number, webContentsId: number): void {
		if (ownerId === webContentsId) {
			return;
		}
		let owners = this.derivedFilterOwners.get(webContentsId);
		if (!owners) {
			owners = new Set();
			this.derivedFilterOwners.set(webContentsId, owners);
		}
		owners.add(ownerId);
		let derivedWebContents = this.derivedWebContentsByOwner.get(ownerId);
		if (!derivedWebContents) {
			derivedWebContents = new Set();
			this.derivedWebContentsByOwner.set(ownerId, derivedWebContents);
		}
		derivedWebContents.add(webContentsId);
	}

	private clearDerivedFilteringOwner(ownerId: number): void {
		const derivedWebContents = this.derivedWebContentsByOwner.get(ownerId);
		if (!derivedWebContents) {
			return;
		}
		this.derivedWebContentsByOwner.delete(ownerId);
		for (const webContentsId of derivedWebContents) {
			const owners = this.derivedFilterOwners.get(webContentsId);
			owners?.delete(ownerId);
			if (owners?.size === 0) {
				this.derivedFilterOwners.delete(webContentsId);
				if (!this.filteredWebContents.has(webContentsId)) {
					this.policyErrors.delete(webContentsId);
					this.navigationPolicyErrors.delete(webContentsId);
				}
			}
		}
	}

	private removeDerivedWebContents(webContentsId: number): void {
		const owners = this.derivedFilterOwners.get(webContentsId);
		if (!owners) {
			return;
		}
		this.derivedFilterOwners.delete(webContentsId);
		for (const ownerId of owners) {
			const derivedWebContents = this.derivedWebContentsByOwner.get(ownerId);
			derivedWebContents?.delete(webContentsId);
			if (derivedWebContents?.size === 0) {
				this.derivedWebContentsByOwner.delete(ownerId);
			}
		}
	}

	private getWebContentsId(details: OnBeforeRequestListenerDetails, webContents: Electron.WebContents | null | undefined): number | undefined {
		return [details.webContentsId, webContents?.id]
			.find(id => id !== undefined && id >= 0);
	}

	private recordRequestOrigins(webContentsId: number, details: OnBeforeRequestListenerDetails): void {
		if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
			this.recordWebContentsOrigin(webContentsId, details.url);
		}
		this.recordWebContentsOrigin(webContentsId, details.referrer);
		this.recordWebContentsOrigin(webContentsId, details.frame?.url);
	}

	private recordWebContentsOrigin(webContentsId: number, value: string | undefined): void {
		const origin = this.getOrigin(value);
		if (!origin) {
			return;
		}
		let webContents = this.webContentsByOrigin.get(origin);
		if (!webContents) {
			webContents = new Set();
			this.webContentsByOrigin.set(origin, webContents);
		}
		webContents.add(webContentsId);
		let origins = this.originsByWebContents.get(webContentsId);
		if (!origins) {
			origins = new Set();
			this.originsByWebContents.set(webContentsId, origins);
		}
		origins.add(origin);
	}

	private getReferrerOwners(referrer: string): ReadonlySet<number> | undefined {
		const origin = this.getOrigin(referrer);
		return origin ? this.webContentsByOrigin.get(origin) : undefined;
	}

	private getOrigin(value: string | undefined): string | undefined {
		if (!value) {
			return undefined;
		}
		try {
			const uri = URI.parse(value, true);
			return uri.scheme && uri.authority ? `${uri.scheme.toLowerCase()}://${uri.authority.toLowerCase()}` : undefined;
		} catch {
			return undefined;
		}
	}

	private clearWebContentsOrigins(webContentsId: number): void {
		const origins = this.originsByWebContents.get(webContentsId);
		if (!origins) {
			return;
		}
		this.originsByWebContents.delete(webContentsId);
		for (const origin of origins) {
			const webContents = this.webContentsByOrigin.get(origin);
			webContents?.delete(webContentsId);
			if (webContents?.size === 0) {
				this.webContentsByOrigin.delete(origin);
			}
		}
	}

	private addPolicyErrors(webContentsIds: readonly number[], agentActions: readonly AgentAction[], uri: URI | undefined, navigationRequest: boolean): void {
		if (agentActions.length > 0) {
			for (const action of agentActions) {
				this.addRetainedPolicyError(action.policyErrors, uri);
			}
			return;
		}
		const policyErrorMap = navigationRequest ? this.navigationPolicyErrors : this.policyErrors;
		for (const webContentsId of webContentsIds) {
			let policyErrors = policyErrorMap.get(webContentsId);
			if (!policyErrors) {
				policyErrors = this.createPolicyErrors();
				policyErrorMap.set(webContentsId, policyErrors);
			}
			this.addRetainedPolicyError(policyErrors, uri);
		}
	}

	private getPolicyErrorFromMap(policyErrorMap: Map<number, RetainedPolicyErrors>, webContentsId: number): string | undefined {
		const policyErrors = policyErrorMap.get(webContentsId);
		if (!policyErrors) {
			return undefined;
		}
		const error = this.getCurrentPolicyError(policyErrors);
		if (error) {
			return error;
		}
		policyErrorMap.delete(webContentsId);
		return undefined;
	}

	private addRetainedPolicyError(policyErrors: RetainedPolicyErrors, uri: URI | undefined): void {
		if (uri) {
			policyErrors.deniedUris.set(uri.toString(), uri);
		} else {
			policyErrors.malformedRequest = true;
		}
	}

	private getCurrentPolicyError(policyErrors: RetainedPolicyErrors): string | undefined {
		if (policyErrors.malformedRequest) {
			return localize('browserSession.invalidNetworkRequest', 'A browser request was blocked by network domain policy.');
		}
		for (const [key, uri] of policyErrors.deniedUris) {
			if (this.agentNetworkFilterService.isUriAllowed(uri)) {
				policyErrors.deniedUris.delete(key);
			} else {
				return this.agentNetworkFilterService.formatError(uri);
			}
		}
		return undefined;
	}

	private createPolicyErrors(): RetainedPolicyErrors {
		return { malformedRequest: false, deniedUris: new Map() };
	}
}
