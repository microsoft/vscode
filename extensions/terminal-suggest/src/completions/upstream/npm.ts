function uninstallSubcommand(named: string | string[]): Fig.Subcommand {
	return {
		name: named,
		description: "Uninstall a package",
		args: {
			name: "package",
			generators: dependenciesGenerator,
			filterStrategy: "fuzzy",
			isVariadic: true,
		},
		options: npmUninstallOptions,
	};
}

const atsInStr = (s: string) => (s.match(/@/g) || []).length;

export const createNpmSearchHandler =
	(keywords?: string[]) =>
		async (
			context: string[],
			executeShellCommand: Fig.ExecuteCommandFunction,
			shellContext: Fig.ShellContext
		): Promise<Fig.Suggestion[]> => {
			const searchTerm = context[context.length - 1];
			if (searchTerm === "") {
				return [];
			}
			// Add optional keyword parameter
			const keywordParameter =
				keywords && keywords.length > 0 ? `+keywords:${keywords.join(",")}` : "";

			const queryPackagesUrl = keywordParameter
				? `https://api.npms.io/v2/search?size=20&q=${searchTerm}${keywordParameter}`
				: `https://api.npms.io/v2/search/suggestions?q=${searchTerm}&size=20`;

			// Query the API with the package name
			const queryPackages = [
				"-s",
				"-H",
				"Accept: application/json",
				queryPackagesUrl,
			];
			// We need to remove the '@' at the end of the searchTerm before querying versions
			const queryVersions = [
				"-s",
				"-H",
				"Accept: application/vnd.npm.install-v1+json",
				`https://registry.npmjs.org/${searchTerm.slice(0, -1)}`,
			];
			// If the end of our token is '@', then we want to generate version suggestions
			// Otherwise, we want packages
			const out = (query: string) =>
				executeShellCommand({
					command: "curl",
					args: query[query.length - 1] === "@" ? queryVersions : queryPackages,
				});
			// If our token starts with '@', then a 2nd '@' tells us we want
			// versions.
			// Otherwise, '@' anywhere else in the string will indicate the same.
			const shouldGetVersion = searchTerm.startsWith("@")
				? atsInStr(searchTerm) > 1
				: searchTerm.includes("@");

			try {
				const data = JSON.parse((await out(searchTerm)).stdout);
				if (shouldGetVersion) {
					// create dist tags suggestions
					const versions = Object.entries(data["dist-tags"] || {}).map(
						([key, value]) => ({
							name: key,
							description: value,
						})
					) as Fig.Suggestion[];
					// create versions
					versions.push(
						...Object.keys(data.versions)
							.map((version) => ({ name: version }) as Fig.Suggestion)
							.reverse()
					);
					return versions;
				}

				const results = keywordParameter ? data.results : data;
				return results.map((item: any) => ({
					name: item.package.name,
					description: item.package.description,
				})) as Fig.Suggestion[];
			} catch (error) {
				console.error({ error });
				return [];
			}
		};

// GENERATORS
export const npmSearchGenerator: Fig.Generator = {
	trigger: (newToken, oldToken) => {
		// If the package name starts with '@', we want to trigger when
		// the 2nd '@' is typed because we'll need to generate version
		// suggetsions
		// e.g. @typescript-eslint/types
		if (oldToken.startsWith("@")) {
			return !(atsInStr(oldToken) > 1 && atsInStr(newToken) > 1);
		}

		// If the package name doesn't start with '@', then trigger when
		// we see the first '@' so we can generate version suggestions
		return !(oldToken.includes("@") && newToken.includes("@"));
	},
	getQueryTerm: "@",
	cache: {
		ttl: 1000 * 60 * 60 * 24 * 2, // 2 days
	},
	custom: createNpmSearchHandler(),
};

const workspaceGenerator: Fig.Generator = {
	// script: "cat $(npm prefix)/package.json",
	custom: async (tokens, executeShellCommand) => {
		const { stdout: npmPrefix } = await executeShellCommand({
			command: "npm",
			// eslint-disable-next-line @withfig/fig-linter/no-useless-arrays
			args: ["prefix"],
		});

		const { stdout: out } = await executeShellCommand({
			command: "cat",
			// eslint-disable-next-line @withfig/fig-linter/no-useless-arrays
			args: [`${npmPrefix}/package.json`],
		});

		const suggestions: Fig.Suggestion[] = [];
		try {
			if (out.trim() == "") {
				return suggestions;
			}

			const packageContent = JSON.parse(out);
			const workspaces = packageContent["workspaces"];

			if (workspaces) {
				for (const workspace of workspaces) {
					suggestions.push({
						name: workspace,
						description: "Workspaces",
					});
				}
			}
		} catch (e) {
			console.log(e);
		}
		return suggestions;
	},
};

