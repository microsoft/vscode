/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorSerializer, EditorExtensions, IEditorFactoryRegistry, GroupIdentifier } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { ProcessExplorerEditorInput } from './processExplorerEditorInput.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { RemoteNameContext } from '../../../common/contextkeys.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';

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

const supported = ContextKeyExpr.or(IsWebContext.negate(), RemoteNameContext.notEqualsTo('')); // only on desktop or in web with a remote

interface IProcessExplorerWindowState {
	readonly bounds: Partial<IRectangle>;
}

class OpenProcessExplorer extends Action2 {

	static readonly ID = 'workbench.action.openProcessExplorer';

	private static readonly STATE_KEY = 'workbench.processExplorerWindowState';
	private static readonly DEFAULT_STATE: IProcessExplorerWindowState = { bounds: { width: 800, height: 500 } };

	constructor() {
		super({
			id: OpenProcessExplorer.ID,
			title: localize2('openProcessExplorer', 'Open Process Explorer'),
			category: Categories.Developer,
			precondition: supported,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);
		const auxiliaryWindowService = accessor.get(IAuxiliaryWindowService);
		const storageService = accessor.get(IStorageService);

		const pane = await editorService.openEditor({
			resource: ProcessExplorerEditorInput.RESOURCE,
			options: {
				pinned: true,
				revealIfOpened: true,
				auxiliary: {
					...this.loadState(storageService),
					compact: true,
					alwaysOnTop: true
				}
			}
		}, AUX_WINDOW_GROUP);

		if (pane) {
			const listener = pane.input?.onWillDispose(() => {
				listener?.dispose();
				this.saveState(pane.group.id, storageService, editorGroupService, auxiliaryWindowService);
			});
		}
	}

	private loadState(storageService: IStorageService): IProcessExplorerWindowState {
		const stateRaw = storageService.get(OpenProcessExplorer.STATE_KEY, StorageScope.APPLICATION);
		if (!stateRaw) {
			return OpenProcessExplorer.DEFAULT_STATE;
		}

		try {
			return JSON.parse(stateRaw);
		} catch {
			return OpenProcessExplorer.DEFAULT_STATE;
		}
	}

	private saveState(group: GroupIdentifier, storageService: IStorageService, editorGroupService: IEditorGroupsService, auxiliaryWindowService: IAuxiliaryWindowService): void {
		const auxiliaryWindow = auxiliaryWindowService.getWindow(editorGroupService.getPart(group).windowId);
		if (!auxiliaryWindow) {
			return;
		}

		const bounds = auxiliaryWindow.createState().bounds;
		if (!bounds) {
			return;
		}

		storageService.store(OpenProcessExplorer.STATE_KEY, JSON.stringify({ bounds }), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

registerAction2(OpenProcessExplorer);

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '5_tools',
	command: {
		id: OpenProcessExplorer.ID,
		title: localize({ key: 'miOpenProcessExplorerer', comment: ['&& denotes a mnemonic'] }, "Open &&Process Explorer")
	},
	when: supported,
	order: 2
});

//#endregion
