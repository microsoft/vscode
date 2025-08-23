// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import * as vscodeTypes from 'vscode';
import { IExtensionSingleActivationService } from '../../activation/types';
import { IDisposableRegistry } from '../../common/types';
import { LaunchJsonCodeActionProvider } from './launchJsonCodeActionProvider';

@injectable()
export class CodeActionProviderService implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: false };

    constructor(@inject(IDisposableRegistry) private disposableRegistry: IDisposableRegistry) {}

    public async activate(): Promise<void> {
        // eslint-disable-next-line global-require
        const vscode = require('vscode') as typeof vscodeTypes;
        const documentSelector: vscodeTypes.DocumentFilter = {
            scheme: 'file',
            language: 'jsonc',
            pattern: '**/launch.json',
        };
        this.disposableRegistry.push(
            vscode.languages.registerCodeActionsProvider(documentSelector, new LaunchJsonCodeActionProvider(), {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
            }),
        );
    }
}
