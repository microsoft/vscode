/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { Copilot } from '../../../platform/inlineCompletions/common/api';
import { ILanguageContextProviderService, ProviderTarget } from '../../../platform/languageContextProvider/common/languageContextProviderService';
import { ContextKind, ILanguageContextService, KnownSources, TriggerKind, type ContextItem, type RequestContext } from '../../../platform/languageServer/common/languageContextService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Queue } from '../../../util/vs/base/common/async';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { InspectorDataProvider } from './inspector';
import { ThrottledDebouncer } from './throttledDebounce';
import { ContextItemSummary, ErrorLocation, ErrorPart, type OnCachePopulatedEvent, type OnContextComputedEvent, type OnContextComputedOnTimeoutEvent } from './types';
import { TS6LanguageContextService } from './tsc6/tsContextService';
import { TS7LanguageContextService } from './ts7/tsContextService';
import { currentTokenBudget, NullTSLanguageContextService, type TSLanguageContextService } from './tsContextService';
import { TypeScript } from './tsService';
import { TelemetrySender } from './telemetrySender';

export class LanguageContextServiceImpl implements ILanguageContextService, vscode.Disposable {

	readonly _serviceBrand: undefined;

	private readonly disposables: DisposableStore;
	private readonly serviceListeners: DisposableStore;

	private readonly _onCachePopulated: vscode.EventEmitter<OnCachePopulatedEvent>;
	private readonly _onContextComputed: vscode.EventEmitter<OnContextComputedEvent>;
	private readonly _onContextComputedOnTimeout: vscode.EventEmitter<OnContextComputedOnTimeoutEvent>;

	private tsLanguageContextService: TSLanguageContextService;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@ILogService private readonly logService: ILogService
	) {
		this.disposables = new DisposableStore();
		this.serviceListeners = this.disposables.add(new DisposableStore());
		this._onCachePopulated = this.disposables.add(new vscode.EventEmitter<OnCachePopulatedEvent>());
		this._onContextComputed = this.disposables.add(new vscode.EventEmitter<OnContextComputedEvent>());
		this._onContextComputedOnTimeout = this.disposables.add(new vscode.EventEmitter<OnContextComputedOnTimeoutEvent>());
		const runsTS7 = TypeScript.runsVersion7();
		const enableTS7 = TypeScript.isVersion7SupportEnabled(this.configurationService);
		this.tsLanguageContextService = runsTS7
			? enableTS7
				? new TS7LanguageContextService(this.telemetryService, this.configurationService, this.experimentationService, this.logService)
				: new NullTSLanguageContextService()
			: new TS6LanguageContextService(this.telemetryService, this.configurationService, this.experimentationService, this.logService);
		this.bindEvents();
		this.disposables.add(this.configurationService.onDidChangeConfiguration((e) => {
			if (TypeScript.affectsVersion(e) || e.affectsConfiguration(ConfigKey.TypeScript7LanguageContext.fullyQualifiedId)) {
				this.updateTSLanguageContextService();
			}
		}));
	}

	public dispose(): void {
		this.tsLanguageContextService.dispose();
		this.disposables.dispose();
	}

	public get onCachePopulated() {
		return this._onCachePopulated.event;
	}

	public get onContextComputed() {
		return this._onContextComputed.event;
	}

	public get onContextComputedOnTimeout() {
		return this._onContextComputedOnTimeout.event;
	}

	async isActivated(documentOrLanguageId: vscode.TextDocument | string): Promise<boolean> {
		return this.tsLanguageContextService.isActivated(documentOrLanguageId);
	}

	async populateCache(document: vscode.TextDocument, position: vscode.Position, context: RequestContext): Promise<void> {
		return this.tsLanguageContextService.populateCache(document, position, context);
	}

	public async *getContext(document: vscode.TextDocument, position: vscode.Position, context: RequestContext, token: vscode.CancellationToken): AsyncIterable<ContextItem> {
		yield* this.tsLanguageContextService.getContext(document, position, context, token);
	}

	public getContextOnTimeout(document: vscode.TextDocument, position: vscode.Position, context: RequestContext): readonly ContextItem[] | undefined {
		return this.tsLanguageContextService.getContextOnTimeout(document, position, context);
	}

	private updateTSLanguageContextService(): void {
		const runsTS7 = TypeScript.runsVersion7();
		const enableTS7 = TypeScript.isVersion7SupportEnabled(this.configurationService);
		const oldService: TSLanguageContextService = this.tsLanguageContextService;
		if (runsTS7) {
			if (oldService instanceof TS6LanguageContextService) {
				oldService.dispose();
				this.tsLanguageContextService = enableTS7
					? new TS7LanguageContextService(this.telemetryService, this.configurationService, this.experimentationService, this.logService)
					: new NullTSLanguageContextService();
			} else if (oldService instanceof TS7LanguageContextService && !enableTS7) {
				oldService.dispose();
				this.tsLanguageContextService = new NullTSLanguageContextService();
			} else if (oldService instanceof NullTSLanguageContextService && enableTS7) {
				oldService.dispose();
				this.tsLanguageContextService = new TS7LanguageContextService(this.telemetryService, this.configurationService, this.experimentationService, this.logService);
			}
		} else if (!runsTS7 && (oldService instanceof TS7LanguageContextService || oldService instanceof NullTSLanguageContextService)) {
			oldService.dispose();
			this.tsLanguageContextService = new TS6LanguageContextService(this.telemetryService, this.configurationService, this.experimentationService, this.logService);
		}
		if (oldService !== this.tsLanguageContextService) {
			this.bindEvents();
		}
	}

	private bindEvents(): void {
		this.serviceListeners.clear();
		this.serviceListeners.add(this.tsLanguageContextService.onCachePopulated(e => this._onCachePopulated.fire(e)));
		this.serviceListeners.add(this.tsLanguageContextService.onContextComputed(e => this._onContextComputed.fire(e)));
		this.serviceListeners.add(this.tsLanguageContextService.onContextComputedOnTimeout(e => this._onContextComputedOnTimeout.fire(e)));
	}

}

