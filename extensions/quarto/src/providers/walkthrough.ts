/*
 * walkthrough.ts
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

import { window, Uri, workspace, ViewColumn } from "vscode";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { Command } from "../core/command";
import { QuartoContext } from "quarto-core";
import { promptForQuartoInstallation } from "../core/quarto";
import { ExtensionHost } from "../host";

export function walkthroughCommands(host: ExtensionHost, quartoContext: QuartoContext): Command[] {
  return [
    new VerifyInstallationCommand(quartoContext),
    new WalkthroughNewDocumentCommand(host),
  ];
}

class VerifyInstallationCommand implements Command {
  private static readonly id = "quarto.verifyInstallation";
  public readonly id = VerifyInstallationCommand.id;

  constructor(private readonly quartoContext_: QuartoContext) { }

  async execute(): Promise<void> {
    if (this.quartoContext_.available) {
      window.showInformationMessage("Quarto Installation Verified", {
        modal: true,
        detail: `Quarto version ${this.quartoContext_.version} installed at ${this.quartoContext_.binPath}`,
      });
    } else {
      await promptForQuartoInstallation("before using the VS Code extension", true);
    }
  }
}

class WalkthroughNewDocumentCommand implements Command {
  private static readonly id = "quarto.walkthrough.newDocument";
  public readonly id = WalkthroughNewDocumentCommand.id;

  constructor(_host: ExtensionHost) { }

  async execute(): Promise<void> {
    const saveDir = defaultSaveDir();
    const saveOptions = {
      defaultUri: Uri.file(path.join(saveDir, "walkthrough.qmd")),
      filters: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Quarto: ["qmd"],
      },
    };
    const target = await window.showSaveDialog(saveOptions);
    if (target) {
      fs.writeFileSync(target.fsPath, await this.scaffold(), {
        encoding: "utf8",
      });
      const doc = await workspace.openTextDocument(target);
      await window.showTextDocument(doc, ViewColumn.Beside, false);
    }
  }

  private async scaffold(): Promise<string> {
    // use python by default
    const kPython = {
      lang: "python",
      desc: "a Python",
      code: "import os\nos.cpu_count()",
      suffix: ":",
    };
    const langBlock = kPython;
    return `---
title: "Hello, Quarto"
format: html
---

## Markdown

Markdown is an easy to read and write text format:

- It's _plain text_ so works well with version control
- It can be **rendered** into HTML, PDF, and more
- Learn more at: <https://quarto.org/docs/authoring/>

## Code Cell

Here is ${langBlock.desc} code cell${langBlock.suffix}

\`\`\`{${langBlock.lang}}
${langBlock.code}
\`\`\`

## Equation

Use LaTeX to write equations:

$$
\\chi' = \\sum_{i=1}^n k_i s_i^2
$$
`;
  }
}

function defaultSaveDir() {
  if (workspace.workspaceFolders && workspace.workspaceFolders[0]) {
    return workspace.workspaceFolders[0].uri.fsPath;
  } else {
    return os.homedir();
  }
}
