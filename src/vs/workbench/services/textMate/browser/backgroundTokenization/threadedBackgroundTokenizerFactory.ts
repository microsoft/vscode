/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { canASAR } from '../../../../../amdX.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { AppResourcePath, FileAccess, nodeModulesAsarPath, nodeModulesPath } from '../../../../../base/common/network.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { IBackgroundTokenizationStore, IBackgroundTokenizer } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IExtensionResourceLoaderService } from '../../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ICreateData, StateDeltas, TextMateTokenizationWorker } from './worker/textMateTokenizationWorker.worker.js';
import { TextMateWorkerHost } from './worker/textMateWorkerHost.js';
import { TextMateWorkerTokenizerController } from './textMateWorkerTokenizerController.js';
import { IValidGrammarDefinition } from '../../common/TMScopeRegistry.js';
import type { IRawTheme } from 'vscode-textmate';
import { createWebWorker } from '../../../../../base/browser/webWorkerFactory.js';
import { IWebWorkerClient, Proxied } from '../../../../../base/common/worker/webWorker.js';

export class ThreadedBackgroundTokenizerFactory implements IDisposable {
	private static _reportedMismatchingTokens = false;

	private _workerProxyPromise: Promise<Proxied<TextMateTokenizationWorker> | null> | null = null;
	private _worker: IWebWorkerClient<TextMateTokenizationWorker> | null = null;
	private _workerProxy: Proxied<TextMateTokenizationWorker> | null = null;
	private readonly _workerTokenizerControllers = new Map</* backgroundTokenizerId */number, TextMateWorkerTokenizerController>();

	private _currentTheme: IRawTheme | null = null;
	private _currentTokenColorMap: string[] | null = null;
	private _grammarDefinitions: IValidGrammarDefinition[] = [];

	constructor(
		private readonly _reportTokenizationTime: (timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number, isRandomSample: boolean) => void,
		private readonly _shouldTokenizeAsync: () => boolean,
		@IExtensionResourceLoaderService private readonly _extensionResourceLoaderService: IExtensionResourceLoaderService,
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

			const controllerContainer = { controller: undefined as undefined | TextMateWorkerTokenizerController, worker: this._worker };
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
				const container = await controllerContainer;

				// If there is no controller, the model has been detached in the meantime.
				// Only request the proxy object if the worker is the same!
				if (container?.controller && container.worker === this._worker) {
					container.controller.requestTokens(startLineNumber, endLineNumberExclusive);
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
			this._workerProxy.$acceptTheme(this._currentTheme, this._currentTokenColorMap);
		}
	}

	private _getWorkerProxy(): Promise<Proxied<TextMateTokenizationWorker> | null> {
		if (!this._workerProxyPromise) {
			this._workerProxyPromise = this._createWorkerProxy();
		}
		return this._workerProxyPromise;
	}

	private async _createWorkerProxy(): Promise<Proxied<TextMateTokenizationWorker> | null> {
		const onigurumaModuleLocation: AppResourcePath = `${nodeModulesPath}/vscode-oniguruma`;
		const onigurumaModuleLocationAsar: AppResourcePath = `${nodeModulesAsarPath}/vscode-oniguruma`;

		const useAsar = canASAR && this._environmentService.isBuilt && !isWeb;
		const onigurumaLocation: AppResourcePath = useAsar ? onigurumaModuleLocationAsar : onigurumaModuleLocation;
		const onigurumaWASM: AppResourcePath = `${onigurumaLocation}/release/onig.wasm`;

		const createData: ICreateData = {
			grammarDefinitions: this._grammarDefinitions,
			onigurumaWASMUri: FileAccess.asBrowserUri(onigurumaWASM).toString(true),
		};
		const worker = this._worker = createWebWorker<TextMateTokenizationWorker>(
			FileAccess.asBrowserUri('vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.workerMain.js'),
			'TextMateWorker'
		);
		TextMateWorkerHost.setChannel(worker, {
			$readFile: async (_resource: UriComponents): Promise<string> => {
				const resource = URI.revive(_resource);
				return this._extensionResourceLoaderService.readExtensionResource(resource);
			},
			$setTokensAndStates: async (controllerId: number, versionId: number, tokens: Uint8Array, lineEndStateDeltas: StateDeltas[]): Promise<void> => {
				const controller = this._workerTokenizerControllers.get(controllerId);
				// When a model detaches, it is removed synchronously from the map.
				// However, the worker might still be sending tokens for that model,
				// so we ignore the event when there is no controller.
				if (controller) {
					controller.setTokensAndStates(controllerId, versionId, tokens, lineEndStateDeltas);
				}
			},
			$reportTokenizationTime: (timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number, isRandomSample: boolean): void => {
				this._reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, isRandomSample);
			}
		});
		await worker.proxy.$init(createData);

		if (this._worker !== worker) {
			// disposed in the meantime
			return null;
		}
		this._workerProxy = worker.proxy;
		if (this._currentTheme && this._currentTokenColorMap) {
			this._workerProxy.$acceptTheme(this._currentTheme, this._currentTokenColorMap);
		}
		return worker.proxy;
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
