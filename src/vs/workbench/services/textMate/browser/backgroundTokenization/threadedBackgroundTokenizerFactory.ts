/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { AppResourcePath, FileAccess, nodeModulesAsarPath, nodeModulesPath } from 'vs/base/common/network';
import { IObservable } from 'vs/base/common/observable';
import { isWeb } from 'vs/base/common/platform';
import { URI, UriComponents } from 'vs/base/common/uri';
import { MonacoWebWorker, createWebWorker } from 'vs/editor/browser/services/webWorker';
import { IBackgroundTokenizationStore, IBackgroundTokenizer } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionResourceLoaderService } from 'vs/platform/extensionResourceLoader/common/extensionResourceLoader';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ICreateData, ITextMateWorkerHost, StateDeltas, TextMateTokenizationWorker } from 'vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.worker';
import { TextMateWorkerTokenizerController } from 'vs/workbench/services/textMate/browser/backgroundTokenization/textMateWorkerTokenizerController';
import { IValidGrammarDefinition } from 'vs/workbench/services/textMate/common/TMScopeRegistry';
import type { IRawTheme } from 'vscode-textmate';

export class ThreadedBackgroundTokenizerFactory implements IDisposable {
	private static _reportedMismatchingTokens = false;

	private _workerProxyPromise: Promise<TextMateTokenizationWorker | null> | null = null;
	private _worker: MonacoWebWorker<TextMateTokenizationWorker> | null = null;
	private _workerProxy: TextMateTokenizationWorker | null = null;
	private readonly _workerTokenizerControllers = new Map</* backgroundTokenizerId */number, TextMateWorkerTokenizerController>();

	private _currentTheme: IRawTheme | null = null;
	private _currentTokenColorMap: string[] | null = null;
	private _grammarDefinitions: IValidGrammarDefinition[] = [];

	constructor(
		private readonly _reportTokenizationTime: (timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number, isRandomSample: boolean) => void,
		private readonly _shouldTokenizeAsync: () => boolean,
		@IExtensionResourceLoaderService private readonly _extensionResourceLoaderService: IExtensionResourceLoaderService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
	}

	public dispose(): void {
		this._disposeWorker();
	}

	// Will be recreated after worker is disposed (because tokenizer is re-registered when languages change)
	public createBackgroundTokenizer(textModel: ITextModel, tokenStore: IBackgroundTokenizationStore, maxTokenizationLineLength: IObservable<number>): IBackgroundTokenizer | undefined {
		// fallback to default sync background tokenizer
		if (!this._shouldTokenizeAsync() || textModel.isTooLargeForSyncing()) { return undefined; }

		const store = new DisposableStore();
		const controllerContainer = this._getWorkerProxy().then((workerProxy) => {
			if (store.isDisposed || !workerProxy) { return undefined; }

			const controllerContainer = { controller: undefined as undefined | TextMateWorkerTokenizerController };
			store.add(keepAliveWhenAttached(textModel, () => {
				const controller = new TextMateWorkerTokenizerController(textModel, workerProxy, this._languageService.languageIdCodec, tokenStore, this._configurationService, maxTokenizationLineLength);
				controllerContainer.controller = controller;
				this._workerTokenizerControllers.set(controller.controllerId, controller);
				return toDisposable(() => {
					controllerContainer.controller = undefined;
					this._workerTokenizerControllers.delete(controller.controllerId);
					controller.dispose();
				});
			}));
			return controllerContainer;
		});

		return {
			dispose() {
				store.dispose();
			},
			requestTokens: async (startLineNumber, endLineNumberExclusive) => {
				const controller = (await controllerContainer)?.controller;
				if (controller) {
					// If there is no controller, the model has been detached in the meantime
					controller.requestTokens(startLineNumber, endLineNumberExclusive);
				}
			},
			reportMismatchingTokens: (lineNumber) => {
				if (ThreadedBackgroundTokenizerFactory._reportedMismatchingTokens) {
					return;
				}
				ThreadedBackgroundTokenizerFactory._reportedMismatchingTokens = true;

				this._notificationService.error({
					message: 'Async Tokenization Token Mismatch in line ' + lineNumber,
					name: 'Async Tokenization Token Mismatch',
				});

				this._telemetryService.publicLog2<{}, { owner: 'hediet'; comment: 'Used to see if async tokenization is bug-free' }>('asyncTokenizationMismatchingTokens', {});
			},
		};
	}

	public setGrammarDefinitions(grammarDefinitions: IValidGrammarDefinition[]): void {
		this._grammarDefinitions = grammarDefinitions;
		this._disposeWorker();
	}

