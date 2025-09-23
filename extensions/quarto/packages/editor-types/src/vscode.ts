/*
 * vscode-editor.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { CodeViewActiveBlockContext, CodeViewSelectionAction } from "./codeview";
import { EditorDisplay } from "./display";
import { EditorUIImageResolver } from "./image";
import { Prefs } from "./prefs";
import { SourcePos } from "./source";
import { XRef } from "./xref";

export const VSC_VE_Init = 'vsc_ve_init';
export const VSC_VE_Focus = 'vsc_ve_focus';
export const VSC_VE_IsFocused = 'vsc_ve_is_focused';
export const VSC_VE_GetMarkdown = 'vsc_ve_get_markdown';
export const VSC_VE_GetMarkdownFromState = 'vsc_ve_get_markdown_from_state';
export const VSC_VE_GetSlideIndex = 'vsc_ve_get_slide_index';
export const VSC_VE_ApplyExternalEdit = 'vsc_ve_apply_external_edit';
export const VSC_VE_PrefsChanged = 'vsc_ve_prefs_changed';
export const VSC_VE_ImageChanged = 'vsc_ve_image_changed';
export const VSC_VE_GetActiveBlockContext = 'vsc_ve_get_active_block_context';
export const VSC_VE_SetBlockSelection = 'vsc_ve_set_block_selection';

export const VSC_VEH_GetHostContext = 'vsc_ve_get_host_context';
export const VSC_VEH_ReopenSourceMode = 'vsc_ve_reopen_source_mode';
export const VSC_VEH_OnEditorReady = 'vsc_veh_on_editor_ready';
export const VSC_VEH_OnEditorUpdated = 'vsc_veh_on_editor_updated';
export const VSC_VEH_OnEditorStateChanged = 'vsc_veh_on_editor_state_changed';
export const VSC_VEH_FlushEditorUpdates = 'vsc_veh_flush_editor_updates';
export const VSC_VEH_SaveDocument = 'vsc_veh_save_document';
export const VSC_VEH_RenderDocument = 'vsc_veh_render_document';
export const VSC_VEH_EditorResourceUri = 'vsc_veh_editor_resource_url';

export const VSC_VEH_OpenURL = 'vsc_veh_open_url';
export const VSC_VEH_NavigateToXRef = 'vsc_veh_navigate_to_xref';
export const VSC_VEH_NavigateToFile = 'vsc_veh_navigate_to_file';

export const VSC_VEH_ResolveImageUris = 'vsc_veh_resolve_image_uris';
export const VSC_VEH_ResolveBase64Images = 'vsc_veh_resolve_base64_images';
export const VSC_VEH_SelectImage = 'vsc_veh_select_image';

export type NavLocation = XRef | SourcePos;

export interface VSCodeVisualEditor {
  init: (markdown: string, navigation?: NavLocation) => Promise<string | null>; 
  focus: (navigation?: NavLocation) => Promise<void>;
  isFocused: () => Promise<boolean>;
  getMarkdownFromState: (state: unknown) => Promise<string>;
  getSlideIndex: () => Promise<number>;
  getActiveBlockContext: () => Promise<CodeViewActiveBlockContext | null>;
  setBlockSelection: (context: CodeViewActiveBlockContext, action: CodeViewSelectionAction) => Promise<void>;
  applyExternalEdit: (markdown: string) => Promise<void>;
  prefsChanged: (prefs: Prefs) => Promise<void>;
  imageChanged: (file: string) => Promise<void>;
}

export interface HostContext {
  documentPath: string | null;
  projectDir?: string;
  resourceDir: string;
  isWindowsDesktop: boolean;
  executableLanguages: string[];
}

export interface VSCodeVisualEditorHost extends EditorDisplay, EditorUIImageResolver {
  getHostContext: () => Promise<HostContext>;
  reopenSourceMode: () => Promise<void>;
  onEditorReady: () => Promise<void>; 
  onEditorUpdated: (state: unknown) => Promise<void>;
  onEditorStateChanged: (sourcePos: SourcePos) => Promise<void>;
  flushEditorUpdates: () => Promise<void>;
  saveDocument: () => Promise<void>;
  renderDocument: () => Promise<void>;
  editorResourceUri: (path: string) => Promise<string>;
}



