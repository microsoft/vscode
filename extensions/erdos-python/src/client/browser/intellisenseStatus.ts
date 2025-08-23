// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// IMPORTANT: Do not import any node fs related modules here, as they do not work in browser.
import * as vscode from 'vscode';
import { Common, LanguageService } from './localize';

export function createStatusItem(): vscode.Disposable {
    if ('createLanguageStatusItem' in vscode.languages) {
        const statusItem = vscode.languages.createLanguageStatusItem('python.projectStatus', {
            language: 'python',
        });
        statusItem.name = LanguageService.statusItem.name;
        statusItem.severity = vscode.LanguageStatusSeverity.Warning;
        statusItem.text = LanguageService.statusItem.text;
        statusItem.detail = LanguageService.statusItem.detail;
        statusItem.command = {
            title: Common.learnMore,
            command: 'vscode.open',
            arguments: [vscode.Uri.parse('https://aka.ms/AAdzyh4')],
        };
        return statusItem;
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return { dispose: () => undefined };
}
