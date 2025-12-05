/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SlackService } from './service';

export interface SlackMessage {
    id: string;
    author: string;
    text: string;
    timestamp: string;
    pr?: {
        url: string;
        title: string;
        owner: string;
        repo: string;
        number: number;
        author?: string;
        additions?: number;
        deletions?: number;
        changedFiles?: number;
    }
}

export class SlackMessageItem extends vscode.TreeItem {

    public readonly message: SlackMessage;

    constructor(
        message: SlackMessage,
        collapsibleState: vscode.TreeItemCollapsibleState,
        isOpeningPr: boolean = false
    ) {
        const label = message.pr?.title || message.author;
        super(label, collapsibleState);

        this.message = message;
        this._setDescription(message);
        this._setTooltip(message);
        this._setIcon(message, isOpeningPr);
        this._setContextValue(message, isOpeningPr);
    }

    private _setDescription(message: SlackMessage) {
        if (message.pr) {
            this.description = message.pr ? `@${message.pr.author}` : message.author;
        }
    }

    private _setIcon(message: SlackMessage, isOpeningPr: boolean) {
        if (message.pr) {
            this.iconPath = isOpeningPr
                ? new vscode.ThemeIcon('loading~spin')
                : new vscode.ThemeIcon('git-pull-request');
        } else {
            this.iconPath = new vscode.ThemeIcon('comment');
        }
    }

    private _setTooltip(message: SlackMessage) {
        const pr = message.pr;
        this.tooltip = new vscode.MarkdownString();
        if (pr) {
            if (pr.author) {
                this.tooltip.appendMarkdown(`**Author:** ${pr.author}\n\n`);
            }
            this.tooltip.appendMarkdown(`**Repository:** ${pr.repo}\n\n`);
            this.tooltip.appendMarkdown(`**Title:** ${pr.title}\n\n`);
            this.tooltip.appendMarkdown(`**PR Number:** ${pr.number}\n\n`);
            this.tooltip.appendMarkdown(`**File Changes:** ${pr.url}\n\n`);
            if (pr.additions !== undefined && pr.deletions !== undefined && pr.changedFiles !== undefined) {
                this.tooltip.appendMarkdown(`**+${pr.additions}**, **-${pr.deletions}**, **${pr.changedFiles} file${pr.changedFiles !== 1 ? 's' : ''}**\n\n`);
            }
            this.tooltip.appendMarkdown(`_${this._formatTimestamp(message.timestamp)}_`);
        } else {
            this.tooltip.appendMarkdown(`**Author:** ${message.author}\n\n`);
            this.tooltip.appendMarkdown(`${message.text}\n\n`);
            this.tooltip.appendMarkdown(`_${this._formatTimestamp(message.timestamp)}_`);
        }
    }

    private _setContextValue(message: SlackMessage, isOpeningPr: boolean) {
        if (message.pr) {
            this.contextValue = isOpeningPr ? 'slackMessageWithPrLoading' : 'slackMessageWithPr';
        } else {
            this.contextValue = 'slackMessage';
        }
    }

    private _formatTimestamp(timestamp: string): string {
        const date = new Date(timestamp);
        return date.toLocaleString();
    }
}

export class SignInItem extends vscode.TreeItem {
    constructor() {
        super('Sign in to Slack', vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: 'vs-code-codereview.signIn',
            title: 'Sign in to Slack'
        };
        this.iconPath = new vscode.ThemeIcon('sign-in');
    }
}

export class LoadingItem extends vscode.TreeItem {
    constructor() {
        super('Loading messages...', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('loading~spin');
    }
}

export class ErrorItem extends vscode.TreeItem {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('error');
    }
}

export class NoMessagesItem extends vscode.TreeItem {
    constructor() {
        super('No messages in this channel', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('info');
    }
}

type TreeItem = SlackMessageItem | SignInItem | LoadingItem | ErrorItem | NoMessagesItem;

export class SlackTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _onDidChangeMessageCount: vscode.EventEmitter<number> = new vscode.EventEmitter<number>();
    readonly onDidChangeMessageCount: vscode.Event<number> = this._onDidChangeMessageCount.event;

    private messages: SlackMessage[] = [];
    private isLoading: boolean = false;
    private errorMessage: string | undefined;
    private loadingPrMessageId: string | undefined;

    constructor(private slackService: SlackService) { }

    public setLoadingPR(messageId: string | undefined): void {
        this.loadingPrMessageId = messageId;
    }

    private _isLoadingPR(messageId: string): boolean {
        return this.loadingPrMessageId === messageId;
    }

    public async fetchMessages(): Promise<void> {
        this.isLoading = true;
        this.errorMessage = undefined;

        try {
            this.messages = await this.slackService.getMessages();
        } catch (error) {
            this.errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.messages = [];
        } finally {
            this.isLoading = false;
            this._onDidChangeTreeData.fire();
            this._onDidChangeMessageCount.fire(this.messages.length);
        }
    }

    public getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    public async getChildren(element?: TreeItem): Promise<TreeItem[]> {

        // For non-message elements or when expanding other items, return empty
        if (element) {
            return [];
        }

        // Check authentication status
        const isAuthenticated = await this.slackService.isAuthenticated();
        if (!isAuthenticated) {
            return [new SignInItem()];
        }

        // Show loading state
        if (this.isLoading) {
            return [new LoadingItem()];
        }

        // Show error state
        if (this.errorMessage) {
            return [new ErrorItem(this.errorMessage)];
        }

        // Show messages or empty state
        if (this.messages.length === 0) {
            return [new NoMessagesItem()];
        }

        return this.messages.map(msg => new SlackMessageItem(msg, vscode.TreeItemCollapsibleState.None, this._isLoadingPR(msg.id)));
    }
}
