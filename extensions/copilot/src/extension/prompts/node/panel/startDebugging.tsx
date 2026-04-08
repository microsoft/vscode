/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, SystemMessage, TextChunk, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IEnvService } from '../../../../platform/env/common/envService';
import { IExtensionsService } from '../../../../platform/extensions/common/extensionsService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ICodeOrDocsSearchItem } from '../../../../platform/remoteSearch/common/codeOrDocsSearchClient';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { ResourceSet } from '../../../../util/vs/base/common/map';
import { basename, dirname } from '../../../../util/vs/base/common/path';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseProgressPart } from '../../../../vscodeTypes';
import { getSchemasForTypeAsList } from '../../../onboardDebug/node/parseLaunchConfigFromResponse';
import { Turn } from '../../../prompt/common/conversation';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { InstructionMessage } from '../base/instructionMessage';
import { PromptRenderer } from '../base/promptRenderer';
import { SafetyRules } from '../base/safetyRules';
import { Tag } from '../base/tag';
import { HistoryWithInstructions } from './conversationHistory';
import { FileVariable } from './fileVariable';
import { ProjectLabels } from './projectLabels';
import { workspaceVisualFileTree } from './workspace/visualFileTree';
import { MultirootWorkspaceStructure, WorkspaceStructureMetadata } from './workspace/workspaceStructure';

export const enum StartDebuggingType {
	UserQuery,
	CommandLine,
}

interface IStartDebuggingFromUserQuery {
	type: StartDebuggingType.UserQuery;
	userQuery?: string;
}

interface IStartDebuggingFromCommandLine {
	type: StartDebuggingType.CommandLine;
	args: readonly string[];
	/** cwd with the ${workspaceFolder} replaced */
	relativeCwd?: string;
	/** absolute cwd */
	absoluteCwd: string;
}

const enum OutputStyle {
	Readable,
	ConfigOnly,
}

export type StartDebuggingInput = IStartDebuggingFromUserQuery | IStartDebuggingFromCommandLine;

export interface StartDebuggingPromptProps extends BasePromptElementProps {
	input: StartDebuggingInput;
	history: readonly Turn[];
}

export interface StartDebuggingPromptState {
	docSearchResults?: ICodeOrDocsSearchItem[];
	resources?: URI[];
	schema?: string[];
}

function getLaunchConfigExamples(inputType: StartDebuggingType, outputStyle: OutputStyle) {
	const o1Object = {
		configurations: [{
			type: 'node',
			request: 'launch',
			name: 'Launch Program',
			program: '${workspaceFolder}/app/index.js',
			args: ['--serve'],
		}],
	};

	const o2Object = {
		configurations: [{
			type: 'cppvsdbg',
			request: 'launch',
			name: 'Launch Program',
			program: '${workspaceFolder}/${input:executableName}.exe',
			stopAtEntry: true,
		}],
		inputs: [
			{
				type: 'promptString',
				id: 'executableName',
				description: 'Name of your executable',
			}
		]
	};

	const styleOutput = (output: any) => outputStyle === OutputStyle.ConfigOnly
		? JSON.stringify(output) : `\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\``;

	if (inputType === StartDebuggingType.UserQuery) {
		return `# Example
User:
My operating system is macOS.
Create a debug configuration to do the following: launch my node app

Assistant:
${styleOutput(o1Object)}

# Example
User:
My operating system is Windows.
Create a debug configuration to do the following: debug my c++ program

Assistant:
${styleOutput(o2Object)}
`;
	} else {
		return `# Example
User:
My operating system is macOS.
In the working directory \${workspaceFolder}/app, I ran this on the command line: node ./index --serve

Assistant:
${styleOutput(o1Object)}

# Example
User:
My operating system is Windows.
In the working directory \${workspaceFolder}, I ran this on the command line: make test

Assistant:
${styleOutput(o2Object)}
`;
	}
}

