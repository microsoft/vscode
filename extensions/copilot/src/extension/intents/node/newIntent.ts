/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { Raw } from '@vscode/prompt-tsx';
import { parse } from 'jsonc-parser';
import type * as vscode from 'vscode';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { GithubRepositoryItem, IGithubRepositoryService } from '../../../platform/github/common/githubService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { extractCodeBlocks } from '../../../util/common/markdown';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import * as path from '../../../util/vs/base/common/path';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseFileTreePart, MarkdownString, Uri } from '../../../vscodeTypes';
import { Intent } from '../../common/constants';
import { commandUri } from '../../linkify/common/commands';
import { convertFileTreeToChatResponseFileTree } from '../../prompt/common/fileTreeParser';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo, IntentLinkificationOptions, IResponseProcessorContext } from '../../prompt/node/intents';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { NewWorkspaceGithubContentMetadata, NewWorkspacePrompt } from '../../prompts/node/panel/newWorkspace/newWorkspace';
import { NewWorkspaceContentsPromptProps } from '../../prompts/node/panel/newWorkspace/newWorkspaceContents';
import { FileContentsGenerator, ProjectSpecificationGenerator } from './generateNewWorkspaceContent';


interface FileTreeDataWithContent extends vscode.ChatResponseFileTree {
	content?: Promise<Uint8Array | undefined>;
	ctime?: number;
	type?: FileType;
}

export const INewWorkspacePreviewContentManager = createServiceIdentifier<INewWorkspacePreviewContentManager>('INewWorkspacePreviewContentManager');
export interface INewWorkspacePreviewContentManager {
	readonly _serviceBrand: undefined;
	set(responseId: string, projectName: string, fileTree: ChatResponseFileTreePart, serviceArgs: any): void;
	get(uri: Uri): FileTreeDataWithContent | undefined;
	getFileTree(responseId: string): ChatResponseFileTreePart | undefined;
}

export const CreateProjectCommand = 'github.copilot.createProject';
export const CreateFileCommand = 'github.copilot.createFile';
export const OpenFileCommand = 'github.copilot.openFile';

export class NewWorkspacePreviewContentManagerImpl implements INewWorkspacePreviewContentManager {
	declare readonly _serviceBrand: undefined;
	private readonly copilotContentManager: NewWorkspaceCopilotContentManager;
	private readonly githubContentManager: NewWorkspaceGitHubContentManager;
	private readonly fileContentManager: NewWorkspaceFileContentManager;
	private responseScopedData = new Map<string, ChatResponseFileTreePart>();
	private prevResponseId: string | undefined;
	private prevFileContents = new Map<string, string>();

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this.copilotContentManager = instantiationService.createInstance(NewWorkspaceCopilotContentManager);
		this.githubContentManager = instantiationService.createInstance(NewWorkspaceGitHubContentManager);
		this.fileContentManager = new NewWorkspaceFileContentManager();
	}

	set(responseId: string, projectName: string, fileTree: ChatResponseFileTreePart, serviceArgs: any) {
		this.responseScopedData.set(responseId, fileTree);
		if (isGithubWorkspaceUri(fileTree.baseUri)) {
			this.githubContentManager.set(responseId, projectName, fileTree, serviceArgs);
		} else if (isCopiltoFileWorkspaceUri(fileTree.baseUri)) {
			this.fileContentManager.set(responseId, projectName, fileTree, serviceArgs);
		} else {
			this.copilotContentManager.set(responseId, projectName, fileTree, serviceArgs);
		}
	}

	get(uri: Uri): FileTreeDataWithContent | undefined {
		if (this.prevResponseId !== uri.authority) {
			this.prevFileContents.clear();
			this.prevResponseId = uri.authority;
		}

		let fileContents: FileTreeDataWithContent | undefined;
		if (isGithubWorkspaceUri(uri)) {
			fileContents = this.githubContentManager.get(uri.authority, uri.path);
		} else if (isCopiltoFileWorkspaceUri(uri)) {
			fileContents = this.fileContentManager.get(uri.authority, uri.path);
		} else {
			fileContents = this.copilotContentManager.get(uri.authority, uri.path, this.prevFileContents);
		}

		fileContents?.content?.then((content) => {
			if (this.prevFileContents.has(uri.path)) {
				return;
			}
			const decoder = new TextDecoder();
			const fileContentStr = decoder.decode(content);
			this.prevFileContents.set(uri.path, fileContentStr);
		});

		return fileContents;
	}

	getFileTree(responseId: string): ChatResponseFileTreePart | undefined {
		return this.responseScopedData.get(responseId);
	}
}

