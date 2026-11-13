/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findFirstIdxMonotonousOrArrLen } from '../../../../base/common/arraysFind.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Constants } from '../../../../base/common/uint.js';
import { diffEditorDefaultOptions } from '../../../common/config/diffEditor.js';
import { clampedInt } from '../../../common/config/editorOptions.js';
import { IRange, Range } from '../../../common/core/range.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { StructuralDiff, StructuralDiffClassification, StructuralDiffContext, StructuralDiffCoverage, StructuralDiffItem, StructuralDiffNode, StructuralDiffProvider, StructuralDiffResult, StructuralDiffTag, SymbolKind, symbolKindNames } from '../../../common/languages.js';
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

			// As in the diff editor, a change can include short unchanged text, which keeps rewritten text from splitting
			// into many small changes.
			const context: StructuralDiffContext = {
				changes: textDiff.changes.flatMap(change => (change.innerChanges ?? [change.toRangeMapping()]).map(mapping => ({
					originalRange: clampRange(originalModel, mapping.originalRange),
					modifiedRange: clampRange(modifiedModel, mapping.modifiedRange),
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

function getItem(node: StructuralDiffNode, side: Side): StructuralDiffItem | undefined {
	return side === 'original' ? node.originalItem : node.modifiedItem;
}

function invalid(node: StructuralDiffNode, problem: string): Error {
	return new Error(`Invalid structural diff: node '${node.id}' ${problem}`);
}

function isEnumValue(enumObject: { readonly [value: number]: string }, value: unknown): boolean {
	return typeof value === 'number' && typeof enumObject[value] === 'string';
}

function isOptionalString(value: unknown): boolean {
	return value === undefined || typeof value === 'string';
}

/**
 * Clamps a range to the document, such as the maximal columns of whole-line changes. Ranges are UTF-16 offsets, and the
 * text diff compares code units, so unlike `validateRange`, this does not move a range out of a surrogate pair. Moving
 * the two ranges of a change separately would make them describe different changes.
 */
function clampRange(model: ITextModel, range: IRange): Range {
	return Range.fromPositions(model.getPositionAt(model.getOffsetAt(Range.getStartPosition(range))), model.getPositionAt(model.getOffsetAt(Range.getEndPosition(range))));
}

/** Returns the range if it is a range that lies within the model, because a range that has to be clamped is not valid. */
function toValidRange(model: ITextModel, range: IRange): Range | undefined {
	if (!Range.isIRange(range)) {
		return undefined;
	}
	const valid = clampRange(model, range);
	return Range.equalsRange(valid, range) ? valid : undefined;
}

/**
 * Returns whether text changed within the range. The changed ranges are sorted and do not overlap, so if the first one
 * that ends after the start of the range does not intersect it, none does. Ranges that only touch do not intersect.
 */
function containsChangedText(range: IRange, changedRanges: readonly IRange[]): boolean {
	const start = Range.getStartPosition(range);
	const index = findFirstIdxMonotonousOrArrLen(changedRanges, changed => start.isBefore(Range.getEndPosition(changed)));
	return index < changedRanges.length && Range.areIntersecting(range, changedRanges[index]);
}

function validateItem(node: StructuralDiffNode, side: Side, item: StructuralDiffItem, model: ITextModel, parent: StructuralDiffNode | undefined): void {
	if (typeof item !== 'object' || item === null) {
		throw invalid(node, `has an invalid ${side} item`);
	}
	if (typeof item.name !== 'string' || !isOptionalString(item.detail) || !isEnumValue(symbolKindNames, item.kind)) {
		throw invalid(node, `has an invalid ${side} item name, detail or kind`);
	}
	const range = toValidRange(model, item.range);
	if (!range) {
		throw invalid(node, `has a range outside the ${side} document`);
	}
	if (item.selectionRange !== undefined && !(toValidRange(model, item.selectionRange) && range.containsRange(item.selectionRange))) {
		throw invalid(node, `has a selection range in the ${side} document that is invalid or not contained in the item range`);
	}
	const parentItem = parent && getItem(parent, side);
	if (parent && !(parentItem && Range.containsRange(parentItem.range, range))) {
		throw invalid(node, `has an item in the ${side} document that is not contained in its parent`);
	}
}

function validateCoverage(node: StructuralDiffNode, side: Side, coverage: StructuralDiffCoverage, item: StructuralDiffItem, model: ITextModel, context: StructuralDiffContext): Range {
	const textChange = Number.isInteger(coverage.textChangeIndex) ? context.changes[coverage.textChangeIndex] : undefined;
	if (!textChange) {
		throw invalid(node, `has ${side} changes that refer to a text change that does not exist`);
	}
	const range = toValidRange(model, coverage.range);
	if (!range || range.isEmpty() || !Range.containsRange(side === 'original' ? textChange.originalRange : textChange.modifiedRange, range)) {
		throw invalid(node, `has ${side} changes with a range that is empty, invalid or not contained in its text change`);
	}
	if (!Range.containsRange(item.range, range)) {
		throw invalid(node, `has ${side} changes that are not contained in its ${side} item`);
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
 * A complete result must cover all changed text exactly once, while an incomplete result may omit coverage.
 */
function validateStructuralDiff(diff: StructuralDiff, context: StructuralDiffContext, originalModel: ITextModel, modifiedModel: ITextModel): void {
	const models: Record<Side, ITextModel> = { original: originalModel, modified: modifiedModel };
	const changedRanges: Record<Side, readonly IRange[]> = {
		original: context.changes.map(change => change.originalRange),
		modified: context.changes.map(change => change.modifiedRange),
	};
	const ids = new Set<string>();
	const coverage: Record<Side, Map<number, Range[]>> = { original: new Map(), modified: new Map() };

	const validateNode = (node: StructuralDiffNode, parent: StructuralDiffNode | undefined): void => {
		if (typeof node.id !== 'string' || ids.has(node.id)) {
			throw invalid(node, 'must have an identifier that is unique within the result');
		}
		ids.add(node.id);
		if (node.originalItem === undefined && node.modifiedItem === undefined) {
			throw invalid(node, 'must have an original or a modified item');
		}
		let isChanged = false;
		for (const side of sides) {
			const item = getItem(node, side);
			const changes = side === 'original' ? node.originalChanges : node.modifiedChanges;
			if (item === undefined) {
				if (changes.length > 0) {
					throw invalid(node, `has ${side} changes but no ${side} item`);
				}
				continue;
			}
			validateItem(node, side, item, models[side], parent);
			isChanged ||= containsChangedText(item.range, changedRanges[side]);
			for (const change of changes) {
				const range = validateCoverage(node, side, change, item, models[side], context);
				const ranges = coverage[side].get(change.textChangeIndex);
				if (ranges) {
					ranges.push(range);
				} else {
					coverage[side].set(change.textChangeIndex, [range]);
				}
			}
		}
		// Unchanged subtrees are omitted, so the root has no children when the documents are identical. A node can contain
		// changed text without owning changes, because its ancestors can own them.
		if (parent && !isChanged) {
			throw invalid(node, 'contains no changed text, so it must be omitted');
		}
		for (const child of node.children) {
			validateNode(child, node);
		}
	};

	// The completeness checks below depend on this flag, so a value other than a boolean must not skip them.
	if (typeof diff.isIncomplete !== 'boolean') {
		throw new Error('Invalid structural diff: isIncomplete must be true or false');
	}
	const { root } = diff;
	if (root.originalItem?.kind !== SymbolKind.File || root.modifiedItem?.kind !== SymbolKind.File) {
		throw invalid(root, 'must be a file on both sides');
	}
	for (const side of sides) {
		if (!Range.equalsRange(getItem(root, side)?.range, models[side].getFullModelRange())) {
			throw invalid(root, `must cover the complete ${side} document`);
		}
	}
	validateNode(root, undefined);

	for (const side of sides) {
		const ranges = [...coverage[side].values()].flat().sort(Range.compareRangesUsingStarts);
		for (let index = 1; index < ranges.length; index++) {
			if (!ranges[index - 1].getEndPosition().isBeforeOrEqual(ranges[index].getStartPosition())) {
				throw new Error(`Invalid structural diff: ${side} changes ${ranges[index - 1].toString()} and ${ranges[index].toString()} overlap`);
			}
		}
	}

	if (!diff.isIncomplete) {
		for (const side of sides) {
			for (const [textChangeIndex, change] of context.changes.entries()) {
				const changedRange = side === 'original' ? change.originalRange : change.modifiedRange;
				// The coverage does not overlap and lies within the text change, so it is complete if it is contiguous from start to end.
				let covered = Range.getStartPosition(changedRange);
				for (const range of (coverage[side].get(textChangeIndex) ?? []).sort(Range.compareRangesUsingStarts)) {
					if (!range.getStartPosition().equals(covered)) {
						break;
					}
					covered = range.getEndPosition();
				}
				if (!covered.equals(Range.getEndPosition(changedRange))) {
					throw new Error(`Invalid structural diff: the ${side} side of text change ${textChangeIndex} is not completely covered, although the result is not marked as incomplete`);
				}
			}
		}
	}
}
