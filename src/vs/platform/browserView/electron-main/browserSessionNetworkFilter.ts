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

export class BrowserSessionNetworkFilter {
	private readonly filteredWebContents = new Set<number>();
	private readonly policyErrors = new Map<number, RetainedPolicyErrors>();
	private readonly navigationPolicyErrors = new Map<number, RetainedPolicyErrors>();
	private readonly agentActions = new Map<string, AgentAction>();
	private readonly webContentsByOrigin = new Map<string, Set<number>>();
	private readonly originsByWebContents = new Map<number, Set<string>>();
	private readonly observedWebContents = new Set<number>();

	constructor(private readonly agentNetworkFilterService: IAgentNetworkFilterService) { }

	setFiltering(webContentsId: number, enabled: boolean): void {
		if (enabled) {
			this.filteredWebContents.add(webContentsId);
		} else {
			this.filteredWebContents.delete(webContentsId);
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
		if (navigationPolicyError) {
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
			this.filteredWebContents.has(webContentsId)
			|| this.observedWebContents.has(webContentsId)
			|| this.originsByWebContents.has(webContentsId)
		);
		if (webContentsId !== undefined) {
			this.recordRequestOrigins(webContentsId, details);
			if (webContents && !this.observedWebContents.has(webContentsId)) {
				this.observedWebContents.add(webContentsId);
				webContents.once('destroyed', () => {
					this.observedWebContents.delete(webContentsId);
					this.filteredWebContents.delete(webContentsId);
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
		const referrerOwners = this.getReferrerOwners(details.referrer);
		const filteredReferrerOwners = referrerOwners ? [...referrerOwners].filter(id => this.filteredWebContents.has(id)) : [];
		const shouldUseReferrerOwnership = webContentsId === undefined || !webContentsWasKnown;
		const attributableFilteredReferrerOwners = shouldUseReferrerOwnership ? filteredReferrerOwners : [];
		const isMainFrame = details.resourceType === 'mainFrame';
		let matchingAgentActions = [...this.agentActions.values()].filter(action =>
			(webContentsId !== undefined && action.webContentsIds.has(webContentsId))
			|| (shouldUseReferrerOwnership && referrerOwners !== undefined && [...referrerOwners].some(id => action.webContentsIds.has(id)))
		);
		if (
			matchingAgentActions.length === 0
			&& this.agentActions.size > 0
			&& referrerOwners === undefined
			&& (webContentsId === undefined || (isMainFrame && !webContentsWasKnown))
		) {
			matchingAgentActions = [...this.agentActions.values()];
		}
		if (isMainFrame && webContentsId !== undefined) {
			for (const action of matchingAgentActions) {
				action.webContentsIds.add(webContentsId);
			}
		}
		const isAgentRequest = matchingAgentActions.length > 0;
		const shouldFilterMainFrame = isMainFrame && (
			isAgentRequest
			|| (webContentsId !== undefined && this.filteredWebContents.has(webContentsId))
			|| attributableFilteredReferrerOwners.length > 0
			|| (!webContentsWasKnown && referrerOwners === undefined && this.filteredWebContents.size > 0)
		);
		if (details.resourceType === 'mainFrame') {
			if (webContentsId !== undefined) {
				this.policyErrors.delete(webContentsId);
				this.navigationPolicyErrors.delete(webContentsId);
			}
			if (!shouldFilterMainFrame) {
				callback({ cancel: false });
				return;
			}
		}

		const policyErrorTargets = isAgentRequest ? []
			: isMainFrame
				? [...new Set([
					...(webContentsId !== undefined && (this.filteredWebContents.has(webContentsId) || !webContentsWasKnown) ? [webContentsId] : []),
					...attributableFilteredReferrerOwners,
				])]
				: webContentsId === undefined
					? referrerOwners ? filteredReferrerOwners : []
					: this.filteredWebContents.has(webContentsId) ? [webContentsId] : [];
		const shouldFilter = shouldFilterMainFrame || isAgentRequest || policyErrorTargets.length > 0 || (webContentsId === undefined && referrerOwners === undefined && this.filteredWebContents.size > 0);
		if (!shouldFilter) {
			callback({ cancel: false });
			return;
		}

		let uri: URI;
		try {
			uri = URI.parse(details.url, true);
		} catch {
			this.addPolicyErrors(policyErrorTargets, matchingAgentActions, undefined, isMainFrame);
			callback({ cancel: true });
			return;
		}

		const allowed = this.agentNetworkFilterService.isUriAllowed(uri);
		if (!allowed) {
			this.addPolicyErrors(policyErrorTargets, matchingAgentActions, uri, isMainFrame);
		}
		callback({ cancel: !allowed });
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