/** Generator that lists package.json dependencies */
export const dependenciesGenerator: Fig.Generator = {
	trigger: (newToken) => newToken === "-g" || newToken === "--global",
	custom: async function (tokens, executeShellCommand) {
		if (!tokens.includes("-g") && !tokens.includes("--global")) {
			const { stdout: npmPrefix } = await executeShellCommand({
				command: "npm",
				// eslint-disable-next-line @withfig/fig-linter/no-useless-arrays
				args: ["prefix"],
			});
			const { stdout: out } = await executeShellCommand({
				command: "cat",
				// eslint-disable-next-line @withfig/fig-linter/no-useless-arrays
				args: [`${npmPrefix}/package.json`],
			});
			const packageContent = JSON.parse(out);
			const dependencies = packageContent["dependencies"] ?? {};
			const devDependencies = packageContent["devDependencies"];
			const optionalDependencies = packageContent["optionalDependencies"] ?? {};
			Object.assign(dependencies, devDependencies, optionalDependencies);

			return Object.keys(dependencies)
				.filter((pkgName) => {
					const isListed = tokens.some((current) => current === pkgName);
					return !isListed;
				})
				.map((pkgName) => ({
					name: pkgName,
					icon: "📦",
					description: dependencies[pkgName]
						? "dependency"
						: optionalDependencies[pkgName]
							? "optionalDependency"
							: "devDependency",
				}));
		} else {
			const { stdout } = await executeShellCommand({
				command: "bash",
				args: ["-c", "ls -1 `npm root -g`"],
			});
			return stdout.split("\n").map((name) => ({
				name,
				icon: "📦",
				description: "Global dependency",
			}));
		}
	},
};

/** Generator that lists package.json scripts (with the respect to the `fig` field) */
export const npmScriptsGenerator: Fig.Generator = {
	cache: {
		strategy: "stale-while-revalidate",
		cacheByDirectory: true,
	},
	script: [
		"bash",
		"-c",
		"until [[ -f package.json ]] || [[ $PWD = '/' ]]; do cd ..; done; cat package.json",
	],
	postProcess: function (out, [npmClient]) {
		if (out.trim() == "") {
			return [];
		}

		try {
			const packageContent = JSON.parse(out);
			const scripts = packageContent["scripts"];
			const figCompletions = packageContent["fig"] || {};

			if (scripts) {
				return Object.entries(scripts).map(([scriptName, scriptContents]) => {
					const icon =
						npmClient === "yarn"
							? "fig://icon?type=yarn"
							: "fig://icon?type=npm";
					const customScripts: Fig.Suggestion = figCompletions[scriptName];
					return {
						name: scriptName,
						icon,
						description: scriptContents as string,
						priority: 51,
						/**
						 * If there are custom definitions for the scripts
						 * we want to override the default values
						 * */
						...customScripts,
					};
				});
			}
		} catch (e) {
			console.error(e);
		}

		return [];
	},
};

const globalOption: Fig.Option = {
	name: ["-g", "--global"],
	description:
		"Operates in 'global' mode, so that packages are installed into the prefix folder instead of the current working directory",
};

const jsonOption: Fig.Option = {
	name: "--json",
	description: "Show output in json format",
};

const omitOption: Fig.Option = {
	name: "--omit",
	description: "Dependency types to omit from the installation tree on disk",
	args: {
		name: "Package type",
		default: "dev",
		suggestions: ["dev", "optional", "peer"],
	},
	isRepeatable: 3,
};

const parseableOption: Fig.Option = {
	name: ["-p", "--parseable"],
	description:
		"Output parseable results from commands that write to standard output",
};

const longOption: Fig.Option = {
	name: ["-l", "--long"],
	description: "Show extended information",
};

const workSpaceOptions: Fig.Option[] = [
	{
		name: ["-w", "--workspace"],
		description:
			"Enable running a command in the context of the configured workspaces of the current project",
		args: {
			name: "workspace",
			generators: workspaceGenerator,
			isVariadic: true,
		},
	},
	{
		name: ["-ws", "--workspaces"],
		description:
			"Enable running a command in the context of all the configured workspaces",
	},
];

const npmUninstallOptions: Fig.Option[] = [
	{
		name: ["-S", "--save"],
		description: "Package will be removed from your dependencies",
	},
	{
		name: ["-D", "--save-dev"],
		description: "Package will appear in your `devDependencies`",
	},
	{
		name: ["-O", "--save-optional"],
		description: "Package will appear in your `optionalDependencies`",
	},
	{
		name: "--no-save",
		description: "Prevents saving to `dependencies`",
	},
	{
		name: "-g",
		description: "Uninstall global package",
	},
	...workSpaceOptions,
];

