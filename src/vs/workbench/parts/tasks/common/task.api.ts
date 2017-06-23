/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Defines a problem pattern
 */
export interface ProblemPattern {

	/**
	 * The regular expression to find a problem in the console output of an
	 * executed task.
	 */
	regexp: RegExp;

	/**
	 * The match group index of the filename.
	 *
	 * Defaults to 1 if omitted.
	 */
	file?: number;

	/**
	 * The match group index of the problems's location. Valid location
	 * patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn).
	 * If omitted the line and colum properties are used.
	 */
	location?: number;

	/**
	 * The match group index of the problem's line in the source file.
	 *
	 * Defaults to 2 if omitted.
	 */
	line?: number;

	/**
	 * The match group index of the problem's character in the source file.
	 *
	 * Defaults to 3 if omitted.
	 */
	character?: number;

	/**
	 * The match group index of the problem's end line in the source file.
	 *
	 * Defaults to undefined. No end line is captured.
	 */
	endLine?: number;

	/**
	 * The match group index of the problem's end character in the source file.
	 *
	 * Defaults to undefined. No end column is captured.
	 */
	endCharacter?: number;

	/**
	 * The match group index of the problem's severity.
	 *
	 * Defaults to undefined. In this case the problem matcher's severity
	 * is used.
	*/
	severity?: number;

	/**
	 * The match group index of the problems's code.
	 *
	 * Defaults to undefined. No code is captured.
	 */
	code?: number;

	/**
	 * The match group index of the message. If omitted it defaults
	 * to 4 if location is specified. Otherwise it defaults to 5.
	 */
	message?: number;

	/**
	 * Specifies if the last pattern in a multi line problem matcher should
	 * loop as long as it does match a line consequently. Only valid on the
	 * last problem pattern in a multi line problem matcher.
	 */
	loop?: boolean;
}

/**
 * A multi line problem pattern.
 */
export type MultiLineProblemPattern = ProblemPattern[];

/**
 * The way how the file location is interpreted
 */
export enum FileLocationKind {
	/**
	 * VS Code should decide based on whether the file path found in the
	 * output is absolute or relative. A relative file path will be treated
	 * relative to the workspace root.
	 */
	Auto = 1,

	/**
	 * Always treat the file path relative.
	 */
	Relative = 2,

	/**
	 * Always treat the file path absolute.
	 */
	Absolute = 3
}

/**
 * Controls to which kind of documents problems are applied.
 */
export enum ApplyToKind {
	/**
	 * Problems are applied to all documents.
	 */
	AllDocuments = 1,

	/**
	 * Problems are applied to open documents only.
	 */
	OpenDocuments = 2,


	/**
	 * Problems are applied to closed documents only.
	 */
	ClosedDocuments = 3
}


/**
 * A background monitor pattern
 */
export interface BackgroundPattern {
	/**
	 * The actual regular expression
	 */
	regexp: RegExp;

	/**
	 * The match group index of the filename. If provided the expression
	 * is matched for that file only.
	 */
	file?: number;
}

/**
 * A description to control the activity of a problem matcher
 * watching a background task.
 */
export interface BackgroundMonitor {
	/**
	 * If set to true the monitor is in active mode when the task
	 * starts. This is equals of issuing a line that matches the
	 * beginPattern.
	 */
	activeOnStart?: boolean;

	/**
	 * If matched in the output the start of a background activity is signaled.
	 */
	beginsPattern: RegExp | BackgroundPattern;

	/**
	 * If matched in the output the end of a background activity is signaled.
	 */
	endsPattern: RegExp | BackgroundPattern;
}

/**
 * Defines a problem matcher
 */
export interface ProblemMatcher {
	/**
	 * The owner of a problem. Defaults to a generated id
	 * if omitted.
	 */
	owner?: string;

	/**
	 * The type of documents problems detected by this matcher
	 * apply to. Default to `ApplyToKind.AllDocuments` if omitted.
	 */
	applyTo?: ApplyToKind;

	/**
	 * How a file location recognized by a matcher should be interpreted. If omitted the file location
	 * if `FileLocationKind.Auto`.
	 */
	fileLocation?: FileLocationKind | string;

	/**
	 * The actual pattern used by the problem matcher.
	 */
	pattern: ProblemPattern | MultiLineProblemPattern;

	/**
	 * The default severity of a detected problem in the output. Used
	 * if the `ProblemPattern` doesn't define a severity match group.
	 */
	severity?: any;

	/**
	 * A background monitor for tasks that are running in the background.
	 */
	backgound?: BackgroundMonitor;
}