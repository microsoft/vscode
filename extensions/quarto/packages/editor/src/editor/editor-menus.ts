/*
 * editor-menus.ts
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

import { EditorUI } from '../api/ui-types';
import { tableMenu } from '../api/table';
import { EditorCommandId, EditorCommand } from '../api/command';
import { EditorOptions } from '../api/options';

export function editorMenus(options: EditorOptions, ui: EditorUI, commands: EditorCommand[]) {
  return {
    format: formatMenu(ui, commands),
    insert: insertMenu(options, ui, commands),
    table: tableMenu(true, ui),
  };
}

function formatMenu(ui: EditorUI, commands: EditorCommand[]) {
  return [
    { command: EditorCommandId.Strong },
    { command: EditorCommandId.Em },
    { command: EditorCommandId.Underline },
    { command: EditorCommandId.Code },
    {
      text: ui.context.translateText('Text'),
      subMenu: {
        items: [
          { command: EditorCommandId.Strikeout },
          { command: EditorCommandId.Superscript },
          { command: EditorCommandId.Subscript },
          { command: EditorCommandId.Smallcaps },
        ],
      },
    },
    { separator: true },
    {
      text: ui.context.translateText('Bullets & Numbering'),
      subMenu: {
        items: [
          { command: EditorCommandId.BulletList },
          { command: EditorCommandId.OrderedList },
          { separator: true },
          { command: EditorCommandId.TightList },
          { separator: true },
          { command: EditorCommandId.ListItemCheck },
          { command: EditorCommandId.ListItemCheckToggle },
          { separator: true },
          { command: EditorCommandId.ListItemSink },
          { command: EditorCommandId.ListItemLift },
          { separator: true },
          { command: EditorCommandId.EditListProperties },
        ],
      },
    },
    { separator: true },
    { command: codeBlockCommand(commands) },
    { command: EditorCommandId.Blockquote },
    { command: EditorCommandId.LineBlock },
    { separator: haveAnyOf(commands, EditorCommandId.Div, EditorCommandId.Span) },
    { command: EditorCommandId.Div },
    { command: EditorCommandId.Span },
    { separator: true },
    {
      text: ui.context.translateText('Raw'),
      subMenu: {
        items: [
          { command: EditorCommandId.HTMLInline },
          { command: EditorCommandId.HTMLBlock },
          { separator: true },
          { command: EditorCommandId.TexInline },
          { command: EditorCommandId.TexBlock },
          { separator: true },
          { command: EditorCommandId.RawInline },
          { command: EditorCommandId.RawBlock },
        ],
      },
    },
    { separator: true },
    { command: EditorCommandId.ClearFormatting },
    { separator: true },
    { command: EditorCommandId.AttrEdit },
  ];
}

function insertMenu(options: EditorOptions, ui: EditorUI, commands: EditorCommand[]) {
  const pyDefault = !!options.defaultCellTypePython;
  return [
    { command: EditorCommandId.OmniInsert },
    { separator: true },
    { command: EditorCommandId.YamlMetadata },
    ...(haveAnyOf(commands, EditorCommandId.RCodeChunk, EditorCommandId.PythonCodeChunk)
      ? [
          { separator: true },
          {
            text: ui.context.translateText('Executable Cell'),
            subMenu: {
              items: [
                ...(pyDefault
                  ? [ { command: EditorCommandId.PythonCodeChunk }, 
                      { command: EditorCommandId.RCodeChunk } ]  
                  : [ { command: EditorCommandId.RCodeChunk }, 
                      { command: EditorCommandId.PythonCodeChunk } ] 
                ),
                { command: EditorCommandId.BashCodeChunk },
                { command: EditorCommandId.RcppCodeChunk },
                { command: EditorCommandId.SQLCodeChunk },
                { command: EditorCommandId.D3CodeChunk },
                { command: EditorCommandId.StanCodeChunk },
                { command: EditorCommandId.JuliaCodeChunk },
                { separator: true },
                { command: EditorCommandId.MermaidCodeChunk },
                { command: EditorCommandId.GraphVizCodeChunk }
              ],
            },
          },
        ]
      : []),
    { separator: true },
    { command: EditorCommandId.Table },
    { command: EditorCommandId.Image },
    { command: EditorCommandId.Link },
    { command: EditorCommandId.Shortcode },
    { separator: true },
    { command: EditorCommandId.CodeBlockFormat },
    ...(haveAnyOf(commands, EditorCommandId.Citation, EditorCommandId.CrossReference, EditorCommandId.Footnote)
    ? [
      { separator: true },
      { command: EditorCommandId.Citation },
      { command: EditorCommandId.CrossReference },
      { command: EditorCommandId.Footnote },
    ] : []),
    ...(haveAnyOf(commands, EditorCommandId.InsertSlideNotes, EditorCommandId.InsertSlidePause, EditorCommandId.InsertSlideColumns)
    ? [
      { separator: true },
      { command: EditorCommandId.InsertSlideColumns },
      { command: EditorCommandId.InsertSlidePause },
      { command: EditorCommandId.InsertSlideNotes }
    ] : []),
    { separator: true },
    ...(haveAnyOf(commands, EditorCommandId.InlineMath, EditorCommandId.DisplayMath)
    ? [
        {
          text: ui.context.translateText('LaTeX Math'),
          subMenu: {
            items: [
              { command: EditorCommandId.InlineMath },
              { command: EditorCommandId.DisplayMath },
            ],
          },
        },
      ]
    : []),
    ...(haveAnyOf(commands, EditorCommandId.DefinitionList)
      ? [
          {
            text: ui.context.translateText('Definition'),
            subMenu: {
              items: [
                { command: EditorCommandId.DefinitionList },
                { separator: true },
                { command: EditorCommandId.DefinitionTerm },
                { command: EditorCommandId.DefinitionDescription },
              ],
            },
          },
        ]
      : []),
    {
      text: ui.context.translateText('Special Characters'),
      subMenu: {
        items: [
          { command: EditorCommandId.Emoji },
          { command: EditorCommandId.Symbol },
          { separator: true },
          { command: EditorCommandId.EnDash },
          { command: EditorCommandId.EmDash },
          { separator: true },
          { command: EditorCommandId.NonBreakingSpace },
          { separator: true },
          { command: EditorCommandId.HardLineBreak },
        ],
      },
    },
    { separator: true },
    { command: EditorCommandId.ParagraphInsert },
    { command: EditorCommandId.InsertDiv },
    { command: EditorCommandId.HorizontalRule },
    ...(haveAnyOf(commands, EditorCommandId.Tabset)
     ? [
      { separator: true },
      { command: EditorCommandId.Tabset },
      { command: EditorCommandId.Callout },
     ] : []),
    { separator: true },
    { command: haveAnyOf(commands, EditorCommandId.UserComment) 
        ? EditorCommandId.UserComment 
        : EditorCommandId.HTMLComment 
    }      
  ];
}

function haveAnyOf(commands: EditorCommand[], ...ids: EditorCommandId[]) {
  for (const command of commands) {
    if (ids.includes(command.id)) {
      return true;
    }
  }
  return false;
}

function codeBlockCommand(commands: EditorCommand[]) {
  return haveAnyOf(commands, EditorCommandId.CodeBlockFormat)
    ? EditorCommandId.CodeBlockFormat
    : EditorCommandId.CodeBlock;
}
