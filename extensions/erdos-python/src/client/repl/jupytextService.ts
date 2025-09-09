// Copyright (c) Lotas Inc. All rights reserved.
// Licensed under the MIT License.

import path from 'path';
import { Disposable } from 'vscode';
import { PythonServer } from './pythonServer';
import { EXTENSION_ROOT_DIR } from '../constants';
import * as fsapi from '../common/platform/fs-paths';

const JUPYTEXT_SCRIPT_LOCATION = path.join(EXTENSION_ROOT_DIR, 'python_files', 'jupytext_functions.py');

export interface JupytextOptions {
    format_name: string;
}

export interface NotebookPreservationData {
    originalNotebook: any;
    cellData: any[];
    nbformat: number;
    nbformat_minor: number;
    metadata: any;
    filePath: string;
}

export interface NotebookConversionResult {
    pythonText: string;
    preservationData: NotebookPreservationData;
}

export class JupytextService implements Disposable {
    public static scriptContents: string | undefined;

    constructor(private pythonServer: PythonServer) {}

    dispose(): void {
        // No cleanup needed - PythonServer is managed externally
    }


    /**
     * Convert notebook content (from string) to text format with preservation data for output preservation
     */
    async convertNotebookContentToText(notebookContent: string, options: JupytextOptions): Promise<NotebookConversionResult> {
        const scriptLines = (await getContentsOfJupytextScript()).split(/(?:\r\n|\n)/);
        
        const functionCall = `import json; return json.dumps(convert_notebook_content_to_text_with_preservation(${JSON.stringify(notebookContent)}, ${JSON.stringify(options.format_name)}))`;
        scriptLines.push(functionCall);

        const script = wrapScriptInFunction(scriptLines);
        const result = await this.pythonServer.executeSilently(script);

        if (result?.output) {
            const jsonResult = JSON.parse(result.output);
            if (!jsonResult.success) {
                throw new Error(`Jupytext notebook-to-text with preservation conversion failed: ${jsonResult.error}`);
            }
            
            return {
                pythonText: jsonResult.text,
                preservationData: jsonResult.preservation_data
            };
        }

        throw new Error('No result from Jupytext notebook-to-text with preservation conversion');
    }


    /**
     * Convert Python text content directly to notebook format using jupytext
     */
    async convertTextToNotebook(pythonText: string, options: JupytextOptions): Promise<string> {
        const scriptLines = (await getContentsOfJupytextScript()).split(/(?:\r\n|\n)/);
        
        const functionCall = `import json; return json.dumps(convert_text_to_notebook_content(${JSON.stringify(pythonText)}, ${JSON.stringify(options.format_name)}))`;
        scriptLines.push(functionCall);

        const script = wrapScriptInFunction(scriptLines);
        const result = await this.pythonServer.executeSilently(script);

        if (result?.output) {
            const jsonResult = JSON.parse(result.output);
            if (!jsonResult.success) {
                throw new Error(`Jupytext text-to-notebook conversion failed: ${jsonResult.error}`);
            }
            return jsonResult.notebook_json;
        }

        throw new Error('No result from Jupytext text-to-notebook conversion');
    }

    /**
     * Convert text to notebook format with smart merging to preserve unchanged cell outputs
     */
    async convertTextToNotebookWithPreservation(pythonText: string, preservationData: NotebookPreservationData, options: JupytextOptions): Promise<string> {
        console.log('[PROBLEMATIC CONVERSION DEBUG] Input pythonText starts with:', pythonText.substring(0, 200));
        console.log('[PROBLEMATIC CONVERSION DEBUG] Input pythonText ends with:', pythonText.substring(-200));
        console.log('[PROBLEMATIC CONVERSION DEBUG] pythonText length:', pythonText.length);
        
        const scriptLines = (await getContentsOfJupytextScript()).split(/(?:\r\n|\n)/);
        
        // Convert JavaScript null values to Python None in the JSON string
        const preservationDataJson = JSON.stringify(preservationData).replace(/null/g, 'None');
        
        const functionCall = `import json; return json.dumps(convert_text_to_notebook_with_preservation(${JSON.stringify(pythonText)}, ${preservationDataJson}, ${JSON.stringify(options.format_name)}))`;
        console.log('[PROBLEMATIC CONVERSION DEBUG] About to execute Python conversion');
        scriptLines.push(functionCall);

        const script = wrapScriptInFunction(scriptLines);
        const result = await this.pythonServer.executeSilently(script);

        if (result?.output) {
            const jsonResult = JSON.parse(result.output);
            if (!jsonResult.success) {
                console.error('[PROBLEMATIC CONVERSION DEBUG] Python conversion failed with error:', jsonResult.error);
                throw new Error(`Jupytext text-to-notebook with preservation conversion failed: ${jsonResult.error}`);
            }
            console.log('[PROBLEMATIC CONVERSION DEBUG] Python conversion succeeded');
            return jsonResult.notebook_json;
        }

        throw new Error('No result from Jupytext text-to-notebook with preservation conversion');
    }

    /**
     * Check if Jupytext is available in the Python environment
     */
    async checkJupytextInstallation(): Promise<boolean> {
        const scriptLines = (await getContentsOfJupytextScript()).split(/(?:\r\n|\n)/);
        
        const functionCall = `import json; return json.dumps(check_jupytext_installation())`;
        scriptLines.push(functionCall);

        const script = wrapScriptInFunction(scriptLines);
        const result = await this.pythonServer.executeSilently(script);

        if (result?.output) {
            return JSON.parse(result.output) === true;
        }

        return false;
    }
}

function wrapScriptInFunction(scriptLines: string[]): string {
    const indented = scriptLines.map((line) => `    ${line}`).join('\n');
    // put everything into a function scope and then delete that scope
    return `def __VSCODE_run_jupytext_script():\n${indented}\nprint(__VSCODE_run_jupytext_script())\ndel __VSCODE_run_jupytext_script`;
}

async function getContentsOfJupytextScript(): Promise<string> {
    if (JupytextService.scriptContents) {
        return JupytextService.scriptContents;
    }
    const contents = await fsapi.readFile(JUPYTEXT_SCRIPT_LOCATION, 'utf-8');
    JupytextService.scriptContents = contents;
    return JupytextService.scriptContents;
}

