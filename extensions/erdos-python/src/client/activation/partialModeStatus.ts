// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// IMPORTANT: Do not import any node fs related modules here, as they do not work in browser.
import { inject, injectable } from 'inversify';
import type * as vscodeTypes from 'vscode';
import { IWorkspaceService } from '../common/application/types';
import { IDisposableRegistry } from '../common/types';
import { Common, LanguageService } from '../common/utils/localize';
import { IExtensionSingleActivationService } from './types';

/**
 * Only partial features are available when running in untrusted or a
 * virtual workspace, this creates a UI element to indicate that.
 */
@injectable()
export class PartialModeStatusItem implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: true, virtualWorkspace: true };

    constructor(
        @inject(IWorkspaceService) private readonly workspace: IWorkspaceService,
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
    ) {}

    public async activate(): Promise<void> {
        const { isTrusted, isVirtualWorkspace } = this.workspace;
        if (isTrusted && !isVirtualWorkspace) {
            return;
        }
        const statusItem = this.createStatusItem();
        if (statusItem) {
            this.disposables.push(statusItem);
        }
    }

    private createStatusItem() {
        // eslint-disable-next-line global-require
        const vscode = require('vscode') as typeof vscodeTypes;
        if ('createLanguageStatusItem' in vscode.languages) {
            const statusItem = vscode.languages.createLanguageStatusItem('python.projectStatus', {
                language: 'python',
            });
            statusItem.name = LanguageService.statusItem.name;
            statusItem.severity = vscode.LanguageStatusSeverity.Warning;
            statusItem.text = LanguageService.statusItem.text;
            statusItem.detail = !this.workspace.isTrusted
                ? LanguageService.statusItem.detail
                : LanguageService.virtualWorkspaceStatusItem.detail;
            statusItem.command = {
                title: Common.learnMore,
                command: 'vscode.open',
                arguments: [vscode.Uri.parse('https://aka.ms/AAdzyh4')],
            };
            return statusItem;
        }
        return undefined;
    }
}
