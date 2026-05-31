/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, TextChunk, UserMessage } from '@vscode/prompt-tsx';
import { JsonSchema } from '../../../platform/configuration/common/jsonSchema';
import { GenericBasePromptElementProps } from '../../context/node/resolvers/genericPanelIntentInvocation';
import { InstructionMessage } from '../../prompts/node/base/instructionMessage';
import { Tag } from '../../prompts/node/base/tag';
import { HistoryWithInstructions } from '../../prompts/node/panel/conversationHistory';
import { ChatToolCalls } from '../../prompts/node/panel/toolCalling';
import { CopilotToolMode } from '../../tools/common/toolsRegistry';
import { McpPickRef, QuickInputTool, QuickPickTool } from './mcpToolCallingTools';

export interface IMcpToolCallingLoopPromptContext {
	packageName: string;
	packageType: 'npm' | 'pip' | 'docker' | 'nuget';
	packageReadme: string | undefined;
	packageVersion: string | undefined;
	targetSchema: JsonSchema;
	pickRef: McpPickRef;
}

export interface IMcpToolCallingLoopProps extends GenericBasePromptElementProps, IMcpToolCallingLoopPromptContext { }

const packageTypePreferredCommands = {
	pip: (name: string, version: string | undefined) => `uvx ${name.replaceAll('-', '_')}` + (version ? `==${version}` : ''),
	npm: (name: string, version: string | undefined) => `npx ${name}` + (version ? `@${version}` : ''),
	docker: (name: string, _version: string | undefined) => `docker run -i --rm ${name}`,
	nuget: (name: string, version: string | undefined) => `dnx ${name}` + (version ? `@${version}` : '') + ` --yes`,
};

