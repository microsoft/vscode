const scopedContextKeyService = editor.scopedContextKeyService;
const matchResult = notebookKernelService.getMatchingKernel(notebook);
const { selected, all } = matchResult;
