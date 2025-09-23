import * as vscode from "vscode";

export const QUARTO_EXTENSION_ID = 'quarto.quarto';

export function extension() {
  const extension = vscode.extensions.getExtension(QUARTO_EXTENSION_ID);

  if (extension === undefined) {
    throw new Error(`Extension ${QUARTO_EXTENSION_ID} not found`);
  }

  return extension;
}
