/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { isAbsolute, join, posix } from '../../../../base/common/path.js';
import { isEqualOrParent, joinPath, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { fromAgentClientPath, toAgentClientPath } from '../../common/agentClientUri.js';

export type CopilotWorkspace = { readonly kind: 'local'; readonly directory: URI } | { readonly kind: 'virtual'; readonly root: URI };

export function toCopilotWorkspace(directory: URI): CopilotWorkspace {
	return directory.scheme === Schemas.file ? { kind: 'local', directory } : { kind: 'virtual', root: directory };
}

export interface ICopilotSdkPathMapper {
	readonly rootSdkPath: string;
	toUri(sdkPath: string): URI;
	toSdkPath(uri: URI): string;
}

/** Virtual SDK paths are absolute POSIX paths confined to the workspace root; relative and escaping paths throw. */
export function createCopilotSdkPathMapper(workspace: CopilotWorkspace): ICopilotSdkPathMapper {
	if (workspace.kind === 'local') {
		return {
			rootSdkPath: workspace.directory.fsPath,
			toUri: sdkPath => URI.file(sdkPath),
			toSdkPath: uri => uri.fsPath,
		};
	}

	const root = workspace.root.with({ path: posix.normalize(workspace.root.path || '/') });
	const checkRoot = (uri: URI): URI => {
		if (!isEqualOrParent(uri, root)) {
			throw new Error(`Path is outside the virtual workspace: ${uri.toString()}`);
		}
		return uri;
	};
	return {
		rootSdkPath: toAgentClientPath(root),
		toUri: sdkPath => {
			if (!posix.isAbsolute(sdkPath)) {
				throw new Error(`Expected an absolute virtual workspace path: ${sdkPath}`);
			}
			return checkRoot(fromAgentClientPath(posix.normalize(sdkPath)).with({ query: root.query, fragment: root.fragment }));
		},
		toSdkPath: uri => toAgentClientPath(checkRoot(uri.with({ path: posix.normalize(uri.path || '/') }))),
	};
}

/** Workspace paths use the SDK mapper; paths outside its root name host-local state, attachments or spill files. */
export function copilotSdkPathToUri(pathMapper: ICopilotSdkPathMapper, sdkPath: string): URI {
	try {
		return pathMapper.toUri(sdkPath);
	} catch {
		return URI.file(sdkPath);
	}
}

/** Resolve relative tool paths using the SDK's path conventions, not the host OS for virtual workspaces. */
export function resolveCopilotSdkPath(pathMapper: ICopilotSdkPathMapper, path: string): string {
	return pathMapper.toUri(pathMapper.rootSdkPath).scheme === Schemas.file
		? isAbsolute(path) ? path : join(pathMapper.rootSdkPath, path)
		: posix.resolve(pathMapper.rootSdkPath, path);
}

export const COPILOT_VIRTUAL_SESSION_STATE_PATH = '/session-state';

/** Adds the virtual runtime's state namespace while keeping its workspace mapper confined to the repository. */
export function createCopilotSessionPathMapper(workspace: CopilotWorkspace | undefined, sessionStateDirectory: URI): ICopilotSdkPathMapper {
	if (!workspace) {
		return { rootSdkPath: '', toUri: sdkPath => URI.file(sdkPath), toSdkPath: uri => uri.fsPath };
	}
	const mapper = createCopilotSdkPathMapper(workspace);
	if (workspace.kind === 'local') {
		return mapper;
	}
	return {
		rootSdkPath: mapper.rootSdkPath,
		toUri: path => {
			const normalized = posix.normalize(path);
			return normalized === COPILOT_VIRTUAL_SESSION_STATE_PATH || normalized.startsWith(`${COPILOT_VIRTUAL_SESSION_STATE_PATH}/`)
				? joinPath(sessionStateDirectory, posix.relative(COPILOT_VIRTUAL_SESSION_STATE_PATH, normalized))
				: mapper.toUri(path);
		},
		toSdkPath: uri => isEqualOrParent(uri, sessionStateDirectory)
			? posix.join(COPILOT_VIRTUAL_SESSION_STATE_PATH, relativePath(sessionStateDirectory, uri) ?? '')
			: uri.scheme === Schemas.file ? uri.fsPath : mapper.toSdkPath(uri),
	};
}