interface ProjectData {
	userPrompt: string;
	projectStructure: string;
	projectSpecification: Promise<string>;
	fileTree: ChatResponseFileTreePart;
	chatMessages: Raw.ChatMessage[];
}

export class NewWorkspaceCopilotContentManager {

	declare readonly _serviceBrand: undefined;
	private promises: Promise<unknown>[] = [];

	private responseScopedData = new Map<string, Map<string, ProjectData>>();
	private generatePlanPrompt = this.instantiationService.createInstance(ProjectSpecificationGenerator);
	private generateFilePrompt = this.instantiationService.createInstance(FileContentsGenerator);

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	// TODO@joyceerhl persistence between reloads
	set(responseId: string, projectName: string, fileTree: ChatResponseFileTreePart, serviceArgs: any) {
		const { userPrompt, projectStructure, chatMessages } = serviceArgs;
		const promptArgs: NewWorkspaceContentsPromptProps = {
			query: userPrompt,
			fileTreeStr: projectStructure,
			history: chatMessages
		};

		const projectSpecificationPromise = this.generatePlanPrompt.generate(promptArgs, CancellationToken.None);
		this.promises.push(projectSpecificationPromise);

		const sessionScopedData = this._getResponseScopedData(responseId);

		const projectData: ProjectData = { userPrompt, projectSpecification: projectSpecificationPromise, projectStructure, fileTree: fileTree, chatMessages };
		sessionScopedData.set(projectName, projectData);
	}

	get(responseId: string, path: string, prevFileContents: Map<string, string>): FileTreeDataWithContent | undefined {
		const { projectName, path: relativePath } = this._getProjectMetadata(path);
		const responseScopedData = this._getResponseScopedData(responseId);
		const data = responseScopedData.get(projectName);
		if (!data) {
			return;
		}

		const fileNodes: FileTreeDataWithContent[] = data.fileTree.value;
		const currentNode = findMatchingNodeFromPath(fileNodes, relativePath);
		if (currentNode && !currentNode?.content) {
			const nodeWithMissingContent = currentNode;
			nodeWithMissingContent.content = this._getFileContent(data.userPrompt, data.projectStructure, data.projectSpecification, path, data.chatMessages, prevFileContents).catch(() => nodeWithMissingContent.content = undefined);
		}
		return currentNode;
	}

	private _prefetch(userPrompt: string, projectStructure: string, projectSpecification: Promise<string>, fileTree: vscode.ChatResponseFileTree, chatMessages: Raw.ChatMessage[]): FileTreeDataWithContent {
		const ctime = Date.now();
		if (fileTree.children) {
			return { ...fileTree, type: FileType.Directory, children: fileTree.children.map((child) => this._prefetch(userPrompt, projectStructure, projectSpecification, child, chatMessages)), ctime };
		}
		// Disable prefetching for now
		// node.content = this._getFileContent(userPrompt, projectStructure, projectSpecification, fileTreeData.uri.path, chatMessages).catch(() => node.content = undefined);
		return { ...fileTree, type: FileType.File, content: undefined, ctime };
	}

	private async _getFileContent(projectDescription: string, projectStructure: string, projectSpecPromise: Promise<string>, filePath: string, chatMessages: Raw.ChatMessage[], prevFileContents: Map<string, string>): Promise<Uint8Array> {
		const promptArgs: NewWorkspaceContentsPromptProps = {
			query: projectDescription,
			fileTreeStr: projectStructure,
			filePath: filePath,
			projectSpecification: await projectSpecPromise,
			history: chatMessages,
			relavantFiles: prevFileContents.has(filePath) ? new Map([[filePath, prevFileContents.get(filePath)!]]) : undefined
		};
		return this.generateFilePrompt.generate(promptArgs, CancellationToken.None).then((response) => Buffer.from(response));
	}