const npmListOptions: Fig.Option[] = [
	{
		name: ["-a", "-all"],
		description: "Show all outdated or installed packages",
	},
	jsonOption,
	longOption,
	parseableOption,
	{
		name: "--depth",
		description: "The depth to go when recursing packages",
		args: { name: "depth" },
	},
	{
		name: "--link",
		description: "Limits output to only those packages that are linked",
	},
	{
		name: "--package-lock-only",
		description:
			"Current operation will only use the package-lock.json, ignoring node_modules",
	},
	{
		name: "--no-unicode",
		description: "Uses unicode characters in the tree output",
	},
	globalOption,
	omitOption,
	...workSpaceOptions,
];

const registryOption: Fig.Option = {
	name: "--registry",
	description: "The base URL of the npm registry",
	args: { name: "registry" },
};

const verboseOption: Fig.Option = {
	name: "--verbose",
	description: "Show extra information",
	args: { name: "verbose" },
};

const otpOption: Fig.Option = {
	name: "--otp",
	description: "One-time password from a two-factor authenticator",
	args: { name: "otp" },
};

const ignoreScriptsOption: Fig.Option = {
	name: "--ignore-scripts",
	description:
		"If true, npm does not run scripts specified in package.json files",
};

const scriptShellOption: Fig.Option = {
	name: "--script-shell",
	description:
		"The shell to use for scripts run with the npm exec, npm run and npm init <pkg> commands",
	args: { name: "script-shell" },
};

const dryRunOption: Fig.Option = {
	name: "--dry-run",
	description:
		"Indicates that you don't want npm to make any changes and that it should only report what it would have done",
};

