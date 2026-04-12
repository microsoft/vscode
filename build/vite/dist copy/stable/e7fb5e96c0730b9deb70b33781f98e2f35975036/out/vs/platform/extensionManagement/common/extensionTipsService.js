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
import { isNonEmptyArray } from '../../../base/common/arrays.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { IProductService } from '../../product/common/productService.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { join } from '../../../base/common/path.js';
import { isWindows } from '../../../base/common/platform.js';
import { env } from '../../../base/common/process.js';
import { areSameExtensions } from './extensionManagementUtil.js';
//#region Base Extension Tips Service
let ExtensionTipsService = class ExtensionTipsService extends Disposable {
    constructor(fileService, productService) {
        super();
        this.fileService = fileService;
        this.productService = productService;
        this.allConfigBasedTips = new Map();
        if (this.productService.configBasedExtensionTips) {
            Object.entries(this.productService.configBasedExtensionTips).forEach(([, value]) => this.allConfigBasedTips.set(value.configPath, value));
        }
    }
    getConfigBasedTips(folder) {
        return this.getValidConfigBasedTips(folder);
    }
    async getImportantExecutableBasedTips() {
        return [];
    }
    async getOtherExecutableBasedTips() {
        return [];
    }
    async getValidConfigBasedTips(folder) {
        const result = [];
        for (const [configPath, tip] of this.allConfigBasedTips) {
            if (tip.configScheme && tip.configScheme !== folder.scheme) {
                continue;
            }
            try {
                const content = (await this.fileService.readFile(joinPath(folder, configPath))).value.toString();
                for (const [key, value] of Object.entries(tip.recommendations)) {
                    if (!value.contentPattern || new RegExp(value.contentPattern, 'mig').test(content)) {
                        result.push({
                            extensionId: key,
                            extensionName: value.name,
                            configName: tip.configName,
                            important: !!value.important,
                            isExtensionPack: !!value.isExtensionPack,
                            whenNotInstalled: value.whenNotInstalled
                        });
                    }
                }
            }
            catch (error) { /* Ignore */ }
        }
        return result;
    }
};
ExtensionTipsService = __decorate([
    __param(0, IFileService),
    __param(1, IProductService)
], ExtensionTipsService);
export { ExtensionTipsService };
const promptedExecutableTipsStorageKey = 'extensionTips/promptedExecutableTips';
const lastPromptedMediumImpExeTimeStorageKey = 'extensionTips/lastPromptedMediumImpExeTime';
export class AbstractNativeExtensionTipsService extends ExtensionTipsService {
    constructor(userHome, windowEvents, telemetryService, extensionManagementService, storageService, extensionRecommendationNotificationService, fileService, productService) {
        super(fileService, productService);
        this.userHome = userHome;
        this.windowEvents = windowEvents;
        this.telemetryService = telemetryService;
        this.extensionManagementService = extensionManagementService;
        this.storageService = storageService;
        this.extensionRecommendationNotificationService = extensionRecommendationNotificationService;
        this.highImportanceExecutableTips = new Map();
        this.mediumImportanceExecutableTips = new Map();
        this.allOtherExecutableTips = new Map();
        this.highImportanceTipsByExe = new Map();
        this.mediumImportanceTipsByExe = new Map();
        if (productService.exeBasedExtensionTips) {
            Object.entries(productService.exeBasedExtensionTips).forEach(([key, exeBasedExtensionTip]) => {
                const highImportanceRecommendations = [];
                const mediumImportanceRecommendations = [];
                const otherRecommendations = [];
                Object.entries(exeBasedExtensionTip.recommendations).forEach(([extensionId, value]) => {
                    if (value.important) {
                        if (exeBasedExtensionTip.important) {
                            highImportanceRecommendations.push({ extensionId, extensionName: value.name, isExtensionPack: !!value.isExtensionPack });
                        }
                        else {
                            mediumImportanceRecommendations.push({ extensionId, extensionName: value.name, isExtensionPack: !!value.isExtensionPack });
                        }
                    }
                    else {
                        otherRecommendations.push({ extensionId, extensionName: value.name, isExtensionPack: !!value.isExtensionPack });
                    }
                });
                if (highImportanceRecommendations.length) {
                    this.highImportanceExecutableTips.set(key, { exeFriendlyName: exeBasedExtensionTip.friendlyName, windowsPath: exeBasedExtensionTip.windowsPath, recommendations: highImportanceRecommendations });
                }
                if (mediumImportanceRecommendations.length) {
                    this.mediumImportanceExecutableTips.set(key, { exeFriendlyName: exeBasedExtensionTip.friendlyName, windowsPath: exeBasedExtensionTip.windowsPath, recommendations: mediumImportanceRecommendations });
                }
                if (otherRecommendations.length) {
                    this.allOtherExecutableTips.set(key, { exeFriendlyName: exeBasedExtensionTip.friendlyName, windowsPath: exeBasedExtensionTip.windowsPath, recommendations: otherRecommendations });
                }
            });
        }
        /*
            3s has come out to be the good number to fetch and prompt important exe based recommendations
            Also fetch important exe based recommendations for reporting telemetry
        */
        disposableTimeout(async () => {
            await this.collectTips();
            this.promptHighImportanceExeBasedTip();
            this.promptMediumImportanceExeBasedTip();
        }, 3000, this._store);
    }
    async getImportantExecutableBasedTips() {
        const highImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.highImportanceExecutableTips);
        const mediumImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.mediumImportanceExecutableTips);
        return [...highImportanceExeTips, ...mediumImportanceExeTips];
    }
    getOtherExecutableBasedTips() {
        return this.getValidExecutableBasedExtensionTips(this.allOtherExecutableTips);
    }
    async collectTips() {
        const highImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.highImportanceExecutableTips);
        const mediumImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.mediumImportanceExecutableTips);
        const local = await this.extensionManagementService.getInstalled();
        this.highImportanceTipsByExe = this.groupImportantTipsByExe(highImportanceExeTips, local);
        this.mediumImportanceTipsByExe = this.groupImportantTipsByExe(mediumImportanceExeTips, local);
    }
    groupImportantTipsByExe(importantExeBasedTips, local) {
        const importantExeBasedRecommendations = new Map();
        importantExeBasedTips.forEach(tip => importantExeBasedRecommendations.set(tip.extensionId.toLowerCase(), tip));
        const { installed, uninstalled: recommendations } = this.groupByInstalled([...importantExeBasedRecommendations.keys()], local);
        /* Log installed and uninstalled exe based recommendations */
        for (const extensionId of installed) {
            const tip = importantExeBasedRecommendations.get(extensionId);
            if (tip) {
                this.telemetryService.publicLog2('exeExtensionRecommendations:alreadyInstalled', { extensionId, exeName: tip.exeName });
            }
        }
        for (const extensionId of recommendations) {
            const tip = importantExeBasedRecommendations.get(extensionId);
            if (tip) {
                this.telemetryService.publicLog2('exeExtensionRecommendations:notInstalled', { extensionId, exeName: tip.exeName });
            }
        }
        const promptedExecutableTips = this.getPromptedExecutableTips();
        const tipsByExe = new Map();
        for (const extensionId of recommendations) {
            const tip = importantExeBasedRecommendations.get(extensionId);
            if (tip && (!promptedExecutableTips[tip.exeName] || !promptedExecutableTips[tip.exeName].includes(tip.extensionId))) {
                let tips = tipsByExe.get(tip.exeName);
                if (!tips) {
                    tips = [];
                    tipsByExe.set(tip.exeName, tips);
                }
                tips.push(tip);
            }
        }
        return tipsByExe;
    }
    /**
     * High importance tips are prompted once per restart session
     */
    promptHighImportanceExeBasedTip() {
        if (this.highImportanceTipsByExe.size === 0) {
            return;
        }
        const [exeName, tips] = [...this.highImportanceTipsByExe.entries()][0];
        this.promptExeRecommendations(tips)
            .then(result => {
            switch (result) {
                case "reacted" /* RecommendationsNotificationResult.Accepted */:
                    this.addToRecommendedExecutables(tips[0].exeName, tips);
                    break;
                case "ignored" /* RecommendationsNotificationResult.Ignored */:
                    this.highImportanceTipsByExe.delete(exeName);
                    break;
                case "incompatibleWindow" /* RecommendationsNotificationResult.IncompatibleWindow */: {
                    // Recommended in incompatible window. Schedule the prompt after active window change
                    const onActiveWindowChange = Event.once(Event.latch(Event.any(this.windowEvents.onDidOpenMainWindow, this.windowEvents.onDidFocusMainWindow)));
                    this._register(onActiveWindowChange(() => this.promptHighImportanceExeBasedTip()));
                    break;
                }
                case "toomany" /* RecommendationsNotificationResult.TooMany */: {
                    // Too many notifications. Schedule the prompt after one hour
                    const disposable = this._register(new MutableDisposable());
                    disposable.value = disposableTimeout(() => { disposable.dispose(); this.promptHighImportanceExeBasedTip(); }, 60 * 60 * 1000 /* 1 hour */);
                    break;
                }
            }
        });
    }
    /**
     * Medium importance tips are prompted once per 7 days
     */
    promptMediumImportanceExeBasedTip() {
        if (this.mediumImportanceTipsByExe.size === 0) {
            return;
        }
        const lastPromptedMediumExeTime = this.getLastPromptedMediumExeTime();
        const timeSinceLastPrompt = Date.now() - lastPromptedMediumExeTime;
        const promptInterval = 7 * 24 * 60 * 60 * 1000; // 7 Days
        if (timeSinceLastPrompt < promptInterval) {
            // Wait until interval and prompt
            const disposable = this._register(new MutableDisposable());
            disposable.value = disposableTimeout(() => { disposable.dispose(); this.promptMediumImportanceExeBasedTip(); }, promptInterval - timeSinceLastPrompt);
            return;
        }
        const [exeName, tips] = [...this.mediumImportanceTipsByExe.entries()][0];
        this.promptExeRecommendations(tips)
            .then(result => {
            switch (result) {
                case "reacted" /* RecommendationsNotificationResult.Accepted */: {
                    // Accepted: Update the last prompted time and caches.
                    this.updateLastPromptedMediumExeTime(Date.now());
                    this.mediumImportanceTipsByExe.delete(exeName);
                    this.addToRecommendedExecutables(tips[0].exeName, tips);
                    // Schedule the next recommendation for next internval
                    const disposable1 = this._register(new MutableDisposable());
                    disposable1.value = disposableTimeout(() => { disposable1.dispose(); this.promptMediumImportanceExeBasedTip(); }, promptInterval);
                    break;
                }
                case "ignored" /* RecommendationsNotificationResult.Ignored */:
                    // Ignored: Remove from the cache and prompt next recommendation
                    this.mediumImportanceTipsByExe.delete(exeName);
                    this.promptMediumImportanceExeBasedTip();
                    break;
                case "incompatibleWindow" /* RecommendationsNotificationResult.IncompatibleWindow */: {
                    // Recommended in incompatible window. Schedule the prompt after active window change
                    const onActiveWindowChange = Event.once(Event.latch(Event.any(this.windowEvents.onDidOpenMainWindow, this.windowEvents.onDidFocusMainWindow)));
                    this._register(onActiveWindowChange(() => this.promptMediumImportanceExeBasedTip()));
                    break;
                }
                case "toomany" /* RecommendationsNotificationResult.TooMany */: {
                    // Too many notifications. Schedule the prompt after one hour
                    const disposable2 = this._register(new MutableDisposable());
                    disposable2.value = disposableTimeout(() => { disposable2.dispose(); this.promptMediumImportanceExeBasedTip(); }, 60 * 60 * 1000 /* 1 hour */);
                    break;
                }
            }
        });
    }
    async promptExeRecommendations(tips) {
        const installed = await this.extensionManagementService.getInstalled(1 /* ExtensionType.User */);
        const extensions = tips
            .filter(tip => !tip.whenNotInstalled || tip.whenNotInstalled.every(id => installed.every(local => !areSameExtensions(local.identifier, { id }))))
            .map(({ extensionId }) => extensionId.toLowerCase());
        return this.extensionRecommendationNotificationService.promptImportantExtensionsInstallNotification({ extensions, source: 3 /* RecommendationSource.EXE */, name: tips[0].exeFriendlyName, searchValue: `@exe:"${tips[0].exeName}"` });
    }
    getLastPromptedMediumExeTime() {
        let value = this.storageService.getNumber(lastPromptedMediumImpExeTimeStorageKey, -1 /* StorageScope.APPLICATION */);
        if (!value) {
            value = Date.now();
            this.updateLastPromptedMediumExeTime(value);
        }
        return value;
    }
    updateLastPromptedMediumExeTime(value) {
        this.storageService.store(lastPromptedMediumImpExeTimeStorageKey, value, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
    getPromptedExecutableTips() {
        return JSON.parse(this.storageService.get(promptedExecutableTipsStorageKey, -1 /* StorageScope.APPLICATION */, '{}'));
    }
    addToRecommendedExecutables(exeName, tips) {
        const promptedExecutableTips = this.getPromptedExecutableTips();
        promptedExecutableTips[exeName] = tips.map(({ extensionId }) => extensionId.toLowerCase());
        this.storageService.store(promptedExecutableTipsStorageKey, JSON.stringify(promptedExecutableTips), -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
    }
    groupByInstalled(recommendationsToSuggest, local) {
        const installed = [], uninstalled = [];
        const installedExtensionsIds = local.reduce((result, i) => { result.add(i.identifier.id.toLowerCase()); return result; }, new Set());
        recommendationsToSuggest.forEach(id => {
            if (installedExtensionsIds.has(id.toLowerCase())) {
                installed.push(id);
            }
            else {
                uninstalled.push(id);
            }
        });
        return { installed, uninstalled };
    }
    async getValidExecutableBasedExtensionTips(executableTips) {
        const result = [];
        const checkedExecutables = new Map();
        for (const exeName of executableTips.keys()) {
            const extensionTip = executableTips.get(exeName);
            if (!extensionTip || !isNonEmptyArray(extensionTip.recommendations)) {
                continue;
            }
            const exePaths = [];
            if (isWindows) {
                if (extensionTip.windowsPath) {
                    exePaths.push(extensionTip.windowsPath.replace('%USERPROFILE%', () => env['USERPROFILE'])
                        .replace('%ProgramFiles(x86)%', () => env['ProgramFiles(x86)'])
                        .replace('%ProgramFiles%', () => env['ProgramFiles'])
                        .replace('%APPDATA%', () => env['APPDATA'])
                        .replace('%WINDIR%', () => env['WINDIR']));
                }
            }
            else {
                exePaths.push(join('/usr/local/bin', exeName));
                exePaths.push(join('/usr/bin', exeName));
                exePaths.push(join(this.userHome.fsPath, exeName));
            }
            for (const exePath of exePaths) {
                let exists = checkedExecutables.get(exePath);
                if (exists === undefined) {
                    exists = await this.fileService.exists(URI.file(exePath));
                    checkedExecutables.set(exePath, exists);
                }
                if (exists) {
                    for (const { extensionId, extensionName, isExtensionPack, whenNotInstalled } of extensionTip.recommendations) {
                        result.push({
                            extensionId,
                            extensionName,
                            isExtensionPack,
                            exeName,
                            exeFriendlyName: extensionTip.exeFriendlyName,
                            windowsPath: extensionTip.windowsPath,
                            whenNotInstalled: whenNotInstalled
                        });
                    }
                }
            }
        }
        return result;
    }
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uVGlwc1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25UaXBzU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRWxGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFbEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUVsRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3BELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFNakUscUNBQXFDO0FBRTlCLElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQXFCLFNBQVEsVUFBVTtJQU1uRCxZQUNlLFdBQTRDLEVBQ3pDLGNBQWdEO1FBRWpFLEtBQUssRUFBRSxDQUFDO1FBSHlCLGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ3hCLG1C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