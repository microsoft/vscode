/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
					description: 'Extension for the Foundry Agent Service. (Preview)',
					subcommands: [
						{
							name: ['init'],
							description: 'Initialize a new AI agent project. (Preview)',
							options: [
								{
									name: ['--environment', '-e'],
									description: 'The name of the azd environment to use.',
									args: [
										{
											name: 'environment',
										},
									],
								},
								{
									name: ['--host'],
									description: '[Optional] For container based agents, can override the default host to target a container app instead. Accepted values: \'containerapp\'',
									args: [
										{
											name: 'host',
										},
									],
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
									name: ['--project-id', '-p'],
									description: 'Existing Microsoft Foundry Project Id to initialize your azd environment with',
									args: [
										{
											name: 'project-id',
										},
									],
								},
								{
									name: ['--src', '-s'],
									description: '[Optional] Directory to download the agent definition to (defaults to \'src/<agent-id>\')',
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
							description: 'Prints the version of the application',
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
									name: ['--environment', '-n'],
									description: 'The name of the azd environment to use.',
									args: [
										{
											name: 'environment',
										},
									],
								},
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
			name: ['demo'],
			description: 'This extension provides examples of the AZD extension framework.',
			subcommands: [
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
					description: 'Get the context of the AZD project & environment.',
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
					name: ['--environment', '-e'],
					description: 'The name of the environment to use.',
					args: [
						{
							name: 'environment',
						},
					],
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
					name: ['--environment', '-e'],
					description: 'The name of the environment to use.',
					args: [
						{
							name: 'environment',
						},
					],
				},
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
							options: [
								{
									name: ['--environment', '-e'],
									description: 'The name of the environment to use.',
									args: [
										{
											name: 'environment',
										},
									],
								},
							],
							args: {
								name: 'path',
							},
						},
						{
							name: ['set'],
							description: 'Sets a configuration value in the environment.',
							options: [
								{
									name: ['--environment', '-e'],
									description: 'The name of the environment to use.',
									args: [
										{
											name: 'environment',
										},
									],
								},
							],
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
							options: [
								{
									name: ['--environment', '-e'],
									description: 'The name of the environment to use.',
									args: [
										{
											name: 'environment',
										},
									],
								},
							],
							args: {
								name: 'path',
							},
						},
					],
				},
				{
					name: ['get-value'],
					description: 'Get specific environment value.',
					options: [
						{
							name: ['--environment', '-e'],
							description: 'The name of the environment to use.',
							args: [
								{
									name: 'environment',
								},
							],
						},
					],
					args: {
						name: 'keyName',
						generators: azdGenerators.listEnvironmentVariables,
					},
				},
				{
					name: ['get-values'],
					description: 'Get all environment values.',
					options: [
						{
							name: ['--environment', '-e'],
							description: 'The name of the environment to use.',
							args: [
								{
									name: 'environment',
								},
							],
						},
					],
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
							description: 'Name or ID of an Azure subscription to use for the new environment',
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
							name: ['--environment', '-e'],
							description: 'The name of the environment to use.',
							args: [
								{
									name: 'environment',
								},
							],
						},
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
							name: ['--environment', '-e'],
							description: 'The name of the environment to use.',
							args: [
								{
									name: 'environment',
								},
							],
						},
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
							name: ['--environment', '-e'],
							description: 'The name of the environment to use.',
							args: [
								{
									name: 'environment',
								},
							],
						},
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
					options: [
						{
							name: ['--environment', '-e'],
							description: 'The name of the environment to use.',
							args: [
								{
									name: 'environment',
								},
							],
						},
					],
					args: {
						name: 'name',
					},
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
						name: 'extension-id',
						generators: azdGenerators.listExtensions,
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
					description: 'Upgrade specified extensions.',
					options: [
						{
							name: ['--all'],
							description: 'Upgrade all installed extensions',
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
					description: 'Runs the specified hook for the project and services',
					options: [
						{
							name: ['--environment', '-e'],
							description: 'The name of the environment to use.',
							args: [
								{
									name: 'environment',
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
							name: ['--environment', '-e'],
							description: 'The name of the environment to use.',
							args: [
								{
									name: 'environment',
								},
							],
						},
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
					name: ['--environment', '-e'],
					description: 'The name of the environment to use.',
					args: [
						{
							name: 'environment',
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
					description: 'Name or ID of an Azure subscription to use for the new environment',
					args: [
						{
							name: 'subscription',
						},
					],
				},
				{
					name: ['--template', '-t'],
					description: 'Initializes a new application from a template. You can use Full URI, <owner>/<repository>, or <repository> if it\'s part of the azure-samples organization.',
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
					name: ['consent'],
					description: 'Manage MCP tool consent.',
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
									description: 'Action type to filter by (readonly, any)',
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
									description: 'Action type to filter by (readonly, any)',
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
					name: ['--environment', '-e'],
					description: 'The name of the environment to use.',
					args: [
						{
							name: 'environment',
						},
					],
				},
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
					name: ['--environment', '-e'],
					description: 'The name of the environment to use.',
					args: [
						{
							name: 'environment',
						},
					],
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
							name: ['--environment', '-e'],
							description: 'The name of the environment to use.',
							args: [
								{
									name: 'environment',
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
					name: ['--environment', '-e'],
					description: 'The name of the environment to use.',
					args: [
						{
							name: 'environment',
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
					name: ['--environment', '-e'],
					description: 'The name of the environment to use.',
					args: [
						{
							name: 'environment',
						},
					],
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
				{
					name: ['--environment', '-e'],
					description: 'The name of the environment to use.',
					args: [
						{
							name: 'environment',
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
			name: ['show'],
			description: 'Display information about your project and its resources.',
			options: [
				{
					name: ['--environment', '-e'],
					description: 'The name of the environment to use.',
					args: [
						{
							name: 'environment',
						},
					],
				},
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
			name: ['up'],
			description: 'Provision and deploy your project to Azure with a single command.',
			options: [
				{
					name: ['--environment', '-e'],
					description: 'The name of the environment to use.',
					args: [
						{
							name: 'environment',
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
			description: 'This extension provides a set of tools for AZD extension developers to test and debug their extensions.',
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
							description: 'Path to the output directory. Defaults to ./bin folder.',
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
					description: 'Initialize a new AZD extension project',
					options: [
						{
							name: ['--capabilities'],
							description: 'The list of capabilities for the extension (e.g., custom-commands,lifecycle-events,mcp-server,service-target-provider).',
							isRepeatable: true,
							args: [
								{
									name: 'capabilities',
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
					],
				},
				{
					name: ['pack'],
					description: 'Build and pack extension artifacts',
					options: [
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
							description: 'Path to the artifacts output directory. If not provided, will use local registry artifacts path.',
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
					description: 'Watches the AZD extension project for file changes and rebuilds it.',
				},
			],
		},
		{
			name: ['help'],
			description: 'Help about any command',
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
							description: 'Extension for the Foundry Agent Service. (Preview)',
							subcommands: [
								{
									name: ['init'],
									description: 'Initialize a new AI agent project. (Preview)',
								},
								{
									name: ['version'],
									description: 'Prints the version of the application',
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
								},
								{
									name: ['jobs'],
									description: 'Manage fine-tuning jobs',
									subcommands: [
										{
											name: ['cancel'],
											description: 'Cancels a running or queued fine-tuning job.',
										},
										{
											name: ['deploy'],
											description: 'Deploy a fine-tuned model to Azure Cognitive Services',
										},
										{
											name: ['list'],
											description: 'List fine-tuning jobs.',
										},
										{
											name: ['pause'],
											description: 'Pauses a running fine-tuning job.',
										},
										{
											name: ['resume'],
											description: 'Resumes a paused fine-tuning job.',
										},
										{
											name: ['show'],
											description: 'Shows detailed information about a specific job.',
										},
										{
											name: ['submit'],
											description: 'Submit fine-tuning job.',
										},
									],
								},
								{
									name: ['version'],
									description: 'Prints the version of the application',
								},
							],
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
						},
						{
							name: ['set'],
							description: 'Sets a configuration.',
						},
						{
							name: ['show'],
							description: 'Show all the configuration values.',
						},
						{
							name: ['unset'],
							description: 'Unsets a configuration.',
						},
					],
				},
				{
					name: ['demo'],
					description: 'This extension provides examples of the AZD extension framework.',
					subcommands: [
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
							description: 'Get the context of the AZD project & environment.',
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
				},
				{
					name: ['down'],
					description: 'Delete your project\'s Azure resources.',
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
								},
								{
									name: ['set'],
									description: 'Sets a configuration value in the environment.',
								},
								{
									name: ['unset'],
									description: 'Unsets a configuration value in the environment.',
								},
							],
						},
						{
							name: ['get-value'],
							description: 'Get specific environment value.',
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
						},
						{
							name: ['refresh'],
							description: 'Refresh environment values by using information from a previous infrastructure provision.',
						},
						{
							name: ['remove', 'rm'],
							description: 'Remove an environment.',
						},
						{
							name: ['select'],
							description: 'Set the default environment.',
						},
						{
							name: ['set'],
							description: 'Set one or more environment values.',
						},
						{
							name: ['set-secret'],
							description: 'Set a name as a reference to a Key Vault secret in the environment.',
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
						},
						{
							name: ['list'],
							description: 'List available extensions.',
						},
						{
							name: ['show'],
							description: 'Show details for a specific extension.',
						},
						{
							name: ['source'],
							description: 'View and manage extension sources',
							subcommands: [
								{
									name: ['add'],
									description: 'Add an extension source with the specified name',
								},
								{
									name: ['list'],
									description: 'List extension sources',
								},
								{
									name: ['remove'],
									description: 'Remove an extension source with the specified name',
								},
							],
						},
						{
							name: ['uninstall'],
							description: 'Uninstall specified extensions.',
						},
						{
							name: ['upgrade'],
							description: 'Upgrade specified extensions.',
						},
					],
				},
				{
					name: ['hooks'],
					description: 'Develop, test and run hooks for a project.',
					subcommands: [
						{
							name: ['run'],
							description: 'Runs the specified hook for the project and services',
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
						},
					],
				},
				{
					name: ['init'],
					description: 'Initialize a new application.',
				},
				{
					name: ['mcp'],
					description: 'Manage Model Context Protocol (MCP) server. (Alpha)',
					subcommands: [
						{
							name: ['consent'],
							description: 'Manage MCP tool consent.',
							subcommands: [
								{
									name: ['grant'],
									description: 'Grant consent trust rules.',
								},
								{
									name: ['list'],
									description: 'List consent rules.',
								},
								{
									name: ['revoke'],
									description: 'Revoke consent rules.',
								},
							],
						},
						{
							name: ['start'],
							description: 'Starts the MCP server.',
						},
					],
				},
				{
					name: ['monitor'],
					description: 'Monitor a deployed project.',
				},
				{
					name: ['package'],
					description: 'Packages the project\'s code to be deployed to Azure.',
				},
				{
					name: ['pipeline'],
					description: 'Manage and configure your deployment pipelines.',
					subcommands: [
						{
							name: ['config'],
							description: 'Configure your deployment pipeline to connect securely to Azure. (Beta)',
						},
					],
				},
				{
					name: ['provision'],
					description: 'Provision Azure resources for your project.',
				},
				{
					name: ['publish'],
					description: 'Publish a service to a container registry.',
				},
				{
					name: ['restore'],
					description: 'Restores the project\'s dependencies.',
				},
				{
					name: ['show'],
					description: 'Display information about your project and its resources.',
				},
				{
					name: ['template'],
					description: 'Find and view template details.',
					subcommands: [
						{
							name: ['list', 'ls'],
							description: 'Show list of sample azd templates. (Beta)',
						},
						{
							name: ['show'],
							description: 'Show details for a given template. (Beta)',
						},
						{
							name: ['source'],
							description: 'View and manage template sources. (Beta)',
							subcommands: [
								{
									name: ['add'],
									description: 'Adds an azd template source with the specified key. (Beta)',
								},
								{
									name: ['list', 'ls'],
									description: 'Lists the configured azd template sources. (Beta)',
								},
								{
									name: ['remove'],
									description: 'Removes the specified azd template source (Beta)',
								},
							],
						},
					],
				},
				{
					name: ['up'],
					description: 'Provision and deploy your project to Azure with a single command.',
				},
				{
					name: ['version'],
					description: 'Print the version number of Azure Developer CLI.',
				},
				{
					name: ['x'],
					description: 'This extension provides a set of tools for AZD extension developers to test and debug their extensions.',
					subcommands: [
						{
							name: ['build'],
							description: 'Build the azd extension project',
						},
						{
							name: ['init'],
							description: 'Initialize a new AZD extension project',
						},
						{
							name: ['pack'],
							description: 'Build and pack extension artifacts',
						},
						{
							name: ['publish'],
							description: 'Publish the extension to the extension source',
						},
						{
							name: ['release'],
							description: 'Create a new extension release from the packaged artifacts',
						},
						{
							name: ['version'],
							description: 'Prints the version of the application',
						},
						{
							name: ['watch'],
							description: 'Watches the AZD extension project for file changes and rebuilds it.',
						},
					],
				},
			],
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
			name: ['--no-prompt'],
			description: 'Accepts the default value instead of prompting, or it fails if there is no default.',
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
