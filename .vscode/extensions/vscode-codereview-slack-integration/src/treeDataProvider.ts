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
    prUrl?: string;
    prTitle?: string;
    prAuthor?: string;
    prOwner?: string;
    prRepo?: string;
    prNumber?: number;
    prAdditions?: number;
    prDeletions?: number;
    prChangedFiles?: number;
}

export class SlackMessageItem extends vscode.TreeItem {
    constructor(
        public readonly message: SlackMessage,
        collapsibleState: vscode.TreeItemCollapsibleState,
        isOpeningPr: boolean = false
    ) {
        // Use PR title as main label if available, otherwise use author
        const label = message.prTitle || message.author;
        super(label, collapsibleState);

        // Show PR author (GitHub handle) in description if PR, otherwise show timestamp
        if (message.prUrl) {
            this.description = message.prAuthor ? `@${message.prAuthor}` : message.author;
            // Show spinning icon when opening PR, otherwise show git-pull-request icon
            this.iconPath = isOpeningPr
                ? new vscode.ThemeIcon('loading~spin')
                : new vscode.ThemeIcon('git-pull-request');
        } else {
            this.iconPath = new vscode.ThemeIcon('comment');
        }

        this.tooltip = new vscode.MarkdownString();
        if (message.prUrl) {
            // PR message tooltip
            if (message.prAuthor) {
                this.tooltip.appendMarkdown(`**Author:** ${message.prAuthor}\n\n`);
            }
            if (message.prRepo) {
                this.tooltip.appendMarkdown(`**Repository:** ${message.prRepo}\n\n`);
            }
            if (message.prTitle) {
                this.tooltip.appendMarkdown(`**Title:** ${message.prTitle}\n\n`);
            }
            if (message.prNumber) {
                this.tooltip.appendMarkdown(`**PR Number:** ${message.prNumber}\n\n`);
            }
            this.tooltip.appendMarkdown(`**Changes:** ${message.prUrl}\n\n`);
            // Show additions, deletions, and changed files
            if (message.prAdditions !== undefined || message.prDeletions !== undefined || message.prChangedFiles !== undefined) {
                const additions = message.prAdditions ?? 0;
                const deletions = message.prDeletions ?? 0;
                const files = message.prChangedFiles ?? 0;
                this.tooltip.appendMarkdown(`**+${additions}**, **-${deletions}**, **${files} file${files !== 1 ? 's' : ''}**\n\n`);
            }
            this.tooltip.appendMarkdown(`_${this.formatTimestamp(message.timestamp)}_`);
        } else {
            // Regular message tooltip - show full message content
            this.tooltip.appendMarkdown(`**Author:** ${message.author}\n\n`);
            this.tooltip.appendMarkdown(`${message.text}\n\n`);
            this.tooltip.appendMarkdown(`_${this.formatTimestamp(message.timestamp)}_`);
        }

        // Use different contextValue when loading to show spinning icon
        if (message.prUrl) {
            this.contextValue = isOpeningPr ? 'slackMessageWithPrLoading' : 'slackMessageWithPr';
        } else {
            this.contextValue = 'slackMessage';
        }
    }

    private formatTimestamp(timestamp: string): string {
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

    private messages: SlackMessage[] = [];
    private isLoading: boolean = false;
    private errorMessage: string | undefined;
    private onMessageCountChanged?: (count: number) => void;
    private loadingPrMessageId: string | undefined;

    constructor(private slackService: SlackService) { }

    setLoadingPr(messageId: string | undefined): void {
        this.loadingPrMessageId = messageId;
        this.refresh();
    }

    isLoadingPr(messageId: string): boolean {
        return this.loadingPrMessageId === messageId;
    }

    setOnMessageCountChanged(callback: (count: number) => void): void {
        this.onMessageCountChanged = callback;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async fetchMessages(): Promise<void> {
        this.isLoading = true;
        this.errorMessage = undefined;
        this.refresh();

        try {
            this.messages = await this.slackService.getMessages();
        } catch (error) {
            this.errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.messages = [];
        } finally {
            this.isLoading = false;
            this.refresh();
            this.onMessageCountChanged?.(this.messages.length);
        }
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {

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

        return this.messages.map(msg => new SlackMessageItem(msg, vscode.TreeItemCollapsibleState.None, this.isLoadingPr(msg.id)));
    }

    setMessages(messages: SlackMessage[]): void {
        this.messages = messages;
        this.refresh();
    }

    getMessageCount(): number {
        return this.messages.length;
    }
}
