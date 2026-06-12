/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type { Directive } from './directive.js';
import type { TrustedHTML } from 'trusted-types/lib/index.js';
/**
 * Contains types that are part of the unstable debug API.
 *
 * Everything in this API is not stable and may change or be removed in the future,
 * even on patch releases.
 */
export declare namespace LitUnstable {
    /**
     * When Lit is running in dev mode and `window.emitLitDebugLogEvents` is true,
     * we will emit 'lit-debug' events to window, with live details about the update and render
     * lifecycle. These can be useful for writing debug tooling and visualizations.
     *
     * Please be aware that running with window.emitLitDebugLogEvents has performance overhead,
     * making certain operations that are normally very cheap (like a no-op render) much slower,
     * because we must copy data and dispatch events.
     */
    namespace DebugLog {
        type Entry = TemplatePrep | TemplateInstantiated | TemplateInstantiatedAndUpdated | TemplateUpdating | BeginRender | EndRender | CommitPartEntry | SetPartValue;
        interface TemplatePrep {
            kind: 'template prep';
            template: Template;
            strings: TemplateStringsArray;
            clonableTemplate: HTMLTemplateElement;
            parts: TemplatePart[];
        }
        interface BeginRender {
            kind: 'begin render';
            id: number;
            value: unknown;
            container: RenderRootNode;
            options: RenderOptions | undefined;
            part: ChildPart | undefined;
        }
        interface EndRender {
            kind: 'end render';
            id: number;
            value: unknown;
            container: RenderRootNode;
            options: RenderOptions | undefined;
            part: ChildPart;
        }
        interface TemplateInstantiated {
            kind: 'template instantiated';
            template: Template | CompiledTemplate;
            instance: TemplateInstance;
            options: RenderOptions | undefined;
            fragment: Node;
            parts: Array<Part | undefined>;
            values: unknown[];
        }
        interface TemplateInstantiatedAndUpdated {
            kind: 'template instantiated and updated';
            template: Template | CompiledTemplate;
            instance: TemplateInstance;
            options: RenderOptions | undefined;
            fragment: Node;
            parts: Array<Part | undefined>;
            values: unknown[];
        }
        interface TemplateUpdating {
            kind: 'template updating';
            template: Template | CompiledTemplate;
            instance: TemplateInstance;
            options: RenderOptions | undefined;
            parts: Array<Part | undefined>;
            values: unknown[];
        }
        interface SetPartValue {
            kind: 'set part';
            part: Part;
            value: unknown;
            valueIndex: number;
            values: unknown[];
            templateInstance: TemplateInstance;
        }
        type CommitPartEntry = CommitNothingToChildEntry | CommitText | CommitNode | CommitAttribute | CommitProperty | CommitBooleanAttribute | CommitEventListener | CommitToElementBinding;
        interface CommitNothingToChildEntry {
            kind: 'commit nothing to child';
            start: ChildNode;
            end: ChildNode | null;
            parent: Disconnectable | undefined;
            options: RenderOptions | undefined;
        }
        interface CommitText {
            kind: 'commit text';
            node: Text;
            value: unknown;
            options: RenderOptions | undefined;
        }
        interface CommitNode {
            kind: 'commit node';
            start: Node;
            parent: Disconnectable | undefined;
            value: Node;
            options: RenderOptions | undefined;
        }
        interface CommitAttribute {
            kind: 'commit attribute';
            element: Element;
            name: string;
            value: unknown;
            options: RenderOptions | undefined;
        }
        interface CommitProperty {
            kind: 'commit property';
            element: Element;
            name: string;
            value: unknown;
            options: RenderOptions | undefined;
        }
        interface CommitBooleanAttribute {
            kind: 'commit boolean attribute';
            element: Element;
            name: string;
            value: boolean;
            options: RenderOptions | undefined;
        }
        interface CommitEventListener {
            kind: 'commit event listener';
            element: Element;
            name: string;
            value: unknown;
            oldListener: unknown;
            options: RenderOptions | undefined;
            removeListener: boolean;
            addListener: boolean;
        }
        interface CommitToElementBinding {
            kind: 'commit to element binding';
            element: Element;
            value: unknown;
            options: RenderOptions | undefined;
        }
    }
}
/**
 * Used to sanitize any value before it is written into the DOM. This can be
 * used to implement a security policy of allowed and disallowed values in
 * order to prevent XSS attacks.
 *
 * One way of using this callback would be to check attributes and properties
 * against a list of high risk fields, and require that values written to such
 * fields be instances of a class which is safe by construction. Closure's Safe
 * HTML Types is one implementation of this technique (
 * https://github.com/google/safe-html-types/blob/master/doc/safehtml-types.md).
 * The TrustedTypes polyfill in API-only mode could also be used as a basis
 * for this technique (https://github.com/WICG/trusted-types).
 *
 * @param node The HTML node (usually either a #text node or an Element) that
 *     is being written to. Note that this is just an exemplar node, the write
 *     may take place against another instance of the same class of node.
 * @param name The name of an attribute or property (for example, 'href').
 * @param type Indicates whether the write that's about to be performed will
 *     be to a property or a node.
 * @return A function that will sanitize this class of writes.
 */
