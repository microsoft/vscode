/**
 * LM プロバイダー用ログ。コンソールと Output パネル（設定時）に出力する。
 */

import * as vscode from 'vscode';

const PREFIX = '[AI Fullcode LM]';
let outputChannel: vscode.OutputChannel | undefined;

export function setLmOutputChannel(channel: vscode.OutputChannel): void {
  outputChannel = channel;
}

export function logLm(message: string, detail?: unknown): void {
  const line = detail !== undefined ? `${message} ${JSON.stringify(detail)}` : message;
  const full = `${PREFIX} ${line}`;
  console.log(full);
  if (outputChannel) {
    outputChannel.appendLine(full);
  }
}
