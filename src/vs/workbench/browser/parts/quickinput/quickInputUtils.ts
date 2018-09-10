/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./quickInput';
import * as dom from 'vs/base/browser/dom';
import { URI } from 'vs/base/common/uri';
import { IdGenerator } from 'vs/base/common/idGenerator';

const iconPathToClass = {};
const iconClassGenerator = new IdGenerator('quick-input-button-icon-');

export function getIconClass(iconPath: { dark: URI; light?: URI; }) {
	let iconClass: string;

	const key = iconPath.dark.toString();
	if (iconPathToClass[key]) {
		iconClass = iconPathToClass[key];
	} else {
		iconClass = iconClassGenerator.nextId();
		dom.createCSSRule(`.${iconClass}`, `background-image: url("${(iconPath.light || iconPath.dark).toString()}")`);
		dom.createCSSRule(`.vs-dark .${iconClass}, .hc-black .${iconClass}`, `background-image: url("${iconPath.dark.toString()}")`);
		iconPathToClass[key] = iconClass;
	}

	return iconClass;
}
