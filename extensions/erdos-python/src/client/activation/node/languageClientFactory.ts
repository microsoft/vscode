// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

import { PYLANCE_EXTENSION_ID, PYTHON_LANGUAGE } from '../../common/constants';
import { IFileSystem } from '../../common/platform/types';
import { IExtensions, Resource } from '../../common/types';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { FileBasedCancellationStrategy } from '../common/cancellationUtils';
import { ILanguageClientFactory } from '../types';

export const PYLANCE_NAME = 'Pylance';

export class NodeLanguageClientFactory implements ILanguageClientFactory {
    constructor(private readonly fs: IFileSystem, private readonly extensions: IExtensions) {}

    public async createLanguageClient(
        _resource: Resource,
        _interpreter: PythonEnvironment | undefined,
        clientOptions: LanguageClientOptions,
    ): Promise<LanguageClient> {
        // this must exist for node language client
        const commandArgs = (clientOptions.connectionOptions
            ?.cancellationStrategy as FileBasedCancellationStrategy).getCommandLineArguments();

        const extension = this.extensions.getExtension(PYLANCE_EXTENSION_ID);
        const languageServerFolder = extension ? extension.extensionPath : '';
        const bundlePath = path.join(languageServerFolder, 'dist', 'server.bundle.js');
        const nonBundlePath = path.join(languageServerFolder, 'dist', 'server.js');
        const modulePath = (await this.fs.fileExists(nonBundlePath)) ? nonBundlePath : bundlePath;
        const debugOptions = { execArgv: ['--nolazy', '--inspect=6600'] };

        // If the extension is launched in debug mode, then the debug server options are used.
        const serverOptions: ServerOptions = {
            run: {
                module: bundlePath,
                transport: TransportKind.ipc,
                args: commandArgs,
            },
            // In debug mode, use the non-bundled code if it's present. The production
            // build includes only the bundled package, so we don't want to crash if
            // someone starts the production extension in debug mode.
            debug: {
                module: modulePath,
                transport: TransportKind.ipc,
                options: debugOptions,
                args: commandArgs,
            },
        };

        return new LanguageClient(PYTHON_LANGUAGE, PYLANCE_NAME, serverOptions, clientOptions);
    }
}
