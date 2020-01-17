/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Disposable, TimelineItem, TimelineProvider, Uri, workspace, ThemeIcon } from 'vscode';
import { Model } from './model';

export class GitTimelineProvider implements TimelineProvider {
	readonly source = 'git-history';
	readonly sourceDescription = 'Git History';

	private _disposable: Disposable;

	constructor(private readonly _model: Model) {
		this._disposable = workspace.registerTimelineProvider('*', this);
	}

	dispose() {
		this._disposable.dispose();
	}

	async provideTimeline(uri: Uri, _since: number, _token: CancellationToken): Promise<TimelineItem[]> {
		const repo = this._model.getRepository(uri);
		if (!repo) {
			return [];
		}

		const commits = await repo.logFile(uri, { maxEntries: 10 });
		return commits.map<TimelineItem>(c => {
			let message = c.message;

			const index = message.indexOf('\n');
			if (index !== -1) {
				message = `${message.substring(0, index)} \u2026`;
			}

			return {
				id: c.hash,
				date: c.authorDate?.getTime() ?? 0,
				iconPath: new ThemeIcon('git-commit'),
				label: message,
				description: `${c.authorName} (${c.authorEmail}) \u2022 ${c.hash.substr(0, 8)}`,
				detail: `${c.authorName} (${c.authorEmail})\n${c.authorDate}\n\n${c.message}`,
				command: {
					title: 'Open Diff',
					command: 'git.openDiff',
					arguments: [uri, c.hash]
				}
			};
		});
	}
}
