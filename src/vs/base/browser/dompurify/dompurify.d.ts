// Type definitions for DOM Purify 2.2
// Project: https://github.com/cure53/DOMPurify
// Definitions by: Dave Taylor https://github.com/davetayls
//                 Samira Bazuzi <https://github.com/bazuzi>
//                 FlowCrypt <https://github.com/FlowCrypt>
//                 Exigerr <https://github.com/Exigerr>
//                 Piotr Błażejewicz <https://github.com/peterblazejewicz>
//                 Nicholas Ellul <https://github.com/NicholasEllul>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

export as namespace DOMPurify;
export = DOMPurify;

declare const DOMPurify: createDOMPurifyI;

interface createDOMPurifyI extends DOMPurify.DOMPurifyI {
	(window?: Window): DOMPurify.DOMPurifyI;
}

declare namespace DOMPurify {
	interface DOMPurifyI {
		sanitize(source: string | Node): string;
		sanitize(source: string | Node, config: Config & { RETURN_TRUSTED_TYPE: true }): TrustedHTML;
		sanitize(source: string | Node, config: Config & { RETURN_DOM_FRAGMENT?: false | undefined; RETURN_DOM?: false | undefined }): string;
		sanitize(source: string | Node, config: Config & { RETURN_DOM_FRAGMENT: true }): DocumentFragment;
		sanitize(source: string | Node, config: Config & { RETURN_DOM: true }): HTMLElement;
		sanitize(source: string | Node, config: Config): string | HTMLElement | DocumentFragment;

		addHook(hook: 'uponSanitizeElement', cb: (currentNode: Element, data: SanitizeElementHookEvent, config: Config) => void): void;
		addHook(hook: 'uponSanitizeAttribute', cb: (currentNode: Element, data: SanitizeAttributeHookEvent, config: Config) => void): void;
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
		ALLOW_DATA_ATTR?: boolean | undefined;
		ALLOWED_ATTR?: string[] | undefined;
		ALLOWED_TAGS?: string[] | undefined;
		FORBID_ATTR?: string[] | undefined;
		FORBID_TAGS?: string[] | undefined;
		FORCE_BODY?: boolean | undefined;
		KEEP_CONTENT?: boolean | undefined;
		/**
		 * change the default namespace from HTML to something different
		 */
		NAMESPACE?: string | undefined;
		RETURN_DOM?: boolean | undefined;
		RETURN_DOM_FRAGMENT?: boolean | undefined;
		/**
		 * This defaults to `true` starting DOMPurify 2.2.0. Note that setting it to `false`
		 * might cause XSS from attacks hidden in closed shadowroots in case the browser
		 * supports Declarative Shadow: DOM https://web.dev/declarative-shadow-dom/
		 */
		RETURN_DOM_IMPORT?: boolean | undefined;
		RETURN_TRUSTED_TYPE?: boolean | undefined;
		SANITIZE_DOM?: boolean | undefined;
		WHOLE_DOCUMENT?: boolean | undefined;
		ALLOWED_URI_REGEXP?: RegExp | undefined;
		SAFE_FOR_TEMPLATES?: boolean | undefined;
		ALLOW_UNKNOWN_PROTOCOLS?: boolean | undefined;
		USE_PROFILES?: false | { mathMl?: boolean | undefined; svg?: boolean | undefined; svgFilters?: boolean | undefined; html?: boolean | undefined } | undefined;
		IN_PLACE?: boolean | undefined;
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