interface TokenBudgetProvider {
	getTokenBudget(document: vscode.TextDocument): number;
}

class CachePopulationTrigger implements vscode.Disposable {

	private readonly languageContextService: ILanguageContextService;
	private readonly tokenBudgetProvider: TokenBudgetProvider;
	private readonly disposables: DisposableStore;
	private readonly selectionChangeDebouncer: ThrottledDebouncer;

	private lastDocumentChange: { document: string; time: number } | undefined;

	constructor(languageContextService: ILanguageContextService, tokenBudgetProvider: TokenBudgetProvider) {
		this.languageContextService = languageContextService;
		this.tokenBudgetProvider = tokenBudgetProvider;
		this.disposables = new DisposableStore();
		this.lastDocumentChange = undefined;

		this.selectionChangeDebouncer = this.disposables.add(new ThrottledDebouncer());
		this.disposables.add(vscode.workspace.onDidChangeTextDocument((event) => {
			// console.log(`Text document change ${Date.now()}`);
			this.didChangeTextDocument(event);
		}));

		this.disposables.add(vscode.window.onDidChangeActiveTextEditor((editor) => {
			this.didChangeActiveTextEditor(editor);
		}));

		this.disposables.add(vscode.window.onDidChangeTextEditorSelection(async (event) => {
			// console.log(`Selection ${Date.now()}`);
			this.didChangeTextEditorSelection(event);
		}));
		this.disposables.add(vscode.languages.registerInlineCompletionItemProvider([{ scheme: 'file', language: 'typescript' }, { scheme: 'file', language: 'typescriptreact' }], {
			provideInlineCompletionItems: async (document, position, context, _token) => {
				// console.log(`Inline completion ${Date.now()}`);
				this.onInlineCompletion(document, position, context);
				return undefined;
			}
		}, { debounceDelayMs: 0, groupId: 'contextService' }));
	}

	public dispose() {
		this.disposables.dispose();
	}

