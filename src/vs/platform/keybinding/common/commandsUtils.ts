/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {illegalArgument} from 'vs/base/common/errors';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';

export function registerCommand(id: string, handler: (accessor: ServicesAccessor, args: { [n: string]: any }) => any) {

	KeybindingsRegistry.registerCommandDesc({
		id,
		handler(accessor, args: any[]) {
			if (args && args.length > 1 || typeof args[0] !== 'object') {
				throw illegalArgument();
			}

			return handler(accessor, args && args[0]);
		},
		weight: KeybindingsRegistry.WEIGHT.editorContrib(),
		primary: undefined,
		context: undefined,
	});
}