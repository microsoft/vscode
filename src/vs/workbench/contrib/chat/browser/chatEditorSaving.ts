/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { SaveReason } from '../../../common/editor.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ChatAgentLocation, IChatAgentService } from '../common/chatAgents.js';
import { IChatEditingService, IChatEditingSession, WorkingSetEntryState } from '../common/chatEditingService.js';

export class ChatEditorSaving extends Disposable implements IWorkbenchContribution {

	static readonly ID: string = 'workbench.chat.editorSaving';

	private static readonly _config = 'chat.editing.alwaysSaveWithGeneratedChanges';

	private readonly _sessionStore = this._store.add(new DisposableMap<IChatEditingSession>());

	constructor(
		@IConfigurationService configService: IConfigurationService,
		@IChatEditingService chatEditingService: IChatEditingService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@ITextFileService textFileService: ITextFileService,
		@ILabelService labelService: ILabelService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IFilesConfigurationService private readonly _fileConfigService: IFilesConfigurationService,
	) {
		super();

		const store = this._store.add(new DisposableStore());

		const queue = new Queue();

		const update = () => {

			store.clear();

			const alwaysSave = configService.getValue<boolean>(ChatEditorSaving._config);
			if (alwaysSave) {
				return;
			}

			if (chatEditingService.currentEditingSession) {
				this._handleNewEditingSession(chatEditingService.currentEditingSession, store);
			}

			store.add(chatEditingService.onDidCreateEditingSession(e => this._handleNewEditingSession(e, store)));
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
						const alwaysSave = configService.getValue<boolean>(ChatEditorSaving._config);
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
								label: localize('config', "Always save with AI-generated changes without asking"),
								checked: false
							}
						});

						if (!result.confirmed) {
							// cancel the save
							throw new CancellationError();
						}

						if (result.checkboxChecked) {
							// remember choice
							await configService.updateValue(ChatEditorSaving._config, true);
						}
					});
				}
			}));
		};

		configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatEditorSaving._config)) {
				update();
			}
		});
		update();
	}

	private _handleNewEditingSession(session: IChatEditingSession, container: DisposableStore) {

		const store = new DisposableStore();
		container.add(store);

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
			store.dispose();
			container.delete(store);
		}));
	}
}
