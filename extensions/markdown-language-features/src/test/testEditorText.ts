/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MarkdownEditorText, TrackedOffset } from '../preview/markdownEditorDocumentSync';
import type { MarkdownEditorVersion } from '../preview/markdownEditorProtocol';

/**
 * A {@link MarkdownEditorText} for testing features without an editor: it
 * accepts offsets sent with its current version, and {@link change} stands in
 * for any change of the editor text.
 */
export class TestEditorText implements MarkdownEditorText {
	revision = 0;
	version: MarkdownEditorVersion = { serverRevision: 1, clientRevision: 0 };
	drain: () => Promise<void> = async () => { };

	constructor(public text: string) { }

	/** The editor text changed (to `text`, if given): offsets sent before no longer apply. */
	change(text = this.text): void {
		this.text = text;
		this.revision++;
		this.version = { serverRevision: this.version.serverRevision + 1, clientRevision: this.version.clientRevision };
	}

	trackFromEditor(version: MarkdownEditorVersion, offset: number): TrackedOffset | undefined {
		const current = version.serverRevision === this.version.serverRevision && version.clientRevision === this.version.clientRevision;
		return current && offset >= 0 && offset <= this.text.length ? { offset, dispose: () => { } } : undefined;
	}
}
