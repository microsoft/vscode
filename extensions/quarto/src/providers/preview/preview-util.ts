/*
 * preview-util.ts
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

import semver from "semver";

import vscode from "vscode";
import { TextDocument, workspace } from "vscode";

import {
  projectDirForDocument,
  metadataFilesForDocument,
  yamlFromMetadataFile,
} from "quarto-core";
import { isNotebook } from "../../core/doc";

import { MarkdownEngine } from "../../markdown/engine";
import { documentFrontMatter } from "../../markdown/document";
import { isKnitrDocument } from "../../host/executors";
import { getRenderOnSave, getRenderOnSaveShiny } from "../context-keys";


export function isQuartoShinyDoc(
  engine: MarkdownEngine,
  doc?: TextDocument
) {
  if (doc) {
    const frontMatter = documentFrontMatter(engine, doc);
    if (frontMatter["server"] === "shiny") {
      return true;
    } else {
      if (typeof frontMatter["server"] === "object") {
        return (
          (frontMatter["server"] as Record<string, unknown>)["type"] === "shiny"
        );
      }
    }
    return false;
  } else {
    return false;
  }
}

export function isQuartoShinyKnitrDoc(
  engine: MarkdownEngine,
  doc?: TextDocument
) {
  return doc && isQuartoShinyDoc(engine, doc) && isKnitrDocument(doc, engine);

}

export async function isRPackage(): Promise<boolean> {
  const descriptionLines = await parseRPackageDescription();
  if (!descriptionLines) {
    return false;
  }
  const packageLines = descriptionLines.filter(line => line.startsWith('Package:'));
  const typeLines = descriptionLines.filter(line => line.startsWith('Type:'));
  const typeIsPackage = (typeLines.length > 0
    ? typeLines[0].toLowerCase().includes('package')
    : false);
  const typeIsPackageOrMissing = typeLines.length === 0 || typeIsPackage;
  return packageLines.length > 0 && typeIsPackageOrMissing;
}

async function parseRPackageDescription(): Promise<string[]> {
  if (vscode.workspace.workspaceFolders !== undefined) {
    const folderUri = vscode.workspace.workspaceFolders[0].uri;
    const fileUri = vscode.Uri.joinPath(folderUri, 'DESCRIPTION');
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      const descriptionText = Buffer.from(bytes).toString('utf8');
      const descriptionLines = descriptionText.split(/(\r?\n)/);
      return descriptionLines;
    } catch { }
  }
  return [''];
}

export async function renderOnSave(engine: MarkdownEngine, document: TextDocument) {
  // if its a notebook and we don't have a save hook for notebooks then don't
  // allow renderOnSave (b/c we can't detect the saves)
  if (isNotebook(document) && !haveNotebookSaveEvents()) {
    return false;
  }

  // notebooks automatically get renderOnSave
  if (isNotebook(document)) {
    return true;
  }

  // first look for document level editor setting
  const docYaml = documentFrontMatter(engine, document);
  const docSetting = readRenderOnSave(docYaml);
  if (docSetting !== undefined) {
    return docSetting;
  }

  // now project level (take the first metadata file with a setting)
  const projectDir = projectDirForDocument(document.uri.fsPath);
  if (projectDir) {
    const metadataFiles = metadataFilesForDocument(document.uri.fsPath);
    if (metadataFiles) {
      for (const metadataFile of metadataFiles) {
        const yaml = yamlFromMetadataFile(metadataFile);
        if (yaml) {
          const projSetting = readRenderOnSave(yaml);
          if (projSetting !== undefined) {
            return projSetting;
          }
        }
      }
    }
  }

  // finally, consult configuration
  return !isQuartoShinyDoc(engine, document)
    ? getRenderOnSave()
    : getRenderOnSaveShiny();
}

export function haveNotebookSaveEvents() {
  return (
    semver.gte(vscode.version, "1.67.0") &&
    !!(workspace as any).onDidSaveNotebookDocument
  );
}

function readRenderOnSave(yaml: Record<string, unknown>) {
  if (typeof yaml["editor"] === "object") {
    const yamlObj = yaml["editor"] as Record<string, unknown>;
    if (typeof yamlObj["render-on-save"] === "boolean") {
      return yamlObj["render-on-save"] as boolean;
    }
  }
  return undefined;
}
