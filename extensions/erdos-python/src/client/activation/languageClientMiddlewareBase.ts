// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as path from 'path';
import { CancellationToken, Diagnostic, Disposable, Uri } from 'vscode';
import {
    ConfigurationParams,
    ConfigurationRequest,
    HandleDiagnosticsSignature,
    LSPObject,
    Middleware,
    ResponseError,
} from 'vscode-languageclient';
import { ConfigurationItem } from 'vscode-languageserver-protocol';

import { HiddenFilePrefix } from '../common/constants';
import { createDeferred, isThenable } from '../common/utils/async';
import { StopWatch } from '../common/utils/stopWatch';
import { IEnvironmentVariablesProvider } from '../common/variables/types';
import { IInterpreterService } from '../interpreter/contracts';
import { IServiceContainer } from '../ioc/types';
import { EventName } from '../telemetry/constants';
import { LanguageServerType } from './types';

// Only send 100 events per hour.
const globalDebounce = 1000 * 60 * 60;
const globalLimit = 100;

// For calls that are more likely to happen during a session (hover, completion, document symbols).
const debounceFrequentCall = 1000 * 60 * 5;

// For calls that are less likely to happen during a session (go-to-def, workspace symbols).
const debounceRareCall = 1000 * 60;

type Awaited<T> = T extends PromiseLike<infer U> ? U : T;
type MiddleWareMethods = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [P in keyof Middleware]-?: NonNullable<Middleware[P]> extends (...args: any) => any ? Middleware[P] : never;
};

/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable prefer-rest-params */
/* eslint-disable consistent-return */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

interface SendTelemetryEventFunc {
    (eventName: EventName, measuresOrDurationMs?: Record<string, number> | number, properties?: any, ex?: Error): void;
}

export class LanguageClientMiddlewareBase implements Middleware {
    private readonly eventName: EventName | undefined;

    private readonly lastCaptured = new Map<string, number>();

    private nextWindow = 0;

    private eventCount = 0;

    public workspace = {
        configuration: async (
            params: ConfigurationParams,
            token: CancellationToken,
            next: ConfigurationRequest.HandlerSignature,
        ) => {
            if (!this.serviceContainer) {
                return next(params, token);
            }

            const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
            const envService = this.serviceContainer.get<IEnvironmentVariablesProvider>(IEnvironmentVariablesProvider);

            let settings = next(params, token);
            if (isThenable(settings)) {
                settings = await settings;
            }
            if (settings instanceof ResponseError) {
                return settings;
            }

            for (const [i, item] of params.items.entries()) {
                if (item.section === 'python') {
                    const uri = item.scopeUri ? Uri.parse(item.scopeUri) : undefined;
                    // For backwards compatibility, set python.pythonPath to the configured
                    // value as though it were in the user's settings.json file.
                    // As this is for backwards compatibility, `ConfigService.pythonPath`
                    // can be considered as active interpreter path.
                    const settingDict: LSPObject & { pythonPath: string; _envPYTHONPATH: string } = settings[
                        i
                    ] as LSPObject & { pythonPath: string; _envPYTHONPATH: string };
                    settingDict.pythonPath = (await interpreterService.getActiveInterpreter(uri))?.path ?? 'python';

                    const env = await envService.getEnvironmentVariables(uri);
                    const envPYTHONPATH = env.PYTHONPATH;
                    if (envPYTHONPATH) {
                        settingDict._envPYTHONPATH = envPYTHONPATH;
                    }
                }

                this.configurationHook(item, settings[i] as LSPObject);
            }

            return settings;
        },
    };

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-empty-function
    protected configurationHook(_item: ConfigurationItem, _settings: LSPObject): void {}

    private get connected(): Promise<boolean> {
        return this.connectedPromise.promise;
    }

    protected notebookAddon: (Middleware & Disposable) | undefined;

    private connectedPromise = createDeferred<boolean>();

