/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocumentContentProvider, Uri, workspace } from 'vscode';
import { Model } from './model';

export class GitMergeShowContentProvider implements TextDocumentContentProvider {

	static readonly Scheme = 'git-show';

	readonly dispose: () => void;

	constructor(private model: Model) {
		const reg = workspace.registerTextDocumentContentProvider(GitMergeShowContentProvider.Scheme, this);
		this.dispose = reg.dispose.bind(reg);
	}

	async provideTextDocumentContent(uri: Uri): Promise<string | undefined> {
		await this.model.isInitialized;

		const repository = this.model.getRepository(uri);
		if (!repository) {
			return undefined;
		}

		if (!/^:[123]$/.test(uri.query)) {
			return undefined;
		}

		try {
			return await repository.show(uri.query, uri.fsPath);
		} catch (error) {
			console.error(error);
			return undefined;
		}
	}
}

export function toMergeUris(uri: Uri): { base: Uri; ours: Uri; theirs: Uri } {
	return {
		base: uri.with({ scheme: GitMergeShowContentProvider.Scheme, query: ':1' }),
		ours: uri.with({ scheme: GitMergeShowContentProvider.Scheme, query: ':2' }),
		theirs: uri.with({ scheme: GitMergeShowContentProvider.Scheme, query: ':3' }),
	};
}
