import { stringify } from 'comment-json';
import * as vscode from 'vscode';
import { EsUtil } from '../esUtil';
import { DocumentFinder } from './documentFinder';
import { ElasticCodeLensProvider } from './ElasticCodeLensProvider';
import { ElasticCompletionItemProvider } from './ElasticCompletionItemProvider';
import { ElasticMatch } from './ElasticMatch';

export async function activeEs(context: vscode.ExtensionContext) {
    const languages = { language: 'es' };
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(languages, new ElasticCompletionItemProvider(), '/', '?', '&', '"'),
        vscode.languages.registerCodeLensProvider(languages, new ElasticCodeLensProvider(context)),
        vscode.commands.registerCommand('database.elastic.document', (em: ElasticMatch) => { DocumentFinder.open(em.Path.Text) }),
        vscode.commands.registerCommand('database.elastic.execute', EsUtil.executeEsQueryFile),
        vscode.commands.registerCommand('database.elastic.lint', (em: ElasticMatch) => {
            if (em && em.HasBody) {
                vscode.window.activeTextEditor.edit(editBuilder => {
                    editBuilder.replace(em.Body.Range, stringify(em.Body.obj, null, 2))
                });
            }
        }),
    );
}