/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService, ITerminalService, terminalEditorId } from './terminal.js';
import { parseTerminalUri } from './terminalUri.js';
import { terminalStrings } from '../common/terminalStrings.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IEmbedderTerminalService } from '../../../services/terminal/common/embedderTerminalService.js';

/**
 * The main contribution for the terminal contrib. This contains calls to other components necessary
 * to set up the terminal but don't need to be tracked in the long term (where TerminalService would
 * be more relevant).
 */
export class TerminalMainContribution extends Disposable implements IWorkbenchContribution {
	static ID = 'terminalMain';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IEmbedderTerminalService embedderTerminalService: IEmbedderTerminalService,
		@IWorkbenchEnvironmentService workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@ILabelService labelService: ILabelService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ITerminalService terminalService: ITerminalService,
		@ITerminalEditorService terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService terminalGroupService: ITerminalGroupService,
		@ITerminalInstanceService terminalInstanceService: ITerminalInstanceService
	) {
		super();

		this._init(
			editorResolverService,
			embedderTerminalService,
			workbenchEnvironmentService,
			labelService,
			lifecycleService,
			terminalService,
			terminalEditorService,
			terminalGroupService,
			terminalInstanceService
		);
	}

	private async _init(
		editorResolverService: IEditorResolverService,
		embedderTerminalService: IEmbedderTerminalService,
		workbenchEnvironmentService: IWorkbenchEnvironmentService,
		labelService: ILabelService,
		lifecycleService: ILifecycleService,
		terminalService: ITerminalService,
		terminalEditorService: ITerminalEditorService,
		terminalGroupService: ITerminalGroupService,
		terminalInstanceService: ITerminalInstanceService
	) {
		// IMPORTANT: This listener needs to be set up before the workbench is ready to support
		// embedder terminals.
		this._register(embedderTerminalService.onDidCreateTerminal(async embedderTerminal => {
			const terminal = await terminalService.createTerminal({
				config: embedderTerminal,
				location: TerminalLocation.Panel,
				skipContributedProfileCheck: true,
			});
			terminalService.setActiveInstance(terminal);
			await terminalService.revealActiveTerminal();
		}));

		await lifecycleService.when(LifecyclePhase.Restored);

		// Register terminal editors
		this._register(editorResolverService.registerEditor(
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
		));

		// Register a resource formatter for terminal URIs
		this._register(labelService.registerFormatter({
			scheme: Schemas.vscodeTerminal,
			formatting: {
				label: '${path}',
				separator: ''
			}
		}));
	}
}
