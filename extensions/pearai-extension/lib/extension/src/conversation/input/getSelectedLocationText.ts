import { getActiveEditor } from "../../vscode/getActiveEditor";
import { getFilename } from "./getFilename";

export const getSelectedLocationText = async () => {
	const activeEditor = getActiveEditor();

	if (activeEditor == undefined) {
		return undefined;
	}

	const selectedRange = activeEditor.selection;
	return `${await getFilename()} ${selectedRange.start.line + 1}:${
		selectedRange.end.line + 1
	}`;
};
