/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { RepositorySource } from './state/protocol/channels-session/state.js';
import { RepositoryPreparationCapabilities } from './state/protocol/common/commands.js';
import { JsonRpcErrorCodes } from './state/protocol/errors.js';
import { ProtocolError } from './state/sessionProtocol.js';

export interface IRepositorySource {
	readonly source: URI;
	readonly revision?: string;
}

type RepositorySources = readonly { readonly source: URI | string; readonly revision?: string }[];

export function parseRepositorySources(repositories: RepositorySources): readonly IRepositorySource[];
export function parseRepositorySources(repositories: RepositorySources | undefined): readonly IRepositorySource[] | undefined;
export function parseRepositorySources(repositories: RepositorySources | undefined): readonly IRepositorySource[] | undefined {
	if (repositories === undefined) {
		return undefined;
	}
	if (!Array.isArray(repositories) || repositories.length === 0) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositories.invalidList', "Repositories must be a nonempty list of repository sources."));
	}
	return Array.from(repositories, (repository: RepositorySources[number]) => {
		let source: URI;
		const invalidSource = localize('repositories.invalidSource', "Each repository must have an absolute source URI without credentials, a query, or a fragment.");
		try {
			source = typeof repository?.source === 'string' ? URI.parse(repository.source, true) : repository?.source;
		} catch {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, invalidSource);
		}
		if (!URI.isUri(source) || !source.scheme || source.authority.includes('@') || source.query || source.fragment) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, invalidSource);
		}
		const revision = repository.revision;
		if (revision !== undefined && (typeof revision !== 'string' || !revision.trim())) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositories.invalidRevision', "A repository revision must be a nonempty string."));
		}
		return { source, ...(revision !== undefined ? { revision } : {}) };
	});
}

export function serializeRepositorySources(repositories: readonly IRepositorySource[] | undefined): RepositorySource[] | undefined {
	return repositories?.map(repository => ({
		source: repository.source.toString(),
		...(repository.revision !== undefined ? { revision: repository.revision } : {}),
	}));
}

/** Validate creation inputs against the host's preparation capabilities. */
export function validateRepositories(
	params: { readonly repositories?: RepositorySources; readonly workingDirectories?: readonly (URI | string)[]; readonly config?: Readonly<Record<string, unknown>> } | undefined,
	capability: RepositoryPreparationCapabilities | undefined,
): readonly IRepositorySource[] | undefined {
	if (params && ['repositorySource', 'repositoryRevision', 'repositoryUrl'].some(key => Object.hasOwn(params, key))) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositories.obsoleteInput', "Supply repository sources and revisions in the repositories list."));
	}
	const config = params?.config;
	if (config && ['repositories', 'repositorySource', 'repositoryRevision', 'repositoryUrl'].some(key => Object.hasOwn(config, key))) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositories.config', "Repositories must be supplied as a request field, not configuration values."));
	}
	if (params?.repositories === undefined) {
		return undefined;
	}
	if (!capability) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositories.unsupported', "The agent host does not support repository-backed session creation."));
	}
	const repositories = parseRepositorySources(params.repositories);
	if (repositories.length > 1 && capability.multipleRepositories !== true) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositories.multipleUnsupported', "The agent host does not support creating a session from multiple repositories."));
	}
	if (repositories.some(repository => repository.revision !== undefined) && capability.revision !== true) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositories.revisionUnsupported', "The agent host does not support repository revision selection."));
	}
	if (params.workingDirectories?.length) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('repositories.conflictingDirectories', "Specify repositories or working directories when creating a session, not both."));
	}
	return repositories;
}
