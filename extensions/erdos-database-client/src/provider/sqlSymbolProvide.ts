import * as vscode from 'vscode';
import { SQLParser } from './parser/sqlParser';

export class SQLSymbolProvide implements vscode.DocumentSymbolProvider {

    provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {

        return SQLParser.parseBlocks(document).map(block => {
            return new vscode.SymbolInformation(block.sql, vscode.SymbolKind.Function, null,
                new vscode.Location(document.uri, block.range.start)
            )
        })
    }

}