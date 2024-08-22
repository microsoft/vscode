/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle';
import { localize2 } from '../../../../../../nls';
import { Categories } from '../../../../../../platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions';
import { ICommandService } from '../../../../../../platform/commands/common/commands';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation';
import { Registry } from '../../../../../../platform/registry/common/platform';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../../../common/contributions';
import { Memento } from '../../../../../common/memento';
import { NotebookSetting } from '../../../common/notebookCommon';
import { HAS_OPENED_NOTEBOOK } from '../../../common/notebookContextKeys';
import { NotebookEditorInput } from '../../../common/notebookEditorInput';
import { IEditorService } from '../../../../../services/editor/common/editorService';
import { LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle';

const hasOpenedNotebookKey = 'hasOpenedNotebook';
const hasShownGettingStartedKey = 'hasShownNotebookGettingStarted';

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
		const memento = new Memento('notebookGettingStarted2', _storageService);
		const storedValue = memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);
		if (storedValue[hasOpenedNotebookKey]) {
			hasOpenedNotebook.set(true);
		}

		const needToShowGettingStarted = _configurationService.getValue(NotebookSetting.openGettingStarted) && !storedValue[hasShownGettingStartedKey];
		if (!storedValue[hasOpenedNotebookKey] || needToShowGettingStarted) {
			const onDidOpenNotebook = () => {
				hasOpenedNotebook.set(true);
				storedValue[hasOpenedNotebookKey] = true;

				if (needToShowGettingStarted) {
					_commandService.executeCommand('workbench.action.openWalkthrough', { category: 'notebooks', step: 'notebookProfile' }, true);
					storedValue[hasShownGettingStartedKey] = true;
				}

				memento.saveMemento();
			};

			if (_editorService.activeEditor?.typeId === NotebookEditorInput.ID) {
				// active editor is notebook
				onDidOpenNotebook();
				return;
			}

			const listener = this._register(_editorService.onDidActiveEditorChange(() => {
				if (_editorService.activeEditor?.typeId === NotebookEditorInput.ID) {
					listener.dispose();
					onDidOpenNotebook();
				}
			}));
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookGettingStarted, LifecyclePhase.Restored);

registerAction2(class NotebookClearNotebookLayoutAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.notebook.layout.gettingStarted',
			title: localize2('workbench.notebook.layout.gettingStarted.label', "Reset notebook getting started"),
			f1: true,
			precondition: ContextKeyExpr.equals(`config.${NotebookSetting.openGettingStarted}`, true),
			category: Categories.Developer,
		});
	}
	run(accessor: ServicesAccessor): void {
		const storageService = accessor.get(IStorageService);
		const memento = new Memento('notebookGettingStarted', storageService);

		const storedValue = memento.getMemento(StorageScope.PROFILE, StorageTarget.USER);
		storedValue[hasOpenedNotebookKey] = undefined;
		memento.saveMemento();
	}
});
