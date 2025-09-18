import { parse } from 'comment-json';
import * as vscode from 'vscode';

export class ElasticItem {
    public Range: vscode.Range
    public Text: string
    public obj?: any
}

export class ElasticMatch {

    static RegexMatch: RegExp = /^\s*(GET|POST|DELETE|PUT|HEADER)\s+([A-Za-z0-9\-\._~:\/#\[\]@!$&'"%\(\)\*+,;=`?]+)\s*$/gim;
    Error: ElasticItem
    Path: ElasticItem
    Body: ElasticItem
    Method: ElasticItem
    Range: vscode.Range
    HasBody: boolean = false
    Selected: boolean = false

    public constructor(headLine: vscode.TextLine, match) {

        let lrange = new vscode.Range(headLine.lineNumber, match[1].length + 1, headLine.lineNumber, headLine.text.length);
        let mrange = new vscode.Range(headLine.lineNumber, 0, headLine.lineNumber, match[1].length);

        this.Method = { Text: match[1], Range: mrange }
        this.Path = { Text: match[2], Range: lrange }
        this.Body = new ElasticItem()
        this.Error = new ElasticItem()

        const editor = vscode.window.activeTextEditor;

        let lm = 1
        let txt = ""
        let line = this.Method.Range.start.line + 1
        let ln = line

        while (editor.document.lineCount > ln) {
            var t = editor.document.lineAt(ln).text

            var m = ElasticMatch.RegexMatch.exec(t)
            if (m != null) break

            txt += t + "\n"
            lm = editor.document.lineAt(ln).text.length
            ln++;
            var o = txt.split("{").length
            var c = txt.split("}").length
            if (o == c) break
        }

        txt = txt.substring(0, txt.length - 1)

        let sp = new vscode.Position(line, 0)
        let ep = new vscode.Position(ln - 1, lm)
        this.Body.Range = new vscode.Range(sp, ep)

        this.Body.Text = txt

        try {
            this.Body.obj = parse(txt)
            this.HasBody = true
            this.Range = new vscode.Range(this.Method.Range.start, this.Body.Range.end)
        } catch (error) {
            // console.error(error.message)
            this.HasBody = false
            this.Range = new vscode.Range(this.Method.Range.start, this.Path.Range.end)
            this.Error = this.GetErrorFromMessage(txt, error.message)
        }
    }

    GetErrorFromMessage(text: string, message: string): ElasticItem {

        var res = new ElasticItem()

        var regexp = /Position\s(\d+)/gim;
        var match = regexp.exec(message);
        if (match) {
            var pos = +match[1]
            text = text.substring(0, pos)
            var lines: string[] = text.split("\n")
            var char = lines[lines.length - 1].length
            var line = lines.length + this.Method.Range.start.line;
            res.Range = new vscode.Range(line, char, line, char + 1)
        }

        if (text.trim().length > 0)
            res.Text = message

        return res;
    }
}








