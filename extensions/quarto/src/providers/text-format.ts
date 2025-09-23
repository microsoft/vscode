/*
 * text-format.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 * Copyright (c) 张宇. All rights reserved (https://github.com/yzhang-gh/vscode-markdown/blob/master/src/formatting.ts)
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

// ported from: https://github.com/yzhang-gh/vscode-markdown/blob/432e134f3cab8e18823fcb2e677fef4dbf3f1140/src/formatting.ts#

import {
  Position,
  window,
  WorkspaceEdit,
  Selection,
  Range,
  workspace,
  TextEditor,
} from "vscode";
import { Command } from "../core/command";

export function textFormattingCommands(): Command[] {
  return [
    new ToggleBoldCommand(),
    new ToggleItalicCommand(),
    new ToggleCodeCommand(),
  ];
}

class ToggleCommand implements Command {
  public readonly id: string;
  constructor(
    cmdId: string,
    private readonly startPattern_: string,
    private readonly endPattern_ = startPattern_
  ) {
    this.id = cmdId;
  }

  async execute(): Promise<void> {
    // ensure we are dealing with a text editor
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }

    let selections = editor.selections;

    let batchEdit = new WorkspaceEdit();
    let shifts: [Position, number][] = [];
    let newSelections: Selection[] = selections.slice();

    for (const [i, selection] of selections.entries()) {
      let cursorPos = selection.active;
      const shift = shifts
        .map(([pos, s]) =>
          selection.start.line === pos.line &&
            selection.start.character >= pos.character
            ? s
            : 0
        )
        .reduce((a, b) => a + b, 0);

      if (selection.isEmpty) {
        const context = getContext(
          editor,
          cursorPos,
          this.startPattern_,
          this.endPattern_
        );

        // No selected text
        if (
          this.startPattern_ === this.endPattern_ &&
          ["**", "*", "__", "_"].includes(this.startPattern_) &&
          context === `${this.startPattern_}text|${this.endPattern_}`
        ) {
          // `**text|**` to `**text**|`
          let newCursorPos = cursorPos.with({
            character: cursorPos.character + shift + this.endPattern_.length,
          });
          newSelections[i] = new Selection(newCursorPos, newCursorPos);
          continue;
        } else if (context === `${this.startPattern_}|${this.endPattern_}`) {
          // `**|**` to `|`
          let start = cursorPos.with({
            character: cursorPos.character - this.startPattern_.length,
          });
          let end = cursorPos.with({
            character: cursorPos.character + this.endPattern_.length,
          });
          wrapRange(
            editor,
            batchEdit,
            shifts,
            newSelections,
            i,
            shift,
            cursorPos,
            new Range(start, end),
            false,
            this.startPattern_,
            this.endPattern_
          );
        } else {
          // Select word under cursor
          let wordRange = editor.document.getWordRangeAtPosition(cursorPos);
          if (wordRange === undefined) {
            wordRange = selection;
          }
          // One special case: toggle strikethrough in task list
          const currentTextLine = editor.document.lineAt(cursorPos.line);
          if (
            this.startPattern_ === "~~" &&
            /^\s*[\*\+\-] (\[[ x]\] )? */g.test(currentTextLine.text)
          ) {
            wordRange = currentTextLine.range.with(
              new Position(
                cursorPos.line,
                currentTextLine.text.match(
                  /^\s*[\*\+\-] (\[[ x]\] )? */g
                )![0].length
              )
            );
          }
          wrapRange(
            editor,
            batchEdit,
            shifts,
            newSelections,
            i,
            shift,
            cursorPos,
            wordRange,
            false,
            this.startPattern_,
            this.endPattern_
          );
        }
      } else {
        // Text selected
        wrapRange(
          editor,
          batchEdit,
          shifts,
          newSelections,
          i,
          shift,
          cursorPos,
          selection,
          true,
          this.startPattern_,
          this.endPattern_
        );
      }
    }

    return workspace.applyEdit(batchEdit).then(() => {
      editor.selections = newSelections;
    });
  }
}