	private didChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
		const time = Date.now();
		this.lastDocumentChange = undefined;
		const document = event.document;
		if (document.languageId !== 'typescript' && document.languageId !== 'typescriptreact') {
			return;
		}
		if (event.contentChanges.length === 0) {
			return;
		}
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor === undefined || activeEditor.document.uri.toString() !== document.uri.toString()) {
			return;
		}
		this.lastDocumentChange = { document: document.uri.toString(), time: time };
	}

	private didChangeActiveTextEditor(editor: vscode.TextEditor | undefined): void {
		if (this.lastDocumentChange === undefined) {
			return;
		}
		if (editor === undefined) {
			this.lastDocumentChange = undefined;
			return;
		}
		const document = editor.document;
		if (this.lastDocumentChange.document !== document.uri.toString()) {
			this.lastDocumentChange = undefined;
		}
	}

	private didChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): void {
		const document = event.textEditor.document;
		const tokenBudget = this.tokenBudgetProvider.getTokenBudget(document);
		if (tokenBudget <= 0) {
			// There is no token budget left, so we don't want to trigger the cache population.
			return;
		}
		const position = this.getPosition(event);
		if (position === undefined) {
			this.selectionChangeDebouncer.cancel();
			return;
		}

		try {
			if (event.kind === vscode.TextEditorSelectionChangeKind.Command || event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
				this.selectionChangeDebouncer.cancel();
				this.populateCache(document, position, tokenBudget, undefined, TriggerKind.selection, false);
			}
			this.selectionChangeDebouncer.trigger(() => {
				this.populateCache(document, position, tokenBudget, undefined, TriggerKind.selection, true);
			});
		} catch (error) {
			console.error(error);
		}
	}

	private onInlineCompletion(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext): void {
		const tokenBudget = this.tokenBudgetProvider.getTokenBudget(document);
		if (tokenBudget <= 0) {
			// There is no token budget left, so we don't want to trigger the cache population.
			return;
		}
		this.populateCache(document, position, tokenBudget, context.requestUuid, TriggerKind.completion, false);
	}

	private getPosition(event: vscode.TextEditorSelectionChangeEvent): vscode.Position | undefined {
		const time = Date.now();
		const activeEditor = vscode.window.activeTextEditor;
		if (event.textEditor !== activeEditor) {
			return undefined;
		}
		const document = event.textEditor.document;
		if (document.languageId !== 'typescript' && document.languageId !== 'typescriptreact') {
			return;
		}
		if (event.selections.length !== 1) {
			return undefined;
		}
		const range = event.selections[0];
		if (!range.isEmpty) {
			return undefined;
		}
		const line = document.lineAt(range.start.line);
		const end = line.text.substring(range.start.character);
		// If we are not on an empty line or the end of the line is not empty, we don't want to trigger the context request.
		if (line.text.trim().length !== 0 && end.length > 0) {
			return undefined;
		}

		// If the last document change was within 500 ms, we don't want to trigger the context request. Instead we wait for the next change or
		// a normal inline completion request.
		if (this.lastDocumentChange !== undefined && this.lastDocumentChange.document === document.uri.toString() && time - this.lastDocumentChange.time < 500) {
			return undefined;
		}
		return range.start;
	}

	private populateCache(document: vscode.TextDocument, position: vscode.Position, tokenBudget: number, requestId: string | undefined, trigger: TriggerKind, check: boolean): void {
		if (check) {
			const activeTextEditor = vscode.window.activeTextEditor;
			if (activeTextEditor === undefined || activeTextEditor.document.uri.toString() !== document.uri.toString()) {
				return;
			}
			const selections = activeTextEditor.selections;
			if (selections === undefined || selections.length !== 1) {
				return;
			}
			const selection = selections[0];
			if (!selection.isEmpty || selection.start.line !== position.line || selection.start.character !== position.character) {
				return;
			}
		}
		const context: RequestContext = {
			requestId: requestId ?? generateUuid(),
			timeBudget: 50,
			tokenBudget: tokenBudget,
			source: KnownSources.populateCache,
			trigger: trigger,
			proposedEdits: undefined
		};
		this.languageContextService.populateCache(document, position, context).catch(() => {
			// Error got log inside the cache population call.
		});
	}
}

async function* mapAsyncIterable<T, U>(
	source: AsyncIterable<T>,
	transform: (item: T) => U | undefined
): AsyncIterable<U> {
	for await (const item of source) {
		const result = transform(item);
		if (result !== undefined) {
			yield result;
		}
	}
}

