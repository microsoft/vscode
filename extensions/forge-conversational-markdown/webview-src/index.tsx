import { render } from 'preact';
import type { FromWebviewMessage } from '../src/protocol/types';
import { App } from './App';

declare function acquireVsCodeApi(): {
	postMessage(message: FromWebviewMessage): void;
};

const vscode = acquireVsCodeApi();

const root = document.getElementById('root');
if (root) {
	render(<App vscode={vscode} />, root);
}
