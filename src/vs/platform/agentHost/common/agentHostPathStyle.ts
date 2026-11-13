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

export function getAgentHostPathStyle(connection: IAgentConnection): PathStyle | undefined {
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
