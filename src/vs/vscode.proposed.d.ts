/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	export interface OpenDialogOptions {
		uri?: Uri;
		openFiles?: boolean;
		openFolders?: boolean;
		openMany?: boolean;
	}

	export namespace window {

		export function showOpenDialog(options: OpenDialogOptions): Thenable<Uri[]>;
	}

	// todo@joh discover files etc
	export interface FileSystemProvider {
		// todo@joh -> added, deleted, renamed, changed
		onDidChange: Event<Uri>;

		resolveContents(resource: Uri): string | Thenable<string>;
		writeContents(resource: Uri, contents: string): void | Thenable<void>;

		// -- search
		// todo@joh - extract into its own provider?
		findFiles(query: string, progress: Progress<Uri>, token?: CancellationToken): Thenable<void>;
	}

	export namespace workspace {
		export function registerFileSystemProvider(authority: string, provider: FileSystemProvider): Disposable;
	}

	export namespace window {

		export function sampleFunction(): Thenable<any>;
	}

	/**
	 * The contiguous set of modified lines in a diff.
	 */
	export interface LineChange {
		readonly originalStartLineNumber: number;
		readonly originalEndLineNumber: number;
		readonly modifiedStartLineNumber: number;
		readonly modifiedEndLineNumber: number;
	}

	export namespace commands {

		/**
		 * Registers a diff information command that can be invoked via a keyboard shortcut,
		 * a menu item, an action, or directly.
		 *
		 * Diff information commands are different from ordinary [commands](#commands.registerCommand) as
		 * they only execute when there is an active diff editor when the command is called, and the diff
		 * information has been computed. Also, the command handler of an editor command has access to
		 * the diff information.
		 *
		 * @param command A unique identifier for the command.
		 * @param callback A command handler function with access to the [diff information](#LineChange).
		 * @param thisArg The `this` context used when invoking the handler function.
		 * @return Disposable which unregisters this command on disposal.
		 */
		export function registerDiffInformationCommand(command: string, callback: (diff: LineChange[], ...args: any[]) => any, thisArg?: any): Disposable;
	}

	/**
	 * Represents a color in RGBA space.
	 */
	export class Color {

		/**
		 * The red component of this color in the range [0-1].
		 */
		readonly red: number;

		/**
		 * The green component of this color in the range [0-1].
		 */
		readonly green: number;

		/**
		 * The blue component of this color in the range [0-1].
		 */
		readonly blue: number;

		/**
		 * The alpha component of this color in the range [0-1].
		 */
		readonly alpha: number;

		constructor(red: number, green: number, blue: number, alpha: number);

		/**
		 * Creates a color from the HSLA space.
		 *
		 * @param hue The hue component in the range [0-1].
		 * @param saturation The saturation component in the range [0-1].
		 * @param luminance The luminance component in the range [0-1].
		 * @param alpha The alpha component in the range [0-1].
		 */
		static fromHSLA(hue: number, saturation: number, luminance: number, alpha: number): Color;

		/**
		 * Creates a color by from a hex string. Supported formats are: #RRGGBB, #RRGGBBAA, #RGB, #RGBA.
		 * <code>null</code> is returned if the string does not match one of the supported formats.
		 * @param hex a string to parse
		 */
		static fromHex(hex: string): Color | null;
	}

	/**
	 * A color format is either a single format or a combination of two
	 * formats: an opaque one and a transparent one. The format itself
	 * is a string representation of how the color can be formatted. It
	 * supports the use of placeholders, similar to how snippets work.
	 * Each placeholder, surrounded by curly braces `{}`, requires a
	 * variable name and can optionally specify a number format and range
	 * for that variable's value.
	 *
	 * Supported variables:
	 *  - `red`
	 *  - `green`
	 *  - `blue`
	 *  - `hue`
	 *  - `saturation`
	 *  - `luminance`
	 *  - `alpha`
	 *
	 * Supported number formats:
	 *  - `f`, float with 2 decimal points. This is the default format. Default range is `[0-1]`.
	 *  - `Xf`, float with `X` decimal points. Default range is `[0-1]`.
	 *  - `d`, decimal. Default range is `[0-255]`.
	 *  - `x`, `X`, hexadecimal. Default range is `[00-FF]`.
	 *
	 * The default number format is float. The default number range is `[0-1]`.
	 *
	 * As an example, take the color `Color(1, 0.5, 0, 1)`. Here's how
	 * different formats would format it:
	 *
	 *  - CSS RGB
	 *   - Format: `rgb({red:d[0-255]}, {green:d[0-255]}, {blue:d[0-255]})`
	 *   - Output: `rgb(255, 127, 0)`
	 *
	 *  - CSS RGBA
	 *   - Format: `rgba({red:d[0-255]}, {green:d[0-255]}, {blue:d[0-255]}, {alpha})`
	 *   - Output: `rgba(255, 127, 0, 1)`
	 *
	 *  - CSS Hexadecimal
	 *   - Format: `#{red:X}{green:X}{blue:X}`
	 *   - Output: `#FF7F00`
	 *
	 *  - CSS HSLA
	 *   - Format: `hsla({hue:d[0-360]}, {saturation:d[0-100]}%, {luminance:d[0-100]}%, {alpha})`
	 *   - Output: `hsla(30, 100%, 50%, 1)`
	 */
	export type ColorFormat = string | { opaque: string, transparent: string };

	/**
	 * Represents a color range from a document.
	 */
	export class ColorRange {

		/**
		 * The range in the document where this color appers.
		 */
		range: Range;

		/**
		 * The actual color value for this color range.
		 */
		color: Color;

		/**
		 * The other formats this color range supports the color to be formatted in.
		 */
		availableFormats: ColorFormat[];

		/**
		 * Creates a new color range.
		 *
		 * @param range The range the color appears in. Must not be empty.
		 * @param color The value of the color.
		 * @param format The format in which this color is currently formatted.
		 */
		constructor(range: Range, color: Color, availableFormats: ColorFormat[]);
	}

	/**
	 * The document color provider defines the contract between extensions and feature of
	 * picking and modifying colors in the editor.
	 */
	export interface DocumentColorProvider {
		/**
		 * Provide colors for the given document.
		 *
		 * @param document The document in which the command was invoked.
		 * @param token A cancellation token.
		 * @return An array of [color ranges](#ColorRange) or a thenable that resolves to such. The lack of a result
		 * can be signaled by returning `undefined`, `null`, or an empty array.
		 */
		provideDocumentColors(document: TextDocument, token: CancellationToken): ProviderResult<ColorRange[]>;
	}

	export namespace languages {
		export function registerColorProvider(selector: DocumentSelector, provider: DocumentColorProvider): Disposable;
	}

	export namespace debug {
		/**
		 * Register a [debug configuration provider](#DebugConfigurationProvider) for a specifc debug type.
		 * More than one provider can be registered for the same type.
		 *
		 * @param type The debug type for which the provider is registered.
		 * @param provider The [debug configuration provider](#DebugConfigurationProvider) to register.
		 * @return A [disposable](#Disposable) that unregisters this provider when being disposed.
		 */
		export function registerDebugConfigurationProvider(debugType: string, provider: DebugConfigurationProvider): Disposable;
	}

	/**
	 * A debug configuration provider allows to add the initial debug configurations to a newly created launch.json
	 * and allows to resolve a launch configuration before it is used to start a new debug session.
	 * A debug configuration provider is registered via #workspace.registerDebugConfigurationProvider.
	 */
	export interface DebugConfigurationProvider {
		/**
		 * Provides initial [debug configuration](#DebugConfiguration). If more than one debug configuration provider is
		 * registered for the same type, debug configurations are concatenated in arbitrary order.
		 *
		 * @param folder The workspace folder for which the configurations are used or undefined for a folderless setup.
		 * @param token A cancellation token.
		 * @return An array of [debug configurations](#DebugConfiguration).
		 */
		provideDebugConfigurations?(folder: WorkspaceFolder | undefined, token?: CancellationToken): ProviderResult<DebugConfiguration[]>;

		/**
		 * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values or by adding/changing/removing attributes.
		 * If more than one debug configuration provider is registered for the same type, the resolveDebugConfiguration calls are chained
		 * in arbitrary order and the initial debug configuration is piped through the chain.
		 *
		 * @param folder The workspace folder from which the configuration originates from or undefined for a folderless setup.
		 * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
		 * @param token A cancellation token.
		 * @return The resolved debug configuration.
		 */
		resolveDebugConfiguration?(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration>;
	}
}
