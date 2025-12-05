/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { WebClient, ConversationsHistoryResponse, ConversationsListResponse, UsersInfoResponse } from '@slack/web-api';
import { SlackMessage } from './slackTreeDataProvider';
import { SLACK_AUTH_PROVIDER_ID_EXPORT } from './slackAuthenticationProvider';

const SLACK_CHANNEL_ID_KEY = 'slack-channel-id';
const CODE_REVIEW_CHANNEL_NAME = 'codereview';

export class SlackService {
    private client: WebClient | undefined;
    private userCache: Map<string, string> = new Map();
    private prCache: Map<string, { title: string; author?: string; owner?: string; repo?: string; number?: number; additions?: number; deletions?: number; changedFiles?: number }> = new Map();
    private cachedChannelId: string | undefined;
    private githubToken: string | undefined;

    constructor(private context: vscode.ExtensionContext) { }

    /**
     * Get GitHub token from VS Code's built-in GitHub authentication
     */
    private async getGitHubToken(): Promise<string | undefined> {
        if (this.githubToken) {
            return this.githubToken;
        }

        try {
            // First try to get existing session silently
            let session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false, silent: true });

            // If no session exists, prompt the user to sign in
            if (!session) {
                session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
            }

            if (session) {
                this.githubToken = session.accessToken;
                console.log('GitHub token obtained successfully');
                return this.githubToken;
            }
        } catch (error) {
            console.error('GitHub authentication failed:', error);
        }
        return undefined;
    }

    async getSession(createIfNone: boolean = false): Promise<vscode.AuthenticationSession | undefined> {
        try {
            // Use silent: true when not creating to avoid VS Code showing "Sign in" prompt in Accounts menu
            const session = await vscode.authentication.getSession(
                SLACK_AUTH_PROVIDER_ID_EXPORT,
                [],
                { createIfNone, silent: !createIfNone }
            );

            if (session) {
                this.client = new WebClient(session.accessToken);
            }

            return session;
        } catch (error) {
            console.error('Failed to get Slack session:', error);
            return undefined;
        }
    }

    async isAuthenticated(): Promise<boolean> {
        const session = await this.getSession(false);
        return !!session;
    }

    async signIn(): Promise<boolean> {
        try {
            const session = await this.getSession(true);
            return !!session;
        } catch {
            return false;
        }
    }

    async signOut(): Promise<void> {
        const session = await this.getSession(false);
        if (session) {
            // Clear stored channel
            await this.context.secrets.delete(SLACK_CHANNEL_ID_KEY);
            this.client = undefined;
            this.userCache.clear();
            this.cachedChannelId = undefined;

            // Note: The actual session removal is handled by the authentication provider
            // when the user clicks "Sign Out" in the accounts menu
            vscode.window.showInformationMessage('Signed out from Slack. Use the Accounts menu to complete sign out.');
        }
    }

    /**
     * Automatically finds the code-review channel by name.
     * Stores the channel ID for future use.
     */
    async findCodeReviewChannel(): Promise<string | undefined> {
        const session = await this.getSession(false);
        if (!session) {
            return undefined;
        }

        this.client = new WebClient(session.accessToken);

        try {
            let cursor: string | undefined;

            do {
                const result: ConversationsListResponse = await this.client.conversations.list({
                    types: 'public_channel,private_channel',
                    limit: 200,
                    cursor: cursor
                });

                if (result.channels) {
                    for (const channel of result.channels) {
                        if (channel.id && channel.name === CODE_REVIEW_CHANNEL_NAME) {
                            // Found the channel - store it
                            await this.context.secrets.store(SLACK_CHANNEL_ID_KEY, channel.id);
                            this.cachedChannelId = channel.id;
                            return channel.id;
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

    async getCodeReviewChannelId(): Promise<string | undefined> {
        // Check cache first
        if (this.cachedChannelId) {
            return this.cachedChannelId;
        }

        // Check stored value
        const storedId = await this.context.secrets.get(SLACK_CHANNEL_ID_KEY);
        if (storedId) {
            this.cachedChannelId = storedId;
            return storedId;
        }

        // Auto-find the code-review channel
        return await this.findCodeReviewChannel();
    }

    private async getUserName(userId: string): Promise<string> {
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

    async getMessages(): Promise<SlackMessage[]> {
        const session = await this.getSession(false);
        if (!session) {
            throw new Error('Not authenticated. Please sign in to Slack first.');
        }

        this.client = new WebClient(session.accessToken);

        const channelId = await this.getCodeReviewChannelId();
        if (!channelId) {
            throw new Error(`No channel named '#${CODE_REVIEW_CHANNEL_NAME}' found. Please create a channel with this name or invite the bot to it.`);
        }

        try {
            // Fetch channel history
            const result: ConversationsHistoryResponse = await this.client.conversations.history({
                channel: channelId,
                limit: 50 // Fetch last 50 messages
            });

            if (!result.messages) {
                return [];
            }

            const messages: SlackMessage[] = [];

            for (const msg of result.messages) {
                if (!msg.ts || !msg.user) {
                    continue;
                }

                const authorName = await this.getUserName(msg.user);
                const messageText = msg.text || '';
                const prUrl = this.extractPrUrl(messageText);
                const prInfo = prUrl ? await this.fetchPrInfo(prUrl) : undefined;

                const slackMessage: SlackMessage = {
                    id: msg.ts,
                    author: authorName,
                    text: messageText,
                    timestamp: this.slackTsToIso(msg.ts),
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
                messages.push(slackMessage);
            }

            return messages;
        } catch (error) {
            throw new Error(`Failed to fetch messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async fetchPrInfo(prUrl: string): Promise<{ title: string; author?: string; owner?: string; repo?: string; number?: number; additions?: number; deletions?: number; changedFiles?: number } | undefined> {
        // Check cache first
        if (this.prCache.has(prUrl)) {
            return this.prCache.get(prUrl);
        }

        try {
            // Try GitHub API
            const githubMatch = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
            if (githubMatch) {
                const [, owner, repo, prNumber] = githubMatch;
                console.log(`Fetching PR info for: ${owner}/${repo}#${prNumber}`);

                // Get GitHub token for authenticated requests (higher rate limit)
                const githubToken = await this.getGitHubToken();

                console.log('githubToken:', githubToken);
                const headers: Record<string, string> = {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'VS-Code-CodeReview-Extension'
                };

                if (githubToken) {
                    headers['Authorization'] = `Bearer ${githubToken}`;
                }

                const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
                    headers
                });

                if (response.ok) {
                    const data = await response.json() as { title: string; user?: { login: string }; additions?: number; deletions?: number; changed_files?: number };
                    const prInfo = {
                        title: data.title,
                        author: data.user?.login,
                        owner: owner,
                        repo: repo,
                        number: parseInt(prNumber, 10),
                        additions: data.additions,
                        deletions: data.deletions,
                        changedFiles: data.changed_files
                    };
                    console.log(`PR info fetched: title="${prInfo.title}", author="${prInfo.author}", +${prInfo.additions}/-${prInfo.deletions} in ${prInfo.changedFiles} files`);
                    this.prCache.set(prUrl, prInfo);
                    return prInfo;
                } else {
                    console.error(`Failed to fetch PR info: ${response.status} ${response.statusText}`);
                    // If API fails, extract PR number as fallback title
                    const fallbackInfo = {
                        title: `PR #${prNumber}`,
                        author: undefined,
                        owner: owner,
                        repo: repo,
                        number: parseInt(prNumber, 10)
                    };
                    this.prCache.set(prUrl, fallbackInfo);
                    return fallbackInfo;
                }
            }
            return undefined;
        } catch (error) {
            console.error('Failed to fetch PR info:', error);
            return undefined;
        }
    }

    private extractPrUrl(text: string): string | undefined {
        // Slack formats URLs as <url> or <url|display text>
        // First, try to extract URLs from Slack's format
        const slackUrlPattern = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>|(?:^|\s)(https?:\/\/[^\s<]+)/g;

        // Common PR URL patterns
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

    private slackTsToIso(ts: string): string {
        // Slack timestamps are in format "1234567890.123456"
        const seconds = parseFloat(ts);
        return new Date(seconds * 1000).toISOString();
    }
}
