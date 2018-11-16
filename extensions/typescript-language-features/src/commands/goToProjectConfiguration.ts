/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import TypeScriptServiceClientHost from '../typeScriptServiceClientHost';
import { nulToken } from '../utils/cancellation';
import { Command } from '../utils/commandManager';
import { Lazy } from '../utils/lazy';
import { isImplicitProjectConfigFile, openOrCreateConfigFile } from '../utils/tsconfig';

const localize = nls.loadMessageBundle();

export class TypeScriptGoToProjectConfigCommand implements Command {
	public readonly id = 'typescript.goToProjectConfig';

	public constructor(
		private readonly lazyClientHost: Lazy<TypeScriptServiceClientHost>,
	) { }

	public execute() {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			goToProjectConfig(this.lazyClientHost.value, true, editor.document.uri);
		}
	}
}

export class JavaScriptGoToProjectConfigCommand implements Command {
	public readonly id = 'javascript.goToProjectConfig';

	public constructor(
		private readonly lazyClientHost: Lazy<TypeScriptServiceClientHost>,
	) { }

	public execute() {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			goToProjectConfig(this.lazyClientHost.value, false, editor.document.uri);
		}
	}
}

async function goToProjectConfig(
	clientHost: TypeScriptServiceClientHost,
	isTypeScriptProject: boolean,
	resource: vscode.Uri
): Promise<void> {
	const client = clientHost.serviceClient;
	const rootPath = client.getWorkspaceRootForResource(resource);
	if (!rootPath) {
		vscode.window.showInformationMessage(
			localize(
				'typescript.projectConfigNoWorkspace',
				'Please open a folder in VS Code to use a TypeScript or JavaScript project'));
		return;
	}

	const file = client.toPath(resource);
	// TSServer errors when 'projectInfo' is invoked on a non js/ts file
	if (!file || !await clientHost.handles(resource)) {
		vscode.window.showWarningMessage(
			localize(
				'typescript.projectConfigUnsupportedFile',
				'Could not determine TypeScript or JavaScript project. Unsupported file type'));
		return;
	}

	let res: protocol.ProjectInfoResponse | undefined;
	try {
		res = await client.execute('projectInfo', { file, needFileNameList: false }, nulToken);
	} catch {
		// noop
	}
	if (!res || !res.body) {
		vscode.window.showWarningMessage(localize('typescript.projectConfigCouldNotGetInfo', 'Could not determine TypeScript or JavaScript project'));
		return;
	}

	const { configFileName } = res.body;
	if (configFileName && !isImplicitProjectConfigFile(configFileName)) {
		const doc = await vscode.workspace.openTextDocument(configFileName);
		vscode.window.showTextDocument(doc, vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined);
		return;
	}

	enum ProjectConfigAction {
		None,
		CreateConfig,
		LearnMore,
	}

	interface ProjectConfigMessageItem extends vscode.MessageItem {
		id: ProjectConfigAction;
	}

	const selected = await vscode.window.showInformationMessage<ProjectConfigMessageItem>(
		(isTypeScriptProject
			? localize('typescript.noTypeScriptProjectConfig', 'File is not part of a TypeScript project. Click [here]({0}) to learn more.', 'https://go.microsoft.com/fwlink/?linkid=841896')
			: localize('typescript.noJavaScriptProjectConfig', 'File is not part of a JavaScript project Click [here]({0}) to learn more.', 'https://go.microsoft.com/fwlink/?linkid=759670')
		), {
			title: isTypeScriptProject
				? localize('typescript.configureTsconfigQuickPick', 'Configure tsconfig.json')
				: localize('typescript.configureJsconfigQuickPick', 'Configure jsconfig.json'),
			id: ProjectConfigAction.CreateConfig,
		});

	switch (selected && selected.id) {
		case ProjectConfigAction.CreateConfig:
			openOrCreateConfigFile(isTypeScriptProject, rootPath, client.configuration);
			return;
	}
}