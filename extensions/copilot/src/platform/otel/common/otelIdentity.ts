/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAuthenticationService } from '../../authentication/common/authentication';
import { StdAttr } from './genAiAttributes';
import type { OTelConfig } from './otelConfig';
import type { ICompletedSpanData } from './otelService';

const identityAttributes = new Set<string>([StdAttr.USER_NAME, StdAttr.PROCESS_USER_NAME, StdAttr.HOST_NAME]);

/** Read the authentication service's current session for each invocation, without caching a separate account name. */
export function agentIdentityAttributes(config: OTelConfig, authentication: Pick<IAuthenticationService, 'anyGitHubSession'>): Record<string, string> {
	const name = config.captureIdentity ? authentication.anyGitHubSession?.account.label : undefined;
	return name ? { [StdAttr.USER_NAME]: name } : {};
}

/** Applies to all sinks, including SDK bridge events and local debug consumers. */
export function filterIdentityAttributes<T>(attributes: Readonly<Record<string, T>>, allowed: boolean): Record<string, T> {
	return Object.fromEntries(Object.entries(attributes).filter(([key]) => allowed || !identityAttributes.has(key)));
}

/** Detect only after consent; explicit resource attributes override detected values. */
export function identityResourceAttributes(attributes: Record<string, string>, allowed: boolean, detect: () => { username: string | undefined; hostname: string }): Record<string, string> {
	if (!allowed) {
		return filterIdentityAttributes(attributes, false);
	}
	const { username, hostname } = detect();
	return {
		...(username === undefined ? {} : { [StdAttr.PROCESS_USER_NAME]: username }),
		[StdAttr.HOST_NAME]: hostname,
		...attributes,
	};
}

export function filterIdentitySpan(span: ICompletedSpanData, allowed: boolean): ICompletedSpanData {
	return {
		...span,
		attributes: filterIdentityAttributes(span.attributes, allowed),
		events: span.events.map(event => ({
			...event,
			attributes: event.attributes && filterIdentityAttributes(event.attributes, allowed),
		})),
	};
}
