/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	/**
	 * Defines a generalized way of reporing progress updates.
	 */
	export interface Progress<T> {

		/**
		 * Report a progress update.
		 * @param value A progress item, like a message or an updated percentage value
		 */
		report(value: T): void
	}

	export namespace window {

		/**
		 * Show window-wide progress, e.g. in the status bar, for the provided task. The task is
		 * considering running as long as the promise it returned isn't resolved or rejected.
		 *
		 * @param task A function callback that represents a long running operation.
		 */
		export function withWindowProgress<R>(title: string, task: (progress: Progress<string>, token: CancellationToken) => Thenable<R>): Thenable<R>;

		export function withScmProgress<R>(task: (progress: Progress<number>) => Thenable<R>): Thenable<R>;

		export function sampleFunction(): Thenable<any>;
	}

	export namespace window {

		/**
		 * Register a [TreeExplorerNodeProvider](#TreeExplorerNodeProvider).
		 *
		 * @param providerId A unique id that identifies the provider.
		 * @param provider A [TreeExplorerNodeProvider](#TreeExplorerNodeProvider).
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerTreeExplorerNodeProvider(providerId: string, provider: TreeExplorerNodeProvider<any>): Disposable;
	}

	/**
	 * A node provider for a tree explorer contribution.
	 *
	 * Providers are registered through (#window.registerTreeExplorerNodeProvider) with a
	 * `providerId` that corresponds to the `treeExplorerNodeProviderId` in the extension's
	 * `contributes.explorer` section.
	 *
	 * The contributed tree explorer will ask the corresponding provider to provide the root
	 * node and resolve children for each node. In addition, the provider could **optionally**
	 * provide the following information for each node:
	 * - label: A human-readable label used for rendering the node.
	 * - hasChildren: Whether the node has children and is expandable.
	 * - clickCommand: A command to execute when the node is clicked.
	 */
	export interface TreeExplorerNodeProvider<T> {

		/**
		 * Provide the root node. This function will be called when the tree explorer is activated
		 * for the first time. The root node is hidden and its direct children will be displayed on the first level of
		 * the tree explorer.
		 *
		 * @return The root node.
		 */
		provideRootNode(): T | Thenable<T>;

		/**
		 * Resolve the children of `node`.
		 *
		 * @param node The node from which the provider resolves children.
		 * @return Children of `node`.
		 */
		resolveChildren(node: T): T[] | Thenable<T[]>;

		/**
		 * Provide a human-readable string that will be used for rendering the node. Default to use
		 * `node.toString()` if not provided.
		 *
		 * @param node The node from which the provider computes label.
		 * @return A human-readable label.
		 */
		getLabel?(node: T): string;

		/**
		 * Determine if `node` has children and is expandable. Default to `true` if not provided.
		 *
		 * @param node The node to determine if it has children and is expandable.
		 * @return A boolean that determines if `node` has children and is expandable.
		 */
		getHasChildren?(node: T): boolean;

		/**
		 * Get the command to execute when `node` is clicked.
		 *
		 * Commands can be registered through [registerCommand](#commands.registerCommand). `node` will be provided
		 * as the first argument to the command's callback function.
		 *
		 * @param node The node that the command is associated with.
		 * @return The command to execute when `node` is clicked.
		 */
		getClickCommand?(node: T): string;
	}

	export interface SCMResourceThemableDecorations {
		readonly iconPath?: string | Uri;
	}

	export interface SCMResourceDecorations extends SCMResourceThemableDecorations {
		readonly strikeThrough?: boolean;
		readonly light?: SCMResourceThemableDecorations;
		readonly dark?: SCMResourceThemableDecorations;
	}

	export interface SCMResource {
		readonly uri: Uri;
		readonly decorations?: SCMResourceDecorations;
	}

	export interface SCMResourceGroup {
		readonly id: string;
		readonly label: string;
		readonly resources: SCMResource[];
	}

	export interface SCMProvider {
		readonly label: string;
		readonly resources: SCMResourceGroup[];
		readonly onDidChange: Event<SCMResourceGroup[]>;
		readonly count?: number | undefined;

		getOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri>;
		open?(resource: SCMResource, token: CancellationToken): ProviderResult<void>;
		drag?(resource: SCMResource, resourceGroup: SCMResourceGroup, token: CancellationToken): ProviderResult<void>;
	}

	export namespace scm {
		export const onDidChangeActiveProvider: Event<SCMProvider>;
		export let activeProvider: SCMProvider | undefined;
		export function getResourceFromURI(uri: Uri): SCMResource | SCMResourceGroup | undefined;
		export function registerSCMProvider(id: string, provider: SCMProvider): Disposable;
	}
}
