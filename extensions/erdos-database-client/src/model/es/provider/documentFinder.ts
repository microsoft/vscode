import * as vscode from 'vscode';
const url = require('url');

export class DocumentFinder {

    private static documentMap = {
        "_count": "search-count",
        "_search": "search-search",
        "_stats": "indices-stats",
    }

    public static find(path: string) {
        return this.documentMap[url.parse(path).pathname.replace("/", '')]
    }

    public static open(path: string) {

        const docuemntPath = this.find(path)
        if (!docuemntPath) {
            vscode.window.showErrorMessage("Not doucment found!")
            return;
        }

        vscode.env.openExternal(vscode.Uri.parse(`https://www.elastic.co/guide/en/elasticsearch/reference/master/${docuemntPath}.html`));


    }


}