/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ILocalTranscriptionService } from '../../../../../platform/localTranscription/common/localTranscription.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EnablementState } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtension, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';

/**
 * When on-device chat dictation is supported on the current platform, the
 * third-party VS Code Speech extension is redundant. This contribution shows a
 * one-time notification prompting the user to disable it, but only when:
 *   1. the platform supports built-in dictation (`ILocalTranscriptionService.isSupported`,
 *      the same predicate that shows/hides the built-in mic button), and
 *   2. the extension is installed and currently enabled.
 * The prompt is shown at most once ever (guarded by an application-scoped storage flag).
 */
export class RedundantDictationExtensionNotifier implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.redundantDictationExtensionNotifier';

	/** Identifier of the extension made redundant by built-in dictation. */
	private static readonly EXTENSION_ID = 'ms-vscode.vscode-speech';

	/** Application-scoped flag so the prompt fires at most once per machine. */
	private static readonly STORAGE_KEY = 'chat.dictation.redundantExtensionPromptShown';

	constructor(
		@ILocalTranscriptionService private readonly localTranscriptionService: ILocalTranscriptionService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		this.check();
	}

	private async check(): Promise<void> {
		// (1) Only on platforms where built-in dictation actually works.
		if (!this.localTranscriptionService.isSupported) {
			return;
		}

		// (1b) Only when built-in dictation is actually enabled, so we never suggest
		// disabling a working extension before its replacement is turned on.
		if (this.configurationService.getValue<boolean>('chat.speechToText.enabled') !== true) {
			return;
		}

		// (3) Only ever prompt once.
		if (this.storageService.getBoolean(RedundantDictationExtensionNotifier.STORAGE_KEY, StorageScope.APPLICATION, false)) {
			return;
		}

		// (2) Only when the extension is installed and currently enabled.
		let extension: IExtension | undefined;
		try {
			const installed = await this.extensionsWorkbenchService.queryLocal();
			extension = installed.find(e => ExtensionIdentifier.equals(e.identifier.id, RedundantDictationExtensionNotifier.EXTENSION_ID));
		} catch (error) {
			this.logService.error('[dictation] failed to query installed extensions for redundant dictation prompt', error);
			return;
		}

		if (!extension) {
			return;
		}

		const isEnabled =
			extension.enablementState === EnablementState.EnabledGlobally ||
			extension.enablementState === EnablementState.EnabledWorkspace ||
			extension.enablementState === EnablementState.EnabledByEnvironment;
		if (!isEnabled) {
			return;
		}

		// Guard now so the prompt is shown at most once regardless of the outcome.
		this.markShown();

		const displayName = extension.displayName || extension.identifier.id;
		this.notificationService.prompt(
			Severity.Info,
			localize('redundantDictationExtension', "VS Code now has built-in dictation. Disable the '{0}' extension to avoid conflicts?", displayName),
			[
				{
					label: localize('disableExtension', "Disable Extension"),
					run: async () => {
						try {
							await this.extensionsWorkbenchService.setEnablement(extension!, EnablementState.DisabledGlobally);
						} catch (error) {
							this.logService.error('[dictation] failed to disable redundant dictation extension', error);
						}
					}
				},
				{
					label: localize('keepExtension', "Keep"),
					run: () => { }
				}
			]
		);
	}

	private markShown(): void {
		this.storageService.store(RedundantDictationExtensionNotifier.STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}
