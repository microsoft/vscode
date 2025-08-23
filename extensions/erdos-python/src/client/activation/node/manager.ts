// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import '../../common/extensions';

import { ICommandManager } from '../../common/application/types';
import { IDisposable, IExtensions, Resource } from '../../common/types';
import { debounceSync } from '../../common/utils/decorators';
import { IServiceContainer } from '../../ioc/types';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { captureTelemetry, sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { Commands } from '../commands';
import { NodeLanguageClientMiddleware } from './languageClientMiddleware';
import { ILanguageServerAnalysisOptions, ILanguageServerManager } from '../types';
import { traceDecoratorError, traceDecoratorVerbose } from '../../logging';
import { PYLANCE_EXTENSION_ID } from '../../common/constants';
import { NodeLanguageServerProxy } from './languageServerProxy';

export class NodeLanguageServerManager implements ILanguageServerManager {
    private resource!: Resource;

    private interpreter: PythonEnvironment | undefined;

    private middleware: NodeLanguageClientMiddleware | undefined;

    private disposables: IDisposable[] = [];

    private connected = false;

    private lsVersion: string | undefined;

    private started = false;

    private static commandDispose: IDisposable;

    constructor(
        private readonly serviceContainer: IServiceContainer,
        private readonly analysisOptions: ILanguageServerAnalysisOptions,
        private readonly languageServerProxy: NodeLanguageServerProxy,
        commandManager: ICommandManager,
        private readonly extensions: IExtensions,
    ) {
        if (NodeLanguageServerManager.commandDispose) {
            NodeLanguageServerManager.commandDispose.dispose();
        }
        NodeLanguageServerManager.commandDispose = commandManager.registerCommand(Commands.RestartLS, () => {
            sendTelemetryEvent(EventName.LANGUAGE_SERVER_RESTART, undefined, { reason: 'command' });
            this.restartLanguageServer().ignoreErrors();
        });
    }

    private static versionTelemetryProps(instance: NodeLanguageServerManager) {
        return {
            lsVersion: instance.lsVersion,
        };
    }

    public dispose(): void {
        this.stopLanguageServer().ignoreErrors();
        NodeLanguageServerManager.commandDispose.dispose();
        this.disposables.forEach((d) => d.dispose());
    }

    @traceDecoratorError('Failed to start language server')
    public async start(resource: Resource, interpreter: PythonEnvironment | undefined): Promise<void> {
        if (this.started) {
            throw new Error('Language server already started');
        }
        this.resource = resource;
        this.interpreter = interpreter;
        this.analysisOptions.onDidChange(this.restartLanguageServerDebounced, this, this.disposables);

        const extension = this.extensions.getExtension(PYLANCE_EXTENSION_ID);
        this.lsVersion = extension?.packageJSON.version || '0';

        await this.analysisOptions.initialize(resource, interpreter);
        await this.startLanguageServer();

        this.started = true;
    }

    public connect(): void {
        if (!this.connected) {
            this.connected = true;
            this.middleware?.connect();
        }
    }

    public disconnect(): void {
        if (this.connected) {
            this.connected = false;
            this.middleware?.disconnect();
        }
    }

    @debounceSync(1000)
    protected restartLanguageServerDebounced(): void {
        sendTelemetryEvent(EventName.LANGUAGE_SERVER_RESTART, undefined, { reason: 'settings' });
        this.restartLanguageServer().ignoreErrors();
    }

    @traceDecoratorError('Failed to restart language server')
    @traceDecoratorVerbose('Restarting language server')
    protected async restartLanguageServer(): Promise<void> {
        await this.stopLanguageServer();
        await this.startLanguageServer();
    }

    @captureTelemetry(
        EventName.LANGUAGE_SERVER_STARTUP,
        undefined,
        true,
        undefined,
        NodeLanguageServerManager.versionTelemetryProps,
    )
    @traceDecoratorVerbose('Starting language server')
    protected async startLanguageServer(): Promise<void> {
        const options = await this.analysisOptions.getAnalysisOptions();
        this.middleware = new NodeLanguageClientMiddleware(this.serviceContainer, this.lsVersion);
        options.middleware = this.middleware;

        // Make sure the middleware is connected if we restart and we we're already connected.
        if (this.connected) {
            this.middleware.connect();
        }

        // Then use this middleware to start a new language client.
        await this.languageServerProxy.start(this.resource, this.interpreter, options);
    }

    @traceDecoratorVerbose('Stopping language server')
    protected async stopLanguageServer(): Promise<void> {
        if (this.languageServerProxy) {
            await this.languageServerProxy.stop();
        }
    }
}
