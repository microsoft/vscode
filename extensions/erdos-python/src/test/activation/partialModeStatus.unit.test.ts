// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { assert } from 'chai';
import rewiremock from 'rewiremock';
import * as typemoq from 'typemoq';
import * as vscodeTypes from 'vscode';
import { DocumentSelector, LanguageStatusItem } from 'vscode';
import { PartialModeStatusItem } from '../../client/activation/partialModeStatus';
import { IWorkspaceService } from '../../client/common/application/types';
import { IDisposableRegistry } from '../../client/common/types';
import { Common, LanguageService } from '../../client/common/utils/localize';

suite('Partial Mode Status', async () => {
    let workspaceService: typemoq.IMock<IWorkspaceService>;
    let actualSelector: DocumentSelector | undefined;
    let languageItem: LanguageStatusItem;
    let vscodeMock: typeof vscodeTypes;
    setup(() => {
        workspaceService = typemoq.Mock.ofType<IWorkspaceService>();
        languageItem = ({
            name: '',
            severity: 2,
            text: '',
            detail: undefined,
            command: undefined,
        } as unknown) as LanguageStatusItem;
        actualSelector = undefined;
        vscodeMock = ({
            languages: {
                createLanguageStatusItem: (_: string, selector: DocumentSelector) => {
                    actualSelector = selector;
                    return languageItem;
                },
            },
            LanguageStatusSeverity: {
                Information: 0,
                Warning: 1,
                Error: 2,
            },
            Uri: {
                parse: (s: string) => s,
            },
        } as unknown) as typeof vscodeTypes;
        rewiremock.enable();
        rewiremock('vscode').with(vscodeMock);
    });

    teardown(() => {
        rewiremock.disable();
    });

    test("No item is created if workspace is trusted and isn't virtual", async () => {
        workspaceService.setup((w) => w.isTrusted).returns(() => true);
        workspaceService.setup((w) => w.isVirtualWorkspace).returns(() => false);
        const quickFixService = new PartialModeStatusItem(
            workspaceService.object,
            typemoq.Mock.ofType<IDisposableRegistry>().object,
        );

        await quickFixService.activate();

        assert.deepEqual(actualSelector, undefined);
    });

    test('Expected status item is created if workspace is not trusted', async () => {
        workspaceService.setup((w) => w.isTrusted).returns(() => false);
        workspaceService.setup((w) => w.isVirtualWorkspace).returns(() => false);
        const statusItem = new PartialModeStatusItem(
            workspaceService.object,
            typemoq.Mock.ofType<IDisposableRegistry>().object,
        );

        await statusItem.activate();

        assert.deepEqual(actualSelector!, {
            language: 'python',
        });
        assert.deepEqual(languageItem, ({
            name: LanguageService.statusItem.name,
            severity: vscodeMock.LanguageStatusSeverity.Warning,
            text: LanguageService.statusItem.text,
            detail: LanguageService.statusItem.detail,
            command: {
                title: Common.learnMore,
                command: 'vscode.open',
                arguments: ['https://aka.ms/AAdzyh4'],
            },
        } as unknown) as LanguageStatusItem);
    });

    test('Expected status item is created if workspace is virtual', async () => {
        workspaceService.setup((w) => w.isTrusted).returns(() => true);
        workspaceService.setup((w) => w.isVirtualWorkspace).returns(() => true);
        const statusItem = new PartialModeStatusItem(
            workspaceService.object,
            typemoq.Mock.ofType<IDisposableRegistry>().object,
        );

        await statusItem.activate();

        assert.deepEqual(actualSelector!, {
            language: 'python',
        });
        assert.deepEqual(languageItem, ({
            name: LanguageService.statusItem.name,
            severity: vscodeMock.LanguageStatusSeverity.Warning,
            text: LanguageService.statusItem.text,
            detail: LanguageService.virtualWorkspaceStatusItem.detail,
            command: {
                title: Common.learnMore,
                command: 'vscode.open',
                arguments: ['https://aka.ms/AAdzyh4'],
            },
        } as unknown) as LanguageStatusItem);
    });

    test('Expected status item is created if workspace is both virtual and untrusted', async () => {
        workspaceService.setup((w) => w.isTrusted).returns(() => false);
        workspaceService.setup((w) => w.isVirtualWorkspace).returns(() => true);
        const statusItem = new PartialModeStatusItem(
            workspaceService.object,
            typemoq.Mock.ofType<IDisposableRegistry>().object,
        );

        await statusItem.activate();

        assert.deepEqual(actualSelector!, {
            language: 'python',
        });
        assert.deepEqual(languageItem, ({
            name: LanguageService.statusItem.name,
            severity: vscodeMock.LanguageStatusSeverity.Warning,
            text: LanguageService.statusItem.text,
            detail: LanguageService.statusItem.detail,
            command: {
                title: Common.learnMore,
                command: 'vscode.open',
                arguments: ['https://aka.ms/AAdzyh4'],
            },
        } as unknown) as LanguageStatusItem);
    });
});
