/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { Copilot } from '../../../platform/inlineCompletions/common/api';
import { LanguageContextEntry, LanguageContextResponse } from '../../../platform/inlineEdits/common/dataTypes/languageContext';
import { ILanguageContextProviderService, ProviderTarget } from '../../../platform/languageContextProvider/common/languageContextProviderService';
import { ContextKind, SnippetContext } from '../../../platform/languageServer/common/languageContextService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { raceFilter } from '../../../util/common/async';
import { raceCancellation, raceTimeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Position as VscodePosition } from '../../../vscodeTypes';
import { INextEditLanguageContextService, NextEditLanguageContextRequest } from '../common/nextEditLanguageContextService';

/**
 * Collects NES language context from the Copilot context providers registered with {@link ILanguageContextProviderService}.
 */
export class ContextProviderLanguageContextService implements INextEditLanguageContextService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ILanguageContextProviderService private readonly langCtxService: ILanguageContextProviderService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
	) { }

	async getLanguageContext(request: NextEditLanguageContextRequest, cancellationToken: CancellationToken): Promise<LanguageContextResponse | undefined> {
		const textDoc = this.workspaceService.textDocuments.find(doc => doc.uri.toString() === request.document.id.uri);
		if (textDoc === undefined) {
			return undefined;
		}

		const providers = this.langCtxService.getContextProviders(textDoc, ProviderTarget.NES);
		if (providers.length < 1) {
			return undefined;
		}

		const debounceTime = request.timeBudgetMs;

		const cursorPositionVscode = new VscodePosition(request.cursorPosition.lineNumber - 1, request.cursorPosition.column - 1);

		const ctxRequest: Copilot.ResolveRequest = {
			opportunityId: request.opportunityId,
			completionId: request.completionId,
			documentContext: {
				uri: textDoc.uri.toString(),
				languageId: textDoc.languageId,
				version: textDoc.version,
				offset: textDoc.offsetAt(cursorPositionVscode),
				position: cursorPositionVscode
			},
			activeExperiments: new Map(),
			timeBudget: debounceTime,
			timeoutEnd: Date.now() + debounceTime,
			source: 'nes',
		};

		const isSnippetIgnored = async (item: SnippetContext): Promise<boolean> => {
			const uris = [item.uri, ...(item.additionalUris ?? [])];
			const isIgnored = await raceFilter(uris.map(uri => this.ignoreService.isCopilotIgnored(uri)), r => r);
			return !!isIgnored;
		};

		const langCtxItems: LanguageContextEntry[] = [];
		const getContextPromise = async () => {
			const ctxIter = this.langCtxService.getContextItems(textDoc, ctxRequest, cancellationToken);
			for await (const item of ctxIter) {
				if (item.kind === ContextKind.Snippet && await isSnippetIgnored(item)) {
					// If the snippet is ignored, we don't want to include it in the context
					continue;
				}
				langCtxItems.push({ context: item, timeStamp: Date.now(), onTimeout: false });
			}
		};

		const start = Date.now();
		await raceCancellation(raceTimeout(getContextPromise(), debounceTime), cancellationToken);
		if (cancellationToken.isCancellationRequested) {
			return undefined;
		}
		const end = Date.now();

		const langCtxOnTimeout = this.langCtxService.getContextItemsOnTimeout(textDoc, ctxRequest);
		for (const item of langCtxOnTimeout) {
			if (item.kind === ContextKind.Snippet && await isSnippetIgnored(item)) {
				// If the snippet is ignored, we don't want to include it in the context
				continue;
			}
			langCtxItems.push({ context: item, timeStamp: end, onTimeout: true });
		}

		return { start, end, items: langCtxItems };
	}
}
