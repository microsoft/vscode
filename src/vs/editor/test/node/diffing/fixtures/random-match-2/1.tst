if (!all.length && !sourceActions.length) {
	const activeNotebookModel = getNotebookEditorFromEditorPane(editorService.activeEditorPane)?.textModel;
	if (activeNotebookModel) {
		const language = this.getSuggestedLanguage(activeNotebookModel);
		suggestedExtension = language ? this.getSuggestedKernelFromLanguage(activeNotebookModel.viewType, language) : undefined;
	}
	if (suggestedExtension) {
