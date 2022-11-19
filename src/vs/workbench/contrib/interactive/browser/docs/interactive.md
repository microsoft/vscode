# Interactive Window

The interactive window component enables extensions to offer REPL like experience to its users. VS Code provides the user interface and extensions provide the execution environment, code completions, execution results rendering and so on.

The interactive window consists of notebook editor at the top and regular monaco editor at the bottom of the viewport. Extensions can extend the interactive window by leveraging the notebook editor API and text editor/document APIs:

* Extensions register notebook controllers for the notebook document in the intearctive window through `vscode.notebooks.createNotebookController`. The notebook document has a special notebook view type `interactive`, which is contributed by the core instead of extensions. The registered notebook controller is responsible for execution.
* Extensions register auto complete provider for the bottom text editor through `vscode.languages.registerCompletionItemProvider`. The resource scheme for the text editor is `interactive-input` and the language used in the editor is determined by the notebook controller contributed by extensions.

Users can type in code in the text editor and after users pressing `Shift+Enter`, we will insert a new code cell into the notebook document with the content from the text editor. Then we will request execution for the newly inserted cell. The notebook controller will handle the execution just like it;s in a normal notebook editor.

## Intearactive Window registration

Registering a new editor type in the workbench consists of two steps

* Register an editor input factory which is responsible for resolving resources with given `glob` patterns. Here we register an `InteractiveWindowInput` for all resources with `vscode-interactive-input` scheme: `vscode-interactive-input:/**`.
* Register an editor pane factory for the given editor input type. Here we register `InteractiveEditor` for our own editor input `InteractiveWindowInput`.

The workbench editor service is not aware of how models are resolved in `EditorInput`, neither how `EditorPane`s are rendered. It only cares about the common states and events on `EditorInput` or `EditorPane`, i.e., display name, capabilities (editable), content change, dirty state change. It's `EditorInput`/`EditorPane`'s responsibility to provide the right info and updates to the editor service. One major difference between Interactive Editor and other editor panes is Interactive Window is never dirty so users never  see a dot on the editor title bar.

![editor registration](interactive.editor.drawio.svg)

## UI/EH editor/document syncing

`EditorInput` is responsible for resolving models for the given resources but in Interactive Window it's much simpler as we are not resolving models ourselves but delegating to Notebook and TextEditor. `InteractiveEditorInput` does the coordination job.

![arch](interactive.eh.drawio.svg)

