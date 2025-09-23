/*
 * vdoc-tempfile.ts
 *
 * Copyright (C) 2022-2024 by Posit Software, PBC
 * Copyright (c) 2019 Takashi Tamura
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

import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import * as uuid from "uuid";
import {
  commands,
  Hover,
  Position,
  TextDocument,
  Uri,
  workspace,
} from "vscode";
import { VirtualDoc, VirtualDocUri } from "./vdoc";

/**
 * Create an on disk temporary file containing the contents of the virtual document
 *
 * @param virtualDoc The document to use when populating the temporary file
 * @param docPath The path to the original document the virtual document is
 *   based on. When `local` is `true`, this is used to determine the directory
 *   to create the temporary file in.
 * @param local Whether or not the temporary file should be created "locally" in
 *   the workspace next to `docPath` or in a temporary directory outside the
 *   workspace.
 * @returns A `VirtualDocUri`
 */
export async function virtualDocUriFromTempFile(
  virtualDoc: VirtualDoc,
  docPath: string,
  local: boolean
): Promise<VirtualDocUri> {
  const useLocal = local || virtualDoc.language.localTempFile;

  // If `useLocal`, then create the temporary document alongside the `docPath`
  // so tools like formatters have access to workspace configuration. Otherwise,
  // create it in a temp directory.
  const virtualDocFilepath = useLocal
    ? createVirtualDocLocalFile(virtualDoc, path.dirname(docPath))
    : createVirtualDocTempfile(virtualDoc);

  const virtualDocUri = Uri.file(virtualDocFilepath);
  const virtualDocTextDocument = await workspace.openTextDocument(virtualDocUri);

  if (!useLocal) {
    // TODO: Reevaluate whether this is necessary. Old comment:
    // > if this is the first time getting a virtual doc for this
    // > language then execute a dummy request to cause it to load
    await commands.executeCommand<Hover[]>(
      "vscode.executeHoverProvider",
      virtualDocUri,
      new Position(0, 0)
    );
  }

  return <VirtualDocUri>{
    uri: virtualDocTextDocument.uri,
    cleanup: async () => await deleteDocument(virtualDocTextDocument),
  };
}

/**
 * Delete a virtual document's on disk temporary file
 *
 * Since this is an ephemeral file, we bypass the trash (Trash on Mac, Recycle
 * Bin on Windows) and permadelete it instead so our trash isn't cluttered with
 * thousands of these files. This should also avoid issues with users on network
 * drives, which don't necessarily have access to their Recycle Bin (#708).
 *
 * @param doc The `TextDocument` to delete
 */
async function deleteDocument(doc: TextDocument) {
  try {
    await workspace.fs.delete(doc.uri, {
      useTrash: false
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.log(`Error removing vdoc at ${doc.fileName}: ${msg}`);
  }
}

tmp.setGracefulCleanup();
const VIRTUAL_DOC_TEMP_DIRECTORY = tmp.dirSync().name;

/**
 * Creates a virtual document in a temporary directory
 *
 * The temporary directory is automatically cleaned up on process exit.
 *
 * @param virtualDoc The document to use when populating the temporary file
 * @returns The path to the temporary file
 */
function createVirtualDocTempfile(virtualDoc: VirtualDoc): string {
  const filepath = generateVirtualDocFilepath(VIRTUAL_DOC_TEMP_DIRECTORY, virtualDoc.language.extension);
  createVirtualDoc(filepath, virtualDoc.content);
  return filepath;
}

/**
 * Creates a virtual document in the provided directory
 *
 * @param virtualDoc The document to use when populating the temporary file
 * @param directory The directory to create the temporary file in
 * @returns The path to the temporary file
 */
function createVirtualDocLocalFile(virtualDoc: VirtualDoc, directory: string): string {
  const filepath = generateVirtualDocFilepath(directory, virtualDoc.language.extension);
  createVirtualDoc(filepath, virtualDoc.content);
  return filepath;
}

/**
 * Creates a file filled with the provided content
 */
function createVirtualDoc(filepath: string, content: string): void {
  const directory = path.dirname(filepath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory);
  }

  fs.writeFileSync(filepath, content);
}

/**
 * Generates a unique virtual document file path
 *
 * It is important for virtual documents to have unique file paths. If a static
 * name like `.vdoc.{ext}` is used, it is possible for one language server
 * request to overwrite the contents of the virtual document while another
 * language server request is running (#683).
 */
function generateVirtualDocFilepath(directory: string, extension: string): string {
  return path.join(directory, ".vdoc." + uuid.v4() + "." + extension);
}
