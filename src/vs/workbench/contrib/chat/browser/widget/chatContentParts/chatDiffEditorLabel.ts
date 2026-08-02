/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';

/**
 * Short tab title for chat/agent diff editors. Passing this as `label` to
 * `openEditor` prevents {@link DiffEditorInput} from forcing a long
 * snapshot/agent-host path into the tab description (#326790).
 */
export function getChatChangesDiffEditorLabel(fileBasename: string): string {
	return localize('diff.generic', '{0} (changes from chat)', fileBasename);
}
