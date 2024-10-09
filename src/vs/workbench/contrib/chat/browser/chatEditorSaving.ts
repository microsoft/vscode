/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { SaveReason } from '../../../common/editor.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ChatAgentLocation, IChatAgentService } from '../common/chatAgents.js';
import { IChatEditingService, IChatEditingSession, WorkingSetEntryState } from '../common/chatEditingService.js';
import { CHAT_CATEGORY } from './actions/chatActions.js';


const _storageKey = 'workbench.chat.saveWithAiGeneratedChanges';

export class ChatEditorSaving extends Disposable implements IWorkbenchContribution {

	static readonly ID: string = 'workbench.chat.editorSaving';


	private readonly _sessionStore = this._store.add(new DisposableMap<IChatEditingSession>());

	constructor(
		@IChatEditingService chatEditingService: IChatEditingService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@ITextFileService textFileService: ITextFileService,
		@ILabelService labelService: ILabelService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IFilesConfigurationService private readonly _fileConfigService: IFilesConfigurationService,
	) {
		super();

		const store = this._store.add(new DisposableStore());

		const queue = new Queue();

		const update = () => {

			store.clear();

			const alwaysSave = this._storageService.getBoolean(_storageKey, StorageScope.PROFILE, false);
			if (alwaysSave) {
				return;
			}


			store.add(chatEditingService.onDidCreateEditingSession(e => this._handleNewEditingSession(e)));
			store.add(textFileService.files.addSaveParticipant({
				participate: async (workingCopy, context, progress, token) => {

					if (context.reason !== SaveReason.EXPLICIT) {
						// all saves that we are concerned about are explicit
						// because we have disabled auto-save for them
						return;
					}

					const session = chatEditingService.getEditingSession(workingCopy.resource);
					if (!session) {
						return;
					}


					if (!session.entries.get().find(e => e.state.get() === WorkingSetEntryState.Modified && e.modifiedURI.toString() === workingCopy.resource.toString())) {
						return;
					}

					// ensure one modal at the time
					await queue.queue(async () => {

						// this might have changed in the meantime and there is checked again and acted upon
						const alwaysSave = this._storageService.getBoolean(_storageKey, StorageScope.PROFILE, false);
						if (alwaysSave) {
							return;
						}

						const agentName = chatAgentService.getDefaultAgent(ChatAgentLocation.EditingSession)?.fullName;
						const filelabel = labelService.getUriBasenameLabel(workingCopy.resource);

						const message = agentName
							? localize('message.1', "Do you want to save the changes {0} made in {1}?", agentName, filelabel)
							: localize('message.2', "Do you want to save the changes chat made in {0}?", filelabel);

						const result = await this._dialogService.confirm({
							message,
							detail: localize('detail', "AI-generated changes may be incorect and should be reviewed before saving.", agentName),
							primaryButton: localize('save', "Save"),
							cancelButton: localize('discard', "Cancel"),
							checkbox: {
								label: localize('config', "Always save with AI-generated changes"),
								checked: false
							}
						});

						if (!result.confirmed) {
							// cancel the save
							throw new CancellationError();
						}

						if (result.checkboxChecked) {
							// remember choice
							this._storageService.store(_storageKey, true, StorageScope.PROFILE, StorageTarget.USER);
						}
					});
				}
			}));
		};

		this._storageService.onDidChangeValue(StorageScope.PROFILE, _storageKey, this._store)(update);
		update();
	}

	private _handleNewEditingSession(session: IChatEditingSession) {

		const store = new DisposableStore();

		// disable auto save for those files involved in editing
		const saveConfig = store.add(new MutableDisposable());
		const update = () => {
			const store = new DisposableStore();
			const entries = session.entries.get();
			for (const entry of entries) {
				if (entry.state.get() === WorkingSetEntryState.Modified) {
					store.add(this._fileConfigService.disableAutoSave(entry.modifiedURI));
				}
			}
			saveConfig.value = store;
		};

		update();

		this._sessionStore.set(session, store);

		store.add(session.onDidChange(() => {
			update();
		}));

		store.add(session.onDidDispose(() => {
			this._sessionStore.deleteAndDispose(session);
		}));
	}
}


registerAction2(class extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.resetChatEditorSaving',
			title: localize2('resetChatEditorSaving', "Reset Choise for 'Always save with AI-generated changes'"),
			category: CHAT_CATEGORY,
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const storageService = accessor.get(IStorageService);
		storageService.remove(_storageKey, StorageScope.PROFILE);
	}
});
