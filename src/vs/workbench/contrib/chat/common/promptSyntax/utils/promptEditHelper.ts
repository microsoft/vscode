/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../../../editor/common/model.js';
import { IArrayValue } from '../promptFileParser.js';

const isSimpleNameRegex = /^[\w\/\.-]+$/;

export function formatArrayValue(name: string, quotePreference?: QuotePreference) {
	switch (quotePreference) {
		case '\'':
			return `'${name}'`;
		case '"':
			return `"${name}"`;
	}
	return isSimpleNameRegex.test(name) ? name : `'${name}'`;
}

export type QuotePreference = '\'' | '\"' | '';

export function getQuotePreference(arrayValue: IArrayValue, model: ITextModel): QuotePreference {
	const firstStringItem = arrayValue.items.find(item => item.type === 'string' && isSimpleNameRegex.test(item.value));
	const firstChar = firstStringItem ? model.getValueInRange(firstStringItem.range).charAt(0) : undefined;
	if (firstChar === `'` || firstChar === `"`) {
		return firstChar;
	}
	return '';
}