export type SanitizerFactory = (node: Node, name: string, type: 'property' | 'attribute') => ValueSanitizer;
/**
 * A function which can sanitize values that will be written to a specific kind
 * of DOM sink.
 *
 * See SanitizerFactory.
 *
 * @param value The value to sanitize. Will be the actual value passed into
 *     the lit-html template literal, so this could be of any type.
 * @return The value to write to the DOM. Usually the same as the input value,
 *     unless sanitization is needed.
 */
export type ValueSanitizer = (value: unknown) => unknown;
/** TemplateResult types */
declare const HTML_RESULT = 1;
declare const SVG_RESULT = 2;
declare const MATHML_RESULT = 3;
type ResultType = typeof HTML_RESULT | typeof SVG_RESULT | typeof MATHML_RESULT;
declare const ATTRIBUTE_PART = 1;
declare const CHILD_PART = 2;
declare const PROPERTY_PART = 3;
declare const BOOLEAN_ATTRIBUTE_PART = 4;
declare const EVENT_PART = 5;
declare const ELEMENT_PART = 6;
declare const COMMENT_PART = 7;
/**
 * The return type of the template tag functions, {@linkcode html} and
 * {@linkcode svg} when it hasn't been compiled by @lit-labs/compiler.
 *
 * A `TemplateResult` object holds all the information about a template
 * expression required to render it: the template strings, expression values,
 * and type of template (html or svg).
 *
 * `TemplateResult` objects do not create any DOM on their own. To create or
 * update DOM you need to render the `TemplateResult`. See
 * [Rendering](https://lit.dev/docs/components/rendering) for more information.
 *
 */
export type UncompiledTemplateResult<T extends ResultType = ResultType> = {
    ['_$litType$']: T;
    strings: TemplateStringsArray;
    values: unknown[];
};
/**
 * This is a template result that may be either uncompiled or compiled.
 *
 * In the future, TemplateResult will be this type. If you want to explicitly
 * note that a template result is potentially compiled, you can reference this
 * type and it will continue to behave the same through the next major version
 * of Lit. This can be useful for code that wants to prepare for the next
 * major version of Lit.
 */
