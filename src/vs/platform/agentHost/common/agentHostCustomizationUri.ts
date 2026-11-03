/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { fromAgentHostUri } from './agentHostUri.js';

/**
 * URI scheme for synthetic built-in customizations that carry discovery and invocation metadata, but no readable file content.
 */
export const AGENT_BUILTIN_CUSTOMIZATION_SCHEME = 'agent-builtin';

/** Discovery records whose provider has not reported readable source content. */
export const AGENT_DISCOVERY_CUSTOMIZATION_SCHEME = 'agent-discovery';

/**
 * Checks raw host URIs and client-wrapped Agent Host URIs for the built-in customization scheme.
 */
export function isAgentBuiltinCustomizationUri(resource: URI): boolean {
	return fromAgentHostUri(resource).scheme === AGENT_BUILTIN_CUSTOMIZATION_SCHEME;
}

export function hasReadableCustomizationContent(resource: URI): boolean {
	const scheme = fromAgentHostUri(resource).scheme;
	return scheme !== AGENT_BUILTIN_CUSTOMIZATION_SCHEME && scheme !== AGENT_DISCOVERY_CUSTOMIZATION_SCHEME;
}
