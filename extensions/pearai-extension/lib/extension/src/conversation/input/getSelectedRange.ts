import { getActiveEditor } from "../../vscode/getActiveEditor";

export const getSelectedRange = async () => getActiveEditor()?.selection;
