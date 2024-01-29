/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare module 'vscode' {
	export namespace debug {
		/**
		 * Registers a custom data visualization for variables when debugging.
		 *
		 * @param id The corresponding ID in the package.json `debugVisualizers` contribution point.
		 * @param provider The {@link DebugVisualizationProvider} to register
		 */
		export function registerDebugVisualizationProvider<T extends DebugVisualization>(
			id: string,
			provider: DebugVisualizationProvider<T>
		): Disposable;
	}

	export class DebugVisualization {
		/**
		 * The name of the visualization to show to the user.
		 */
		name: string;

		/**
		 * An icon for the view when it's show in inline actions.
		 */
		iconPath?: Uri | { light: Uri; dark: Uri } | ThemeIcon;

		/**
		 * Visualization to use for the variable. This may be either:
		 * - A command to run when the visualization is selected for a variable.
		 * - A {@link TreeDataProvider} which is used to display the data in-line
		 *   where the variable is shown. If a single root item is returned from
		 *   the data provider, it will replace the variable in its tree.
		 *   Otherwise, the items will be shown as children of the variable.
		 */
		visualization?: Command | TreeDataProvider<unknown>;

		/**
		 * Creates a new debug visualization object.
		 * @param name Name of the visualization to show to the user.
		 */
		constructor(name: string);
	}

	export interface DebugVisualizationProvider<T extends DebugVisualization = DebugVisualization> {
		/**
		 * Called for each variable when the debug session stops. It should return
		 * any visualizations the extension wishes to show to the user.
		 *
		 * Note that this is only called when its `when` clause defined under the
		 * `debugVisualizers` contribution point in the `package.json` evaluates
		 * to true.
		 */
		provideDebugVisualization(context: DebugVisualizationContext, token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Invoked for a variable when a user picks the visualizer.
		 *
		 * It may return a {@link TreeView} that's shown in the Debug Console or
		 * inline in a hover. A visualizer may choose to return `undefined` from
		 * this function and instead trigger other actions in the UI, such as opening
		 * a custom {@link WebviewView}.
		 */
		resolveDebugVisualization?(visualization: T, token: CancellationToken): ProviderResult<T>;
	}

	export interface DebugVisualizationContext {
		/**
		 * The Debug Adapter Protocol Variable to be visualized.
		 * @see https://microsoft.github.io/debug-adapter-protocol/specification#Types_Variable
		 */
		variable: any;
		/**
		 * The Debug Adapter Protocol variable reference the type (such as a scope
		 * or another variable) that contained this one. Empty for variables
		 * that came from user evaluations in the Debug Console.
		 * @see https://microsoft.github.io/debug-adapter-protocol/specification#Types_Variable
		 */
		containerId?: string;
		/**
		 * The ID of the Debug Adapter Protocol StackFrame in which the variable was found,
		 * for variables that came from scopes in a stack frame.
		 * @see https://microsoft.github.io/debug-adapter-protocol/specification#Types_StackFrame
		 */
		frameId?: number;
		/**
		 * The ID of the Debug Adapter Protocol Thread in which the variable was found.
		 * @see https://microsoft.github.io/debug-adapter-protocol/specification#Types_StackFrame
		 */
		threadId: number;
		/**
		 * The debug session the variable belongs to.
		 */
		session: DebugSession;
	}
}