	public acceptTheme(theme: IRawTheme, colorMap: string[]): void {
		this._currentTheme = theme;
		this._currentTokenColorMap = colorMap;
		if (this._currentTheme && this._currentTokenColorMap && this._workerProxy) {
			this._workerProxy.acceptTheme(this._currentTheme, this._currentTokenColorMap);
		}
	}

	private _getWorkerProxy(): Promise<TextMateTokenizationWorker | null> {
		if (!this._workerProxyPromise) {
			this._workerProxyPromise = this._createWorkerProxy();
		}
		return this._workerProxyPromise;
	}

	private async _createWorkerProxy(): Promise<TextMateTokenizationWorker | null> {
		const textmateModuleLocation: AppResourcePath = `${nodeModulesPath}/vscode-textmate`;
		const textmateModuleLocationAsar: AppResourcePath = `${nodeModulesAsarPath}/vscode-textmate`;
		const onigurumaModuleLocation: AppResourcePath = `${nodeModulesPath}/vscode-oniguruma`;
		const onigurumaModuleLocationAsar: AppResourcePath = `${nodeModulesAsarPath}/vscode-oniguruma`;

		const useAsar = this._environmentService.isBuilt && !isWeb;
		const textmateLocation: AppResourcePath = useAsar ? textmateModuleLocationAsar : textmateModuleLocation;
		const onigurumaLocation: AppResourcePath = useAsar ? onigurumaModuleLocationAsar : onigurumaModuleLocation;
		const textmateMain: AppResourcePath = `${textmateLocation}/release/main.js`;
		const onigurumaMain: AppResourcePath = `${onigurumaLocation}/release/main.js`;
		const onigurumaWASM: AppResourcePath = `${onigurumaLocation}/release/onig.wasm`;
		const uri = FileAccess.asBrowserUri(textmateMain).toString(true);

		const createData: ICreateData = {
			grammarDefinitions: this._grammarDefinitions,
			textmateMainUri: uri,
			onigurumaMainUri: FileAccess.asBrowserUri(onigurumaMain).toString(true),
			onigurumaWASMUri: FileAccess.asBrowserUri(onigurumaWASM).toString(true),
		};
		const host: ITextMateWorkerHost = {
			readFile: async (_resource: UriComponents): Promise<string> => {
				const resource = URI.revive(_resource);
				return this._extensionResourceLoaderService.readExtensionResource(resource);
			},
			setTokensAndStates: async (controllerId: number, versionId: number, tokens: Uint8Array, lineEndStateDeltas: StateDeltas[]): Promise<void> => {
				const controller = this._workerTokenizerControllers.get(controllerId);
				// When a model detaches, it is removed synchronously from the map.
				// However, the worker might still be sending tokens for that model,
				// so we ignore the event when there is no controller.
				if (controller) {
					controller.setTokensAndStates(controllerId, versionId, tokens, lineEndStateDeltas);
				}
			},
			reportTokenizationTime: (timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number, isRandomSample: boolean): void => {
				this._reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, isRandomSample);
			}
		};
		const worker = this._worker = createWebWorker<TextMateTokenizationWorker>(this._modelService, this._languageConfigurationService, {
			createData,
			label: 'textMateWorker',
			moduleId: 'vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.worker',
			host,
		});
		const proxy = await worker.getProxy();

		if (this._worker !== worker) {
			// disposed in the meantime
			return null;
		}
		this._workerProxy = proxy;
		if (this._currentTheme && this._currentTokenColorMap) {
			this._workerProxy.acceptTheme(this._currentTheme, this._currentTokenColorMap);
		}
		return proxy;
	}

	private _disposeWorker(): void {
		for (const controller of this._workerTokenizerControllers.values()) {
			controller.dispose();
		}
		this._workerTokenizerControllers.clear();

		if (this._worker) {
			this._worker.dispose();
			this._worker = null;
		}
		this._workerProxy = null;
		this._workerProxyPromise = null;
	}
}

function keepAliveWhenAttached(textModel: ITextModel, factory: () => IDisposable): IDisposable {
	const disposableStore = new DisposableStore();
	const subStore = disposableStore.add(new DisposableStore());

	function checkAttached() {
		if (textModel.isAttachedToEditor()) {
			subStore.add(factory());
		} else {
			subStore.clear();
		}
	}

	checkAttached();
	disposableStore.add(textModel.onDidChangeAttached(() => {
		checkAttached();
	}));
	return disposableStore;
}
