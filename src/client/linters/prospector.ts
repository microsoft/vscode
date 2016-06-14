'use strict';

import * as path from 'path';
import * as baseLinter from './baseLinter';
import {OutputChannel, workspace} from 'vscode';

const PROSPECTOR_COMMANDLINE = " --output-format=vscode";

const REGEX = '(?<line>\\d+),(?<column>\\d+),(?<type>[\\w-]+),(?<code>[\\w-]+):(?<message>.*)\\r?(\\n|$)';


export class Linter extends baseLinter.BaseLinter {
    constructor(outputChannel: OutputChannel) {
        super("prospector", outputChannel);
    }

    public isEnabled(): Boolean {
        return this.pythonSettings.linting.prospectorEnabled;
    }
    public runLinter(filePath: string, txtDocumentLines: string[]): Promise<baseLinter.ILintMessage[]> {
        if (!this.pythonSettings.linting.prospectorEnabled) {
            return Promise.resolve([]);
        }

        var prospectorPath = this.pythonSettings.linting.prospectorPath;
        var prospectorSourcePath = this.pythonSettings.linting.prospectorSourcePath;
        var prospectorExtraCommands = this.pythonSettings.linting.prospectorExtraCommands;
        // prospector works best with relative path
        var fileName = filePath.replace(path.join(workspace.rootPath, prospectorSourcePath, '/'), '');
        var cmdLine = `${prospectorPath} ${PROSPECTOR_COMMANDLINE} ${prospectorExtraCommands} "${fileName}"`;
        return new Promise<baseLinter.ILintMessage[]>((resolve, reject) => {
            this.run(cmdLine, filePath, txtDocumentLines, path.join(workspace.rootPath, prospectorSourcePath) , REGEX).then(messages=> {
                //All messages in prospector are treated as warn, ings for now
                messages.forEach(msg=> {
                    msg.severity = baseLinter.LintMessageSeverity.Information;
                });

                resolve(messages);
            }, reject);
        });
    }
}
