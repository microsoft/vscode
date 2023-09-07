/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/179213
	export class CodeActionKind2 {
		/**
		 * Empty kind.
		 */
		static readonly Empty: CodeActionKind2;

		/**
		 * Base kind for quickfix actions: `quickfix`.
		 *
		 * Quick fix actions address a problem in the code and are shown in the normal code action context menu.
		 */
		static readonly QuickFix: CodeActionKind2;

		/**
		 * Base kind for refactoring actions: `refactor`
		 *
		 * Refactoring actions are shown in the refactoring context menu.
		 */
		static readonly Refactor: CodeActionKind2;

		/**
		 * Base kind for refactoring extraction actions: `refactor.extract`
		 *
		 * Example extract actions:
		 *
		 * - Extract method
		 * - Extract function
		 * - Extract variable
		 * - Extract interface from class
		 * - ...
		 */
		static readonly RefactorExtract: CodeActionKind2;

		/**
		 * Base kind for refactoring inline actions: `refactor.inline`
		 *
		 * Example inline actions:
		 *
		 * - Inline function
		 * - Inline variable
		 * - Inline constant
		 * - ...
		 */
		static readonly RefactorInline: CodeActionKind2;

		/**
		 * Base kind for refactoring move actions: `refactor.move`
		 *
		 * Example move actions:
		 *
		 * - Move a function to a new file
		 * - Move a property between classes
		 * - Move method to base class
		 * - ...
		 */
		static readonly RefactorMove: CodeActionKind2;

		/**
		 * Base kind for refactoring rewrite actions: `refactor.rewrite`
		 *
		 * Example rewrite actions:
		 *
		 * - Convert JavaScript function to class
		 * - Add or remove parameter
		 * - Encapsulate field
		 * - Make method static
		 * - ...
		 */
		static readonly RefactorRewrite: CodeActionKind2;

		/**
		 * Base kind for source actions: `source`
		 *
		 * Source code actions apply to the entire file. They must be explicitly requested and will not show in the
		 * normal [lightbulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action) menu. Source actions
		 * can be run on save using `editor.codeActionsOnSave` and are also shown in the `source` context menu.
		 */
		static readonly Source: CodeActionKind2;

		/**
		 * Base kind for an organize imports source action: `source.organizeImports`.
		 */
		static readonly SourceOrganizeImports: CodeActionKind2;

		/**
		 * Base kind for auto-fix source actions: `source.fixAll`.
		 *
		 * Fix all actions automatically fix errors that have a clear fix that do not require user input.
		 * They should not suppress errors or perform unsafe fixes such as generating new types or classes.
		 */
		static readonly SourceFixAll: CodeActionKind2;

		/**
		 * Private constructor, use statix `CodeActionKind2.XYZ` to derive from an existing code action kind.
		 *
		 * @param value The value of the kind, such as `refactor.extract.function`.
		 */
		private constructor(value: string);

		/**
		 * String value of the kind, e.g. `"refactor.extract.function"`.
		 */
		readonly value: string;

		/**
		 * Boolean value representing the scope of the CodeAction
		 *
		 * - `true`  - The CodeAction is scoped to the entire notebook. It is called only against the first cell.
		 * - `false` - The CodeAction is scoped to a singular cell. It is called against each cell asynchronously in parallel.
		 */
		public notebook?: boolean;

		/**
		 * Create a new kind by appending a more specific selector to the current kind.
		 *
		 * Does not modify the current kind.
		 */
		append(parts: string): CodeActionKind2;

		/**
		 * Checks if this code action kind intersects `other`.
		 *
		 * The kind `"refactor.extract"` for example intersects `refactor`, `"refactor.extract"` and ``"refactor.extract.function"`,
		 * but not `"unicorn.refactor.extract"`, or `"refactor.extractAll"`.
		 *
		 * @param other Kind to check.
		 */
		intersects(other: CodeActionKind2): boolean;

		/**
		 * Checks if `other` is a sub-kind of this `CodeActionKind2`.
		 *
		 * The kind `"refactor.extract"` for example contains `"refactor.extract"` and ``"refactor.extract.function"`,
		 * but not `"unicorn.refactor.extract"`, or `"refactor.extractAll"` or `refactor`.
		 *
		 * @param other Kind to check.
		 */
		contains(other: CodeActionKind2): boolean;
	}

	export interface CodeActionProviderMetadata2 {
		readonly providedCodeActionKinds?: readonly CodeActionKind2[];
	}

	export interface CodeActionContext2 {
		readonly triggerKind: CodeActionTriggerKind;

		readonly diagnostics: readonly Diagnostic[];

		readonly only: CodeActionKind2 | undefined;
	}

}