    public constructor(
        readonly serviceContainer: IServiceContainer | undefined,
        serverType: LanguageServerType,
        public readonly sendTelemetryEventFunc: SendTelemetryEventFunc,
        public readonly serverVersion?: string,
    ) {
        this.handleDiagnostics = this.handleDiagnostics.bind(this); // VS Code calls function without context.
        this.didOpen = this.didOpen.bind(this);
        this.didSave = this.didSave.bind(this);
        this.didChange = this.didChange.bind(this);
        this.didClose = this.didClose.bind(this);
        this.willSave = this.willSave.bind(this);
        this.willSaveWaitUntil = this.willSaveWaitUntil.bind(this);

        if (serverType === LanguageServerType.Node) {
            this.eventName = EventName.LANGUAGE_SERVER_REQUEST;
        } else if (serverType === LanguageServerType.Jedi) {
            this.eventName = EventName.JEDI_LANGUAGE_SERVER_REQUEST;
        }
    }

    public connect() {
        this.connectedPromise.resolve(true);
    }

    public disconnect() {
        this.connectedPromise = createDeferred<boolean>();
        this.connectedPromise.resolve(false);
    }

    public didChange() {
        return this.callNext('didChange', arguments);
    }

    public didOpen() {
        // Special case, open and close happen before we connect.
        return this.callNext('didOpen', arguments);
    }

    public didClose() {
        // Special case, open and close happen before we connect.
        return this.callNext('didClose', arguments);
    }

    public didSave() {
        return this.callNext('didSave', arguments);
    }

    public willSave() {
        return this.callNext('willSave', arguments);
    }

    public willSaveWaitUntil() {
        return this.callNext('willSaveWaitUntil', arguments);
    }

    public async didOpenNotebook() {
        return this.callNotebooksNext('didOpen', arguments);
    }

    public async didSaveNotebook() {
        return this.callNotebooksNext('didSave', arguments);
    }

    public async didChangeNotebook() {
        return this.callNotebooksNext('didChange', arguments);
    }

    public async didCloseNotebook() {
        return this.callNotebooksNext('didClose', arguments);
    }

    notebooks = {
        didOpen: this.didOpenNotebook.bind(this),
        didSave: this.didSaveNotebook.bind(this),
        didChange: this.didChangeNotebook.bind(this),
        didClose: this.didCloseNotebook.bind(this),
    };

