/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';

/**
 * Whether a Codex working directory carries hooks that pin it as the multi-root
 * primary — used only to decide the Folder picker, never to surface
 * customizations.
 *
 * Codex reads hooks from a dedicated `<dir>/.codex/hooks.json` manifest, so its
 * presence is the signal. Missing or unreadable files count as "not qualifying".
 */
export async function codexDirectoryHasHooks(fileService: IFileService, workingDirectory: URI, _token: CancellationToken = CancellationToken.None): Promise<boolean> {
	return fileService.exists(joinPath(workingDirectory, '.codex', 'hooks.json'));
}
