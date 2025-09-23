/*
 * preview-env.ts
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

import { Uri } from "vscode";

import { PreviewOutputSink } from "./preview-output";
import { TerminalEnv, terminalEnv } from "../../core/terminal";

export interface PreviewEnv extends TerminalEnv {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  QUARTO_LOG: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  QUARTO_RENDER_TOKEN: string;
}

export function previewEnvsEqual(a?: PreviewEnv, b?: PreviewEnv) {
  return (
    a !== undefined &&
    b !== undefined &&
    a?.QUARTO_LOG === b?.QUARTO_LOG &&
    a?.QUARTO_RENDER_TOKEN === b?.QUARTO_RENDER_TOKEN &&
    a?.QUARTO_PYTHON === b?.QUARTO_PYTHON &&
    a?.QUARTO_R === b?.QUARTO_R
  );
}

export class PreviewEnvManager {
  constructor(
    outputSink: PreviewOutputSink,
    private readonly renderToken_: string
  ) {
    this.outputFile_ = outputSink.outputFile();
  }

  public async previewEnv(uri: Uri) {

    const env: PreviewEnv = {

      // eslint-disable-next-line @typescript-eslint/naming-convention
      QUARTO_LOG: this.outputFile_,

      // eslint-disable-next-line @typescript-eslint/naming-convention
      QUARTO_RENDER_TOKEN: this.renderToken_,

      ...(await terminalEnv(uri))

    };

    return env;
  }
  private readonly outputFile_: string;
}
