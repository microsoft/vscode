/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import { Disconnectable, Part } from './lit-html.js';
export { AttributePart, BooleanAttributePart, ChildPart, ElementPart, EventPart, Part, PropertyPart, } from './lit-html.js';
export interface DirectiveClass {
    new (part: PartInfo): Directive;
}
/**
 * This utility type extracts the signature of a directive class's render()
 * method so we can use it for the type of the generated directive function.
 */
export type DirectiveParameters<C extends Directive> = Parameters<C['render']>;
/**
 * A generated directive function doesn't evaluate the directive, but just
 * returns a DirectiveResult object that captures the arguments.
 */
export interface DirectiveResult<C extends DirectiveClass = DirectiveClass> {
}
export declare const PartType: {
    readonly ATTRIBUTE: 1;
    readonly CHILD: 2;
    readonly PROPERTY: 3;
    readonly BOOLEAN_ATTRIBUTE: 4;
    readonly EVENT: 5;
    readonly ELEMENT: 6;
};
export type PartType = (typeof PartType)[keyof typeof PartType];
export interface ChildPartInfo {
    readonly type: typeof PartType.CHILD;
}
export interface AttributePartInfo {
    readonly type: typeof PartType.ATTRIBUTE | typeof PartType.PROPERTY | typeof PartType.BOOLEAN_ATTRIBUTE | typeof PartType.EVENT;
    readonly strings?: ReadonlyArray<string>;
    readonly name: string;
    readonly tagName: string;
}
export interface ElementPartInfo {
    readonly type: typeof PartType.ELEMENT;
}
/**
 * Information about the part a directive is bound to.
 *
 * This is useful for checking that a directive is attached to a valid part,
 * such as with directive that can only be used on attribute bindings.
 */
export type PartInfo = ChildPartInfo | AttributePartInfo | ElementPartInfo;
/**
 * Creates a user-facing directive function from a Directive class. This
 * function has the same parameters as the directive's render() method.
 */
export declare const directive: <C extends DirectiveClass>(c: C) => (...values: DirectiveParameters<InstanceType<C>>) => DirectiveResult<C>;
/**
 * Base class for creating custom directives. Users should extend this class,
 * implement `render` and/or `update`, and then pass their subclass to
 * `directive`.
 */
export declare abstract class Directive implements Disconnectable {
    constructor(_partInfo: PartInfo);
    get _$isConnected(): boolean;
    abstract render(...props: Array<unknown>): unknown;
    update(_part: Part, props: Array<unknown>): unknown;
}
//# sourceMappingURL=directive.d.ts.map