const completionSpec: Fig.Spec = {
	name: "npm",
	parserDirectives: {
		flagsArePosixNoncompliant: true,
	},
	description: "Node package manager",
	subcommands: [
		{
			name: ["install", "i", "add"],
			description: "Install a package and its dependencies",
			args: {
				name: "package",
				isOptional: true,
				generators: npmSearchGenerator,
				debounce: true,
				isVariadic: true,
			},
			options: [
				{
					name: ["-P", "--save-prod"],
					description:
						"Package will appear in your `dependencies`. This is the default unless `-D` or `-O` are present",
				},
				{
					name: ["-D", "--save-dev"],
					description: "Package will appear in your `devDependencies`",
				},
				{
					name: ["-O", "--save-optional"],
					description: "Package will appear in your `optionalDependencies`",
				},
				{
					name: "--no-save",
					description: "Prevents saving to `dependencies`",
				},
				{
					name: ["-E", "--save-exact"],
					description:
						"Saved dependencies will be configured with an exact version rather than using npm's default semver range operator",
				},
				{
					name: ["-B", "--save-bundle"],
					description:
						"Saved dependencies will also be added to your bundleDependencies list",
				},
				globalOption,
				{
					name: "--global-style",
					description:
						"Causes npm to install the package into your local node_modules folder with the same layout it uses with the global node_modules folder",
				},
				{
					name: "--legacy-bundling",
					description:
						"Causes npm to install the package such that versions of npm prior to 1.4, such as the one included with node 0.8, can install the package",
				},
				{
					name: "--legacy-peer-deps",
					description:
						"Bypass peerDependency auto-installation. Emulate install behavior of NPM v4 through v6",
				},
				{
					name: "--strict-peer-deps",
					description:
						"If set to true, and --legacy-peer-deps is not set, then any conflicting peerDependencies will be treated as an install failure",
				},
				{
					name: "--no-package-lock",
					description: "Ignores package-lock.json files when installing",
				},
				registryOption,
				verboseOption,
				omitOption,
				ignoreScriptsOption,
				{
					name: "--no-audit",
					description:
						"Submit audit reports alongside the current npm command to the default registry and all registries configured for scopes",
				},
				{
					name: "--no-bin-links",
					description:
						"Tells npm to not create symlinks (or .cmd shims on Windows) for package executables",
				},
				{
					name: "--no-fund",
					description:
						"Hides the message at the end of each npm install acknowledging the number of dependencies looking for funding",
				},
				dryRunOption,
				...workSpaceOptions,
			],
		},
		{
			name: ["run", "run-script"],
			description: "Run arbitrary package scripts",
			options: [
				...workSpaceOptions,
				{
					name: "--if-present",
					description:
						"Npm will not exit with an error code when run-script is invoked for a script that isn't defined in the scripts section of package.json",
				},
				{
					name: "--silent",
					description: "",
				},
				ignoreScriptsOption,
				scriptShellOption,
				{
					name: "--",
					args: {
						name: "args",
						isVariadic: true,
						// TODO: load the spec based on the runned script (see yarn spec `yarnScriptParsedDirectives`)
					},
				},
			],
			args: {
				name: "script",
				description: "Script to run from your package.json",
				filterStrategy: "fuzzy",
				generators: npmScriptsGenerator,
			},
		},
		{
			name: "init",
			description: "Trigger the initialization",
			options: [
				{
					name: ["-y", "--yes"],
					description:
						"Automatically answer 'yes' to any prompts that npm might print on the command line",
				},
				{
					name: "-w",
					description:
						"Create the folders and boilerplate expected while also adding a reference to your project workspaces property",
					args: { name: "dir" },
				},
			],
		},
		{ name: "access", description: "Set access controls on private packages" },
		{
			name: ["adduser", "login"],
			description: "Add a registry user account",
			options: [
				registryOption,
				{
					name: "--scope",
					description:
						"Associate an operation with a scope for a scoped registry",
					args: {
						name: "scope",
						description: "Scope name",
					},
				},
			],
		},
		{
			name: "audit",
			description: "Run a security audit",
			subcommands: [
				{
					name: "fix",
					description:
						"If the fix argument is provided, then remediations will be applied to the package tree",
					options: [
						dryRunOption,
						{
							name: ["-f", "--force"],
							description:
								"Removes various protections against unfortunate side effects, common mistakes, unnecessary performance degradation, and malicious input",
							isDangerous: true,
						},
						...workSpaceOptions,
					],
				},
			],
			options: [
				...workSpaceOptions,
				{
					name: "--audit-level",
					description:
						"The minimum level of vulnerability for npm audit to exit with a non-zero exit code",
					args: {
						name: "audit",
						suggestions: [
							"info",
							"low",
							"moderate",
							"high",
							"critical",
							"none",
						],
					},
				},
				{
					name: "--package-lock-only",
					description:
						"Current operation will only use the package-lock.json, ignoring node_modules",
				},
				jsonOption,
				omitOption,
			],
		},
		{
			name: "bin",
			description: "Print the folder where npm will install executables",
			options: [globalOption],
		},
		{
			name: ["bugs", "issues"],
			description: "Report bugs for a package in a web browser",
			args: {
				name: "package",
				isOptional: true,
				generators: npmSearchGenerator,
				debounce: true,
				isVariadic: true,
			},
			options: [
				{
					name: "--no-browser",
					description: "Display in command line instead of browser",
					exclusiveOn: ["--browser"],
				},
				{
					name: "--browser",
					description:
						"The browser that is called by the npm bugs command to open websites",
					args: { name: "browser" },
					exclusiveOn: ["--no-browser"],
				},
				registryOption,
			],
		},
		{
			name: "cache",
			description: "Manipulates packages cache",
			subcommands: [
				{
					name: "add",
					description: "Add the specified packages to the local cache",
				},
				{
					name: "clean",
					description: "Delete all data out of the cache folder",
				},
				{
					name: "verify",
					description:
						"Verify the contents of the cache folder, garbage collecting any unneeded data, and verifying the integrity of the cache index and all cached data",
				},
			],
			options: [
				{
					name: "--cache",
					args: { name: "cache" },
					description: "The location of npm's cache directory",
				},
			],
		},
		{
			name: ["ci", "clean-install", "install-clean"],
			description: "Install a project with a clean slate",
			options: [
				{
					name: "--audit",
					description:
						'When "true" submit audit reports alongside the current npm command to the default registry and all registries configured for scopes',
					args: {
						name: "audit",
						suggestions: ["true", "false"],
					},
					exclusiveOn: ["--no-audit"],
				},
				{
					name: "--no-audit",
					description:
						"Do not submit audit reports alongside the current npm command",
					exclusiveOn: ["--audit"],
				},
				ignoreScriptsOption,
				scriptShellOption,
				verboseOption,
				registryOption,
			],
		},
		{
			name: "cit",
			description: "Install a project with a clean slate and run tests",
		},
		{
			name: "clean-install-test",
			description: "Install a project with a clean slate and run tests",
		},
		{ name: "completion", description: "Tab completion for npm" },
		{
			name: ["config", "c"],
			description: "Manage the npm configuration files",
			subcommands: [
				{
					name: "set",
					description: "Sets the config key to the value",
					args: [{ name: "key" }, { name: "value" }],
					options: [
						{ name: ["-g", "--global"], description: "Sets it globally" },
					],
				},
				{
					name: "get",
					description: "Echo the config value to stdout",
					args: { name: "key" },
				},
				{
					name: "list",
					description: "Show all the config settings",
					options: [
						{ name: "-g", description: "Lists globally installed packages" },
						{ name: "-l", description: "Also shows defaults" },
						jsonOption,
					],
				},
				{
					name: "delete",
					description: "Deletes the key from all configuration files",
					args: { name: "key" },
				},
				{
					name: "edit",
					description: "Opens the config file in an editor",
					options: [
						{ name: "--global", description: "Edits the global config" },
					],
				},
			],
		},
		{ name: "create", description: "Create a package.json file" },
		{
			name: ["dedupe", "ddp"],
			description: "Reduce duplication in the package tree",
		},
		{
			name: "deprecate",
			description: "Deprecate a version of a package",
			options: [registryOption],
		},
		{ name: "dist-tag", description: "Modify package distribution tags" },
		{
			name: ["docs", "home"],
			description: "Open documentation for a package in a web browser",
			args: {
				name: "package",
				isOptional: true,
				generators: npmSearchGenerator,
				debounce: true,
				isVariadic: true,
			},
			options: [
				...workSpaceOptions,
				registryOption,
				{
					name: "--no-browser",
					description: "Display in command line instead of browser",
					exclusiveOn: ["--browser"],
				},
				{
					name: "--browser",
					description:
						"The browser that is called by the npm docs command to open websites",
					args: { name: "browser" },
					exclusiveOn: ["--no-browser"],
				},
			],
		},
		{
			name: "doctor",
			description: "Check your npm environment",
			options: [registryOption],
		},
		{
			name: "edit",
			description: "Edit an installed package",
			options: [
				{
					name: "--editor",
					description: "The command to run for npm edit or npm config edit",
				},
			],
		},
		{
			name: "explore",
			description: "Browse an installed package",
			args: {
				name: "package",
				filterStrategy: "fuzzy",
				generators: dependenciesGenerator,
			},
		},
		{ name: "fund", description: "Retrieve funding information" },
		{ name: "get", description: "Echo the config value to stdout" },
		{
			name: "help",
			description: "Get help on npm",
			args: {
				name: "term",
				isVariadic: true,
				description: "Terms to search for",
			},
			options: [
				{
					name: "--viewer",
					description: "The program to use to view help content",
					args: {
						name: "viewer",
					},
				},
			],
		},
		{
			name: "help-search",
			description: "Search npm help documentation",
			args: {
				name: "text",
				description: "Text to search for",
			},
			options: [longOption],
		},
		{ name: "hook", description: "Manage registry hooks" },
		{
			name: "install-ci-test",
			description: "Install a project with a clean slate and run tests",
		},
		{ name: "install-test", description: "Install package(s) and run tests" },
		{ name: "it", description: "Install package(s) and run tests" },
		{
			name: "link",
			description: "Symlink a package folder",
			args: { name: "path", template: "filepaths" },
		},
		{ name: "ln", description: "Symlink a package folder" },
		{
			name: "logout",
			description: "Log out of the registry",
			options: [
				registryOption,
				{
					name: "--scope",
					description:
						"Associate an operation with a scope for a scoped registry",
					args: {
						name: "scope",
						description: "Scope name",
					},
				},
			],
		},
		{
			name: ["ls", "list"],
			description: "List installed packages",
			options: npmListOptions,
			args: { name: "[@scope]/pkg", isVariadic: true },
		},
		{
			name: "org",
			description: "Manage orgs",
			subcommands: [
				{
					name: "set",
					description: "Add a user to an org or manage roles",
					args: [
						{
							name: "orgname",
							description: "Organization name",
						},
						{
							name: "username",
							description: "User name",
						},
						{
							name: "role",
							isOptional: true,
							suggestions: ["developer", "admin", "owner"],
						},
					],
					options: [registryOption, otpOption],
				},
				{
					name: "rm",
					description: "Remove a user from an org",
					args: [
						{
							name: "orgname",
							description: "Organization name",
						},
						{
							name: "username",
							description: "User name",
						},
					],
					options: [registryOption, otpOption],
				},
				{
					name: "ls",
					description:
						"List users in an org or see what roles a particular user has in an org",
					args: [
						{
							name: "orgname",
							description: "Organization name",
						},
						{
							name: "username",
							description: "User name",
							isOptional: true,
						},
					],
					options: [registryOption, otpOption, jsonOption, parseableOption],
				},
			],
		},
		{
			name: "outdated",
			description: "Check for outdated packages",
			args: {
				name: "[<@scope>/]<pkg>",
				isVariadic: true,
				isOptional: true,
			},
			options: [
				{
					name: ["-a", "-all"],
					description: "Show all outdated or installed packages",
				},
				jsonOption,
				longOption,
				parseableOption,
				{
					name: "-g",
					description: "Checks globally",
				},
				...workSpaceOptions,
			],
		},
		{
			name: ["owner", "author"],
			description: "Manage package owners",
			subcommands: [
				{
					name: "ls",
					description:
						"List all the users who have access to modify a package and push new versions. Handy when you need to know who to bug for help",
					args: { name: "[@scope/]pkg" },
					options: [registryOption],
				},
				{
					name: "add",
					description:
						"Add a new user as a maintainer of a package. This user is enabled to modify metadata, publish new versions, and add other owners",
					args: [{ name: "user" }, { name: "[@scope/]pkg" }],
					options: [registryOption, otpOption],
				},
				{
					name: "rm",
					description:
						"Remove a user from the package owner list. This immediately revokes their privileges",
					args: [{ name: "user" }, { name: "[@scope/]pkg" }],
					options: [registryOption, otpOption],
				},
			],
		},
		{
			name: "pack",
			description: "Create a tarball from a package",
			args: {
				name: "[<@scope>/]<pkg>",
			},
			options: [
				jsonOption,
				dryRunOption,
				...workSpaceOptions,
				{
					name: "--pack-destination",
					description: "Directory in which npm pack will save tarballs",
					args: {
						name: "pack-destination",
						template: ["folders"],
					},
				},
			],
		},
		{
			name: "ping",
			description: "Ping npm registry",
			options: [registryOption],
		},
		{
			name: "pkg",
			description: "Manages your package.json",
			subcommands: [
				{
					name: "get",
					description:
						"Retrieves a value key, defined in your package.json file. It is possible to get multiple values and values for child fields",
					args: {
						name: "field",
						description:
							"Name of the field to get. You can view child fields by separating them with a period",
						isVariadic: true,
					},
					options: [jsonOption, ...workSpaceOptions],
				},
				{
					name: "set",
					description:
						"Sets a value in your package.json based on the field value. It is possible to set multiple values and values for child fields",
					args: {
						// Format is <field>=<value>. How to achieve this?
						name: "field",
						description:
							"Name of the field to set. You can set child fields by separating them with a period",
						isVariadic: true,
					},
					options: [
						jsonOption,
						...workSpaceOptions,
						{
							name: ["-f", "--force"],
							description:
								"Removes various protections against unfortunate side effects, common mistakes, unnecessary performance degradation, and malicious input. Allow clobbering existing values in npm pkg",
							isDangerous: true,
						},
					],
				},
				{
					name: "delete",
					description: "Deletes a key from your package.json",
					args: {
						name: "key",
						description:
							"Name of the key to delete. You can delete child fields by separating them with a period",
						isVariadic: true,
					},
					options: [
						...workSpaceOptions,
						{
							name: ["-f", "--force"],
							description:
								"Removes various protections against unfortunate side effects, common mistakes, unnecessary performance degradation, and malicious input. Allow clobbering existing values in npm pkg",
							isDangerous: true,
						},
					],
				},
			],
		},
		{
			name: "prefix",
			description: "Display prefix",
			options: [
				{
					name: ["-g", "--global"],
					description: "Print the global prefix to standard out",
				},
			],
		},
		{
			name: "profile",
			description: "Change settings on your registry profile",
			subcommands: [
				{
					name: "get",
					description:
						"Display all of the properties of your profile, or one or more specific properties",
					args: {
						name: "property",
						isOptional: true,
						description: "Property name",
					},
					options: [registryOption, jsonOption, parseableOption, otpOption],
				},
				{
					name: "set",
					description: "Set the value of a profile property",
					args: [
						{
							name: "property",
							description: "Property name",
							suggestions: [
								"email",
								"fullname",
								"homepage",
								"freenode",
								"twitter",
								"github",
							],
						},
						{
							name: "value",
							description: "Property value",
						},
					],
					options: [registryOption, jsonOption, parseableOption, otpOption],
					subcommands: [
						{
							name: "password",
							description:
								"Change your password. This is interactive, you'll be prompted for your current password and a new password",
						},
					],
				},
				{
					name: "enable-2fa",
					description: "Enables two-factor authentication",
					args: {
						name: "mode",
						description:
							"Mode for two-factor authentication. Defaults to auth-and-writes mode",
						isOptional: true,
						suggestions: [
							{
								name: "auth-only",
								description:
									"Require an OTP when logging in or making changes to your account's authentication",
							},
							{
								name: "auth-and-writes",
								description:
									"Requires an OTP at all the times auth-only does, and also requires one when publishing a module, setting the latest dist-tag, or changing access via npm access and npm owner",
							},
						],
					},
					options: [registryOption, otpOption],
				},
				{
					name: "disable-2fa",
					description: "Disables two-factor authentication",
					options: [registryOption, otpOption],
				},
			],
		},
		{
			name: "prune",
			description: "Remove extraneous packages",
			args: {
				name: "[<@scope>/]<pkg>",
				isOptional: true,
			},
			options: [
				omitOption,
				dryRunOption,
				jsonOption,
				{
					name: "--production",
					description: "Remove the packages specified in your devDependencies",
				},
				...workSpaceOptions,
			],
		},
		{
			name: "publish",
			description: "Publish a package",
			args: {
				name: "tarball|folder",
				isOptional: true,
				description:
					"A url or file path to a gzipped tar archive containing a single folder with a package.json file inside | A folder containing a package.json file",
				template: ["folders"],
			},
			options: [
				{
					name: "--tag",
					description: "Registers the published package with the given tag",
					args: { name: "tag" },
				},
				...workSpaceOptions,
				{
					name: "--access",
					description:
						"Sets scoped package to be publicly viewable if set to 'public'",
					args: {
						default: "restricted",
						suggestions: ["restricted", "public"],
					},
				},
				dryRunOption,
				otpOption,
			],
		},
		{
			name: ["rebuild", "rb"],
			description: "Rebuild a package",
			args: {
				name: "[<@scope>/]<pkg>[@<version>]",
			},
			options: [
				globalOption,
				...workSpaceOptions,
				ignoreScriptsOption,
				{
					name: "--no-bin-links",
					description:
						"Tells npm to not create symlinks (or .cmd shims on Windows) for package executables",
				},
			],
		},
		{
			name: "repo",
			description: "Open package repository page in the browser",
			args: {
				name: "package",
				isOptional: true,
				generators: npmSearchGenerator,
				debounce: true,
				isVariadic: true,
			},
			options: [
				...workSpaceOptions,
				{
					name: "--no-browser",
					description: "Display in command line instead of browser",
					exclusiveOn: ["--browser"],
				},
				{
					name: "--browser",
					description:
						"The browser that is called by the npm repo command to open websites",
					args: { name: "browser" },
					exclusiveOn: ["--no-browser"],
				},
			],
		},
		{
			name: "restart",
			description: "Restart a package",
			options: [
				ignoreScriptsOption,
				scriptShellOption,
				{
					name: "--",
					args: {
						name: "arg",
						description: "Arguments to be passed to the restart script",
					},
				},
			],
		},
		{
			name: "root",
			description: "Display npm root",
			options: [
				{
					name: ["-g", "--global"],
					description:
						"Print the effective global node_modules folder to standard out",
				},
			],
		},
		{
			name: ["search", "s", "se", "find"],
			description: "Search for packages",
			args: {
				name: "search terms",
				isVariadic: true,
			},
			options: [
				longOption,
				jsonOption,
				{
					name: "--color",
					description: "Show colors",
					args: {
						name: "always",
						suggestions: ["always"],
						description: "Always show colors",
					},
					exclusiveOn: ["--no-color"],
				},
				{
					name: "--no-color",
					description: "Do not show colors",
					exclusiveOn: ["--color"],
				},
				parseableOption,
				{
					name: "--no-description",
					description: "Do not show descriptions",
				},
				{
					name: "--searchopts",
					description:
						"Space-separated options that are always passed to search",
					args: {
						name: "searchopts",
					},
				},
				{
					name: "--searchexclude",
					description:
						"Space-separated options that limit the results from search",
					args: {
						name: "searchexclude",
					},
				},
				registryOption,
				{
					name: "--prefer-online",
					description:
						"If true, staleness checks for cached data will be forced, making the CLI look for updates immediately even for fresh package data",
					exclusiveOn: ["--prefer-offline", "--offline"],
				},
				{
					name: "--prefer-offline",
					description:
						"If true, staleness checks for cached data will be bypassed, but missing data will be requested from the server",
					exclusiveOn: ["--prefer-online", "--offline"],
				},
				{
					name: "--offline",
					description:
						"Force offline mode: no network requests will be done during install",
					exclusiveOn: ["--prefer-online", "--prefer-offline"],
				},
			],
		},
		{ name: "set", description: "Sets the config key to the value" },
		{
			name: "set-script",
			description: "Set tasks in the scripts section of package.json",
			args: [
				{
					name: "script",
					description:
						"Name of the task to be added to the scripts section of package.json",
				},
				{
					name: "command",
					description: "Command to run when script is called",
				},
			],
			options: workSpaceOptions,
		},
		{
			name: "shrinkwrap",
			description: "Lock down dependency versions for publication",
		},
		{
			name: "star",
			description: "Mark your favorite packages",
			args: {
				name: "pkg",
				description: "Package to mark as favorite",
			},
			options: [
				registryOption,
				{
					name: "--no-unicode",
					description: "Do not use unicode characters in the tree output",
				},
			],
		},
		{
			name: "stars",
			description: "View packages marked as favorites",
			args: {
				name: "user",
				isOptional: true,
				description: "View packages marked as favorites by <user>",
			},
			options: [registryOption],
		},
		{
			name: "start",
			description: "Start a package",
			options: [
				ignoreScriptsOption,
				scriptShellOption,
				{
					name: "--",
					args: {
						name: "arg",
						description: "Arguments to be passed to the start script",
					},
				},
			],
		},
		{
			name: "stop",
			description: "Stop a package",
			options: [
				ignoreScriptsOption,
				scriptShellOption,
				{
					name: "--",
					args: {
						name: "arg",
						description: "Arguments to be passed to the stop script",
					},
				},
			],
		},
		{
			name: "team",
			description: "Manage organization teams and team memberships",
			subcommands: [
				{
					name: "create",
					args: { name: "scope:team" },
					options: [registryOption, otpOption],
				},
				{
					name: "destroy",
					args: { name: "scope:team" },
					options: [registryOption, otpOption],
				},
				{
					name: "add",
					args: [{ name: "scope:team" }, { name: "user" }],
					options: [registryOption, otpOption],
				},
				{
					name: "rm",
					args: [{ name: "scope:team" }, { name: "user" }],
					options: [registryOption, otpOption],
				},
				{
					name: "ls",
					args: { name: "scope|scope:team" },
					options: [registryOption, jsonOption, parseableOption],
				},
			],
		},
		{
			name: ["test", "tst", "t"],
			description: "Test a package",
			options: [ignoreScriptsOption, scriptShellOption],
		},
		{
			name: "token",
			description: "Manage your authentication tokens",
			subcommands: [
				{
					name: "list",
					description: "Shows a table of all active authentication tokens",
					options: [jsonOption, parseableOption],
				},
				{
					name: "create",
					description: "Create a new authentication token",
					options: [
						{
							name: "--read-only",
							description:
								"This is used to mark a token as unable to publish when configuring limited access tokens with the npm token create command",
						},
						{
							name: "--cidr",
							description:
								"This is a list of CIDR address to be used when configuring limited access tokens with the npm token create command",
							isRepeatable: true,
							args: {
								name: "cidr",
							},
						},
					],
				},
				{
					name: "revoke",
					description:
						"Immediately removes an authentication token from the registry. You will no longer be able to use it",
					args: { name: "idtoken" },
				},
			],
			options: [registryOption, otpOption],
		},
		uninstallSubcommand("uninstall"),
		uninstallSubcommand(["r", "rm"]),
		uninstallSubcommand("un"),
		uninstallSubcommand("remove"),
		uninstallSubcommand("unlink"),
		{
			name: "unpublish",
			description: "Remove a package from the registry",
			args: {
				name: "[<@scope>/]<pkg>[@<version>]",
			},
			options: [
				dryRunOption,
				{
					name: ["-f", "--force"],
					description:
						"Allow unpublishing all versions of a published package. Removes various protections against unfortunate side effects, common mistakes, unnecessary performance degradation, and malicious input",
					isDangerous: true,
				},
				...workSpaceOptions,
			],
		},
		{
			name: "unstar",
			description: "Remove an item from your favorite packages",
			args: {
				name: "pkg",
				description: "Package to unmark as favorite",
			},
			options: [
				registryOption,
				otpOption,
				{
					name: "--no-unicode",
					description: "Do not use unicode characters in the tree output",
				},
			],
		},
		{
			name: ["update", "upgrade", "up"],
			description: "Update a package",
			options: [
				{ name: "-g", description: "Update global package" },
				{
					name: "--global-style",
					description:
						"Causes npm to install the package into your local node_modules folder with the same layout it uses with the global node_modules folder",
				},
				{
					name: "--legacy-bundling",
					description:
						"Causes npm to install the package such that versions of npm prior to 1.4, such as the one included with node 0.8, can install the package",
				},
				{
					name: "--strict-peer-deps",
					description:
						"If set to true, and --legacy-peer-deps is not set, then any conflicting peerDependencies will be treated as an install failure",
				},
				{
					name: "--no-package-lock",
					description: "Ignores package-lock.json files when installing",
				},
				omitOption,
				ignoreScriptsOption,
				{
					name: "--no-audit",
					description:
						"Submit audit reports alongside the current npm command to the default registry and all registries configured for scopes",
				},
				{
					name: "--no-bin-links",
					description:
						"Tells npm to not create symlinks (or .cmd shims on Windows) for package executables",
				},
				{
					name: "--no-fund",
					description:
						"Hides the message at the end of each npm install acknowledging the number of dependencies looking for funding",
				},
				{
					name: "--save",
					description:
						"Update the semver values of direct dependencies in your project package.json",
				},
				dryRunOption,
				...workSpaceOptions,
			],
		},
		{
			name: "version",
			description: "Bump a package version",
			options: [
				...workSpaceOptions,
				jsonOption,
				{
					name: "--allow-same-version",
					description:
						"Prevents throwing an error when npm version is used to set the new version to the same value as the current version",
				},
				{
					name: "--no-commit-hooks",
					description:
						"Do not run git commit hooks when using the npm version command",
				},
				{
					name: "--no-git-tag-version",
					description:
						"Do not tag the commit when using the npm version command",
				},
				{
					name: "--preid",
					description:
						'The "prerelease identifier" to use as a prefix for the "prerelease" part of a semver. Like the rc in 1.2.0-rc.8',
					args: {
						name: "prerelease-id",
					},
				},
				{
					name: "--sign-git-tag",
					description:
						"If set to true, then the npm version command will tag the version using -s to add a signature",
				},
			],
		},
		{
			name: ["view", "v", "info", "show"],
			description: "View registry info",
			options: [...workSpaceOptions, jsonOption],
		},
		{
			name: "whoami",
			description: "Display npm username",
			options: [registryOption],
		},
	],
};

export default completionSpec;
