import * as vscode from 'vscode';
import * as util from 'util';

export class MockOutputChannel implements vscode.LogOutputChannel {
    public name: string;
    public output: string;
    public isShown!: boolean;
    private _eventEmitter = new vscode.EventEmitter<vscode.LogLevel>();
    public onDidChangeLogLevel: vscode.Event<vscode.LogLevel> = this._eventEmitter.event;
    constructor(name: string) {
        this.name = name;
        this.output = '';
        this.logLevel = vscode.LogLevel.Debug;
    }
    public logLevel: vscode.LogLevel;
    trace(message: string, ...args: any[]): void {
        this.appendLine(util.format(message, ...args));
    }
    debug(message: string, ...args: any[]): void {
        this.appendLine(util.format(message, ...args));
    }
    info(message: string, ...args: any[]): void {
        this.appendLine(util.format(message, ...args));
    }
    warn(message: string, ...args: any[]): void {
        this.appendLine(util.format(message, ...args));
    }
    error(error: string | Error, ...args: any[]): void {
        this.appendLine(util.format(error, ...args));
    }
    public append(value: string) {
        this.output += value;
    }
    public appendLine(value: string) {
        this.append(value);
        this.append('\n');
    }

    public replace(value: string): void {
        this.output = value;
    }

    public clear() {}
    public show(preservceFocus?: boolean): void;
    public show(column?: vscode.ViewColumn, preserveFocus?: boolean): void;

    public show(_x?: any, _y?: any): void {
        this.isShown = true;
    }
    public hide() {
        this.isShown = false;
    }

    public dispose() {}
}

export class MockStatusBarItem implements vscode.StatusBarItem {
    backgroundColor: vscode.ThemeColor | undefined;
    accessibilityInformation: vscode.AccessibilityInformation | undefined;
    public alignment!: vscode.StatusBarAlignment;
    public priority!: number;
    public text!: string;
    public tooltip!: string;
    public color!: string;
    public command!: string;
    public id: string = '';
    public name: string = '';

    public show(): void {}

    public hide(): void {}

    public dispose(): void {}
}
