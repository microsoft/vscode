/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { ILogService } from '../../../platform/log/common/logService';
import { IReviewService } from '../../../platform/review/common/reviewService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import * as path from '../../../util/vs/base/common/path';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { FeedbackGenerator } from '../../prompt/node/feedbackGenerator';
import { CurrentChange } from '../../prompts/node/feedback/currentChange';

const maxRequests = 10;
const maxRequestsInterval = 5 * 60 * 1000;
const requestDelay = 10 * 1000;
let requestTimes: number[] = [];

export function startFeedbackCollection(accessor: ServicesAccessor) {
	const configurationService = accessor.get(IConfigurationService);
	const reviewService = accessor.get(IReviewService);
	const instantiationService = accessor.get(IInstantiationService);
	const logService = accessor.get(ILogService);
	const disposables = new DisposableStore();
	const enabled = configurationService.getConfig(ConfigKey.Advanced.FeedbackOnChange);
	if (!enabled) {
		return disposables;
	}
	const collection = reviewService.getDiagnosticCollection();
	const feedbackGenerator = instantiationService.createInstance(FeedbackGenerator);
	disposables.add(vscode.workspace.onDidChangeTextDocument(async event => {
		if (event.document.uri.scheme === 'file' && event.contentChanges.length && event.document === vscode.window.activeTextEditor?.document) {
			try {
				logService.warn('Document changed, delaying diagnostics request');
				const version = event.document.version;
				await new Promise(resolve => setTimeout(resolve, requestDelay));
				if (version !== event.document.version) {
					logService.warn('Skipping diagnostics request because the document has changed');
					return;
				}
				const now = Date.now();
				const before = now - maxRequestsInterval;
				requestTimes = requestTimes.filter(t => t > before);
				if (requestTimes.length >= maxRequests) {
					logService.warn('Max requests reached, skipping diagnostics request');
					return;
				}
				requestTimes.push(now);
				logService.trace('Requesting diagnostics');

				const selection = vscode.window.activeTextEditor?.selection;

				// TODO: Use all changes in the current document.
				const change = await instantiationService.invokeFunction(CurrentChange.getCurrentChange, event.document, selection.start);
				if (!change) {
					logService.trace('No change found in the current document at the current position.');
					return [];
				}

				const result = await feedbackGenerator.generateComments([
					{
						document: TextDocumentSnapshot.create(event.document),
						relativeDocumentPath: path.basename(event.document.uri.fsPath),
						change,
						selection
					}
				], CancellationToken.None);
				if (result.type === 'success') {
					const diagnostics = result.comments.map(comment => new vscode.Diagnostic(comment.range, typeof comment.body === 'string' ? comment.body : comment.body.value, vscode.DiagnosticSeverity.Information));
					collection.set(event.document.uri, diagnostics);
				}
			} catch (err) {
				logService.error(err, 'Error generating diagnostics');
			}
		}
	}));
	disposables.add(vscode.workspace.onDidCloseTextDocument(doc => {
		collection.set(doc.uri, undefined);
	}));
	return disposables;
}
