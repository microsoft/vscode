/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class TextModelEditReason {
	public static readonly EolChange = new TextModelEditReason({ source: 'eolChange' });
	public static readonly SetValue = new TextModelEditReason({ source: 'setValue' });
	public static readonly ApplyEdits = new TextModelEditReason({ source: 'applyEdits' });
	public static readonly Unknown = new TextModelEditReason({ source: 'unknown' });
	public static readonly Type = new TextModelEditReason({ source: 'type' });

	constructor(public readonly metadata: ITextModelEditReasonMetadata) { }

	public toString(): string {
		return `${this.metadata.source}`;
	}
}

export type ITextModelEditReasonMetadata = {
	source: 'unknown' | 'Chat.applyEdits' | 'inlineChat.applyEdit' | 'reloadFromDisk' | 'eolChange' | 'setValue' | 'applyEdits' | string;
} | {
	source: 'inlineCompletionAccept';
	nes: boolean;
	type: 'word' | 'line' | undefined;
	requestUuid: string;
	extensionId: string | undefined;
} | {
	source: 'cursor';
	kind: 'compositionType' | 'compositionEnd' | 'type' | 'paste' | 'cut' | 'executeCommands' | 'executeCommand';
	detailedSource?: string | null | undefined;
};
