/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');

export const DELIM_END = 'punctuation.tag.end.html';
export const DELIM_START = 'punctuation.tag.begin.html';
export const DELIM_ASSIGN = 'tag.assign.html';
export const ATTRIB_NAME = 'entity.other.attribute-name.html';
export const ATTRIB_VALUE = 'string.html';
export const COMMENT = 'comment.html.content';
export const DELIM_COMMENT = 'comment.html';
export const DOCTYPE = 'storage.content.html';
export const DELIM_DOCTYPE = 'storage.html';

const TAG_PREFIX = 'entity.name.tag.tag-';

export function isTag(tokenType: string) {
	return strings.startsWith(tokenType, TAG_PREFIX);
}

export function getTag(name: string) {
	return TAG_PREFIX + name;
}