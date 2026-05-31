const gemfileGemsGenerator: Fig.Generator = {
	script: ["bundle", "list", "--name-only"],
	postProcess: (out) => {
		return out.split("\n").map((gem) => {
			return {
				name: gem,
				icon: "📦",
				description: "Gem",
			};
		});
	},
};

const completionSpec: Fig.Spec = {
	name: "bundle",
	description: "Ruby Dependency Management",
	subcommands: [
		// Primary Commands
		{
			name: "install",
			description: "Install the gems specified by the Gemfile or Gemfile.lock",
			options: [
				{
					name: "--binstubs",
					args: { template: "folders" },
					description: "Create binstubs in dir",
				},
				{ name: "--clean", description: "Remove unused gems after install" },
				{ name: "--deployment", description: "For Production and CI use" },
				{
					name: ["--force", "--redownload"],
					description: "Redownload all gems",
				},
				{ name: "--frozen", description: "Do not allow lock file to update" },
				{ name: "--full-index", description: "Cache the full index locally" },
				{
					name: "--gemfile",
					args: { template: "filepaths" },
					description: "The gemfile to use",
				},
				{
					name: "--jobs",
					args: {},
					description: "Maximum number of parallel installs",
				},
				{
					name: "--local",
					description: "Use only gems already downloaded or cached",
				},
				{ name: "--no-cache", description: "Do not use vendor/cache" },
				{ name: "--no-prune", description: "Do not remove stale gems" },
				{
					name: "--path",
					args: { template: "folders" },
					description: "Path the install gems too",
				},
				{ name: "--quiet", description: "Do not print to stdout" },
				{
					name: "--retry",
					args: {},
					description: "Retry failed network requests N times",
				},
				{
					name: "--shebang",
					args: {},
					description: "Uses the specified ruby executable for binstubs",
				},
				{
					name: "--standalone",
					args: {},
					description:
						"Makes a bundle that can work without depending on Rubygems or Bundler at runtime",
				},
				{ name: "--system", description: "Use system Rubygems location" },
				{
					name: "--trust-policy",
					args: {},
					description: "Apply the Rubygems security policy",
				},
				{ name: "--with", args: {}, description: "Groups to install" },
				{ name: "--without", args: {}, description: "Groups to NOT install" },
			],
		},
		{
			name: "update",
			description: "Update dependencies to their latest versions",
			args: {
				name: "gem",
				generators: gemfileGemsGenerator,
				isOptional: true,
			},
			options: [
				{
					name: "--all",
					description: "Update all gems specified in Gemfile",
				},
				{
					name: ["--group", "-g"],
					description: "Only update the gems in the specified group",
					args: {},
				},
				{
					name: "--source",
					description: "The name of a :git or :path source used in the Gemfile",
					args: {},
				},
				{
					name: "--local",
					description: "Use only gems already downloaded or cached",
				},
				{
					name: "--ruby",
					description:
						"Update the locked version of Ruby to the current version of Ruby",
				},
				{
					name: "--bundler",
					description:
						"Update the locked version of bundler to the invoked bundler version",
				},
				{
					name: "--full-index",
					description: "Fall back to using the single-file index of all gems",
				},
				{
					name: ["--jobs", "-j"],
					description:
						"Specify the number of jobs to run in parallel. The default is 1",
					args: {},
				},
				{
					name: "--retry",
					description: "Retry failed network or git requests for number times",
					args: {},
				},
				{ name: "--quiet", description: "Only output warnings and errors" },
				{
					name: ["--force", "--redownload"],
					description: "Force downloading every gem",
				},
				{
					name: "--patch",
					description: "Prefer updating only to next patch version",
				},
				{
					name: "--minor",
					description: "Prefer updating only to next minor version",
				},
				{
					name: "--major",
					description: "Prefer updating to next major version (default)",
				},
				{
					name: "--strict",
					description:
						"Do not allow any gem to be updated past latest --patch | --minor | --major",
				},
				{
					name: "--conservative",
					description: "Do not allow shared dependencies to be updated",
				},
			],
		},
		{
			name: "package",
			description:
				"Package the .gem files required by your application into the vendor/cache directory",
		},
		{
			name: "exec",
			description: "Execute a command in the context of the bundle",
			options: [
				{
					name: "--keep-file-descriptors",
					description: "Pass all file descriptors to the new process",
				},
			],
			args: { isCommand: true },
		},
		{ name: "config", args: {} },
		{ name: "help" },

		// Utility Commands
		{
			name: "add",
			description: "Add gem to the Gemfile and run bundle install",
			args: {},
			options: [
				{
					name: ["--version", "-v"],
					description: "Specify version requirements",
				},
				{
					name: ["--group", "-g"],
					description: "Specify the group(s) for the added gem",
				},
				{
					name: ["--source", "-s"],
					description: "Specify the source",
				},
				{
					name: "--skip-install",
					description: "Adds the gem to the Gemfile but does not install it",
				},
				{
					name: "--optimistic",
					description: "Adds optimistic declaration of version",
				},
				{
					name: "--strict",
					description: "Adds strict declaration of version",
				},
			],
		},
		{
			name: "binstubs",
			description: "Install the binstubs of the listed gems",
			args: {},
			options: [
				{
					name: "--force",
					description: "Overwrite existing binstubs",
				},
				{
					name: "--path",
					description: "The location to install the specified binstubs to",
				},
				{
					name: "--standalone",
					description:
						"Makes binstubs that can work without depending on Rubygems or Bundler at runtime",
				},
				{
					name: "--shebang",
					description:
						"Specify a different shebang executable name than the default",
				},
			],
		},
		{
			name: "check",
			description:
				"Determine whether the requirements for your application are installed and available to Bundler",
			options: [
				{
					name: "--dry-run",
					description: "Locks the Gemfile before running the command",
				},
				{
					name: "--gemfile",
					description: "Use the specified gemfile instead of the Gemfile",
				},
				{
					name: "--path",
					description: "Specify a different path than the system default",
				},
			],
		},
		{
			name: "show",
			description: "Show the source location of a particular gem in the bundle",
			args: {
				name: "gem",
				generators: gemfileGemsGenerator,
				isOptional: true,
			},
			options: [
				{
					name: "--paths",
					description:
						"List the paths of all gems that are required by your Gemfile",
				},
			],
		},
		{
			name: "outdated",
			description: "Show all of the outdated gems in the current bundle",
			options: [
				{
					name: "--local",
					description:
						"Do not attempt to fetch gems remotely and use the gem cache instead",
				},
				{ name: "--pre", description: "Check for newer pre-release gems" },
				{ name: "--source", description: "Check against a specific source" },
				{
					name: "--strict",
					description:
						"Only list newer versions allowed by your Gemfile requirements",
				},
				{
					name: ["--parseable", "--porcelain"],
					description: "Use minimal formatting for more parseable output",
				},
				{ name: "--group", description: "List gems from a specific group" },
				{ name: "--groups", description: "List gems organized by groups" },
				{
					name: "--update-strict",
					description:
						"Strict conservative resolution, do not allow any gem to be updated past latest --patch | --minor| --major",
				},
				{
					name: "--minor",
					description: "Prefer updating only to next minor version",
				},
				{
					name: "--major",
					description: "Prefer updating to next major version (default)",
				},
				{
					name: "--patch",
					description: "Prefer updating only to next patch version",
				},
				{
					name: "--filter-major",
					description: "Only list major newer versions",
				},
				{
					name: "--filter-minor",
					description: "Only list minor newer versions",
				},
				{
					name: "--filter-patch",
					description: "Only list patch newer versions",
				},
				{
					name: "--only-explicit",
					description:
						"Only list gems specified in your Gemfile, not their dependencies",
				},
			],
		},
		{
			name: "console",
			description: "Start an IRB session in the current bundle",
		},
		{
			name: "open",
			description: "Open an installed gem in the editor",
			args: {
				name: "gem",
				generators: gemfileGemsGenerator,
			},
		},
		{
			name: "lock",
			description: "Generate a lockfile for your dependencies",
			options: [
				{
					name: "--update",
					description: "Ignores the existing lockfile",
					args: {},
				},
				{
					name: "--local",
					description: "Do not attempt to connect to rubygems.org",
				},
				{
					name: "--print",
					description:
						"Prints the lockfile to STDOUT instead of writing to the file\n system",
				},
				{
					name: "--lockfile",
					description: "The path where the lockfile should be written to",
					args: { name: "path" },
				},
				{
					name: "--full-index",
					description: "Fall back to using the single-file index of all gems",
				},
				{
					name: "--add-platform",
					description:
						"Add a new platform to the lockfile, re-resolving for the addi-\n tion of that platform",
				},
				{
					name: "--remove-platform",
					description: "Remove a platform from the lockfile",
				},
				{
					name: "--patch",
					description:
						"If updating, prefer updating only to next patch version",
				},
				{
					name: "--minor",
					description:
						"If updating, prefer updating only to next minor version",
				},
				{
					name: "--major",
					description:
						"If updating, prefer updating to next major version (default)",
				},
				{
					name: "--strict",
					description:
						"If updating, do not allow any gem to be updated past latest --patch | --minor | --major",
				},
				{
					name: "--conservative",
					description:
						"If updating, use bundle install conservative update behavior and do not allow shared dependencies to be updated",
				},
			],
		},
		{
			name: "viz",
			description: "Generate a visual representation of your dependencies",
			options: [
				{
					name: ["--file", "-f"],
					description:
						"The name to use for the generated file. See --format option",
				},
				{
					name: ["--format", "-F"],
					description: "This is output format option",
				},
				{
					name: ["--requirements", "-R"],
					description: "Set to show the version of each required dependency",
				},
				{
					name: ["--version", "-v"],
					description: "Set to show each gem version",
				},
				{
					name: ["--without", "-W"],
					description:
						"Exclude gems that are part of the specified named group",
				},
			],
		},
		{
			name: "init",
			description: "Generate a simple Gemfile, placed in the current directory",
			options: [
				{
					name: "--gemspec",
					description: "Use the specified .gemspec to create the Gemfile",
				},
			],
		},
		{
			name: "gem",
			description: "Create a simple gem, suitable for development with Bundler",
			options: [
				{
					name: ["--exe", "-b", "--bin"],
					description: "Specify that Bundler should create a binary executable",
				},
				{
					name: "--no-exe",
					description: "Do not create a binary",
				},
				{
					name: "--coc",
					description:
						"Add a CODE_OF_CONDUCT.md file to the root of the generated project",
				},
				{
					name: "--no-coc",
					description: "Do not create a CODE_OF_CONDUCT.md",
				},
				{
					name: "--ext",
					description:
						"Add boilerplate for C extension code to the generated project",
				},
				{
					name: "--no-ext",
					description: "Do not add C extension code",
				},
				{
					name: "--mit",
					description: "Add an MIT license",
				},
				{
					name: "--no-mit",
					description: "Do not create a LICENSE.txt",
				},
				{
					name: ["-t", "--test"],
					description: "Specify the test framework that Bundler should use",
					args: {},
				},
				{
					name: ["-e", "--edit"],
					description: "Open the resulting gemspec in EDITOR",
					args: {},
				},
			],
		},
		{
			name: "platform",
			description: "Display platform compatibility information",
			options: [
				{
					name: "--ruby",
					description:
						"It will display the ruby directive information so you don't have to parse it from the Gemfile",
				},
			],
		},
		{
			name: "clean",
			description: "Clean up unused gems in your Bundler directory",
			options: [
				{
					name: "--dry-run",
					description: "Print the changes, but do not clean the unused gems",
				},
				{
					name: "--force",
					description: "Force a clean even if --path is not set",
				},
			],
		},
		{
			name: "doctor",
			description: "Display warnings about common problems",
			options: [
				{ name: "--quiet", description: "Only output warnings and errors" },
				{
					name: "--gemfile",
					description: "The location of the Gemfile which Bundler should use",
					args: {},
				},
			],
		},
	],
	options: [
		{ name: "--no-color", description: "Print all output without color" },
		{
			name: ["--retry", "-r"],
			description:
				"Specify the number of times you wish to attempt network commands",
		},
		{
			name: ["--verbose", "-V"],
			description: "Print out additional logging information",
		},
	],
};

export default completionSpec;
