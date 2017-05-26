/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';

import { IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';

export interface TaskEntry extends IPickOpenEntry {
	sort?: string;
	autoDetect: boolean;
	content: string;
}

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
		'\t"version": "2.0.0",',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"taskName": "build",',
		'\t\t\t"command": "dotnet",',
		'\t\t\t"isShellCommand": true,',
		'\t\t\t"group": "build",',
		'\t\t\t"terminal": {',
		'\t\t\t\t"reveal": "silent"',
		'\t\t\t},',
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
		'\t"version": "2.0.0",',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"taskName": "build",',
		'\t\t\t"command": "msbuild",',
		'\t\t\t"args": [',
		'\t\t\t\t// Ask msbuild to generate full paths for file names.',
		'\t\t\t\t"/property:GenerateFullPaths=true",',
		'\t\t\t\t"/t:build"',
		'\t\t\t],',
		'\t\t\t"group": "build",',
		'\t\t\t"terminal": {',
		'\t\t\t\t// Reveal the terminal only if unrecognized errors occur.',
		'\t\t\t\t"reveal": "silent"',
		'\t\t\t},',
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
		'\t"version": "2.0.0",',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"taskName": "echo",',
		'\t\t\t"command": "echo Hello",',
		'\t\t\t"isShellCommand": true',
		'\t\t}',
		'\t]',
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
		'\t"version": "2.0.0",',
		'\t"tasks": [',
		'\t\t{',
		'\t\t\t"taskName": "verify",',
		'\t\t\t"command": "mvn -B verify",',
		'\t\t\t"isShellCommand": true,',
		'\t\t\t"group": "build"',
		'\t\t},',
		'\t\t{',
		'\t\t\t"taskName": "test",',
		'\t\t\t"command": "mvn -B test",',
		'\t\t\t"isShellCommand": true,',
		'\t\t\t"group": "test"',
		'\t\t}',
		'\t]',
		'}'
	].join('\n')
};

export let templates: TaskEntry[] = [dotnetBuild, msbuild, maven].sort((a, b) => {
	return (a.sort || a.label).localeCompare(b.sort || b.label);
});
templates.push(command);
