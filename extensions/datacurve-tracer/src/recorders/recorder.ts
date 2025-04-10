import { IRecorder, ITrace } from '../types';
import * as vscode from 'vscode';

export abstract class Recorder implements IRecorder {
	context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	abstract record(trace: ITrace): Promise<void>;

	abstract export(): Promise<vscode.Uri>;

	abstract dispose(): void;
}
