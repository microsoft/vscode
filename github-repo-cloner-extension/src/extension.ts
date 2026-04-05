/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

interface GitHubRepository {
	full_name: string;
	description: string | null;
	stargazers_count: number;
	clone_url: string;
	html_url: string;
}

interface GitHubSearchResponse {
	items: GitHubRepository[];
}

interface HttpResponse {
	statusCode: number;
	body: string;
}

class PlaceholderTreeItem extends vscode.TreeItem {
	constructor(label: string) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.contextValue = 'placeholder';
		this.iconPath = new vscode.ThemeIcon('info');
		this.accessibilityInformation = { label };
	}
}

class RepositoryTreeItem extends vscode.TreeItem {
	constructor(readonly repository: GitHubRepository) {
		super(repository.full_name, vscode.TreeItemCollapsibleState.None);
		this.description = `${repository.stargazers_count.toLocaleString()} stars`;
		this.tooltip = new vscode.MarkdownString([
			`**${repository.full_name}**`,
			'',
			repository.description ?? 'No description provided.',
			'',
			`Clone URL: ${repository.clone_url}`
		].join('\n'));
		this.contextValue = 'repository';
		this.iconPath = new vscode.ThemeIcon('repo');
		this.command = {
			command: 'githubRepoCloner.cloneRepository',
			title: 'Clone Repository',
			arguments: [this]
		};
		this.accessibilityInformation = {
			label: `${repository.full_name}. ${repository.description ?? 'No description.'} ${repository.stargazers_count.toLocaleString()} stars.`
		};
	}
}

class GitHubRepositoryDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private repositories: GitHubRepository[] = [];
	private lastQuery: string | undefined;
	private searching = false;

	async search(queryFromCommand?: string): Promise<void> {
		const input = queryFromCommand ?? await vscode.window.showInputBox({
			prompt: 'Search public GitHub repositories',
			placeHolder: 'react, vscode, rust, machine learning',
			ignoreFocusOut: true,
			value: this.lastQuery ?? ''
		});

		if (typeof input !== 'string') {
			return;
		}

		const query = input.trim();
		if (!query) {
			vscode.window.showWarningMessage('Enter a search query to find public repositories.');
			return;
		}

		this.lastQuery = query;
		this.searching = true;
		this._onDidChangeTreeData.fire();

		try {
			this.repositories = await searchPublicRepositories(query);
			if (this.repositories.length === 0) {
				vscode.window.showInformationMessage(`No public repositories found for "${query}".`);
			}
		} catch (error) {
			this.repositories = [];
			vscode.window.showErrorMessage(`GitHub search failed: ${toErrorMessage(error)}`);
		} finally {
			this.searching = false;
			this._onDidChangeTreeData.fire();
		}
	}

	refresh(): void {
		if (this.lastQuery) {
			void this.search(this.lastQuery);
			return;
		}

		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (element) {
			return [];
		}

		if (this.searching) {
			return [new PlaceholderTreeItem('Searching public GitHub repositories...')];
		}

		if (!this.lastQuery) {
			return [new PlaceholderTreeItem('Run "Search Repositories" to get started.')];
		}

		if (this.repositories.length === 0) {
			return [new PlaceholderTreeItem(`No repositories found for "${this.lastQuery}".`)];
		}

		return this.repositories.map(repository => new RepositoryTreeItem(repository));
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const dataProvider = new GitHubRepositoryDataProvider();
	const treeView = vscode.window.createTreeView('githubRepoCloner.repositories', {
		treeDataProvider: dataProvider,
		showCollapseAll: false
	});
	context.subscriptions.push(treeView);

	context.subscriptions.push(vscode.commands.registerCommand('githubRepoCloner.searchRepositories', async () => {
		await dataProvider.search();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('githubRepoCloner.refreshRepositories', async () => {
		dataProvider.refresh();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('githubRepoCloner.cloneRepository', async (item?: RepositoryTreeItem) => {
		if (!item) {
			vscode.window.showInformationMessage('Choose a repository result first, then run clone.');
			return;
		}

		const availableCommands = await vscode.commands.getCommands(true);
		if (!availableCommands.includes('git.clone')) {
			vscode.window.showErrorMessage('Git extension command "git.clone" was not found.');
			return;
		}

		await vscode.commands.executeCommand('git.clone', item.repository.clone_url);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('githubRepoCloner.openRepository', async (item?: RepositoryTreeItem) => {
		if (!item) {
			vscode.window.showInformationMessage('Choose a repository result first, then open it.');
			return;
		}

		await vscode.env.openExternal(vscode.Uri.parse(item.repository.html_url));
	}));
}

export function deactivate(): void {
}

async function searchPublicRepositories(query: string): Promise<GitHubRepository[]> {
	const searchQuery = `${query} in:name,description`;
	const params = new URLSearchParams({
		q: searchQuery,
		per_page: '30',
		sort: 'stars',
		order: 'desc'
	});
	const requestUrl = `https://api.github.com/search/repositories?${params.toString()}`;
	const response = await doGetRequest(requestUrl);

	if (response.statusCode < 200 || response.statusCode > 299) {
		throw new Error(parseGitHubError(response));
	}

	const parsed = safeJsonParse(response.body) as GitHubSearchResponse | undefined;
	if (!parsed || !Array.isArray(parsed.items)) {
		throw new Error('GitHub returned an unexpected response body.');
	}

	return parsed.items.filter(item => Boolean(item.clone_url));
}

async function doGetRequest(url: string): Promise<HttpResponse> {
	const response = await fetch(url, {
		method: 'GET',
		headers: {
			Accept: 'application/vnd.github+json',
			'User-Agent': 'vscode-github-public-repo-cloner'
		}
	});

	const body = await response.text();
	return {
		statusCode: response.status,
		body
	};
}

function parseGitHubError(response: HttpResponse): string {
	if (response.statusCode === 403) {
		return 'GitHub API rate limit reached. Wait a bit and try again.';
	}

	const parsed = safeJsonParse(response.body) as { message?: string } | undefined;
	if (parsed?.message) {
		return `${parsed.message} (HTTP ${response.statusCode})`;
	}

	return `GitHub request failed with HTTP ${response.statusCode}.`;
}

function safeJsonParse(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return 'Unknown error.';
}
