/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { streamToBuffer, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
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
let PromptUrlHandler = class PromptUrlHandler extends Disposable {
    static { this.ID = 'workbench.contrib.promptUrlHandler'; }
    constructor(urlService, notificationService, requestService, instantiationService, fileService, openerService, logService, dialogService, hostService) {
        super();
        this.notificationService = notificationService;
        this.requestService = requestService;
        this.instantiationService = instantiationService;
        this.fileService = fileService;
        this.openerService = openerService;
        this.logService = logService;
        this.dialogService = dialogService;
        this.hostService = hostService;
        this._register(urlService.registerHandler(this));
    }
    async handleURL(uri) {
        let promptType;
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
            const result = await this.requestService.request({ type: 'GET', url: urlString, callSite: 'promptUrlHandler.resolveUrl' }, CancellationToken.None);
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
            const newName = await this.instantiationService.invokeFunction(askForPromptFileName, promptType, newFolder.uri, getCleanPromptName(url));
            if (!newName) {
                return true;
            }
            const promptUri = URI.joinPath(newFolder.uri, newName);
            await this.fileService.createFolder(newFolder.uri);
            await this.fileService.createFile(promptUri, VSBuffer.fromString(responseData));
            await this.openerService.open(promptUri);
            return true;
        }
        catch (error) {
            this.logService.error(`Error handling prompt URL ${uri.toString()}`, error);
            return true;
        }
    }
    async shouldBlockInstall(promptType, url) {
        let uriLabel = url.toString();
        if (uriLabel.length > 50) {
            uriLabel = `${uriLabel.substring(0, 35)}...${uriLabel.substring(uriLabel.length - 15)}`;
        }
        const detail = new MarkdownString('', { supportHtml: true });
        detail.appendMarkdown(localize('confirmOpenDetail2', "This will access {0}.\n\n", `[${uriLabel}](${url.toString()})`));
        detail.appendMarkdown(localize('confirmOpenDetail3', "If you did not initiate this request, it may represent an attempted attack on your system. Unless you took an explicit action to initiate this request, you should press 'No'"));
        let message;
        switch (promptType) {
            case PromptsType.prompt:
                message = localize('confirmInstallPrompt', "An external application wants to create a prompt file with content from a URL. Do you want to continue by selecting a destination folder and name?");
                break;
            case PromptsType.instructions:
                message = localize('confirmInstallInstructions', "An external application wants to create an instructions file with content from a URL. Do you want to continue by selecting a destination folder and name?");
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
};
PromptUrlHandler = __decorate([
    __param(0, IURLService),
    __param(1, INotificationService),
    __param(2, IRequestService),
    __param(3, IInstantiationService),
    __param(4, IFileService),
    __param(5, IOpenerService),
    __param(6, ILogService),
    __param(7, IDialogService),
    __param(8, IHostService)
], PromptUrlHandler);
export { PromptUrlHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0VXJsSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9wcm9tcHRTeW50YXgvcHJvbXB0VXJsSGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDcEYsT0FBTyxFQUFlLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRXJGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3JFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FB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