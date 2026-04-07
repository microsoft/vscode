/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, PromptMetadata, PromptPiece, PromptSizing } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IPromptPathRepresentationService } from '../../../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { createFencedCodeBlock } from '../../../../../util/common/markdown';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ToolName } from '../../../../tools/common/toolNames';
import { IFileTreeData, workspaceVisualFileTree } from './visualFileTree';

type WorkspaceStructureProps = BasePromptElementProps & {
	maxSize: number;
	excludeDotFiles?: boolean;
	readonly availableTools?: readonly vscode.LanguageModelToolInformation[];
};

export class WorkspaceStructure extends PromptElement<WorkspaceStructureProps, IFileTreeData | undefined> {

	constructor(
		props: WorkspaceStructureProps,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing, progress: vscode.Progress<vscode.ChatResponseProgressPart> | undefined, token?: vscode.CancellationToken): Promise<IFileTreeData | undefined> {
		const root = this.workspaceService.getWorkspaceFolders().at(0);
		if (!root) {
			return;
		}

		return this.instantiationService.invokeFunction(accessor => workspaceVisualFileTree(accessor, root, { maxLength: this.props.maxSize, excludeDotFiles: this.props.excludeDotFiles }, token ?? CancellationToken.None));
	}

	override render(state: IFileTreeData | undefined, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		if (!state) {
			return;
		}

		return <>
			I am working in a workspace that has the following structure:<br />
			<br />
			{createFencedCodeBlock('', state.tree)}
		</>;
	}
}

export interface IMultirootWorkspaceTrees { label: string; tree: IFileTreeData }

export class WorkspaceStructureMetadata extends PromptMetadata {
	constructor(public readonly value: IMultirootWorkspaceTrees[]) {
		super();
	}
}

/**
 * Similar to {@link WorkspaceStructure}, but for multiroot workspaces it
 * prefixes each path with the workspace label.
 */
export class MultirootWorkspaceStructure extends PromptElement<WorkspaceStructureProps, { label: string; tree: IFileTreeData }[]> {
	/**
	 * Takes a list of relative file paths referenced in a multiroot workspace
	 * response and returns their URIs.
	 */
	public static toURIs(workspaceService: IWorkspaceService, files: string[]) {
		const folders = workspaceService.getWorkspaceFolders();
		if (!folders.length) {
			return [];
		}

		const labels = folders.map(f => workspaceService.getWorkspaceFolderName(f));
		const result: { file: URI; workspaceFolder: URI; relativePath: string }[] = [];
		for (let relativePath of files) {
			const segments = relativePath.split(/[\\/]/g);

			let workspaceFolder = folders[0];
			if (folders.length > 1) {
				const index = labels.indexOf(segments[0]);
				if (index !== -1) {
					segments.shift();
					relativePath = segments.join('/');
					workspaceFolder = folders[index];
				}
			}

			result.push({ file: URI.joinPath(workspaceFolder, ...segments), workspaceFolder, relativePath });
		}

		return result;
	}

	constructor(props: WorkspaceStructureProps,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing, progress: vscode.Progress<vscode.ChatResponseProgressPart> | undefined, token?: vscode.CancellationToken): Promise<{ label: string; tree: IFileTreeData }[]> {
		const folders = this.workspaceService.getWorkspaceFolders();
		return this.instantiationService.invokeFunction(accessor => Promise.all(folders.map(async folder => ({
			label: this.workspaceService.getWorkspaceFolderName(folder),
			tree: await workspaceVisualFileTree(accessor, folder, { maxLength: this.props.maxSize / folders.length, excludeDotFiles: this.props.excludeDotFiles }, token ?? CancellationToken.None)
		}))));
	}

	override render(state: { label: string; tree: IFileTreeData }[], sizing: PromptSizing): PromptPiece<any, any> | undefined {
		if (!state.length) {
			return;
		}

		let str: string;
		if (state.length === 1) {
			str = state[0].tree.tree;
		} else {
			str = '';
			for (const { label, tree } of state) {
				str += `${label}/\n`;
				for (const line of tree.tree.split('\n')) {
					str += `\t${line}\n`;
				}
			}
		}

		return <>
			I am working in a workspace that has the following structure:<br />
			<meta value={new WorkspaceStructureMetadata(state)} local />
			{createFencedCodeBlock('', str)}
		</>;
	}
}

export class AgentMultirootWorkspaceStructure extends MultirootWorkspaceStructure {
	constructor(props: WorkspaceStructureProps,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceService workspaceService: IWorkspaceService,
	) {
		super(props, instantiationService, workspaceService);
	}

	override async prepare(sizing: PromptSizing, progress: vscode.Progress<vscode.ChatResponseProgressPart> | undefined, token?: vscode.CancellationToken): Promise<{ label: string; tree: IFileTreeData }[]> {
		if (!this.props.availableTools?.find(tool => tool.name === ToolName.ListDirectory)) {
			return [];
		}

		return super.prepare(sizing, progress, token);
	}

	override render(state: { label: string; tree: IFileTreeData }[], sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const base = super.render(state, sizing);
		if (!base) {
			return;
		}

		return <>
			{base}<br />
			This is the state of the context at this point in the conversation. The view of the workspace structure may be truncated. You can use tools to collect more context if needed.
		</>;
	}
}

type DirectoryStructureProps = BasePromptElementProps & {
	maxSize: number;
	directory: URI;
};

export class DirectoryStructure extends PromptElement<DirectoryStructureProps, IFileTreeData> {

	constructor(
		props: DirectoryStructureProps,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing, progress: vscode.Progress<vscode.ChatResponseProgressPart> | undefined, token?: vscode.CancellationToken): Promise<IFileTreeData> {
		return this._instantiationService.invokeFunction(accessor => workspaceVisualFileTree(accessor, this.props.directory, { maxLength: this.props.maxSize }, token ?? CancellationToken.None));
	}

	override render(state: IFileTreeData, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		if (!state) {
			return;
		}

		return <>
			The folder `{this._promptPathRepresentationService.getFilePath(this.props.directory)}` has the following structure:<br />
			<br />
			{createFencedCodeBlock('', state.tree)}
		</>;
	}
}
