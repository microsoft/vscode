/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { Part, DirectiveParent, CompiledTemplateResult, MaybeCompiledTemplateResult, UncompiledTemplateResult } from './lit-html.js';
import { DirectiveResult, DirectiveClass, PartInfo } from './directive.js';
type Primitive = null | undefined | boolean | number | string | symbol | bigint;
declare const ChildPart: typeof import("./lit-html.js").ChildPart;
type ChildPart = InstanceType<typeof ChildPart>;
/**
 * Tests if a value is a primitive value.
 *
 * See https://tc39.github.io/ecma262/#sec-typeof-operator
 */
export declare const isPrimitive: (value: unknown) => value is Primitive;
export declare const TemplateResultType: {
    readonly HTML: 1;
    readonly SVG: 2;
    readonly MATHML: 3;
};
export type TemplateResultType = (typeof TemplateResultType)[keyof typeof TemplateResultType];
type IsTemplateResult = {
    (val: unknown): val is MaybeCompiledTemplateResult;
    <T extends TemplateResultType>(val: unknown, type: T): val is UncompiledTemplateResult<T>;
};
/**
 * Tests if a value is a TemplateResult or a CompiledTemplateResult.
 */
export declare const isTemplateResult: IsTemplateResult;
/**
 * Tests if a value is a CompiledTemplateResult.
 */
export declare const isCompiledTemplateResult: (value: unknown) => value is CompiledTemplateResult;
/**
 * Tests if a value is a DirectiveResult.
 */
export declare const isDirectiveResult: (value: unknown) => value is DirectiveResult;
/**
 * Retrieves the Directive class for a DirectiveResult
 */
export declare const getDirectiveClass: (value: unknown) => DirectiveClass | undefined;
/**
 * Tests whether a part has only a single-expression with no strings to
 * interpolate between.
 *
 * Only AttributePart and PropertyPart can have multiple expressions.
 * Multi-expression parts have a `strings` property and single-expression
 * parts do not.
 */
export declare const isSingleExpression: (part: PartInfo) => boolean;
/**
 * Inserts a ChildPart into the given container ChildPart's DOM, either at the
 * end of the container ChildPart, or before the optional `refPart`.
 *
 * This does not add the part to the containerPart's committed value. That must
 * be done by callers.
 *
 * @param containerPart Part within which to add the new ChildPart
 * @param refPart Part before which to add the new ChildPart; when omitted the
 *     part added to the end of the `containerPart`
 * @param part Part to insert, or undefined to create a new part
 */
export declare const insertPart: (containerPart: ChildPart, refPart?: ChildPart, part?: ChildPart) => ChildPart;
/**
 * Sets the value of a Part.
 *
 * Note that this should only be used to set/update the value of user-created
 * parts (i.e. those created using `insertPart`); it should not be used
 * by directives to set the value of the directive's container part. Directives
 * should return a value from `update`/`render` to update their part state.
 *
 * For directives that require setting their part value asynchronously, they
 * should extend `AsyncDirective` and call `this.setValue()`.
 *
 * @param part Part to set
 * @param value Value to set
 * @param index For `AttributePart`s, the index to set
 * @param directiveParent Used internally; should not be set by user
 */
export declare const setChildPartValue: <T extends ChildPart>(part: T, value: unknown, directiveParent?: DirectiveParent) => T;
/**
 * Sets the committed value of a ChildPart directly without triggering the
 * commit stage of the part.
 *
 * This is useful in cases where a directive needs to update the part such
 * that the next update detects a value change or not. When value is omitted,
 * the next update will be guaranteed to be detected as a change.
 *
 * @param part
 * @param value
 */
export declare const setCommittedValue: (part: Part, value?: unknown) => unknown;
/**
 * Returns the committed value of a ChildPart.
 *
 * The committed value is used for change detection and efficient updates of
 * the part. It can differ from the value set by the template or directive in
 * cases where the template value is transformed before being committed.
 *
 * - `TemplateResult`s are committed as a `TemplateInstance`
 * - Iterables are committed as `Array<ChildPart>`
 * - All other types are committed as the template value or value returned or
 *   set by a directive.
 *
 * @param part
 */
export declare const getCommittedValue: (part: ChildPart) => unknown;
/**
 * Removes a ChildPart from the DOM, including any of its content and markers.
 *
 * Note: The only difference between this and clearPart() is that this also
 * removes the part's start node. This means that the ChildPart must own its
 * start node, ie it must be a marker node specifically for this part and not an
 * anchor from surrounding content.
 *
 * @param part The Part to remove
 */
export declare const removePart: (part: ChildPart) => void;
export declare const clearPart: (part: ChildPart) => void;
export {};
//# sourceMappingURL=directive-helpers.d.ts.map