/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * The semantic kind of a link presentation.
	 */
	export type LinkPresentationKind =
		| 'resource'
		| 'issue'
		| 'pullRequest'
		| 'commit'
		| 'file'
		| 'folder'
		| 'session'
		| 'chat'
		| 'repository'
		| 'branch';

	/**
	 * The semantic status of a link presentation.
	 */
	export type LinkPresentationStatusKind =
		| 'neutral'
		| 'pending'
		| 'success'
		| 'warning'
		| 'error'
		| 'open'
		| 'closed'
		| 'merged'
		| 'draft'
		| 'notPlanned';

	/**
	 * A status displayed as part of a link presentation.
	 */
	export interface LinkPresentationStatus {
		readonly kind: LinkPresentationStatusKind;
		readonly label: string;
	}

	/**
	 * Presentation data for a resource link.
	 */
	export interface LinkPresentationData {
		readonly kind: LinkPresentationKind;
		readonly title?: string;
		readonly detail?: string;
		readonly reference?: string;
		readonly status?: LinkPresentationStatus;
		readonly secondaryStatus?: LinkPresentationStatus;
		readonly changes?: {
			readonly insertions: number;
			readonly deletions: number;
		};
		readonly tooltip?: string;
		readonly ariaLabel?: string;
		/**
		 * Whether the provider is still resolving the current presentation.
		 */
		readonly isLoading?: boolean;
	}

	/**
	 * A rule that identifies links supported by a registered link presentation provider.
	 */
	export interface LinkPresentationRule {
		/**
		 * The identifier of the provider selected by this rule.
		 */
		readonly id: string;

		/**
		 * A regular expression matched against the canonical URI string.
		 */
		readonly uriPattern: RegExp;

		/**
		 * The semantic kind produced by this provider.
		 */
		readonly kind: LinkPresentationKind;
	}

	/**
	 * A live link presentation. Dispose the watcher when the presentation is no longer needed.
	 */
	export interface LinkPresentationWatcher extends Disposable {
		/**
		 * The current presentation.
		 */
		readonly presentation: LinkPresentationData;

		/**
		 * An event that fires when {@link presentation} changes.
		 */
		readonly onDidChangePresentation: Event<void>;
	}

	/**
	 * Provides live presentation data for matching resource links.
	 */
	export interface LinkPresentationProvider {
		/**
		 * Creates a watcher for `resource`.
		 */
		provideLinkPresentationWatcher(resource: Uri, token: CancellationToken): LinkPresentationWatcher;
	}

	export namespace window {
		/**
		 * The rules for currently available link presentation providers.
		 */
		export const linkPresentationRules: readonly LinkPresentationRule[];

		/**
		 * An event that fires when {@link linkPresentationRules} changes.
		 */
		export const onDidChangeLinkPresentationRules: Event<void>;

		/**
		 * Creates a live presentation watcher for `resource` using the provider identified by `id`.
		 *
		 * Throws when the provider is unavailable or its rule does not match `resource`.
		 */
		export function createLinkPresentationWatcher(id: string, resource: Uri): LinkPresentationWatcher;

		/**
		 * Registers the provider declared by `id` in the extension manifest.
		 */
		export function registerLinkPresentationProvider(id: string, provider: LinkPresentationProvider): Disposable;
	}
}
