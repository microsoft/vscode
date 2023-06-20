/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ExtensionRecommendations, ExtensionRecommendation } from 'vs/workbench/contrib/extensions/browser/extensionRecommendations';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { EnablementState, IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionRecommendationReason, IExtensionIgnoredRecommendationsService } from 'vs/workbench/services/extensionRecommendations/common/extensionRecommendations';
import { IExtensionsViewPaneContainer, IExtensionsWorkbenchService, IExtension, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';
import { StorageScope, IStorageService, StorageTarget } from 'vs/platform/storage/common/storage';
import { IProductService } from 'vs/platform/product/common/productService';
import { IFileContentCondition, IFilePathCondition, IFileLanguageCondition, IFileOpenCondition } from 'vs/base/common/product';
import { IStringDictionary } from 'vs/base/common/collections';
import { ITextModel } from 'vs/editor/common/model';
import { Schemas } from 'vs/base/common/network';
import { basename, extname } from 'vs/base/common/resources';
import { match } from 'vs/base/common/glob';
import { URI } from 'vs/base/common/uri';
import { Mimes } from 'vs/base/common/mime';
import { getMimeTypes } from 'vs/editor/common/services/languagesAssociations';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IExtensionRecommendationNotificationService, RecommendationsNotificationResult, RecommendationSource } from 'vs/platform/extensionRecommendations/common/extensionRecommendations';
import { distinct } from 'vs/base/common/arrays';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { disposableTimeout } from 'vs/base/common/async';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { isEmptyObject } from 'vs/base/common/types';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';

type FileExtensionSuggestionClassification = {
	owner: 'sandy081';
	comment: 'Response information when a file based reccommendation is suggested';
	userReaction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'User reaction after showing the recommendation prompt. Eg., install, cancel, show, neverShowAgain' };
	fileExtension: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Extension of the file for which an extension is being recommended.' };
};

const promptedRecommendationsStorageKey = 'fileBasedRecommendations/promptedRecommendations';
const promptedFileExtensionsStorageKey = 'fileBasedRecommendations/promptedFileExtensions';
const recommendationsStorageKey = 'extensionsAssistant/recommendations';
const searchMarketplace = localize('searchMarketplace', "Search Marketplace");
const milliSecondsInADay = 1000 * 60 * 60 * 24;

export class FileBasedRecommendations extends ExtensionRecommendations {

	private readonly fileOpenRecommendations: IStringDictionary<IFileOpenCondition[]>;
	private readonly recommendationsByPattern = new Map<string, IStringDictionary<IFileOpenCondition[]>>();
	private readonly fileBasedRecommendations = new Map<string, { recommendedTime: number }>();
	private readonly fileBasedImportantRecommendations = new Set<string>();

	get recommendations(): ReadonlyArray<ExtensionRecommendation> {
		const recommendations: ExtensionRecommendation[] = [];
		[...this.fileBasedRecommendations.keys()]
			.sort((a, b) => {
				if (this.fileBasedRecommendations.get(a)!.recommendedTime === this.fileBasedRecommendations.get(b)!.recommendedTime) {
					if (this.fileBasedImportantRecommendations.has(a)) {
						return -1;
					}
					if (this.fileBasedImportantRecommendations.has(b)) {
						return 1;
					}
				}
				return this.fileBasedRecommendations.get(a)!.recommendedTime > this.fileBasedRecommendations.get(b)!.recommendedTime ? -1 : 1;
			})
			.forEach(extensionId => {
				recommendations.push({
					extensionId,
					reason: {
						reasonId: ExtensionRecommendationReason.File,
						reasonText: localize('fileBasedRecommendation', "This extension is recommended based on the files you recently opened.")
					}
				});
			});
		return recommendations;
	}

	get importantRecommendations(): ReadonlyArray<ExtensionRecommendation> {
		return this.recommendations.filter(e => this.fileBasedImportantRecommendations.has(e.extensionId));
	}

