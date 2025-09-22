import * as vscode from 'vscode';
import { DocumentFinder } from './documentFinder';
import { ElasticMatches } from './ElasticMatches'

export class ElasticCodeLensProvider implements vscode.CodeLensProvider {
    public constructor(context: vscode.ExtensionContext) {
    }

    public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken) {

        var esMatches = new ElasticMatches(vscode.window.activeTextEditor)

        var ret = [];

        esMatches.Matches.forEach(em => {
            if (em.Error.Text == null) {
                ret.push(new vscode.CodeLens(em.Method.Range, {
                    title: "▶ Run Query",
                    command: "database.elastic.execute",
                    arguments: [em,false]
                }))
                ret.push(new vscode.CodeLens(em.Method.Range, {
                    title: "▶ Run Query And Parse",
                    command: "database.elastic.execute",
                    arguments: [em,true]
                }))
                if(DocumentFinder.find(em.Path.Text)){
                    ret.push(new vscode.CodeLens(em.Method.Range, {
                        title: "📃 Api Document",
                        command: "database.elastic.document",
                        arguments: [em]
                    }))
                }
                if (em.HasBody) {
                    var command = {
                        title: "⚡Auto indent",
                        command: "database.elastic.lint",
                        arguments: [em]
                    }
                    ret.push(new vscode.CodeLens(em.Method.Range, command))
                }
            }
            else {
                if (em.Error.Text != null) {
                    ret.push(new vscode.CodeLens(em.Method.Range, {
                        title: "⚠️Invalid Json",
                        command: ""
                    }))
                }
            }
        });
        return ret;
    }
}