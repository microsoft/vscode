import { Range, TextEditor } from 'vscode';
import { IDocumentManager } from '../../client/common/application/types';

export interface IMockTextEditor extends TextEditor {}

export interface IMockDocumentManager extends IDocumentManager {
    changeDocument(file: string, changes: { range: Range; newText: string }[]): void;
}
