/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/226562

	/**
	 * A provider that supplies terminal completion items.
	 *
	 * Implementations of this interface should return an array of {@link TerminalCompletionItem} or a
	 * {@link TerminalCompletionList} describing completions for the current command line.
	 *
	 * @example <caption>Simple provider returning a single completion</caption>
	 * window.registerTerminalCompletionProvider({
	 * 	provideTerminalCompletions(terminal, context) {
	 * 		return [{ label: '--help', replacementRange: [Math.max(0, context.cursorPosition - 2), context.cursorPosition] }];
	 * 	}
	 * });
	 */
	export interface TerminalCompletionProvider<T extends TerminalCompletionItem = TerminalCompletionItem> {
		/**
		 * Provide completions for the given terminal and context.
		 * @param terminal The terminal for which completions are being provided.
		 * @param context Information about the terminal's current state.
		 * @param token A cancellation token.
		 * @return A list of completions.
		 */
		provideTerminalCompletions(terminal: Terminal, context: TerminalCompletionContext, token: CancellationToken): ProviderResult<T[] | TerminalCompletionList<T>>;
	}

	/**
	 * Represents a completion suggestion for a terminal command line.
	 *
	 * @example <caption>Completion item for `ls -|`</caption>
	 * const item = {
	 * 	label: '-A',
	 * 	replacementRange: [3, 4], // replace the single character at index 3
	 * 	detail: 'List all entries except for . and .. (always set for the super-user)',
	 * 	kind: TerminalCompletionItemKind.Flag
	 * };
	 *
	 * The fields on a completion item describe what text should be shown to the user
	 * and which portion of the command line should be replaced when the item is accepted.
	 */
	export class TerminalCompletionItem {
		/**
		 * The label of the completion.
		 */
		label: string | CompletionItemLabel;

		/**
		 * The range in the command line to replace when the completion is accepted. Defined
		 * as a tuple where the first entry is the inclusive start index and the second entry is the
		 * exclusive end index.
		 */
		replacementRange: readonly [number, number];

		/**
		 * The completion's detail which appears on the right of the list.
		 */
		detail?: string;

		/**
		 * A human-readable string that represents a doc-comment.
		 */
		documentation?: string | MarkdownString;

		/**
		 * The completion's kind. Note that this will map to an icon. If no kind is provided, a generic icon representing plaintext will be provided.
		 */
		kind?: TerminalCompletionItemKind;

		/**
		 * Creates a new terminal completion item.
		 *
		 * @param label The label of the completion.
		 * @param replacementRange The inclusive start and exclusive end index of the text to replace.
		 * @param kind The completion's kind.
		 */
		constructor(
			label: string | CompletionItemLabel,
			replacementRange: readonly [number, number],
			kind?: TerminalCompletionItemKind
		);
	}

	/**
	 * The kind of an individual terminal completion item.
	 *
	 * The kind is used to render an appropriate icon in the suggest list and to convey the semantic
	 * meaning of the suggestion (file, folder, flag, commit, branch, etc.).
	 */
	export enum TerminalCompletionItemKind {
		/**
		 * A file completion item.
		 * Example: `README.md`
		 */
		File = 0,
		/**
		 * A folder completion item.
		 * Example: `src/`
		 */
		Folder = 1,
		/**
		 * A method completion item.
		 * Example: `git commit`
		 */
		Method = 2,
		/**
		 * An alias completion item.
		 * Example: `ll` as an alias for `ls -l`
		 */
		Alias = 3,
		/**
		 * An argument completion item.
		 * Example: `origin` in `git push origin main`
		 */
		Argument = 4,
		/**
		 * An option completion item. An option value is expected to follow.
		 * Example: `--locale` in `code --locale en`
		 */
		Option = 5,
		/**
		 * The value of an option completion item.
		 * Example: `en-US` in `code --locale en-US`
		 */
		OptionValue = 6,
		/**
		 * A flag completion item.
		 * Example: `--amend` in `git commit --amend`
		 */
		Flag = 7,
		/**
		 * A symbolic link file completion item.
		 * Example: `link.txt` (symlink to a file)
		 */
		SymbolicLinkFile = 8,
		/**
		 * A symbolic link folder completion item.
		 * Example: `node_modules/` (symlink to a folder)
		 */
		SymbolicLinkFolder = 9,
		/**
		 * A source control commit completion item.
		 * Example: `abc1234` (commit hash)
		 */
		ScmCommit = 10,
		/**
		 * A source control branch completion item.
		 * Example: `main`
		 */
		ScmBranch = 11,
		/**
		 * A source control tag completion item.
		 * Example: `v1.0.0`
		 */
		ScmTag = 12,
		/**
		 * A source control stash completion item.
		 * Example: `stash@{0}`
		 */
		ScmStash = 13,
		/**
		 * A source control remote completion item.
		 * Example: `origin`
		 */
		ScmRemote = 14,
		/**
		 * A pull request completion item.
		 * Example: `#42 Add new feature`
		 */
		PullRequest = 15,
		/**
		 * A closed pull request completion item.
		 * Example: `#41 Fix bug (closed)`
		 */
		PullRequestDone = 16,
	}

	/**
	 * Context information passed to {@link TerminalCompletionProvider.provideTerminalCompletions}.
	 *
	 * It contains the full command line and the current cursor position.
	 */
	export interface TerminalCompletionContext {
		/**
		 * The complete terminal command line.
		 */
		readonly commandLine: string;
		/**
		 * The index of the cursor in the command line.
		 */
		readonly cursorIndex: number;
	}

	/**
	 * Represents a collection of {@link TerminalCompletionItem completion items} to be presented
	 * in the terminal plus {@link TerminalCompletionList.resourceOptions} which indicate
	 * which file and folder resources should be requested for the terminal's cwd.
	 *
	 * @example <caption>Create a completion list that requests files for the terminal cwd</caption>
	 * const list = new TerminalCompletionList([
	 * 	{ label: 'ls', replacementRange: [0, 0], kind: TerminalCompletionItemKind.Method }
	 * ], { showFiles: true, cwd: Uri.file('/home/user') });
	 */
	export class TerminalCompletionList<T extends TerminalCompletionItem = TerminalCompletionItem> {

		/**
		 * Resources that should be shown in the completions list for the cwd of the terminal.
		 */
		resourceOptions?: TerminalCompletionResourceOptions;

		/**
		 * The completion items.
		 */
		items: T[];

		/**
		 * Creates a new completion list.
		 *
		 * @param items The completion items.
		 * @param resourceOptions Indicates which resources should be shown as completions for the cwd of the terminal.
		 */
		constructor(items: T[], resourceOptions?: TerminalCompletionResourceOptions);
	}

	/**
	 * Configuration for requesting file and folder resources to be shown as completions.
	 *
	 * When a provider indicates that it wants file/folder resources, the terminal will surface completions for files and
	 * folders that match {@link globPattern} from the provided {@link cwd}.
	 */
	export interface TerminalCompletionResourceOptions {
		/**
		 * Show files as completion items.
		 */
		showFiles: boolean;
		/**
		 * Show folders as completion items.
		 */
		showDirectories: boolean;
		/**
		 * A glob pattern string that controls which files suggest should surface. Note that this will only apply if {@param showFiles} or {@param showDirectories} is set to true.
		 */
		globPattern?: string;
		/**
		 * The cwd from which to request resources.
		 */
		cwd: Uri;
	}

	export namespace window {
		/**
		 * Register a completion provider for terminals.
		 * @param provider The completion provider.
		 * @param triggerCharacters Optional characters that trigger completion. When any of these characters is typed,
		 * the completion provider will be invoked. For example, passing `'-'` would cause the provider to be invoked
		 * whenever the user types a dash character.
		 * @returns A {@link Disposable} that unregisters this provider when being disposed.
		 *
		 * @example <caption>Register a provider for an extension</caption>
		 * window.registerTerminalCompletionProvider({
		 * 	provideTerminalCompletions(terminal, context) {
		 * 		return new TerminalCompletionList([
		 * 			{ label: '--version', replacementRange: [Math.max(0, context.cursorPosition - 2), context.cursorPosition] }
		 * 		]);
		 * 	}
		 * });
		 *
		 * @example <caption>Register a provider with trigger characters</caption>
		 * window.registerTerminalCompletionProvider({
		 * 	provideTerminalCompletions(terminal, context) {
		 * 		return new TerminalCompletionList([
		 * 			{ label: '--help', replacementRange: [Math.max(0, context.cursorPosition - 2), context.cursorPosition] }
		 * 		]);
		 * 	}
		 * }, '-');
		 */
		export function registerTerminalCompletionProvider<T extends TerminalCompletionItem>(provider: TerminalCompletionProvider<T>, ...triggerCharacters: string[]): Disposable;
	}
}

