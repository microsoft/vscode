/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IArcTextEdit, IArcTextReplacement } from '../../../../base/common/editArcTracker.js';
import { IOffsetEdit } from '../../common/diffComputeService.js';

export function extractArcTextEdit(toolName: string, input: unknown, beforeText: string, afterText: string): IArcTextEdit | undefined {
	const object = asObject(input);
	let edit: IArcTextEdit | undefined;

	switch (toolName) {
		case 'Write':
			edit = fullReplacement(beforeText, readString(object, 'content'));
			break;
		case 'create':
			edit = fullReplacement(beforeText, readString(object, 'file_text'));
			break;
		case 'Edit':
			edit = stringReplacement(beforeText, readString(object, 'old_string'), readString(object, 'new_string'), object?.replace_all === true);
			break;
		case 'edit':
		case 'str_replace':
			edit = stringReplacement(beforeText, readString(object, 'old_str'), readString(object, 'new_str'), false);
			break;
		case 'str_replace_editor':
			if (object?.command === 'create') {
				edit = fullReplacement(beforeText, readString(object, 'file_text'));
			} else if (object?.command === 'str_replace') {
				edit = stringReplacement(beforeText, readString(object, 'old_str'), readString(object, 'new_str'), false);
			}
			break;
	}

	return edit && applyEdit(beforeText, edit) === afterText ? edit : undefined;
}

export function createArcTextEditFromDiff(changes: readonly IOffsetEdit[], beforeText: string, afterText: string): IArcTextEdit {
	const edit: IArcTextEdit = {
		replacements: changes.map(change => ({
			start: change.startOffset,
			endExclusive: change.endOffsetExclusive,
			text: change.newText,
		}))
	};
	return applyEdit(beforeText, edit) === afterText ? edit : {
		replacements: [{ start: 0, endExclusive: beforeText.length, text: afterText }]
	};
}

function fullReplacement(beforeText: string, text: string | undefined): IArcTextEdit | undefined {
	return text === undefined ? undefined : {
		replacements: [{ start: 0, endExclusive: beforeText.length, text }]
	};
}

function stringReplacement(beforeText: string, oldText: string | undefined, newText: string | undefined, replaceAll: boolean): IArcTextEdit | undefined {
	if (oldText === undefined || newText === undefined || oldText.length === 0) {
		return undefined;
	}

	const replacements: IArcTextReplacement[] = [];
	let offset = 0;
	while (offset <= beforeText.length) {
		const start = beforeText.indexOf(oldText, offset);
		if (start === -1) {
			break;
		}
		replacements.push({ start, endExclusive: start + oldText.length, text: newText });
		if (!replaceAll) {
			break;
		}
		offset = start + oldText.length;
	}
	return replacements.length > 0 ? { replacements } : undefined;
}

function applyEdit(value: string, edit: IArcTextEdit): string {
	let result = '';
	let offset = 0;
	for (const replacement of edit.replacements) {
		result += value.substring(offset, replacement.start);
		result += replacement.text;
		offset = replacement.endExclusive;
	}
	return result + value.substring(offset);
}

function asObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function readString(object: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = object?.[key];
	return typeof value === 'string' ? value : undefined;
}