	private _getResponseScopedData(responseId: string) {
		let responseScopedData = this.responseScopedData.get(responseId);
		if (!responseScopedData) {
			responseScopedData = new Map<string, ProjectData>();
			this.responseScopedData.set(responseId, responseScopedData);
		}
		return responseScopedData;
	}

	private _getProjectMetadata(fullPath: string) {
		// Format: vscode-copilot-workspace://<sessionId>/<projectName>/<filePath>
		const [, projectName, ...path] = fullPath.split('/');
		return { projectName, path };
	}
}

interface GithubData {
	org: string;
	repo: string;
	path: string;
	fileTree: ChatResponseFileTreePart;
}
class NewWorkspaceGitHubContentManager {

	private responseScopedData = new Map<string, Map<string, GithubData>>();

	constructor(
		@IGithubRepositoryService private readonly repositoryService: IGithubRepositoryService
	) { }

	set(responseId: string, projectName: string, fileTree: ChatResponseFileTreePart, serviceArgs: any) {
		const githubContentMetadata = serviceArgs as NewWorkspaceGithubContentMetadata;
		const sessionScopedData = this._getResponseScopedData(responseId);
		const githubData: GithubData = { ...githubContentMetadata, fileTree };
		sessionScopedData.set(projectName, githubData);
	}

	get(responseId: string, filePath: string): FileTreeDataWithContent | undefined {
		const { projectName, path: relativePath } = this._getProjectMetadata(filePath);
		const responseScopedData = this._getResponseScopedData(responseId);
		const rootNode = responseScopedData.get(projectName);
		if (!rootNode) {
			return;
		}
		const fileNodes: FileTreeDataWithContent[] = rootNode.fileTree.value;
		const currentNode = findMatchingNodeFromPath(fileNodes, relativePath);
		if (currentNode && !currentNode?.content && !currentNode?.children) {
			const nodeWithMissingContent = currentNode;
			const folderPath = rootNode.path === '.' ? path.posix.relative(rootNode.repo, filePath) : path.posix.relative(rootNode.path, filePath.slice(1));
			nodeWithMissingContent.content = this.repositoryService.getRepositoryItemContent(rootNode.org, rootNode.repo, folderPath).catch(() => nodeWithMissingContent.content = undefined);
		}
		return currentNode;
	}

	private _getProjectMetadata(fullPath: string) {
		// Format: vscode-copilot-github-workspace://<sessionId>/<projectName>/<filePath>
		const [, projectName, ...path] = fullPath.split('/');
		return { projectName, path };
	}

	private _getResponseScopedData(responseId: string) {
		let responseScopedData = this.responseScopedData.get(responseId);
		if (!responseScopedData) {
			responseScopedData = new Map<string, GithubData>();
			this.responseScopedData.set(responseId, responseScopedData);
		}
		return responseScopedData;
	}
}

interface FileData {
	fileTree: ChatResponseFileTreePart;
	content: string;
}

class NewWorkspaceFileContentManager {

	private responseScopedData = new Map<string, Map<string, FileData>>();

	constructor() {
	}

	set(responseId: string, projectName: string, fileTree: ChatResponseFileTreePart, serviceArgs: any) {
		const fileContents = serviceArgs as string;
		const sessionScopedData = this._getResponseScopedData(responseId);
		const fileContentData: FileData = { content: fileContents, fileTree };
		sessionScopedData.set(projectName, fileContentData);
	}

	get(responseId: string, filePath: string): FileTreeDataWithContent | undefined {
		const { projectName, path: relativePath } = this._getFileMetadata(filePath);
		const responseScopedData = this._getResponseScopedData(responseId);
		const rootNode = responseScopedData.get(projectName);
		if (!rootNode) {
			return;
		}
		const fileNodes: FileTreeDataWithContent[] = rootNode.fileTree.value;
		const currentNode = findMatchingNodeFromPath(fileNodes, relativePath);
		if (currentNode && !currentNode?.content && !currentNode?.children) {
			currentNode.content = Promise.resolve(new Uint8Array(new TextEncoder().encode(rootNode.content)));
		}
		return currentNode;
	}

	private _getFileMetadata(fullPath: string) {
		// Format: vscode-copilot-file://<sessionId>/<projectName>/<filePath>
		const [, projectName, ...path] = fullPath.split('/');
		return { projectName, path };
	}

