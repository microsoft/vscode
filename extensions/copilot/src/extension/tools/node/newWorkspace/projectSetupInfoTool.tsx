/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptElementProps, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import type { CancellationToken, LanguageModelToolInvocationOptions, LanguageModelToolInvocationPrepareOptions, PreparedToolInvocation } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { CancellationError } from '../../../../util/vs/base/common/errors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelToolResult } from '../../../../vscodeTypes';
import { renderPromptElementJSON } from '../../../prompts/node/base/promptRenderer';
import { ToolName } from '../../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../../common/toolsRegistry';

interface Argument {
	argName: string;
	description: string;
	default?: string;
}

interface ExecutionCommand {
	command: string;
	arguments?: Argument[];
}


interface ProjectSetupInfo {
	projectType: string;
	description: string;
	executionCommands?: ExecutionCommand[];
	requiredExtensions?: string[];
	rules?: string[];
}

const setupInfo: ProjectSetupInfo[] = [
	{
		projectType: 'vscode-extension',
		description: 'A template for creating a VS Code extension using Yeoman and Generator-Code.',
		executionCommands: [{
			command: 'npx --package yo --package generator-code -- yo code . --skipOpen',
			arguments: [
				// { argName: '-i, --insiders', description: 'Show the insiders options for the generator' },
				{ argName: '-t, --extensionType', description: 'Specify extension type: ts, js, command-ts, command-js, colortheme, language, snippets, keymap, extensionpack, localization, commandweb, notebook', default: 'ts' },
				{ argName: '-n, --extensionDisplayName', description: 'Set the display name of the extension.' },
				{ argName: '--extensionId', description: 'Set the unique ID of the extension. Do not select this option if the user has not requested a unique ID.' },
				{ argName: '--extensionDescription', description: 'Provide a description for the extension' },
				{ argName: '--pkgManager', description: 'Specify package manager: npm, yarn, or pnpm', default: 'npm' },
				{ argName: '--bundler', description: 'Bundle the extension using webpack or esbuild' },
				{ argName: '--gitInit', description: 'Initialize a Git repository for the extension' },
				{ argName: '--snippetFolder', description: 'Specify the location of the snippet folder' },
				{ argName: '--snippetLanguage', description: 'Set the language for snippets' }
			]
		},
		],
		rules: [
			'Follow these rules strictly and do not deviate from them.',
			'1. Do not remove any arguments from the command. You can only add arguments if the user requests them.',
			`2. Call the tool ${ToolName.VSCodeAPI} with the users query to get the relevant references. `,
			`3. After the tool ${ToolName.VSCodeAPI} has completed, only then begin to modify the project.`,
		]
	},
	{
		projectType: 'next-js',
		description: 'A React based framework for building server-rendered web applications.',
		executionCommands: [{
			command: 'npx create-next-app@latest .',
			arguments: [
				{ argName: '--ts, --typescript', description: 'Initialize as a TypeScript project. This is the default.' },
				{ argName: '--js, --javascript', description: 'Initialize as a JavaScript project.' },
				{ argName: '--tailwind', description: 'Initialize with Tailwind CSS config. This is the default.' },
				{ argName: '--eslint', description: 'Initialize with ESLint config.' },
				{ argName: '--app', description: 'Initialize as an App Router project.' },
				{ argName: '--src-dir', description: `Initialize inside a 'src/' directory.` },
				{ argName: '--turbopack', description: 'Enable Turbopack by default for development.' },
				{ argName: '--import-alias <prefix/*>', description: 'Specify import alias to use.(default is "@/*")' },
				{ argName: '--api', description: 'Initialize a headless API using the App Router.' },
				{ argName: '--empty', description: 'Initialize an empty project.' },
				{ argName: '--use-npm', description: 'Explicitly tell the CLI to bootstrap the application using npm.' },
				{ argName: '--use-pnpm', description: 'Explicitly tell the CLI to bootstrap the application using pnpm.' },
				{ argName: '--use-yarn', description: 'Explicitly tell the CLI to bootstrap the application using Yarn.' },
				{ argName: '--use-bun', description: 'Explicitly tell the CLI to bootstrap the application using Bun.' }
			]
		}]
	},
	{
		projectType: 'vite',
		description: 'A front end build tool for web applications that focuses on speed and performance. Can be used with React, Vue, Preact, Lit, Svelte, Solid, and Qwik.',
		executionCommands: [{
			command: 'npx create-vite@latest .',
			arguments: [
				{ argName: '-t, --template NAME', description: 'Use a specific template. Available templates: vanilla-ts, vanilla, vue-ts, vue, react-ts, react, react-swc-ts, react-swc, preact-ts, preact, lit-ts, lit, svelte-ts, svelte, solid-ts, solid, qwik-ts, qwik' }
			]
		}]
	},
	{
		projectType: 'mcp-server',
		description: 'A Model Context Protocol (MCP) server project. This project supports multiple programming languages including TypeScript, JavaScript, Python, C#, Java, and Kotlin.',
		rules: [
			'Follow these rules strictly and do not deviate from them.',
			'1. First, visit https://github.com/modelcontextprotocol to find the correct SDK and setup instructions for the requested language. Default to TypeScript if no language is specified.',
			`2. Use the ${ToolName.FetchWebPage} to find the correct implementation instructions from https://modelcontextprotocol.io/llms-full.txt`,
			'3. Update the copilot-instructions.md file in the .github directory to include references to the SDK documentation',
			'4. Create an `mcp.json` file in the `.vscode` folder in the project root with the following content: `{ "servers": { "mcp-server-name": { "type": "stdio", "command": "command-to-run", "args": [list-of-args] } } }`.',
			'- mcp-server-name: The name of the MCP server. Create a unique name that reflects what this MCP server does.',
			'- command-to-run: The command to run to start the MCP server. This is the command you would use to run the project you just created.',
			'- list-of-args: The arguments to pass to the command. This is the list of arguments you would use to run the project you just created.',
			'5. Install any required VS Code extensions based on the chosen language (e.g., Python extension for Python projects).',
			'6. Inform the user that they can now debug this MCP server using VS Code.',
		]
	},
	{
		projectType: 'python-script',
		description: 'A simple Python script project which should be chosen when just a single script wants to be created.',
		requiredExtensions: ['ms-python.python', 'ms-python.vscode-python-envs'],
		rules: [
			'Follow these rules strictly and do not deviate from them.',
			`1. Call the tool ${ToolName.RunVscodeCmd} to correctly create a new Python script project in VS Code. Call the command with the following arguments.`,
			`Note that "python-script" and "true" are constants while  "New Project Name" and "/path/to/new/project" are placeholders for the project name and path respectively.`,
			`{ `,
			`"name": "python-envs.createNewProjectFromTemplate",`,
			`"commandId": "python-envs.createNewProjectFromTemplate",`,
			`"args": [ "python-script", "true" , "New Project Name", "/path/to/new/project"]`,
			`}`,
		]
	},
	{
		projectType: 'python-package',
		description: 'A Python package project which can be used to create a distributable package.',
		requiredExtensions: ['ms-python.python', 'ms-python.vscode-python-envs'],
		rules: [
			'Follow these rules strictly and do not deviate from them.',
			`1. Call the tool ${ToolName.RunVscodeCmd} to correctly create a new Python package project in VS Code. Call the command with the following arguments:`,
			`Note that "python-package" and "true" are constants while  "New Package Name" and "/path/to/new/project" are placeholders for the package name and path respectively.`,
			`{ `,
			`"name": "python-envs.createNewProjectFromTemplate",`,
			`"commandId": "python-envs.createNewProjectFromTemplate",`,
			`"args": [ "python-package", "true" , "New Package Name", "/path/to/new/project"]`,
			`}`,
		]
	}
];

