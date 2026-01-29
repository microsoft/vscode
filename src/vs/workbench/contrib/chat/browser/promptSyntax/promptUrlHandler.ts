/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { streamToBuffer, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { dirname } from '../../../../../base/common/path.js';
import { isValidBasename } from '../../../../../base/common/extpath.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IURLHandler, IURLService } from '../../../../../platform/url/common/url.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { askForPromptFileName } from './pickers/askForPromptName.js';
import { askForPromptSourceFolder } from './pickers/askForPromptSourceFolder.js';
import { getCleanPromptName } from '../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { Schemas } from '../../../../../base/common/network.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { mainWindow } from '../../../../../base/browser/window.js';

// example URL: code-oss:chat-prompt/install?url=https://gist.githubusercontent.com/aeschli/43fe78babd5635f062aef0195a476aad/raw/dfd71f60058a4dd25f584b55de3e20f5fd580e63/filterEvenNumbers.prompt.md

export class PromptUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {

	static readonly ID = 'workbench.contrib.promptUrlHandler';

	constructor(
		@IURLService urlService: IURLService,
		@INotificationService private readonly notificationService: INotificationService,
		@IRequestService private readonly requestService: IRequestService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,

		@IHostService private readonly hostService: IHostService,
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async handleURL(uri: URI): Promise<boolean> {
		let promptType: PromptsType | undefined;
		switch (uri.path) {
			case 'chat-prompt/install':
				promptType = PromptsType.prompt;
				break;
			case 'chat-instructions/install':
				promptType = PromptsType.instructions;
				break;
			case 'chat-mode/install':
			case 'chat-agent/install':
				promptType = PromptsType.agent;
				break;
			case 'chat-skill/install':
				promptType = PromptsType.skill;
				break;
			default:
				return false;
		}

		try {
			const query = decodeURIComponent(uri.query);
			if (!query || !query.startsWith('url=')) {
				return true;
			}

			const urlString = query.substring(4);
			const url = URI.parse(urlString);
			if (url.scheme !== Schemas.https && url.scheme !== Schemas.http) {
				this.logService.error(`[PromptUrlHandler] Invalid URL: ${urlString}`);
				return true;
			}

			await this.hostService.focus(mainWindow);

			if (await this.shouldBlockInstall(promptType, url)) {
				return true;
			}

			const result = await this.requestService.request({ type: 'GET', url: urlString }, CancellationToken.None);
			if (result.res.statusCode !== 200) {
				this.logService.error(`[PromptUrlHandler] Failed to fetch URL: ${urlString}`);
				this.notificationService.error(localize('failed', 'Failed to fetch URL: {0}', urlString));
				return true;
			}

			const responseData = (await streamToBuffer(result.stream)).toString();

			const newFolder = await this.instantiationService.invokeFunction(askForPromptSourceFolder, promptType);
			if (!newFolder) {
				return true;
			}

			if (promptType === PromptsType.skill) {
				const manifest = JSON.parse(responseData) as { name?: string; files: { source: string; destination: string }[] };

				if (!manifest.name) {
					this.notificationService.error(localize('missingSkillName', "The skill manifest does not contain a name."));
					return true;
				}

				const newName = manifest.name;
				if (!isValidBasename(newName)) {
					this.notificationService.error(localize('invalidSkillName', "The skill name '{0}' is invalid.", newName));
					return true;
				}

				const skillRootUri = URI.joinPath(newFolder.uri, newName);
				if (await this.fileService.exists(skillRootUri)) {
					this.notificationService.error(localize('skillExists', "A folder with the name '{0}' already exists.", newName));
					return true;
				}

				await this.fileService.createFolder(skillRootUri);

				// Process files
				for (const file of manifest.files) {
					const sourceUrl = file.source;

					const fileUrl = URI.parse(sourceUrl);

					const fileRes = await this.requestService.request({ type: 'GET', url: fileUrl.toString() }, CancellationToken.None);
					if (fileRes.res.statusCode === 200) {
						const buf = await streamToBuffer(fileRes.stream);
						const destPath = URI.joinPath(skillRootUri, file.destination);
						await this.fileService.createFolder(URI.joinPath(skillRootUri, dirname(file.destination)));
						await this.fileService.createFile(destPath, buf);
					}
				}

				const skillFile = URI.joinPath(skillRootUri, 'SKILL.md');
				if (await this.fileService.exists(skillFile)) {
					await this.openerService.open(skillFile);
				}

				return true;
			}

			const newName = await this.instantiationService.invokeFunction(askForPromptFileName, promptType, newFolder.uri, getCleanPromptName(url));
			if (!newName) {
				return true;
			}

			const promptUri = URI.joinPath(newFolder.uri, newName);

			await this.fileService.createFolder(newFolder.uri);
			await this.fileService.createFile(promptUri, VSBuffer.fromString(responseData));

			await this.openerService.open(promptUri);
			return true;

		} catch (error) {
			this.logService.error(`Error handling prompt URL ${uri.toString()}`, error);
			return true;
		}
	}

	private async shouldBlockInstall(promptType: PromptsType, url: URI): Promise<boolean> {
		let uriLabel = url.toString();
		if (uriLabel.length > 50) {
			uriLabel = `${uriLabel.substring(0, 35)}...${uriLabel.substring(uriLabel.length - 15)}`;
		}

		const detail = new MarkdownString('', { supportHtml: true });
		detail.appendMarkdown(localize('confirmOpenDetail2', "This will access {0}.\n\n", `[${uriLabel}](${url.toString()})`));
		detail.appendMarkdown(localize('confirmOpenDetail3', "If you did not initiate this request, it may represent an attempted attack on your system. Unless you took an explicit action to initiate this request, you should press 'No'"));

		let message: string;
		switch (promptType) {
			case PromptsType.prompt:
				message = localize('confirmInstallPrompt', "An external application wants to create a prompt file with content from a URL. Do you want to continue by selecting a destination folder and name?");
				break;
			case PromptsType.instructions:
				message = localize('confirmInstallInstructions', "An external application wants to create an instructions file with content from a URL. Do you want to continue by selecting a destination folder and name?");
				break;
			case PromptsType.skill:
				message = localize('confirmInstallSkill', "An external application wants to create a skill folder with potential multiple files from a URL. Do you want to continue by selecting a destination folder?");
				break;
			default:
				message = localize('confirmInstallAgent', "An external application wants to create a custom agent with content from a URL. Do you want to continue by selecting a destination folder and name?");
				break;
		}

		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			primaryButton: localize({ key: 'yesButton', comment: ['&& denotes a mnemonic'] }, "&&Yes"),
			cancelButton: localize('noButton', "No"),
			message,
			custom: {
				markdownDetails: [{
					markdown: detail
				}]
			}
		});

		return !confirmed;

	}
}
