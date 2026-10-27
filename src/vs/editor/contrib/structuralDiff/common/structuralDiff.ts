/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { StructuralDiff, StructuralDiffContext, StructuralDiffProvider } from '../../../common/languages.js';
import { ITextModel } from '../../../common/model.js';
import { IEditorWorkerService } from '../../../common/services/editorWorker.js';

export interface StructuralDiffResult extends StructuralDiff {
	readonly context: StructuralDiffContext;
}

/**
 * Computes textual changes and asks providers in selector order for a structural interpretation.
 */
export async function getStructuralDiff(
	workerService: IEditorWorkerService,
	registry: LanguageFeatureRegistry<StructuralDiffProvider>,
	originalModel: ITextModel,
	modifiedModel: ITextModel,
	token: CancellationToken,
): Promise<StructuralDiffResult | undefined> {
	if (token.isCancellationRequested || originalModel.isDisposed() || modifiedModel.isDisposed()) {
		throw new CancellationError();
	}

	const providers = registry.ordered(modifiedModel);
	if (providers.length === 0) {
		return undefined;
	}

	const originalVersion = originalModel.getVersionId();
	const modifiedVersion = modifiedModel.getVersionId();
	const disposables = new DisposableStore();
	const source = disposables.add(new CancellationTokenSource(token));
	for (const model of new Set([originalModel, modifiedModel])) {
		disposables.add(model.onDidChangeContent(() => source.cancel()));
		disposables.add(model.onWillDispose(() => source.cancel()));
		disposables.add(model.onDidChangeLanguage(() => source.cancel()));
	}
	const checkCancellation = () => {
		if (source.token.isCancellationRequested
			|| originalModel.getVersionId() !== originalVersion
			|| modifiedModel.getVersionId() !== modifiedVersion) {
			throw new CancellationError();
		}
	};

	try {
		const textDiff = await raceCancellationError(workerService.computeDiff(originalModel.uri, modifiedModel.uri, {
			ignoreTrimWhitespace: false,
			maxComputationTimeMs: 0,
			computeMoves: false,
		}, 'advanced'), source.token);
		checkCancellation();
		if (!textDiff || textDiff.quitEarly) {
			throw new Error('Cannot compute a structural diff without a complete text diff');
		}

		const context: StructuralDiffContext = {
			changes: textDiff.changes.flatMap(change => (change.innerChanges ?? [change.toRangeMapping()]).map(mapping => ({
				originalRange: originalModel.validateRange(mapping.originalRange),
				modifiedRange: modifiedModel.validateRange(mapping.modifiedRange),
			}))),
		};
		for (const provider of providers) {
			checkCancellation();
			try {
				const result = await raceCancellationError(Promise.resolve(provider.provideStructuralDiff(originalModel, modifiedModel, context, source.token)), source.token);
				checkCancellation();
				if (result) {
					return { ...result, context };
				}
			} catch (error) {
				if (source.token.isCancellationRequested || isCancellationError(error)) {
					throw new CancellationError();
				}
				onUnexpectedExternalError(error);
			}
		}
		return undefined;
	} finally {
		disposables.dispose();
	}
}
