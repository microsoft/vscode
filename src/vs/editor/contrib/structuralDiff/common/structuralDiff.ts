/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Constants } from '../../../../base/common/uint.js';
import { diffEditorDefaultOptions } from '../../../common/config/diffEditor.js';
import { clampedInt } from '../../../common/config/editorOptions.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { StructuralDiffContext, StructuralDiffProvider, StructuralDiffResult } from '../../../common/languages.js';
import { ITextModel } from '../../../common/model.js';
import { IEditorWorkerService } from '../../../common/services/editorWorker.js';
import { ITextResourceConfigurationService } from '../../../common/services/textResourceConfiguration.js';

/** The diff editor setting that limits how long a text diff may take. It is shared so that both give up at the same point. */
const MAX_COMPUTATION_TIME_SETTING = 'diffEditor.maxComputationTime';

/**
 * The text diff did not complete within its time budget. Its changes are incomplete, so providers cannot classify them.
 */
export class StructuralDiffTimeoutError extends Error {
	constructor(maxComputationTimeMs: number) {
		super(`Cannot compute a structural diff without a complete text diff: it did not complete within ${maxComputationTimeMs} ms. Increase "${MAX_COMPUTATION_TIME_SETTING}" to allow more time.`);
	}
}

/**
 * Computes textual changes and asks providers in selector order for a structural interpretation.
 *
 * The text diff is limited by the `diffEditor.maxComputationTime` setting, because the editor worker
 * is shared and is not protected by the usual size limits for diffs. A text diff that exceeds the
 * limit rejects with a {@link StructuralDiffTimeoutError}.
 */
export async function getStructuralDiff(
	workerService: IEditorWorkerService,
	configurationService: ITextResourceConfigurationService,
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
		const maxComputationTimeMs = clampedInt(configurationService.getValue<unknown>(modifiedModel.uri, MAX_COMPUTATION_TIME_SETTING), diffEditorDefaultOptions.maxComputationTime, 0, Constants.MAX_SAFE_SMALL_INTEGER);
		const textDiff = await raceCancellationError(workerService.computeDiff(originalModel.uri, modifiedModel.uri, {
			ignoreTrimWhitespace: false,
			maxComputationTimeMs,
			computeMoves: false,
		}, 'advanced'), source.token);
		checkCancellation();
		if (!textDiff) {
			throw new Error('Cannot compute a structural diff without a complete text diff');
		}
		if (textDiff.quitEarly) {
			throw new StructuralDiffTimeoutError(maxComputationTimeMs);
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
