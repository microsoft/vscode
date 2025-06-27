/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class TextModelEditReason {
	public static readonly EolChange = new TextModelEditReason({ source: 'eolChange' });
	public static readonly SetValue = new TextModelEditReason({ source: 'setValue' });
	public static readonly ApplyEdits = new TextModelEditReason({ source: 'applyEdits' });
	public static readonly Unknown = new TextModelEditReason({ source: 'unknown', name: 'unknown' });

	constructor(public readonly metadata: ITextModelEditReasonMetadata) { }

	public toString(): string {
		return `${this.metadata.source}`;
	}

	public getType(): string {
		const metadata = this.metadata;
		switch (metadata.source) {
			case 'cursor':
				return metadata.kind;
			case 'inlineCompletionAccept':
				return metadata.source + (metadata.nes ? ':nes' : '');
			case 'unknown':
				return metadata.name;
			default:
				return metadata.source;
		}
	}
}

export type ITextModelEditReasonMetadata = {
	source: 'Chat.applyEdits' | 'inlineChat.applyEdit' | 'reloadFromDisk' | 'eolChange' | 'setValue' | 'applyEdits';
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
} | {
	source: 'unknown';
	name: string;
};