	private _getResponseScopedData(responseId: string) {
		let responseScopedData = this.responseScopedData.get(responseId);
		if (!responseScopedData) {
			responseScopedData = new Map<string, FileData>();
			this.responseScopedData.set(responseId, responseScopedData);
		}
		return responseScopedData;
	}
}

function findMatchingNodeFromPath(fileTree: vscode.ChatResponseFileTree[], pathElements: string[]): FileTreeDataWithContent | undefined {
	let currentNode: FileTreeDataWithContent | undefined = undefined;
	for (const element of pathElements) {
		if (currentNode) {
			if (currentNode.children) {
				currentNode = currentNode.children.find(node => node.name === element) ?? currentNode;
			}
		} else {
			currentNode = fileTree.find(node => node.name === element);
		}
	}
	return currentNode;
}

export const newId = 'new';

export class NewWorkspaceIntent implements IIntent {

	static readonly ID = Intent.New;
	readonly id: string = Intent.New;
	readonly locations = [ChatLocation.Panel];
	readonly description: string = l10n.t('Scaffold code for a new file or project in a workspace');

	readonly commandInfo: IIntentSlashCommandInfo = {
		allowsEmptyArgs: false,
		defaultEnablement: true,
	};

	constructor(
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {

		const location = invocationContext.location;
		const endpoint = await this.endpointProvider.getChatEndpoint(invocationContext.request);
		return this.instantiationService.createInstance(NewWorkspaceIntentInvocation, this, endpoint, location);
	}
}
function createProjectCommand(fileTree: ChatResponseFileTreePart, workspaceRoot: Uri | undefined): vscode.Command {
	return {
		command: CreateProjectCommand,
		arguments: [fileTree, workspaceRoot],
		title: l10n.t('Create Workspace...'),
	};
}

function createFileCommand(fileTree: ChatResponseFileTreePart): vscode.Command {
	return {
		command: CreateFileCommand,
		arguments: [fileTree],
		title: l10n.t('Create File...'),
	};
}

export class NewWorkspaceIntentInvocation implements IIntentInvocation {

	private githubContentMetadata?: NewWorkspaceGithubContentMetadata;

	readonly linkification: IntentLinkificationOptions = { disable: true };

	constructor(
		readonly intent: NewWorkspaceIntent,
		readonly endpoint: IChatEndpoint,
		readonly location: ChatLocation,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INewWorkspacePreviewContentManager private readonly newWorkspacePreviewContentManager: INewWorkspacePreviewContentManager,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) { }

	async getShouldUseProjectTemplate() {
		const useProjectTemplates = this.configurationService.getConfig(ConfigKey.UseProjectTemplates);
		if (useProjectTemplates !== undefined) {
			return useProjectTemplates;
		}
		return false;
	}

	async buildPrompt(promptContext: IBuildPromptContext, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken) {
		// TODO: @bhavyaus enable using project templates with variables
		const { query, history, chatVariables } = promptContext;
		const useTemplates = !chatVariables.hasVariables() && history[history.length - 1]?.request?.message !== query && await this.getShouldUseProjectTemplate();
		const renderer = PromptRenderer.create(this.instantiationService, this.endpoint, NewWorkspacePrompt, {
			promptContext,
			useTemplates: useTemplates,
			endpoint: this.endpoint,
		});

		const result = await renderer.render(progress, token);
		const metadata = result.metadata.get(NewWorkspaceGithubContentMetadata);
		if (metadata) {
			this.githubContentMetadata = metadata;
		}

		return result;
	}

	processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		const responseProcessor = new NewWorkspaceResponseProcessor(this.newWorkspacePreviewContentManager, this.workspaceService, this.githubContentMetadata);
		return responseProcessor.processResponse(context, inputStream, outputStream, token);
	}
}


