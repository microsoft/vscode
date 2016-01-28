'use strict';

import * as path from 'path';
import * as baseLinter from './baseLinter';
import * as settings from './../common/configSettings';
import {OutputChannel} from 'vscode';

const PYLINT_COMMANDLINE = " --msg-template='{line},{column},{category},{msg_id}:{msg}' --reports=n --output-format=text";


export class Linter extends baseLinter.BaseLinter {
    constructor(rootDir: string, pythonSettings: settings.IPythonSettings, outputChannel: OutputChannel) {
        super("pylint", pythonSettings, outputChannel);
    }

    private parseMessagesSeverity(category: string): baseLinter.LintMessageSeverity {
        if (this.pythonSettings.linting.pylintCategorySeverity[category]) {
            var severityName = this.pythonSettings.linting.pylintCategorySeverity[category];
            if (baseLinter.LintMessageSeverity[severityName]) {
                return <baseLinter.LintMessageSeverity><any>baseLinter.LintMessageSeverity[severityName]
            }
        }

        return baseLinter.LintMessageSeverity.Information;
    }

    public runLinter(filePath: string, txtDocumentLines: string[]): Promise<baseLinter.ILintMessage[]> {
        if (!this.pythonSettings.linting.pylintEnabled) {
            return Promise.resolve([]);
        }

        var pylintPath = this.pythonSettings.linting.pylintPath;
        var cmdLine = `${pylintPath} ${PYLINT_COMMANDLINE} ${filePath}`;
        return new Promise<baseLinter.ILintMessage[]>((resolve, reject) => {
            this.run(cmdLine, filePath, txtDocumentLines).then(messages=> {
                messages.forEach(msg=> {
                    msg.severity = this.parseMessagesSeverity(msg.type);
                });

                resolve(messages);
            }, reject);
        });
    }
}


// 
// export class Linter {
//     private pylintPath: string;
//     private maxErrorCount: number = 100;
//     private messageSeveritySetting: any = {};
//     public Id: string;
//     constructor(rootDir: string, pythonSettings: any) {
//         this.Id = "pylint";
//         this.pylintPath = pythonSettings && pythonSettings.linting && pythonSettings.linting.pylintPath ? pythonSettings.linting.pylintPath : "pylint";
//         this.maxErrorCount = pythonSettings && pythonSettings.linting && pythonSettings.linting.maxNumberOfProblems ? pythonSettings.linting.maxNumberOfProblems : 100;
//         this.messageSeveritySetting = pythonSettings && pythonSettings.linting && pythonSettings.linting.pylintCategorySeverity ? pythonSettings.linting.pylintCategorySeverity : {};
//     }
// 
//     private parseMessagesSeverity(category: string): baseLinter.LintMessageSeverity {
//         if (this.messageSeveritySetting[category]) {
//             var severityName = this.messageSeveritySetting[category];
//             if (baseLinter.LintMessageSeverity[severityName]) {
//                 return <baseLinter.LintMessageSeverity><any>baseLinter.LintMessageSeverity[severityName]
//             }
//         }
// 
//         return baseLinter.LintMessageSeverity.Information;
//     }
// 
//     public runLinter(filePath: string, txtDocumentLines: string[]): Promise<baseLinter.ILintMessage[]> {
//         var cmdLine = `${this.pylintPath} ${PYLINT_COMMANDLINE} ${filePath}`;
//         return new Promise<baseLinter.ILintMessage[]>(resolve=> {
//             baseLinter.runLinter("pylint", cmdLine, filePath, txtDocumentLines, this.maxErrorCount).then(messages=> {
//                 messages.forEach(msg=> {
//                     msg.severity = this.parseMessagesSeverity(msg.type);
//                 });
// 
//                 resolve(messages);
//             });
//         });
//     }
// }
