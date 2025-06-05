/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class TextModelEditReason {
	private static _nextMetadataId = 0;
	private static _metaDataMap = new Map<number, ITextModelEditReasonMetadata>();

	/**
	 * Sets the reason for all text model edits done in the callback.
	*/
	public static editWithReason<T>(reason: TextModelEditReason, runner: () => T): T {
		const id = this._nextMetadataId++;
		this._metaDataMap.set(id, reason.metadata);
		try {
			const result = runner();
			return result;
		} finally {
			this._metaDataMap.delete(id);
		}
	}

	public static _getCurrentMetadata(): ITextModelEditReasonMetadata {
		const result: ITextModelEditReasonMetadata = {};
		for (const metadata of this._metaDataMap.values()) {
			Object.assign(result, metadata);
		}
		return result;
	}

	constructor(public readonly metadata: ITextModelEditReasonMetadata) { }
}

interface ITextModelEditReasonMetadata {
	source?: 'Chat.applyEdits' | 'inlineChat.applyEdit' | 'reloadFromDisk';
	extensionId?: string;
	nes?: boolean;
	type?: 'word' | 'line';
	requestUuid?: string;
}
