/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { IGitService } from '../../../platform/git/common/gitService';
import { toGitUri } from '../../../platform/git/common/utils';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IMergeConflictService } from '../common/mergeConflictService';
import { MergeConflictParser } from './mergeConflictParser';

type HistoryItemChange = { uri: vscode.Uri; historyItemId: string };
type HistoryItemChangeRange = { start: HistoryItemChange; end: HistoryItemChange };

export class MergeConflictServiceImpl extends Disposable implements IMergeConflictService {
	readonly _serviceBrand: undefined;

	constructor(
		@IGitService private readonly gitService: IGitService,
		@IIgnoreService private readonly ignoreService: IIgnoreService
	) {
		super();
	}

	async resolveMergeConflicts(resources: vscode.Uri[], cancellationToken: vscode.CancellationToken | undefined): Promise<void> {
		if (cancellationToken?.isCancellationRequested) {
			return;
		}

		// Attachments
		const attachFiles: vscode.Uri[] = [];
		const attachHistoryItemChanges: HistoryItemChange[] = [];
		const attachHistoryItemChangeRanges: HistoryItemChangeRange[] = [];

		for (const resource of resources) {
			// Copilot ignored
			if (await this.ignoreService.isCopilotIgnored(resource, cancellationToken)) {
				continue;
			}

			// No merge conflicts
			const textDocument = await vscode.workspace.openTextDocument(resource);
			if (!MergeConflictParser.containsConflict(textDocument)) {
				continue;
			}

			const conflicts = MergeConflictParser.scanDocument(textDocument);
			if (conflicts.length === 0) {
				continue;
			}

			// Attach file
			attachFiles.push(resource);

			const currentName = conflicts[0].current.name;
			const incomingName = conflicts[0].incoming.name;

			// Get merge base
			const mergeBase = await this.gitService.getMergeBase(resource, currentName, incomingName);
			if (mergeBase) {
				// Attach merge base
				attachHistoryItemChanges.push({
					uri: toGitUri(resource, mergeBase),
					historyItemId: mergeBase
				});

				// Attach merge base -> current
				attachHistoryItemChangeRanges.push({
					start: {
						uri: toGitUri(resource, mergeBase),
						historyItemId: mergeBase
					},
					end: {
						uri: toGitUri(resource, currentName),
						historyItemId: currentName
					}
				});

				// Attach merge base -> incoming
				attachHistoryItemChangeRanges.push({
					start: {
						uri: toGitUri(resource, mergeBase),
						historyItemId: mergeBase
					},
					end: {
						uri: toGitUri(resource, incomingName),
						historyItemId: incomingName
					}
				});
			}
		}

		if (cancellationToken?.isCancellationRequested) {
			return;
		}

		if (attachFiles.length > 0) {
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				mode: 'agent',
				attachFiles,
				attachHistoryItemChanges,
				attachHistoryItemChangeRanges,
				query: 'Resolve all merge conflicts'
			});
		}
	}
}

export class TestMergeConflictServiceImpl implements IMergeConflictService {
	_serviceBrand: undefined;

	async resolveMergeConflicts(resources: vscode.Uri[], cancellationToken: vscode.CancellationToken | undefined): Promise<void> { }
}