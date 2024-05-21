import { getActiveEditor } from "../../vscode/getActiveEditor";

export const getLanguage = async () => getActiveEditor()?.document?.languageId;