	get otherRecommendations(): ReadonlyArray<ExtensionRecommendation> {
		return this.recommendations.filter(e => !this.fileBasedImportantRecommendations.has(e.extensionId));
	}

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IProductService productService: IProductService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionRecommendationNotificationService private readonly extensionRecommendationNotificationService: IExtensionRecommendationNotificationService,
		@IExtensionIgnoredRecommendationsService private readonly extensionIgnoredRecommendationsService: IExtensionIgnoredRecommendationsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
	) {
		super();
		this.fileOpenRecommendations = {};
		if (productService.extensionRecommendations) {
			for (const [extensionId, recommendation] of Object.entries(productService.extensionRecommendations)) {
				if (recommendation.onFileOpen) {
					this.fileOpenRecommendations[extensionId.toLowerCase()] = recommendation.onFileOpen;
				}
			}
		}
	}

	protected async doActivate(): Promise<void> {
		if (isEmptyObject(this.fileOpenRecommendations)) {
			return;
		}

		await this.extensionsWorkbenchService.whenInitialized;

		const cachedRecommendations = this.getCachedRecommendations();
		const now = Date.now();
		// Retire existing recommendations if they are older than a week or are not part of this.productService.extensionTips anymore
		Object.entries(cachedRecommendations).forEach(([key, value]) => {
			const diff = (now - value) / milliSecondsInADay;
			if (diff <= 7 && this.fileOpenRecommendations[key]) {
				this.fileBasedRecommendations.set(key.toLowerCase(), { recommendedTime: value });
			}
		});

		this._register(this.modelService.onModelAdded(model => this.onModelAdded(model)));
		this.modelService.getModels().forEach(model => this.onModelAdded(model));
	}

	private onModelAdded(model: ITextModel): void {
		const uri = model.uri.scheme === Schemas.vscodeNotebookCell ? CellUri.parse(model.uri)?.notebook : model.uri;
		if (!uri) {
			return;
		}

		const supportedSchemes = distinct([Schemas.untitled, Schemas.file, Schemas.vscodeRemote, ...this.workspaceContextService.getWorkspace().folders.map(folder => folder.uri.scheme)]);
		if (!uri || !supportedSchemes.includes(uri.scheme)) {
			return;
		}

		// re-schedule this bit of the operation to be off the critical path - in case glob-match is slow
		this._register(disposableTimeout(() => this.promptRecommendations(uri, model), 0));
	}

	private promptRecommendations(uri: URI, model: ITextModel): void {
		if (this.promptImportantRecommendations(uri, model)) {
			return;
		}

		this.promptRecommendedExtensionForFileExtension(uri, extname(uri).toLowerCase());
	}

	/**
	 * Prompt the user to either install the recommended extension for the file type in the current editor model
	 * or prompt to search the marketplace if it has extensions that can support the file type
	 */
	private promptImportantRecommendations(uri: URI, model: ITextModel, extensionRecommendations?: IStringDictionary<IFileOpenCondition[]>): boolean {
		const pattern = extname(uri).toLowerCase();
		extensionRecommendations = extensionRecommendations ?? this.recommendationsByPattern.get(pattern) ?? this.fileOpenRecommendations;
		const extensionRecommendationEntries = Object.entries(extensionRecommendations);
		if (extensionRecommendationEntries.length === 0) {
			return false;
		}

		const processedPathGlobs = new Map<string, boolean>();
		const installed = this.extensionsWorkbenchService.local;
		const recommendationsByPattern: IStringDictionary<IFileOpenCondition[]> = {};
		const matchedRecommendations: IStringDictionary<IFileOpenCondition[]> = {};
		const unmatchedRecommendations: IStringDictionary<IFileOpenCondition[]> = {};
		let listenOnLanguageChange = false;

		for (const [extensionId, conditions] of extensionRecommendationEntries) {
			const conditionsByPattern: IFileOpenCondition[] = [];
			const matchedConditions: IFileOpenCondition[] = [];
			const unmatchedConditions: IFileOpenCondition[] = [];
			for (const condition of conditions) {
				let languageMatched = false;
				let pathGlobMatched = false;

				const isLanguageCondition = !!(<IFileLanguageCondition>condition).languages;
				const isFileContentCondition = !!(<IFileContentCondition>condition).contentPattern;
				if (isLanguageCondition || isFileContentCondition) {
					conditionsByPattern.push(condition);
				}

				if (isLanguageCondition) {
					if ((<IFileLanguageCondition>condition).languages.includes(model.getLanguageId())) {
						languageMatched = true;
					}
				}

				if ((<IFilePathCondition>condition).pathGlob) {
					const pathGlob = (<IFilePathCondition>condition).pathGlob;
					if (processedPathGlobs.get(pathGlob) ?? match((<IFilePathCondition>condition).pathGlob, uri.with({ fragment: '' }).toString())) {
						pathGlobMatched = true;
					}
					processedPathGlobs.set(pathGlob, pathGlobMatched);
				}

				if (!languageMatched && !pathGlobMatched) {
					// If the language is not matched and the path glob is not matched, then we don't need to check the other conditions
					continue;
				}

				let matched = true;
				if (matched && condition.whenInstalled) {
					if (!condition.whenInstalled.every(id => installed.some(local => areSameExtensions({ id }, local.identifier)))) {
						matched = false;
					}
				}

				if (matched && condition.whenNotInstalled) {
					if (installed.some(local => condition.whenNotInstalled?.some(id => areSameExtensions({ id }, local.identifier)))) {
						matched = false;
					}
				}

				if (matched && isFileContentCondition) {
					if (!model.findMatches((<IFileContentCondition>condition).contentPattern, false, true, false, null, false).length) {
						matched = false;
					}
				}

				if (matched) {
					matchedConditions.push(condition);
					conditionsByPattern.pop();
				} else {
					if (isLanguageCondition || isFileContentCondition) {
						unmatchedConditions.push(condition);
						if (isLanguageCondition) {
							listenOnLanguageChange = true;
						}
					}
				}

			}
			if (matchedConditions.length) {
				matchedRecommendations[extensionId] = matchedConditions;
			}
			if (unmatchedConditions.length) {
				unmatchedRecommendations[extensionId] = unmatchedConditions;
			}
			if (conditionsByPattern.length) {
				recommendationsByPattern[extensionId] = conditionsByPattern;
			}
		}

		this.recommendationsByPattern.set(pattern, recommendationsByPattern);
		if (Object.keys(unmatchedRecommendations).length) {
			if (listenOnLanguageChange) {
				const disposables = new DisposableStore();
				disposables.add(model.onDidChangeLanguage(() => {
					// re-schedule this bit of the operation to be off the critical path - in case glob-match is slow
					disposables.add(disposableTimeout(() => {
						if (!disposables.isDisposed) {
							this.promptImportantRecommendations(uri, model, unmatchedRecommendations);
							disposables.dispose();
						}
					}, 0));
				}));
				disposables.add(model.onWillDispose(() => disposables.dispose()));
			}
		}

		if (Object.keys(matchedRecommendations).length) {
			this.promptFromRecommendations(uri, model, matchedRecommendations);
			return true;
		}

		return false;
	}

	private promptFromRecommendations(uri: URI, model: ITextModel, extensionRecommendations: IStringDictionary<IFileOpenCondition[]>): void {
		let isImportantRecommendationForLanguage = false;
		const importantRecommendations = new Set<string>();
		const fileBasedRecommendations = new Set<string>();
		for (const [extensionId, conditions] of Object.entries(extensionRecommendations)) {
			for (const condition of conditions) {
				fileBasedRecommendations.add(extensionId);
				if (condition.important) {
					importantRecommendations.add(extensionId);
					this.fileBasedImportantRecommendations.add(extensionId);
				}
				if ((<IFileLanguageCondition>condition).languages) {
					isImportantRecommendationForLanguage = true;
				}
			}
		}

		// Update file based recommendations
		for (const recommendation of fileBasedRecommendations) {
			const filedBasedRecommendation = this.fileBasedRecommendations.get(recommendation) || { recommendedTime: Date.now(), sources: [] };
			filedBasedRecommendation.recommendedTime = Date.now();
			this.fileBasedRecommendations.set(recommendation, filedBasedRecommendation);
		}

		this.storeCachedRecommendations();

		if (this.extensionRecommendationNotificationService.hasToIgnoreRecommendationNotifications()) {
			return;
		}

		const language = model.getLanguageId();
		const languageName = this.languageService.getLanguageName(language);
		if (importantRecommendations.size &&
			this.promptRecommendedExtensionForFileType(languageName && isImportantRecommendationForLanguage && language !== PLAINTEXT_LANGUAGE_ID ? localize('languageName', "{0} language", languageName) : basename(uri), language, [...importantRecommendations])) {
			return;
		}
	}

	private promptRecommendedExtensionForFileType(name: string, language: string, recommendations: string[]): boolean {
		recommendations = this.filterIgnoredOrNotAllowed(recommendations);
		if (recommendations.length === 0) {
			return false;
		}

		recommendations = this.filterInstalled(recommendations, this.extensionsWorkbenchService.local)
			.filter(extensionId => this.fileBasedImportantRecommendations.has(extensionId));

		const promptedRecommendations = language !== PLAINTEXT_LANGUAGE_ID ? this.getPromptedRecommendations()[language] : undefined;
		if (promptedRecommendations) {
			recommendations = recommendations.filter(extensionId => promptedRecommendations.includes(extensionId));
		}

		if (recommendations.length === 0) {
			return false;
		}

		this.promptImportantExtensionsInstallNotification(recommendations, name, language);
		return true;
	}

	private async promptImportantExtensionsInstallNotification(extensions: string[], name: string, language: string): Promise<void> {
		try {
			const result = await this.extensionRecommendationNotificationService.promptImportantExtensionsInstallNotification({ extensions, name, source: RecommendationSource.FILE });
			if (result === RecommendationsNotificationResult.Accepted) {
				this.addToPromptedRecommendations(language, extensions);
			}
		} catch (error) { /* Ignore */ }
	}

	private getPromptedRecommendations(): IStringDictionary<string[]> {
		return JSON.parse(this.storageService.get(promptedRecommendationsStorageKey, StorageScope.PROFILE, '{}'));
	}

	private addToPromptedRecommendations(language: string, extensions: string[]) {
		const promptedRecommendations = this.getPromptedRecommendations();
		promptedRecommendations[language] = distinct([...(promptedRecommendations[language] ?? []), ...extensions]);
		this.storageService.store(promptedRecommendationsStorageKey, JSON.stringify(promptedRecommendations), StorageScope.PROFILE, StorageTarget.USER);
	}

	private getPromptedFileExtensions(): string[] {
		return JSON.parse(this.storageService.get(promptedFileExtensionsStorageKey, StorageScope.PROFILE, '[]'));
	}

	private addToPromptedFileExtensions(fileExtension: string) {
		const promptedFileExtensions = this.getPromptedFileExtensions();
		promptedFileExtensions.push(fileExtension);
		this.storageService.store(promptedFileExtensionsStorageKey, JSON.stringify(distinct(promptedFileExtensions)), StorageScope.PROFILE, StorageTarget.USER);
	}

	private async promptRecommendedExtensionForFileExtension(uri: URI, fileExtension: string): Promise<void> {

		if (this.extensionRecommendationNotificationService.hasToIgnoreRecommendationNotifications()) {
			return;
		}

		// Do not prompt when there is no local and remote extension management servers
		if (!this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer) {
			return;
		}

		fileExtension = fileExtension.substring(1); // Strip the dot
		if (!fileExtension) {
			return;
		}

		const mimeTypes = getMimeTypes(uri);
		if (mimeTypes.length !== 1 || mimeTypes[0] !== Mimes.unknown) {
			return;
		}

		const fileExtensionSuggestionIgnoreList = <string[]>JSON.parse(this.storageService.get('extensionsAssistant/fileExtensionsSuggestionIgnore', StorageScope.PROFILE, '[]'));
		if (fileExtensionSuggestionIgnoreList.indexOf(fileExtension) > -1) {
			return;
		}

		const promptedFileExtensions = this.getPromptedFileExtensions();
		if (promptedFileExtensions.includes(fileExtension)) {
			return;
		}

		const text = `ext:${fileExtension}`;
		const pager = await this.extensionsWorkbenchService.queryGallery({ text, pageSize: 100 }, CancellationToken.None).then(r => r, () => null);
		if (!pager?.firstPage.length) {
			return;
		}

		const installedExtensionsIds = this.extensionsWorkbenchService.local.reduce((result, i) => { result.add(i.identifier.id.toLowerCase()); return result; }, new Set<string>());
		if (pager.firstPage.some(e => installedExtensionsIds.has(e.identifier.id.toLowerCase()))) {
			return;
		}

		this.notificationService.prompt(
			Severity.Info,
			localize('showLanguageExtensions', "The Marketplace has extensions that can help with '.{0}' files", fileExtension),
			[{
				label: searchMarketplace,
				run: () => {
					this.addToPromptedFileExtensions(fileExtension);
					this.telemetryService.publicLog2<{ userReaction: string; fileExtension: string }, FileExtensionSuggestionClassification>('fileExtensionSuggestion:popup', { userReaction: 'ok', fileExtension });
					this.paneCompositeService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar, true)
						.then(viewlet => viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer)
						.then(viewlet => {
							viewlet.search(`ext:${fileExtension}`);
							viewlet.focus();
						});
				}
			}, {
				label: localize('dontShowAgainExtension', "Don't Show Again for '.{0}' files", fileExtension),
				run: () => {
					fileExtensionSuggestionIgnoreList.push(fileExtension);
					this.storageService.store(
						'extensionsAssistant/fileExtensionsSuggestionIgnore',
						JSON.stringify(fileExtensionSuggestionIgnoreList),
						StorageScope.PROFILE,
						StorageTarget.USER);
					this.telemetryService.publicLog2<{ userReaction: string; fileExtension: string }, FileExtensionSuggestionClassification>('fileExtensionSuggestion:popup', { userReaction: 'neverShowAgain', fileExtension });
				}
			}],
			{
				sticky: true,
				onCancel: () => {
					this.telemetryService.publicLog2<{ userReaction: string; fileExtension: string }, FileExtensionSuggestionClassification>('fileExtensionSuggestion:popup', { userReaction: 'cancelled', fileExtension });
				}
			}
		);
	}

	private filterIgnoredOrNotAllowed(recommendationsToSuggest: string[]): string[] {
		const ignoredRecommendations = [...this.extensionIgnoredRecommendationsService.ignoredRecommendations, ...this.extensionRecommendationNotificationService.ignoredRecommendations];
		return recommendationsToSuggest.filter(id => !ignoredRecommendations.includes(id));
	}

	private filterInstalled(recommendationsToSuggest: string[], installed: IExtension[]): string[] {
		const installedExtensionsIds = installed.reduce((result, i) => {
			if (i.enablementState !== EnablementState.DisabledByExtensionKind) {
				result.add(i.identifier.id.toLowerCase());
			}
			return result;
		}, new Set<string>());
		return recommendationsToSuggest.filter(id => !installedExtensionsIds.has(id.toLowerCase()));
	}

	private getCachedRecommendations(): IStringDictionary<number> {
		let storedRecommendations = JSON.parse(this.storageService.get(recommendationsStorageKey, StorageScope.PROFILE, '[]'));
		if (Array.isArray(storedRecommendations)) {
			storedRecommendations = storedRecommendations.reduce((result, id) => { result[id] = Date.now(); return result; }, <IStringDictionary<number>>{});
		}
		const result: IStringDictionary<number> = {};
		Object.entries(storedRecommendations).forEach(([key, value]) => {
			if (typeof value === 'number') {
				result[key.toLowerCase()] = value;
			}
		});
		return result;
	}

	private storeCachedRecommendations(): void {
		const storedRecommendations: IStringDictionary<number> = {};
		this.fileBasedRecommendations.forEach((value, key) => storedRecommendations[key] = value.recommendedTime);
		this.storageService.store(recommendationsStorageKey, JSON.stringify(storedRecommendations), StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}
