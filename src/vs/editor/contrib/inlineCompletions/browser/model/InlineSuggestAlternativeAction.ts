/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Command } from '../../../../common/languages.js';

export type InlineSuggestAlternativeAction = {
	label: string;
	icon: ThemeIcon;
	command: Command;
	count: Promise<number>;
};

export namespace InlineSuggestAlternativeAction {
	export function toString(action: InlineSuggestAlternativeAction | undefined): string | undefined {
		return action?.command.id ?? undefined;
	}
}
