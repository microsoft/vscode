/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebClient, ConversationsHistoryResponse, ConversationsListResponse, UsersInfoResponse } from '@slack/web-api';
import { SlackMessage } from './treeDataProvider';
import { SLACK_AUTH_PROVIDER_ID_EXPORT } from './authenticationProvider';
import { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse';

const SLACK_CODE_REVIEW_CHANNEL_ID_KEY = 'slack-code-review-channel-id';
const CODE_REVIEW_CHANNEL_NAME = 'codereview';

interface IPullRequest {
    title: string;
    owner: string;
    repo: string;
    number: number;
    author?: string;
    additions?: number;
    deletions?: number;
    changedFiles?: number
}

interface IFetchedPullRequestInfo {
    title: string;
    user?: { login: string };
    additions?: number;
    deletions?: number;
    changed_files?: number;
}

export class SlackService {

    private client: WebClient | undefined;
    private session: vscode.AuthenticationSession | undefined;

    private userCache: Map<string, string> = new Map();
    private prCache: Map<string, IPullRequest> = new Map();

    private cachedChannelId: string | undefined;
    private githubToken: string | undefined;

    constructor(private readonly _context: vscode.ExtensionContext) {
        vscode.authentication.onDidChangeSessions(async (e) => {
            if (e.provider.id !== 'slack') {
                return;
            }
            this._updateSession();
        });
    }

    public async isAuthenticated(): Promise<boolean> {
        return !!this.session;
    }

    public async signIn(): Promise<boolean> {
        try {
            await this._updateSession(true);
            return this.isAuthenticated();
        } catch {
            return false;
        }
    }

    public async onSignOut(): Promise<void> {
        await this._context.secrets.delete(SLACK_CODE_REVIEW_CHANNEL_ID_KEY);
        this.client = undefined;
        this.userCache.clear();
        this.cachedChannelId = undefined;
    }

    public async getMessages(): Promise<SlackMessage[]> {
        if (!this.client) {
            return [];
        }
        const channelId = await this._getCodeReviewChannelId();
        if (!channelId) {
            return [];
        }
        try {
            const result: ConversationsHistoryResponse = await this.client.conversations.history({
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

    // ---

    private async _toSlackMessage(message: MessageElement): Promise<SlackMessage | undefined> {
        if (!message.ts || !message.user) {
            return undefined;
        }
        const text = message.text || '';
        const prUrl = this._extractPrUrl(text);
        const timestamp = this._slackTsToIso(message.ts);
        const author = await this._getUserName(message.user);
        const prInfo = await this._fetchCachedPullRequestInfo(prUrl);
        const slackMessage: SlackMessage = {
            id: message.ts,
            author,
            text,
            timestamp,
            prUrl: prUrl,
            prTitle: prInfo?.title,
            prAuthor: prInfo?.author,
            prOwner: prInfo?.owner,
            prRepo: prInfo?.repo,
            prNumber: prInfo?.number,
            prAdditions: prInfo?.additions,
            prDeletions: prInfo?.deletions,
            prChangedFiles: prInfo?.changedFiles,
        };
        return slackMessage;
    }

    private async _updateSession(createIfNone: boolean = false) {
        try {
            this.session = await vscode.authentication.getSession(SLACK_AUTH_PROVIDER_ID_EXPORT, [], { createIfNone, silent: true });
            this.client = this.session ? new WebClient(this.session.accessToken) : undefined;
        } catch (error) {
            console.error('Failed to update Slack session:', error);
        }
    }

    private async _getGitHubToken(): Promise<string | undefined> {
        if (this.githubToken) {
            return this.githubToken;
        }
        try {
            const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true, silent: true });
            this.githubToken = session.accessToken;
            return this.githubToken;
        } catch (error) {
            console.error('GitHub authentication failed:', error);
        }
        return undefined;
    }

    private async _getCodeReviewChannelId(): Promise<string | undefined> {
        if (this.cachedChannelId) {
            return this.cachedChannelId;
        }
        const storedId = await this._context.secrets.get(SLACK_CODE_REVIEW_CHANNEL_ID_KEY);
        if (storedId) {
            this.cachedChannelId = storedId;
            return this.cachedChannelId;
        }
        return this._findCodeReviewChannel();
    }

    private async _findCodeReviewChannel(): Promise<string | undefined> {
        if (!this.client) {
            return undefined;
        }
        try {
            let cursor: string | undefined;
            do {
                const result: ConversationsListResponse = await this.client.conversations.list({
                    types: 'private_channel',
                    limit: 200,
                    cursor: cursor
                });
                if (result.channels) {
                    for (const channel of result.channels) {
                        if (channel.id && channel.name === CODE_REVIEW_CHANNEL_NAME) {
                            await this._context.secrets.store(SLACK_CODE_REVIEW_CHANNEL_ID_KEY, channel.id);
                            this.cachedChannelId = channel.id;
                            return this.cachedChannelId;
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

    private async _getUserName(userId: string): Promise<string> {
        if (this.userCache.has(userId)) {
            return this.userCache.get(userId)!;
        }
        if (!this.client) {
            return userId;
        }
        try {
            const result: UsersInfoResponse = await this.client.users.info({ user: userId });
            const name = result.user?.real_name || result.user?.name || userId;
            this.userCache.set(userId, name);
            return name;
        } catch {
            return userId;
        }
    }

    private async _fetchCachedPullRequestInfo(prUrl: string | undefined): Promise<IPullRequest | undefined> {
        if (!prUrl) {
            return undefined;
        }
        if (this.prCache.has(prUrl)) {
            return this.prCache.get(prUrl);
        }
        try {
            const prInfo = await this._fetchPullRequestInfo(prUrl);
            if (!prInfo) {
                return undefined;
            }
            this.prCache.set(prUrl, prInfo);
            return prInfo;
        } catch (error) {
            console.error('Failed to fetch PR info:', error);
            return undefined;
        }
    }

    private async _fetchPullRequestInfo(prUrl: string): Promise<IPullRequest | undefined> {
        const githubMatch = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
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
        if (response.ok) {
            const data = await response.json() as IFetchedPullRequestInfo;
            return {
                title: data.title,
                author: data.user?.login,
                owner: owner,
                repo: repo,
                number: parseInt(prNumber, 10),
                additions: data.additions,
                deletions: data.deletions,
                changedFiles: data.changed_files
            };
        }
        return {
            title: `PR #${prNumber}`,
            owner: owner,
            repo: repo,
            number: parseInt(prNumber, 10)
        };;
    }

    private _extractPrUrl(text: string): string | undefined {
        const slackUrlPattern = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>|(?:^|\s)(https?:\/\/[^\s<]+)/g;
        const prPattern = /github\.com\/[^/]+\/[^/]+\/pull\/\d+/;

        let match;
        while ((match = slackUrlPattern.exec(text)) !== null) {
            const url = match[1] || match[2];
            if (url) {
                if (prPattern.test(url)) {
                    return url;
                }
            }
        }
        // Also try to find URLs directly in the text (without Slack formatting)
        const directMatch = text.match(new RegExp(`https?://[^\\s]*${prPattern.source}[^\\s]*`));
        if (directMatch) {
            return directMatch[0];
        }
        return undefined;
    }

    private _slackTsToIso(ts: string): string {
        // Slack timestamps are in format "1234567890.123456"
        const seconds = parseFloat(ts);
        return new Date(seconds * 1000).toISOString();
    }
}
