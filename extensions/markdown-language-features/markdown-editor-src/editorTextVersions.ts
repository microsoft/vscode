/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MarkdownEditorVersion } from '../src/preview/markdownEditorProtocol';

/**
 * Relates offsets between the editor text and the extension host while both
 * change it: requests carry {@link current}, and offsets the host sends are
 * mapped into the editor text with {@link fromHost}.
 */
export interface EditorTextVersions {
	/** The version of the editor text, to send along with offsets into it. */
	readonly current: MarkdownEditorVersion;
	/** Whether `version` is the editor text's current version. */
	isCurrent(version: MarkdownEditorVersion | undefined): boolean;
	/** Maps an offset the host sent along with `version` into the editor text; `undefined` if it cannot. */
	fromHost(version: MarkdownEditorVersion | undefined, offset: number): number | undefined;
}
