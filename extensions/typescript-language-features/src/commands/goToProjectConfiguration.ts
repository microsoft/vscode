/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import TypeScriptServiceClientHost from '../typeScriptServiceClientHost';
import { ActiveJsTsEditorTracker } from '../ui/activeJsTsEditorTracker';
import { Lazy } from '../utils/lazy';
import { openProjectConfigForFile, ProjectType } from '../tsconfig';
import { Command } from './commandManager';

export class TypeScriptGoToProjectConfigCommand implements Command {
	public readonly id = 'typescript.goToProjectConfig';

	public constructor(
		private readonly activeJsTsEditorTracker: ActiveJsTsEditorTracker,
		private readonly lazyClientHost: Lazy<TypeScriptServiceClientHost>,
	) { }

	public execute() {
		const editor = this.activeJsTsEditorTracker.activeJsTsEditor;
		if (editor) {
			openProjectConfigForFile(ProjectType.TypeScript, this.lazyClientHost.value.serviceClient, editor.document.uri);
		}
	}
}

export class JavaScriptGoToProjectConfigCommand implements Command {
	public readonly id = 'javascript.goToProjectConfig';

	public constructor(
		private readonly activeJsTsEditorTracker: ActiveJsTsEditorTracker,
		private readonly lazyClientHost: Lazy<TypeScriptServiceClientHost>,
	) { }

	public execute() {
		const editor = this.activeJsTsEditorTracker.activeJsTsEditor;
		if (editor) {
			openProjectConfigForFile(ProjectType.JavaScript, this.lazyClientHost.value.serviceClient, editor.document.uri);
		}
	}
}
