/*
 * notebook.ts
 *
 * Copyright (C) 2023 by Posit Software, PBC
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

import { JupyterKernelspec, JupyterNotebook } from "./types";

export function jupyterFromJSON(nbContents: string): JupyterNotebook {
  // parse the notebook
  const nbJSON = JSON.parse(nbContents);
  const nb = nbJSON as JupyterNotebook;

  // vscode doesn't write a language to the kernelspec so also try language_info
  // google colab doesn't write a language at all, in that case try to deduce off of name
  if (!nb.metadata.kernelspec?.language) {
    if (nb.metadata.kernelspec) {
      nb.metadata.kernelspec.language = nbJSON.metadata.language_info?.name;
      if (
        !nb.metadata.kernelspec.language &&
        nb.metadata.kernelspec.name?.includes("python")
      ) {
        nb.metadata.kernelspec.language = "python";
      }
    } else {
      // provide default
      nb.metadata.kernelspec = jupyterDefaultPythonKernelspec();
    }
  }

  // validate that we have a language
  if (!nb.metadata.kernelspec.language) {
    throw new Error("No language set for Jupyter notebook");
  }

  // validate that we have cells
  if (!nb.cells) {
    throw new Error("No cells available in Jupyter notebook");
  }

  return nb;
}

export function jupyterDefaultPythonKernelspec(): JupyterKernelspec {
  return {
    "display_name": "Python 3",
    "language": "python",
    "name": "python3",
  };
}

