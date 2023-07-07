/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';
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
import { ICreateData, TextMateTokenizationWorker } from 'vs/workbench/services/textMate/browser/worker/textMate.worker';
import { TextMateWorkerTokenizerController } from 'vs/workbench/services/textMate/browser/workerHost/textMateWorkerTokenizerController';
import { IValidGrammarDefinition } from 'vs/workbench/services/textMate/common/TMScopeRegistry';
import type { IRawTheme, StackDiff } from 'vscode-textmate';

export class TextMateWorkerHost implements IDisposable {
	private static _reportedMismatchingTokens = false;

	private _workerProxyPromise: Promise<TextMateTokenizationWorker | null> | null = null;
	private _worker: MonacoWebWorker<TextMateTokenizationWorker> | null = null;
	private _workerProxy: TextMateTokenizationWorker | null = null;
	private readonly _workerTokenizerControllers = new Map</* uri.toString() */ string, TextMateWorkerTokenizerController>();

	private _currentTheme: IRawTheme | null = null;
	private _currentTokenColorMap: string[] | null = null;
	private _grammarDefinitions: IValidGrammarDefinition[] = [];

	constructor(
		private readonly _reportTokenizationTime: (timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number) => void,
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

	public setGrammarDefinitions(grammarDefinitions: IValidGrammarDefinition[]): void {
		this._grammarDefinitions = grammarDefinitions;
		this._killWorker();
	}

	dispose(): void {
		this._killWorker();
	}

	public acceptTheme(theme: IRawTheme, colorMap: string[]): void {
		this._currentTheme = theme;
		this._currentTokenColorMap = colorMap;
		if (this._currentTheme && this._currentTokenColorMap && this._workerProxy) {
			this._workerProxy.acceptTheme(this._currentTheme, this._currentTokenColorMap);
		}
	}

	private getWorkerProxy(): Promise<TextMateTokenizationWorker | null> {
		if (!this._workerProxyPromise) {
			this._workerProxyPromise = this.createWorkerProxy();
		}
		return this._workerProxyPromise;
	}

	private async createWorkerProxy(): Promise<TextMateTokenizationWorker | null> {
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
		const worker = createWebWorker<TextMateTokenizationWorker>(this._modelService, this._languageConfigurationService, {
			createData,
			label: 'textMateWorker',
			moduleId: 'vs/workbench/services/textMate/browser/worker/textMate.worker',
			host: this,
		});

		this._worker = worker;
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

	private _killWorker(): void {
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

	// Will be recreated when worker is killed (because tokenizer is re-registered when languages change)
	public createBackgroundTokenizer(textModel: ITextModel, tokenStore: IBackgroundTokenizationStore, maxTokenizationLineLength: IObservable<number>): IBackgroundTokenizer | undefined {
		if (this._workerTokenizerControllers.has(textModel.uri.toString())) {
			throw new BugIndicatingError();
		}

		const shouldTokenizeAsync = this._configurationService.getValue<boolean>('editor.experimental.asyncTokenization');
		if (shouldTokenizeAsync !== true) {
			return undefined;
		}

		if (textModel.isTooLargeForSyncing()) {
			// fallback to default sync background tokenizer
			return undefined;
		}

		const store = new DisposableStore();
		this.getWorkerProxy().then((workerProxy) => {
			if (store.isDisposed || !workerProxy) {
				return;
			}

			store.add(keepAliveWhenAttached(textModel, () => {
				const controller = new TextMateWorkerTokenizerController(textModel, workerProxy, this._languageService.languageIdCodec, tokenStore, this._configurationService, maxTokenizationLineLength);
				this._workerTokenizerControllers.set(textModel.uri.toString(), controller);

				return toDisposable(() => {
					this._workerTokenizerControllers.delete(textModel.uri.toString());
					controller.dispose();
				});
			}));
		});

		return {
			dispose() {
				store.dispose();
			},
			requestTokens: (startLineNumber, endLineNumberExclusive) => {
				this.getWorkerProxy().then((workerProxy) => {
					workerProxy?.retokenize(textModel.uri.toString(), startLineNumber, endLineNumberExclusive);
				});
			},
			reportMismatchingTokens: (lineNumber) => {
				if (TextMateWorkerHost._reportedMismatchingTokens) {
					return;
				}
				TextMateWorkerHost._reportedMismatchingTokens = true;

				this._notificationService.error({
					message: 'Async Tokenization Token Mismatch in line ' + lineNumber,
					name: 'Async Tokenization Token Mismatch',
				});

				this._telemetryService.publicLog2<{}, { owner: 'hediet'; comment: 'Used to see if async tokenization is bug-free' }>('asyncTokenizationMismatchingTokens', {});
			},
		};
	}

	// #region called by the worker

	async readFile(_resource: UriComponents): Promise<string> {
		const resource = URI.revive(_resource);
		return this._extensionResourceLoaderService.readExtensionResource(resource);
	}

	async setTokensAndStates(_resource: UriComponents, versionId: number, tokens: Uint8Array, lineEndStateDeltas: StateDeltas[]): Promise<void> {
		const resource = URI.revive(_resource);
		const controller = this._workerTokenizerControllers.get(resource.toString());
		if (controller) {
			// When a model detaches, it is removed synchronously from the map.
			// However, the worker might still be sending tokens for that model.
			controller.setTokensAndStates(versionId, tokens, lineEndStateDeltas);
		}
	}

	public reportTokenizationTime(timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number): void {
		this._reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength);
	}

	// #endregion
}

export interface StateDeltas {
	startLineNumber: number;
	// null means the state for that line did not change
	stateDeltas: (StackDiff | null)[];
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
