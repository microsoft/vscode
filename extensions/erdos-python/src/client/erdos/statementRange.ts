/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as erdos from 'erdos';
import * as internalScripts from '../common/process/internal/scripts';
import { IProcessServiceFactory } from '../common/process/types';
import { createDeferred } from '../common/utils/async';
import { IInterpreterService } from '../interpreter/contracts';
import { IServiceContainer } from '../ioc/types';

function movePositionToStartOfLine(position: vscode.Position): vscode.Position {
    return position.with(undefined, 0);
}

function getInitialIndentTextAtLine(document: vscode.TextDocument, initialPosition: vscode.Position): string {
    const lineText = document.lineAt(initialPosition.line).text;
    const indent = lineText.match(/^\s+/);
    return indent ? indent[0] : '';
}

function expandRangeDownward(document: vscode.TextDocument, currentRange: vscode.Range, indent: string): vscode.Range {
    const expandCodeList = ['else', 'elif', 'except', 'finally', '\\}', '\\]', '\\)'];
    const expandCode = ['\\s'].concat(expandCodeList).join('|');
    const expandRegex = new RegExp(`^(${indent}(${expandCode})|\s*#|\s*$)`);

    const whitespaceOnlyRegex = new RegExp('^\\s*$');

    let nextLineNum = currentRange.end.line + 1;

    while (
        nextLineNum < document.lineCount &&
        (document.lineAt(nextLineNum).text.match(whitespaceOnlyRegex) ||
            document.lineAt(nextLineNum).text.match(expandRegex))
    ) {
        nextLineNum += 1;
    }

    const endPosition = document.lineAt(nextLineNum - 1).range.end;
    const endRange = new vscode.Range(currentRange.start, endPosition);
    return endRange;
}

async function provideStatementRangeFromAst(
    document: vscode.TextDocument,
    position: vscode.Position,
    serviceContainer: IServiceContainer,
): Promise<erdos.StatementRange> {
    const interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);
    const processServiceFactory = serviceContainer.get<IProcessServiceFactory>(IProcessServiceFactory);

    const interpreter = await interpreterService.getActiveInterpreter();
    const processService = await processServiceFactory.create();

    const [args, parse] = internalScripts.normalizeSelection();
    const observable = processService.execObservable(interpreter?.path || 'python', args, {
        throwOnStdErr: true,
    });
    const outputPromise = createDeferred<string>();

    let stdout = '';
    observable.out.subscribe({
        next: (output) => {
            if (output.source === 'stdout') {
                stdout += output.out;
            }
        },
        complete: () => {
            outputPromise.resolve(stdout);
        },
        error: (error) => {
            outputPromise.reject(error);
        },
    });
    const input = JSON.stringify({
        wholeFileContent: document.getText(),
        startLine: position.line,
        endLine: position.line,
        emptyHighlight: true,
        smartSendExperimentEnabled: true,
        smartSendSettingsEnabled: true,
    });
    observable.proc?.stdin?.write(input);
    observable.proc?.stdin?.end();

    const outputRaw = await outputPromise.promise;
    const output = JSON.parse(outputRaw);

    if (
        !('startLine' in output) ||
        !('startCharacter' in output) ||
        !('endLine' in output) ||
        !('endCharacter' in output) ||
        !('normalized' in output)
    ) {
        throw new Error('Failed to parse the Python script.');
    }

    return {
        code: parse(output.normalized),
        range: new vscode.Range(
            new vscode.Position(output.startLine - 1, output.startCharacter),
            new vscode.Position(output.endLine - 1, output.endCharacter),
        ),
    };
}

export class PythonStatementRangeProvider implements erdos.StatementRangeProvider {
    constructor(private readonly serviceContainer: IServiceContainer) {}

    async provideStatementRange(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): Promise<erdos.StatementRange | undefined> {
        try {
            return await provideStatementRangeFromAst(document, position, this.serviceContainer);
        } catch {
            let initialPosition = movePositionToStartOfLine(position);

            while (
                initialPosition.line < document.lineCount - 1 &&
                (document.lineAt(initialPosition.line).text.match(/^\s*#/) ||
                    document.lineAt(initialPosition.line).text.match(/^\s*$/))
            ) {
                initialPosition = initialPosition.translate(1);
            }

            const beginRange = new vscode.Range(initialPosition, initialPosition);
            const initialIndentText = getInitialIndentTextAtLine(document, initialPosition);
            const finalRange = expandRangeDownward(document, beginRange, initialIndentText);

            let code = document.getText(finalRange);

            code = code.replace(/^\s*#.*$/gm, '');

            if (code.split(/\r?\n/).length > 1) {
                code = `${code.trimEnd()}\n`;
            }

            return { code, range: finalRange };
        }
    }
}
