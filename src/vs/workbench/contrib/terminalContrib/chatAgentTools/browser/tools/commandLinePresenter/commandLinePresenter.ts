/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MaybePromise } from '../../../../../../../base/common/async.js';
import type { OperatingSystem } from '../../../../../../../base/common/platform.js';

export interface ICommandLinePresenter {
	/**
	 * Attempts to create a presentation for the given command line.
	 * Command line presenters allow displaying an extracted/transformed version
	 * of a command (e.g., Python code from `python -c "..."`) with appropriate
	 * syntax highlighting, while the actual command remains unchanged.
	 *
	 * @returns The presentation result if this presenter handles the command, undefined otherwise.
	 */
	present(options: ICommandLinePresenterOptions): MaybePromise<ICommandLinePresenterResult | undefined>;
}

export interface ICommandLinePresenterOptions {
	commandLine: ICommandLinePresentationInput;
	shell: string;
	os: OperatingSystem;
}

export interface ICommandLinePresentationInput {
	original?: string;
	forDisplay: string;
}

export interface ICommandLinePresenterResult {
	/**
	 * The extracted/transformed command to display (e.g., the Python code).
	 */
	commandLine: string;

	/**
	 * The language ID for syntax highlighting (e.g., 'python').
	 */
	language?: string;

	/**
	 * A human-readable name for the language (e.g., 'Python') used in UI labels.
	 */
	languageDisplayName?: string;

	/**
	 *  Whether other presenters should still process the command line.
	 * Defaults to false - once a presenter handles a command, no further processing is done.
	 */
	processOtherPresenters?: boolean;
}
