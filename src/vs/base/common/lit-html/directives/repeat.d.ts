/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { ChildPart, noChange } from '../lit-html.js';
import { Directive, PartInfo } from '../directive.js';
export type KeyFn<T> = (item: T, index: number) => unknown;
export type ItemTemplate<T> = (item: T, index: number) => unknown;
declare class RepeatDirective extends Directive {
    private _itemKeys?;
    constructor(partInfo: PartInfo);
    private _getValuesAndKeys;
    render<T>(items: Iterable<T>, template: ItemTemplate<T>): Array<unknown>;
    render<T>(items: Iterable<T>, keyFn: KeyFn<T> | ItemTemplate<T>, template: ItemTemplate<T>): Array<unknown>;
    update<T>(containerPart: ChildPart, [items, keyFnOrTemplate, template]: [
        Iterable<T>,
        KeyFn<T> | ItemTemplate<T>,
        ItemTemplate<T>
    ]): unknown[] | typeof noChange;
}
export interface RepeatDirectiveFn {
    <T>(items: Iterable<T>, keyFnOrTemplate: KeyFn<T> | ItemTemplate<T>, template?: ItemTemplate<T>): unknown;
    <T>(items: Iterable<T>, template: ItemTemplate<T>): unknown;
    <T>(items: Iterable<T>, keyFn: KeyFn<T> | ItemTemplate<T>, template: ItemTemplate<T>): unknown;
}
/**
 * A directive that repeats a series of values (usually `TemplateResults`)
 * generated from an iterable, and updates those items efficiently when the
 * iterable changes based on user-provided `keys` associated with each item.
 *
 * Note that if a `keyFn` is provided, strict key-to-DOM mapping is maintained,
 * meaning previous DOM for a given key is moved into the new position if
 * needed, and DOM will never be reused with values for different keys (new DOM
 * will always be created for new keys). This is generally the most efficient
 * way to use `repeat` since it performs minimum unnecessary work for insertions
 * and removals.
 *
 * The `keyFn` takes two parameters, the item and its index, and returns a unique key value.
 *
 * ```js
 * html`
 *   <ol>
 *     ${repeat(this.items, (item) => item.id, (item, index) => {
 *       return html`<li>${index}: ${item.name}</li>`;
 *     })}
 *   </ol>
 * `
 * ```
 *
 * **Important**: If providing a `keyFn`, keys *must* be unique for all items in a
 * given call to `repeat`. The behavior when two or more items have the same key
 * is undefined.
 *
 * If no `keyFn` is provided, this directive will perform similar to mapping
 * items to values, and DOM will be reused against potentially different items.
 */
export declare const repeat: RepeatDirectiveFn;
/**
 * The type of the class that powers this directive. Necessary for naming the
 * directive's return type.
 */
export type { RepeatDirective };
//# sourceMappingURL=repeat.d.ts.map