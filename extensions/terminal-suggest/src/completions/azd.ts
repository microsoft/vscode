/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { filepaths } from '../helpers/filepaths';

interface AzdEnvListItem {
	Name: string;
	DotEnvPath: string;
	HasLocal: boolean;
	HasRemote: boolean;
	IsDefault: boolean;
}

interface AzdTemplateListItem {
	name: string;
	description: string;
	repositoryPath: string;
	tags: string[];
}

interface AzdExtensionListItem {
	id: string;
	name: string;
	namespace: string;
	version: string;
	installedVersion: string;
	source: string;
}

interface AzdConfigOption {
	Key: string;
	Description: string;
	Type: string;
	AllowedValues?: string[] | null;
	Example?: string;
	EnvVar?: string;
}

const azdGenerators: Record<string, Fig.Generator> = {
	listEnvironments: {
		script: ['azd', 'env', 'list', '--output', 'json'],
		postProcess: (out) => {
			try {
				const envs: AzdEnvListItem[] = JSON.parse(out);
				return envs.map((env) => ({
					name: env.Name,
					displayName: env.IsDefault ? 'Default' : undefined,
				}));
			} catch {
				return [];
			}
		},
	},
	listEnvironmentVariables: {
		script: ['azd', 'env', 'get-values', '--output', 'json'],
		postProcess: (out) => {
			try {
				const envVars: Record<string, string> = JSON.parse(out);
				return Object.keys(envVars).map((key) => ({
					name: key,
				}));
			} catch {
				return [];
			}
		},
	},
	listTemplates: {
		script: ['azd', 'template', 'list', '--output', 'json'],
		postProcess: (out) => {
			try {
				const templates: AzdTemplateListItem[] = JSON.parse(out);
				return templates.map((template) => ({
					name: template.repositoryPath,
					description: template.name,
				}));
			} catch {
				return [];
			}
		},
		cache: {
			strategy: 'stale-while-revalidate',
		}
	},
	listTemplateTags: {
		script: ['azd', 'template', 'list', '--output', 'json'],
		postProcess: (out) => {
			try {
				const templates: AzdTemplateListItem[] = JSON.parse(out);
				const tagsSet = new Set<string>();

				// Collect all unique tags from all templates
				templates.forEach((template) => {
					if (template.tags && Array.isArray(template.tags)) {
						template.tags.forEach((tag) => tagsSet.add(tag));
					}
				});

				// Convert set to array and return as suggestions
				return Array.from(tagsSet).sort().map((tag) => ({
					name: tag,
				}));
			} catch {
				return [];
			}
		},
		cache: {
			strategy: 'stale-while-revalidate',
		}
	},
	listTemplatesFiltered: {
		custom: async (tokens, executeCommand, generatorContext) => {
			// Find if there's a -f or --filter flag in the tokens
			let filterValue: string | undefined;
			for (let i = 0; i < tokens.length; i++) {
				if ((tokens[i] === '-f' || tokens[i] === '--filter') && i + 1 < tokens.length) {
					filterValue = tokens[i + 1];
					break;
				}
			}

			// Build the azd command with filter if present
			const args = ['template', 'list', '--output', 'json'];
			if (filterValue) {
				args.push('--filter', filterValue);
			}

			try {
				const { stdout } = await executeCommand({
					command: 'azd',
					args: args,
				});

				const templates: AzdTemplateListItem[] = JSON.parse(stdout);
				return templates.map((template) => ({
					name: template.repositoryPath,
					description: template.name,
				}));
			} catch {
				return [];
			}
		},
		cache: {
			strategy: 'stale-while-revalidate',
		}
	},
	listExtensions: {
		script: ['azd', 'ext', 'list', '--output', 'json'],
		postProcess: (out) => {
			try {
				const extensions: AzdExtensionListItem[] = JSON.parse(out);
				const uniqueExtensions = new Map<string, AzdExtensionListItem>();

				extensions.forEach((ext) => {
					if (!uniqueExtensions.has(ext.id)) {
						uniqueExtensions.set(ext.id, ext);
					}
				});

				return Array.from(uniqueExtensions.values()).map((ext) => ({
					name: ext.id,
					description: ext.name,
				}));
			} catch {
				return [];
			}
		},
		cache: {
			strategy: 'stale-while-revalidate',
		}
	},
	listInstalledExtensions: {
		script: ['azd', 'ext', 'list', '--installed', '--output', 'json'],
		postProcess: (out) => {
			try {
				const extensions: AzdExtensionListItem[] = JSON.parse(out);
				const uniqueExtensions = new Map<string, AzdExtensionListItem>();

				extensions.forEach((ext) => {
					if (!uniqueExtensions.has(ext.id)) {
						uniqueExtensions.set(ext.id, ext);
					}
				});

				return Array.from(uniqueExtensions.values()).map((ext) => ({
					name: ext.id,
					description: ext.name,
				}));
			} catch {
				return [];
			}
		},
	},
	listConfigKeys: {
		script: ['azd', 'config', 'options', '--output', 'json'],
		postProcess: (out) => {
			try {
				const options: AzdConfigOption[] = JSON.parse(out);
				return options
					.filter((opt) => opt.Type !== 'envvar') // Exclude environment-only options
					.map((opt) => ({
						name: opt.Key,
						description: opt.Description,
					}));
			} catch {
				return [];
			}
		},
		cache: {
			strategy: 'stale-while-revalidate',
		}
	},
};

