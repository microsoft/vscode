/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyboardModifiers } from '../../../../base/browser/ui/erdosComponents/button/erdosButton.js';

export interface CustomContextMenuItemOptions {
	readonly commandId?: string;
	readonly checked?: boolean;
	readonly icon?: string;
	readonly label: string;
	readonly disabled?: boolean;
	readonly onSelected: (e: KeyboardModifiers) => void;
}

export class CustomContextMenuItem {
	constructor(readonly options: CustomContextMenuItemOptions) {
	}
}



