/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';

export const ctxNotebookHasEditorModification = new RawContextKey<boolean>('chat.hasNotebookEditorModifications', undefined, localize('chat.hasNotebookEditorModifications', "The current Notebook editor contains chat modifications"));
