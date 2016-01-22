import {Diagnostic} from 'vscode-languageserver';

export interface ILinter {
    run(filePath: string): Promise<Diagnostic[]>;
}