/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024-2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../common/editor.js';

import { parse } from '../../../../base/common/marshalling.js';
import { assertType } from '../../../../base/common/types.js';
import { INotebookService } from '../../notebook/common/notebookService.js';

import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { ErdosNotebookEditor } from './ErdosNotebookEditor.js';
import { ErdosNotebookEditorInput, ErdosNotebookEditorInputOptions } from './ErdosNotebookEditorInput.js';

import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ICommandAndKeybindingRule, KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ERDOS_NOTEBOOK_EDITOR_FOCUSED } from '../../../services/erdosNotebook/browser/ContextKeysManager.js';
import { IErdosNotebookService } from '../../../services/erdosNotebook/browser/erdosNotebookService.js';
import { IErdosNotebookInstance } from '../../../services/erdosNotebook/browser/IErdosNotebookInstance.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { checkErdosNotebookEnabled } from './erdosNotebookExperimentalConfig.js';

/**
 * ErdosNotebookContribution class.
 */
class ErdosNotebookContribution extends Disposable {
	constructor(
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotebookService private readonly notebookService: INotebookService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		// Only register the editor if the feature is enabled
		if (checkErdosNotebookEnabled(this.configurationService)) {
			this.registerEditor();
		}
	}

	private registerEditor(): void {
		// Register for .ipynb files
		this._register(this.editorResolverService.registerEditor(
			'*.ipynb',
			{
				id: ErdosNotebookEditorInput.EditorID,
				label: localize('erdosNotebook', "Erdos Notebook"),
				detail: localize('erdosNotebook.detail', "Provided by Erdos"),
				priority: RegisteredEditorPriority.option
			},
			{
				singlePerResource: true,
				canSupportResource: (resource: URI) => {
					// Support both file:// and untitled:// schemes
					return resource.scheme === Schemas.file || resource.scheme === Schemas.untitled;
				}
			},
			{
				createEditorInput: async ({ resource, options }) => {
					// Determine notebook type from file content or metadata
					const viewType = await this.detectNotebookViewType(resource);

					const editorInput = ErdosNotebookEditorInput.getOrCreate(
						this.instantiationService,
						resource,
						undefined,
						viewType,
						{ startDirty: false }
					);

					return { editor: editorInput, options };
				}
			}
		));
	}

	private async detectNotebookViewType(resource: URI): Promise<string> {
		// Check if there's already an open notebook model for this URI
		const existingModel = this.notebookService.getNotebookTextModel(resource);
		if (existingModel) {
			return existingModel.viewType;
		}

		// Use NotebookService to detect the correct viewType
		const notebookProviders = this.notebookService.getContributedNotebookTypes(resource);

		// Default to jupyter-notebook if detection fails
		return notebookProviders[0]?.id || 'jupyter-notebook';
	}
}

// Register the Erdos notebook editor pane.
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ErdosNotebookEditor,
		ErdosNotebookEditorInput.EditorID,
		localize('erdosNotebookEditor', "Erdos Notebook Editor")
	),
	[
		new SyncDescriptor(ErdosNotebookEditorInput)
	]
);

// Register workbench contributions.
const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(ErdosNotebookContribution, LifecyclePhase.Restored);

