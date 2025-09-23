import { Schema } from "prosemirror-model";
import { ExtensionManager } from "editor/src/editor/editor-extensions";
import { appendTransactionsPlugin, appendMarkTransactionsPlugin } from "editor/src/api/transaction";
import { EditorUI } from "editor/src/api/ui";

export function initPlugins(schema: Schema, extensions: ExtensionManager, ui: EditorUI) {
  return [
    appendTransactionsPlugin(extensions.appendTransactions(schema)),
    appendMarkTransactionsPlugin(extensions.appendMarkTransactions(schema)),
    ...extensions.plugins(schema, ui),
  ];
}