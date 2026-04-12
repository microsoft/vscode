/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
const dotnetBuild = {
    id: 'dotnetCore',
    label: '.NET Core',
    sort: 'NET Core',
    autoDetect: false,
    description: nls.localize('dotnetCore', 'Executes .NET Core build command'),
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "2.0.0",',
        '\t"tasks": [',
        '\t\t{',
        '\t\t\t"label": "build",',
        '\t\t\t"command": "dotnet",',
        '\t\t\t"type": "shell",',
        '\t\t\t"args": [',
        '\t\t\t\t"build",',
        '\t\t\t\t// Ask dotnet build to generate full paths for file names.',
        '\t\t\t\t"/property:GenerateFullPaths=true",',
        '\t\t\t\t// Do not generate summary otherwise it leads to duplicate errors in Problems panel',
        '\t\t\t\t"/consoleloggerparameters:NoSummary"',
        '\t\t\t],',
        '\t\t\t"group": "build",',
        '\t\t\t"presentation": {',
        '\t\t\t\t"reveal": "silent"',
        '\t\t\t},',
        '\t\t\t"problemMatcher": "$msCompile"',
        '\t\t}',
        '\t]',
        '}'
    ].join('\n')
};
const msbuild = {
    id: 'msbuild',
    label: 'MSBuild',
    autoDetect: false,
    description: nls.localize('msbuild', 'Executes the build target'),
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "2.0.0",',
        '\t"tasks": [',
        '\t\t{',
        '\t\t\t"label": "build",',
        '\t\t\t"type": "shell",',
        '\t\t\t"command": "msbuild",',
        '\t\t\t"args": [',
        '\t\t\t\t// Ask msbuild to generate full paths for file names.',
        '\t\t\t\t"/property:GenerateFullPaths=true",',
        '\t\t\t\t"/t:build",',
        '\t\t\t\t// Do not generate summary otherwise it leads to duplicate errors in Problems panel',
        '\t\t\t\t"/consoleloggerparameters:NoSummary"',
        '\t\t\t],',
        '\t\t\t"group": "build",',
        '\t\t\t"presentation": {',
        '\t\t\t\t// Reveal the output only if unrecognized errors occur.',
        '\t\t\t\t"reveal": "silent"',
        '\t\t\t},',
        '\t\t\t// Use the standard MS compiler pattern to detect errors, warnings and infos',
        '\t\t\t"problemMatcher": "$msCompile"',
        '\t\t}',
        '\t]',
        '}'
    ].join('\n')
};
const command = {
    id: 'externalCommand',
    label: 'Others',
    autoDetect: false,
    description: nls.localize('externalCommand', 'Example to run an arbitrary external command'),
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "2.0.0",',
        '\t"tasks": [',
        '\t\t{',
        '\t\t\t"label": "echo",',
        '\t\t\t"type": "shell",',
        '\t\t\t"command": "echo Hello"',
        '\t\t}',
        '\t]',
        '}'
    ].join('\n')
};
const maven = {
    id: 'maven',
    label: 'maven',
    sort: 'MVN',
    autoDetect: false,
    description: nls.localize('Maven', 'Executes common maven commands'),
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "2.0.0",',
        '\t"tasks": [',
        '\t\t{',
        '\t\t\t"label": "verify",',
        '\t\t\t"type": "shell",',
        '\t\t\t"command": "mvn -B verify",',
        '\t\t\t"group": "build"',
        '\t\t},',
        '\t\t{',
        '\t\t\t"label": "test",',
        '\t\t\t"type": "shell",',
        '\t\t\t"command": "mvn -B test",',
        '\t\t\t"group": "test"',
        '\t\t}',
        '\t]',
        '}'
    ].join('\n')
};
let _templates = null;
export function getTemplates() {
    if (!_templates) {
        _templates = [dotnetBuild, msbuild, maven].sort((a, b) => {
            return (a.sort || a.label).localeCompare(b.sort || b.label);
        });
        _templates.push(command);
    }
    return _templates;
}
/** Version 1.0 templates
 *
const gulp: TaskEntry = {
    id: 'gulp',
    label: 'Gulp',
    autoDetect: true,
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "0.1.0",',
        '\t"command": "gulp",',
        '\t"isShellCommand": true,',
        '\t"args": ["--no-color"],',
        '\t"showOutput": "always"',
        '}'
    ].join('\n')
};

const grunt: TaskEntry = {
    id: 'grunt',
    label: 'Grunt',
    autoDetect: true,
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "0.1.0",',
        '\t"command": "grunt",',
        '\t"isShellCommand": true,',
        '\t"args": ["--no-color"],',
        '\t"showOutput": "always"',
        '}'
    ].join('\n')
};

const npm: TaskEntry = {
    id: 'npm',
    label: 'npm',
    sort: 'NPM',
    autoDetect: false,
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "0.1.0",',
        '\t"command": "npm",',
        '\t"isShellCommand": true,',
        '\t"showOutput": "always",',
        '\t"suppressTaskName": true,',
        '\t"tasks": [',
        '\t\t{',
        '\t\t\t"taskName": "install",',
        '\t\t\t"args": ["install"]',
        '\t\t},',
        '\t\t{',
        '\t\t\t"taskName": "update",',
        '\t\t\t"args": ["update"]',
        '\t\t},',
        '\t\t{',
        '\t\t\t"taskName": "test",',
        '\t\t\t"args": ["run", "test"]',
        '\t\t}',
        '\t]',
        '}'
    ].join('\n')
};

const tscConfig: TaskEntry = {
    id: 'tsc.config',
    label: 'TypeScript - tsconfig.json',
    autoDetect: false,
    description: nls.localize('tsc.config', 'Compiles a TypeScript project'),
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "0.1.0",',
        '\t"command": "tsc",',
        '\t"isShellCommand": true,',
        '\t"args": ["-p", "."],',
        '\t"showOutput": "silent",',
        '\t"problemMatcher": "$tsc"',
        '}'
    ].join('\n')
};

const tscWatch: TaskEntry = {
    id: 'tsc.watch',
    label: 'TypeScript - Watch Mode',
    autoDetect: false,
    description: nls.localize('tsc.watch', 'Compiles a TypeScript project in watch mode'),
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "0.1.0",',
        '\t"command": "tsc",',
        '\t"isShellCommand": true,',
        '\t"args": ["-w", "-p", "."],',
        '\t"showOutput": "silent",',
        '\t"isBackground": true,',
        '\t"problemMatcher": "$tsc-watch"',
        '}'
    ].join('\n')
};

const dotnetBuild: TaskEntry = {
    id: 'dotnetCore',
    label: '.NET Core',
    sort: 'NET Core',
    autoDetect: false,
    description: nls.localize('dotnetCore', 'Executes .NET Core build command'),
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "0.1.0",',
        '\t"command": "dotnet",',
        '\t"isShellCommand": true,',
        '\t"args": [],',
        '\t"tasks": [',
        '\t\t{',
        '\t\t\t"taskName": "build",',
        '\t\t\t"args": [ ],',
        '\t\t\t"isBuildCommand": true,',
        '\t\t\t"showOutput": "silent",',
        '\t\t\t"problemMatcher": "$msCompile"',
        '\t\t}',
        '\t]',
        '}'
    ].join('\n')
};

const msbuild: TaskEntry = {
    id: 'msbuild',
    label: 'MSBuild',
    autoDetect: false,
    description: nls.localize('msbuild', 'Executes the build target'),
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "0.1.0",',
        '\t"command": "msbuild",',
        '\t"args": [',
        '\t\t// Ask msbuild to generate full paths for file names.',
        '\t\t"/property:GenerateFullPaths=true"',
        '\t],',
        '\t"taskSelector": "/t:",',
        '\t"showOutput": "silent",',
        '\t"tasks": [',
        '\t\t{',
        '\t\t\t"taskName": "build",',
        '\t\t\t// Show the output window only if unrecognized errors occur.',
        '\t\t\t"showOutput": "silent",',
        '\t\t\t// Use the standard MS compiler pattern to detect errors, warnings and infos',
        '\t\t\t"problemMatcher": "$msCompile"',
        '\t\t}',
        '\t]',
        '}'
    ].join('\n')
};

const command: TaskEntry = {
    id: 'externalCommand',
    label: 'Others',
    autoDetect: false,
    description: nls.localize('externalCommand', 'Example to run an arbitrary external command'),
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "0.1.0",',
        '\t"command": "echo",',
        '\t"isShellCommand": true,',
        '\t"args": ["Hello World"],',
        '\t"showOutput": "always"',
        '}'
    ].join('\n')
};

const maven: TaskEntry = {
    id: 'maven',
    label: 'maven',
    sort: 'MVN',
    autoDetect: false,
    description: nls.localize('Maven', 'Executes common maven commands'),
    content: [
        '{',
        '\t// See https://go.microsoft.com/fwlink/?LinkId=733558',
        '\t// for the documentation about the tasks.json format',
        '\t"version": "0.1.0",',
        '\t"command": "mvn",',
        '\t"isShellCommand": true,',
        '\t"showOutput": "always",',
        '\t"suppressTaskName": true,',
        '\t"tasks": [',
        '\t\t{',
        '\t\t\t"taskName": "verify",',
        '\t\t\t"args": ["-B", "verify"],',
        '\t\t\t"isBuildCommand": true',
        '\t\t},',
        '\t\t{',
        '\t\t\t"taskName": "test",',
        '\t\t\t"args": ["-B", "test"],',
        '\t\t\t"isTestCommand": true',
        '\t\t}',
        '\t]',
        '}'
    ].join('\n')
};

export let templates: TaskEntry[] = [gulp, grunt, tscConfig, tscWatch, dotnetBuild, msbuild, npm, maven].sort((a, b) => {
    return (a.sort || a.label).localeCompare(b.sort || b.label);
});
templates.push(command);
*/
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza1RlbXBsYXRlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi90YXNrVGVtcGxhdGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFVMUMsTUFBTSxXQUFXLEdBQWU7SUFDL0IsRUFBRSxFQUFFLFlBQVk7SUFDaEIsS0FBSyxFQUFFLFdBQVc7SUFDbEIsSUFBSSxFQUFFLFVBQVU7SUFDaEIsVUFBVSxFQUFFLEtBQUs7SUFDakIsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLGtDQUFrQyxDQUFDO0lBQzNFLE9BQU8sRUFBRTtRQUNSLEdBQUc7UUFDSCx5REFBeUQ7UUFDekQsd0RBQXdEO1FBQ3hELHVCQUF1QjtRQUN2QixjQUFjO1FBQ2QsT0FBTztRQUNQLHlCQUF5QjtRQUN6Qiw0QkFBNEI7UUFDNUIsd0JBQXdCO1FBQ3hCLGlCQUFpQjtRQUNqQixrQkFBa0I7UUFDbEIsb0VBQW9FO1FBQ3BFLDZDQUE2QztRQUM3Qyw2RkFBNkY7UUFDN0YsOENBQThDO1FBQzlDLFVBQVU7UUFDVix5QkFBeUI7UUFDekIseUJBQXlCO1FBQ3pCLDRCQUE0QjtRQUM1QixVQUFVO1FBQ1Ysc0NBQXNDO1FBQ3RDLE9BQU87UUFDUCxLQUFLO1FBQ0wsR0FBRztLQUNILENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztDQUNaLENBQUM7QUFFRixNQUFNLE9BQU8sR0FBZTtJQUMzQixFQUFFLEVBQUUsU0FBUztJQUNiLEtBQUssRUFBRSxTQUFTO0lBQ2hCLFVBQVUsRUFBRSxLQUFLO0lBQ2pCLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSwyQkFBMkIsQ0FBQztJQUNqRSxPQUFPLEVBQUU7UUFD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