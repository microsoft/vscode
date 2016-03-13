/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';

import { IPickOpenEntry } from 'vs/workbench/services/quickopen/common/quickOpenService';

export interface TaskEntry extends IPickOpenEntry {
	autoDetect: boolean;
	content: string;
}

const gulp: TaskEntry = {
	id: 'gulp',
	label: 'Gulp',
	autoDetect: true,
	description: nls.localize('gulp', 'Creates a tasks.json file for gulp. If a gulp file is present tasks will be auto-detected.'),
	content: [
		'{',
			'\t// See http://go.microsoft.com/fwlink/?LinkId=733558',
			'\t// for the documentation about the tasks.json format',
			'\t"version": "0.1.0",',
			'\t"command": "gulp",',
			'\t"isShellCommand": true,',
			'\t"args": ["--no-color"],',
			'\t"showOutput": "silent"',
		'}'
	].join('\n')
};

const jake: TaskEntry = {
	id: 'jake',
	label: 'Jake',
	autoDetect: true,
	description: nls.localize('jake', 'Creates a tasks.json file for Jake. If a jake file is present tasks will be auto-detected.'),
	content: [
		'{',
			'\t// See http://go.microsoft.com/fwlink/?LinkId=733558',
			'\t// for the documentation about the tasks.json format',
			'\t"version": "0.1.0",',
			'\t"command": "jake",',
			'\t"isShellCommand": true,',
			'\t"showOutput": "silent"',
		'}'
	].join('\n')
};

const grunt: TaskEntry = {
	id: 'grunt',
	label: 'Grunt',
	autoDetect: true,
	description: nls.localize('grunt', 'Creates a tasks.json file for Grunt. If a jake file is present tasks will be auto-detected.'),
	content: [
		'{',
			'\t// See http://go.microsoft.com/fwlink/?LinkId=733558',
			'\t// for the documentation about the tasks.json format',
			'\t"version": "0.1.0",',
			'\t"command": "grunt",',
			'\t"isShellCommand": true,',
			'\t"args": ["--no-color"],',
			'\t"showOutput": "silent"',
		'}'
	].join('\n')
};

const tscSpecificFile: TaskEntry = {
	id: 'tsc.specificFile',
	label: 'TypeScript - Specific File',
	autoDetect: false,
	description: nls.localize('tsc.specificFile', 'Creates a tasks.json that compiles a specific TypeScript file.'),
	content: [
		'{',
			'\t// See http://go.microsoft.com/fwlink/?LinkId=733558',
			'\t// for the documentation about the tasks.json format',
			'\t"version": "0.1.0",',
			'\t"command": "tsc",',
			'\t"isShellCommand": true,',
			'\t"args": ["file.ts"],',
			'\t"showOutput": "silent",',
			'\t"problemMatcher": "$tsc"',
		'}'
	].join('\n')
};

const tscConfig: TaskEntry = {
	id: 'tsc.config',
	label: 'TypeScript - tsconfig.json',
	autoDetect: false,
	description: nls.localize('tsc.config', 'Creates a tasks.json that compiles a TypeScript project.'),
	content: [
		'{',
			'\t// See http://go.microsoft.com/fwlink/?LinkId=733558',
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
	description: nls.localize('tsc.watch', 'Creates a tasks.json that compiles a TypeScript project in watch mode.'),
	content: [
		'{',
			'\t// See http://go.microsoft.com/fwlink/?LinkId=733558',
			'\t// for the documentation about the tasks.json format',
			'\t"version": "0.1.0",',
			'\t"command": "tsc",',
			'\t"isShellCommand": true,',
			'\t"args": ["-w", "-p", "."],',
			'\t"showOutput": "silent",',
			'\t"problemMatcher": "$tsc-watch"',
		'}'
	].join('\n')
};

const tscOpenFile: TaskEntry = {
	id: 'tsc.openFile',
	label: 'TypeScript - Open File',
	autoDetect: false,
	description: nls.localize('tsc.openFile', 'Creates a tasks.json that compiles the currently open TypeScript file.'),
	content: [
		'{',
			'\t// See http://go.microsoft.com/fwlink/?LinkId=733558',
			'\t// for the documentation about the tasks.json format',
			'\t"version": "0.1.0",',
			'\t"command": "tsc",',
			'\t"isShellCommand": true,',
			'\t"args": ["${file}"],',
			'\t"showOutput": "silent",',
			'\t"problemMatcher": {',
				'\t\t"base": "$tsc",',
				'\t\t"fileLocation": "absolute"',
			'\t}',
		'}'
	].join('\n')
};

const dotnetBuild: TaskEntry = {
	id: 'dotnetBuild',
	label: '.Net build',
	autoDetect: false,
	description: nls.localize('dotnetBuild', 'Creates a tasks.json that compiles using dotnet build.'),
	content: [
		'{',
			'\t// See http://go.microsoft.com/fwlink/?LinkId=733558',
			'\t// for the documentation about the tasks.json format',
			'\t"version": "0.1.0",',
			'\t"command": "dotnet build",',
			'\t"showOutput": "always"',
		'}'
	].join('\n')
};

const msbuild: TaskEntry = {
	id: 'msbuild',
	label: 'MSBuild',
	autoDetect: false,
	description: nls.localize('msbuild', 'Creates a tasks.json that compiles using msbuild.'),
	content: [
		'{',
			'\t// See http://go.microsoft.com/fwlink/?LinkId=733558',
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
	label: 'External Command',
	autoDetect: false,
	description: nls.localize('externalCommand', 'Creates a tasks.json for an external command to run.'),
	content: [
		'{',
			'\t// See http://go.microsoft.com/fwlink/?LinkId=733558',
			'\t// for the documentation about the tasks.json format',
			'\t"version": "0.1.0",',
			'\t"command": "echo",',
			'\t"isShellCommand": true,',
			'\t"args": ["Hello World"],',
			'\t"showOutput": "always"',
		'}'
	].join('\n')
};


export const templates: TaskEntry[] = [gulp, jake, grunt, tscConfig, tscSpecificFile, tscOpenFile, tscWatch, dotnetBuild, msbuild, command];