export class StartDebuggingPrompt extends PromptElement<StartDebuggingPromptProps, StartDebuggingPromptState> {
	constructor(props: StartDebuggingPromptProps,
		@IWorkspaceService private readonly workspace: IWorkspaceService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionsService private readonly extensionsService: IExtensionsService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IEnvService private readonly envService: IEnvService,
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing, progress: vscode.Progress<vscode.ChatResponseProgressPart> | undefined, token: vscode.CancellationToken): Promise<StartDebuggingPromptState> {
		if (token.isCancellationRequested) {
			return {};
		}

		if (token.isCancellationRequested) {
			return {};
		}
		const debuggerType = await this.getDebuggerType(progress, token);
		const [resources, schema] = await Promise.all([
			this.getResources(debuggerType, progress, token),
			this.getSchema(debuggerType, progress, token)
		]);
		return { resources, schema };
	}

	private async getFiles(requestedFiles: string[], structureMetadata?: WorkspaceStructureMetadata): Promise<URI[] | undefined> {
		const fileResults = new ResourceSet();
		const returnedUris = MultirootWorkspaceStructure.toURIs(this.workspace, requestedFiles);

		const fileExists = (file: URI) => this.fileSystemService.stat(file).then(() => true, () => false);

		const tryAdd = async (file: URI) => {
			if (fileResults.has(file)) {
				return true;
			}

			const [exists, ignored] = await Promise.all([
				fileExists(file),
				this.ignoreService.isCopilotIgnored(file),
			]);
			if (exists && !ignored) {
				fileResults.add(file);
				return true;
			}

			return false;
		};

		const todo: Promise<unknown>[] = returnedUris.map(async ({ file, relativePath }) => {
			if (!structureMetadata || await fileExists(file)) {
				return tryAdd(file);
			}

			// The model sometimes doesn't fully qualify the path to nested files.
			// In these cases, try to guess what it means by looking at the what it does give us
			const bestGuess = structureMetadata.value
				.flatMap(root => root.tree.files.filter(f => f.path.endsWith(relativePath)))
				.sort((a, b) => a.path.length - b.path.length) // get the least-nested candidate
				.at(0);
			if (bestGuess) {
				return tryAdd(bestGuess);
			}
		});

		const defaultWorkspaceFolder = this.workspace.getWorkspaceFolders().at(0);
		const fileNeedle = returnedUris.at(0) ?? (defaultWorkspaceFolder && { file: defaultWorkspaceFolder, workspaceFolder: defaultWorkspaceFolder });
		if (fileNeedle) {
			for (const file of ['launch.json', 'tasks.json']) {
				todo.push(tryAdd(URI.joinPath(fileNeedle.workspaceFolder, '.vscode', file)));
			}

			for (const usefulFile of ['README.md', 'CONTRIBUTING.md']) {
				const folderFsPath = fileNeedle.workspaceFolder.fsPath;
				// limit this to avoid looking for files in parent directories of the workspace
				todo.push(nearestDirectoryWhere(fileNeedle.file.fsPath, dir =>
					dir.length >= folderFsPath.length ? tryAdd(URI.joinPath(URI.file(dir), usefulFile)) : Promise.resolve(undefined)));
			}
		}

		await Promise.all(todo);

		return [...fileResults];
	}

	private async getResources(debuggerType: string | undefined, progress: vscode.Progress<vscode.ChatResponseProgressPart> | undefined, token: vscode.CancellationToken): Promise<URI[] | undefined> {
		const r = await this.queryModelForRequestedFiles(debuggerType, progress, token);
		if (!r?.requestedFiles.length || token.isCancellationRequested) {
			return;
		}
		return this.getFiles(r.requestedFiles, r.structureMetadata);
	}

