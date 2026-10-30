/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A textual change between the original and modified documents.
	 *
	 * Ranges use zero-based lines and UTF-16 character offsets, with an exclusive end.
	 * Replacement ranges need not have the same length.
	 */
	export interface StructuralDiffTextChange {
		/**
		 * The changed range in the original document. Empty for an insertion.
		 */
		readonly originalRange: Range;

		/**
		 * The changed range in the modified document. Empty for a deletion.
		 * At least one of the two ranges must be non-empty.
		 */
		readonly modifiedRange: Range;
	}

	/**
	 * Textual changes for a structural diff request.
	 */
	export interface StructuralDiffContext {
		/**
		 * Textual changes computed by the editor, ordered by source position and
		 * non-overlapping in each document. Unchanged context is excluded.
		 *
		 * Providers classify these changes rather than computing another textual
		 * diff. Changes can be smaller than a line. Array indices identify changes
		 * within this request.
		 */
		readonly changes: readonly StructuralDiffTextChange[];
	}

	/**
	 * A structural entity as it appears in one document.
	 */
	export interface StructuralDiffEntity {
		/**
		 * The name of the entity.
		 */
		readonly name: string;

		/**
		 * Optional display detail, such as a function signature.
		 */
		readonly detail?: string;

		/**
		 * A language-independent symbol category.
		 */
		readonly kind: SymbolKind;

		/**
		 * An optional language-specific category, such as `trait`, `impl`,
		 * `record`, or `template`. This is a non-localized identifier and does
		 * not replace {@link StructuralDiffEntity.kind kind}.
		 */
		readonly languageKind?: string;

		/**
		 * The complete entity range in the corresponding document.
		 */
		readonly range: Range;

		/**
		 * The range to select when navigating to this entity.
		 * Must be contained in {@link StructuralDiffEntity.range range}.
		 */
		readonly selectionRange?: Range;
	}

	/**
	 * The syntactic role of changed text. Classification does not imply
	 * behavioral equivalence, impact, or safety.
	 */
	export enum StructuralDiffClassification {
		/**
		 * A complete entity was introduced or removed.
		 */
		Declaration = 1,

		/**
		 * An entity's header, including its signature, modifiers, attributes,
		 * decorators, or inheritance clauses.
		 */
		Header = 2,

		/**
		 * Executable statements, expressions, or implementation details.
		 */
		Implementation = 3,

		/**
		 * Imports, includes, or equivalent dependency declarations.
		 */
		Dependency = 4,

		/**
		 * Changed text not covered by another classification. This does not
		 * indicate an analysis failure.
		 */
		Other = 5,
	}

	/**
	 * Additional information about classified text.
	 */
	export enum StructuralDiffTag {
		/**
		 * The classified text belongs to test code. The absence of this tag
		 * does not guarantee that the text is not test code.
		 */
		Test = 1,
	}

	/**
	 * Classification of a portion of one supplied textual change, in either
	 * the original or modified document.
	 */
	export interface StructuralDiffCoverage {
		/**
		 * A zero-based index into {@link StructuralDiffContext.changes}.
		 */
		readonly textChangeIndex: number;

		/**
		 * A non-empty range contained in the corresponding side of the
		 * referenced textual change.
		 *
		 * The containing node's {@link StructuralDiffNode.originalChanges originalChanges}
		 * or {@link StructuralDiffNode.modifiedChanges modifiedChanges} property
		 * determines which document this range refers to.
		 */
		readonly range: Range;

		/**
		 * The syntactic role of this range.
		 */
		readonly classification: StructuralDiffClassification;

		/**
		 * Optional additional information about this range.
		 */
		readonly tags?: readonly StructuralDiffTag[];
	}

	/**
	 * A node in a sparse, file-local structural diff tree.
	 *
	 * A node with both versions asserts that the entities correspond; different names
	 * on those versions represent a detected rename. Providers
	 * are not required to detect renames or moves. Unmatched entities can be
	 * represented as separate additions and deletions.
	 */
	export interface StructuralDiffNode {
		/**
		 * An identifier unique within this result. Stability across requests
		 * is not implied.
		 */
		readonly id: string;

		/**
		 * The entity in the original document. Absent when the entity was added.
		 */
		readonly original?: StructuralDiffEntity;

		/**
		 * The entity in the modified document. Absent when the entity was removed.
		 * At least one of original or modified must be present.
		 */
		readonly modified?: StructuralDiffEntity;

		/**
		 * Original-side changes owned directly by this node, excluding coverage
		 * owned by descendants. Must be empty when original is absent.
		 */
		readonly originalChanges: readonly StructuralDiffCoverage[];

		/**
		 * Modified-side changes owned directly by this node, excluding coverage
		 * owned by descendants. Must be empty when modified is absent.
		 */
		readonly modifiedChanges: readonly StructuralDiffCoverage[];

		/**
		 * Changed descendants and the ancestors needed to contain them.
		 * Unchanged subtrees are omitted. An ancestor retained for context can
		 * have no directly owned changes.
		 *
		 * Parenthood represents lexical containment, not semantic ownership.
		 * On each side where a child exists, its parent must also exist and its
		 * range must contain the child's range. A structural move that cannot
		 * satisfy this shared hierarchy can be represented as a deletion and
		 * an addition.
		 */
		readonly children: readonly StructuralDiffNode[];
	}

	/**
	 * A structural interpretation of the supplied textual changes.
	 */
	export interface StructuralDiff {
		/**
		 * A source-file node with {@link SymbolKind.File} on both sides and
		 * ranges covering the complete respective documents. File-level changes
		 * belong directly to this node.
		 *
		 * When the documents are identical, the root has no changes or children.
		 */
		readonly root: StructuralDiffNode;

		/**
		 * Whether some supplied changed text could not be classified.
		 *
		 * For a complete result, every non-empty side of every supplied textual
		 * change must be covered exactly once across the tree. Coverage must
		 * not overlap on the same side, including between ancestors and descendants.
		 *
		 * An incomplete result may omit coverage but must otherwise satisfy the
		 * same invariants. Providers should not use
		 * {@link StructuralDiffClassification.Other} to hide analysis failures.
		 */
		readonly isIncomplete: boolean;
	}

	/**
	 * The result of executing the `vscode.executeStructuralDiffProvider` command,
	 * which takes the {@link Uri uris} of the original and the modified document
	 * and resolves to `undefined` when no provider supplies a result.
	 *
	 * The command rejects when the textual diff does not complete within the time
	 * configured by the `diffEditor.maxComputationTime` setting, because the
	 * textual changes would be incomplete.
	 */
	export interface StructuralDiffResult extends StructuralDiff {
		/**
		 * The textual changes that were classified. The
		 * {@link StructuralDiffCoverage.textChangeIndex textChangeIndex} of a coverage
		 * is an index into {@link StructuralDiffContext.changes}.
		 */
		readonly context: StructuralDiffContext;
	}

	/**
	 * Provides language-specific structural interpretation of textual changes.
	 */
	export interface StructuralDiffProvider {
		/**
		 * Provides a file-local structural diff for two versions of a document.
		 *
		 * Ranges in the result refer to the respective input documents. The editor
		 * captures their versions before dispatch and cancels and discards the
		 * request if either document changes. Providers must honor cancellation
		 * and must not mix content from different document versions.
		 *
		 * @param originalDocument The original version of the document.
		 * @param modifiedDocument The modified version of the document.
		 * @param context The paired textual changes to classify.
		 * @param token A cancellation token.
		 * @returns A structural diff, or `undefined` or `null` when the provider
		 * cannot supply a result. Failures should be reported by throwing an
		 * error or returning a rejected promise. A result that does not satisfy the
		 * requirements described on {@link StructuralDiff} and its members is
		 * treated as a failure.
		 */
		provideStructuralDiff(originalDocument: TextDocument, modifiedDocument: TextDocument, context: StructuralDiffContext, token: CancellationToken): ProviderResult<StructuralDiff>;
	}

	export namespace languages {

		/**
		 * Registers a structural diff provider.
		 *
		 * Providers are selected using the modified document and must support
		 * analyzing both supplied documents. Providers are ordered by their
		 * {@link languages.match selector score} and queried in sequence. The
		 * first non-null result is used; trees from different providers are not
		 * merged. A failing provider does not prevent querying another provider.
		 *
		 * Structural diffs can be requested for documents that are not open, and the
		 * editor only offers them while a provider is registered. Register providers
		 * when the extension activates instead of waiting for a language-specific
		 * activation event such as `onLanguage`.
		 *
		 * @param selector A selector for modified documents.
		 * @param provider A structural diff provider.
		 * @returns A disposable that unregisters the provider.
		 */
		export function registerStructuralDiffProvider(selector: DocumentSelector, provider: StructuralDiffProvider): Disposable;
	}
}
