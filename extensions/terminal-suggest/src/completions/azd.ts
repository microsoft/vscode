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
			name: ['config'],
			description: 'Manage azd configurations (ex: default Azure subscription, location).',
			subcommands: [
				{
					name: ['get'],
					description: 'Gets a configuration.',
					args: {
						name: 'path',
					},
				},
				{
					name: ['list-alpha'],
					description: 'Display the list of available features in alpha stage.',
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
					},
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
		},
		{
			name: ['env'],
			description: 'Manage environments (ex: default environment, environment variables).',
			subcommands: [
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
							description: 'Force installation even if it would downgrade the current version',
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
						name: 'extension-name',
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
			name: ['help'],
			description: 'Help about any command',
			subcommands: [
				{
					name: ['add'],
					description: 'Add a component to your project.',
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