class ToggleBoldCommand extends ToggleCommand {
  constructor() {
    super("quarto.toggleBold", "**");
  }
}

class ToggleItalicCommand extends ToggleCommand {
  constructor() {
    super("quarto.toggleItalic", "_");
  }
}

class ToggleCodeCommand extends ToggleCommand {
  constructor() {
    super("quarto.toggleCode", "`");
  }
}

function wrapRange(
  editor: TextEditor,
  wsEdit: WorkspaceEdit,
  shifts: [Position, number][],
  newSelections: Selection[],
  i: number,
  shift: number,
  cursor: Position,
  range: Range,
  isSelected: boolean,
  startPtn: string,
  endPtn: string
) {
  let text = editor.document.getText(range);
  const prevSelection = newSelections[i];
  const ptnLength = (startPtn + endPtn).length;

  let newCursorPos = cursor.with({ character: cursor.character + shift });
  let newSelection: Selection;
  if (isWrapped(text, startPtn, endPtn)) {
    // remove start/end patterns from range
    wsEdit.replace(
      editor.document.uri,
      range,
      text.substr(startPtn.length, text.length - ptnLength)
    );

    shifts.push([range.end, -ptnLength]);

    // Fix cursor position
    if (!isSelected) {
      if (!range.isEmpty) {
        // means quick styling
        if (cursor.character === range.end.character) {
          newCursorPos = cursor.with({
            character: cursor.character + shift - ptnLength,
          });
        } else {
          newCursorPos = cursor.with({
            character: cursor.character + shift - startPtn.length,
          });
        }
      } else {
        // means `**|**` -> `|`
        newCursorPos = cursor.with({
          character: cursor.character + shift + startPtn.length,
        });
      }
      newSelection = new Selection(newCursorPos, newCursorPos);
    } else {
      newSelection = new Selection(
        prevSelection.start.with({
          character: prevSelection.start.character + shift,
        }),
        prevSelection.end.with({
          character: prevSelection.end.character + shift - ptnLength,
        })
      );
    }
  } else {
    // add start/end patterns around range
    wsEdit.replace(editor.document.uri, range, startPtn + text + endPtn);

    shifts.push([range.end, ptnLength]);

    // Fix cursor position
    if (!isSelected) {
      if (!range.isEmpty) {
        // means quick styling
        if (cursor.character === range.end.character) {
          newCursorPos = cursor.with({
            character: cursor.character + shift + ptnLength,
          });
        } else {
          newCursorPos = cursor.with({
            character: cursor.character + shift + startPtn.length,
          });
        }
      } else {
        // means `|` -> `**|**`
        newCursorPos = cursor.with({
          character: cursor.character + shift + startPtn.length,
        });
      }
      newSelection = new Selection(newCursorPos, newCursorPos);
    } else {
      newSelection = new Selection(
        prevSelection.start.with({
          character: prevSelection.start.character + shift,
        }),
        prevSelection.end.with({
          character: prevSelection.end.character + shift + ptnLength,
        })
      );
    }
  }

  newSelections[i] = newSelection;
}

function isWrapped(
  text: string,
  startPattern: string,
  endPattern: string
): boolean {
  return text.startsWith(startPattern) && text.endsWith(endPattern);
}

function getContext(
  editor: TextEditor,
  cursorPos: Position,
  startPattern: string,
  endPattern: string
): string {
  let startPositionCharacter = cursorPos.character - startPattern.length;
  let endPositionCharacter = cursorPos.character + endPattern.length;

  if (startPositionCharacter < 0) {
    startPositionCharacter = 0;
  }

  let leftText = editor.document.getText(
    new Range(
      cursorPos.line,
      startPositionCharacter,
      cursorPos.line,
      cursorPos.character
    )
  );
  let rightText = editor.document.getText(
    new Range(
      cursorPos.line,
      cursorPos.character,
      cursorPos.line,
      endPositionCharacter
    )
  );

  if (rightText === endPattern) {
    if (leftText === startPattern) {
      return `${startPattern}|${endPattern}`;
    } else {
      return `${startPattern}text|${endPattern}`;
    }
  }
  return "|";
}
