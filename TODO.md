TODO:
* When updating the diff we get errors about model having been disposed
(possible user is scrolling throught the notebook, and the cells move out hence editos is disposed)
* We might want to hold a ref to all text models of all cells, so that we can update the diff
Do this in chat controller or modified file entry, when opening notebook, ensure all cell are resolved and we get the
text ref models of all cells (original and modified)
* Make changes to a notebook to delete some cells
Scroll those deleted cells into view.
Undo/Redo chat session edits.
Notice the errors
* Zindex of overlay should be higher than cell toolbar

0.17/out/client_renderer/preload.js.map'
2
  ERR Unable to resolve text model content for resource vscode-notebook-cell:/Users/donjayamanne/demo/pyarrow_data/sample.ipynb#X11sZmlsZQ%3D%3D: Error: Unable to resolve text model content for resource vscode-notebook-cell:/Users/donjayamanne/demo/pyarrow_data/sample.ipynb#X11sZmlsZQ%3D%3D
    at ResourceModelCollection.resolveTextModelContent (vscode-file://vscode-app/Users/donjayamanne/Development/vsc/vscode/out/vs/workbench/services/textmodelResolver/common/textModelResolverService.js:167:15)
    at async ResourceModelCollection.doCreateReferencedObject (vscode-file://vscode-app/Users/donjayamanne/Development/vsc/vscode/out/vs/workbench/services/textmodelResolver/common/textModelResolverService.js:73:13)
log.ts:445
  ERR Model is disposed!: Error: Model is disposed!
    at TextModel._assertNotDisposed (vscode-file://vscode-app/Users/donjayamanne/Development/vsc/vscode/out/vs/editor/common/model/textModel.js:296:19)
    at TextModel.getVersionId (vscode-file://vscode-app/Users/donjayamanne/Development/vsc/vscode/out/vs/editor/common/model/textModel.js:509:14)
    at ChatEditingModifiedNotebookFileEntry._updateDiffInfo (vscode-file://vscode-app/Users/donjayamanne/Development/vsc/vscode/out/vs/workbench/contrib/chat/browser/chatEditing/chatEditingModifiedNotebookFileEntry.js:450:52)
    at async vscode-file://vscode-app/Users/donjayamanne/Development/vsc/vscode/out/vs/workbench/contrib/chat/browser/chatEditing/chatEditingModifiedNotebookFileEntry.js:432:21
log.ts:445
  ERR Unable to resolve text model content for resource vscode-notebook-cell:/Users/donjayamanne/demo/pyarrow_data/sample.ipynb#X11sZmlsZQ%3D%3D: Error: Unable to resolve text model content for resource vscode-notebook-cell:/Users/donjayamanne/demo/pyarrow_data/sample.ipynb#X11sZmlsZQ%3D%3D
    at ResourceModelCollection.resolveTextModelContent (vscode-file://vscode-app/Users/donjayamanne/Development/vsc/vscode/out/vs/workbench/services/textmodelResolver/common/textModelResolverService.js:167:15)
    at async ResourceModelCollection.doCreateReferencedObject (vscode-file://vscode-app/Users/donjayamanne/Development/vsc/vscode/out/vs/workbench/services/textmodelResolver/common/textModelResolverService.js:73:13)
    at async AsyncReferenceCollection.acquire (vscode-file://vscode-app/Users/donjayamanne/Development/vsc/vscode/out/vs/base/common/lifecycle.js:531:28)
    at async TextModelResolverService.createModelReference (vscode-file://vscode-app/Users/donjayamanne/Development/vsc/vscode/out/vs/workbench/services/textmodelResolver/common/textModelResolverService.js:205:16)
    at async WordHighlighter._run (vscode-file://vscode-app/Users/donjayamanne/Development/vsc/vscode/out/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js:589:35)

