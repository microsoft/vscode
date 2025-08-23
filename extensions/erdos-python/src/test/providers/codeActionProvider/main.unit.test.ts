// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert, expect } from 'chai';
import rewiremock from 'rewiremock';
import * as typemoq from 'typemoq';
import { CodeActionKind, CodeActionProvider, CodeActionProviderMetadata, DocumentSelector } from 'vscode';
import { IDisposableRegistry } from '../../../client/common/types';
import { LaunchJsonCodeActionProvider } from '../../../client/providers/codeActionProvider/launchJsonCodeActionProvider';
import { CodeActionProviderService } from '../../../client/providers/codeActionProvider/main';

suite('Code Action Provider service', async () => {
    setup(() => {
        rewiremock.disable();
    });
    test('Code actions are registered correctly', async () => {
        let selector: DocumentSelector;
        let provider: CodeActionProvider;
        let metadata: CodeActionProviderMetadata;
        const vscodeMock = {
            languages: {
                registerCodeActionsProvider: (
                    _selector: DocumentSelector,
                    _provider: CodeActionProvider,
                    _metadata: CodeActionProviderMetadata,
                ) => {
                    selector = _selector;
                    provider = _provider;
                    metadata = _metadata;
                },
            },
            CodeActionKind: {
                QuickFix: 'CodeAction',
            },
        };
        rewiremock.enable();
        rewiremock('vscode').with(vscodeMock);
        const quickFixService = new CodeActionProviderService(typemoq.Mock.ofType<IDisposableRegistry>().object);

        await quickFixService.activate();

        // Ensure QuickFixLaunchJson is registered with correct arguments
        assert.deepEqual(selector!, {
            scheme: 'file',
            language: 'jsonc',
            pattern: '**/launch.json',
        });
        assert.deepEqual(metadata!, {
            providedCodeActionKinds: [('CodeAction' as unknown) as CodeActionKind],
        });
        expect(provider!).instanceOf(LaunchJsonCodeActionProvider);
    });
});
