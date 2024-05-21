import { getActiveEditor } from "../../vscode/getActiveEditor";

export const getFilename = async () =>
	getActiveEditor()?.document?.fileName.split("/").pop();
