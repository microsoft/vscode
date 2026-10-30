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
import { IRange, Range } from '../../../common/core/range.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { StructuralDiff, StructuralDiffClassification, StructuralDiffContext, StructuralDiffCoverage, StructuralDiffEntity, StructuralDiffNode, StructuralDiffProvider, StructuralDiffResult, StructuralDiffTag, SymbolKind, symbolKindNames } from '../../../common/languages.js';
import { ITextModel } from '../../../common/model.js';
import { IEditorWorkerService } from '../../../common/services/editorWorker.js';
import { ITextResourceConfigurationService } from '../../../common/services/textResourceConfiguration.js';

/** The diff editor setting that limits how long a text diff may take. It is shared so that both give up at the same point. */
const MAX_COMPUTATION_TIME_SETTING = 'diffEditor.maxComputationTime';

/**
 * Computes structural diffs. The name is plural so that it does not merge with the {@link StructuralDiff} interface.
 */
export namespace StructuralDiffs {

	/**
	 * The text diff did not complete within its time budget. Its changes are incomplete, so providers cannot classify them.
	 */
	export class TimeoutError extends Error {
		constructor(maxComputationTimeMs: number) {
			super(`Cannot compute a structural diff without a complete text diff: it did not complete within ${maxComputationTimeMs} ms. Increase "${MAX_COMPUTATION_TIME_SETTING}" to allow more time.`);
		}
	}

	/**
	 * Computes textual changes and asks providers in selector order for a structural interpretation.
	 *
	 * The text diff is limited by the `diffEditor.maxComputationTime` setting, because the editor worker
	 * is shared and is not protected by the usual size limits for diffs. A text diff that exceeds the
	 * limit rejects with a {@link TimeoutError}.
	 *
	 * A result that violates the requirements of the provider API is reported and treated like a failing provider.
	 */
	export async function compute(
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
				throw new TimeoutError(maxComputationTimeMs);
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
						validateStructuralDiff(result, context, originalModel, modifiedModel);
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
}

type Side = 'original' | 'modified';

const sides: readonly Side[] = ['original', 'modified'];

function invalid(node: StructuralDiffNode, problem: string): Error {
	return new Error(`Invalid structural diff: node '${node.id}' ${problem}`);
}

function isEnumValue(enumObject: { readonly [value: number]: string }, value: unknown): boolean {
	return typeof value === 'number' && typeof enumObject[value] === 'string';
}

/** Returns the range if it addresses existing text in the model, because a range that has to be adjusted is not valid. */
function toValidRange(model: ITextModel, range: IRange): Range | undefined {
	const valid = model.validateRange(range);
	return Range.equalsRange(valid, range) ? valid : undefined;
}

function validateEntity(node: StructuralDiffNode, side: Side, entity: StructuralDiffEntity, model: ITextModel, parent: StructuralDiffNode | undefined): void {
	if (typeof entity.name !== 'string' || !isEnumValue(symbolKindNames, entity.kind)) {
		throw invalid(node, `has an invalid ${side} entity name or kind`);
	}
	const range = toValidRange(model, entity.range);
	if (!range) {
		throw invalid(node, `has a range outside the ${side} document`);
	}
	if (entity.selectionRange && !(toValidRange(model, entity.selectionRange) && range.containsRange(entity.selectionRange))) {
		throw invalid(node, `has a selection range in the ${side} document that is invalid or not contained in the entity range`);
	}
	const parentEntity = parent?.[side];
	if (parent && !(parentEntity && Range.containsRange(parentEntity.range, range))) {
		throw invalid(node, `has an entity in the ${side} document that is not contained in its parent`);
	}
}

function validateCoverage(node: StructuralDiffNode, side: Side, coverage: StructuralDiffCoverage, model: ITextModel, context: StructuralDiffContext): Range {
	const textChange = Number.isInteger(coverage.textChangeIndex) ? context.changes[coverage.textChangeIndex] : undefined;
	if (!textChange) {
		throw invalid(node, `has ${side} changes that refer to a text change that does not exist`);
	}
	const range = toValidRange(model, coverage.range);
	if (!range || range.isEmpty() || !Range.containsRange(side === 'original' ? textChange.originalRange : textChange.modifiedRange, range)) {
		throw invalid(node, `has ${side} changes with a range that is empty, invalid or not contained in its text change`);
	}
	if (!isEnumValue(StructuralDiffClassification, coverage.classification)
		|| (coverage.tags !== undefined && !(Array.isArray(coverage.tags) && coverage.tags.every(tag => isEnumValue(StructuralDiffTag, tag))))) {
		throw invalid(node, `has ${side} changes with an invalid classification or tag`);
	}
	return range;
}

/**
 * Checks that the result of a provider satisfies the requirements documented for the structural diff
 * provider API, so that consumers can rely on them, and throws a descriptive error for the first violation.
 *
 * A result may be incomplete, so this does not require that all textual changes are covered.
 */
function validateStructuralDiff(diff: StructuralDiff, context: StructuralDiffContext, originalModel: ITextModel, modifiedModel: ITextModel): void {
	const models: Record<Side, ITextModel> = { original: originalModel, modified: modifiedModel };
	const ids = new Set<string>();
	const coverage: Record<Side, Range[]> = { original: [], modified: [] };

	const validateNode = (node: StructuralDiffNode, parent: StructuralDiffNode | undefined): void => {
		if (typeof node.id !== 'string' || ids.has(node.id)) {
			throw invalid(node, 'must have an identifier that is unique within the result');
		}
		ids.add(node.id);
		if (!node.original && !node.modified) {
			throw invalid(node, 'must have an original or a modified entity');
		}
		for (const side of sides) {
			const entity = node[side];
			const changes = side === 'original' ? node.originalChanges : node.modifiedChanges;
			if (!entity) {
				if (changes.length > 0) {
					throw invalid(node, `has ${side} changes but no ${side} entity`);
				}
				continue;
			}
			validateEntity(node, side, entity, models[side], parent);
			for (const change of changes) {
				coverage[side].push(validateCoverage(node, side, change, models[side], context));
			}
		}
		for (const child of node.children) {
			validateNode(child, node);
		}
	};

	const { root } = diff;
	if (root.original?.kind !== SymbolKind.File || root.modified?.kind !== SymbolKind.File) {
		throw invalid(root, 'must be a file on both sides');
	}
	validateNode(root, undefined);

	for (const side of sides) {
		const ranges = coverage[side].sort(Range.compareRangesUsingStarts);
		for (let index = 1; index < ranges.length; index++) {
			if (!ranges[index - 1].getEndPosition().isBeforeOrEqual(ranges[index].getStartPosition())) {
				throw new Error(`Invalid structural diff: ${side} changes ${ranges[index - 1].toString()} and ${ranges[index].toString()} overlap`);
			}
		}
	}
}
