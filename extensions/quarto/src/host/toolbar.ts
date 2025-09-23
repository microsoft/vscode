/*
 * toolbar.ts
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

import { CancellationToken, TextDocument, ProviderResult } from "vscode";

export interface ToolbarCommand {
  commandId: string;
  title: string;
  enabled: boolean;
  codeicon?: string;
  text?: string;
}

export interface ToolbarButton extends ToolbarCommand {
  splitMenu?: ToolbarMenu;
}

export interface ToolbarMenu {
  title: string;
  codeicon?: string;
  text?: string;
  items: ToolbarItem[];
}

export type ToolbarItem = ToolbarButton | ToolbarMenu | "---";

export type EditorToolbarProvider = (document: TextDocument, token: CancellationToken) => ProviderResult<ToolbarItem[]>;
