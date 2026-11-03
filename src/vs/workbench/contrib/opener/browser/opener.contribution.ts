/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { normalizePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { extractSelection, IOpener, IOpenerService, OpenOptions } from '../../../../platform/opener/common/opener.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { REVEAL_IN_EXPLORER_COMMAND_ID } from '../../files/browser/fileConstants.js';

export class WorkbenchOpenerContribution extends Disposable implements IOpener {
	public static readonly ID = 'workbench.contrib.opener';

	constructor(
		@IOpenerService private readonly openerService: IOpenerService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this._register(openerService.registerOpener(this));
	}

	async open(link: URI | string, options?: OpenOptions): Promise<boolean> {
		if (options?.openExternal) {
			return false;
		}

		let { uri } = extractSelection(typeof link === 'string' ? URI.parse(link) : link);
		if (uri.scheme === Schemas.file) {
			uri = normalizePath(uri);
		}
		const canOpenInOS = this.environmentService.isSessionsWindow && uri.scheme === Schemas.file;
		if ((!this.workspaceContextService.isInsideWorkspace(uri) && !canOpenInOS) || !this.fileService.hasProvider(uri)) {
			return false;
		}

		let isDirectory: boolean;
		try {
			isDirectory = (await this.fileService.stat(uri)).isDirectory;
		} catch (error) {
			if (error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
				return false;
			}
			throw error;
		}
		if (!isDirectory) {
			return false;
		}

		if (this.workspaceContextService.isInsideWorkspace(uri)) {
			await this.commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, uri);
			return true;
		}
		if (!canOpenInOS) {
			return false;
		}
		if (!await this.openerService.open(uri, { openExternal: true, fromUserGesture: options?.fromUserGesture })) {
			throw new Error(localize('folderLink.failedExternalOpen', "Unable to open the folder in the operating system's file manager."));
		}
		return true;
	}
}


registerWorkbenchContribution2(WorkbenchOpenerContribution.ID, WorkbenchOpenerContribution, WorkbenchPhase.Eventually);