export type MaybeCompiledTemplateResult<T extends ResultType = ResultType> = UncompiledTemplateResult<T> | CompiledTemplateResult;
/**
 * The return type of the template tag functions, {@linkcode html} and
 * {@linkcode svg}.
 *
 * A `TemplateResult` object holds all the information about a template
 * expression required to render it: the template strings, expression values,
 * and type of template (html or svg).
 *
 * `TemplateResult` objects do not create any DOM on their own. To create or
 * update DOM you need to render the `TemplateResult`. See
 * [Rendering](https://lit.dev/docs/components/rendering) for more information.
 *
 * In Lit 4, this type will be an alias of
 * MaybeCompiledTemplateResult, so that code will get type errors if it assumes
 * that Lit templates are not compiled. When deliberately working with only
 * one, use either {@linkcode CompiledTemplateResult} or
 * {@linkcode UncompiledTemplateResult} explicitly.
 */
export type TemplateResult<T extends ResultType = ResultType> = UncompiledTemplateResult<T>;
export type HTMLTemplateResult = TemplateResult<typeof HTML_RESULT>;
export type SVGTemplateResult = TemplateResult<typeof SVG_RESULT>;
export type MathMLTemplateResult = TemplateResult<typeof MATHML_RESULT>;
/**
 * A TemplateResult that has been compiled by @lit-labs/compiler, skipping the
 * prepare step.
 */
export interface CompiledTemplateResult {
    ['_$litType$']: CompiledTemplate;
    values: unknown[];
}
export interface CompiledTemplate extends Omit<Template, 'el'> {
    el?: HTMLTemplateElement;
    h: TemplateStringsArray;
}
/**
 * Interprets a template literal as an HTML template that can efficiently
 * render to and update a container.
 *
 * ```ts
 * const header = (title: string) => html`<h1>${title}</h1>`;
 * ```
 *
 * The `html` tag returns a description of the DOM to render as a value. It is
 * lazy, meaning no work is done until the template is rendered. When rendering,
 * if a template comes from the same expression as a previously rendered result,
 * it's efficiently updated instead of replaced.
 */
