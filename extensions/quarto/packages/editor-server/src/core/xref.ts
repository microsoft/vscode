/*
 * xref.ts
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

import * as fs from "node:fs";
import * as path from "node:path";
import { ExecFileSyncOptions } from "node:child_process";
import * as tmp from "tmp";
tmp.setGracefulCleanup();

import { pathWithForwardSlashes } from "../../../core/src/path.js";

import { QuartoContext, fileCrossrefIndexStorage, quartoProjectConfig } from "../../../quarto-core/src/index.js";
import { EditorServerDocuments } from "./documents.js";
import { xrefsForBook } from "./xref-book.js";
import { XRef } from "../../../editor-types/src/index.js";


export async function xrefsForFile(
  quartoContext: QuartoContext,
  filePath: string,
  documents: EditorServerDocuments,
  projectDir?: string
): Promise<XRef[]> {

  // if this is a book then get xrefs for all chapters/appendices (early return)
  if (projectDir) {
    const config = projectDir ? await quartoProjectConfig(quartoContext.runQuarto, projectDir) : undefined;
    const book = config?.config.project.type === "book";
    if (book) {
      return await xrefsForBook(quartoContext, config, documents);
    }
  }

  // first get the index for the source code
  const srcXRefs = sourceXRefs(quartoContext, filePath, documents, projectDir);

  // get project xref index (rendered)
  const projectXRefIndex = projectDir
    ? projectXrefIndex(projectDir, filePath)
    : new Map<string, string>();
 
  // add computational xrefs (if any)
  const xrefs = [
    ...srcXRefs, 
    ...computationalXRefs(
      srcXRefs, 
      projectXRefIndex, 
      filePath, 
      projectDir
  )];
  
  // return
  return xrefs;
}

export function sourceXRefs(
  quartoContext: QuartoContext,
  filePath: string,
  documents: EditorServerDocuments,
  projectDir?: string
): XRef[] {

  const doc = documents.getDocument(filePath);
  return indexSourceFile(
    quartoContext,
    doc.code,
    projectDir
      ? projectRelativeInput(projectDir, filePath)
      : path.basename(filePath)
  );

}

export type ProjectXRefIndex = Record<string, Record<string, string>>;


export function projectXrefIndex(projectDir: string, filePath?: string): Map<string, string> {
  const mainIndex = new Map<string, string>();
  const projectXRefDir = path.join(projectDir, ".quarto", "xref");
  const projectXRefIndex = path.join(projectXRefDir, "INDEX");
  if (fs.existsSync(projectXRefIndex)) {
    // read index
    const index = JSON.parse(
      fs.readFileSync(projectXRefIndex, { encoding: "utf-8" })
    ) as ProjectXRefIndex;

    for (const input of Object.keys(index)) {

      const inputPath = path.join(projectDir, input);

      // pass if the file doesn't exixt
      if (!fs.existsSync(inputPath)) {
        continue;
      }

      // pass if a filePath filter was provided and it doesn't match
      if (filePath && (path.normalize(inputPath) !== path.normalize(filePath))) {
        continue;
      }

      // pick the most recently written output
      for (const output of Object.values(index[input])) {
        const outputXref = path.join(projectXRefDir, output);
        if (fs.existsSync(outputXref)) {
          if (mainIndex.has(input)) {
            if (
              fs.statSync(outputXref).mtimeMs >
              fs.statSync(mainIndex.get(input)!).mtimeMs
            ) {
              mainIndex.set(input, outputXref);
            }
          } else {
            mainIndex.set(input, outputXref);
          }
        }
      }
      
    }
  }
  return mainIndex;
}

export function computationalXRefs(
  srcXRefs: XRef[],
  projectXRefIndex: Map<string,string>,
  filePath: string, 
  projectDir?: string) {

  // now get the rendered index for this file and ammend w/ computations
  const renderedXrefs = projectDir
    ? readXRefIndex(
        projectXRefIndexPath(projectXRefIndex, projectDir, filePath),
        path.relative(projectDir, filePath)
      )
    : readXRefIndex(
        fileCrossrefIndexStorage(filePath),
        path.basename(filePath)
      );
  const computationalXRefs: XRef[] = [];
  for (const renderedXref of renderedXrefs) {
    // computational ref
    if (
      (renderedXref.type === kFigType || renderedXref.type === kTblType) &&
      renderedXref.suffix
    ) {
      // copy if we have a match in src
      if (
        srcXRefs.find(
          (srcXref) =>
            srcXref.type === renderedXref.type &&
            srcXref.id === renderedXref.id &&
            !srcXref.suffix
        )
      ) {
        computationalXRefs.push(renderedXref);
      }
    }
  }
  return computationalXRefs;
}


function projectRelativeInput(projectDir: string, filePath: string) {
  return pathWithForwardSlashes(path.relative(projectDir, filePath));
}

function projectXRefIndexPath(
  xrefIndex: Map<string, string>,
  projectDir: string,
  filePath: string
) {
  // ensure that our lookup key is correct
  const input = projectRelativeInput(projectDir, filePath);

  // do the lookup
  return xrefIndex.get(input);
}


const kFigType = "fig";
const kTblType = "tbl";

let xrefIndexingDir: string | undefined;

function indexSourceFile(quartoContext: QuartoContext, code: string, filename: string): XRef[] {
  // setup the indexing dir if we need to
  if (!xrefIndexingDir) {
    // create dir
    xrefIndexingDir = tmp.dirSync().name;

    // write defaults file
    const defaultsFile = path.join(xrefIndexingDir, "defaults.yml");
    const filtersPath = path.join(quartoContext.resourcePath, "filters");

    // use qmd reader if it exists
    const qmdReaderPath = path.join(filtersPath, "qmd-reader.lua");
    const from = fs.existsSync(qmdReaderPath) ? qmdReaderPath : 'markdown';

    const defaults = `
from: ${from}
to: native
data-dir: "${pathWithForwardSlashes(
      path.join(quartoContext.resourcePath, "pandoc", "datadir")
    )}"
filters:
  - "${pathWithForwardSlashes(
    path.join(filtersPath, "quarto-init", "quarto-init.lua")
  )}"
  - "${pathWithForwardSlashes(
    path.join(filtersPath, "crossref", "crossref.lua")
  )}"    
`;
    fs.writeFileSync(defaultsFile, defaults, { encoding: "utf-8" });
  }

  // create filter params
  const filterParams = Buffer.from(
    JSON.stringify({
      ["crossref-index-file"]: "index.json",
      ["crossref-input-type"]: "qmd",
    }),
    "utf8"
  ).toString("base64");

  // setup options for calling pandoc
  const options: ExecFileSyncOptions = {
    input: code,
    cwd: xrefIndexingDir,
    env: {
      QUARTO_FILTER_PARAMS: filterParams,
      QUARTO_SHARE_PATH: quartoContext.resourcePath,
    },
  };

  // call pandoc
  const result = quartoContext.runPandoc(options, "--defaults", "defaults.yml");
  if (result) {
    return readXRefIndex(path.join(xrefIndexingDir, "index.json"), filename);
  } else {
    return [];
  }
}

function readXRefIndex(indexPath: string | undefined, filename: string) {
  const xrefs: XRef[] = [];
  if (indexPath && fs.existsSync(indexPath)) {
    const indexJson = fs.readFileSync(indexPath, { encoding: "utf-8" });
    const index = JSON.parse(indexJson) as {
      entries: Array<{ key: string; caption?: string }>;
    };
    for (const entry of index.entries) {
      const match = entry.key.match(/^(\w+)-(.*?)(-\d+)?$/);
      if (match) {
        xrefs.push({
          file: filename,
          type: match[1],
          id: match[2],
          suffix: match[3] || "",
          title: entry.caption || "",
        });
      }
    }
  }
  return xrefs;
}