    public async provideCompletionItem() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/completion',
                debounceFrequentCall,
                'provideCompletionItem',
                arguments,
                (_, result) => {
                    if (!result) {
                        return { resultLength: 0 };
                    }
                    const resultLength = Array.isArray(result) ? result.length : result.items.length;
                    return { resultLength };
                },
            );
        }
    }

    public async provideHover() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry('textDocument/hover', debounceFrequentCall, 'provideHover', arguments);
        }
    }

    public async handleDiagnostics(uri: Uri, _diagnostics: Diagnostic[], _next: HandleDiagnosticsSignature) {
        if (await this.connected) {
            // Skip sending if this is a special file.
            const filePath = uri.fsPath;
            const baseName = filePath ? path.basename(filePath) : undefined;
            if (!baseName || !baseName.startsWith(HiddenFilePrefix)) {
                return this.callNext('handleDiagnostics', arguments);
            }
        }
    }

    public async resolveCompletionItem() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'completionItem/resolve',
                debounceFrequentCall,
                'resolveCompletionItem',
                arguments,
            );
        }
    }

    public async provideSignatureHelp() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/signatureHelp',
                debounceFrequentCall,
                'provideSignatureHelp',
                arguments,
            );
        }
    }

    public async provideDefinition() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/definition',
                debounceRareCall,
                'provideDefinition',
                arguments,
            );
        }
    }

    public async provideReferences() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/references',
                debounceRareCall,
                'provideReferences',
                arguments,
            );
        }
    }

    public async provideDocumentHighlights() {
        if (await this.connected) {
            return this.callNext('provideDocumentHighlights', arguments);
        }
    }

    public async provideDocumentSymbols() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/documentSymbol',
                debounceFrequentCall,
                'provideDocumentSymbols',
                arguments,
            );
        }
    }

    public async provideWorkspaceSymbols() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'workspace/symbol',
                debounceRareCall,
                'provideWorkspaceSymbols',
                arguments,
            );
        }
    }

    public async provideCodeActions() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/codeAction',
                debounceFrequentCall,
                'provideCodeActions',
                arguments,
            );
        }
    }

    public async provideCodeLenses() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/codeLens',
                debounceFrequentCall,
                'provideCodeLenses',
                arguments,
            );
        }
    }

    public async resolveCodeLens() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'codeLens/resolve',
                debounceFrequentCall,
                'resolveCodeLens',
                arguments,
            );
        }
    }

    public async provideDocumentFormattingEdits() {
        if (await this.connected) {
            return this.callNext('provideDocumentFormattingEdits', arguments);
        }
    }

    public async provideDocumentRangeFormattingEdits() {
        if (await this.connected) {
            return this.callNext('provideDocumentRangeFormattingEdits', arguments);
        }
    }

    public async provideOnTypeFormattingEdits() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/onTypeFormatting',
                debounceFrequentCall,
                'provideOnTypeFormattingEdits',
                arguments,
            );
        }
    }

    public async provideRenameEdits() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/rename',
                debounceRareCall,
                'provideRenameEdits',
                arguments,
            );
        }
    }

    public async prepareRename() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/prepareRename',
                debounceRareCall,
                'prepareRename',
                arguments,
            );
        }
    }

    public async provideDocumentLinks() {
        if (await this.connected) {
            return this.callNext('provideDocumentLinks', arguments);
        }
    }

    public async resolveDocumentLink() {
        if (await this.connected) {
            return this.callNext('resolveDocumentLink', arguments);
        }
    }

    public async provideDeclaration() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/declaration',
                debounceRareCall,
                'provideDeclaration',
                arguments,
            );
        }
    }

    public async provideTypeDefinition() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/typeDefinition',
                debounceRareCall,
                'provideTypeDefinition',
                arguments,
            );
        }
    }

    public async provideImplementation() {
        if (await this.connected) {
            return this.callNext('provideImplementation', arguments);
        }
    }

    public async provideDocumentColors() {
        if (await this.connected) {
            return this.callNext('provideDocumentColors', arguments);
        }
    }

    public async provideColorPresentations() {
        if (await this.connected) {
            return this.callNext('provideColorPresentations', arguments);
        }
    }

    public async provideFoldingRanges() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/foldingRange',
                debounceFrequentCall,
                'provideFoldingRanges',
                arguments,
            );
        }
    }

    public async provideSelectionRanges() {
        if (await this.connected) {
            return this.callNextAndSendTelemetry(
                'textDocument/selectionRange',
                debounceRareCall,
                'provideSelectionRanges',
                arguments,
            );
        }
    }

    public async prepareCallHierarchy() {
        if (await this.connected) {
            return this.callNext('prepareCallHierarchy', arguments);
        }
    }

    public async provideCallHierarchyIncomingCalls() {
        if (await this.connected) {
            return this.callNext('provideCallHierarchyIncomingCalls', arguments);
        }
    }

    public async provideCallHierarchyOutgoingCalls() {
        if (await this.connected) {
            return this.callNext('provideCallHierarchyOutgoingCalls', arguments);
        }
    }

    public async provideDocumentSemanticTokens() {
        if (await this.connected) {
            return this.callNext('provideDocumentSemanticTokens', arguments);
        }
    }

    public async provideDocumentSemanticTokensEdits() {
        if (await this.connected) {
            return this.callNext('provideDocumentSemanticTokensEdits', arguments);
        }
    }

    public async provideDocumentRangeSemanticTokens() {
        if (await this.connected) {
            return this.callNext('provideDocumentRangeSemanticTokens', arguments);
        }
    }

    public async provideLinkedEditingRange() {
        if (await this.connected) {
            return this.callNext('provideLinkedEditingRange', arguments);
        }
    }

    private callNext(funcName: keyof Middleware, args: IArguments) {
        // This function uses the last argument to call the 'next' item. If we're allowing notebook
        // middleware, it calls into the notebook middleware first.
        if (this.notebookAddon && (this.notebookAddon as any)[funcName]) {
            // It would be nice to use args.callee, but not supported in strict mode
            return (this.notebookAddon as any)[funcName](...args);
        }

        return args[args.length - 1](...args);
    }

    private callNotebooksNext(funcName: 'didOpen' | 'didSave' | 'didChange' | 'didClose', args: IArguments) {
        // This function uses the last argument to call the 'next' item. If we're allowing notebook
        // middleware, it calls into the notebook middleware first.
        if (this.notebookAddon?.notebooks && (this.notebookAddon.notebooks as any)[funcName]) {
            // It would be nice to use args.callee, but not supported in strict mode
            return (this.notebookAddon.notebooks as any)[funcName](...args);
        }

        return args[args.length - 1](...args);
    }

    private callNextAndSendTelemetry<T extends keyof MiddleWareMethods>(
        lspMethod: string,
        debounceMilliseconds: number,
        funcName: T,
        args: IArguments,
        lazyMeasures?: (this_: any, result: Awaited<ReturnType<MiddleWareMethods[T]>>) => Record<string, number>,
    ): ReturnType<MiddleWareMethods[T]> {
        const now = Date.now();
        const stopWatch = new StopWatch();
        let calledNext = false;
        // Change the 'last' argument (which is our next) in order to track if
        // telemetry should be sent or not.
        const changedArgs = [...args];

        // Track whether or not the middleware called the 'next' function (which means it actually sent a request)
        changedArgs[changedArgs.length - 1] = (...nextArgs: any) => {
            // If the 'next' function is called, then legit request was made.
            calledNext = true;

            // Then call the original 'next'
            return args[args.length - 1](...nextArgs);
        };

        // Check if we need to reset the event count (if we're past the globalDebounce time)
        if (now > this.nextWindow) {
            // Past the end of the last window, reset.
            this.nextWindow = now + globalDebounce;
            this.eventCount = 0;
        }
        const lastCapture = this.lastCaptured.get(lspMethod);

        const sendTelemetry = (result: Awaited<ReturnType<MiddleWareMethods[T]>>) => {
            // Skip doing anything if not allowed
            // We should have:
            // - called the next function in the middleware (this means a request was actually sent)
            // - eventcount is not over the global limit
            // - elapsed time since we sent this event is greater than debounce time
            if (
                this.eventName &&
                calledNext &&
                this.eventCount < globalLimit &&
                (!lastCapture || now - lastCapture > debounceMilliseconds)
            ) {
                // We're sending, so update event count and last captured time
                this.lastCaptured.set(lspMethod, now);
                this.eventCount += 1;

                // Replace all slashes in the method name so it doesn't get scrubbed by @vscode/extension-telemetry.
                const formattedMethod = lspMethod.replace(/\//g, '.');

                const properties = {
                    lsVersion: this.serverVersion || 'unknown',
                    method: formattedMethod,
                };

                let measures: number | Record<string, number> = stopWatch.elapsedTime;
                if (lazyMeasures) {
                    measures = {
                        duration: measures,
                        ...lazyMeasures(this, result),
                    };
                }

                this.sendTelemetryEventFunc(this.eventName, measures, properties);
            }
            return result;
        };

        // Try to call the 'next' function in the middleware chain
        const result: ReturnType<MiddleWareMethods[T]> = this.callNext(funcName, changedArgs as any);

        // Then wait for the result before sending telemetry
        if (isThenable(result)) {
            return result.then(sendTelemetry);
        }
        return sendTelemetry(result as any) as ReturnType<MiddleWareMethods[T]>;
    }
}