export class McpToolCallingLoopPrompt extends PromptElement<IMcpToolCallingLoopProps> {
	async render() {
		const { packageType, packageName, packageVersion, pickRef, packageReadme } = this.props;
		const { history, toolCallRounds = [], toolCallResults = {} } = this.props.promptContext;

		// We do kind of a 'special' thing here to have the tool only available to *this* prompt because
		// we're in a quickpick flow (and don't really want the tool generally available)
		for (const round of toolCallRounds) {
			for (const tool of round.toolCalls) {
				if (toolCallResults[tool.id]) {
					// no-op
				} else if (tool.name === QuickInputTool.ID) {
					toolCallResults[tool.id] = await QuickInputTool.invoke(pickRef, JSON.parse(tool.arguments));
				} else if (tool.name === QuickPickTool.ID) {
					toolCallResults[tool.id] = await QuickPickTool.invoke(pickRef, JSON.parse(tool.arguments));
				}
			}
		}

		const hasMcpJson = packageReadme?.includes('"mcpServers":');
		const command = packageTypePreferredCommands[packageType](packageName, packageVersion);

		return (
			<>
				<HistoryWithInstructions flexGrow={1} passPriority historyPriority={700} history={history}>
					<InstructionMessage>
						<Tag name='instructions'>
							You are an expert in reading documentation and extracting relevant results.<br />
							A developer is setting up a Model Context Protocol (MCP) server based on a {packageType} package. Your task is to create a configuration for the server matching the provided JSON schema.<br />
							{hasMcpJson ? <InstructionsWithMcpJson command={command} packageVersion={packageVersion} /> : <InstructionsWithout command={command} packageVersion={packageVersion} />}
							<br />
							<br />
							When using a tool, follow the JSON schema very carefully and make sure to include all required fields. DO NOT write out a JSON codeblock with the tool inputs.<br />
						</Tag>
						<Tag name='example'>
							<Tag name='request'>
								User: I want to run the npm package `@modelcontextprotocol/server-redis` as an MCP server. This is its readme:<br /><br />
								{redisExampleReadme}
							</Tag>
							<Tag name='response'>
								{hasMcpJson && <>The readme has an example confirmation I'll work off of:<br />${clauseExampleConfiguration}</>}<br />
								Based on {hasMcpJson ? 'this example' : 'the documentation'}, I need the following information to run the MCP server:<br />
								- Redis hostname<br />
								- Redis port number<br />
								- Redis password (optional)<br />
								<br />
								I will now ask for this information.<br />
								[[`{QuickInputTool.ID}` called requesting Redis hostname]]: "redis.example.com"<br />
								[[`{QuickInputTool.ID}` called requesting Redis port number]]: "3000"<br />
								[[`{QuickInputTool.ID}` called requesting Redis port password]]: ""<br />
								<br />
								{!hasMcpJson && <>Based on this data, the command needed to run the MCP server is `npx @modelcontextprotocol/server-redis redis://example.com:6379`</>}
								Based on this data, the command needed to run the MCP server is `npx @modelcontextprotocol/server-redis redis://example.com:6379`<br />
								<br />
								Here is the JSON object that matches the provided schema:<br />
								{redisExampleConfig}
							</Tag>
						</Tag>
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage flexGrow={3}>
					I want to run the {packageType} package `{packageName}` as an MCP server. This is its readme:<br />
					<Tag name='readme'>{this.props.packageReadme}</Tag>

					The schema for the final JSON object is:<br />

					<Tag name='schema' flexGrow={1}>
						<TextChunk breakOnWhitespace>
							{JSON.stringify(this.props.targetSchema, null, 2)}
						</TextChunk>
					</Tag>
				</UserMessage>
				<ChatToolCalls priority={899} flexGrow={2} promptContext={this.props.promptContext} toolCallRounds={toolCallRounds} toolCallResults={toolCallResults} toolCallMode={CopilotToolMode.FullContext} />
			</>
		);
	}
}

class InstructionsWithMcpJson extends PromptElement<{ command: string; packageVersion: string | undefined } & BasePromptElementProps> {
	render() {
		const [command, ...args] = this.props.command.split(' ');
		return <>
			Think step by step:<br />
			1. Read the documentation for the MCP server and find the section that discusses setting up a configuration with `mcpServers`. If there are multiple such examples, find the one that works best when run as `{`{"command":"${command}", "args": ["${args.join('", "')}", ...], , "env": { ... } }`}. State this configuration in your response.<br />
			2. Determine what placeholders are used in that example that the user would need to fill, such as configuration options, credentials, or API keys.<br />
			3. Call the tool `{QuickInputTool.ID}` a maximum of 5 times to gather the placeholder information. You may make multiple calls using this tool in parallel, but the maximum number of questions must be 5.<br />
			4. Transform that example configuration entry, replacing or adding any additional information the user gave you, into a JSON object matching the provided schema.<br />
			{this.props.packageVersion && <>The package version is {this.props.packageVersion}, make sure your command runs the correct version, using the form `{this.props.command}`.<br /></>}
			5. Return the resulting JSON object in a markdown code block wrapped with triple backticks (```)<br />
		</>;
	}
}
class InstructionsWithout extends PromptElement<{ command: string; packageVersion: string | undefined } & BasePromptElementProps> {
	render() {
		return <>
			The MCP server the developer is asking about can be run using the command {this.props.command}, but it may need additional arguments or environment variables to function.<br /><br />
			Think step by step:<br />
			1. Read the documentation for the MCP server and determine what information you would need to run it on the command line.<br />
			2. Call the tool `{QuickInputTool.ID}` a maximum of 5 times to gather the necessary information. You may make multiple calls using this tool in parallel, but the maximum number of questions must be 5.<br />
			3. Use that information to construct a set of arguments and environment variables to run the server. <br />
			{this.props.packageVersion && <>The package version is {this.props.packageVersion}, make sure your command runs the correct version, using the form `{this.props.command}`.<br /></>}
			4. Translate the command, arguments and environment variables into a JSON object that matches the provided schema.<br />
			5. Return the resulting JSON object in a markdown code block wrapped with triple backticks (```)<br />
			<br />
			Follow these rules when constructing your arguments and environment variables:<br />
			1. Prefer to use environment variables over arguments when possible, especially for sensitive information. Command-line arguments are not secure.<br />
			2. Look carefully in the readme for instructions for how to run the MCP server in `stdio` mode. If there are additional arguments needed to run the MCP server in `stdio` mode, then you MUST include them in your output.<br />
			4. Briefly summarize how the above instructions were followed in your response.<br />
		</>;
	}
}

const clauseExampleConfiguration = `\`\`\`json
{
  "mcpServers": {
    "redis": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-redis",
        "redis://localhost:6379"
      ]
    }
  }
}
\`\`\``;

const redisExampleReadme = `<readme>
# Redis

A Model Context Protocol server that provides access to Redis databases. This server enables LLMs to interact with Redis key-value stores through a set of standardized tools.

## Components

### Tools

- **set**
  - Set a Redis key-value pair with optional expiration
  - Input:
    - \`key\` (string): Redis key
    - \`value\` (string): Value to store
    - \`expireSeconds\` (number, optional): Expiration time in seconds

- **get**
  - Get value by key from Redis
  - Input: \`key\` (string): Redis key to retrieve

- **delete**
  - Delete one or more keys from Redis
  - Input: \`key\` (string | string[]): Key or array of keys to delete

- **list**
  - List Redis keys matching a pattern
  - Input: \`pattern\` (string, optional): Pattern to match keys (default: *)

## Usage with Claude Desktop

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your \`claude_desktop_config.json\`:

### Docker

* when running docker on macos, use host.docker.internal if the server is running on the host network (eg localhost)
* Redis URL can be specified as an argument, defaults to "redis://localhost:6379"

\`\`\`json
{
  "mcpServers": {
    "redis": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "mcp/redis",
        "redis://host.docker.internal:6379"]
    }
  }
}
\`\`\`

### NPX

${clauseExampleConfiguration}
</readme>`;

const redisExampleConfig = `
\`\`\`json
{
	"name": "redis",
	"command": "npx",
	"args": [
		"@modelcontextprotocol/server-redis",
		"redis://redis.example.com:3000"
	]
}
\`\`\`
`;
