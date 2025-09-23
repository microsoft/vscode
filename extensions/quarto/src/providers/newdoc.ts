/*
 * newdoc.ts
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

import {
  workspace,
  window,
  commands,
  NotebookData,
  NotebookCellData,
  NotebookCellKind,
  WorkspaceEdit,
  ViewColumn,
} from "vscode";
import { Command } from "../core/command";
import { getWholeRange, kQuartoLanguageId } from "../core/doc";

export function newDocumentCommands(): Command[] {
  return [
    new NewDocumentCommand("quarto.newDocument"),
    new NewDocumentCommand("quarto.fileNewDocument"),
    new NewPresentationCommand("quarto.newPresentation"),
    new NewNotebookCommand("quarto.newNotebook"),
  ];
}

class NewNotebookCommand implements Command {
  public readonly id: string;
  constructor(cmdId: string) {
    this.id = cmdId;
  }
  async execute(): Promise<void> {
    const cells: NotebookCellData[] = [];
    cells.push(
      new NotebookCellData(
        NotebookCellKind.Code,
        kUntitledHtml.trimEnd(),
        "raw"
      )
    );
    cells.push(new NotebookCellData(NotebookCellKind.Code, "1 + 1", "python"));
    const nbData = new NotebookData(cells);
    let notebook = await workspace.openNotebookDocument(
      "jupyter-notebook",
      nbData
    );
    await commands.executeCommand(
      "vscode.openWith",
      notebook.uri,
      "jupyter-notebook"
    );

    const cell = notebook.cellAt(1);
    const edit = new WorkspaceEdit();
    edit.replace(cell.document.uri, getWholeRange(cell.document), "");

    await workspace.applyEdit(edit);
  }
}

abstract class NewFileCommand implements Command {
  public readonly id: string;
  constructor(cmdId: string, private readonly viewColumn_?: ViewColumn) {
    this.id = cmdId;
  }
  async execute(): Promise<void> {
    const doc = await workspace.openTextDocument({
      language: kQuartoLanguageId,
      content: this.scaffold(),
    });
    await window.showTextDocument(doc, this.viewColumn_, false);
    await commands.executeCommand("cursorMove", { to: "viewPortBottom" });
  }
  protected abstract scaffold(): string;
}

class NewDocumentCommand extends NewFileCommand {
  constructor(cmdId: string) {
    super(cmdId);
  }
  protected scaffold(): string {
    return kUntitledHtml;
  }
}

class NewPresentationCommand extends NewFileCommand {
  constructor(cmdId: string) {
    super(cmdId);
  }
  protected scaffold(): string {
    return `---
title: "Untitled"
format: revealjs
---

`;
  }
}

const kUntitledHtml = `---
title: "Untitled"
format: html
---

`;
