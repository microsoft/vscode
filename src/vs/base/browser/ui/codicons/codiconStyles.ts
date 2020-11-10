/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./codicon/codicon';
import 'vs/css!./codicon/codicon-modifications';
import 'vs/css!./codicon/codicon-animations';

import { Codicon, iconRegistry } from 'vs/base/common/codicons';

export const CodiconStyles = new class {
	onDidChange = iconRegistry.onDidRegister;
	public getCSS(): string {
		const rules = [];
		for (let c of iconRegistry.all) {
			rules.push(formatRule(c));
		}
		return rules.join('\n');
	}
};

export function formatRule(c: Codicon) {
	let def = c.definition;
	while (def instanceof Codicon) {
		def = def.definition;
	}
	return `.codicon-${c.id}:before { content: '${def.character}'; }`;
}
