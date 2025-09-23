/*
 * extension.ts
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

import { InputRule } from 'prosemirror-inputrules';
import { Schema } from 'prosemirror-model';
import { EditorState, Plugin, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { ProsemirrorCommand } from './command';
import { PandocMark } from './mark';
import { PandocNode } from './node';
import { EditorMath, EditorUI } from './ui-types';
import { BaseKeyBinding } from './basekeys';
import { AppendTransactionHandler, AppendMarkTransactionHandler } from './transaction';
import { EditorOptions } from './options';
import { PandocExtensions } from './pandoc';
import { FixupFn } from './fixup';
import { EditorEvents } from './event-types';
import { PandocCapabilities } from './pandoc_capabilities';
import { EditorFormat } from './format';
import { MarkInputRuleFilter } from './input_rule';
import { CompletionHandler } from './completion';
import { EditorNavigation } from './navigation-types';
import { EditorServer } from 'editor-types';
import { ContextMenuHandlerFn } from './menu';
import { EditorFind } from './find-types';
import { EditorTheme } from '../editor/editor-theme';
import { EditorMarkdown } from './markdown-types';

export interface Extension {
  view?: (view: EditorView) => void;
  marks?: PandocMark[];
  nodes?: PandocNode[];
  baseKeys?: (schema: Schema) => readonly BaseKeyBinding[];
  inputRules?: (schema: Schema, markFilter: MarkInputRuleFilter) => readonly InputRule[];
  commands?: (schema: Schema) => readonly ProsemirrorCommand[];
  plugins?: (schema: Schema) => readonly Plugin[];
  applyTransaction?: (state: EditorState, tr: Transaction) => EditorState;
  appendTransaction?: (schema: Schema) => readonly AppendTransactionHandler[];
  appendMarkTransaction?: (schema: Schema) => readonly AppendMarkTransactionHandler[];
  fixups?: (schema: Schema, view: EditorView) => Readonly<FixupFn[]>;
  completionHandlers?: () => readonly CompletionHandler[];
  contextMenuHandlers?: () => readonly ContextMenuHandlerFn[];
}

export interface ExtensionContext {
  pandocExtensions: PandocExtensions;
  pandocCapabilities: PandocCapabilities;
  server: EditorServer;
  ui: EditorUI;
  theme: () => EditorTheme;
  math?: EditorMath;
  format: EditorFormat;
  options: EditorOptions;
  markdown: EditorMarkdown;
  events: EditorEvents;
  navigation: EditorNavigation;
  find: EditorFind;
}

export type ExtensionFn = (context: ExtensionContext) => Extension | null;


