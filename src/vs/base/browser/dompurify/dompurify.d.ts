// Type definitions for DOM Purify 3.0
// Project: https://github.com/cure53/DOMPurify
// Definitions by: Dave Taylor https://github.com/davetayls
//                 Samira Bazuzi <https://github.com/bazuzi>
//                 FlowCrypt <https://github.com/FlowCrypt>
//                 Exigerr <https://github.com/Exigerr>
//                 Piotr Błażejewicz <https://github.com/peterblazejewicz>
//                 Nicholas Ellul <https://github.com/NicholasEllul>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// Minimum TypeScript Version: 4.5

export as namespace DOMPurify;
export = DOMPurify;

declare const DOMPurify: createDOMPurifyI;

type WindowLike = Pick<
	typeof globalThis,
	| 'NodeFilter'
	| 'Node'
	| 'Element'
	| 'HTMLTemplateElement'
	| 'DocumentFragment'
	| 'HTMLFormElement'
	| 'DOMParser'
	| 'NamedNodeMap'
>;

interface createDOMPurifyI extends DOMPurify.DOMPurifyI {
	(window?: Window | WindowLike): DOMPurify.DOMPurifyI;
}

declare namespace DOMPurify {
	interface DOMPurifyI {
		sanitize(source: string | Node): string;
		sanitize(source: string | Node, config: Config & { RETURN_TRUSTED_TYPE: true }): TrustedHTML;
		sanitize(
			source: string | Node,
			config: Config & { RETURN_DOM_FRAGMENT?: false | undefined; RETURN_DOM?: false | undefined },
		): string;
		sanitize(source: string | Node, config: Config & { RETURN_DOM_FRAGMENT: true }): DocumentFragment;
		sanitize(source: string | Node, config: Config & { RETURN_DOM: true }): HTMLElement;
		sanitize(source: string | Node, config: Config): string | HTMLElement | DocumentFragment;

		addHook(
			hook: 'uponSanitizeElement',
			cb: (currentNode: Element, data: SanitizeElementHookEvent, config: Config) => void,
		): void;
		addHook(
			hook: 'uponSanitizeAttribute',
			cb: (currentNode: Element, data: SanitizeAttributeHookEvent, config: Config) => void,
		): void;
		addHook(hook: HookName, cb: (currentNode: Element, data: HookEvent, config: Config) => void): void;

		setConfig(cfg: Config): void;
		clearConfig(): void;
		isValidAttribute(tag: string, attr: string, value: string): boolean;

		removeHook(entryPoint: HookName): void;
		removeHooks(entryPoint: HookName): void;
		removeAllHooks(): void;

		version: string;
		removed: any[];
		isSupported: boolean;
	}

	interface Config {
		ADD_ATTR?: string[] | undefined;
		ADD_DATA_URI_TAGS?: string[] | undefined;
		ADD_TAGS?: string[] | undefined;
		ADD_URI_SAFE_ATTR?: string[] | undefined;
		ALLOW_ARIA_ATTR?: boolean | undefined;
		ALLOW_DATA_ATTR?: boolean | undefined;
		ALLOW_UNKNOWN_PROTOCOLS?: boolean | undefined;
		ALLOW_SELF_CLOSE_IN_ATTR?: boolean | undefined;
		ALLOWED_ATTR?: string[] | undefined;
		ALLOWED_TAGS?: string[] | undefined;
		ALLOWED_NAMESPACES?: string[] | undefined;
		ALLOWED_URI_REGEXP?: RegExp | undefined;
		FORBID_ATTR?: string[] | undefined;
		FORBID_CONTENTS?: string[] | undefined;
		FORBID_TAGS?: string[] | undefined;
		FORCE_BODY?: boolean | undefined;
		IN_PLACE?: boolean | undefined;
		KEEP_CONTENT?: boolean | undefined;
		/**
		 * change the default namespace from HTML to something different
		 */
		NAMESPACE?: string | undefined;
		PARSER_MEDIA_TYPE?: string | undefined;
		RETURN_DOM_FRAGMENT?: boolean | undefined;
		/**
		 * This defaults to `true` starting DOMPurify 2.2.0. Note that setting it to `false`
		 * might cause XSS from attacks hidden in closed shadowroots in case the browser
		 * supports Declarative Shadow: DOM https://web.dev/declarative-shadow-dom/
		 */
		RETURN_DOM_IMPORT?: boolean | undefined;
		RETURN_DOM?: boolean | undefined;
		RETURN_TRUSTED_TYPE?: boolean | undefined;
		SAFE_FOR_TEMPLATES?: boolean | undefined;
		SANITIZE_DOM?: boolean | undefined;
		/** @default false */
		SANITIZE_NAMED_PROPS?: boolean | undefined;
		USE_PROFILES?:
		| false
		| {
			mathMl?: boolean | undefined;
			svg?: boolean | undefined;
			svgFilters?: boolean | undefined;
			html?: boolean | undefined;
		}
		| undefined;
		WHOLE_DOCUMENT?: boolean | undefined;
		CUSTOM_ELEMENT_HANDLING?: {
			tagNameCheck?: RegExp | ((tagName: string) => boolean) | null | undefined;
			attributeNameCheck?: RegExp | ((lcName: string) => boolean) | null | undefined;
			allowCustomizedBuiltInElements?: boolean | undefined;
		};
	}

	type HookName =
		| 'beforeSanitizeElements'
		| 'uponSanitizeElement'
		| 'afterSanitizeElements'
		| 'beforeSanitizeAttributes'
		| 'uponSanitizeAttribute'
		| 'afterSanitizeAttributes'
		| 'beforeSanitizeShadowDOM'
		| 'uponSanitizeShadowNode'
		| 'afterSanitizeShadowDOM';

	type HookEvent = SanitizeElementHookEvent | SanitizeAttributeHookEvent | null;

	interface SanitizeElementHookEvent {
		tagName: string;
		allowedTags: { [key: string]: boolean };
	}

	interface SanitizeAttributeHookEvent {
		attrName: string;
		attrValue: string;
		keepAttr: boolean;
		allowedAttributes: { [key: string]: boolean };
		forceKeepAttr?: boolean | undefined;
	}
}
