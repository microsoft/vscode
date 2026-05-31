if (!all.length && !sourceActions.length) {
	const language = this.getSuggestedLanguage(notebookTextModel);
	suggestedExtension = language ? this.getSuggestedKernelFromLanguage(notebookTextModel.viewType, language) : undefined;
	if (suggestedExtension) {
