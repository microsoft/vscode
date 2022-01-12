/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { regExpFlags } from 'vs/base/common/strings';
import { URI, UriComponents } from 'vs/base/common/uri';

export function stringify(obj: any): string {
	return JSON.stringify(obj, replacer);
}

export function parse(text: string): any {
	let data = JSON.parse(text);
	data = revive(data);
	return data;
}

export const enum MarshalledId {
	Uri = 1,
	Regexp,
	ScmResource,
	ScmResourceGroup,
	ScmProvider,
	CommentController,
	CommentThread,
	CommentThreadReply,
	CommentNode,
	CommentThreadNode,
	TimelineActionContext,
	NotebookCellActionContext,
	TestItemContext,
}

export interface MarshalledObject {
	$mid: MarshalledId;
}

function replacer(key: string, value: any): any {
	// URI is done via toJSON-member
	if (value instanceof RegExp) {
		return {
			$mid: MarshalledId.Regexp,
			source: value.source,
			flags: regExpFlags(value),
		};
	}
	return value;
}


type Deserialize<T> = T extends UriComponents ? URI
	: T extends VSBuffer ? VSBuffer
	: T extends object
	? Revived<T>
	: T;

export type Revived<T> = { [K in keyof T]: Deserialize<T[K]> };

export function revive<T = any>(obj: any, depth = 0): Revived<T> {
	if (!obj || depth > 200) {
		return obj;
	}

	if (typeof obj === 'object') {

		switch ((<MarshalledObject>obj).$mid) {
			case MarshalledId.Uri: return <any>URI.revive(obj);
			case MarshalledId.Regexp: return <any>new RegExp(obj.source, obj.flags);
		}

		if (
			obj instanceof VSBuffer
			|| obj instanceof Uint8Array
		) {
			return <any>obj;
		}

		if (Array.isArray(obj)) {
			for (let i = 0; i < obj.length; ++i) {
				obj[i] = revive(obj[i], depth + 1);
			}
		} else {
			// walk object
			for (const key in obj) {
				if (Object.hasOwnProperty.call(obj, key)) {
					obj[key] = revive(obj[key], depth + 1);
				}
			}
		}
	}

	return obj;
}
