/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorSerializer, EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { ProcessExplorerEditorInput } from './processExplorerEditorInput.js';
import { ProcessExplorerEditor } from './processExplorerEditor.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProcessMainService } from '../../../../platform/process/common/process.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';

//#region --- process explorer

class ProcessExplorerEditorContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.processExplorerEditor';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		editorResolverService.registerEditor(
			`${ProcessExplorerEditorInput.RESOURCE.scheme}:**/**`,
			{
				id: ProcessExplorerEditorInput.ID,
				label: localize('promptOpenWith.processExplorer.displayName', "Process Explorer"),
				priority: RegisteredEditorPriority.exclusive
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === ProcessExplorerEditorInput.RESOURCE.scheme
			},
			{
				createEditorInput: () => {
					return {
						editor: instantiationService.createInstance(ProcessExplorerEditorInput),
						options: {
							pinned: true
						}
					};
				}
			}
		);
	}
}

registerWorkbenchContribution2(ProcessExplorerEditorContribution.ID, ProcessExplorerEditorContribution, WorkbenchPhase.BlockStartup);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(ProcessExplorerEditor, ProcessExplorerEditor.ID, localize('processExplorer', "Process Explorer")),
	[new SyncDescriptor(ProcessExplorerEditorInput)]
);

class ProcessExplorerEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(editorInput: EditorInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): EditorInput {
		return ProcessExplorerEditorInput.instance;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ProcessExplorerEditorInput.ID, ProcessExplorerEditorInputSerializer);

//#endregion

//#region --- process explorer commands

class OpenProcessExplorer extends Action2 {

	static readonly ID = 'workbench.action.openProcessExplorer';

	constructor() {
		super({
			id: OpenProcessExplorer.ID,
			title: localize2('openProcessExplorer', 'Open Process Explorer'),
			category: Categories.Developer,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);

		editorService.openEditor({ resource: ProcessExplorerEditorInput.RESOURCE, options: { pinned: true, auxiliary: { compact: true, bounds: { width: 800, height: 500 }, alwaysOnTop: true } } }, AUX_WINDOW_GROUP);
	}
}
registerAction2(OpenProcessExplorer);
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '5_tools',
	command: {
		id: OpenProcessExplorer.ID,
		title: localize({ key: 'miOpenProcessExplorerer', comment: ['&& denotes a mnemonic'] }, "Open &&Process Explorer")
	},
	order: 2
});

class StopTracing extends Action2 {

	static readonly ID = 'workbench.action.stopTracing';

	constructor() {
		super({
			id: StopTracing.ID,
			title: localize2('stopTracing', 'Stop Tracing'),
			category: Categories.Developer,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const processService = accessor.get(IProcessMainService);
		const environmentService = accessor.get(INativeEnvironmentService);
		const dialogService = accessor.get(IDialogService);
		const nativeHostService = accessor.get(INativeHostService);
		const progressService = accessor.get(IProgressService);

		if (!environmentService.args.trace) {
			const { confirmed } = await dialogService.confirm({
				message: localize('stopTracing.message', "Tracing requires to launch with a '--trace' argument"),
				primaryButton: localize({ key: 'stopTracing.button', comment: ['&& denotes a mnemonic'] }, "&&Relaunch and Enable Tracing"),
			});

			if (confirmed) {
				return nativeHostService.relaunch({ addArgs: ['--trace'] });
			}
		}

		await progressService.withProgress({
			location: ProgressLocation.Dialog,
			title: localize('stopTracing.title', "Creating trace file..."),
			cancellable: false,
			detail: localize('stopTracing.detail', "This can take up to one minute to complete.")
		}, () => processService.stopTracing());
	}
}
registerAction2(StopTracing);

CommandsRegistry.registerCommand('_issues.getSystemStatus', (accessor) => {
	return accessor.get(IProcessMainService).getSystemStatus();
});

//#endregion
