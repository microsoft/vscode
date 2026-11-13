/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { isWindows } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import type { IAgentConnection } from './agentService.js';
import { readAgentHostResources } from './meta/agentHostResources.js';
import { PathStyle } from './state/protocol/common/commands.js';

export const localProcessPathStyle = isWindows ? PathStyle.Windows : PathStyle.Posix;

export type IAgentHostEnvironmentConnection = Partial<Pick<IAgentConnection, 'initializeResult' | 'rootState'>>;

export function getAgentHostPathStyle(connection: IAgentHostEnvironmentConnection): PathStyle | undefined {
	const initializeResult = connection.initializeResult?.get();
	const environment = initializeResult?.environment;
	if (environment !== undefined) {
		return environment?.pathStyle;
	}

	const root = connection.rootState?.value;
	switch (readAgentHostResources(root instanceof Error ? undefined : root)?.platform) {
		case 'windows':
			return PathStyle.Windows;
		case 'macos':
		case 'linux':
			return PathStyle.Posix;
	}

	const defaultDirectory = initializeResult?.defaultDirectory;
	if (defaultDirectory) {
		const uri = typeof defaultDirectory === 'string' ? URI.parse(defaultDirectory) : URI.revive(defaultDirectory);
		if (uri.scheme === Schemas.file && (uri.authority || /^\/[a-zA-Z]:\//.test(uri.path))) {
			return PathStyle.Windows;
		}
	}

	return undefined;
}

/**
 * Whether the host's file paths are case-sensitive, or `undefined` when its platform and path style are unknown.
 * Linux hosts are case-sensitive; Windows and macOS hosts are not.
 */
export function isAgentHostPathCaseSensitive(connection: IAgentHostEnvironmentConnection): boolean | undefined {
	const root = connection.rootState?.value;
	const platform = readAgentHostResources(root instanceof Error ? undefined : root)?.platform;
	if (platform) {
		// Posix path style also covers macOS, whose file systems are usually case-insensitive.
		return platform === 'linux';
	}
	const pathStyle = getAgentHostPathStyle(connection);
	return pathStyle === undefined ? undefined : pathStyle === PathStyle.Posix;
}
