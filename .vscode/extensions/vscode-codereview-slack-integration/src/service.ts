/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebClient, ConversationsHistoryResponse, ConversationsListResponse, UsersInfoResponse } from '@slack/web-api';
import { SlackMessage } from './treeDataProvider';
import { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse';
import { SLACK_AUTH_PROVIDER_ID } from './authVariables';

const SLACK_CODE_REVIEW_CHANNEL_ID_KEY = 'slack-codereview-channel-id';
const CODE_REVIEW_CHANNEL_NAME = 'codereview';

interface IPullRequest {
    title: string;
    owner: string;
    repo: string;
    number: number;
    author?: string;
    additions?: number;
    deletions?: number;
    changedFiles?: number;
}

interface IFetchedPullRequestResponse {
    title?: string;
    user?: { login: string };
    additions?: number;
    deletions?: number;
    changed_files?: number;
}

export class SlackService {

    private _onSignIn: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onSignIn: vscode.Event<void> = this._onSignIn.event;

    private _onSignOut: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onSignOut: vscode.Event<void> = this._onSignOut.event;

    private readonly _userCache: Map<string, string> = new Map();
    private readonly _pullRequestCache: Map<string, IPullRequest> = new Map();

    private _client: Promise<WebClient | undefined> | undefined;
    private _cachedChannelId: string | undefined;
    private _githubToken: string | undefined;

    constructor(private readonly _context: vscode.ExtensionContext) {
        vscode.authentication.onDidChangeSessions(async (e) => {
            if (e.provider.id !== SLACK_AUTH_PROVIDER_ID) {
                return;
            }
            this._onSessionUpdate();
        });
        this._onSessionUpdate();
    }

    public async waitUntilAuthenticationStatus(): Promise<boolean> {
        return !!(await this._client);
    }

    public signIn(): void {
        this._onSessionUpdate(true);
    }

    public async getMessages(): Promise<SlackMessage[]> {
        const client = await this._client;
        if (!client) {
            return [];
        }
        const channelId = await this._getCodeReviewChannelId();
        if (!channelId) {
            return [];
        }
        try {
            const result: ConversationsHistoryResponse = await client.conversations.history({
                channel: channelId,
                limit: 100
            });
            if (!result.messages) {
                return [];
            }
            const messages: SlackMessage[] = [];
            for (const message of result.messages) {
                const slackMessage = await this._toSlackMessage(message);
                if (!slackMessage) {
                    continue;
                }
                messages.push(slackMessage);
            }
            return messages;
        } catch (error) {
            throw new Error(`Failed to fetch messages: ${error}`);
        }
    }

    private async _onSessionUpdate(createIfNone: boolean = false) {
        this._client = Promise.resolve(this._getSession(createIfNone)).then(session => {
            if (!session) {
                this._userCache.clear();
                this._pullRequestCache.clear();
                this._cachedChannelId = undefined;
                this._context.secrets.delete(SLACK_CODE_REVIEW_CHANNEL_ID_KEY);
                this._onSignOut.fire();
                return undefined;
            } else {
                this._onSignIn.fire();
                return new WebClient(session.accessToken);
            }
        });
    }

    private _getSession(createIfNone: boolean = false): Thenable<vscode.AuthenticationSession | undefined> {
        return vscode.authentication.getSession(SLACK_AUTH_PROVIDER_ID, [], { createIfNone });
    }

    private async _toSlackMessage(message: MessageElement): Promise<SlackMessage | undefined> {
        if (!message.ts || !message.user || !message.text) {
            return undefined;
        }
        const id = message.ts;
        const text = message.text;
        const prUrl = this._extractPullRequestUrl(text);
        const timestamp = this._timestampToISO(message.ts);
        const author = await this._getAuthor(message.user);
        if (!prUrl) {
            return {
                id,
                author,
                text,
                timestamp
            };
        }
        const pullRequest = await this._fetchCachedPullRequest(prUrl);
        if (!pullRequest) {
            return {
                id,
                author,
                text,
                timestamp
            };
        }
        const slackMessage: SlackMessage = {
            id,
            author,
            text,
            timestamp,
            pr: {
                url: prUrl,
                title: pullRequest.title,
                author: pullRequest.author,
                owner: pullRequest.owner,
                repo: pullRequest.repo,
                number: pullRequest.number,
                additions: pullRequest.additions,
                deletions: pullRequest.deletions,
                changedFiles: pullRequest.changedFiles,
            }
        };
        return slackMessage;
    }

    private async _getGitHubToken(): Promise<string | undefined> {
        if (this._githubToken) {
            return this._githubToken;
        }
        try {
            const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
            this._githubToken = session.accessToken;
            return this._githubToken;
        } catch (error) {
            console.log(`GitHub authentication failed: ${error}`);
        }
        return undefined;
    }

    private async _getCodeReviewChannelId(): Promise<string | undefined> {
        if (this._cachedChannelId) {
            return this._cachedChannelId;
        }
        const storedId = await this._context.secrets.get(SLACK_CODE_REVIEW_CHANNEL_ID_KEY);
        if (storedId) {
            this._cachedChannelId = storedId;
            return this._cachedChannelId;
        }
        return this._findCodeReviewChannel();
    }

    private async _findCodeReviewChannel(): Promise<string | undefined> {
        const client = await this._client;
        if (!client) {
            return undefined;
        }
        try {
            let cursor: string | undefined;
            do {
                const result: ConversationsListResponse = await client.conversations.list({
                    types: 'public_channel,private_channel',
                    limit: 200,
                    cursor: cursor
                });
                if (result.channels) {
                    for (const channel of result.channels) {
                        if (channel.id && channel.name === CODE_REVIEW_CHANNEL_NAME) {
                            await this._context.secrets.store(SLACK_CODE_REVIEW_CHANNEL_ID_KEY, channel.id);
                            this._cachedChannelId = channel.id;
                            return this._cachedChannelId;
                        }
                    }
                }
                cursor = result.response_metadata?.next_cursor;
            } while (cursor);
            return undefined;
        } catch (error) {
            console.error('Failed to find code-review channel:', error);
            return undefined;
        }
    }

    private async _getAuthor(userId: string): Promise<string> {
        if (this._userCache.has(userId)) {
            return this._userCache.get(userId)!;
        }
        const client = await this._client;
        if (!client) {
            return '';
        }
        try {
            const result: UsersInfoResponse = await client.users.info({ user: userId });
            const author = result.user?.real_name || result.user?.name || '';
            this._userCache.set(userId, author);
            return author;
        } catch {
            return '';
        }
    }

    private async _fetchCachedPullRequest(pullRequestUrl: string): Promise<IPullRequest | undefined> {
        if (this._pullRequestCache.has(pullRequestUrl)) {
            return this._pullRequestCache.get(pullRequestUrl);
        }
        try {
            const pullRequest = await this._fetchPullRequest(pullRequestUrl);
            if (!pullRequest) {
                return undefined;
            }
            this._pullRequestCache.set(pullRequestUrl, pullRequest);
            return pullRequest;
        } catch (error) {
            console.error('Failed to fetch PR info:', error);
            return undefined;
        }
    }

    private async _fetchPullRequest(pullRequestUrl: string): Promise<IPullRequest | undefined> {
        const githubMatch = pullRequestUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
        if (!githubMatch) {
            return undefined;
        }
        const [, owner, repo, prNumber] = githubMatch;
        const headers: Record<string, string> = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'VS-Code-CodeReview-Extension'
        };
        const githubToken = await this._getGitHubToken();
        if (githubToken) {
            headers['Authorization'] = `Bearer ${githubToken}`;
        }
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
            headers
        });
        const parsedPrNumber = parseInt(prNumber, 10);
        if (response.ok) {
            const data = await response.json() as IFetchedPullRequestResponse;
            return {
                owner: owner,
                repo: repo,
                number: parsedPrNumber,
                title: data.title || `PR #${prNumber}`,
                author: data.user?.login,
                additions: data.additions,
                deletions: data.deletions,
                changedFiles: data.changed_files
            };
        }
        return {
            title: `PR #${prNumber}`,
            owner: owner,
            repo: repo,
            number: parsedPrNumber
        };
    }

    private _extractPullRequestUrl(text: string): string | undefined {
        // Single pattern that matches GitHub PR URLs in both Slack-formatted (<url|text>) and plain text
        const match = text.match(/<(https?:\/\/[^|>]*github\.com\/[^/]+\/[^/]+\/pull\/\d+[^|>]*)(?:\|[^>]*)?>|(https?:\/\/\S*github\.com\/[^/]+\/[^/]+\/pull\/\d+\S*)/);
        return match ? (match[1] || match[2]) : undefined;
    }

    private _timestampToISO(ts: string): string {
        // Slack timestamps are in format "1234567890.123456"
        const seconds = parseFloat(ts);
        return new Date(seconds * 1000).toISOString();
    }
}
