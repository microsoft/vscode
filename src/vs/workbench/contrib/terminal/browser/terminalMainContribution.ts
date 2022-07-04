/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITerminalEditorService, ITerminalGroupService, ITerminalService, terminalEditorId } from 'vs/workbench/contrib/terminal/browser/terminal';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { registerLogChannel } from 'vs/workbench/services/output/common/output';
import { join } from 'vs/base/common/path';
import { TerminalLogConstants } from 'vs/platform/terminal/common/terminal';

/**
 * The main contribution for the terminal contrib. This contains calls to other components necessary
 * to set up the terminal but don't need to be tracked in the long term (where TerminalService would
 * be more relevant).
 */
export class TerminalMainContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService private readonly _fileService: IFileService,
		@ILabelService labelService: ILabelService,
		@ILogService private readonly _logService: ILogService,
		@ITerminalService terminalService: ITerminalService,
		@ITerminalEditorService terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService terminalGroupService: ITerminalGroupService
	) {
		super();

		// Register terminal editors
		editorResolverService.registerEditor(
			`${Schemas.vscodeTerminal}:/**`,
			{
				id: terminalEditorId,
				label: terminalStrings.terminal,
				priority: RegisteredEditorPriority.exclusive
			},
			{
				canHandleDiff: false,
				canSupportResource: uri => uri.scheme === Schemas.vscodeTerminal,
				singlePerResource: true
			},
			({ resource, options }) => {
				const instance = terminalService.getInstanceFromResource(resource);
				if (instance) {
					const sourceGroup = terminalGroupService.getGroupForInstance(instance);
					sourceGroup?.removeInstance(instance);
				}
				const resolvedResource = terminalEditorService.resolveResource(instance || resource);
				const editor = terminalEditorService.getInputFromResource(resolvedResource) || { editor: resolvedResource };
				return {
					editor,
					options: {
						...options,
						pinned: true,
						forceReload: true,
						override: terminalEditorId
					}
				};
			}
		);

		// Register a resource formatter for terminal URIs
		labelService.registerFormatter({
			scheme: Schemas.vscodeTerminal,
			formatting: {
				label: '${path}',
				separator: ''
			}
		});

		// Register log channel
		this._registerLogChannel('ptyHostLog', localize('ptyHost', "Pty Host"), URI.file(join(environmentService.logsPath, `${TerminalLogConstants.FileName}.log`)));
	}

	private _registerLogChannel(id: string, label: string, file: URI): void {
		const promise = registerLogChannel(id, label, file, this._fileService, this._logService);
		this._register(toDisposable(() => promise.cancel()));
	}
}