const completionSpec: Fig.Spec = {
	name: 'azd',
	description: 'Azure Developer CLI',
	subcommands: [
		{
			name: ['add'],
			description: 'Add a component to your project.',
		},
		{
			name: ['ai'],
			description: 'Commands for the ai extension namespace.',
			subcommands: [
				{
					name: ['agent'],
					description: 'Ship agents with Microsoft Foundry from your terminal. (Preview)',
					subcommands: [
						{
							name: ['code'],
							description: 'Manage agent source code. (Preview)',
							subcommands: [
								{
									name: ['download'],
									description: 'Download agent source code from Foundry. (Preview)',
									options: [
										{
											name: ['--dest', '-d'],
											description: 'Destination path (default: ./<agent-name>/ or ./<agent-name>.zip)',
											args: [
												{
													name: 'dest',
												},
											],
										},
										{
											name: ['--version', '-v'],
											description: 'Agent version to download (default: latest)',
											args: [
												{
													name: 'version',
												},
											],
										},
										{
											name: ['--zip'],
											description: 'Save as zip file instead of extracting',
										},
									],
								},
							],
						},
						{
							name: ['delete'],
							description: 'Delete a hosted agent.',
							options: [
								{
									name: ['--force'],
									description: 'Force deletion even if the agent has active sessions',
									isDangerous: true,
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'none'],
										},
									],
								},
								{
									name: ['--version'],
									description: 'Delete a specific version only (the agent itself remains)',
									args: [
										{
											name: 'version',
										},
									],
								},
							],
						},
						{
							name: ['doctor'],
							description: 'Diagnose problems with an azd ai agent project.',
							options: [
								{
									name: ['--local-only'],
									description: 'Skip remote (network-dependent) checks. Useful when offline, behind a proxy, or for a fast local triage.',
								},
								{
									name: ['--unredacted'],
									description: 'Show raw principal IDs, scope ARNs, and UPNs in the report.',
								},
							],
						},
						{
							name: ['endpoint'],
							description: 'Manage agent endpoint and card configuration.',
							subcommands: [
								{
									name: ['show'],
									description: 'Show the current endpoint and card configuration of an agent.',
									options: [
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['json', 'table'],
												},
											],
										},
									],
								},
								{
									name: ['update'],
									description: 'Update an agent\'s endpoint and card configuration without deploying a new version.',
									options: [
										{
											name: ['--force'],
											description: 'Skip confirmation prompts for breaking changes',
											isDangerous: true,
										},
									],
								},
							],
						},
						{
							name: ['eval'],
							description: 'Create and run quick evals for an agent.',
							subcommands: [
								{
									name: ['generate'],
									description: 'Generate a local eval suite for a deployed agent.',
									options: [
										{
											name: ['--agent'],
											description: 'Target agent name',
											args: [
												{
													name: 'agent',
												},
											],
										},
										{
											name: ['--dataset'],
											description: 'Existing local file or registered dataset name to use for evaluation (instead of generating a new dataset)',
											args: [
												{
													name: 'dataset',
												},
											],
										},
										{
											name: ['--eval-model'],
											description: 'Model used for evaluation and generation',
											args: [
												{
													name: 'eval-model',
												},
											],
										},
										{
											name: ['--evaluator'],
											description: 'Built-in or custom evaluator name',
											isRepeatable: true,
											args: [
												{
													name: 'evaluator',
												},
											],
										},
										{
											name: ['--gen-instruction', '-g'],
											description: 'Agent instruction used for dataset and evaluator generation',
											args: [
												{
													name: 'gen-instruction',
												},
											],
										},
										{
											name: ['--gen-instruction-file'],
											description: 'Path to a file containing the agent instruction',
											args: [
												{
													name: 'gen-instruction-file',
												},
											],
										},
										{
											name: ['--max-samples'],
											description: 'Number of samples to generate (15-1000)',
											args: [
												{
													name: 'max-samples',
												},
											],
										},
										{
											name: ['--name'],
											description: 'Name for the eval suite',
											args: [
												{
													name: 'name',
												},
											],
										},
										{
											name: ['--no-wait'],
											description: 'Submit generation jobs and return immediately',
										},
										{
											name: ['--out-file'],
											description: 'Eval config path',
											args: [
												{
													name: 'out-file',
												},
											],
										},
										{
											name: ['--project-endpoint', '-p'],
											description: 'Microsoft Foundry project endpoint URL',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--reset-defaults'],
											description: 'Overwrite an existing eval config',
										},
										{
											name: ['--trace-days'],
											description: 'Include agent traces from the last N days for evaluator generation (0 = no traces)',
											args: [
												{
													name: 'trace-days',
												},
											],
										},
									],
								},
								{
									name: ['list'],
									description: 'List evaluations for the current project.',
									options: [
										{
											name: ['--limit'],
											description: 'Maximum number of evals to return',
											args: [
												{
													name: 'limit',
												},
											],
										},
									],
								},
								{
									name: ['run'],
									description: 'Execute an evaluation run from eval.yaml.',
									options: [
										{
											name: ['--config'],
											description: 'Local eval config YAML',
											args: [
												{
													name: 'config',
												},
											],
										},
										{
											name: ['--name'],
											description: 'Name for the eval run (defaults to eval config name)',
											args: [
												{
													name: 'name',
												},
											],
										},
										{
											name: ['--no-wait'],
											description: 'Start the run and return immediately without waiting for results',
										},
									],
								},
								{
									name: ['show'],
									description: 'Show an eval definition, run history, or run details.',
									options: [
										{
											name: ['--eval-run-id'],
											description: 'Show details for a specific eval run',
											args: [
												{
													name: 'eval-run-id',
												},
											],
										},
										{
											name: ['--limit'],
											description: 'Maximum number of runs to show',
											args: [
												{
													name: 'limit',
												},
											],
										},
										{
											name: ['--out-file', '-O'],
											description: 'Export full run results to a JSON file',
											args: [
												{
													name: 'out-file',
												},
											],
										},
									],
								},
								{
									name: ['update'],
									description: 'Update evaluators and datasets from local files.',
									options: [
										{
											name: ['--config'],
											description: 'Local eval config YAML',
											args: [
												{
													name: 'config',
												},
											],
										},
										{
											name: ['--dataset-only'],
											description: 'Only update the dataset',
										},
										{
											name: ['--evaluator-only'],
											description: 'Only update evaluators',
										},
									],
								},
							],
						},
						{
							name: ['files'],
							description: 'Manage files in a hosted agent session.',
							subcommands: [
								{
									name: ['delete', 'remove', 'rm'],
									description: 'Delete a file or directory from a hosted agent session.',
									options: [
										{
											name: ['--agent-name', '-n'],
											description: 'Agent name (matches azure.yaml service name; auto-detected when only one exists)',
											args: [
												{
													name: 'agent-name',
												},
											],
										},
										{
											name: ['--chat-isolation-key'],
											description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'chat-isolation-key',
												},
											],
										},
										{
											name: ['--file', '-f'],
											description: 'Remote file or directory path to delete',
											args: [
												{
													name: 'file',
												},
											],
										},
										{
											name: ['--recursive'],
											description: 'Recursively delete directories and their contents',
										},
										{
											name: ['--session-id', '-s'],
											description: 'Session ID override (defaults to last invoke session)',
											args: [
												{
													name: 'session-id',
												},
											],
										},
										{
											name: ['--user-isolation-key'],
											description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'user-isolation-key',
												},
											],
										},
									],
								},
								{
									name: ['download'],
									description: 'Download a file from a hosted agent session.',
									options: [
										{
											name: ['--agent-name', '-n'],
											description: 'Agent name (matches azure.yaml service name; auto-detected when only one exists)',
											args: [
												{
													name: 'agent-name',
												},
											],
										},
										{
											name: ['--chat-isolation-key'],
											description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'chat-isolation-key',
												},
											],
										},
										{
											name: ['--file', '-f'],
											description: 'Remote file path to download',
											args: [
												{
													name: 'file',
												},
											],
										},
										{
											name: ['--session-id', '-s'],
											description: 'Session ID override (defaults to last invoke session)',
											args: [
												{
													name: 'session-id',
												},
											],
										},
										{
											name: ['--target-path', '-t'],
											description: 'Local destination path (defaults to remote filename)',
											args: [
												{
													name: 'target-path',
												},
											],
										},
										{
											name: ['--user-isolation-key'],
											description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'user-isolation-key',
												},
											],
										},
									],
								},
								{
									name: ['list', 'ls'],
									description: 'List files in a hosted agent session.',
									options: [
										{
											name: ['--agent-name', '-n'],
											description: 'Agent name (matches azure.yaml service name; auto-detected when only one exists)',
											args: [
												{
													name: 'agent-name',
												},
											],
										},
										{
											name: ['--chat-isolation-key'],
											description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'chat-isolation-key',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['json', 'table'],
												},
											],
										},
										{
											name: ['--session-id', '-s'],
											description: 'Session ID override (defaults to last invoke session)',
											args: [
												{
													name: 'session-id',
												},
											],
										},
										{
											name: ['--user-isolation-key'],
											description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'user-isolation-key',
												},
											],
										},
									],
								},
								{
									name: ['mkdir'],
									description: 'Create a directory in a hosted agent session.',
									options: [
										{
											name: ['--agent-name', '-n'],
											description: 'Agent name (matches azure.yaml service name; auto-detected when only one exists)',
											args: [
												{
													name: 'agent-name',
												},
											],
										},
										{
											name: ['--chat-isolation-key'],
											description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'chat-isolation-key',
												},
											],
										},
										{
											name: ['--dir', '-d'],
											description: 'Remote directory path to create',
											args: [
												{
													name: 'dir',
												},
											],
										},
										{
											name: ['--session-id', '-s'],
											description: 'Session ID override (defaults to last invoke session)',
											args: [
												{
													name: 'session-id',
												},
											],
										},
										{
											name: ['--user-isolation-key'],
											description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'user-isolation-key',
												},
											],
										},
									],
								},
								{
									name: ['stat'],
									description: 'Get file or directory metadata in a hosted agent session.',
									options: [
										{
											name: ['--agent-name', '-n'],
											description: 'Agent name (matches azure.yaml service name; auto-detected when only one exists)',
											args: [
												{
													name: 'agent-name',
												},
											],
										},
										{
											name: ['--chat-isolation-key'],
											description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'chat-isolation-key',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['json', 'table'],
												},
											],
										},
										{
											name: ['--session-id', '-s'],
											description: 'Session ID override (defaults to last invoke session)',
											args: [
												{
													name: 'session-id',
												},
											],
										},
										{
											name: ['--user-isolation-key'],
											description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'user-isolation-key',
												},
											],
										},
									],
								},
								{
									name: ['upload'],
									description: 'Upload a file to a hosted agent session.',
									options: [
										{
											name: ['--agent-name', '-n'],
											description: 'Agent name (matches azure.yaml service name; auto-detected when only one exists)',
											args: [
												{
													name: 'agent-name',
												},
											],
										},
										{
											name: ['--chat-isolation-key'],
											description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'chat-isolation-key',
												},
											],
										},
										{
											name: ['--file', '-f'],
											description: 'Local file path to upload',
											args: [
												{
													name: 'file',
												},
											],
										},
										{
											name: ['--session-id', '-s'],
											description: 'Session ID override (defaults to last invoke session)',
											args: [
												{
													name: 'session-id',
												},
											],
										},
										{
											name: ['--target-path', '-t'],
											description: 'Remote destination path (defaults to local filename)',
											args: [
												{
													name: 'target-path',
												},
											],
										},
										{
											name: ['--user-isolation-key'],
											description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'user-isolation-key',
												},
											],
										},
									],
								},
							],
						},
						{
							name: ['init'],
							description: 'Initialize a new AI agent project. (Preview)',
							options: [
								{
									name: ['--agent-name'],
									description: 'Foundry agent name to write to agent.yaml. Reusing a name creates a new version of the existing agent.',
									args: [
										{
											name: 'agent-name',
										},
									],
								},
								{
									name: ['--dep-resolution'],
									description: 'Dependency resolution for code deploy: \'remote_build\' or \'bundled\'. Defaults to \'remote_build\'.',
									args: [
										{
											name: 'dep-resolution',
										},
									],
								},
								{
									name: ['--deploy-mode'],
									description: 'Deployment mode: \'container\' (Docker image) or \'code\' (ZIP upload). Defaults to \'container\' in --no-prompt.',
									args: [
										{
											name: 'deploy-mode',
										},
									],
								},
								{
									name: ['--entry-point'],
									description: 'Entry point file for code deploy (e.g., \'app.py\', \'MyAgent.dll\'). Required with --deploy-mode code --no-prompt.',
									args: [
										{
											name: 'entry-point',
										},
									],
								},
								{
									name: ['--force'],
									description: 'Overwrite an input manifest that already lives inside the generated src tree without prompting. Required together with --no-prompt when init would otherwise need confirmation.',
									isDangerous: true,
								},
								{
									name: ['--manifest', '-m'],
									description: 'Path or URI to an agent manifest to add to your azd project',
									args: [
										{
											name: 'manifest',
										},
									],
								},
								{
									name: ['--model'],
									description: 'Name of the AI model to use (e.g., \'gpt-4o\'). If not specified, defaults to \'gpt-4.1-mini\'. Mutually exclusive with --model-deployment, with --model-deployment being used if both are provided',
									args: [
										{
											name: 'model',
										},
									],
								},
								{
									name: ['--model-deployment', '-d'],
									description: 'Name of an existing model deployment to use from the Foundry project. Only used when paired with an existing Foundry project, either via --project-id or interactive prompts',
									args: [
										{
											name: 'model-deployment',
										},
									],
								},
								{
									name: ['--project-id', '-p'],
									description: 'Existing Microsoft Foundry Project Id to initialize your azd environment with',
									args: [
										{
											name: 'project-id',
										},
									],
								},
								{
									name: ['--protocol'],
									description: 'Protocols supported by the agent (e.g., \'responses\', \'invocations\'). Can be specified multiple times.',
									isRepeatable: true,
									args: [
										{
											name: 'protocol',
										},
									],
								},
								{
									name: ['--runtime'],
									description: 'Runtime for code deploy (e.g., \'python_3_13\', \'python_3_14\', \'dotnet_10\'). Required with --deploy-mode code --no-prompt.',
									args: [
										{
											name: 'runtime',
										},
									],
								},
								{
									name: ['--src', '-s'],
									description: 'Directory to download the agent definition to (defaults to \'src/<agent-id>\')',
									args: [
										{
											name: 'src',
										},
									],
								},
							],
						},
						{
							name: ['invoke'],
							description: 'Send a message to your agent.',
							options: [
								{
									name: ['--agent-endpoint'],
									description: 'Full endpoint URL of a deployed agent (run \'azd ai agent show\' to see it). Invokes without requiring an azd project; protocol is derived from the URL.',
									args: [
										{
											name: 'agent-endpoint',
										},
									],
								},
								{
									name: ['--chat-isolation-key'],
									description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
									args: [
										{
											name: 'chat-isolation-key',
										},
									],
								},
								{
									name: ['--conversation-id'],
									description: 'Explicit conversation ID override',
									args: [
										{
											name: 'conversation-id',
										},
									],
								},
								{
									name: ['--input-file', '-f'],
									description: 'Path to a file whose contents are sent as the request body',
									args: [
										{
											name: 'input-file',
										},
									],
								},
								{
									name: ['--local', '-l'],
									description: 'Invoke on localhost instead of Foundry',
								},
								{
									name: ['--new-conversation'],
									description: 'Force a new conversation (discard saved one)',
								},
								{
									name: ['--new-session'],
									description: 'Force a new session (discard saved one)',
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['default', 'raw'],
										},
									],
								},
								{
									name: ['--port'],
									description: 'Local server port',
									args: [
										{
											name: 'port',
										},
									],
								},
								{
									name: ['--protocol', '-p'],
									description: 'Protocol to use: responses (default) or invocations',
									args: [
										{
											name: 'protocol',
										},
									],
								},
								{
									name: ['--session-id', '-s'],
									description: 'Explicit session ID override',
									args: [
										{
											name: 'session-id',
										},
									],
								},
								{
									name: ['--timeout', '-t'],
									description: 'Request timeout in seconds (0 for no timeout)',
									args: [
										{
											name: 'timeout',
										},
									],
								},
								{
									name: ['--user-isolation-key'],
									description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
									args: [
										{
											name: 'user-isolation-key',
										},
									],
								},
								{
									name: ['--version'],
									description: 'Agent version to invoke (creates or reuses a session backed by that version)',
									args: [
										{
											name: 'version',
										},
									],
								},
							],
						},
						{
							name: ['monitor'],
							description: 'Monitor logs from a hosted agent.',
							options: [
								{
									name: ['--chat-isolation-key'],
									description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
									args: [
										{
											name: 'chat-isolation-key',
										},
									],
								},
								{
									name: ['--follow', '-f'],
									description: 'Stream logs in real-time',
								},
								{
									name: ['--raw'],
									description: 'Print the raw SSE stream without formatting',
								},
								{
									name: ['--session-id', '-s'],
									description: 'Session ID to stream logs for',
									args: [
										{
											name: 'session-id',
										},
									],
								},
								{
									name: ['--tail', '-l'],
									description: 'Number of trailing log lines to fetch (1-300)',
									args: [
										{
											name: 'tail',
										},
									],
								},
								{
									name: ['--type', '-t'],
									description: 'Type of logs: \'console\' (stdout/stderr) or \'system\' (container events)',
									args: [
										{
											name: 'type',
										},
									],
								},
								{
									name: ['--user-isolation-key'],
									description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
									args: [
										{
											name: 'user-isolation-key',
										},
									],
								},
								{
									name: ['--utc'],
									description: 'Display timestamps in UTC instead of local time',
								},
							],
						},
						{
							name: ['optimize'],
							description: 'Evaluate and optimize AI agents.',
							subcommands: [
								{
									name: ['apply'],
									description: 'Apply optimized candidate configuration locally to your azd project.',
									options: [
										{
											name: ['--agent'],
											description: 'Agent service name (auto-detected from azure.yaml)',
											args: [
												{
													name: 'agent',
												},
											],
										},
										{
											name: ['--candidate'],
											description: 'Candidate ID from optimization results (required)',
											args: [
												{
													name: 'candidate',
												},
											],
										},
										{
											name: ['--endpoint'],
											description: 'Optimization service endpoint (for local dev)',
											args: [
												{
													name: 'endpoint',
												},
											],
										},
										{
											name: ['--project-endpoint', '-p'],
											description: 'Foundry project endpoint URL',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
									],
								},
								{
									name: ['cancel'],
									description: 'Cancel a running optimization job.',
									options: [
										{
											name: ['--endpoint'],
											description: 'Optimization service endpoint (for local dev)',
											args: [
												{
													name: 'endpoint',
												},
											],
										},
										{
											name: ['--project-endpoint', '-p'],
											description: 'Foundry project endpoint URL',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
									],
								},
								{
									name: ['deploy'],
									description: 'Deploy a winning optimization candidate as a new agent version via the API.',
									options: [
										{
											name: ['--agent'],
											description: 'Agent name to deploy to (auto-detected from agent.yaml)',
											args: [
												{
													name: 'agent',
												},
											],
										},
										{
											name: ['--candidate'],
											description: 'Candidate ID from optimization results (required)',
											args: [
												{
													name: 'candidate',
												},
											],
										},
										{
											name: ['--endpoint'],
											description: 'Optimization service endpoint (for local dev)',
											args: [
												{
													name: 'endpoint',
												},
											],
										},
										{
											name: ['--project-endpoint', '-p'],
											description: 'Foundry project endpoint URL',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
									],
								},
								{
									name: ['list'],
									description: 'List recent optimization runs.',
									options: [
										{
											name: ['--endpoint'],
											description: 'Optimization service endpoint (for local dev)',
											args: [
												{
													name: 'endpoint',
												},
											],
										},
										{
											name: ['--limit'],
											description: 'Maximum number of results',
											args: [
												{
													name: 'limit',
												},
											],
										},
										{
											name: ['--project-endpoint', '-p'],
											description: 'Foundry project endpoint URL',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--status'],
											description: 'Filter by status (pending/running/completed/failed/cancelled)',
											args: [
												{
													name: 'status',
												},
											],
										},
									],
								},
								{
									name: ['status'],
									description: 'Check the status of an optimization job.',
									options: [
										{
											name: ['--endpoint'],
											description: 'Optimization service endpoint (for local dev)',
											args: [
												{
													name: 'endpoint',
												},
											],
										},
										{
											name: ['--poll-interval'],
											description: 'Polling interval in seconds',
											args: [
												{
													name: 'poll-interval',
												},
											],
										},
										{
											name: ['--project-endpoint', '-p'],
											description: 'Foundry project endpoint URL',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--watch'],
											description: 'Poll until job completes',
										},
									],
								},
							],
							options: [
								{
									name: ['--agent', '-a'],
									description: 'Agent name (auto-detected from azd project if omitted)',
									args: [
										{
											name: 'agent',
										},
									],
								},
								{
									name: ['--config', '-c'],
									description: 'Path to YAML config file (optional — values are prompted interactively if omitted)',
									args: [
										{
											name: 'config',
										},
									],
								},
								{
									name: ['--dataset', '-d'],
									description: 'Existing local file or registered dataset name',
									args: [
										{
											name: 'dataset',
										},
									],
								},
								{
									name: ['--endpoint'],
									description: 'Optimization service endpoint (for local dev)',
									args: [
										{
											name: 'endpoint',
										},
									],
								},
								{
									name: ['--eval-model', '-m'],
									description: 'Model for evaluation (required)',
									args: [
										{
											name: 'eval-model',
										},
									],
								},
								{
									name: ['--evaluator'],
									description: 'Built-in or custom evaluator name (repeatable; required when not set in config)',
									isRepeatable: true,
									args: [
										{
											name: 'evaluator',
										},
									],
								},
								{
									name: ['--max-candidates'],
									description: 'Maximum number of optimization candidates to generate (must be >= 1; default: 5)',
									args: [
										{
											name: 'max-candidates',
										},
									],
								},
								{
									name: ['--no-wait'],
									description: 'Submit job and return immediately without waiting for completion',
								},
								{
									name: ['--optimize-model'],
									description: 'Model for optimization reasoning (gpt-5 family recommended; required)',
									args: [
										{
											name: 'optimize-model',
										},
									],
								},
								{
									name: ['--poll-interval'],
									description: 'Polling interval in seconds',
									args: [
										{
											name: 'poll-interval',
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['run'],
							description: 'Run your agent locally for development.',
							options: [
								{
									name: ['--no-inspector'],
									description: 'Do not open Agent Inspector',
								},
								{
									name: ['--port', '-p'],
									description: 'Port to listen on',
									args: [
										{
											name: 'port',
										},
									],
								},
								{
									name: ['--start-command', '-c'],
									description: 'Explicit startup command (overrides azure.yaml and auto-detection)',
									args: [
										{
											name: 'start-command',
										},
									],
								},
							],
						},
						{
							name: ['sample'],
							description: 'Browse the curated catalog of agent samples and azd templates.',
							subcommands: [
								{
									name: ['list', 'ls'],
									description: 'List available agent samples that can be used with `azd ai agent init -m`.',
									options: [
										{
											name: ['--featured-only'],
											description: 'Only include samples tagged \'featured\' (the curated starter list).',
										},
										{
											name: ['--language'],
											description: 'Filter by language token. Supported values: python, dotnetCsharp.',
											args: [
												{
													name: 'language',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['json', 'text'],
												},
											],
										},
										{
											name: ['--type'],
											description: 'Filter by template type. Supported values: agent, azd.',
											args: [
												{
													name: 'type',
												},
											],
										},
									],
								},
							],
						},
						{
							name: ['sessions'],
							description: 'Manage sessions for a hosted agent endpoint.',
							subcommands: [
								{
									name: ['create'],
									description: 'Create a new session for a hosted agent.',
									options: [
										{
											name: ['--agent-name', '-n'],
											description: 'Agent name (matches azure.yaml service name; auto-detected when only one exists)',
											args: [
												{
													name: 'agent-name',
												},
											],
										},
										{
											name: ['--chat-isolation-key'],
											description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'chat-isolation-key',
												},
											],
										},
										{
											name: ['--isolation-key'],
											description: 'Session ownership isolation key header value (x-session-isolation-key; derived from Entra token by default)',
											args: [
												{
													name: 'isolation-key',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['json', 'table'],
												},
											],
										},
										{
											name: ['--session-id'],
											description: 'Optional caller-provided session ID (auto-generated if omitted)',
											args: [
												{
													name: 'session-id',
												},
											],
										},
										{
											name: ['--user-isolation-key'],
											description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'user-isolation-key',
												},
											],
										},
										{
											name: ['--version'],
											description: 'Agent version to back the session (auto-resolved from azd environment if omitted)',
											args: [
												{
													name: 'version',
												},
											],
										},
									],
								},
								{
									name: ['delete'],
									description: 'Delete a session.',
									options: [
										{
											name: ['--agent-name', '-n'],
											description: 'Agent name (matches azure.yaml service name; auto-detected when only one exists)',
											args: [
												{
													name: 'agent-name',
												},
											],
										},
										{
											name: ['--chat-isolation-key'],
											description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'chat-isolation-key',
												},
											],
										},
										{
											name: ['--isolation-key'],
											description: 'Session ownership isolation key header value (x-session-isolation-key; derived from Entra token by default)',
											args: [
												{
													name: 'isolation-key',
												},
											],
										},
										{
											name: ['--user-isolation-key'],
											description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'user-isolation-key',
												},
											],
										},
									],
								},
								{
									name: ['list'],
									description: 'List sessions for a hosted agent.',
									options: [
										{
											name: ['--agent-name', '-n'],
											description: 'Agent name (matches azure.yaml service name; auto-detected when only one exists)',
											args: [
												{
													name: 'agent-name',
												},
											],
										},
										{
											name: ['--chat-isolation-key'],
											description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'chat-isolation-key',
												},
											],
										},
										{
											name: ['--limit'],
											description: 'Maximum number of sessions to return',
											args: [
												{
													name: 'limit',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['json', 'table'],
												},
											],
										},
										{
											name: ['--pagination-token'],
											description: 'Continuation token from a previous list response',
											args: [
												{
													name: 'pagination-token',
												},
											],
										},
										{
											name: ['--user-isolation-key'],
											description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'user-isolation-key',
												},
											],
										},
									],
								},
								{
									name: ['show'],
									description: 'Show details of a session.',
									options: [
										{
											name: ['--agent-name', '-n'],
											description: 'Agent name (matches azure.yaml service name; auto-detected when only one exists)',
											args: [
												{
													name: 'agent-name',
												},
											],
										},
										{
											name: ['--chat-isolation-key'],
											description: 'Foundry chat isolation key header value (x-agent-chat-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'chat-isolation-key',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['json', 'table'],
												},
											],
										},
										{
											name: ['--user-isolation-key'],
											description: 'Foundry user isolation key header value (x-agent-user-isolation-key); independent of --isolation-key (session ownership)',
											args: [
												{
													name: 'user-isolation-key',
												},
											],
										},
									],
								},
							],
						},
						{
							name: ['show'],
							description: 'Show the status of a hosted agent.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
							],
						},
						{
							name: ['version'],
							description: 'Prints the version of the application',
						},
					],
				},
				{
					name: ['connection'],
					description: 'Manage Microsoft Foundry Connections from your terminal. (Preview)',
					subcommands: [
						{
							name: ['context'],
							description: 'Get the context of the azd project & environment.',
							options: [
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['create'],
							description: 'Create a new Foundry project connection.',
							options: [
								{
									name: ['--audience'],
									description: 'Token audience for user-entra-token/agentic-identity/project-managed-identity auth',
									args: [
										{
											name: 'audience',
										},
									],
								},
								{
									name: ['--auth-type'],
									description: 'Auth type: api-key, custom-keys, none, oauth2, user-entra-token, project-managed-identity, agentic-identity',
									args: [
										{
											name: 'auth-type',
										},
									],
								},
								{
									name: ['--authorization-url'],
									description: 'OAuth2 authorization endpoint URL',
									args: [
										{
											name: 'authorization-url',
										},
									],
								},
								{
									name: ['--client-id'],
									description: 'OAuth2 client ID (required for BYO OAuth2)',
									args: [
										{
											name: 'client-id',
										},
									],
								},
								{
									name: ['--client-secret'],
									description: 'OAuth2 client secret (required for BYO OAuth2)',
									args: [
										{
											name: 'client-secret',
										},
									],
								},
								{
									name: ['--connector-name'],
									description: 'Managed connector name (for OAuth2 connectors)',
									args: [
										{
											name: 'connector-name',
										},
									],
								},
								{
									name: ['--custom-key'],
									description: 'Custom key=value (repeatable, for custom-keys auth)',
									isRepeatable: true,
									args: [
										{
											name: 'custom-key',
										},
									],
								},
								{
									name: ['--force'],
									description: 'Replace existing connection (upsert)',
									isDangerous: true,
								},
								{
									name: ['--key'],
									description: 'API key (for api-key auth)',
									args: [
										{
											name: 'key',
										},
									],
								},
								{
									name: ['--kind'],
									description: 'Connection kind (e.g., remote-tool, remote-a2a, cognitive-search)',
									args: [
										{
											name: 'kind',
										},
									],
								},
								{
									name: ['--metadata'],
									description: 'Metadata key=value (repeatable)',
									isRepeatable: true,
									args: [
										{
											name: 'metadata',
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--refresh-url'],
									description: 'OAuth2 token refresh URL',
									args: [
										{
											name: 'refresh-url',
										},
									],
								},
								{
									name: ['--scopes'],
									description: 'OAuth2 scopes (repeatable or comma-separated, e.g. --scopes read:user,user:email)',
									isRepeatable: true,
									args: [
										{
											name: 'scopes',
										},
									],
								},
								{
									name: ['--target'],
									description: 'Target URL or ARM resource ID',
									args: [
										{
											name: 'target',
										},
									],
								},
								{
									name: ['--token-url'],
									description: 'OAuth2 token endpoint URL',
									args: [
										{
											name: 'token-url',
										},
									],
								},
							],
						},
						{
							name: ['delete'],
							description: 'Delete a connection.',
							options: [
								{
									name: ['--force'],
									description: 'Skip confirmation prompt',
									isDangerous: true,
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['list'],
							description: 'List connections in the Foundry project.',
							options: [
								{
									name: ['--kind'],
									description: 'Filter by connection kind (e.g., remote-tool)',
									args: [
										{
											name: 'kind',
										},
									],
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['show'],
							description: 'Show connection details.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--show-credentials'],
									description: 'Fetch credential values from the data plane',
								},
							],
						},
						{
							name: ['update'],
							description: 'Update a connection\'s target, credentials, or metadata.',
							options: [
								{
									name: ['--custom-key'],
									description: 'Update custom key=value (repeatable, for custom-keys auth)',
									isRepeatable: true,
									args: [
										{
											name: 'custom-key',
										},
									],
								},
								{
									name: ['--key'],
									description: 'New API key value (for api-key auth)',
									args: [
										{
											name: 'key',
										},
									],
								},
								{
									name: ['--metadata'],
									description: 'Set metadata key=value (repeatable, merged with existing metadata)',
									isRepeatable: true,
									args: [
										{
											name: 'metadata',
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--target'],
									description: 'New target URL or ARM resource ID',
									args: [
										{
											name: 'target',
										},
									],
								},
							],
						},
						{
							name: ['version'],
							description: 'Display the extension version',
							options: [
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
					],
				},
				{
					name: ['finetuning'],
					description: 'Extension for Foundry Fine Tuning. (Preview)',
					subcommands: [
						{
							name: ['init'],
							description: 'Initialize a new AI Fine-tuning project. (Preview)',
							options: [
								{
									name: ['--from-job', '-j'],
									description: 'Clone configuration from an existing job ID',
									args: [
										{
											name: 'from-job',
										},
									],
								},
								{
									name: ['--project-endpoint', '-e'],
									description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--project-resource-id', '-p'],
									description: 'ARM resource ID of the Microsoft Foundry Project (e.g., /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.CognitiveServices/accounts/{account}/projects/{project})',
									args: [
										{
											name: 'project-resource-id',
										},
									],
								},
								{
									name: ['--subscription', '-s'],
									description: 'Azure subscription ID',
									args: [
										{
											name: 'subscription',
										},
									],
								},
								{
									name: ['--template', '-t'],
									description: 'URL or path to a fine-tune job template',
									args: [
										{
											name: 'template',
										},
									],
								},
								{
									name: ['--working-directory', '-w'],
									description: 'Local path for project output',
									args: [
										{
											name: 'working-directory',
										},
									],
								},
							],
						},
						{
							name: ['jobs'],
							description: 'Manage fine-tuning jobs',
							subcommands: [
								{
									name: ['cancel'],
									description: 'Cancels a running or queued fine-tuning job.',
									options: [
										{
											name: ['--force'],
											description: 'Skip confirmation prompt',
											isDangerous: true,
										},
										{
											name: ['--id', '-i'],
											description: 'Job ID (required)',
											args: [
												{
													name: 'id',
												},
											],
										},
										{
											name: ['--project-endpoint', '-e'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID (enables implicit init if environment not configured)',
											args: [
												{
													name: 'subscription',
												},
											],
										},
									],
								},
								{
									name: ['deploy'],
									description: 'Deploy a fine-tuned model to Azure Cognitive Services',
									options: [
										{
											name: ['--capacity', '-c'],
											description: 'Capacity units',
											args: [
												{
													name: 'capacity',
												},
											],
										},
										{
											name: ['--deployment-name', '-d'],
											description: 'Deployment name (required)',
											args: [
												{
													name: 'deployment-name',
												},
											],
										},
										{
											name: ['--job-id', '-i'],
											description: 'Fine-tuning job ID (required)',
											args: [
												{
													name: 'job-id',
												},
											],
										},
										{
											name: ['--model-format', '-m'],
											description: 'Model format',
											args: [
												{
													name: 'model-format',
												},
											],
										},
										{
											name: ['--no-wait'],
											description: 'Do not wait for deployment to complete',
										},
										{
											name: ['--project-endpoint', '-e'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--sku', '-k'],
											description: 'SKU for deployment',
											args: [
												{
													name: 'sku',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID (enables implicit init if environment not configured)',
											args: [
												{
													name: 'subscription',
												},
											],
										},
										{
											name: ['--version', '-v'],
											description: 'Model version',
											args: [
												{
													name: 'version',
												},
											],
										},
									],
								},
								{
									name: ['list'],
									description: 'List fine-tuning jobs.',
									options: [
										{
											name: ['--after'],
											description: 'Pagination cursor',
											args: [
												{
													name: 'after',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'Output format: table, json',
											args: [
												{
													name: 'output',
												},
											],
										},
										{
											name: ['--project-endpoint', '-e'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID (enables implicit init if environment not configured)',
											args: [
												{
													name: 'subscription',
												},
											],
										},
										{
											name: ['--top', '-t'],
											description: 'Number of jobs to return',
											args: [
												{
													name: 'top',
												},
											],
										},
									],
								},
								{
									name: ['pause'],
									description: 'Pauses a running fine-tuning job.',
									options: [
										{
											name: ['--id', '-i'],
											description: 'Job ID (required)',
											args: [
												{
													name: 'id',
												},
											],
										},
										{
											name: ['--project-endpoint', '-e'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID (enables implicit init if environment not configured)',
											args: [
												{
													name: 'subscription',
												},
											],
										},
									],
								},
								{
									name: ['resume'],
									description: 'Resumes a paused fine-tuning job.',
									options: [
										{
											name: ['--id', '-i'],
											description: 'Job ID (required)',
											args: [
												{
													name: 'id',
												},
											],
										},
										{
											name: ['--project-endpoint', '-e'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID (enables implicit init if environment not configured)',
											args: [
												{
													name: 'subscription',
												},
											],
										},
									],
								},
								{
									name: ['show'],
									description: 'Shows detailed information about a specific job.',
									options: [
										{
											name: ['--id', '-i'],
											description: 'Job ID (required)',
											args: [
												{
													name: 'id',
												},
											],
										},
										{
											name: ['--logs'],
											description: 'Include recent training logs',
										},
										{
											name: ['--output', '-o'],
											description: 'Output format: table, json, yaml',
											args: [
												{
													name: 'output',
												},
											],
										},
										{
											name: ['--project-endpoint', '-e'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID (enables implicit init if environment not configured)',
											args: [
												{
													name: 'subscription',
												},
											],
										},
									],
								},
								{
									name: ['submit'],
									description: 'Submit fine-tuning job.',
									options: [
										{
											name: ['--file', '-f'],
											description: 'Path to the config file.',
											args: [
												{
													name: 'file',
												},
											],
										},
										{
											name: ['--model', '-m'],
											description: 'Base model to fine-tune. Overrides config file. Required if --file is not provided',
											args: [
												{
													name: 'model',
												},
											],
										},
										{
											name: ['--project-endpoint', '-e'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--seed', '-r'],
											description: 'Random seed for reproducibility of the job. If a seed is not specified, one will be generated for you. Overrides config file.',
											args: [
												{
													name: 'seed',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID (enables implicit init if environment not configured)',
											args: [
												{
													name: 'subscription',
												},
											],
										},
										{
											name: ['--suffix', '-x'],
											description: 'An optional string of up to 64 characters that will be added to your fine-tuned model name. Overrides config file.',
											args: [
												{
													name: 'suffix',
												},
											],
										},
										{
											name: ['--training-file', '-t'],
											description: 'Training file ID or local path. Use \'local:\' prefix for local paths. Required if --file is not provided',
											args: [
												{
													name: 'training-file',
												},
											],
										},
										{
											name: ['--validation-file', '-v'],
											description: 'Validation file ID or local path. Use \'local:\' prefix for local paths.',
											args: [
												{
													name: 'validation-file',
												},
											],
										},
									],
								},
							],
							options: [
								{
									name: ['--project-endpoint', '-e'],
									description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--subscription', '-s'],
									description: 'Azure subscription ID (enables implicit init if environment not configured)',
									args: [
										{
											name: 'subscription',
										},
									],
								},
							],
						},
						{
							name: ['version'],
							description: 'Prints the version of the application',
						},
					],
				},
				{
					name: ['inspector'],
					description: 'Browser-based inspector UI for locally running Foundry agents. (Preview)',
					subcommands: [
						{
							name: ['launch'],
							description: 'Launch the Agent Inspector UI in a browser, pointed at a local agent.',
							options: [
								{
									name: ['--conversation-id'],
									description: 'Optional explicit conversation ID for the SPA. If omitted, the SPA mints a fresh UUID.',
									args: [
										{
											name: 'conversation-id',
										},
									],
								},
								{
									name: ['--inspector-port'],
									description: 'Port the Agent Inspector UI listens on (default: 8087)',
									args: [
										{
											name: 'inspector-port',
										},
									],
								},
								{
									name: ['--port'],
									description: 'Localhost port of the agent the inspector targets (default: 8088)',
									args: [
										{
											name: 'port',
										},
									],
								},
								{
									name: ['--session-id'],
									description: 'Optional explicit session ID for the SPA. If omitted, the SPA mints a fresh UUID.',
									args: [
										{
											name: 'session-id',
										},
									],
								},
							],
						},
						{
							name: ['version'],
							description: 'Display the extension version',
						},
					],
				},
				{
					name: ['models'],
					description: 'Extension for managing custom models in Azure AI Foundry. (Preview)',
					subcommands: [
						{
							name: ['create'],
							description: 'Upload and register a custom model',
							options: [
								{
									name: ['--azcopy-path'],
									description: 'Path to azcopy binary (auto-detected if not provided)',
									args: [
										{
											name: 'azcopy-path',
										},
									],
								},
								{
									name: ['--base-model'],
									description: 'Base model identifier (e.g., FW-GPT-OSS-120B or full azureml:// URI)',
									args: [
										{
											name: 'base-model',
										},
									],
								},
								{
									name: ['--description'],
									description: 'Model description',
									args: [
										{
											name: 'description',
										},
									],
								},
								{
									name: ['--lora-alpha'],
									description: 'LoRA scaling factor (alpha) — required when --weight-type is LoRA',
									args: [
										{
											name: 'lora-alpha',
										},
									],
								},
								{
									name: ['--lora-dropout'],
									description: 'LoRA dropout rate used during training (informational)',
									args: [
										{
											name: 'lora-dropout',
										},
									],
								},
								{
									name: ['--lora-rank'],
									description: 'LoRA rank (r) — required when --weight-type is LoRA',
									args: [
										{
											name: 'lora-rank',
										},
									],
								},
								{
									name: ['--lora-target-modules'],
									description: 'Comma-separated list of target modules (e.g., "q_proj,v_proj,k_proj,o_proj")',
									args: [
										{
											name: 'lora-target-modules',
										},
									],
								},
								{
									name: ['--name', '-n'],
									description: 'Model name (required)',
									args: [
										{
											name: 'name',
										},
									],
								},
								{
									name: ['--no-wait'],
									description: 'Start async registration and return immediately with the operation URL',
								},
								{
									name: ['--project-endpoint'],
									description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--publisher'],
									description: 'Model publisher ID for catalog info (e.g., Fireworks)',
									args: [
										{
											name: 'publisher',
										},
									],
								},
								{
									name: ['--source'],
									description: 'Local path or remote URL to model files',
									args: [
										{
											name: 'source',
										},
									],
								},
								{
									name: ['--source-file'],
									description: 'Path to a file containing the source URL (useful for URLs with special characters)',
									args: [
										{
											name: 'source-file',
										},
									],
								},
								{
									name: ['--subscription', '-s'],
									description: 'Azure subscription ID',
									args: [
										{
											name: 'subscription',
										},
									],
								},
								{
									name: ['--version'],
									description: 'Model version',
									args: [
										{
											name: 'version',
										},
									],
								},
								{
									name: ['--weight-type'],
									description: 'Weight type (e.g., FullWeight, LoRA)',
									args: [
										{
											name: 'weight-type',
										},
									],
								},
							],
						},
						{
							name: ['custom'],
							description: 'Manage custom models in Azure AI Foundry',
							subcommands: [
								{
									name: ['create'],
									description: 'Upload and register a custom model',
									options: [
										{
											name: ['--azcopy-path'],
											description: 'Path to azcopy binary (auto-detected if not provided)',
											args: [
												{
													name: 'azcopy-path',
												},
											],
										},
										{
											name: ['--base-model'],
											description: 'Base model identifier (e.g., FW-GPT-OSS-120B or full azureml:// URI)',
											args: [
												{
													name: 'base-model',
												},
											],
										},
										{
											name: ['--description'],
											description: 'Model description',
											args: [
												{
													name: 'description',
												},
											],
										},
										{
											name: ['--lora-alpha'],
											description: 'LoRA scaling factor (alpha) — required when --weight-type is LoRA',
											args: [
												{
													name: 'lora-alpha',
												},
											],
										},
										{
											name: ['--lora-dropout'],
											description: 'LoRA dropout rate used during training (informational)',
											args: [
												{
													name: 'lora-dropout',
												},
											],
										},
										{
											name: ['--lora-rank'],
											description: 'LoRA rank (r) — required when --weight-type is LoRA',
											args: [
												{
													name: 'lora-rank',
												},
											],
										},
										{
											name: ['--lora-target-modules'],
											description: 'Comma-separated list of target modules (e.g., "q_proj,v_proj,k_proj,o_proj")',
											args: [
												{
													name: 'lora-target-modules',
												},
											],
										},
										{
											name: ['--name', '-n'],
											description: 'Model name (required)',
											args: [
												{
													name: 'name',
												},
											],
										},
										{
											name: ['--no-wait'],
											description: 'Start async registration and return immediately with the operation URL',
										},
										{
											name: ['--project-endpoint'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--publisher'],
											description: 'Model publisher ID for catalog info (e.g., Fireworks)',
											args: [
												{
													name: 'publisher',
												},
											],
										},
										{
											name: ['--source'],
											description: 'Local path or remote URL to model files',
											args: [
												{
													name: 'source',
												},
											],
										},
										{
											name: ['--source-file'],
											description: 'Path to a file containing the source URL (useful for URLs with special characters)',
											args: [
												{
													name: 'source-file',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID',
											args: [
												{
													name: 'subscription',
												},
											],
										},
										{
											name: ['--version'],
											description: 'Model version',
											args: [
												{
													name: 'version',
												},
											],
										},
										{
											name: ['--weight-type'],
											description: 'Weight type (e.g., FullWeight, LoRA)',
											args: [
												{
													name: 'weight-type',
												},
											],
										},
									],
								},
								{
									name: ['delete'],
									description: 'Delete a custom model',
									options: [
										{
											name: ['--force', '-f'],
											description: 'Skip confirmation prompt',
											isDangerous: true,
										},
										{
											name: ['--name', '-n'],
											description: 'Model name (required)',
											args: [
												{
													name: 'name',
												},
											],
										},
										{
											name: ['--project-endpoint'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID',
											args: [
												{
													name: 'subscription',
												},
											],
										},
										{
											name: ['--version'],
											description: 'Model version',
											args: [
												{
													name: 'version',
												},
											],
										},
									],
								},
								{
									name: ['list'],
									description: 'List all custom models',
									options: [
										{
											name: ['--output', '-o'],
											description: 'Output format (table, json)',
											args: [
												{
													name: 'output',
												},
											],
										},
										{
											name: ['--project-endpoint'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--source-job-id'],
											description: 'Filter models by the training job that created them',
											args: [
												{
													name: 'source-job-id',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID',
											args: [
												{
													name: 'subscription',
												},
											],
										},
									],
								},
								{
									name: ['show'],
									description: 'Show details of a custom model',
									options: [
										{
											name: ['--name', '-n'],
											description: 'Model name (required)',
											args: [
												{
													name: 'name',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'Output format (table, json)',
											args: [
												{
													name: 'output',
												},
											],
										},
										{
											name: ['--project-endpoint'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID',
											args: [
												{
													name: 'subscription',
												},
											],
										},
										{
											name: ['--version'],
											description: 'Model version (defaults to latest)',
											args: [
												{
													name: 'version',
												},
											],
										},
									],
								},
								{
									name: ['update'],
									description: 'Update a custom model',
									options: [
										{
											name: ['--description'],
											description: 'New model description',
											args: [
												{
													name: 'description',
												},
											],
										},
										{
											name: ['--name', '-n'],
											description: 'Model name (required)',
											args: [
												{
													name: 'name',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'Output format (table, json)',
											args: [
												{
													name: 'output',
												},
											],
										},
										{
											name: ['--project-endpoint'],
											description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--remove-tag'],
											description: 'Remove a tag by key; can be specified multiple times',
											isRepeatable: true,
											args: [
												{
													name: 'remove-tag',
												},
											],
										},
										{
											name: ['--set-tag'],
											description: 'Set a tag (key=value); can be specified multiple times',
											isRepeatable: true,
											args: [
												{
													name: 'set-tag',
												},
											],
										},
										{
											name: ['--subscription', '-s'],
											description: 'Azure subscription ID',
											args: [
												{
													name: 'subscription',
												},
											],
										},
										{
											name: ['--version'],
											description: 'Model version',
											args: [
												{
													name: 'version',
												},
											],
										},
									],
								},
							],
							options: [
								{
									name: ['--project-endpoint'],
									description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--subscription', '-s'],
									description: 'Azure subscription ID',
									args: [
										{
											name: 'subscription',
										},
									],
								},
							],
						},
						{
							name: ['delete'],
							description: 'Delete a custom model',
							options: [
								{
									name: ['--force', '-f'],
									description: 'Skip confirmation prompt',
									isDangerous: true,
								},
								{
									name: ['--name', '-n'],
									description: 'Model name (required)',
									args: [
										{
											name: 'name',
										},
									],
								},
								{
									name: ['--project-endpoint'],
									description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--subscription', '-s'],
									description: 'Azure subscription ID',
									args: [
										{
											name: 'subscription',
										},
									],
								},
								{
									name: ['--version'],
									description: 'Model version',
									args: [
										{
											name: 'version',
										},
									],
								},
							],
						},
						{
							name: ['init'],
							description: 'Initialize a new AI models project. (Preview)',
							options: [
								{
									name: ['--project-endpoint'],
									description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--project-resource-id', '-p'],
									description: 'ARM resource ID of the Foundry project',
									args: [
										{
											name: 'project-resource-id',
										},
									],
								},
								{
									name: ['--subscription', '-s'],
									description: 'Azure subscription ID',
									args: [
										{
											name: 'subscription',
										},
									],
								},
							],
						},
						{
							name: ['list'],
							description: 'List all custom models',
							options: [
								{
									name: ['--output', '-o'],
									description: 'Output format (table, json)',
									args: [
										{
											name: 'output',
										},
									],
								},
								{
									name: ['--project-endpoint'],
									description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--source-job-id'],
									description: 'Filter models by the training job that created them',
									args: [
										{
											name: 'source-job-id',
										},
									],
								},
								{
									name: ['--subscription', '-s'],
									description: 'Azure subscription ID',
									args: [
										{
											name: 'subscription',
										},
									],
								},
							],
						},
						{
							name: ['show'],
							description: 'Show details of a custom model',
							options: [
								{
									name: ['--name', '-n'],
									description: 'Model name (required)',
									args: [
										{
											name: 'name',
										},
									],
								},
								{
									name: ['--output', '-o'],
									description: 'Output format (table, json)',
									args: [
										{
											name: 'output',
										},
									],
								},
								{
									name: ['--project-endpoint'],
									description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--subscription', '-s'],
									description: 'Azure subscription ID',
									args: [
										{
											name: 'subscription',
										},
									],
								},
								{
									name: ['--version'],
									description: 'Model version (defaults to latest)',
									args: [
										{
											name: 'version',
										},
									],
								},
							],
						},
						{
							name: ['update'],
							description: 'Update a custom model',
							options: [
								{
									name: ['--description'],
									description: 'New model description',
									args: [
										{
											name: 'description',
										},
									],
								},
								{
									name: ['--name', '-n'],
									description: 'Model name (required)',
									args: [
										{
											name: 'name',
										},
									],
								},
								{
									name: ['--output', '-o'],
									description: 'Output format (table, json)',
									args: [
										{
											name: 'output',
										},
									],
								},
								{
									name: ['--project-endpoint'],
									description: 'Azure AI Foundry project endpoint URL (e.g., https://account.services.ai.azure.com/api/projects/project-name)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--remove-tag'],
									description: 'Remove a tag by key; can be specified multiple times',
									isRepeatable: true,
									args: [
										{
											name: 'remove-tag',
										},
									],
								},
								{
									name: ['--set-tag'],
									description: 'Set a tag (key=value); can be specified multiple times',
									isRepeatable: true,
									args: [
										{
											name: 'set-tag',
										},
									],
								},
								{
									name: ['--subscription', '-s'],
									description: 'Azure subscription ID',
									args: [
										{
											name: 'subscription',
										},
									],
								},
								{
									name: ['--version'],
									description: 'Model version',
									args: [
										{
											name: 'version',
										},
									],
								},
							],
						},
						{
							name: ['version'],
							description: 'Prints the version of the application',
						},
					],
				},
				{
					name: ['project'],
					description: 'Manage Microsoft Foundry Project resources from your terminal. (Preview)',
					subcommands: [
						{
							name: ['context'],
							description: 'Get the context of the azd project & environment.',
						},
						{
							name: ['set'],
							description: 'Persist a default Foundry project endpoint.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
							],
						},
						{
							name: ['show'],
							description: 'Display the currently resolved Foundry project endpoint.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
							],
						},
						{
							name: ['unset'],
							description: 'Clear the persisted Foundry project endpoint.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
							],
						},
						{
							name: ['version'],
							description: 'Display the extension version',
						},
					],
				},
				{
					name: ['routine'],
					description: 'Manage Microsoft Foundry Routines from your terminal. (Preview)',
					subcommands: [
						{
							name: ['context'],
							description: 'Get the context of the azd project & environment.',
							options: [
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['create'],
							description: 'Create a new routine.',
							options: [
								{
									name: ['--action'],
									description: 'Action type: agent-response (default), agent-invoke',
									args: [
										{
											name: 'action',
										},
									],
								},
								{
									name: ['--agent-endpoint-id'],
									description: 'Agent endpoint ID (for agent-response or agent-invoke action)',
									args: [
										{
											name: 'agent-endpoint-id',
										},
									],
								},
								{
									name: ['--agent-name'],
									description: 'Project-scoped agent name (for agent-response or agent-invoke action)',
									args: [
										{
											name: 'agent-name',
										},
									],
								},
								{
									name: ['--at'],
									description: 'ISO 8601 datetime for timer trigger (e.g. \'2026-04-24T15:00:00Z\')',
									args: [
										{
											name: 'at',
										},
									],
								},
								{
									name: ['--connection-id'],
									description: 'Workspace connection ID (for github-issue trigger)',
									args: [
										{
											name: 'connection-id',
										},
									],
								},
								{
									name: ['--conversation-id'],
									description: 'Existing conversation to continue (for agent-response action, preview)',
									args: [
										{
											name: 'conversation-id',
										},
									],
								},
								{
									name: ['--cron'],
									description: '5-field cron expression for recurring trigger (minimum interval 5 minutes)',
									args: [
										{
											name: 'cron',
										},
									],
								},
								{
									name: ['--description'],
									description: 'Description for the routine',
									args: [
										{
											name: 'description',
										},
									],
								},
								{
									name: ['--enabled'],
									description: 'Whether the routine is enabled on creation',
								},
								{
									name: ['--event-name'],
									description: 'Provider-specific event name (for custom trigger)',
									args: [
										{
											name: 'event-name',
										},
									],
								},
								{
									name: ['--file'],
									description: 'Path to a YAML or JSON routine manifest file',
									args: [
										{
											name: 'file',
										},
									],
								},
								{
									name: ['--force'],
									description: 'Overwrite an existing routine with the same name (upsert)',
									isDangerous: true,
								},
								{
									name: ['--issue-event'],
									description: 'GitHub issue event: opened or closed (for github-issue trigger)',
									args: [
										{
											name: 'issue-event',
										},
									],
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--owner'],
									description: 'GitHub owner or organization (for github-issue trigger)',
									args: [
										{
											name: 'owner',
										},
									],
								},
								{
									name: ['--parameters'],
									description: 'Provider-specific trigger parameters as a JSON object (for custom trigger)',
									args: [
										{
											name: 'parameters',
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--provider'],
									description: 'External event provider (for custom trigger)',
									args: [
										{
											name: 'provider',
										},
									],
								},
								{
									name: ['--repository'],
									description: 'GitHub repository name (for github-issue trigger)',
									args: [
										{
											name: 'repository',
										},
									],
								},
								{
									name: ['--session-id'],
									description: 'Existing session to continue (for agent-invoke action)',
									args: [
										{
											name: 'session-id',
										},
									],
								},
								{
									name: ['--time-zone'],
									description: 'Time zone for the recurring trigger (e.g. \'America/New_York\')',
									args: [
										{
											name: 'time-zone',
										},
									],
								},
								{
									name: ['--trigger'],
									description: 'Trigger type: timer, recurring, github-issue, or custom (required unless --file is used)',
									args: [
										{
											name: 'trigger',
										},
									],
								},
							],
						},
						{
							name: ['delete'],
							description: 'Delete a routine.',
							options: [
								{
									name: ['--force'],
									description: 'Skip confirmation prompt (required in --no-prompt mode)',
									isDangerous: true,
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['disable'],
							description: 'Disable a routine.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['dispatch'],
							description: 'Manually trigger a routine.',
							options: [
								{
									name: ['--async'],
									description: 'Suppress descriptive output; useful for scripting',
								},
								{
									name: ['--input'],
									description: 'Payload sent to the routine dispatch. If the value parses as JSON, it is forwarded as that JSON value (object, array, number, boolean, or null); otherwise it is forwarded as a plain string.',
									args: [
										{
											name: 'input',
										},
									],
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['enable'],
							description: 'Enable a routine.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['list'],
							description: 'List all routines in the Foundry project.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['run'],
							description: 'Manage routine run history.',
							subcommands: [
								{
									name: ['list'],
									description: 'List runs for a routine.',
									options: [
										{
											name: ['--filter'],
											description: 'OData filter expression',
											args: [
												{
													name: 'filter',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['json', 'table'],
												},
											],
										},
										{
											name: ['--project-endpoint', '-p'],
											description: 'Foundry project endpoint URL (overrides env var and config)',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
										{
											name: ['--top'],
											description: 'Maximum total number of runs to return (0 = no cap)',
											args: [
												{
													name: 'top',
												},
											],
										},
									],
								},
							],
							options: [
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['show'],
							description: 'Show details of a routine.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['update'],
							description: 'Update an existing routine.',
							options: [
								{
									name: ['--agent-endpoint-id'],
									description: 'New agent endpoint ID',
									args: [
										{
											name: 'agent-endpoint-id',
										},
									],
								},
								{
									name: ['--agent-name'],
									description: 'New project-scoped agent name',
									args: [
										{
											name: 'agent-name',
										},
									],
								},
								{
									name: ['--at'],
									description: 'New ISO 8601 datetime (timer trigger only)',
									args: [
										{
											name: 'at',
										},
									],
								},
								{
									name: ['--connection-id'],
									description: 'New workspace connection ID (github-issue trigger only)',
									args: [
										{
											name: 'connection-id',
										},
									],
								},
								{
									name: ['--conversation-id'],
									description: 'New conversation to continue (preview)',
									args: [
										{
											name: 'conversation-id',
										},
									],
								},
								{
									name: ['--cron'],
									description: 'New cron expression (recurring trigger only)',
									args: [
										{
											name: 'cron',
										},
									],
								},
								{
									name: ['--description'],
									description: 'New description for the routine',
									args: [
										{
											name: 'description',
										},
									],
								},
								{
									name: ['--event-name'],
									description: 'New event name (custom trigger only)',
									args: [
										{
											name: 'event-name',
										},
									],
								},
								{
									name: ['--file'],
									description: 'Path to a YAML/JSON manifest; merged fields win unless overridden by flags',
									args: [
										{
											name: 'file',
										},
									],
								},
								{
									name: ['--issue-event'],
									description: 'New GitHub issue event: opened or closed (github-issue trigger only)',
									args: [
										{
											name: 'issue-event',
										},
									],
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--owner'],
									description: 'New GitHub owner (github-issue trigger only)',
									args: [
										{
											name: 'owner',
										},
									],
								},
								{
									name: ['--parameters'],
									description: 'New parameters JSON object (custom trigger only)',
									args: [
										{
											name: 'parameters',
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--provider'],
									description: 'New external provider (custom trigger only)',
									args: [
										{
											name: 'provider',
										},
									],
								},
								{
									name: ['--repository'],
									description: 'New GitHub repository (github-issue trigger only)',
									args: [
										{
											name: 'repository',
										},
									],
								},
								{
									name: ['--session-id'],
									description: 'New session to continue',
									args: [
										{
											name: 'session-id',
										},
									],
								},
								{
									name: ['--time-zone'],
									description: 'New time zone (recurring trigger only)',
									args: [
										{
											name: 'time-zone',
										},
									],
								},
							],
						},
						{
							name: ['version'],
							description: 'Display the extension version',
							options: [
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env var and config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
					],
				},
				{
					name: ['skill'],
					description: 'Manage Microsoft Foundry skills (reusable agent behavioral guidelines) from your terminal. (Preview)',
					subcommands: [
						{
							name: ['context'],
							description: 'Get the context of the azd project & environment.',
							options: [
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env vars and global config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['create'],
							description: 'Create a new Foundry skill.',
							options: [
								{
									name: ['--description'],
									description: 'Inline mode: human-readable summary of the skill',
									args: [
										{
											name: 'description',
										},
									],
								},
								{
									name: ['--file'],
									description: 'Path to SKILL.md (.md), a ZIP package (.zip), or a directory containing SKILL.md at its root',
									args: [
										{
											name: 'file',
										},
									],
								},
								{
									name: ['--force'],
									description: 'Delete an existing skill of the same name before creating',
									isDangerous: true,
								},
								{
									name: ['--instructions'],
									description: 'Inline mode: Markdown body defining skill behavior',
									args: [
										{
											name: 'instructions',
										},
									],
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env vars and global config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['delete'],
							description: 'Delete a Foundry skill.',
							options: [
								{
									name: ['--force'],
									description: 'Skip the confirmation prompt',
									isDangerous: true,
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env vars and global config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['download'],
							description: 'Download a Foundry skill package.',
							options: [
								{
									name: ['--force'],
									description: 'Overwrite existing files in --output-dir',
									isDangerous: true,
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--output-dir'],
									description: 'Directory to write the extracted skill (default: ./.agents/skills/<name>/)',
									args: [
										{
											name: 'output-dir',
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env vars and global config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--raw'],
									description: 'Skip extraction; write the zip archive as-is to --output-dir',
								},
								{
									name: ['--version'],
									description: 'Download a specific version (defaults to the skill\'s default_version)',
									args: [
										{
											name: 'version',
										},
									],
								},
							],
						},
						{
							name: ['list'],
							description: 'List Foundry skills in the project.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env vars and global config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['show'],
							description: 'Show metadata for a Foundry skill.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env vars and global config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['update'],
							description: 'Create a new default version for a Foundry skill.',
							options: [
								{
									name: ['--description'],
									description: 'New human-readable summary for the next version',
									args: [
										{
											name: 'description',
										},
									],
								},
								{
									name: ['--file'],
									description: 'Path to a SKILL.md file, a .zip archive, or a directory whose contents become the next version. Archives and directories must contain a SKILL.md at the root.',
									args: [
										{
											name: 'file',
										},
									],
								},
								{
									name: ['--instructions'],
									description: 'New Markdown instructions body for the next version',
									args: [
										{
											name: 'instructions',
										},
									],
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['json', 'table'],
										},
									],
								},
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env vars and global config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--set-default-version'],
									description: 'Set the skill\'s default_version to an existing version without uploading new content',
									args: [
										{
											name: 'set-default-version',
										},
									],
								},
							],
						},
						{
							name: ['version'],
							description: 'Print the extension version.',
							options: [
								{
									name: ['--project-endpoint', '-p'],
									description: 'Foundry project endpoint URL (overrides env vars and global config)',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
					],
				},
				{
					name: ['toolbox'],
					description: 'Manage Microsoft Foundry Toolboxes from your terminal. (Preview)',
					subcommands: [
						{
							name: ['connection'],
							description: 'Manage the connection-backed tools attached to a toolbox.',
							subcommands: [
								{
									name: ['add'],
									description: 'Attach one or more connections to a toolbox.',
									options: [
										{
											name: ['--from-file'],
											description: 'Path to a JSON/YAML file describing the connections to add (see --help for the file shape).',
											args: [
												{
													name: 'from-file',
												},
											],
										},
										{
											name: ['--index'],
											description: 'Search index name. Only valid for CognitiveSearch (Azure AI Search) connections; required there.',
											args: [
												{
													name: 'index',
												},
											],
										},
										{
											name: ['--instance-name'],
											description: 'Bing custom-search configuration name. Only valid for GroundingWithCustomSearch connections; required there.',
											args: [
												{
													name: 'instance-name',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['table', 'json'],
												},
											],
										},
										{
											name: ['--project-endpoint'],
											description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
									],
								},
								{
									name: ['list'],
									description: 'List the connection-backed tools attached to a toolbox.',
									options: [
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['table', 'json'],
												},
											],
										},
										{
											name: ['--project-endpoint'],
											description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
									],
								},
								{
									name: ['remove'],
									description: 'Detach one or more connections from a toolbox.',
									options: [
										{
											name: ['--force'],
											description: 'Skip confirmation prompts and apply the removal immediately.',
											isDangerous: true,
										},
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['table', 'json'],
												},
											],
										},
										{
											name: ['--project-endpoint'],
											description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
									],
								},
							],
							options: [
								{
									name: ['--project-endpoint'],
									description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['create'],
							description: 'Create a toolbox and its initial version from a file.',
							options: [
								{
									name: ['--from-file'],
									description: 'Path to a JSON/YAML file describing the initial version (see --help for the file shape).',
									args: [
										{
											name: 'from-file',
										},
									],
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['table', 'json'],
										},
									],
								},
								{
									name: ['--project-endpoint'],
									description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['delete'],
							description: 'Delete a toolbox or a single version.',
							options: [
								{
									name: ['--force'],
									description: 'Skip confirmation prompts and override safety checks where allowed.',
									isDangerous: true,
								},
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['table', 'json'],
										},
									],
								},
								{
									name: ['--project-endpoint'],
									description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--version'],
									description: 'Delete a single version instead of the whole toolbox.',
									args: [
										{
											name: 'version',
										},
									],
								},
							],
						},
						{
							name: ['list'],
							description: 'List toolboxes on the project.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['table', 'json'],
										},
									],
								},
								{
									name: ['--project-endpoint'],
									description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['publish'],
							description: 'Set the default version for a toolbox.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['table', 'json'],
										},
									],
								},
								{
									name: ['--project-endpoint'],
									description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['show'],
							description: 'Show a toolbox version, including its computed MCP endpoint.',
							options: [
								{
									name: ['--output', '-o'],
									description: 'The output format',
									args: [
										{
											name: 'output',
											suggestions: ['table', 'json'],
										},
									],
								},
								{
									name: ['--project-endpoint'],
									description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
								{
									name: ['--version'],
									description: 'Specific version to show. Defaults to the server\'s default version.',
									args: [
										{
											name: 'version',
										},
									],
								},
							],
						},
						{
							name: ['skill'],
							description: 'Manage skill references attached to a toolbox.',
							subcommands: [
								{
									name: ['add'],
									description: 'Attach one or more skill references to a toolbox.',
									options: [
										{
											name: ['--from-file'],
											description: 'Path to a JSON/YAML file listing skills to attach (skills[] block).',
											args: [
												{
													name: 'from-file',
												},
											],
										},
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['table', 'json'],
												},
											],
										},
										{
											name: ['--project-endpoint'],
											description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
									],
								},
								{
									name: ['list'],
									description: 'List the skill references attached to a toolbox.',
									options: [
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['table', 'json'],
												},
											],
										},
										{
											name: ['--project-endpoint'],
											description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
									],
								},
								{
									name: ['remove'],
									description: 'Detach one or more skill references from a toolbox.',
									options: [
										{
											name: ['--force'],
											description: 'Skip confirmation prompts and apply the removal immediately.',
											isDangerous: true,
										},
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['table', 'json'],
												},
											],
										},
										{
											name: ['--project-endpoint'],
											description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
									],
								},
							],
							options: [
								{
									name: ['--project-endpoint'],
									description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['version'],
							description: 'Display the extension version',
							options: [
								{
									name: ['--project-endpoint'],
									description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
						{
							name: ['versions'],
							description: 'Inspect toolbox versions.',
							subcommands: [
								{
									name: ['list'],
									description: 'List published versions for a toolbox.',
									options: [
										{
											name: ['--output', '-o'],
											description: 'The output format',
											args: [
												{
													name: 'output',
													suggestions: ['table', 'json'],
												},
											],
										},
										{
											name: ['--project-endpoint'],
											description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
											args: [
												{
													name: 'project-endpoint',
												},
											],
										},
									],
								},
							],
							options: [
								{
									name: ['--project-endpoint'],
									description: 'Foundry project endpoint URL. When unset, falls back to the active azd environment, azd user config, then FOUNDRY_PROJECT_ENDPOINT.',
									args: [
										{
											name: 'project-endpoint',
										},
									],
								},
							],
						},
					],
				},
			],
		},
		{
			name: ['appservice'],
			description: 'Extension for managing Azure App Service resources.',
			subcommands: [
				{
					name: ['swap'],
					description: 'Swap deployment slots for an App Service.',
					options: [
						{
							name: ['--dst'],
							description: 'The destination slot name. Use \'production\' for main app.',
							args: [
								{
									name: 'dst',
								},
							],
						},
						{
							name: ['--service'],
							description: 'The name of the service to swap slots for.',
							args: [
								{
									name: 'service',
								},
							],
						},
						{
							name: ['--src'],
							description: 'The source slot name. Use \'production\' for main app.',
							args: [
								{
									name: 'src',
								},
							],
						},
					],
				},
				{
					name: ['version'],
					description: 'Display the version of the extension.',
				},
			],
		},
		{
			name: ['auth'],
			description: 'Authenticate with Azure.',
			subcommands: [
				{
					name: ['login'],
					description: 'Log in to Azure.',
					options: [
						{
							name: ['--check-status'],
							description: 'Checks the log-in status instead of logging in.',
						},
						{
							name: ['--client-certificate'],
							description: 'The path to the client certificate for the service principal to authenticate with.',
							args: [
								{
									name: 'client-certificate',
								},
							],
						},
						{
							name: ['--client-id'],
							description: 'The client id for the service principal to authenticate with.',
							args: [
								{
									name: 'client-id',
								},
							],
						},
						{
							name: ['--client-secret'],
							description: 'The client secret for the service principal to authenticate with. Set to the empty string to read the value from the console.',
							args: [
								{
									name: 'client-secret',
								},
							],
						},
						{
							name: ['--federated-credential-provider'],
							description: 'The provider to use to acquire a federated token to authenticate with. Supported values: github, azure-pipelines, oidc',
							args: [
								{
									name: 'federated-credential-provider',
									suggestions: ['github', 'azure-pipelines', 'oidc'],
								},
							],
						},
						{
							name: ['--managed-identity'],
							description: 'Use a managed identity to authenticate.',
						},
						{
							name: ['--redirect-port'],
							description: 'Choose the port to be used as part of the redirect URI during interactive login.',
							args: [
								{
									name: 'redirect-port',
								},
							],
						},
						{
							name: ['--tenant-id'],
							description: 'The tenant id or domain name to authenticate with.',
							args: [
								{
									name: 'tenant-id',
								},
							],
						},
						{
							name: ['--use-device-code'],
							description: 'When true, log in by using a device code instead of a browser.',
						},
					],
				},
				{
					name: ['logout'],
					description: 'Log out of Azure.',
				},
				{
					name: ['status'],
					description: 'Show the current authentication status.',
				},
			],
		},
		{
			name: ['coding-agent'],
			description: 'This extension configures GitHub Copilot Coding Agent access to Azure',
			subcommands: [
				{
					name: ['config'],
					description: 'Configure the GitHub Copilot coding agent to access Azure resources via the Azure MCP',
					options: [
						{
							name: ['--branch-name'],
							description: 'The branch name to use when pushing changes to the copilot-setup-steps.yml',
							args: [
								{
									name: 'branch-name',
								},
							],
						},
						{
							name: ['--github-host-name'],
							description: 'The hostname to use with GitHub commands',
							args: [
								{
									name: 'github-host-name',
								},
							],
						},
						{
							name: ['--managed-identity-name'],
							description: 'The name to use for the managed identity, if created.',
							args: [
								{
									name: 'managed-identity-name',
								},
							],
						},
						{
							name: ['--remote-name'],
							description: 'The name of the git remote where the Copilot Coding Agent will run (ex: <owner>/<repo>)',
							args: [
								{
									name: 'remote-name',
								},
							],
						},
						{
							name: ['--roles'],
							description: 'The roles to assign to the service principal or managed identity. By default, the service principal or managed identity will be granted the Reader role.',
							isRepeatable: true,
							args: [
								{
									name: 'roles',
								},
							],
						},
					],
				},
				{
					name: ['version'],
					description: 'Prints the version of the application',
				},
			],
		},
		{
			name: ['completion'],
			description: 'Generate shell completion scripts.',
			subcommands: [
				{
					name: ['bash'],
					description: 'Generate bash completion script.',
				},
				{
					name: ['fig'],
					description: 'Generate Fig autocomplete spec.',
					options: [
						{
							name: ['--include-help-subcommands'],
							description: 'Include subcommands under the help command in the Fig spec',
						},
					],
				},
				{
					name: ['fish'],
					description: 'Generate fish completion script.',
				},
				{
					name: ['powershell'],
					description: 'Generate PowerShell completion script.',
				},
				{
					name: ['zsh'],
					description: 'Generate zsh completion script.',
				},
			],
		},
		{
			name: ['concurx'],
			description: 'Concurrent execution for azd deployment',
			subcommands: [
				{
					name: ['up'],
					description: 'Runs azd up in concurrent mode',
				},
				{
					name: ['version'],
					description: 'Prints the version of the application',
				},
			],
		},
		{
			name: ['config'],
			description: 'Manage azd configurations (ex: default Azure subscription, location).',
			subcommands: [
				{
					name: ['get'],
					description: 'Gets a configuration.',
					args: {
						name: 'path',
						generators: azdGenerators.listConfigKeys,
					},
				},
				{
					name: ['list-alpha'],
					description: 'Display the list of available features in alpha stage.',
				},
				{
					name: ['options'],
					description: 'List all available configuration settings.',
				},
				{
					name: ['reset'],
					description: 'Resets configuration to default.',
					options: [
						{
							name: ['--force', '-f'],
							description: 'Force reset without confirmation.',
							isDangerous: true,
						},
					],
				},
				{
					name: ['set'],
					description: 'Sets a configuration.',
					args: [
						{
							name: 'path',
							generators: azdGenerators.listConfigKeys,
						},
						{
							name: 'value',
						},
					],
				},
				{
					name: ['show'],
					description: 'Show all the configuration values.',
				},
				{
					name: ['sub-filter'],
					description: 'Manage subscription filters for tenant-scoped subscription prompts.',
					subcommands: [
						{
							name: ['remove'],
							description: 'Remove a saved subscription filter for a tenant.',
						},
						{
							name: ['set'],
							description: 'Set a subscription filter for a tenant.',
						},
					],
				},
				{
					name: ['unset'],
					description: 'Unsets a configuration.',
					args: {
						name: 'path',
						generators: azdGenerators.listConfigKeys,
					},
				},
			],
		},
		{
			name: ['copilot'],
			description: 'Manage GitHub Copilot agent settings. (Preview)',
			subcommands: [
				{
					name: ['consent'],
					description: 'Manage tool consent.',
					subcommands: [
						{
							name: ['grant'],
							description: 'Grant consent trust rules.',
							options: [
								{
									name: ['--action'],
									description: 'Action type: \'all\' or \'readonly\'',
									args: [
										{
											name: 'action',
											suggestions: ['all', 'readonly'],
										},
									],
								},
								{
									name: ['--global'],
									description: 'Apply globally to all servers',
								},
								{
									name: ['--operation'],
									description: 'Operation type: \'tool\' or \'sampling\'',
									args: [
										{
											name: 'operation',
											suggestions: ['tool', 'sampling'],
										},
									],
								},
								{
									name: ['--permission'],
									description: 'Permission: \'allow\', \'deny\', or \'prompt\'',
									args: [
										{
											name: 'permission',
											suggestions: ['allow', 'deny', 'prompt'],
										},
									],
								},
								{
									name: ['--scope'],
									description: 'Rule scope: \'global\', or \'project\'',
									args: [
										{
											name: 'scope',
											suggestions: ['global', 'project'],
										},
									],
								},
								{
									name: ['--server'],
									description: 'Server name',
									args: [
										{
											name: 'server',
										},
									],
								},
								{
									name: ['--tool'],
									description: 'Specific tool name (requires --server)',
									args: [
										{
											name: 'tool',
										},
									],
								},
							],
						},
						{
							name: ['list'],
							description: 'List consent rules.',
							options: [
								{
									name: ['--action'],
									description: 'Action type to filter by (all, readonly)',
									args: [
										{
											name: 'action',
											suggestions: ['all', 'readonly'],
										},
									],
								},
								{
									name: ['--operation'],
									description: 'Operation to filter by (tool, sampling)',
									args: [
										{
											name: 'operation',
											suggestions: ['tool', 'sampling'],
										},
									],
								},
								{
									name: ['--permission'],
									description: 'Permission to filter by (allow, deny, prompt)',
									args: [
										{
											name: 'permission',
											suggestions: ['allow', 'deny', 'prompt'],
										},
									],
								},
								{
									name: ['--scope'],
									description: 'Consent scope to filter by (global, project). If not specified, lists rules from all scopes.',
									args: [
										{
											name: 'scope',
											suggestions: ['global', 'project'],
										},
									],
								},
								{
									name: ['--target'],
									description: 'Specific target to operate on (server/tool format)',
									args: [
										{
											name: 'target',
										},
									],
								},
							],
						},
						{
							name: ['revoke'],
							description: 'Revoke consent rules.',
							options: [
								{
									name: ['--action'],
									description: 'Action type to filter by (all, readonly)',
									args: [
										{
											name: 'action',
											suggestions: ['all', 'readonly'],
										},
									],
								},
								{
									name: ['--operation'],
									description: 'Operation to filter by (tool, sampling)',
									args: [
										{
											name: 'operation',
											suggestions: ['tool', 'sampling'],
										},
									],
								},
								{
									name: ['--permission'],
									description: 'Permission to filter by (allow, deny, prompt)',
									args: [
										{
											name: 'permission',
											suggestions: ['allow', 'deny', 'prompt'],
										},
									],
								},
								{
									name: ['--scope'],
									description: 'Consent scope to filter by (global, project). If not specified, revokes rules from all scopes.',
									args: [
										{
											name: 'scope',
											suggestions: ['global', 'project'],
										},
									],
								},
								{
									name: ['--target'],
									description: 'Specific target to operate on (server/tool format)',
									args: [
										{
											name: 'target',
										},
									],
								},
							],
						},
					],
				},
			],
		},
		{
			name: ['demo'],
			description: 'This extension provides examples of the azd extension framework.',
			subcommands: [
				{
					name: ['ai'],
					description: 'Interactive AI model discovery, deployment, and quota demos.',
					subcommands: [
						{
							name: ['deployment'],
							description: 'Select model/version/SKU/capacity and resolve a valid deployment configuration.',
						},
						{
							name: ['models'],
							description: 'Browse available AI models interactively.',
						},
						{
							name: ['quota'],
							description: 'View usage meters and limits for a selected location.',
						},
					],
				},
				{
					name: ['colors', 'colours'],
					description: 'Displays all ASCII colors with their standard and high-intensity variants.',
				},
				{
					name: ['config'],
					description: 'Set up monitoring configuration for the project and services',
				},
				{
					name: ['context'],
					description: 'Get the context of the azd project & environment.',
				},
				{
					name: ['gh-url-parse'],
					description: 'Parse a GitHub URL and extract repository information.',
				},
				{
					name: ['listen'],
					description: 'Starts the extension and listens for events.',
				},
				{
					name: ['mcp'],
					description: 'MCP server commands for demo extension',
					subcommands: [
						{
							name: ['start'],
							description: 'Start MCP server with demo tools',
						},
					],
				},
				{
					name: ['prompt'],
					description: 'Examples of prompting the user for input.',
				},
				{
					name: ['version'],
					description: 'Prints the version of the application',
				},
			],
		},
		{
			name: ['deploy'],
			description: 'Deploy your project code to Azure.',
			options: [
				{
					name: ['--all'],
					description: 'Deploys all services that are listed in azure.yaml',
				},
				{
					name: ['--from-package'],
					description: 'Deploys the packaged service located at the provided path. Supports zipped file packages (file path) or container images (image tag).',
					args: [
						{
							name: 'file-path|image-tag',
						},
					],
				},
				{
					name: ['--timeout'],
					description: 'Maximum time in seconds for azd to wait for each service deployment. This stops azd from waiting but does not cancel the Azure-side deployment. (default: 1200)',
					args: [
						{
							name: 'timeout',
						},
					],
				},
			],
			args: {
				name: 'service',
				isOptional: true,
			},
		},
		{
			name: ['down'],
			description: 'Delete your project\'s Azure resources.',
			options: [
				{
					name: ['--force'],
					description: 'Does not require confirmation before it deletes resources.',
					isDangerous: true,
				},
				{
					name: ['--purge'],
					description: 'Does not require confirmation before it permanently deletes resources that are soft-deleted by default (for example, key vaults).',
					isDangerous: true,
				},
			],
			args: {
				name: 'layer',
				isOptional: true,
			},
		},
		{
			name: ['env'],
			description: 'Manage environments (ex: default environment, environment variables).',
			subcommands: [
				{
					name: ['config'],
					description: 'Manage environment configuration (ex: stored in .azure/<environment>/config.json).',
					subcommands: [
						{
							name: ['get'],
							description: 'Gets a configuration value from the environment.',
							args: {
								name: 'path',
							},
						},
						{
							name: ['set'],
							description: 'Sets a configuration value in the environment.',
							args: [
								{
									name: 'path',
								},
								{
									name: 'value',
								},
							],
						},
						{
							name: ['unset'],
							description: 'Unsets a configuration value in the environment.',
							args: {
								name: 'path',
							},
						},
					],
				},
				{
					name: ['get-value'],
					description: 'Get specific environment value.',
					args: {
						name: 'keyName',
						generators: azdGenerators.listEnvironmentVariables,
					},
				},
				{
					name: ['get-values'],
					description: 'Get all environment values.',
				},
				{
					name: ['list', 'ls'],
					description: 'List environments.',
				},
				{
					name: ['new'],
					description: 'Create a new environment and set it as the default.',
					options: [
						{
							name: ['--location', '-l'],
							description: 'Azure location for the new environment',
							args: [
								{
									name: 'location',
								},
							],
						},
						{
							name: ['--subscription'],
							description: 'ID of an Azure subscription to use for the new environment',
							args: [
								{
									name: 'subscription',
								},
							],
						},
					],
					args: {
						name: 'environment',
					},
				},
				{
					name: ['refresh'],
					description: 'Refresh environment values by using information from a previous infrastructure provision.',
					options: [
						{
							name: ['--hint'],
							description: 'Hint to help identify the environment to refresh',
							args: [
								{
									name: 'hint',
								},
							],
						},
						{
							name: ['--layer'],
							description: 'Provisioning layer to refresh the environment from.',
							args: [
								{
									name: 'layer',
								},
							],
						},
					],
					args: {
						name: 'environment',
					},
				},
				{
					name: ['remove', 'rm'],
					description: 'Remove an environment.',
					options: [
						{
							name: ['--force'],
							description: 'Skips confirmation before performing removal.',
							isDangerous: true,
						},
					],
					args: {
						name: 'environment',
					},
				},
				{
					name: ['select'],
					description: 'Set the default environment.',
					args: {
						name: 'environment',
						isOptional: true,
						generators: azdGenerators.listEnvironments,
					},
				},
				{
					name: ['set'],
					description: 'Set one or more environment values.',
					options: [
						{
							name: ['--file'],
							description: 'Path to .env formatted file to load environment values from.',
							args: [
								{
									name: 'file',
								},
							],
						},
					],
					args: [
						{
							name: 'key',
							isOptional: true,
						},
						{
							name: 'value',
							isOptional: true,
						},
					],
				},
				{
					name: ['set-secret'],
					description: 'Set a name as a reference to a Key Vault secret in the environment.',
					args: {
						name: 'name',
					},
				},
			],
		},
		{
			name: ['exec'],
			description: 'Execute commands and scripts with azd environment context.',
			options: [
				{
					name: ['--interactive', '-i'],
					description: 'Run in interactive mode (connect stdin)',
				},
				{
					name: ['--shell', '-s'],
					description: 'Shell to use (bash, sh, zsh, pwsh, powershell, cmd). Auto-detected if not specified.',
					args: [
						{
							name: 'shell',
						},
					],
				},
			],
			args: [
				{
					name: 'command',
					isOptional: true,
				},
				{
					name: 'args...',
					isOptional: true,
				},
				{
					name: 'script-args...',
				},
			],
		},
		{
			name: ['extension', 'ext'],
			description: 'Manage azd extensions.',
			subcommands: [
				{
					name: ['install'],
					description: 'Installs specified extensions.',
					options: [
						{
							name: ['--force', '-f'],
							description: 'Force installation, including downgrades and reinstalls',
							isDangerous: true,
						},
						{
							name: ['--source', '-s'],
							description: 'The extension source to use for installs',
							args: [
								{
									name: 'source',
								},
							],
						},
						{
							name: ['--version', '-v'],
							description: 'The version of the extension to install',
							args: [
								{
									name: 'version',
								},
							],
						},
					],
					args: {
						name: 'extension-id|extension-bundle.zip',
						generators: [azdGenerators.listExtensions, filepaths({ extensions: ['zip'] })],
					},
				},
				{
					name: ['list'],
					description: 'List available extensions.',
					options: [
						{
							name: ['--installed'],
							description: 'List installed extensions',
						},
						{
							name: ['--source'],
							description: 'Filter extensions by source',
							args: [
								{
									name: 'source',
								},
							],
						},
						{
							name: ['--tags'],
							description: 'Filter extensions by tags',
							isRepeatable: true,
							args: [
								{
									name: 'tags',
								},
							],
						},
					],
				},
				{
					name: ['show'],
					description: 'Show details for a specific extension.',
					options: [
						{
							name: ['--source', '-s'],
							description: 'The extension source to use.',
							args: [
								{
									name: 'source',
								},
							],
						},
					],
					args: {
						name: 'extension-id',
						generators: azdGenerators.listExtensions,
					},
				},
				{
					name: ['source'],
					description: 'View and manage extension sources',
					subcommands: [
						{
							name: ['add'],
							description: 'Add an extension source with the specified name',
							options: [
								{
									name: ['--location', '-l'],
									description: 'The location of the extension source',
									args: [
										{
											name: 'location',
										},
									],
								},
								{
									name: ['--name', '-n'],
									description: 'The name of the extension source',
									args: [
										{
											name: 'name',
										},
									],
								},
								{
									name: ['--type', '-t'],
									description: 'The type of the extension source. Supported types are \'file\' and \'url\'',
									args: [
										{
											name: 'type',
										},
									],
								},
							],
						},
						{
							name: ['list'],
							description: 'List extension sources',
						},
						{
							name: ['remove'],
							description: 'Remove an extension source with the specified name',
							args: {
								name: 'name',
							},
						},
						{
							name: ['validate'],
							description: 'Validate an extension source\'s registry.json file.',
							options: [
								{
									name: ['--strict'],
									description: 'Enable strict validation (require checksums)',
								},
							],
							args: {
								name: 'name-or-path-or-url',
							},
						},
					],
				},
				{
					name: ['uninstall'],
					description: 'Uninstall specified extensions.',
					options: [
						{
							name: ['--all'],
							description: 'Uninstall all installed extensions',
						},
					],
					args: {
						name: 'extension-id',
						isOptional: true,
						generators: azdGenerators.listInstalledExtensions,
					},
				},
				{
					name: ['upgrade'],
					description: 'Upgrade installed extensions to the latest version.',
					options: [
						{
							name: ['--all'],
							description: 'Upgrade all installed extensions',
						},
						{
							name: ['--no-dependency-upgrades'],
							description: 'Do not upgrade dependencies when upgrading an extension that has dependencies',
						},
						{
							name: ['--source', '-s'],
							description: 'The extension source to use for upgrades',
							args: [
								{
									name: 'source',
								},
							],
						},
						{
							name: ['--version', '-v'],
							description: 'The version of the extension to upgrade to',
							args: [
								{
									name: 'version',
								},
							],
						},
					],
					args: {
						name: 'extension-id',
						isOptional: true,
						generators: azdGenerators.listInstalledExtensions,
					},
				},
			],
		},
		{
			name: ['hooks'],
			description: 'Develop, test and run hooks for a project.',
			subcommands: [
				{
					name: ['run'],
					description: 'Runs the specified hook for the project, provisioning layers, and services',
					options: [
						{
							name: ['--layer'],
							description: 'Only runs hooks for the specified provisioning layer.',
							args: [
								{
									name: 'layer',
								},
							],
						},
						{
							name: ['--platform'],
							description: 'Forces hooks to run for the specified platform.',
							args: [
								{
									name: 'platform',
								},
							],
						},
						{
							name: ['--service'],
							description: 'Only runs hooks for the specified service.',
							args: [
								{
									name: 'service',
								},
							],
						},
					],
					args: {
						name: 'name',
						suggestions: [
							'prebuild',
							'postbuild',
							'predeploy',
							'postdeploy',
							'predown',
							'postdown',
							'prepackage',
							'postpackage',
							'preprovision',
							'postprovision',
							'prepublish',
							'postpublish',
							'prerestore',
							'postrestore',
							'preup',
							'postup',
						],
					},
				},
			],
		},
		{
			name: ['infra'],
			description: 'Manage your Infrastructure as Code (IaC).',
			subcommands: [
				{
					name: ['generate', 'gen', 'synth'],
					description: 'Write IaC for your project to disk, allowing you to manually manage it.',
					options: [
						{
							name: ['--force'],
							description: 'Overwrite any existing files without prompting',
							isDangerous: true,
						},
					],
				},
			],
		},
		{
			name: ['init'],
			description: 'Initialize a new application.',
			options: [
				{
					name: ['--branch', '-b'],
					description: 'The template branch to initialize from. Must be used with a template argument (--template or -t).',
					args: [
						{
							name: 'branch',
						},
					],
				},
				{
					name: ['--filter', '-f'],
					description: 'The tag(s) used to filter template results. Supports comma-separated values.',
					isRepeatable: true,
					args: [
						{
							name: 'filter',
							generators: azdGenerators.listTemplateTags,
						},
					],
				},
				{
					name: ['--from-code'],
					description: 'Initializes a new application from your existing code.',
				},
				{
					name: ['--location', '-l'],
					description: 'Azure location for the new environment',
					args: [
						{
							name: 'location',
						},
					],
				},
				{
					name: ['--minimal', '-m'],
					description: 'Initializes a minimal project.',
				},
				{
					name: ['--subscription', '-s'],
					description: 'ID of an Azure subscription to use for the new environment',
					args: [
						{
							name: 'subscription',
						},
					],
				},
				{
					name: ['--template', '-t'],
					description: 'Initializes a new application from a template. You can use a Full URI, <owner>/<repository>, <repository> if it\'s part of the azure-samples organization, or a local directory path (./dir, ../dir, or absolute path).',
					args: [
						{
							name: 'template',
							generators: azdGenerators.listTemplatesFiltered,
						},
					],
				},
				{
					name: ['--up'],
					description: 'Provision and deploy to Azure after initializing the project from a template.',
				},
			],
		},
		{
			name: ['mcp'],
			description: 'Manage Model Context Protocol (MCP) server. (Alpha)',
			subcommands: [
				{
					name: ['start'],
					description: 'Starts the MCP server.',
				},
			],
		},
		{
			name: ['monitor'],
			description: 'Monitor a deployed project.',
			options: [
				{
					name: ['--live'],
					description: 'Open a browser to Application Insights Live Metrics. Live Metrics is currently not supported for Python apps.',
				},
				{
					name: ['--logs'],
					description: 'Open a browser to Application Insights Logs.',
				},
				{
					name: ['--overview'],
					description: 'Open a browser to Application Insights Overview Dashboard.',
				},
			],
		},
		{
			name: ['package'],
			description: 'Packages the project\'s code to be deployed to Azure.',
			options: [
				{
					name: ['--all'],
					description: 'Packages all services that are listed in azure.yaml',
				},
				{
					name: ['--output-path'],
					description: 'File or folder path where the generated packages will be saved.',
					args: [
						{
							name: 'output-path',
						},
					],
				},
			],
			args: {
				name: 'service',
				isOptional: true,
			},
		},
		{
			name: ['pipeline'],
			description: 'Manage and configure your deployment pipelines.',
			subcommands: [
				{
					name: ['config'],
					description: 'Configure your deployment pipeline to connect securely to Azure. (Beta)',
					options: [
						{
							name: ['--applicationServiceManagementReference', '-m'],
							description: 'Service Management Reference. References application or service contact information from a Service or Asset Management database. This value must be a Universally Unique Identifier (UUID). You can set this value globally by running azd config set pipeline.config.applicationServiceManagementReference <UUID>.',
							args: [
								{
									name: 'applicationServiceManagementReference',
								},
							],
						},
						{
							name: ['--auth-type'],
							description: 'The authentication type used between the pipeline provider and Azure for deployment (Only valid for GitHub provider). Valid values: federated, client-credentials.',
							args: [
								{
									name: 'auth-type',
									suggestions: ['federated', 'client-credentials'],
								},
							],
						},
						{
							name: ['--principal-id'],
							description: 'The client id of the service principal to use to grant access to Azure resources as part of the pipeline.',
							args: [
								{
									name: 'principal-id',
								},
							],
						},
						{
							name: ['--principal-name'],
							description: 'The name of the service principal to use to grant access to Azure resources as part of the pipeline.',
							args: [
								{
									name: 'principal-name',
								},
							],
						},
						{
							name: ['--principal-role'],
							description: 'The roles to assign to the service principal. By default the service principal will be granted the Contributor and User Access Administrator roles.',
							isRepeatable: true,
							args: [
								{
									name: 'principal-role',
								},
							],
						},
						{
							name: ['--provider'],
							description: 'The pipeline provider to use (github for Github Actions and azdo for Azure Pipelines).',
							args: [
								{
									name: 'provider',
									suggestions: ['github', 'azdo'],
								},
							],
						},
						{
							name: ['--remote-name'],
							description: 'The name of the git remote to configure the pipeline to run on.',
							args: [
								{
									name: 'remote-name',
								},
							],
						},
					],
				},
			],
		},
		{
			name: ['provision'],
			description: 'Provision Azure resources for your project.',
			options: [
				{
					name: ['--location', '-l'],
					description: 'Azure location for the new environment',
					args: [
						{
							name: 'location',
						},
					],
				},
				{
					name: ['--no-state'],
					description: '(Bicep only) Forces a fresh deployment based on current Bicep template files, ignoring any stored deployment state.',
				},
				{
					name: ['--preview'],
					description: 'Preview changes to Azure resources.',
				},
				{
					name: ['--subscription'],
					description: 'ID of an Azure subscription to use for the new environment',
					args: [
						{
							name: 'subscription',
						},
					],
				},
			],
			args: {
				name: 'layer',
				isOptional: true,
			},
		},
		{
			name: ['publish'],
			description: 'Publish a service to a container registry.',
			options: [
				{
					name: ['--all'],
					description: 'Publishes all services that are listed in azure.yaml',
				},
				{
					name: ['--from-package'],
					description: 'Publishes the service from a container image (image tag).',
					args: [
						{
							name: 'image-tag',
						},
					],
				},
				{
					name: ['--to'],
					description: 'The target container image in the form \'[registry/]repository[:tag]\' to publish to.',
					args: [
						{
							name: 'image-tag',
						},
					],
				},
			],
			args: {
				name: 'service',
				isOptional: true,
			},
		},
		{
			name: ['restore'],
			description: 'Restores the project\'s dependencies.',
			options: [
				{
					name: ['--all'],
					description: 'Restores all services that are listed in azure.yaml',
				},
			],
			args: {
				name: 'service',
				isOptional: true,
			},
		},
		{
			name: ['show'],
			description: 'Display information about your project and its resources.',
			options: [
				{
					name: ['--show-secrets'],
					description: 'Unmask secrets in output.',
					isDangerous: true,
				},
			],
			args: {
				name: 'resource-name|resource-id',
				isOptional: true,
			},
		},
		{
			name: ['template'],
			description: 'Find and view template details.',
			subcommands: [
				{
					name: ['list', 'ls'],
					description: 'Show list of sample azd templates. (Beta)',
					options: [
						{
							name: ['--filter', '-f'],
							description: 'The tag(s) used to filter template results. Supports comma-separated values.',
							isRepeatable: true,
							args: [
								{
									name: 'filter',
									generators: azdGenerators.listTemplateTags,
								},
							],
						},
						{
							name: ['--source', '-s'],
							description: 'Filters templates by source.',
							args: [
								{
									name: 'source',
								},
							],
						},
					],
				},
				{
					name: ['show'],
					description: 'Show details for a given template. (Beta)',
					args: {
						name: 'template',
						generators: azdGenerators.listTemplates,
					},
				},
				{
					name: ['source'],
					description: 'View and manage template sources. (Beta)',
					subcommands: [
						{
							name: ['add'],
							description: 'Adds an azd template source with the specified key. (Beta)',
							options: [
								{
									name: ['--location', '-l'],
									description: 'Location of the template source. Required when using type flag.',
									args: [
										{
											name: 'location',
										},
									],
								},
								{
									name: ['--name', '-n'],
									description: 'Display name of the template source.',
									args: [
										{
											name: 'name',
										},
									],
								},
								{
									name: ['--type', '-t'],
									description: 'Kind of the template source. Supported types are \'file\', \'url\' and \'gh\'.',
									args: [
										{
											name: 'type',
										},
									],
								},
							],
							args: {
								name: 'key',
							},
						},
						{
							name: ['list', 'ls'],
							description: 'Lists the configured azd template sources. (Beta)',
						},
						{
							name: ['remove'],
							description: 'Removes the specified azd template source (Beta)',
							args: {
								name: 'key',
							},
						},
					],
				},
			],
		},
		{
			name: ['tool'],
			description: 'Manage Azure development tools.',
			subcommands: [
				{
					name: ['check'],
					description: 'Check for tool updates.',
				},
				{
					name: ['install'],
					description: 'Install specified tools.',
					options: [
						{
							name: ['--all'],
							description: 'Install all recommended tools',
						},
						{
							name: ['--dry-run'],
							description: 'Preview what would be installed without making changes',
						},
						{
							name: ['--host'],
							description: 'Install the skill for the specified agent host(s): copilot, claude. Use --host all for every detected host (skill tools only)',
							isRepeatable: true,
							args: [
								{
									name: 'host',
								},
							],
						},
					],
					args: {
						name: 'tool-name...',
						isOptional: true,
					},
				},
				{
					name: ['list'],
					description: 'List all tools with status.',
				},
				{
					name: ['show'],
					description: 'Show details for a specific tool.',
					args: {
						name: 'tool-name',
					},
				},
				{
					name: ['uninstall'],
					description: 'Uninstall installed tools.',
					options: [
						{
							name: ['--all'],
							description: 'Uninstall all installed tools',
						},
						{
							name: ['--dry-run'],
							description: 'Preview what would be uninstalled without making changes',
						},
						{
							name: ['--host'],
							description: 'Uninstall the skill from the specified agent host(s): copilot, claude. Use --host all (or omit --host) to remove the skill from every host it is installed through (skill tools only)',
							isRepeatable: true,
							args: [
								{
									name: 'host',
								},
							],
						},
					],
					args: {
						name: 'tool-name...',
						isOptional: true,
					},
				},
				{
					name: ['upgrade'],
					description: 'Upgrade installed tools.',
					options: [
						{
							name: ['--dry-run'],
							description: 'Preview what would be upgraded without making changes',
						},
						{
							name: ['--host'],
							description: 'Upgrade the skill for the specified agent host(s): copilot, claude. Use --host all for every detected host (skill tools only)',
							isRepeatable: true,
							args: [
								{
									name: 'host',
								},
							],
						},
					],
					args: {
						name: 'tool-name...',
						isOptional: true,
					},
				},
			],
		},
		{
			name: ['up'],
			description: 'Provision and deploy your project to Azure with a single command.',
			options: [
				{
					name: ['--location', '-l'],
					description: 'Azure location for the new environment',
					args: [
						{
							name: 'location',
						},
					],
				},
				{
					name: ['--subscription'],
					description: 'ID of an Azure subscription to use for the new environment',
					args: [
						{
							name: 'subscription',
						},
					],
				},
			],
		},
		{
			name: ['update'],
			description: 'Updates azd to the latest version.',
			options: [
				{
					name: ['--channel'],
					description: 'Update channel: stable or daily.',
					args: [
						{
							name: 'channel',
						},
					],
				},
				{
					name: ['--check-interval-hours'],
					description: 'Override the update check interval in hours.',
					args: [
						{
							name: 'check-interval-hours',
						},
					],
				},
			],
		},
		{
			name: ['version'],
			description: 'Print the version number of Azure Developer CLI.',
		},
		{
			name: ['x'],
			description: 'This extension provides a set of tools for azd extension developers to test and debug their extensions.',
			subcommands: [
				{
					name: ['build'],
					description: 'Build the azd extension project',
					options: [
						{
							name: ['--all'],
							description: 'When set builds for all os/platforms. Defaults to the current os/platform only.',
						},
						{
							name: ['--output', '-o'],
							description: 'Path to the output directory.',
							args: [
								{
									name: 'output',
								},
							],
						},
						{
							name: ['--skip-install'],
							description: 'When set skips reinstalling extension after successful build.',
						},
					],
				},
				{
					name: ['init'],
					description: 'Initialize a new azd extension project',
					options: [
						{
							name: ['--capabilities'],
							description: 'The list of capabilities for the extension (e.g., custom-commands,lifecycle-events,mcp-server,service-target-provider,framework-service-provider,metadata,provisioning-provider).',
							isRepeatable: true,
							args: [
								{
									name: 'capabilities',
								},
							],
						},
						{
							name: ['--codeowners'],
							description: 'GitHub handles or teams for the generated CODEOWNERS entry when --internal is set.',
							isRepeatable: true,
							args: [
								{
									name: 'codeowners',
								},
							],
						},
						{
							name: ['--id'],
							description: 'The extension identifier (e.g., company.extension).',
							args: [
								{
									name: 'id',
								},
							],
						},
						{
							name: ['--internal'],
							description: 'Scaffold Azure/azure-dev first-party extension files. Currently supports Go extensions only.',
						},
						{
							name: ['--language'],
							description: 'The programming language for the extension (go, dotnet, javascript, python).',
							args: [
								{
									name: 'language',
								},
							],
						},
						{
							name: ['--name'],
							description: 'The display name for the extension.',
							args: [
								{
									name: 'name',
								},
							],
						},
						{
							name: ['--namespace'],
							description: 'The namespace for the extension commands.',
							args: [
								{
									name: 'namespace',
								},
							],
						},
						{
							name: ['--registry', '-r'],
							description: 'When set will create a local extension source registry.',
						},
						{
							name: ['--tags'],
							description: 'Optional tags for the extension, comma-separated or repeatable (max 10 tags, 64 characters each).',
							isRepeatable: true,
							args: [
								{
									name: 'tags',
								},
							],
						},
					],
				},
				{
					name: ['pack'],
					description: 'Build and pack extension artifacts',
					options: [
						{
							name: ['--bundle'],
							description: 'Produce a single self-contained bundle (.zip) containing a registry.json and the extension artifacts, installable via \'azd extension install <bundle.zip>\'.',
						},
						{
							name: ['--input', '-i'],
							description: 'Path to the input directory.',
							args: [
								{
									name: 'input',
								},
							],
						},
						{
							name: ['--output', '-o'],
							description: 'Path to the artifacts output directory. If omitted, uses the local registry artifacts path.',
							args: [
								{
									name: 'output',
								},
							],
						},
						{
							name: ['--rebuild'],
							description: 'Rebuild the extension before packaging.',
						},
					],
				},
				{
					name: ['publish'],
					description: 'Publish the extension to the extension source',
					options: [
						{
							name: ['--artifacts'],
							description: 'Path to artifacts to process (comma-separated glob patterns, e.g. ./artifacts/*.zip,./artifacts/*.tar.gz)',
							isRepeatable: true,
							args: [
								{
									name: 'artifacts',
								},
							],
						},
						{
							name: ['--registry', '-r'],
							description: 'Path to the extension source registry',
							args: [
								{
									name: 'registry',
								},
							],
						},
						{
							name: ['--repo'],
							description: 'GitHub repository to create the release in (e.g. owner/repo)',
							args: [
								{
									name: 'repo',
								},
							],
						},
						{
							name: ['--version', '-v'],
							description: 'Version of the release',
							args: [
								{
									name: 'version',
								},
							],
						},
					],
				},
				{
					name: ['release'],
					description: 'Create a new extension release from the packaged artifacts',
					options: [
						{
							name: ['--artifacts'],
							description: 'Path to artifacts to upload to the release (comma-separated glob patterns, e.g. ./artifacts/*.zip,./artifacts/*.tar.gz)',
							isRepeatable: true,
							args: [
								{
									name: 'artifacts',
								},
							],
						},
						{
							name: ['--confirm'],
							description: 'Skip confirmation prompt',
						},
						{
							name: ['--draft', '-d'],
							description: 'Create a draft release',
						},
						{
							name: ['--notes', '-n'],
							description: 'Release notes',
							args: [
								{
									name: 'notes',
								},
							],
						},
						{
							name: ['--notes-file', '-F'],
							description: 'Read release notes from file (use "-" to read from standard input)',
							args: [
								{
									name: 'notes-file',
								},
							],
						},
						{
							name: ['--prerelease'],
							description: 'Create a pre-release version',
						},
						{
							name: ['--repo', '-r'],
							description: 'GitHub repository to create the release in (e.g. owner/repo)',
							args: [
								{
									name: 'repo',
								},
							],
						},
						{
							name: ['--title', '-t'],
							description: 'Title of the release',
							args: [
								{
									name: 'title',
								},
							],
						},
						{
							name: ['--version', '-v'],
							description: 'Version of the release',
							args: [
								{
									name: 'version',
								},
							],
						},
					],
				},
				{
					name: ['version'],
					description: 'Prints the version of the application',
				},
				{
					name: ['watch'],
					description: 'Watches the azd extension project for file changes and rebuilds it.',
				},
			],
		},
		{
			name: ['help'],
			description: 'Help about any command',
		},
	],
	options: [
		{
			name: ['--cwd', '-C'],
			description: 'Sets the current working directory.',
			isPersistent: true,
			args: [
				{
					name: 'cwd',
				},
			],
		},
		{
			name: ['--debug'],
			description: 'Enables debugging and diagnostics logging.',
			isPersistent: true,
		},
		{
			name: ['--environment', '-e'],
			description: 'The name of the environment to use.',
			isPersistent: true,
			args: [
				{
					name: 'environment',
				},
			],
		},
		{
			name: ['--no-prompt'],
			description: 'Runs without prompts. Uses existing values; fails if any required value or decision cannot be resolved automatically.',
			isPersistent: true,
		},
		{
			name: ['--docs'],
			description: 'Opens the documentation for azd in your web browser.',
			isPersistent: true,
		},
		{
			name: ['--help', '-h'],
			description: 'Gets help for azd.',
			isPersistent: true,
		},
	],
};

export default completionSpec;