function convertGitHubItemsToChatResponseFileTree(items: GithubRepositoryItem[], baseUri: Uri, isRepoRoot: boolean): ChatResponseFileTreePart {
	let paths: string[];
	if (isRepoRoot) {
		paths = items.map(item => [baseUri.path, item.path].join('/'));
	} else {
		paths = items.map(item => item.path);
	}
	const rootName = paths[0].split('/')[0];
	const root: vscode.ChatResponseFileTree = { name: rootName, children: [] };
	const result: { [key: string]: vscode.ChatResponseFileTree } = { rootName: root };
	for (const path of paths) {
		const pathParts = path.split('/');
		let currentPath = rootName;
		let currentNode = root;
		for (let i = 1; i < pathParts.length; i++) {
			const pathPart = pathParts[i];
			currentPath += `/${pathPart}`;
			if (!result[currentPath]) {
				const newNode: vscode.ChatResponseFileTree = { name: pathPart };
				if (currentNode.children === undefined) {
					currentNode.children = [];
				}
				currentNode.children.push(newNode);
				result[currentPath] = newNode;
			}
			currentNode = result[currentPath];
		}
	}
	let baseTree: vscode.ChatResponseFileTree[];
	if (isRepoRoot) {
		baseTree = root.children?.[0].children ?? [];
	} else {
		baseTree = root.children ?? [];
	}
	const sortedTree = baseTree?.sort((a, b) => (a.children && !b.children) ? -1 : 1) ?? [];
	return new ChatResponseFileTreePart([{ name: rootName, children: sortedTree }], baseUri);
}

export const CopilotWorkspaceScheme = 'vscode-copilot-workspace';
export const GithubWorkspaceScheme = 'vscode-copilot-github-workspace';
export const CopilotFileScheme = 'vscode-copilot-file';

function getNewPreviewUri(requestId: string | undefined, filePath?: string, isGithubRepo: boolean = false,) {
	return Uri.from({
		scheme: isGithubRepo ? GithubWorkspaceScheme : CopilotWorkspaceScheme,
		authority: requestId ?? '',
		path: filePath ? `/${filePath}` : undefined
	});
}

class NewWorkspaceResponseProcessor {

	private _appliedText = '';
	private _p = Promise.resolve('');

	constructor(
		private readonly newWorkspacePreviewContentManager: INewWorkspacePreviewContentManager,
		private readonly workspaceService: IWorkspaceService,
		private readonly githubContentMetadata?: NewWorkspaceGithubContentMetadata
	) { }

