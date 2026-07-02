/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse, stringify } from '../../../../../../base/common/marshalling.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IChatModelInputState } from '../../../common/model/chatModel.js';

export function serializeUntitledInputState(value: IChatModelInputState | undefined): string {
	return stringify(value && { ...value, attachments: [] });
}

export function deserializeUntitledInputState(value: string): IChatModelInputState {
	return parse(value) as IChatModelInputState;
}

export function serializeUntitledInputAttachments(attachments: readonly IChatRequestVariableEntry[]): string {
	return stringify(attachments.map(IChatRequestVariableEntry.toExport));
}

export function deserializeUntitledInputAttachments(value: string): IChatRequestVariableEntry[] {
	return (parse(value) as IChatRequestVariableEntry[]).map(IChatRequestVariableEntry.fromExport);
}
