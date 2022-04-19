/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/109277

	/**
	 * Details if an `ExternalUriOpener` can open a uri.
	 *
	 * The priority is also used to rank multiple openers against each other and determine
	 * if an opener should be selected automatically or if the user should be prompted to
	 * select an opener.
	 *
	 * The editor will try to use the best available opener, as sorted by `ExternalUriOpenerPriority`.
	 * If there are multiple potential "best" openers for a URI, then the user will be prompted
	 * to select an opener.
	 */
	export enum ExternalUriOpenerPriority {
		/**
		 * The opener is disabled and will never be shown to users.
		 *
		 * Note that the opener can still be used if the user specifically
		 * configures it in their settings.
		 */
		None = 0,

		/**
		 * The opener can open the uri but will not cause a prompt on its own
		 * since the editor always contributes a built-in `Default` opener.
		 */
		Option = 1,

		/**
		 * The opener can open the uri.
		 *
		 * The editor's built-in opener has `Default` priority. This means that any additional `Default`
		 * openers will cause the user to be prompted to select from a list of all potential openers.
		 */
		Default = 2,

		/**
		 * The opener can open the uri and should be automatically selected over any
		 * default openers, include the built-in one from the editor.
		 *
		 * A preferred opener will be automatically selected if no other preferred openers
		 * are available. If multiple preferred openers are available, then the user
		 * is shown a prompt with all potential openers (not just preferred openers).
		 */
		Preferred = 3,
	}

	/**
	 * Handles opening uris to external resources, such as http(s) links.
	 *
	 * Extensions can implement an `ExternalUriOpener` to open `http` links to a webserver
	 * inside of the editor instead of having the link be opened by the web browser.
	 *
	 * Currently openers may only be registered for `http` and `https` uris.
	 */
	export interface ExternalUriOpener {

		/**
		 * Check if the opener can open a uri.
		 *
		 * @param uri The uri being opened. This is the uri that the user clicked on. It has
		 * not yet gone through port forwarding.
		 * @param token Cancellation token indicating that the result is no longer needed.
		 *
		 * @return Priority indicating if the opener can open the external uri.
		 */
		canOpenExternalUri(uri: Uri, token: CancellationToken): ExternalUriOpenerPriority | Thenable<ExternalUriOpenerPriority>;

		/**
		 * Open a uri.
		 *
		 * This is invoked when:
		 *
		 * - The user clicks a link which does not have an assigned opener. In this case, first `canOpenExternalUri`
		 *   is called and if the user selects this opener, then `openExternalUri` is called.
		 * - The user sets the default opener for a link in their settings and then visits a link.
		 *
		 * @param resolvedUri The uri to open. This uri may have been transformed by port forwarding, so it
		 * may not match the original uri passed to `canOpenExternalUri`. Use `ctx.originalUri` to check the
		 * original uri.
		 * @param ctx Additional information about the uri being opened.
		 * @param token Cancellation token indicating that opening has been canceled.
		 *
		 * @return Thenable indicating that the opening has completed.
		 */
		openExternalUri(resolvedUri: Uri, ctx: OpenExternalUriContext, token: CancellationToken): Thenable<void> | void;
	}

	/**
	 * Additional information about the uri being opened.
	 */
	interface OpenExternalUriContext {
		/**
		 * The uri that triggered the open.
		 *
		 * This is the original uri that the user clicked on or that was passed to `openExternal.`
		 * Due to port forwarding, this may not match the `resolvedUri` passed to `openExternalUri`.
		 */
		readonly sourceUri: Uri;
	}

	/**
	 * Additional metadata about a registered `ExternalUriOpener`.
	 */
	interface ExternalUriOpenerMetadata {

		/**
		 * List of uri schemes the opener is triggered for.
		 *
		 * Currently only `http` and `https` are supported.
		 */
		readonly schemes: readonly string[];

		/**
		 * Text displayed to the user that explains what the opener does.
		 *
		 * For example, 'Open in browser preview'
		 */
		readonly label: string;
	}

	namespace window {
		/**
		 * Register a new `ExternalUriOpener`.
		 *
		 * When a uri is about to be opened, an `onOpenExternalUri:SCHEME` activation event is fired.
		 *
		 * @param id Unique id of the opener, such as `myExtension.browserPreview`. This is used in settings
		 *   and commands to identify the opener.
		 * @param opener Opener to register.
		 * @param metadata Additional information about the opener.
		 *
		* @returns Disposable that unregisters the opener.
		*/
		export function registerExternalUriOpener(id: string, opener: ExternalUriOpener, metadata: ExternalUriOpenerMetadata): Disposable;
	}

	interface OpenExternalOptions {
		/**
		 * Allows using openers contributed by extensions through  `registerExternalUriOpener`
		 * when opening the resource.
		 *
		 * If `true`, the editor will check if any contributed openers can handle the
		 * uri, and fallback to the default opener behavior.
		 *
		 * If it is string, this specifies the id of the `ExternalUriOpener`
		 * that should be used if it is available. Use `'default'` to force the editor's
		 * standard external opener to be used.
		 */
		readonly allowContributedOpeners?: boolean | string;
	}

	namespace env {
		export function openExternal(target: Uri, options?: OpenExternalOptions): Thenable<boolean>;
	}
}
