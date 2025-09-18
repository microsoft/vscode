import * as vscode from 'vscode';
import { ElasticMatch } from './ElasticMatch';

export class ElasticMatches {
    Editor: vscode.TextEditor
    Matches: ElasticMatch[]
    Selection: ElasticMatch

    public constructor(editor: vscode.TextEditor) {

        if (!editor) {
            console.error("updateDecorations(): no active text editor.");
            this.Matches = []
            return
        }
        this.Editor = editor
        this.Matches = []

        var matched = false

        for (var i = 0; i < editor.document.lineCount; i++) {
            var line = editor.document.lineAt(i)
            var text = line.text.trim()
            if (text.length == 0)
                continue

            if (matched && text.startsWith('{'))
                this.Matches[this.Matches.length - 1].HasBody = true

            matched = false
            var match = ElasticMatch.RegexMatch.exec(text);

            if (match != null) {
                matched = true
                let em = new ElasticMatch(line, match);
                this.Matches.push(em)
            }
        }

        this.UpdateSelection(editor)
    }

    public UpdateSelection(editor) {
        this.Editor = editor
        this.Matches.forEach(element => {
            element.Selected = element.Range.contains(editor.selection)
            if (element.Selected)
                this.Selection = element
        });
    }
}