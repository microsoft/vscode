/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Memento } from 'vs/workbench/common/memento';
import { HAS_OPENED_NOTEBOOK } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

const hasOpenedNotebookKey = 'hasOpenedNotebook';

/**
 * Sets a context key when a notebook has ever been opened by the user
 */
export class NotebookGettingStarted extends Disposable implements IWorkbenchContribution {

	constructor(
		@IEditorService _editorService: IEditorService,
		@IStorageService _storageService: IStorageService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@ICommandService _commandService: ICommandService,
		@IConfigurationService _configurationService: IConfigurationService,
	) {
		super();

		const hasOpenedNotebook = HAS_OPENED_NOTEBOOK.bindTo(_contextKeyService);
		const memento = new Memento('notebookGettingStarted', _storageService);
		const storedValue = memento.getMemento(StorageScope.GLOBAL, StorageTarget.USER);
		if (storedValue[hasOpenedNotebookKey]) {
			hasOpenedNotebook.set(true);
		} else {
			const listener = this._register(_editorService.onDidActiveEditorChange(() => {
				if (_editorService.activeEditor?.typeId === NotebookEditorInput.ID) {
					hasOpenedNotebook.set(true);
					storedValue[hasOpenedNotebookKey] = true;
					memento.saveMemento();
					listener.dispose();

					if (_configurationService.getValue('notebook.experimental.openGettingStarted')) {
						_commandService.executeCommand('workbench.action.openWalkthrough', { category: 'Setup', step: 'notebookProfile' }, true);
					}
				}
			}));
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookGettingStarted, LifecyclePhase.Restored);
