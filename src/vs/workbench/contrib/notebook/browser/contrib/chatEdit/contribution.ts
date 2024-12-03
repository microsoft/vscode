/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerEditorContribution, EditorContributionInstantiation } from '../../../../../../editor/browser/editorExtensions.js';
import { registerSingleton, InstantiationType } from '../../../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { ChatEditingNotebookFileSystemProviderContrib } from './chatEditingNotebookFileSytemProviders.js';
import { NotebookCellChatEditorController } from './notebookChatEditorController.js';
import { NotebookChatEditorControllerContrib } from './notebookChatEditorControllerContrib.js';
import { INotebookOriginalCellModelFactory, OriginalNotebookCellModelFactory } from './notebookOriginalCellModelFactory.js';
import { INotebookOriginalModelReferenceFactory, NotebookOriginalModelReferenceFactory } from './notebookOriginalModelRefFactory.js';
import { INotebookModelSynchronizerFactory, NotebookModelSynchronizerFactory } from './notebookSynchronizer.js';

registerEditorContribution(NotebookCellChatEditorController.ID, NotebookCellChatEditorController, EditorContributionInstantiation.Eventually);
registerNotebookContribution(NotebookChatEditorControllerContrib.ID, NotebookChatEditorControllerContrib);
registerSingleton(INotebookOriginalModelReferenceFactory, NotebookOriginalModelReferenceFactory, InstantiationType.Delayed);
registerSingleton(INotebookModelSynchronizerFactory, NotebookModelSynchronizerFactory, InstantiationType.Delayed);
registerSingleton(INotebookOriginalCellModelFactory, OriginalNotebookCellModelFactory, InstantiationType.Delayed);

registerWorkbenchContribution2(ChatEditingNotebookFileSystemProviderContrib.ID, ChatEditingNotebookFileSystemProviderContrib, WorkbenchPhase.BlockStartup);
