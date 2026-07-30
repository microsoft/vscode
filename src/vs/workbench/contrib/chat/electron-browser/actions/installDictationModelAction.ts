/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../../base/common/resources.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { DEFAULT_LOCAL_TRANSCRIPTION_MODEL, ILocalTranscriptionService } from '../../../../../platform/localTranscription/common/localTranscription.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { INSTALL_DICTATION_MODEL_COMMAND_ID } from '../../browser/speechToText/chatSpeechToTextService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

export function registerInstallDictationModelAction(): void {
	const enabled = ContextKeyExpr.and(
		ChatContextKeys.enabled,
		ContextKeyExpr.equals('config.dictation.enabled', true),
	);

	registerAction2(class InstallDictationModelAction extends Action2 {
		constructor() {
			super({
				id: INSTALL_DICTATION_MODEL_COMMAND_ID,
				category: CHAT_CATEGORY,
				title: localize2('chat.installDictationModel', "Install Dictation Model from Local Package..."),
				precondition: enabled,
				menu: {
					id: MenuId.CommandPalette,
					when: enabled,
				},
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const localTranscriptionService = accessor.get(ILocalTranscriptionService);
			const notificationService = accessor.get(INotificationService);
			const fileDialogService = accessor.get(IFileDialogService);
			const progressService = accessor.get(IProgressService);
			const environmentService = accessor.get(IEnvironmentService);
			if (!localTranscriptionService.isSupported) {
				notificationService.warn(localize('chat.installDictationModel.unsupported', "On-device dictation is not supported on this platform."));
				return;
			}

			const sources = await fileDialogService.showOpenDialog({
				title: localize('chat.installDictationModel.dialogTitle', "Select the {0} CPU model package (.zip) or folder", DEFAULT_LOCAL_TRANSCRIPTION_MODEL),
				openLabel: localize('chat.installDictationModel.openLabel', "Install"),
				canSelectFiles: true,
				canSelectFolders: true,
				canSelectMany: false,
				filters: [{ name: localize('chat.installDictationModel.filter', "Foundry Local Model Package"), extensions: ['zip'] }],
			});
			const source = sources?.[0];
			if (!source) {
				return;
			}
			if (source.scheme !== Schemas.file) {
				notificationService.error(localize('chat.installDictationModel.localOnly', "The dictation model package must be on the local file system."));
				return;
			}

			const cacheDir = joinPath(environmentService.cacheHome, 'chatDictationModels').fsPath;
			try {
				const result = await progressService.withProgress({
					location: ProgressLocation.Notification,
					title: localize('chat.installDictationModel.progress', "Installing dictation model..."),
				}, () => localTranscriptionService.importModel({ sourcePath: source.fsPath, cacheDir }));
				notificationService.info(localize(
					'chat.installDictationModel.success',
					"Installed {0} version {1}.",
					result.model,
					result.version,
				));
			} catch (error) {
				notificationService.error(localize(
					'chat.installDictationModel.error',
					"Failed to install the dictation model: {0}",
					error instanceof Error ? error.message : String(error),
				));
			}
		}
	});
}