	private async queryModelForRequestedFiles(debuggerType: string | undefined, progress: vscode.Progress<vscode.ChatResponseProgressPart> | undefined, token: vscode.CancellationToken) {
		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');
		const promptRenderer = this.props.input.type === StartDebuggingType.CommandLine
			? PromptRenderer.create(
				this.instantiationService,
				endpoint,
				ReferenceFilesFromCliPrompt,
				{ debuggerType, input: this.props.input, os: this.envService.OS }
			) : PromptRenderer.create(
				this.instantiationService,
				endpoint,
				ReferenceFilesFromQueryPrompt,
				{ debuggerType, input: this.props.input, os: this.envService.OS }
			);

		const prompt = await promptRenderer.render(undefined, token);
		const structureMetadata = prompt.metadata.get(WorkspaceStructureMetadata);
		const fetchResult = await endpoint.makeChatRequest(
			'referenceFiles',
			prompt.messages,
			undefined,
			token,
			ChatLocation.Panel,
		);

		if (fetchResult.type !== ChatFetchResponseType.Success) {
			return undefined;
		}

		let requestedFiles: string[] | undefined;
		try {
			requestedFiles = JSON.parse(fetchResult.value);
		} catch {
			return;
		}
		if (!Array.isArray(requestedFiles)) {
			return;
		}
		if (this.props.input.type === StartDebuggingType.UserQuery) {
			// We will check for existing config
			requestedFiles.push('launch.json');
			if (!this.props.input.userQuery) {
				requestedFiles.push('README.md');
			}
		}
		progress?.report(new ChatResponseProgressPart('Requesting resources'));
		return { requestedFiles, structureMetadata };
	}

	private async getSchema(debuggerType: string | undefined, progress: vscode.Progress<vscode.ChatResponseProgressPart> | undefined, token: vscode.CancellationToken): Promise<string[] | undefined> {
		if (!debuggerType) {
			return;
		}
		const schema = getSchemasForTypeAsList(debuggerType, this.extensionsService);
		if (!schema) {
			return;
		}
		progress?.report(new ChatResponseProgressPart('Identified launch config properties'));
		return schema;
	}

	private async getDebuggerType(progress: vscode.Progress<vscode.ChatResponseProgressPart> | undefined, token: vscode.CancellationToken): Promise<string | undefined> {
		const endpoint = await this.endpointProvider.getChatEndpoint('copilot-fast');

		const promptRenderer = PromptRenderer.create(
			this.instantiationService,
			endpoint,
			DebugTypePrompt,
			{ debuggerTypes: this.getAllDebuggerTypes(), input: this.props.input, os: this.envService.OS }
		);

		const prompt = await promptRenderer.render(undefined, token);
		const fetchResult = await endpoint.makeChatRequest(
			'debugType',
			prompt.messages,
			undefined,
			token,
			ChatLocation.Panel,
		);

		if (fetchResult.type !== ChatFetchResponseType.Success) {
			return undefined;
		}

		// The model likes to return text like "You should use `node", so detect backticks
		return /`(.*?)`/.exec(fetchResult.value)?.[1] || fetchResult.value;
	}

	private getAllDebuggerTypes(): string[] {
		return this.extensionsService.allAcrossExtensionHosts.filter(e => !!e.packageJSON?.contributes?.debuggers).map(e => {
			const result: string[] = [];
			for (const d of e.packageJSON?.contributes?.debuggers) {
				if (d.type === '*' || d.deprecated) {
					continue;
				}
				result.push(`- ${d.type}: ${d.label} (${e.id})`);
			}
			return result;
		}).flat();
	}

