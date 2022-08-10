/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from 'vs/platform/actions/common/actions';
import { MergeEditorCopyContentsToJSON, MergeEditorLoadContentsFromFolder, MergeEditorOpenContentsFromJSON, MergeEditorSaveContentsToFolder } from 'vs/workbench/contrib/mergeEditor/electron-sandbox/devCommands';

// Dev Commands
registerAction2(MergeEditorCopyContentsToJSON);
registerAction2(MergeEditorOpenContentsFromJSON);
registerAction2(MergeEditorSaveContentsToFolder);
registerAction2(MergeEditorLoadContentsFromFolder);
