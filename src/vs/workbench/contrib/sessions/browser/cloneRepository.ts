/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';

export async function cloneRepository(commandService: ICommandService, notificationService: INotificationService, url: string): Promise<URI | undefined> {
	try {
		const repositoryPath = await commandService.executeCommand<string>(
			'git.clone',
			url,
			undefined,
			{ postCloneAction: 'none', returnRepositoryPath: true },
		);
		if (repositoryPath?.endsWith('.code-workspace')) {
			notificationService.error(localize('cloneRepository.workspaceFile', "The selected clone is a workspace file. Choose the repository again to select a repository folder."));
			return undefined;
		}
		return repositoryPath ? URI.file(repositoryPath) : undefined;
	} catch (error) {
		if (!isCancellationError(error)) {
			notificationService.error(error);
		}
		return undefined;
	}
}
