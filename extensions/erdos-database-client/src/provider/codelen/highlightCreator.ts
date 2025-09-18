import { ConfigKey } from "../../common/constants";
import { Global } from "../../common/global";
import * as vscode from 'vscode';
import { SQLParser } from '../parser/sqlParser';

export class HighlightCreator {

    private highLightColor: vscode.TextEditorDecorationType;

    constructor() {

        this.highLightColor = vscode.window.createTextEditorDecorationType({
            light: { backgroundColor: '#5B8DDE20' },
            dark: { backgroundColor: '#0AAAF420' },
        });

        vscode.workspace.onDidChangeTextDocument(() => { this.updateDecoration(vscode.window.activeTextEditor) });
        vscode.window.onDidChangeActiveTextEditor(this.updateDecoration);
        vscode.window.onDidChangeTextEditorSelection((e) => {
            const selections = e.selections;
            if (e.textEditor.document.languageId != 'sql') {
                return
            }
            if (selections.length > 0 && !selections[0].start.isEqual(selections[0].end)) {
                this.updateDecoration(e.textEditor, selections.map(sel => new vscode.Range(sel.start, sel.end)))
            } else {
                this.updateDecoration(e.textEditor)
            }
        });
        this.updateDecoration(vscode.window.activeTextEditor)

    }

    async updateDecoration(textEditor: vscode.TextEditor, ranges?: vscode.Range[]) {

        if (!Global.getConfig(ConfigKey.HIGHLIGHT_SQL_BLOCK)) {
            return;
        }

        const document = textEditor && textEditor.document;
        if (!document || document.languageId != 'sql') {
            return;
        }

        if (!ranges) {
            if (!this) return;
            const range = (SQLParser.parseBlocks(document))
                .map(len => len.range)
                .find(range => range.contains(textEditor.selection) || range.start.line > textEditor.selection.start.line)
            if (range)
                ranges = [range]
        }

        if (ranges && ranges.length > 0) {
            textEditor.setDecorations(this.highLightColor, ranges)
        }

    }

}