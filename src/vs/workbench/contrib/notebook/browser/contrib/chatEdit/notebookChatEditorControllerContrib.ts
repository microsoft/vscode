/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { INotebookModelSynchronizerFactory, NotebookModelSynchronizerFactory } from './notebookSynchronizer.js';
import { INotebookOriginalModelReferenceFactory, NotebookOriginalModelReferenceFactory } from './notebookOriginalModelRefFactory.js';
import { RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../../../nls.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { INotebookOriginalCellModelFactory, OriginalNotebookCellModelFactory } from './notebookOriginalCellModelFactory.js';
import { ChatEditingNotebookFileSystemProviderContrib } from './chatEditingNotebookFileSytemProviders.js';
import { registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { NotebookEditor } from '../../notebookEditor.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../../../editor/browser/editorExtensions.js';
import { NotebookChatActionsOverlay } from './notebookChatEditorOverlay.js';
import { NotebookCellChatEditorController, NotebookChatEditorController } from './notebookChatEditorController.js';

export const ctxNotebookHasEditorModification = new RawContextKey<boolean>('chat.hasNotebookEditorModifications', undefined, localize('chat.hasNotebookEditorModifications', "The current Notebook editor contains chat modifications"));

export class NotebookChatEditorControllerContrib extends Disposable implements INotebookEditorContribution {

	public static readonly ID: string = 'workbench.notebook.chatEditorController';
	readonly _serviceBrand: undefined;
	private readonly controller?: NotebookChatEditorController;
	static get(editor: INotebookEditor): NotebookChatEditorController | null {
		return editor.getContribution<NotebookChatEditorControllerContrib>(NotebookChatEditorControllerContrib.ID)?.controller ?? null;
	}
	constructor(
		notebookEditor: INotebookEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,

	) {
		super();
		this.controller = this._register(instantiationService.createInstance(NotebookChatEditorController, notebookEditor));
		this._register(instantiationService.createInstance(NotebookChatActionsOverlay, notebookEditor, this.controller));
	}
}

registerEditorContribution(NotebookCellChatEditorController.ID, NotebookCellChatEditorController, EditorContributionInstantiation.Eventually);
registerNotebookContribution(NotebookChatEditorControllerContrib.ID, NotebookChatEditorControllerContrib);
registerSingleton(INotebookOriginalModelReferenceFactory, NotebookOriginalModelReferenceFactory, InstantiationType.Delayed);
registerSingleton(INotebookModelSynchronizerFactory, NotebookModelSynchronizerFactory, InstantiationType.Delayed);
registerSingleton(INotebookOriginalCellModelFactory, OriginalNotebookCellModelFactory, InstantiationType.Delayed);

registerWorkbenchContribution2(ChatEditingNotebookFileSystemProviderContrib.ID, ChatEditingNotebookFileSystemProviderContrib, { editorTypeId: NotebookEditor.ID });
