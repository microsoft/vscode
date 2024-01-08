/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { ILabelService } from 'vs/platform/label/common/label';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService, ITerminalService, terminalEditorId } from 'vs/workbench/contrib/terminal/browser/terminal';
import { parseTerminalUri } from 'vs/workbench/contrib/terminal/browser/terminalUri';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { IEmbedderTerminalService } from 'vs/workbench/services/terminal/common/embedderTerminalService';

/**
 * The main contribution for the terminal contrib. This contains calls to other components necessary
 * to set up the terminal but don't need to be tracked in the long term (where TerminalService would
 * be more relevant).
 */
export class TerminalMainContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IEmbedderTerminalService embedderTerminalService: IEmbedderTerminalService,
		@ILabelService labelService: ILabelService,
		@ITerminalService terminalService: ITerminalService,
		@ITerminalEditorService terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService terminalGroupService: ITerminalGroupService,
		@ITerminalInstanceService terminalInstanceService: ITerminalInstanceService
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
				canSupportResource: uri => uri.scheme === Schemas.vscodeTerminal,
				singlePerResource: true
			},
			{
				createEditorInput: async ({ resource, options }) => {
					let instance = terminalService.getInstanceFromResource(resource);
					if (instance) {
						const sourceGroup = terminalGroupService.getGroupForInstance(instance);
						sourceGroup?.removeInstance(instance);
					} else { // Terminal from a different window
						const terminalIdentifier = parseTerminalUri(resource);
						if (!terminalIdentifier.instanceId) {
							throw new Error('Terminal identifier without instanceId');
						}

						const primaryBackend = terminalService.getPrimaryBackend();
						if (!primaryBackend) {
							throw new Error('No terminal primary backend');
						}

						const attachPersistentProcess = await primaryBackend.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId);
						if (!attachPersistentProcess) {
							throw new Error('No terminal persistent process to attach');
						}
						instance = terminalInstanceService.createInstance({ attachPersistentProcess }, TerminalLocation.Editor);
					}

					const resolvedResource = terminalEditorService.resolveResource(instance);
					const editor = terminalEditorService.getInputFromResource(resolvedResource);
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

		embedderTerminalService.onDidCreateTerminal(async embedderTerminal => {
			const terminal = await terminalService.createTerminal({
				config: embedderTerminal,
				location: TerminalLocation.Panel
			});
			terminalService.setActiveInstance(terminal);
			await terminalService.revealActiveTerminal();
		});
	}
}