	override render(state: StartDebuggingPromptState, sizing: PromptSizing): PromptPiece | undefined {
		const style = this.props.input.type === StartDebuggingType.CommandLine ? OutputStyle.ConfigOnly : OutputStyle.Readable;
		return (
			<>
				<SystemMessage priority={1000}>
					{style === OutputStyle.ConfigOnly ? (
						<>
							You are a Visual Studio Code assistant who specializes in debugging and creating launch configurations. Your task is to create a launch configuration for the user's query.<br />
						</>
					) : (
						<>
							You are a Visual Studio Code assistant who specializes in debugging, searching for existing launch configurations, and creating launch configurations. Your task is to find an existing launch configuration that matches the query or to create a launch configuration for the user's query if no match is found. If there's no query, still provide a response, checking for existing configurations in the launch.json file, if any.<br />
						</>
					)}
					<CopilotIdentityRules />
					<SafetyRules />
				</SystemMessage>
				<HistoryWithInstructions historyPriority={600} passPriority history={this.props.history}>
					<InstructionMessage priority={1000}>
						{style === OutputStyle.Readable && <>
							The user cannot see the context you are given, so you must not mention it. If you want to refer to it, you must include it in your reply.<br />
						</>}
						Print out the VS Code `launch.json` file needed to debug the command, formatted as JSON.<br />
						If there are build steps needed before the program can be debugged, be sure to include a `preLaunchTask` property in the launch configuration.
						If you include a `preLaunchTask` property, {state.resources?.some(r => r.path.endsWith('launch.json'))
							? <>{' '}it must either refer to an existing a suitable task in the `tasks.json` file, or you must include a `tasks.json` file in your response that contains that configuration.</>
							: <>{' '}you MUST also include `tasks.json` file in your response that contains that configuration.</>
						}{style === OutputStyle.Readable && <>
							{' '}Include a brief one or two sentence explaination of any such task definition is needed.<br />
						</>}<br />
						Pay attention to my operating system and suggest the best tool for the platform I'm working on. For example, for debugging native code on Windows, you would not suggest the `lldb` type.<br />
						If there are unknowns, such as the path to the program, use the `inputs` field in the launch.json schema to prompt the user with an informative message. Input types may either be `promptString` for free text input or `pickString` with an `options` array for enumerations.<br />
						Do not give any other explanation.<br />
						If there are unknowns, such as the path to the program, use the `inputs` field in the launch.json schema to prompt the user with an informative message. Input types may either be `promptString` for free text input or `pickString` with an `options` array for enumerations. Do not include a default value for the input field.<br />
						Always include the following properties in the launch.json file:<br />
						- type: the type of debugger to use for this launch configuration. Every installed debug extension introduces a type: node for the built-in Node debugger, for example, or php and go for the PHP and Go extensions.<br />
						- request:  the request type of this launch configuration. Currently, launch and attach are supported.<br />
						- name:  the reader-friendly name to appear in the Debug launch configuration dropdown.<br />
						If a result is not a valid answer, but it still relates to Visual Studio Code, please still respond.<br />
						Please do not guess a response and instead just respond with a polite apology if you are unsure.<br />
						If you believe the given context given to you is incorrect or not relevant you may ignore it.<br />
						{getLaunchConfigExamples(this.props.input.type, style)}<br />
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage priority={700}>
					{state.docSearchResults && state.docSearchResults.length > 0 && <>Below is a list of information from the Visual Studio Code documentation which might be relevant to the question. <br /></>}
					{state.docSearchResults && state.docSearchResults.map((result) => {
						if (result?.title && result.contents) {
							<TextChunk>
								##{result?.title?.trim()} - {result.path}<br />
								{result.contents}
							</TextChunk>;
						}
					})}
				</UserMessage>
				<UserMessage priority={850}>
					{state.schema && <>Below is a list of properties that the launch config might include. <br />
						{state.schema.map((property) => {
							return <TextChunk>{property}<br /></TextChunk>;
						})})<br /></>}
				</UserMessage>
				<UserMessage priority={700} flexGrow={1}>
					{this.props.input.type === StartDebuggingType.UserQuery
						? <>
							If a program property is included in the launch config, and its path does not exist in the workspace or there are multiple files that could work, use the `inputs` field in the launch.json schema to prompt the user with an informative message.<br />
							<MultirootWorkspaceStructure maxSize={1000} />
						</>
						: <StructureOfWorkingDirectory input={this.props.input} />
					}
				</UserMessage>
				<UserMessage priority={800}>
					{state.resources && state.resources.length > 0 && <>Below is a list of file contents from the workspace that might be useful in building the launch config. <br /></>}
					{state.resources && state.resources.map((resource) => {
						const containingFolder = this.workspace.getWorkspaceFolder(resource);
						const name = containingFolder ? resource.path.substring(containingFolder.path.length + 1) : basename(resource.path);
						return <FileVariable variableName={name} variableValue={resource}></FileVariable>;
					})}
				</UserMessage>
				<UserMessage priority={850}>
					{this.props.input.type === StartDebuggingType.UserQuery && state.resources?.some(r => r.path.endsWith('launch.json')) && (
						<>
							{this.props.input.userQuery
								? <>Search in that provided launch.json file for an existing configuration based on the query "{this.props.input.userQuery}". Pay particular attention to the name of the launch configuration and compare it to the query. If a match is found, include that configuration. Do not include the whole launch.json context. End the response with HAS_MATCH.<br /></>
								: <>Scan any provided documentation to determine which configuration in the provided launch.json file is recommended, if any. Show some, not all, of the launch configurations that are available. End the response with HAS_CONFIG_NO_QUERY.<br /></>
							}
							If no match is found, include the new configuration that was generated. End the response with GENERATED_CONFIG.<br />
						</>
					)}
				</UserMessage>
				{style === OutputStyle.ConfigOnly
					? <UserMessage priority={850}>
						<Tag name='example'>
							In this example, we're debugging a simple Python file, so we only need a launch.json:<br />
							<Tag name='request'>
								In the working directory, I ran this on the command line: `python main.py`<br />
							</Tag>
							<Tag name='response'>
								launch.json:<br />
								```json<br />
								{JSON.stringify({
									type: 'python',
									request: 'launch',
									name: 'Launch Program',
									program: '${workspaceFolder}/main.py',
								}, null, '\t')}<br />
								```<br />
							</Tag>
						</Tag>
						<Tag name='example'>
							In this example, generate both a launch.json and tasks.json because the program needs to be built before it can be debugged:<br />
							<Tag name='request'>
								In the working directory, I ran this on the command line: `./my-program.exe`<br />
							</Tag>
							<Tag name='response'>
								launch.json:<br />
								```json<br />
								{JSON.stringify({
									configurations: [{
										'type': 'cppvsdbg',
										'request': 'launch',
										'name': 'Launch Program',
										'program': '${workspaceFolder}/my-program.exe',
										'preLaunchTask': 'build'
									}]
								}, null, '\t')}<br />
								```<br />
								tasks.json:<br />
								```json<br />
								{JSON.stringify({
									tasks: [{
										'type': 'shell',
										'label': 'build',
										'command': 'make',
										'args': ['build']
									}]
								}, null, '\t')}<br />
								```<br />
							</Tag>
						</Tag>
					</UserMessage>
					: <UserMessage priority={850}>
						<Tag name='example'>
							In this example, we're debugging a simple Python file, so we only need a launch.json:<br />
							<Tag name='request'>
								Here's a description of the app I want to debug: "python file"<br />
								In my workspace I have the files main.py, tox.ini, and README.md.<br />
							</Tag>
							<Tag name='response'>
								Here is your `launch.json` configuration:<br />
								```json<br />
								{JSON.stringify({
									type: 'python',
									request: 'launch',
									name: 'Launch Program',
									program: '${workspaceFolder}/main.py',
								}, null, '\t')}<br />
								```<br />
							</Tag>
						</Tag>
						<Tag name='example'>
							In this example, generate both a launch.json and tasks.json because the program needs to be built before it can be debugged:<br />
							<Tag name='request'>
								Here's a description of the app I want to debug: "my-program"<br />
								In my workspace I have the files Makefile, my-program.cpp.<br />
							</Tag>
							<Tag name='response'>
								Here is your `launch.json` configuration:<br />
								```json<br />
								{JSON.stringify({
									configurations: [{
										'type': 'cppvsdbg',
										'request': 'launch',
										'name': 'Launch Program',
										'program': '${workspaceFolder}/my-program.exe',
										'preLaunchTask': 'build'
									}]
								}, null, '\t')}<br />
								```<br />
								It looks like you build your project using your Makefile, so let's add a `tasks.json` to do that before each debug session:<br />
								```json<br />
								{JSON.stringify({
									tasks: [{
										'type': 'shell',
										'label': 'build',
										'command': 'make',
										'args': ['build']
									}]
								}, null, '\t')}<br />
								```<br />
							</Tag>
						</Tag>
					</UserMessage>}
				<InputDescription priority={900} input={this.props.input} os={this.envService.OS} />
			</>
		);
	}
}
type WorkingDirectoryStructureProps = {
	input: IStartDebuggingFromCommandLine;
} & BasePromptElementProps;

