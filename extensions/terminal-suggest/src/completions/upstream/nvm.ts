// args
const version: Fig.Arg = {
	name: "version",
	description: "Node version",
	suggestions: [
		{
			name: "node",
			description: "The latest version of node",
		},
		{
			name: "iojs",
			description: "The latest version of io.js",
		},
		{
			name: "system",
			description: "System-installed version of node",
		},
	],
};

const command: Fig.Arg = {
	name: "command",
	isVariadic: true,
};

const args: Fig.Arg = {
	name: "args",
	isVariadic: true,
};

// const pattern: Fig.Arg = {
//   name: "pattern",
// };

const name: Fig.Arg = {
	name: "name",
};

const ltsName: Fig.Arg = {
	name: "LTS name",
};

const colorCodes: Fig.Arg = {
	name: "color codes",
	description: 'Using format "yMeBg"',
};

// options
const noColors: Fig.Option = {
	name: "--no-colors",
	description: "Suppress colored output",
};

const noAlias: Fig.Option = {
	name: "--no-alias",
	description: "Suppress `nvm alias` output",
};

const silent: Fig.Option = {
	name: "--silent",
	description: "Silences stdout/stderr output",
};

const lts: Fig.Option = {
	name: "--lts",
	description:
		"Uses automatic LTS (long-term support) alias `lts/*`, if available",
};

const ltsWithName: Fig.Option = {
	name: "--lts",
	description: "Uses automatic alias for provided LTS line, if available",
	args: ltsName,
};

const completionSpec: Fig.Spec = {
	name: "nvm",
	description: "Node Package Manager",
	subcommands: [
		{
			name: "install",
			description:
				"Download and install a <version>. Uses .nvmrc if available and version is omitted",
			args: { ...version, isOptional: true },
			options: [
				{
					name: "-s",
					description: "Skip binary download, install from source only",
				},
				{
					name: "--reinstall-packages-from",
					description:
						"When installing, reinstall packages installed in <version>",
					args: version,
				},
				{
					...lts,
					description:
						"When installing, only select from LTS (long-term support) versions",
				},
				{
					...ltsWithName,
					description:
						"When installing, only select from versions for a specific LTS line",
				},
				{
					name: "--skip-default-packages",
					description:
						"When installing, skip the default-packages file if it exists",
				},
				{
					name: "--latest-npm",
					description:
						"After installing, attempt to upgrade to the latest working npm on the given node version",
				},
				{
					name: "--no-progress",
					description: "Disable the progress bar on any downloads",
				},
				{
					name: "--alias",
					description:
						"After installing, set the alias specified to the version specified. (same as: nvm alias <name> <version>)",
					args: name,
				},
				{
					name: "--default",
					description:
						"After installing, set default alias to the version specified. (same as: nvm alias default <version>)",
				},
			],
		},
		{
			name: "uninstall",
			description: "Uninstall a version",
			args: version,
			options: [
				{
					...lts,
					description:
						"Uninstall using automatic LTS (long-term support) alias `lts/*`, if available",
				},
				{
					...ltsWithName,
					description:
						"Uninstall using automatic alias for provided LTS line, if available",
				},
			],
		},
		{
			name: "use",
			description:
				"Modify PATH to use <version>. Uses .nvmrc if available and version is omitted",
			args: { ...version, isOptional: true },
			options: [silent, lts, ltsWithName],
		},
		{
			name: "exec",
			description:
				"Run <command> on <version>. Uses .nvmrc if available and version is omitted",
			args: [{ ...version, isOptional: true }, command],
			options: [silent, lts, ltsWithName],
		},
		{
			name: "run",
			description:
				"Run `node` on <version> with <args> as arguments. Uses .nvmrc if available and version is omitted",
			args: [{ ...version, isOptional: true }, args],
			options: [silent, lts, ltsWithName],
		},
		{
			name: "current",
			description: "Display currently activated version of Node",
		},
		{
			name: "ls",
			description:
				"List installed versions, matching a given <version> if provided",
			args: version,
			options: [noColors, noAlias],
		},
		{
			name: "ls-remote",
			description:
				"List remote versions available for install, matching a given <version> if provided",
			args: version,
			options: [
				{
					...lts,
					description:
						"When listing, only show LTS (long-term support) versions",
				},
				{
					...ltsWithName,
					description:
						"When listing, only show versions for a specific LTS line",
				},
				noColors,
			],
		},
		{
			name: "version",
			description: "Resolve the given description to a single local version",
			args: version,
		},
		{
			name: "version-remote",
			description: "Resolve the given description to a single remote version",
			args: version,
			options: [
				{
					...lts,
					description:
						"When listing, only show LTS (long-term support) versions",
				},
				{
					...ltsWithName,
					description:
						"When listing, only show versions for a specific LTS line",
				},
			],
		},
		{
			name: "deactivate",
			description: "Undo effects of `nvm` on current shell",
			options: [silent],
		},
		{
			name: "alias",
			description:
				"Show all aliases beginning with <pattern> or Set an alias named <name> pointing to <version>",
			args: [
				{
					name: "pattern or name",
					description: "Pattern or name",
				},
				{
					name: "version",
					isOptional: true,
				},
			],
		},
		{
			name: "unalias",
			description: "Deletes the alias named <name>",
			args: name,
		},
		{
			name: "install-latest-npm",
			description:
				"Attempt to upgrade to the latest working `npm` on the current node version",
		},
		{
			name: "reinstall-packages",
			description:
				"Reinstall global `npm` packages contained in <version> to current version",
			args: version,
		},
		{
			name: "unload",
			description: "Unload `nvm` from shell",
		},
		{
			name: "which",
			description:
				"Display path to installed node version. Uses .nvmrc if available and version is omitted",
			args: { ...version, isOptional: true },
			subcommands: [
				{
					name: "current",
				},
			],
			options: [
				{
					...silent,
					description:
						"Silences stdout/stderr output when a version is omitted",
				},
			],
		},
		{
			name: "cache",
			args: {
				suggestions: [
					{
						name: "dir",
						description: "Display path to the cache directory for nvm",
						type: "subcommand",
					},
					{
						name: "clear",
						description: "Empty cache directory for nvm",
						type: "subcommand",
					},
				],
			},
		},
		{
			name: "set-colors",
			description:
				'Set five text colors using format "yMeBg". Available when supported',
			args: colorCodes,
		},
	],
	options: [
		{
			name: "--help",
			description: "Show help page",
		},
		{
			name: "--version",
			description: "Print out the installed version of nvm",
		},
		noColors,
	],
};

export default completionSpec;