const showContextInspectorViewContextKey = `github.copilot.chat.showContextInspectorView`;
export class InlineCompletionContribution implements vscode.Disposable, TokenBudgetProvider {

	private readonly disposables: DisposableStore;

	private registrations: DisposableStore | undefined;
	private readonly registrationQueue: Queue<void>;

	private readonly telemetrySender: TelemetrySender;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@ILogService private readonly logService: ILogService,
		@ILanguageContextService private readonly languageContextService: ILanguageContextService,
		@ILanguageContextProviderService private readonly languageContextProviderService: ILanguageContextProviderService,
	) {
		this.registrations = undefined;
		this.telemetrySender = new TelemetrySender(telemetryService, logService);
		this.registrationQueue = new Queue<void>();

		this.disposables = new DisposableStore();
		if (languageContextService instanceof LanguageContextServiceImpl) {
			this.disposables.add(vscode.commands.registerCommand('github.copilot.debug.showContextInspectorView', async () => {
				await vscode.commands.executeCommand('setContext', showContextInspectorViewContextKey, true);
				await vscode.commands.executeCommand('context-inspector.focus');
			}));
			this.disposables.add(vscode.window.registerTreeDataProvider('context-inspector', new InspectorDataProvider(languageContextService)));
		}

		// Check if there are any TypeScript files open in the workspace.
		const open = vscode.workspace.textDocuments.some((document) => document.languageId === 'typescript' || document.languageId === 'typescriptreact');
		if (open) {
			this.typeScriptFileOpen();
		} else {
			const disposable = vscode.workspace.onDidOpenTextDocument((document) => {
				if (document.languageId === 'typescript' || document.languageId === 'typescriptreact') {
					disposable.dispose();
					this.typeScriptFileOpen();
				}
			});
		}
	}

	dispose() {
		this.registrations?.dispose();
		this.disposables.dispose();
		this.registrationQueue.dispose();
	}

	private typeScriptFileOpen(): void {
		this.checkRegistration();
		this.disposables.add(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(ConfigKey.TypeScriptLanguageContext.fullyQualifiedId) || e.affectsConfiguration(ConfigKey.TypeScript7LanguageContext.fullyQualifiedId) || TypeScript.affectsVersion(e)) {
				this.checkRegistration();
			}
		}));
	}

	private checkRegistration(): void {
		this.registrationQueue.queue(async () => {
			const value = this.getConfig();
			if (value === 'on') {
				await this.register();
			} else {
				this.unregister();
			}
		}).catch((error) => this.logService.error(error, 'Error checking TypeScript context provider registration'));
	}

	private async register(): Promise<void> {
		if (! await this.isTypeScriptRunning()) {
			this.unregister();
			return;
		}

		const languageContextService = this.languageContextService;
		const logService = this.logService;
		try {
			if (! await languageContextService.isActivated('typescript')) {
				this.unregister();
				return;
			}

			if (this.registrations !== undefined) {
				this.registrations.dispose();
				this.registrations = undefined;
			}

			this.registrations = new DisposableStore();
			this.registrations.add(new CachePopulationTrigger(this.languageContextService, this));

			const telemetrySender = this.telemetrySender;
			const self = this;
			const resolver: Copilot.ContextResolver<Copilot.SupportedContextItem> = {
				resolve(request: Copilot.ResolveRequest, token: vscode.CancellationToken): Promise<Copilot.SupportedContextItem[]> | AsyncIterable<Copilot.SupportedContextItem> {
					// console.log(`Resolve request ${Date.now()}`);
					const isSpeculativeRequest = request.documentContext.proposedEdits !== undefined;
					const [document, position] = self.getDocumentAndPosition(request, token);
					if (document === undefined || position === undefined) {
						return Promise.resolve([]);
					}
					const tokenBudget = self.getTokenBudget(document);
					if (tokenBudget <= 0) {
						telemetrySender.sendRequestTelemetry(document, position, { requestId: request.completionId, source: KnownSources.completion }, ContextItemSummary.DefaultExhausted, 0, undefined, undefined);
						return Promise.resolve([]);
					}
					const context: RequestContext = {
						requestId: request.completionId,
						opportunityId: request.opportunityId,
						timeBudget: request.timeBudget,
						tokenBudget: tokenBudget,
						source: request.source === 'nes' ? KnownSources.nes : KnownSources.completion,
						trigger: TriggerKind.completion,
						proposedEdits: isSpeculativeRequest ? [] : undefined,
						sampleTelemetry: self.getSampleTelemetry(request.activeExperiments)
					};
					const items = languageContextService.getContext(document, position, context, token);
					if (Array.isArray(items)) {
						const convertedItems: Copilot.SupportedContextItem[] = [];
						for (const item of items) {
							const converted = self.convertItem(item);
							if (converted === undefined) {
								continue;
							}
							convertedItems.push(converted);
						}
						return Promise.resolve(convertedItems);
					} else if (typeof (items as AsyncIterable<ContextItem>)[Symbol.asyncIterator] === 'function') {
						return mapAsyncIterable(items as AsyncIterable<ContextItem>, (item) => self.convertItem(item));
					} else if (items instanceof Promise) {
						return items.then((resolvedItems) => {
							const convertedItems: Copilot.SupportedContextItem[] = [];
							for (const item of resolvedItems) {
								const converted = self.convertItem(item);
								if (converted === undefined) {
									continue;
								}
								convertedItems.push(converted);
							}
							return convertedItems;
						});
					} else {
						return Promise.resolve([]);
					}
				}
			};
			if (typeof languageContextService.getContextOnTimeout === 'function') {
				resolver.resolveOnTimeout = (request) => {
					if (typeof languageContextService.getContextOnTimeout !== 'function') {
						return;
					}
					const [document, position] = self.getDocumentAndPosition(request);
					if (document === undefined || position === undefined) {
						return;
					}
					const context: RequestContext = {
						requestId: request.completionId,
						source: KnownSources.completion,
					};
					const items = languageContextService.getContextOnTimeout(document, position, context);
					if (items === undefined) {
						return;
					}
					const result: Copilot.SupportedContextItem[] = [];
					for (const item of items) {
						const converted = self.convertItem(item);
						if (converted === undefined) {
							continue;
						}
						result.push(converted);
					}
					return result;
				};
			}
			const provider: Copilot.ContextProvider<Copilot.SupportedContextItem> = {
				id: 'typescript-ai-context-provider',
				selector: { scheme: 'file', language: 'typescript' },
				resolver: resolver
			};

			// For legacy register with the copilot API
			const copilotAPI = await this.getCopilotApi();
			if (copilotAPI !== undefined) {
				this.registrations.add(copilotAPI.registerContextProvider(provider));
			}

			// Register with chat always.
			this.registrations.add(this.languageContextProviderService.registerContextProvider(provider, [ProviderTarget.Completions, ProviderTarget.NES]));
			this.telemetrySender.sendInlineCompletionProviderTelemetry(KnownSources.completion, true);
			logService.info('Registered TypeScript context provider with Copilot inline completions.');
		} catch (error) {
			logService.error('Error checking if server plugin is installed:', error);
		}
	}

	private async isTypeScriptRunning(): Promise<boolean> {
		// Check that the TypeScript extension is installed and runs in the same extension host.
		const useTypeScript7 = TypeScript.runsVersion7();
		const typeScriptExtension = useTypeScript7
			? TypeScript.getVersion7Extension()
			: vscode.extensions.getExtension('vscode.typescript-language-features');
		if (typeScriptExtension === undefined) {
			this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.TypescriptPlugin, 'TypeScript extension not found', useTypeScript7 ? 'ts6' : 'ts7');
			this.logService.error('TypeScript extension not found');
			return false;
		}
		try {
			await typeScriptExtension.activate();
			return true;
		} catch (error) {
			if (error instanceof Error) {
				this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.TypescriptPlugin, error.message, error.stack, useTypeScript7 ? 'ts6' : 'ts7');
				this.logService.error('Error checking if TypeScript plugin is installed:', error.message);
			} else {
				this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.TypescriptPlugin, 'Unknown error', undefined, useTypeScript7 ? 'ts6' : 'ts7');
				this.logService.error('Error checking if TypeScript plugin is installed: Unknown error');
			}
			return false;
		}
	}

	private getDocumentAndPosition(request: Copilot.ResolveRequest, token?: vscode.CancellationToken): [vscode.TextDocument | undefined, vscode.Position | undefined] {
		let document: vscode.TextDocument | undefined;
		if (vscode.window.activeTextEditor?.document.uri.toString() === request.documentContext.uri) {
			document = vscode.window.activeTextEditor.document;
		} else {
			document = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === request.documentContext.uri);
		}
		if (document === undefined) {
			this.telemetrySender.sendIntegrationTelemetry(request.completionId, request.documentContext.uri);
			return [undefined, undefined];
		}
		const requestPos = request.documentContext.position;
		const position = requestPos !== undefined ? new vscode.Position(requestPos.line, requestPos.character) : document.positionAt(request.documentContext.offset);
		if (document.version > request.documentContext.version) {
			if (!token?.isCancellationRequested) {
				this.telemetrySender.sendIntegrationTelemetry(request.completionId, request.documentContext.uri, `Version mismatch: ${document.version} !== ${request.documentContext.version}`);
			}
			return [undefined, undefined];
		}
		if (document.version < request.documentContext.version) {
			this.telemetrySender.sendIntegrationTelemetry(request.completionId, request.documentContext.uri, `Version mismatch: ${document.version} !== ${request.documentContext.version}`);
			return [undefined, undefined];
		}
		return [document, position];
	}

	private convertItem(item: ContextItem): Copilot.SupportedContextItem | undefined {
		if (item.kind === ContextKind.Snippet) {
			const converted: Copilot.CodeSnippet = {
				importance: item.priority * 100,
				id: item.id,
				uri: item.uri.toString(),
				value: item.value
			};
			if (item.additionalUris !== undefined) {
				converted.additionalUris = item.additionalUris.map((uri) => uri.toString());
			}
			return converted;
		} else if (item.kind === ContextKind.Trait) {
			const converted: Copilot.Trait = {
				importance: item.priority * 100,
				id: item.id,
				name: item.name,
				value: item.value
			};
			return converted;
		} else if (item.kind === ContextKind.DiagnosticBag) {
			const converted: Copilot.DiagnosticBag = {
				importance: item.priority * 100,
				id: item.id,
				uri: item.uri,
				values: item.values
			};
			return converted;
		}
		return undefined;
	}

	private async getCopilotApi(): Promise<Copilot.ContextProviderApiV1 | undefined> {
		const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
		if (copilotExtension === undefined) {
			// this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.CopilotExtension, 'Copilot extension not found', undefined);
			// this.logService.error('Copilot extension not found');
			return undefined;
		}
		try {
			const api = await copilotExtension.activate();
			return api.getContextProviderAPI('v1');
		} catch (error) {
			if (error instanceof Error) {
				this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.CopilotExtension, error.message, error.stack);
				this.logService.error('Error activating Copilot extension:', error.message);
			} else {
				this.telemetrySender.sendActivationFailedTelemetry(ErrorLocation.Client, ErrorPart.CopilotExtension, 'Unknown error', undefined);
				this.logService.error('Error activating Copilot extension: Unknown error.');
			}
			return undefined;
		}
	}

	private unregister(): void {
		if (this.registrations !== undefined) {
			this.registrations.dispose();
			this.registrations = undefined;
		}
		this.telemetrySender.sendInlineCompletionProviderTelemetry(KnownSources.completion, false);
	}

	private getConfig(): 'off' | 'on' {
		const expFlag = this.configurationService.getExperimentBasedConfig(ConfigKey.TypeScriptLanguageContext, this.experimentationService);
		return expFlag === true ? 'on' : 'off';
	}

	public getTokenBudget(document: vscode.TextDocument): number {
		return Math.trunc((currentTokenBudget) - (document.getText().length / 4) - 256);
	}

	private getSampleTelemetry(activeExperiments: Map<string, string | number | boolean | string[]>): number {
		const value = activeExperiments.get('sampleTelemetry');
		if (value === undefined || value === null || value === false) {
			return 1;
		}
		if (value === true) {
			return 10;
		}
		if (typeof value === 'number') {
			return Math.max(1, Math.min(100, value));
		}
		return 1;
	}
}