class StructureOfWorkingDirectory extends PromptElement<WorkingDirectoryStructureProps, void> {
	constructor(
		props: WorkingDirectoryStructureProps,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		super(props);
	}
	override async render(_state: void, sizing: PromptSizing, _progress: unknown, token?: CancellationToken) {
		const maxSize = sizing.tokenBudget / 2; // note: size in the tree is in chars, /2 to be safe
		const wf = this.props.input.relativeCwd
			? this.workspaceService.getWorkspaceFolder(URI.file(this.props.input.absoluteCwd))
			: undefined;

		if (wf) {
			const tree = await this.instantiationService.invokeFunction(accessor => workspaceVisualFileTree(accessor, wf, { maxLength: maxSize }, token ?? CancellationToken.None));
			return <>
				My workspace folder (`${'{'}workspaceFolder{'}'}`) has the following structure:<br />
				<br />
				<meta value={new WorkspaceStructureMetadata([{ label: '', tree }])} local />
				{tree.tree}
			</>;
		}

		return <MultirootWorkspaceStructure maxSize={maxSize} />;
	}
}

class ReferenceFilesFromQueryPrompt extends PromptElement<{
	debuggerType: string | undefined;
	input: IStartDebuggingFromUserQuery;
	os: string;
} & BasePromptElementProps, void> {
	override render(_state: void, _sizing: PromptSizing): PromptPiece {
		return (
			<>
				<SystemMessage priority={10}>
					You are a Visual Studio Code assistant who specializes in debugging and creating launch configurations. Your job is to return an array of file names that may contain useful information to translate a user query into a VS Code debug configuration.<br />
					The user will give you a file tree. Make sure to fully qualify paths you return from the tree, including their parent directories:<br />
					Do not give any other explanation and return only a JSON array of strings. Avoid wrapping the whole response in triple backticks. Do not include any other information in your response.<br />
					<TextChunk priority={8}>
						# Example 1<br />
						## User: <br />
						I am working in a workspace that has the following structure: {`
\`\`\`
src/
	index.js
	app.js
package.json
\`\`\`
`}
						I want to: Create node app launch configuration<br />
						## Response:<br />
						{JSON.stringify(['package.json', 'src/index.js', 'src/app.js'])}<br /><br />

						# Example 2<br />
						## User: <br />
						I am working in a workspace that has the following structure: {`
\`\`\`
src/
	main.rs
	lib.rs
Cargo.toml
\`\`\`
`}
						I want to: Launch a rust app with lldb<br />
						## Response:<br />
						{JSON.stringify(['Cargo.toml', 'src/main.rs'])}<br /><br />

						# Example 3<br />
						## User: <br />
						I want to: Launch a go app<br />
						## Response:<br />
						{JSON.stringify(['main.go', 'go.mod'])}<br /><br />

					</TextChunk>
				</SystemMessage>
				<UserMessage priority={7}>
					<MultirootWorkspaceStructure maxSize={1000} />
				</UserMessage>
				<InputDescription priority={4} {...this.props} />
			</>
		);
	}
}

