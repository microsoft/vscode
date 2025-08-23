import { CancellationToken } from 'vscode';
import path from 'path';
import * as fsapi from '../../common/platform/fs-paths';
import { IVariableDescription } from './types';
import { PythonServer } from '../pythonServer';
import { EXTENSION_ROOT_DIR } from '../../constants';

const VARIABLE_SCRIPT_LOCATION = path.join(EXTENSION_ROOT_DIR, 'python_files', 'get_variable_info.py');

export class VariableRequester {
    public static scriptContents: string | undefined;

    constructor(private pythonServer: PythonServer) {}

    async getAllVariableDescriptions(
        parent: IVariableDescription | undefined,
        start: number,
        token: CancellationToken,
    ): Promise<IVariableDescription[]> {
        const scriptLines = (await getContentsOfVariablesScript()).split(/(?:\r\n|\n)/);
        if (parent) {
            const printCall = `import json;return json.dumps(getAllChildrenDescriptions(\'${
                parent.root
            }\', ${JSON.stringify(parent.propertyChain)}, ${start}))`;
            scriptLines.push(printCall);
        } else {
            scriptLines.push('import json;return json.dumps(getVariableDescriptions())');
        }

        if (token.isCancellationRequested) {
            return [];
        }

        const script = wrapScriptInFunction(scriptLines);
        const result = await this.pythonServer.executeSilently(script);

        if (result?.output && !token.isCancellationRequested) {
            return JSON.parse(result.output) as IVariableDescription[];
        }

        return [];
    }
}

function wrapScriptInFunction(scriptLines: string[]): string {
    const indented = scriptLines.map((line) => `    ${line}`).join('\n');
    // put everything into a function scope and then delete that scope
    // TODO: run in a background thread
    return `def __VSCODE_run_script():\n${indented}\nprint(__VSCODE_run_script())\ndel __VSCODE_run_script`;
}

async function getContentsOfVariablesScript(): Promise<string> {
    if (VariableRequester.scriptContents) {
        return VariableRequester.scriptContents;
    }
    const contents = await fsapi.readFile(VARIABLE_SCRIPT_LOCATION, 'utf-8');
    VariableRequester.scriptContents = contents;
    return VariableRequester.scriptContents;
}