export declare const html: (strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult<1>;
/**
 * Interprets a template literal as an SVG fragment that can efficiently render
 * to and update a container.
 *
 * ```ts
 * const rect = svg`<rect width="10" height="10"></rect>`;
 *
 * const myImage = html`
 *   <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
 *     ${rect}
 *   </svg>`;
 * ```
 *
 * The `svg` *tag function* should only be used for SVG fragments, or elements
 * that would be contained **inside** an `<svg>` HTML element. A common error is
 * placing an `<svg>` *element* in a template tagged with the `svg` tag
 * function. The `<svg>` element is an HTML element and should be used within a
 * template tagged with the {@linkcode html} tag function.
 *
 * In LitElement usage, it's invalid to return an SVG fragment from the
 * `render()` method, as the SVG fragment will be contained within the element's
 * shadow root and thus not be properly contained within an `<svg>` HTML
 * element.
 */
export declare const svg: (strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult<2>;
/**
 * Interprets a template literal as MathML fragment that can efficiently render
 * to and update a container.
 *
 * ```ts
 * const num = mathml`<mn>1</mn>`;
 *
 * const eq = html`
 *   <math>
 *     ${num}
 *   </math>`;
 * ```
 *
 * The `mathml` *tag function* should only be used for MathML fragments, or
 * elements that would be contained **inside** a `<math>` HTML element. A common
 * error is placing a `<math>` *element* in a template tagged with the `mathml`
 * tag function. The `<math>` element is an HTML element and should be used
 * within a template tagged with the {@linkcode html} tag function.
 *
 * In LitElement usage, it's invalid to return an MathML fragment from the
 * `render()` method, as the MathML fragment will be contained within the
 * element's shadow root and thus not be properly contained within a `<math>`
 * HTML element.
 */
export declare const mathml: (strings: TemplateStringsArray, ...values: unknown[]) => TemplateResult<3>;
/**
 * A sentinel value that signals that a value was handled by a directive and
 * should not be written to the DOM.
 */
export declare const noChange: unique symbol;
/**
 * A sentinel value that signals a ChildPart to fully clear its content.
 *
 * ```ts
 * const button = html`${
 *  user.isAdmin
 *    ? html`<button>DELETE</button>`
 *    : nothing
 * }`;
 * ```
 *
 * Prefer using `nothing` over other falsy values as it provides a consistent
 * behavior between various expression binding contexts.
 *
 * In child expressions, `undefined`, `null`, `''`, and `nothing` all behave the
 * same and render no nodes. In attribute expressions, `nothing` _removes_ the
 * attribute, while `undefined` and `null` will render an empty string. In
 * property expressions `nothing` becomes `undefined`.
 */
export declare const nothing: unique symbol;
/**
 * Object specifying options for controlling lit-html rendering. Note that
 * while `render` may be called multiple times on the same `container` (and
 * `renderBefore` reference node) to efficiently update the rendered content,
 * only the options passed in during the first render are respected during
 * the lifetime of renders to that unique `container` + `renderBefore`
 * combination.
 */
export interface RenderOptions {
    /**
     * An object to use as the `this` value for event listeners. It's often
     * useful to set this to the host component rendering a template.
     */
    host?: object;
    /**
     * A DOM node before which to render content in the container.
     */
    renderBefore?: ChildNode | null;
    /**
     * Node used for cloning the template (`importNode` will be called on this
     * node). This controls the `ownerDocument` of the rendered DOM, along with
     * any inherited context. Defaults to the global `document`.
     */
    creationScope?: {
        importNode(node: Node, deep?: boolean): Node;
    };
    /**
     * The initial connected state for the top-level part being rendered. If no
     * `isConnected` option is set, `AsyncDirective`s will be connected by
     * default. Set to `false` if the initial render occurs in a disconnected tree
     * and `AsyncDirective`s should see `isConnected === false` for their initial
     * render. The `part.setConnected()` method must be used subsequent to initial
     * render to change the connected state of the part.
     */
    isConnected?: boolean;
}
/**
 * The root DOM node for rendering.
 */
export type RenderRootNode = HTMLElement | SVGElement | DocumentFragment;
export interface DirectiveParent {
    _$parent?: DirectiveParent;
    _$isConnected: boolean;
    __directive?: Directive;
    __directives?: Array<Directive | undefined>;
}
declare class Template {
    parts: Array<TemplatePart>;
    constructor({ strings, ['_$litType$']: type }: UncompiledTemplateResult, options?: RenderOptions);
    /** @nocollapse */
    static createElement(html: TrustedHTML, _options?: RenderOptions): HTMLTemplateElement;
}
export interface Disconnectable {
    _$parent?: Disconnectable;
    _$disconnectableChildren?: Set<Disconnectable>;
    _$isConnected: boolean;
}
declare function resolveDirective(part: ChildPart | AttributePart | ElementPart, value: unknown, parent?: DirectiveParent, attributeIndex?: number): unknown;
export type { TemplateInstance };
/**
 * An updateable instance of a Template. Holds references to the Parts used to
 * update the template instance.
 */
declare class TemplateInstance implements Disconnectable {
    _$template: Template;
    _$parts: Array<Part | undefined>;
    constructor(template: Template, parent: ChildPart);
    get parentNode(): Node;
    get _$isConnected(): boolean;
    _clone(options: RenderOptions | undefined): Node;
    _update(values: Array<unknown>): void;
}
type AttributeTemplatePart = {
    readonly type: typeof ATTRIBUTE_PART;
    readonly index: number;
    readonly name: string;
    readonly ctor: typeof AttributePart;
    readonly strings: ReadonlyArray<string>;
};
type ChildTemplatePart = {
    readonly type: typeof CHILD_PART;
    readonly index: number;
};
type ElementTemplatePart = {
    readonly type: typeof ELEMENT_PART;
    readonly index: number;
};
type CommentTemplatePart = {
    readonly type: typeof COMMENT_PART;
    readonly index: number;
};
/**
 * A TemplatePart represents a dynamic part in a template, before the template
 * is instantiated. When a template is instantiated Parts are created from
 * TemplateParts.
 */
type TemplatePart = ChildTemplatePart | AttributeTemplatePart | ElementTemplatePart | CommentTemplatePart;
export type Part = ChildPart | AttributePart | PropertyPart | BooleanAttributePart | ElementPart | EventPart;
export type { ChildPart };
declare class ChildPart implements Disconnectable {
    readonly type = 2;
    readonly options: RenderOptions | undefined;
    _$committedValue: unknown;
    private _textSanitizer;
    get _$isConnected(): boolean;
    constructor(startNode: ChildNode, endNode: ChildNode | null, parent: TemplateInstance | ChildPart | undefined, options: RenderOptions | undefined);
    /**
     * The parent node into which the part renders its content.
     *
     * A ChildPart's content consists of a range of adjacent child nodes of
     * `.parentNode`, possibly bordered by 'marker nodes' (`.startNode` and
     * `.endNode`).
     *
     * - If both `.startNode` and `.endNode` are non-null, then the part's content
     * consists of all siblings between `.startNode` and `.endNode`, exclusively.
     *
     * - If `.startNode` is non-null but `.endNode` is null, then the part's
     * content consists of all siblings following `.startNode`, up to and
     * including the last child of `.parentNode`. If `.endNode` is non-null, then
     * `.startNode` will always be non-null.
     *
     * - If both `.endNode` and `.startNode` are null, then the part's content
     * consists of all child nodes of `.parentNode`.
     */
    get parentNode(): Node;
    /**
     * The part's leading marker node, if any. See `.parentNode` for more
     * information.
     */
    get startNode(): Node | null;
    /**
     * The part's trailing marker node, if any. See `.parentNode` for more
     * information.
     */
    get endNode(): Node | null;
    _$setValue(value: unknown, directiveParent?: DirectiveParent): void;
    private _insert;
    private _commitNode;
    private _commitText;
    private _commitTemplateResult;
    private _commitIterable;
}
/**
 * A top-level `ChildPart` returned from `render` that manages the connected
 * state of `AsyncDirective`s created throughout the tree below it.
 */
export interface RootPart extends ChildPart {
    /**
     * Sets the connection state for `AsyncDirective`s contained within this root
     * ChildPart.
     *
     * lit-html does not automatically monitor the connectedness of DOM rendered;
     * as such, it is the responsibility of the caller to `render` to ensure that
     * `part.setConnected(false)` is called before the part object is potentially
     * discarded, to ensure that `AsyncDirective`s have a chance to dispose of
     * any resources being held. If a `RootPart` that was previously
     * disconnected is subsequently re-connected (and its `AsyncDirective`s should
     * re-connect), `setConnected(true)` should be called.
     *
     * @param isConnected Whether directives within this tree should be connected
     * or not
     */
    setConnected(isConnected: boolean): void;
}
export type { AttributePart };
declare class AttributePart implements Disconnectable {
    readonly type: typeof ATTRIBUTE_PART | typeof PROPERTY_PART | typeof BOOLEAN_ATTRIBUTE_PART | typeof EVENT_PART;
    readonly element: HTMLElement;
    readonly name: string;
    readonly options: RenderOptions | undefined;
    /**
     * If this attribute part represents an interpolation, this contains the
     * static strings of the interpolation. For single-value, complete bindings,
     * this is undefined.
     */
    readonly strings?: ReadonlyArray<string>;
    protected _sanitizer: ValueSanitizer | undefined;
    get tagName(): string;
    get _$isConnected(): boolean;
    constructor(element: HTMLElement, name: string, strings: ReadonlyArray<string>, parent: Disconnectable, options: RenderOptions | undefined);
}
export type { PropertyPart };
declare class PropertyPart extends AttributePart {
    readonly type = 3;
}
export type { BooleanAttributePart };
declare class BooleanAttributePart extends AttributePart {
    readonly type = 4;
}
/**
 * An AttributePart that manages an event listener via add/removeEventListener.
 *
 * This part works by adding itself as the event listener on an element, then
 * delegating to the value passed to it. This reduces the number of calls to
 * add/removeEventListener if the listener changes frequently, such as when an
 * inline function is used as a listener.
 *
 * Because event options are passed when adding listeners, we must take case
 * to add and remove the part as a listener when the event options change.
 */
export type { EventPart };
declare class EventPart extends AttributePart {
    readonly type = 5;
    constructor(element: HTMLElement, name: string, strings: ReadonlyArray<string>, parent: Disconnectable, options: RenderOptions | undefined);
    handleEvent(event: Event): void;
}
export type { ElementPart };
declare class ElementPart implements Disconnectable {
    element: Element;
    readonly type = 6;
    _$committedValue: undefined;
    options: RenderOptions | undefined;
    constructor(element: Element, parent: Disconnectable, options: RenderOptions | undefined);
    get _$isConnected(): boolean;
    _$setValue(value: unknown): void;
}
/**
 * END USERS SHOULD NOT RELY ON THIS OBJECT.
 *
 * Private exports for use by other Lit packages, not intended for use by
 * external users.
 *
 * We currently do not make a mangled rollup build of the lit-ssr code. In order
 * to keep a number of (otherwise private) top-level exports mangled in the
 * client side code, we export a _$LH object containing those members (or
 * helper methods for accessing private fields of those members), and then
 * re-export them for use in lit-ssr. This keeps lit-ssr agnostic to whether the
 * client-side code is being used in `dev` mode or `prod` mode.
 *
 * This has a unique name, to disambiguate it from private exports in
 * lit-element, which re-exports all of lit-html.
 *
 * @private
 */
export declare const _$LH: {
    _boundAttributeSuffix: string;
    _marker: string;
    _markerMatch: string;
    _HTML_RESULT: number;
    _getTemplateHtml: (strings: TemplateStringsArray, type: ResultType) => [TrustedHTML, Array<string>];
    _TemplateInstance: typeof TemplateInstance;
    _isIterable: (value: unknown) => value is Iterable<unknown>;
    _resolveDirective: typeof resolveDirective;
    _ChildPart: typeof ChildPart;
    _AttributePart: typeof AttributePart;
    _BooleanAttributePart: typeof BooleanAttributePart;
    _EventPart: typeof EventPart;
    _PropertyPart: typeof PropertyPart;
    _ElementPart: typeof ElementPart;
};
/**
 * Renders a value, usually a lit-html TemplateResult, to the container.
 *
 * This example renders the text "Hello, Zoe!" inside a paragraph tag, appending
 * it to the container `document.body`.
 *
 * ```js
 * import {html, render} from 'lit';
 *
 * const name = "Zoe";
 * render(html`<p>Hello, ${name}!</p>`, document.body);
 * ```
 *
 * @param value Any [renderable
 *   value](https://lit.dev/docs/templates/expressions/#child-expressions),
 *   typically a {@linkcode TemplateResult} created by evaluating a template tag
 *   like {@linkcode html} or {@linkcode svg}.
 * @param container A DOM container to render to. The first render will append
 *   the rendered value to the container, and subsequent renders will
 *   efficiently update the rendered value if the same result type was
 *   previously rendered there.
 * @param options See {@linkcode RenderOptions} for options documentation.
 * @see
 * {@link https://lit.dev/docs/libraries/standalone-templates/#rendering-lit-html-templates| Rendering Lit HTML Templates}
 */
export declare const render: {
    (value: unknown, container: RenderRootNode, options?: RenderOptions): RootPart;
    setSanitizer: (newSanitizer: SanitizerFactory) => void;
    createSanitizer: SanitizerFactory;
    _testOnlyClearSanitizerFactoryDoNotCallOrElse: () => void;
};
//# sourceMappingURL=lit-html.d.ts.map