	async processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<void> {
		const { turn, messages } = context;

		let isBufferingFileTree = false;
		let projectStructure = '';
		const fileTreeStartRegex = /```filetree\n/;
		const chatMessages = messages.filter(message => message.role !== Raw.ChatRole.System); // Exclude system messages as we want to use a different identity for the additional prompts we run
		let hasReportingStarted = false;

		for await (const { delta } of inputStream) {
			if (token.isCancellationRequested) {
				break;
			}

			const incomingText = delta.text;
			this._p = this._p.then(async (): Promise<string> => {
				const requestId = turn.id;


				if (!incomingText) {
					return this._appliedText;
				}

				this._appliedText += incomingText;
				if (!this._appliedText.startsWith('#')) {
					const userPrompt = turn.request.message;
					const hasWholeCodeBlock = this._appliedText.match(/```filetree\n([\s\S]+?)\n```/);
					if (hasWholeCodeBlock && (isBufferingFileTree || !hasReportingStarted)) {
						isBufferingFileTree = false;
						const [before, after] = this._appliedText.split(hasWholeCodeBlock[0]);
						if (!hasReportingStarted) {
							// We have the whole codeblock but we haven't started reporting yet.
							// This only happens in test when the entire response is in the incomingText.
							outputStream.markdown(before);
						}

						projectStructure = hasWholeCodeBlock[1];
						const { chatResponseTree, projectName } = convertFileTreeToChatResponseFileTree(projectStructure, fp => getNewPreviewUri(requestId, fp));
						outputStream.progress(l10n.t('Generating workspace preview...'));
						outputStream.push(chatResponseTree);
						outputStream.markdown(after);

						this.newWorkspacePreviewContentManager.set(requestId, projectName, chatResponseTree, { userPrompt, projectStructure, chatMessages });
					} else if ((this._appliedText.match(fileTreeStartRegex)) && !isBufferingFileTree && !hasWholeCodeBlock) {
						isBufferingFileTree = true;

						const [_, after] = this._appliedText.split(fileTreeStartRegex);
						projectStructure += after;

						outputStream.progress(l10n.t('Generating workspace preview...'));
					} else if (isBufferingFileTree) {
						projectStructure += incomingText;
					} else if (!isBufferingFileTree && (!this._appliedText.match(/```/))) {
						hasReportingStarted = true;
						outputStream.markdown(incomingText);
					}
				} else if (/(?:.*\n){1,}/.test(this._appliedText)) {
					outputStream.markdown(incomingText);
				}
				return this._appliedText;
			});
		}

		await this._p;

		if (turn.id &&
			this.githubContentMetadata &&
			this.githubContentMetadata.org &&
			this.githubContentMetadata.repo &&
			this.githubContentMetadata.path &&
			this.githubContentMetadata.githubRepoItems &&
			!this.newWorkspacePreviewContentManager.getFileTree(turn.id)) {

			outputStream.reference(Uri.parse(this.githubContentMetadata.githubRepoItems[0].html_url));

			outputStream.progress(l10n.t('Generating workspace preview...'));
			const isRepoRoot = this.githubContentMetadata.path === '.';
			const projectName = isRepoRoot ? this.githubContentMetadata.repo : this.githubContentMetadata.path.split('/')[0];
			const chatResponseTree = convertGitHubItemsToChatResponseFileTree(this.githubContentMetadata.githubRepoItems, getNewPreviewUri(turn.id, projectName, true), isRepoRoot);
			outputStream.push(chatResponseTree);

			const workspaceFolders = this.workspaceService.getWorkspaceFolders();
			outputStream.button(createProjectCommand(chatResponseTree, workspaceFolders.length > 0 ? workspaceFolders[0] : undefined));

			this.newWorkspacePreviewContentManager.set(turn.id, projectName, chatResponseTree, this.githubContentMetadata);
			const query = encodeURIComponent(`["/${newId} ${turn.request.message}"]`);
			const markdownString = new MarkdownString(l10n.t(`Hint: You can [regenerate this project without using this sample](command:workbench.action.chat.open?{0}) or use this [setting](command:workbench.action.openSettings?%5B%22github.copilot.chat.useProjectTemplates%22%5D) to configure the behavior.`, query));
			markdownString.isTrusted = { enabledCommands: ['workbench.action.openSettings', 'workbench.action.chat.open'] };
			outputStream.markdown(markdownString);
		}
		else {
			const fileContentGeneration = extractCodeBlocks(this._appliedText);
			if (fileContentGeneration.length === 2) {
				let fileName;
				try {
					fileName = parse(fileContentGeneration[1].code);
				} catch (e) {
					throw e;
				}

				const baseUri = Uri.from({
					scheme: CopilotFileScheme,
					authority: turn.id,
					path: `/${fileName.fileName}`
				});

				const fileTree = new ChatResponseFileTreePart([{ name: `${fileName.fileName}` }], baseUri);
				const commandstr = commandUri(OpenFileCommand, [fileTree]);
				const markdownString = new MarkdownString(`[${fileName.fileName}](${commandstr})`);
				markdownString.isTrusted = { enabledCommands: [OpenFileCommand] };
				outputStream.markdown(l10n.t('Sure, here is the file you requested:'));
				outputStream.markdown(markdownString);
				this.newWorkspacePreviewContentManager.set(turn.id, fileName.fileName, fileTree, fileContentGeneration[0].code);
			}
		}

		this.pushCommands(turn.id, outputStream);
	}

	pushCommands(turnRequestId: string, outputStream: vscode.ChatResponseStream): void {
		// Extract the Repo structure here
		const fileTree = this.newWorkspacePreviewContentManager.getFileTree(turnRequestId);
		if (!fileTree) {
			return;
		}

		if (isGithubWorkspaceUri(fileTree.baseUri)) {
			return;
		}
		else if (isCopiltoFileWorkspaceUri(fileTree.baseUri)) {
			outputStream.button(createFileCommand(fileTree));
			return;
		}

		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		outputStream.button(createProjectCommand(fileTree, workspaceFolders.length > 0 ? workspaceFolders[0] : undefined));
	}
}

function isGithubWorkspaceUri(uri: Uri): boolean {
	return uri.scheme === GithubWorkspaceScheme;
}

function isCopiltoFileWorkspaceUri(uri: Uri): boolean {
	return uri.scheme === CopilotFileScheme;
}
