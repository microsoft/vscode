/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import assert = require('assert');
import project = require('vs/languages/typescript/common/project/projectService');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import typescript = require('vs/languages/typescript/common/typescript');


suite('TS - ProjectService', () => {

	var projectService: project.ProjectService;

	setup(() => {
		projectService = new project.ProjectService();
		projectService._syncFile(typescript.ChangeKind.Added, URI.file('/one/file1.ts'), "var a = 1234;");
		projectService._syncFile(typescript.ChangeKind.Added, URI.file('/one/file2.ts'), "var b = 1234;");
	});


	test('virtual project', function () {
		var project = projectService.getProject(URI.file('/some/file.ts'));
		assert.ok(!!project);
		assert.equal(project.resource.toString(), 'ts://projects/virtual/1');

		assert.ok(project.host.getCompilationSettings().allowNonTsExtensions);
		assert.equal(project.host.getCompilationSettings().module, ts.ModuleKind.CommonJS);

		assert.ok(project === projectService.getProject(URI.file('/some/other/file.ts')));
	});

	test('configured projects', function () {

		projectService._syncProject(typescript.ChangeKind.Added,
			URI.file('/one/tsconfig.json'),
			[URI.file('/one/file1.ts')],
			ts.getDefaultCompilerOptions());

		var project = projectService.getProject(URI.file('/one/file1.ts'));
		assert.equal(project.host.getCompilationSettings().module, ts.ModuleKind.CommonJS);
		assert.ok(project.host.getCompilationSettings().allowNonTsExtensions);
		assert.ok(project.host.isRoot('file:///one/file1.ts'));
	});

	test('projects can access any file', function () {

		projectService._syncProject(typescript.ChangeKind.Added,
			URI.file('/one/tsconfig.json'),
			[URI.file('/one/file1.ts')],
			ts.getDefaultCompilerOptions());

		var project = projectService.getProject(URI.file('/one/file1.ts'));
		assert.deepEqual(project.host.getScriptFileNames(), ['file:///one/file1.ts'])
		assert.ok(!!project.host.getScriptSnapshot('file:///one/file2.ts'));
	});

	test('configured projects take roots from virtual', function () {

		var virtualProject = projectService.getProject(URI.file('/one/file1.ts'));

		assert.equal(virtualProject.resource.toString(), 'ts://projects/virtual/1');
		assert.ok(virtualProject.host.isRoot('file:///one/file1.ts'));

		projectService._syncProject(typescript.ChangeKind.Added,
			URI.file('/one/tsconfig.json'),
			[URI.file('/one/file1.ts')],
			ts.getDefaultCompilerOptions());

		var configuredProject = projectService.getProject(URI.file('/one/file1.ts'));
		assert.ok(virtualProject !== configuredProject);
		assert.ok(!virtualProject.host.isRoot('file:///one/file1.ts'));
		assert.ok(configuredProject.host.isRoot('file:///one/file1.ts'));
	});
});
