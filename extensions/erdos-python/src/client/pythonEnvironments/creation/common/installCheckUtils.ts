// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License

import { Diagnostic, DiagnosticSeverity, l10n, Range, TextDocument, Uri } from 'vscode';
import { installedCheckScript } from '../../../common/process/internal/scripts';
import { plainExec } from '../../../common/process/rawProcessApis';
import { traceInfo, traceVerbose, traceError } from '../../../logging';
import { getConfiguration } from '../../../common/vscodeApis/workspaceApis';
import { IInterpreterService } from '../../../interpreter/contracts';

interface PackageDiagnostic {
    package: string;
    line: number;
    character: number;
    endLine: number;
    endCharacter: number;
    code: string;
    severity: DiagnosticSeverity;
}

export const INSTALL_CHECKER_SOURCE = 'Python-InstalledPackagesChecker';

function parseDiagnostics(data: string): Diagnostic[] {
    let diagnostics: Diagnostic[] = [];
    try {
        const raw = JSON.parse(data) as PackageDiagnostic[];
        diagnostics = raw.map((item) => {
            const d = new Diagnostic(
                new Range(item.line, item.character, item.endLine, item.endCharacter),
                l10n.t('Package `{0}` is not installed in the selected environment.', item.package),
                item.severity,
            );
            d.code = { value: item.code, target: Uri.parse(`https://pypi.org/p/${item.package}`) };
            d.source = INSTALL_CHECKER_SOURCE;
            return d;
        });
    } catch {
        diagnostics = [];
    }
    return diagnostics;
}

function getMissingPackageSeverity(doc: TextDocument): number {
    const config = getConfiguration('python', doc.uri);
    const severity: string = config.get<string>('missingPackage.severity', 'Hint');
    if (severity === 'Error') {
        return DiagnosticSeverity.Error;
    }
    if (severity === 'Warning') {
        return DiagnosticSeverity.Warning;
    }
    if (severity === 'Information') {
        return DiagnosticSeverity.Information;
    }
    return DiagnosticSeverity.Hint;
}

export async function getInstalledPackagesDiagnostics(
    interpreterService: IInterpreterService,
    doc: TextDocument,
): Promise<Diagnostic[]> {
    const interpreter = await interpreterService.getActiveInterpreter(doc.uri);
    if (!interpreter) {
        return [];
    }
    const scriptPath = installedCheckScript();
    try {
        traceInfo('Running installed packages checker: ', interpreter, scriptPath, doc.uri.fsPath);
        const envCopy = { ...process.env, VSCODE_MISSING_PGK_SEVERITY: `${getMissingPackageSeverity(doc)}` };
        const result = await plainExec(interpreter.path, [scriptPath, doc.uri.fsPath], {
            env: envCopy,
        });
        traceVerbose('Installed packages check result:\n', result.stdout);
        if (result.stderr) {
            traceError('Installed packages check error:\n', result.stderr);
        }
        return parseDiagnostics(result.stdout);
    } catch (ex) {
        traceError('Error while getting installed packages check result:\n', ex);
    }
    return [];
}
