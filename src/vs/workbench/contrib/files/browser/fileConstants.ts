/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const REVEAL_IN_EXPLORER_COMMAND_ID = 'revealInExplorer';
export const REVERT_FILE_COMMAND_ID = 'workbench.action.files.revert';
export const OPEN_TO_SIDE_COMMAND_ID = 'explorer.openToSide';
export const OPEN_WITH_EXPLORER_COMMAND_ID = 'explorer.openWith';
export const SELECT_FOR_COMPARE_COMMAND_ID = 'selectForCompare';

export const COMPARE_SELECTED_COMMAND_ID = 'compareSelected';
export const COMPARE_RESOURCE_COMMAND_ID = 'compareFiles';
export const COMPARE_WITH_SAVED_COMMAND_ID = 'workbench.files.action.compareWithSaved';
export const COPY_PATH_COMMAND_ID = 'copyFilePath';
export const COPY_RELATIVE_PATH_COMMAND_ID = 'copyRelativeFilePath';

export const SAVE_FILE_AS_COMMAND_ID = 'workbench.action.files.saveAs';
export const SAVE_FILE_AS_LABEL = nls.localize2('saveAs', "Save As...");
export const SAVE_FILE_COMMAND_ID = 'workbench.action.files.save';
export const SAVE_FILE_LABEL = nls.localize2('save', "Save");
export const SAVE_FILE_WITHOUT_FORMATTING_COMMAND_ID = 'workbench.action.files.saveWithoutFormatting';
export const SAVE_FILE_WITHOUT_FORMATTING_LABEL = nls.localize2('saveWithoutFormatting', "Save without Formatting");

export const SAVE_ALL_COMMAND_ID = 'saveAll';
export const SAVE_ALL_LABEL = nls.localize2('saveAll', "Save All");

export const SAVE_ALL_IN_GROUP_COMMAND_ID = 'workbench.files.action.saveAllInGroup';

export const SAVE_FILES_COMMAND_ID = 'workbench.action.files.saveFiles';

export const OpenEditorsGroupContext = new RawContextKey<boolean>('groupFocusedInOpenEditors', false);
export const OpenEditorsDirtyEditorContext = new RawContextKey<boolean>('dirtyEditorFocusedInOpenEditors', false);
export const OpenEditorsReadonlyEditorContext = new RawContextKey<boolean>('readonlyEditorFocusedInOpenEditors', false);
export const OpenEditorsSelectedFileOrUntitledContext = new RawContextKey<boolean>('openEditorsSelectedFileOrUntitled', true);
export const ResourceSelectedForCompareContext = new RawContextKey<boolean>('resourceSelectedForCompare', false);

export const REMOVE_ROOT_FOLDER_COMMAND_ID = 'removeRootFolder';
export const REMOVE_ROOT_FOLDER_LABEL = nls.localize('removeFolderFromWorkspace', "Remove Folder from Workspace");

export const PREVIOUS_COMPRESSED_FOLDER = 'previousCompressedFolder';
export const NEXT_COMPRESSED_FOLDER = 'nextCompressedFolder';
export const FIRST_COMPRESSED_FOLDER = 'firstCompressedFolder';
export const LAST_COMPRESSED_FOLDER = 'lastCompressedFolder';
export const NEW_UNTITLED_FILE_COMMAND_ID = 'workbench.action.files.newUntitledFile';
export const NEW_UNTITLED_FILE_LABEL = nls.localize2('newUntitledFile', "New Untitled Text File");
export const NEW_FILE_COMMAND_ID = 'workbench.action.files.newFile';
