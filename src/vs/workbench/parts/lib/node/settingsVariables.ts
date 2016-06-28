/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { AbstractSystemVariables } from 'vs/base/common/parsers';

export class SettingsVariables extends AbstractSystemVariables {
	constructor(private configuration:any) {
		super();
	}

	protected resolveString(value: string): string {
		let regexp = /\${settings.(.+)}/g;
		return value.replace(regexp, (match: string, name: string) => {
			return new Function('_', 'return _.' + name)(this.configuration);
		});
	}
}