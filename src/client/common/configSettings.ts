"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export interface IPythonSettings {
    pythonPath: string;
    devOptions: any[];
    linting: ILintingSettings;
    formatting: IFormattingSettings;
    unitTest: IUnitTestSettings;
}
export interface IUnitTestSettings {
    nosetestsEnabled: boolean;
    nosetestPath: string;
    pyTestEnabled: boolean;
    pyTestPath: string;
    unittestEnabled: boolean;
    outputWindow: string;
}
export interface IPylintCategorySeverity {
    convention: vscode.DiagnosticSeverity;
    refactor: vscode.DiagnosticSeverity;
    warning: vscode.DiagnosticSeverity;
    error: vscode.DiagnosticSeverity;
    fatal: vscode.DiagnosticSeverity;
}
export interface ILintingSettings {
    enabled: boolean;
    prospectorEnabled: boolean;
    pylintEnabled: boolean;
    pep8Enabled: boolean;
    flake8Enabled: boolean;
    pydocstyleEnabled: boolean;
    lintOnTextChange: boolean;
    lintOnSave: boolean;
    maxNumberOfProblems: number;
    pylintCategorySeverity: IPylintCategorySeverity;
    prospectorPath: string;
    prospectorExtraCommands: string;
    pylintPath: string;
    pep8Path: string;
    flake8Path: string;
    pydocStylePath: string;
    outputWindow: string;
}
export interface IFormattingSettings {
    provider: string;
    autopep8Path: string;
    yapfPath: string;
    formatOnSave: boolean;
    outputWindow: string;
}
export interface IAutoCompeteSettings {
    extraPaths: string[];
}
export class PythonSettings implements IPythonSettings {
    private static pythonSettings: PythonSettings = new PythonSettings();
    constructor() {
        if (PythonSettings.pythonSettings) {
            throw new Error("Singleton class, Use getInstance method");
        }
        vscode.workspace.onDidChangeConfiguration(() => {
            this.initializeSettings();
        });

        this.initializeSettings();
    }
    public static getInstance(): PythonSettings {
        return PythonSettings.pythonSettings;
    }
    private initializeSettings() {
        let pythonSettings = vscode.workspace.getConfiguration("python");
        this.pythonPath = pythonSettings.get<string>("pythonPath");
        this.devOptions = pythonSettings.get<any[]>("devOptions");
        this.devOptions = Array.isArray(this.devOptions) ? this.devOptions : [];
        let lintingSettings = pythonSettings.get<ILintingSettings>("linting");
        if (this.linting) {
            Object.assign<ILintingSettings, ILintingSettings>(this.linting, lintingSettings);
        }
        else {
            this.linting = lintingSettings;
        }

        let formattingSettings = pythonSettings.get<IFormattingSettings>("formatting");
        if (this.formatting) {
            Object.assign<IFormattingSettings, IFormattingSettings>(this.formatting, formattingSettings);
        }
        else {
            this.formatting = formattingSettings;
        }

        let autoCompleteSettings = pythonSettings.get<IAutoCompeteSettings>("autoComplete");
        if (this.autoComplete) {
            Object.assign<IAutoCompeteSettings, IAutoCompeteSettings>(this.autoComplete, autoCompleteSettings);
        }
        else {
            this.autoComplete = autoCompleteSettings;
        }

        let unitTestSettings = pythonSettings.get<IUnitTestSettings>("unitTest");
        if (this.unitTest) {
            Object.assign<IUnitTestSettings, IUnitTestSettings>(this.unitTest, unitTestSettings);
        }
        else {
            this.unitTest = unitTestSettings;
        }
    }

    public pythonPath: string;
    public devOptions: any[];
    public linting: ILintingSettings;
    public formatting: IFormattingSettings;
    public autoComplete: IAutoCompeteSettings;
    public unitTest: IUnitTestSettings;
}