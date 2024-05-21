import { getActiveEditor } from "../../vscode/getActiveEditor";

export const getSelectedText = async () => {
	const activeEditor = getActiveEditor();
	return activeEditor?.document?.getText(activeEditor?.selection);
};