class ReferenceFilesFromCliPrompt extends PromptElement<{
	debuggerType: string | undefined;
	input: IStartDebuggingFromCommandLine;
	os: string;
} & BasePromptElementProps, void> {
	override render(_state: void, _sizing: PromptSizing): PromptPiece {
		return (
			<>
				<SystemMessage priority={10}>
					You are a Visual Studio Code assistant who specializes in debugging and creating launch configurations. Your job is to return an array of file names that may contain useful information to translate a command line invocation into a VS Code debug configuration and build task.<br />
					For example, when running a command `make tests`, you should ask for the `Makefile` because it contains information about how the tests are run.<br />
					The user will give you a file tree. Make sure to fully qualify paths you return from the tree, including their parent directories:<br />
					Do not give any other explanation and return only a JSON array of strings. Avoid wrapping the whole response in triple backticks. Do not include any other information in your response.<br />
					<TextChunk priority={8}>
						# Example<br />
						## User: <br />
						I am working in a workspace that has the following structure: {`
\`\`\`
myapp/
	package.json
\`\`\`
`}
						I ran this on the command line: `npm run start`<br />
						## Response:<br />
						{JSON.stringify(['myapp/package.json'])}<br /><br />

						# Example<br />
						## User: <br />
						I ran this on the command line: cargo run<br />
						## Response:<br />
						{JSON.stringify(['Cargo.toml'])}<br /><br />
					</TextChunk>
				</SystemMessage>
				<UserMessage priority={7} flexGrow={1}>
					<StructureOfWorkingDirectory input={this.props.input} />
				</UserMessage>
				<InputDescription priority={4} {...this.props} />
			</>
		);
	}
}

