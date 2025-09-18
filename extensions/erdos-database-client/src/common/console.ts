"user strict";
import * as vscode from "vscode";
import format = require('date-format');

export class Console {
    public static log(value: any) {
        if (this.outputChannel == null) {
            this.outputChannel = vscode.window.createOutputChannel("MySQL");
        }
        if(value instanceof Error){
            console.trace(value)
        }
        this.outputChannel.show(true);
        const begin = format('yyyy-MM-dd hh:mm:ss', new Date());
        this.outputChannel.appendLine(`${begin} ${value}`);
    }

    public static ling(){
        if (this.outputChannel == null) {
            this.outputChannel = vscode.window.createOutputChannel("MySQL");
        }
        this.outputChannel.appendLine("-----------------------------------------------------------------------------------------");
    }

    private static outputChannel: vscode.OutputChannel;
}
