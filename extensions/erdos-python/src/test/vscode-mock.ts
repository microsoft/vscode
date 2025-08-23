// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as vscode from 'vscode';
import * as vscodeMocks from './mocks/vsc';
import { vscMockTelemetryReporter } from './mocks/vsc/telemetryReporter';
import { anything, instance, mock, when } from 'ts-mockito';
const Module = require('module');

type VSCode = typeof vscode;

const mockedVSCode: Partial<VSCode> = {};
export const mockedVSCodeNamespaces: { [P in keyof VSCode]?: VSCode[P] } = {};
const originalLoad = Module._load;

function generateMock<K extends keyof VSCode>(name: K): void {
    const mockedObj = mock<VSCode[K]>();
    (mockedVSCode as any)[name] = instance(mockedObj);
    mockedVSCodeNamespaces[name] = mockedObj as any;
}

class MockClipboard {
    private text: string = '';
    public readText(): Promise<string> {
        return Promise.resolve(this.text);
    }
    public async writeText(value: string): Promise<void> {
        this.text = value;
    }
}
export function initialize() {
    generateMock('workspace');
    generateMock('window');
    generateMock('commands');
    generateMock('languages');
    generateMock('extensions');
    generateMock('env');
    generateMock('debug');
    generateMock('scm');
    generateMock('notebooks');

    // Use mock clipboard fo testing purposes.
    const clipboard = new MockClipboard();
    when(mockedVSCodeNamespaces.env!.clipboard).thenReturn(clipboard);
    when(mockedVSCodeNamespaces.env!.appName).thenReturn('Insider');

    // This API is used in src/client/telemetry/telemetry.ts
    const extension = mock<vscode.Extension<any>>();
    const packageJson = mock<any>();
    const contributes = mock<any>();
    when(extension.packageJSON).thenReturn(instance(packageJson));
    when(packageJson.contributes).thenReturn(instance(contributes));
    when(contributes.debuggers).thenReturn([{ aiKey: '' }]);
    when(mockedVSCodeNamespaces.extensions!.getExtension(anything())).thenReturn(instance(extension));
    when(mockedVSCodeNamespaces.extensions!.all).thenReturn([]);

    // When upgrading to npm 9-10, this might have to change, as we could have explicit imports (named imports).
    Module._load = function (request: any, _parent: any) {
        if (request === 'vscode') {
            return mockedVSCode;
        }
        if (request === '@vscode/extension-telemetry') {
            return { default: vscMockTelemetryReporter as any };
        }
        // less files need to be in import statements to be converted to css
        // But we don't want to try to load them in the mock vscode
        if (/\.less$/.test(request)) {
            return;
        }
        return originalLoad.apply(this, arguments);
    };
}

