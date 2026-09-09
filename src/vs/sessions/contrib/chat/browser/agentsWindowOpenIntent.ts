/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeHex } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../common/devContainerAgentHostService.js';

const DEV_CONTAINER_REMOTE_AUTHORITY_PREFIX = 'dev-container+';

export interface IAgentsWindowFolderIntent {
	readonly folderUri: URI | undefined;
	readonly preferDevContainer: boolean;
}

export function resolveAgentsWindowFolderIntent(workspaceUri: URI | undefined, configurationService: IConfigurationService): IAgentsWindowFolderIntent {
	if (workspaceUri?.scheme === Schemas.file) {
		return { folderUri: workspaceUri, preferDevContainer: false };
	}
	if (workspaceUri?.scheme !== Schemas.vscodeRemote || !workspaceUri.authority.startsWith(DEV_CONTAINER_REMOTE_AUTHORITY_PREFIX)) {
		return { folderUri: undefined, preferDevContainer: false };
	}
	try {
		return {
			folderUri: URI.file(decodeHex(workspaceUri.authority.slice(DEV_CONTAINER_REMOTE_AUTHORITY_PREFIX.length)).toString()),
			preferDevContainer: configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId) === true,
		};
	} catch (error) {
		if (error instanceof SyntaxError) {
			return { folderUri: undefined, preferDevContainer: false };
		}
		throw error;
	}
}
