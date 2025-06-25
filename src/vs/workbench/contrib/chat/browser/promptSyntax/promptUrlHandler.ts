/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { streamToBuffer, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
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

// example URL: code-oss:chat-prompts/install?https://gist.githubusercontent.com/aeschli/43fe78babd5635f062aef0195a476aad/raw/dfd71f60058a4dd25f584b55de3e20f5fd580e63/filterEvenNumbers.prompt.md

export class PromptUrlHandler extends Disposable implements IWorkbenchContribution, IURLHandler {

	static readonly ID = 'workbench.contrib.promptUrlHandler';

	constructor(
		@IURLService urlService: IURLService,
		@INotificationService private readonly notificationService: INotificationService,
		@IRequestService private readonly requestService: IRequestService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this._register(urlService.registerHandler(this));
	}

	async handleURL(uri: URI): Promise<boolean> {
		let promptType: PromptsType | undefined;
		switch (uri.path) {
			case 'chat-prompts/install':
				promptType = PromptsType.prompt;
				break;
			case 'chat-instructions/install':
				promptType = PromptsType.instructions;
				break;
			case 'chat-mode/install':
				promptType = PromptsType.mode;
				break;
			default:
				return false;
		}

		try {
			const url = decodeURIComponent(uri.query);
			if (!url || !url.startsWith('https://')) {
				this.notificationService.error(`Invalid URL: ${url}`);
				return false;
			}

			const result = await this.requestService.request({ type: 'GET', url }, CancellationToken.None);
			if (result.res.statusCode !== 200) {
				this.notificationService.error(`Failed to fetch URL: ${url}`);
				return false;
			}

			const responseData = (await streamToBuffer(result.stream)).toString();

			const newFolder = await this.instantiationService.invokeFunction(askForPromptSourceFolder, promptType);
			if (!newFolder) {
				return false;
			}

			const newName = await this.instantiationService.invokeFunction(askForPromptFileName, promptType, newFolder.uri, getCleanPromptName(URI.parse(url)));
			if (!newName) {
				return false;
			}

			const promptUri = URI.joinPath(newFolder.uri, newName);

			await this.fileService.createFolder(newFolder.uri);
			await this.fileService.createFile(promptUri, VSBuffer.fromString(responseData));

			await this.openerService.open(promptUri);
			return true;

		} catch (error) {
			this.logService.error(`Error handling prompt URL ${uri}`, error);
			return false;
		}
	}

}
