import * as path from "path";
import * as vscode from "vscode";


/**
 * Path to the root directory of the extension:
 * https://github.com/microsoft/vscode-python-tools-extension-template/blob/main/src/common/constants.ts
 */
export const EXTENSION_ROOT_DIR =
  path.basename(__dirname) === "common"
    ? path.dirname(path.dirname(__dirname))
    : path.dirname(__dirname);

export const TEST_PATH = path.join(EXTENSION_ROOT_DIR, "src", "test");
export const WORKSPACE_PATH = path.join(TEST_PATH, "examples");
export const WORKSPACE_OUT_PATH = path.join(TEST_PATH, "examples-out");

function examplesUri(fileName: string = ''): vscode.Uri {
  return vscode.Uri.file(path.join(WORKSPACE_PATH, fileName));
}
export function examplesOutUri(fileName: string = ''): vscode.Uri {
  return vscode.Uri.file(path.join(WORKSPACE_OUT_PATH, fileName));
}

export function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function openAndShowTextDocument(fileName: string) {
  const doc = await vscode.workspace.openTextDocument(examplesOutUri(fileName));
  const editor = await vscode.window.showTextDocument(doc);
  return { doc, editor };
}

const APPROX_TIME_TO_OPEN_VISUAL_EDITOR = 1700;
export async function roundtrip(doc: vscode.TextDocument) {
  const before = doc.getText();

  // switch to visual editor and back
  await vscode.commands.executeCommand("quarto.test_setkVisualModeConfirmedTrue");
  await wait(300);
  await vscode.commands.executeCommand("quarto.editInVisualMode");
  await wait(APPROX_TIME_TO_OPEN_VISUAL_EDITOR);
  await vscode.commands.executeCommand("quarto.editInSourceMode");
  await wait(300);

  const after = doc.getText();

  return { before, after };
}

const YELLOW_COLOR_ESCAPE_CODE = '\x1b[33m';
const RESET_COLOR_ESCAPE_CODE = '\x1b[0m';

export async function readOrCreateSnapshot(fileName: string, content: string) {
  const snapshotUri = examplesUri(path.join('generated_snapshots', fileName));
  try {
    const doc = await vscode.workspace.openTextDocument(snapshotUri);
    return doc.getText();
  } catch {
    if (process.env['CI']) throw 'Attempted to create snapshot in CI!';

    console.warn(`${YELLOW_COLOR_ESCAPE_CODE}
⚠︎ Created snapshot in file:
${snapshotUri}
  Please take a look at the snapshot file and ensure it is what you expect
  If it looks good to you, please commit the generated snapshot along with your test code
  If you did not intend to create a snapshot, please carefully check your test code and delete the snapshot file
${RESET_COLOR_ESCAPE_CODE}`);

    await vscode.workspace.fs.writeFile(
      snapshotUri,
      Buffer.from(content, 'utf8') as Uint8Array
    );
    return content;
  }
}