type SerializedErdosNotebookEditorData = { resource: URI; viewType: string; options?: ErdosNotebookEditorInputOptions };
class ErdosNotebookEditorSerializer implements IEditorSerializer {
	canSerialize(): boolean {
		return true;
	}
	serialize(input: EditorInput): string {
		assertType(input instanceof ErdosNotebookEditorInput);
		const data: SerializedErdosNotebookEditorData = {
			resource: input.resource,
			viewType: input.viewType,
			options: input.options
		};
		return JSON.stringify(data);
	}
	deserialize(instantiationService: IInstantiationService, raw: string) {
		const data = <SerializedErdosNotebookEditorData>parse(raw);
		if (!data) {
			return undefined;
		}
		const { resource, viewType, options } = data;
		if (!data || !URI.isUri(resource) || typeof viewType !== 'string') {
			return undefined;
		}

		const input = ErdosNotebookEditorInput.getOrCreate(instantiationService, resource, undefined, viewType, options);
		return input;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	ErdosNotebookEditorInput.ID,
	ErdosNotebookEditorSerializer
);

//#region Keybindings
registerNotebookKeybinding({
	id: 'erdosNotebook.cell.insertCodeCellAboveAndFocusContainer',
	primary: KeyCode.KeyA,
	onRun: ({ activeNotebook }) => {
		activeNotebook.insertCodeCellAndFocusContainer('above');
	}
});

registerNotebookKeybinding({
	id: 'erdosNotebook.cell.insertCodeCellBelowAndFocusContainer',
	primary: KeyCode.KeyB,
	onRun: ({ activeNotebook }) => {
		activeNotebook.insertCodeCellAndFocusContainer('below');
	}
});

registerNotebookKeybinding({
	id: 'erdosNotebook.focusUp',
	primary: KeyCode.UpArrow,
	secondary: [KeyCode.KeyK],
	onRun: ({ activeNotebook }) => {
		// TODO: Implement selection state machine
		console.log('Focus up:', activeNotebook);
	}
});

registerNotebookKeybinding({
	id: 'erdosNotebook.focusDown',
	primary: KeyCode.DownArrow,
	secondary: [KeyCode.KeyJ],
	onRun: ({ activeNotebook }) => {
		// TODO: Implement selection state machine
		console.log('Focus down:', activeNotebook);
	}
});

registerNotebookKeybinding({
	id: 'erdosNotebook.addSelectionDown',
	primary: KeyMod.Shift | KeyCode.DownArrow,
	secondary: [KeyMod.Shift | KeyCode.KeyJ],
	onRun: ({ activeNotebook }) => {
		// TODO: Implement selection state machine
		console.log('Add selection down:', activeNotebook);
	}
});

registerNotebookKeybinding({
	id: 'erdosNotebook.addSelectionUp',
	primary: KeyMod.Shift | KeyCode.UpArrow,
	secondary: [KeyMod.Shift | KeyCode.KeyK],
	onRun: ({ activeNotebook }) => {
		// TODO: Implement selection state machine
		console.log('Add selection up:', activeNotebook);
	}
});

registerNotebookKeybinding({
	id: 'erdosNotebook.cell.delete',
	primary: KeyCode.Backspace,
	secondary: [KeyChord(KeyCode.KeyD, KeyCode.KeyD)],
	onRun: ({ activeNotebook }) => {
		activeNotebook.deleteCell();
	}
});

registerNotebookKeybinding({
	id: 'erdosNotebook.cell.executeAndFocusContainer',
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	onRun: ({ activeNotebook }) => {
		// TODO: Implement cell execution
		console.log('Execute and focus:', activeNotebook);
	}
});

registerNotebookKeybinding({
	id: 'erdosNotebook.cell.executeAndSelectBelow',
	primary: KeyMod.Shift | KeyCode.Enter,
	onRun: ({ activeNotebook }) => {
		// TODO: Implement cell execution and selection
		console.log('Execute and select below:', activeNotebook);
	}
});

/**
 * Register a keybinding for the Erdos Notebook editor.
 */
function registerNotebookKeybinding({ id, onRun, ...opts }: {
	id: string;
	onRun: (args: { activeNotebook: IErdosNotebookInstance; accessor: ServicesAccessor }) => void;
} & Pick<ICommandAndKeybindingRule, 'primary' | 'secondary' | 'mac' | 'linux' | 'win'>) {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: id,
		weight: KeybindingWeight.EditorContrib,
		when: ERDOS_NOTEBOOK_EDITOR_FOCUSED,
		handler: (accessor) => {
			const notebookService = accessor.get(IErdosNotebookService);
			const activeNotebook = notebookService.getActiveInstance();
			if (!activeNotebook) { return; }
			onRun({ activeNotebook, accessor });
		},
		...opts
	});
}
//#endregion Keybindings