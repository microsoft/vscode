/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { RepositorySourceCapability } from './state/protocol/channels-root/state.js';
import { JsonRpcErrorCodes } from './state/protocol/errors.js';
import { ProtocolError } from './state/sessionProtocol.js';

export interface IAgentRepositorySource {
	readonly repositorySource: URI;
	readonly repositoryRevision?: string;
}

/** Validate typed source inputs without interpreting them as provider configuration. */
export function validateRepositorySource(
	params: { readonly repositorySource?: URI | string; readonly repositoryRevision?: string; readonly config?: Readonly<Record<string, unknown>> } | undefined,
	capability: RepositorySourceCapability | undefined,
): IAgentRepositorySource | undefined {
	const config = params?.config;
	if (config && ['repositorySource', 'repositoryRevision', 'repositoryUrl'].some(key => Object.hasOwn(config, key))) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositorySource.config', "Repository source and revision must be supplied as request fields, not configuration values."));
	}
	if (!params || (params.repositorySource === undefined && params.repositoryRevision === undefined)) {
		return undefined;
	}
	if (!capability) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositorySource.unsupported', "The agent host does not support repository-backed session creation."));
	}
	if (params.repositorySource === undefined) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositorySource.required', "A repository revision requires a repository source."));
	}
	let source: URI;
	const invalidSource = localize('repositorySource.invalid', "Select an absolute repository URI without credentials, a query, or a fragment.");
	try {
		source = typeof params.repositorySource === 'string' ? URI.parse(params.repositorySource, true) : params.repositorySource;
	} catch {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, invalidSource);
	}
	if (!URI.isUri(source) || !source.scheme || source.authority.includes('@') || source.query || source.fragment) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, invalidSource);
	}
	const revision = params.repositoryRevision;
	if (revision !== undefined) {
		if (capability.revision !== true) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositorySource.revisionUnsupported', "The agent host does not support repository revision selection."));
		}
		if (typeof revision !== 'string' || !revision.trim()) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositorySource.revisionInvalid', "The repository revision must be a nonempty string."));
		}
	}
	return { repositorySource: source, ...(revision !== undefined ? { repositoryRevision: revision } : {}) };
}
