/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LinkPresentation } from '@vscode/markdown-editor';
import type { IObservable } from '@vscode/observables';
import * as vscode from 'vscode';
import { createAsyncLinkPresentation, type LinkPresentationResolver, type LinkPresentationResolverContext } from './linkPresentationResolver';

export class WorkspaceLinkPresentationResolver implements LinkPresentationResolver {
	readonly refreshOnInterval = true;
	readonly #onDidChangeWorkspaceResource = new vscode.EventEmitter<void>();
	readonly #subscriptions: vscode.Disposable;
	#gitApi: Promise<GitApi | undefined> | undefined;

	constructor() {
		const refresh = () => this.#onDidChangeWorkspaceResource.fire();
		this.#subscriptions = vscode.Disposable.from(
			vscode.workspace.onDidCreateFiles(refresh),
			vscode.workspace.onDidDeleteFiles(refresh),
			vscode.workspace.onDidRenameFiles(refresh),
			vscode.workspace.onDidSaveTextDocument(refresh),
		);
	}

	resolve(href: string, context: LinkPresentationResolverContext): IObservable<LinkPresentation> | undefined {
		if (!isWorkspaceResourceLink(href)) {
			return undefined;
		}
		return createAsyncLinkPresentation(
			href,
			{
				kind: 'file',
				status: { kind: 'pending', label: vscode.l10n.t("Loading") },
			},
			context,
			() => this.#resolve(href),
			error => ({
				kind: 'file',
				status: { kind: 'error', label: vscode.l10n.t("Not found") },
				tooltip: error instanceof Error ? error.message : vscode.l10n.t("The workspace resource could not be resolved."),
				ariaLabel: vscode.l10n.t("Workspace resource could not be resolved: {0}", href),
			}),
			[context.onDidRequestRefresh, this.#onDidChangeWorkspaceResource.event],
		);
	}

	dispose(): void {
		this.#subscriptions.dispose();
		this.#onDidChangeWorkspaceResource.dispose();
	}

	async #resolve(href: string): Promise<LinkPresentation> {
		const uri = vscode.Uri.parse(href);
		const stat = await vscode.workspace.fs.stat(uri);
		return this.#present(uri, stat.type === vscode.FileType.Directory ? 'folder' : 'file');
	}

	async #present(uri: vscode.Uri, kind: 'file' | 'folder'): Promise<LinkPresentation> {
		const label = vscode.workspace.asRelativePath(uri, false);
		const repository = await this.#getGitApi().then(api => api?.getRepository(uri) ?? undefined);
		const branch = repository?.state.HEAD?.name;
		const changed = repository ? repositoryChangeCount(repository) : 0;
		const isRepositoryRoot = kind === 'folder' && repository?.rootUri.fsPath === uri.fsPath;
		if (isRepositoryRoot) {
			const detail = [branch, changed ? `${changed} changes` : 'clean'].filter((value): value is string => !!value).join(' · ');
			return {
				kind: 'repository',
				...(detail ? { detail } : {}),
				status: branch ? { kind: changed ? 'warning' : 'success', label: branch } : undefined,
				tooltip: uri.toString(true),
				ariaLabel: `Local repository ${label}${branch ? ` on branch ${branch}` : ''}, ${changed ? `${changed} changes` : 'clean'}`,
			};
		}

		const details = [
			compactParent(label),
			branch,
			repository && repositoryContainsChange(repository, uri) ? 'modified' : undefined,
		].filter((value): value is string => !!value);
		return {
			kind,
			...(details.length ? { detail: details.join(' · ') } : {}),
			tooltip: uri.toString(true),
			ariaLabel: `${kind === 'folder' ? 'Folder' : 'File'} ${label}`,
		};
	}

	#getGitApi(): Promise<GitApi | undefined> {
		this.#gitApi ??= (async () => {
			const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
			const git = await extension?.activate();
			return git?.enabled ? git.getAPI(1) : undefined;
		})();
		return this.#gitApi;
	}
}

function isWorkspaceResourceLink(href: string): boolean {
	return /^(?:file|vscode-remote|vscode-vfs):/i.test(href);
}

interface GitExtension {
	readonly enabled: boolean;
	getAPI(version: 1): GitApi;
}

interface GitApi {
	getRepository(uri: vscode.Uri): GitRepository | null;
}

interface GitRepository {
	readonly rootUri: vscode.Uri;
	readonly state: {
		readonly HEAD?: { readonly name?: string };
		readonly mergeChanges: readonly GitChange[];
		readonly indexChanges: readonly GitChange[];
		readonly workingTreeChanges: readonly GitChange[];
		readonly untrackedChanges: readonly GitChange[];
	};
}

interface GitChange {
	readonly uri: vscode.Uri;
}

function repositoryChangeCount(repository: GitRepository): number {
	const state = repository.state;
	return state.mergeChanges.length
		+ state.indexChanges.length
		+ state.workingTreeChanges.length
		+ state.untrackedChanges.length;
}

function repositoryContainsChange(repository: GitRepository, uri: vscode.Uri): boolean {
	const key = uri.toString();
	const state = repository.state;
	return [
		...state.mergeChanges,
		...state.indexChanges,
		...state.workingTreeChanges,
		...state.untrackedChanges,
	].some(change => change.uri.toString() === key);
}

function relativeParent(value: string): string | undefined {
	const separator = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
	return separator > 0 ? value.slice(0, separator) : undefined;
}

function compactParent(value: string): string | undefined {
	const parent = relativeParent(value);
	if (!parent) {
		return undefined;
	}
	if (!/^(?:[a-z]:[\\/]|[\\/])/i.test(parent)) {
		return parent;
	}
	return parent.split(/[\\/]+/).filter(Boolean).slice(-4).join('/');
}