mockedVSCode.ThemeIcon = vscodeMocks.ThemeIcon;
mockedVSCode.l10n = vscodeMocks.l10n;
mockedVSCode.ThemeColor = vscodeMocks.ThemeColor;
mockedVSCode.MarkdownString = vscodeMocks.MarkdownString;
mockedVSCode.Hover = vscodeMocks.Hover;
mockedVSCode.Disposable = vscodeMocks.Disposable as any;
mockedVSCode.ExtensionKind = vscodeMocks.ExtensionKind;
mockedVSCode.CodeAction = vscodeMocks.CodeAction;
mockedVSCode.TestMessage = vscodeMocks.TestMessage;
mockedVSCode.Location = vscodeMocks.Location;
mockedVSCode.EventEmitter = vscodeMocks.EventEmitter;
mockedVSCode.CancellationTokenSource = vscodeMocks.CancellationTokenSource;
mockedVSCode.CompletionItemKind = vscodeMocks.CompletionItemKind;
mockedVSCode.SymbolKind = vscodeMocks.SymbolKind;
mockedVSCode.IndentAction = vscodeMocks.IndentAction;
mockedVSCode.Uri = vscodeMocks.vscUri.URI as any;
mockedVSCode.Range = vscodeMocks.vscMockExtHostedTypes.Range;
mockedVSCode.Position = vscodeMocks.vscMockExtHostedTypes.Position;
mockedVSCode.Selection = vscodeMocks.vscMockExtHostedTypes.Selection;
mockedVSCode.Location = vscodeMocks.vscMockExtHostedTypes.Location;
mockedVSCode.SymbolInformation = vscodeMocks.vscMockExtHostedTypes.SymbolInformation;
mockedVSCode.CallHierarchyItem = vscodeMocks.vscMockExtHostedTypes.CallHierarchyItem;
mockedVSCode.CompletionItem = vscodeMocks.vscMockExtHostedTypes.CompletionItem;
mockedVSCode.CompletionItemKind = vscodeMocks.vscMockExtHostedTypes.CompletionItemKind;
mockedVSCode.CodeLens = vscodeMocks.vscMockExtHostedTypes.CodeLens;
mockedVSCode.Diagnostic = vscodeMocks.vscMockExtHostedTypes.Diagnostic;
mockedVSCode.DiagnosticSeverity = vscodeMocks.vscMockExtHostedTypes.DiagnosticSeverity;
mockedVSCode.SnippetString = vscodeMocks.vscMockExtHostedTypes.SnippetString;
mockedVSCode.ConfigurationTarget = vscodeMocks.vscMockExtHostedTypes.ConfigurationTarget;
mockedVSCode.StatusBarAlignment = vscodeMocks.vscMockExtHostedTypes.StatusBarAlignment;
mockedVSCode.SignatureHelp = vscodeMocks.vscMockExtHostedTypes.SignatureHelp;
mockedVSCode.DocumentLink = vscodeMocks.vscMockExtHostedTypes.DocumentLink;
mockedVSCode.TextEdit = vscodeMocks.vscMockExtHostedTypes.TextEdit;
mockedVSCode.WorkspaceEdit = vscodeMocks.vscMockExtHostedTypes.WorkspaceEdit;
mockedVSCode.RelativePattern = vscodeMocks.vscMockExtHostedTypes.RelativePattern;
mockedVSCode.ProgressLocation = vscodeMocks.vscMockExtHostedTypes.ProgressLocation;
mockedVSCode.ViewColumn = vscodeMocks.vscMockExtHostedTypes.ViewColumn;
mockedVSCode.TextEditorRevealType = vscodeMocks.vscMockExtHostedTypes.TextEditorRevealType;
mockedVSCode.TreeItem = vscodeMocks.vscMockExtHostedTypes.TreeItem;
mockedVSCode.TreeItemCollapsibleState = vscodeMocks.vscMockExtHostedTypes.TreeItemCollapsibleState;
(mockedVSCode as any).CodeActionKind = vscodeMocks.CodeActionKind;
mockedVSCode.CompletionItemKind = vscodeMocks.CompletionItemKind;
mockedVSCode.CompletionTriggerKind = vscodeMocks.CompletionTriggerKind;
mockedVSCode.DebugAdapterExecutable = vscodeMocks.DebugAdapterExecutable;
mockedVSCode.DebugAdapterServer = vscodeMocks.DebugAdapterServer;
mockedVSCode.QuickInputButtons = vscodeMocks.vscMockExtHostedTypes.QuickInputButtons;
mockedVSCode.FileType = vscodeMocks.FileType;
mockedVSCode.UIKind = vscodeMocks.UIKind;
mockedVSCode.FileSystemError = vscodeMocks.vscMockExtHostedTypes.FileSystemError;
mockedVSCode.LanguageStatusSeverity = vscodeMocks.LanguageStatusSeverity;
mockedVSCode.QuickPickItemKind = vscodeMocks.QuickPickItemKind;
mockedVSCode.InlayHint = vscodeMocks.InlayHint;
mockedVSCode.LogLevel = vscodeMocks.LogLevel;
(mockedVSCode as any).NotebookCellKind = vscodeMocks.vscMockExtHostedTypes.NotebookCellKind;
(mockedVSCode as any).CellOutputKind = vscodeMocks.vscMockExtHostedTypes.CellOutputKind;
(mockedVSCode as any).NotebookCellRunState = vscodeMocks.vscMockExtHostedTypes.NotebookCellRunState;
(mockedVSCode as any).TypeHierarchyItem = vscodeMocks.vscMockExtHostedTypes.TypeHierarchyItem;
(mockedVSCode as any).ProtocolTypeHierarchyItem = vscodeMocks.vscMockExtHostedTypes.ProtocolTypeHierarchyItem;
(mockedVSCode as any).CancellationError = vscodeMocks.vscMockExtHostedTypes.CancellationError;
(mockedVSCode as any).LSPCancellationError = vscodeMocks.vscMockExtHostedTypes.LSPCancellationError;
mockedVSCode.TestRunProfileKind = vscodeMocks.TestRunProfileKind;
