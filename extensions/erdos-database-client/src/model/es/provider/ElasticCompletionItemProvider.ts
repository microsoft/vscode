import * as vscode from 'vscode';
import { ElasticMatch } from './ElasticMatch';
import { ElasticMatches } from './ElasticMatches';
import routington = require('routington');

export class ElasticCompletionItemProvider implements vscode.CompletionItemProvider {

    private readonly restSpec: any;

    constructor() {
        this.restSpec = this.buildRestSpecRouter();
    }

    private buildRestSpecRouter() {
        const restSpec = require('./rest-spec').default;
        const versions = Object.keys(restSpec);
        const result = {};

        versions.forEach(version => {
            const endpointDescriptions = restSpec[version].default;
            const common = endpointDescriptions._common;
            delete endpointDescriptions._common;
            const endpointNames = Object.keys(endpointDescriptions);

            const router = result[version] = routington();

            endpointNames.forEach(endpointName => {
                const endpointDescription = endpointDescriptions[endpointName];
                if (common) {
                    if (endpointDescription.url.params)
                        Object.keys(common.params)
                            .forEach(param => endpointDescription.url.params[param] = common.params[param]);
                    else
                        endpointDescription.url.params = common.params;
                }

                const paths = endpointDescription.url.paths.map(path => path.replace(/\{/g, ':').replace(/\}/g, ''));
                const methods = endpointDescription.methods;
                methods.forEach(method => paths
                    .forEach(path => (router.define(`${method}${path}`)[0].spec = endpointDescription)));
            });
        });

        return result;
    }

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const editor = vscode.window.activeTextEditor
        let esMatch = new ElasticMatches(editor).Selection
        if (!esMatch)
            return [];
        let apiVersion = '6.0.0'
        let restSpec = this.restSpec[apiVersion];
        if (!restSpec)
            return [];

        if (this.isPathCompletion(esMatch, position))
            return this.providePathCompletionItem(esMatch, restSpec);
        else if (this.isPathParamCompletion(esMatch, position))
            return this.providePathParamCompletionItem(esMatch, restSpec);

        console.log(esMatch.Body.Text);
        return [];
    }

    private async providePathParamCompletionItem(esMatch: any, restSpec: any): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        const match = restSpec.match(`${esMatch.Method.Text}${esMatch.Path.Text.split('?')[0]}`);
        if (!match)
            return [];
        return Object.keys(match.node.spec.url.params).map(param => new vscode.CompletionItem(param));
    }

    private async providePathCompletionItem(esMatch: any, restSpec: any): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        let parts = esMatch.Path.Text.split('/').filter(part => part.length);
        let parent = restSpec.child[esMatch.Method.Text];
        let grandParent;

        parts.forEach(part => {
            if (!parent) return;
            grandParent = parent;
            parent = part in parent.child ?
                parent.child[part] :
                parent.children[0];
        });

        if (!parent) return [];

        let result = [];
        let variable = parent.children[0];

        if (variable) {
            if (variable.name == 'index') {
                result = result.concat((await this.listIndices()).map(index => ({
                    label: index
                })));
                result = result.concat((await this.listAliases()).map(index => ({
                    label: index
                })));
            } else if (variable.name == 'name' && grandParent && grandParent.string === '_alias')
                result = result.concat((await this.listAliases()).map(index => ({
                    label: index
                })));
            else if (variable.name == 'repository')
                result = result.concat((await this.listRepositories()).map(repository => ({
                    label: repository
                })));
            else
                result.push({ label: `<${variable.name}>` });
        }

        result = result.concat(Object.keys(parent.child).map(child => ({
            label: child
        })));

        return result.filter(part => part.label.length)
            .map(part => new vscode.CompletionItem(part.label));
    }

    private isPathCompletion(esMatch: ElasticMatch, position: vscode.Position): boolean {
        return esMatch.Method.Range.start.line === position.line &&
            esMatch.Path.Text[esMatch.Path.Text.length - 1] === '/';
    }

    private isPathParamCompletion(esMatch: ElasticMatch, position: vscode.Position): boolean {
        return esMatch.Method.Range.start.line === position.line &&
            (esMatch.Path.Text[esMatch.Path.Text.length - 1] === '?' ||
                esMatch.Path.Text[esMatch.Path.Text.length - 1] === '&');
    }

    private async listIndices(): Promise<string[]> {
        // Return all indices
        return []
    }
    private async listAliases(): Promise<string[]> {
        // Return all index aliases
        // /_cat/aliases
        return []
    }

    private async listRepositories(): Promise<string[]> {
        // Return all snapshot repositories
        // /_snapshot
        return []
    }

}



