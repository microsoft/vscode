/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

// HACK: gulp-tsb doesn't play nice with importing from typings
// import { Terminal, ITerminalAddon } from 'xterm';
interface ILinkMatcherOptions {
	/**
	 * The index of the link from the regex.match(text) call. This defaults to 0
	 * (for regular expressions without capture groups).
	 */
	matchIndex?: number;

	/**
	 * A callback that validates whether to create an individual link, pass
	 * whether the link is valid to the callback.
	 */
	validationCallback?: (uri: string, callback: (isValid: boolean) => void) => void;

	/**
	 * A callback that fires when the mouse hovers over a link for a moment.
	 */
	tooltipCallback?: (event: MouseEvent, uri: string) => boolean | void;

	/**
	 * A callback that fires when the mouse leaves a link. Note that this can
	 * happen even when tooltipCallback hasn't fired for the link yet.
	 */
	leaveCallback?: () => void;

	/**
	 * The priority of the link matcher, this defines the order in which the link
	 * matcher is evaluated relative to others, from highest to lowest. The
	 * default value is 0.
	 */
	priority?: number;

	/**
	 * A callback that fires when the mousedown and click events occur that
	 * determines whether a link will be activated upon click. This enables
	 * only activating a link when a certain modifier is held down, if not the
	 * mouse event will continue propagation (eg. double click to select word).
	 */
	willLinkActivate?: (event: MouseEvent, uri: string) => boolean;
}

declare module 'xterm-addon-web-links' {
	/**
	 * An xterm.js addon that enables web links.
	 */
	export class WebLinksAddon {
		/**
		 * Creates a new web links addon.
		 * @param handler The callback when the link is called.
		 * @param options Options for the link matcher.
		 */
		constructor(handler?: (event: MouseEvent, uri: string) => void, options?: ILinkMatcherOptions);

		/**
		 * Activates the addon
		 * @param terminal The terminal the addon is being loaded in.
		 */
		public activate(terminal: any): void;

		/**
		 * Disposes the addon.
		 */
		public dispose(): void;
	}
}
