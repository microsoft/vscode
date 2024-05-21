import * as vscode from "vscode";

export async function readFileContent(file: vscode.Uri) {
	const data = await vscode.workspace.fs.readFile(file);
	return Buffer.from(data).toString("utf8");
}