export interface IWorkspaceSetupInfoToolParams {
	projectType: string;
}

export class GetWorkspaceSetupInfoTool implements ICopilotTool<IWorkspaceSetupInfoToolParams> {
	public static readonly toolName = ToolName.GetProjectSetupInfo;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async prepareInvocation?(options: LanguageModelToolInvocationPrepareOptions<IWorkspaceSetupInfoToolParams>, token: CancellationToken): Promise<PreparedToolInvocation> {
		return {
			invocationMessage: l10n.t`Getting setup information`,
		};
	}

	async invoke(options: LanguageModelToolInvocationOptions<IWorkspaceSetupInfoToolParams>, token: CancellationToken): Promise<LanguageModelToolResult> {

		const { projectType } = options.input;
		const selectedSetupInfo = setupInfo.find((info) => info.projectType === projectType);

		const json = await renderPromptElementJSON(this.instantiationService, WorkspaceSetupResult, { projectSetupInfo: selectedSetupInfo },);

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		return new LanguageModelToolResult([
			new LanguageModelPromptTsxPart(json),
		]);
	}
}

ToolRegistry.registerTool(GetWorkspaceSetupInfoTool);

export class WorkspaceSetupResult extends PromptElement<WorkspaceSetupProps> {
	constructor(
		props: PromptElementProps<WorkspaceSetupProps>,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {
		const useContext7 = this.configurationService.getConfig(ConfigKey.NewWorkspaceUseContext7);
		if (useContext7) {
			return <> <TextChunk>
				Use context7 tools to find the latest libraries, APIs, and documentation to help the user create and customize their project.<br />
				1. Call mcp_context7_resolve-library-id with your project requirements.<br />
				2. Call mcp_context7_get-library-docs to get scaffolding instructions.<br />
				You must call these tools before proceeding and confirm that you did NOT skip this step.<br />
				<br />
			</TextChunk></>;
		}

		const { projectSetupInfo } = this.props;
		if (!projectSetupInfo) {
			return <> <TextChunk>
				No project setup information found.<br />
			</TextChunk></>;
		}

		const setupInfo = JSON.stringify(projectSetupInfo, null, 2);
		return <>
			<TextChunk>
				Use the Project Setup Information:<br />
				${setupInfo}<br />
			</TextChunk>
		</>;
	}
}

interface WorkspaceSetupProps extends BasePromptElementProps {
	projectSetupInfo?: ProjectSetupInfo;
}