class InputDescription extends PromptElement<{
	input: StartDebuggingInput;
	debuggerType?: string;
	os: string;
} & BasePromptElementProps> {
	override render() {
		if (this.props.input.type === StartDebuggingType.UserQuery && this.props.input.userQuery) {
			return <UserMessage>
				Here's a description of the app I want to debug: {this.props.input.userQuery}{this.props.debuggerType ? ` and the debugging type: ${this.props.debuggerType}` : ''}</UserMessage>;
		} else if (this.props.input.type === StartDebuggingType.UserQuery) {
			if (this.props.debuggerType) {
				return <UserMessage>
					I want to use the ${this.props.debuggerType} debug type for my configuration.
				</UserMessage>;
			} else {
				return <UserMessage>
					Find an existing launch config for my app or create one based on my project stucture and workspace</UserMessage>;
			}
		} else {
			return <UserMessage>
				My operating system is {this.props.os}.<br />
				In the working directory `{(this.props.input.relativeCwd || this.props.input.absoluteCwd).replaceAll('\\', '/')}`, I ran this on the command line:<br />
				{'```\n' + this.props.input.args.map(a => a.replaceAll('\n', '\\n')).join(' \\\n  ') + '\n```'}
			</UserMessage>;
		}
	}
}

class DebugTypePrompt extends PromptElement<{
	input: StartDebuggingInput;
	debuggerTypes: string[];
	os: string;
} & BasePromptElementProps, void> {
	override render(_state: void, _sizing: PromptSizing): PromptPiece {
		const cli = this.props.input.type === StartDebuggingType.CommandLine;
		return (
			<>
				<SystemMessage priority={10}>
					You are a Visual Studio Code assistant. Your job is to assist users in using Visual Studio Code by providing knowledge to accomplish their task. Please do not guess a response and instead just respond with a polite apology if you are unsure.<br />
					You are a debugging expert. Your job is to return the debug type to use for launch config for the given use case.<br />
					Pay attention to my operating system and suggest the best tool for the platform I'm working on. For example, for debugging native code on Windows, you would not suggest the `lldb` type.<br />
					{this.props.input.type === StartDebuggingType.CommandLine && <>The command I give you is used to run code that I'm working on. Although the command itself might not directly be my program, you should suggest a tool to debug the likely language I'm working in.<br /></>}
					The user will list the debug types they have installed, but this is not a complete list of debug types available. You may suggest a type outside of that list if it's a better fit.<br />
					<br />
					<TextChunk priority={8}>
						# Example 1<br />
						## User: <br />
						{cli ? 'npx mocha' : 'Node.js'}<br />
						## Response:<br />
						`node`<br /><br />

						# Example 2<br />
						## User: <br />
						{cli ? 'python3 example.py' : 'Python'}<br />
						## Response:<br />
						`debugpy`<br /><br />

						# Example 3<br />
						## User: <br />
						{cli ? 'mvn test -Dtest=TestCircle' : 'Java'}<br />
						## Response:<br />
						`java`<br /><br />
					</TextChunk>
					Suggest the right debug type for my use case. Print ONLY the debug type. NEVER print any other explanation.<br />
				</SystemMessage>
				<ProjectLabels flexGrow={1} priority={7} embeddedInsideUserMessage={false} />
				<InputDescription {...this.props} priority={6} />
				<UserMessage priority={5} flexGrow={1}>
					<TextChunk>Here are the debug types I have installed:</TextChunk>
					<TextChunk flexGrow={1} breakOnWhitespace>
						{this.props.debuggerTypes.join('\n')}
					</TextChunk>
				</UserMessage>
			</>
		);
	}
}

async function nearestDirectoryWhere<T>(rootDir: string, predicate: (directory: string) => Promise<T | undefined>): Promise<T | undefined> {
	while (true) {
		const value = await predicate(rootDir);
		if (value !== undefined) {
			return value;
		}

		const parent = dirname(rootDir);
		if (parent === rootDir) {
			return undefined;
		}

		rootDir = parent;
	}
}
