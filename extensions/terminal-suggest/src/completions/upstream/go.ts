const buildModeSuggestions: Fig.Suggestion[] = [
	{
		name: "archive",
		description: "Build the listed non-main packages into .a files",
	},
	{
		name: "c-archive",
		description:
			"Build the listed main package, plus all packages it imports, into a C archive file",
	},
	{
		name: "c-shared",
		description:
			"Build the listed main package, plus all packages it imports, into a C shared library",
	},
	{
		name: "default",
		description:
			"Listed main packages are built into executables and listed non-main packages are built into .a files",
	},
	{
		name: "shared",
		description:
			"Combine all the listed non-main packages into a single shared library that will be used when building with the -linkshared option",
	},
	{
		name: "exe",
		description:
			"Build the listed main packages and everything they import into executables",
	},
	{
		name: "pie",
		description:
			"Build the listed main packages and everything they import into position independent executables (PIE)",
	},
	{
		name: "plugin",
		description:
			"Build the listed main packages, plus all packages that they import, into a Go plugin",
	},
];

const resolutionAndExecutionOptions: Fig.Option[] = [
	{
		name: "-n",
		description: "Print the commands but do not run them",
	},
	{
		name: "-v",
		description: "Print the names of packages as they are compiled",
	},
	{
		name: "-x",
		description: "Print the commands",
	},
	{
		name: "-tags",
		description:
			"A comma-separated list of build tags to consider satisfied during the build",
		args: {
			name: "tags",
		},
	},
	{
		name: "-toolexec",
		insertValue: "-toolexec '{cursor}'",
		description:
			"A program to use to invoke toolchain programs like vet and asm",
		args: {
			name: "cmd",
		},
	},
];

const globalOptions: Fig.Option[] = [
	...resolutionAndExecutionOptions,
	{
		name: "-a",
		description: "Force rebuilding of packages that are already up-to-date",
	},
	{
		name: "-p",
		description: "The number of programs, such as build commands or",
		args: {
			name: "programs",
		},
	},
	{
		name: "-race",
		description: `Enable data race detection.
Supported only on linux/amd64, freebsd/amd64, darwin/amd64, windows/amd64,
linux/ppc64le and linux/arm64 (only for 48-bit VMA)`,
	},
	{
		name: "-msan",
		description: `Enable interoperation with memory sanitizer.
Supported only on linux/amd64, linux/arm64
and only with Clang/LLVM as the host C compiler.
On linux/arm64, pie build mode will be used`,
	},
	{
		name: "-work",
		description: `Print the name of the temporary work directory and
do not delete it when exiting`,
	},
	{
		name: "-asmflags",
		insertValue: "-asmflags='{cursor}'",
		description: "Arguments to pass on each go tool asm invocation",
		args: {
			name: "flag",
			isVariadic: true,
		},
	},
	{
		name: "-buildmode",
		description: "Build mode to use. See 'go help buildmode' for more",
		args: {
			name: "mode",
			suggestions: buildModeSuggestions,
		},
	},
	{
		name: "-compiler",
		description:
			"Name of compiler to use, as in runtime.Compiler (gccgo or gc)",
		args: {
			name: "name",
		},
	},
	{
		name: "-gccgoflags",
		insertValue: "--gccgoflags='{cursor}'",
		description: "Arguments to pass on each gccgo compiler/linker invocation",
		args: {
			name: "flag",
			isVariadic: true,
		},
	},
	{
		name: "-gcflags",
		insertValue: "-gcflags='{cursor}'",
		description: "Arguments to pass on each go tool compile invocation",
		args: {
			name: "flag",
			isVariadic: true,
		},
	},
	{
		name: "-installsuffix",
		description:
			"A suffix to use in the name of the package installation directory,",
		args: {
			name: "suffix",
		},
	},
	{
		name: "-ldflags",
		insertValue: "-ldflags='{cursor}'",
		description: "Arguments to pass on each go tool link invocation",
		args: {
			name: "flag",
			isVariadic: true,
		},
	},
	{
		name: "-linkshared",
		description:
			"Build code that will be linked against shared libraries previously",
	},
	{
		name: "-mod",
		description: "Module download mode to use: readonly, vendor, or mod",
		args: {
			name: "mode",
			suggestions: [
				{
					name: "readonly",
				},
				{
					name: "vendor",
				},
				{
					name: "mod",
				},
			],
		},
	},
	{
		name: "-modcacherw",
		description:
			"Leave newly-created directories in the module cache read-write",
	},
	{
		name: "-modfile",
		description:
			"In module aware mode, read (and possibly write) an alternate go.mod file instead of the one in the module root directory",
		args: {
			name: "file",
		},
	},
	{
		name: "-overlay",
		description:
			"Read a JSON config file that provides an overlay for build operations",
		args: {
			name: "file",
		},
	},
	{
		name: "-pkgdir",
		description:
			"Install and load all packages from dir instead of the usual locations",
		args: {
			name: "dir",
		},
	},
	{
		name: "-trimpath",
		description: "Remove all file system paths from the resulting executable",
	},
];

const packagesArg: Fig.Arg = {
	name: "packages",
	isVariadic: true,
	isOptional: true,
	template: ["filepaths"],
};

const completionSpec: Fig.Spec = {
	name: "go",
	description: "Go is a tool for managing Go source code",
	parserDirectives: {
		flagsArePosixNoncompliant: true,
	},
	subcommands: [
		{
			name: "bug",
			description: "Start a bug report",
		},
		{
			name: "build",
			description: "Compile packages and dependencies",
			options: [
				...globalOptions,
				{
					name: "-o",
					description:
						"Write the resulting executable or object to the named output file or directory",
					args: {
						template: ["filepaths", "folders"],
					},
				},
				{
					name: "-i",
					description:
						"Install the packages that are dependencies of the target",
				},
			],
			args: packagesArg,
		},
		{
			name: "clean",
			description: "Remove object files and cached files",
			options: [
				...globalOptions,
				{
					name: "-i",
					description: "Remove the corresponding installed archive or binary",
				},
				{
					name: "-r",
					description:
						"Apply recursively to all the dependencies of the packages named by the import paths",
				},
				{
					name: "-cache",
					description: "Remove the entire go build cache",
				},
				{
					name: "-testcache",
					description: "Expire all test results in the go build cache",
				},
				{
					name: "-modcache",
					description:
						"Remove the entire module download cache, including unpacked source code of versioned dependencies",
				},
			],
		},
		{
			name: "doc",
			description: "Show documentation for package or symbol",
			options: [
				{
					name: "-all",
					description: "Show all the documentation for the package",
				},
				{
					name: "-c",
					description: "Respect case when matching symbols",
				},
				{
					name: "-cmd",
					description:
						"Treat a command (package main) like a regular package. Otherwise package main's exported symbols are hidden when showing the package's top-level documentation",
				},
				{
					name: "-short",
					description: "One-line representation for each symbol",
				},
				{
					name: "-src",
					description: "Show the full source code for the symbol",
				},
				{
					name: "-u",
					description:
						"Show documentation for unexported as well as exported symbols, methods, and fields",
				},
			],
			args: {
				name: "package",
			},
		},
		{
			name: "env",
			description: "Print Go environment information",
			options: [
				{
					name: "-json",
					description:
						"Prints the environment in JSON format instead of as a shell script",
				},
				{
					name: "-u",
					description:
						"Unset the default setting for the named environment variables",
					args: {
						isVariadic: true,
					},
				},
				{
					name: "-w",
					description:
						"Change the default settings of the named environment variables to the given values",
					args: {
						isVariadic: true,
					},
				},
			],
		},
		{
			name: "fix",
			description: "Update packages to use new APIs",
			args: packagesArg,
		},
		{
			name: "fmt",
			description: "Gofmt (reformat) package sources",
			options: [
				{
					name: "-n",
					description: "Print the commands that would be executed",
				},
				{
					name: "-x",
					description: "Print the commands as they are executed",
				},
				{
					name: "-mod",
					description: "Which module download mode to use",
					args: {
						name: "mode",
						suggestions: [
							{
								name: "readonly",
							},
							{
								name: "vendor",
							},
						],
					},
				},
			],
			args: packagesArg,
		},
		{
			name: "generate",
			description: "Generate Go files by processing source",
			options: [
				...globalOptions,
				{
					name: "-run",
					insertValue: '-run "{cursor}"',
					description:
						"Specifies a regular expression to select directives whose full original source text matches the expression",
				},
			],
		},
		{
			name: "get",
			description: "Add dependencies to current module and install them",
			options: [
				...globalOptions,
				{
					name: "-t",
					description:
						"Modules needed to build tests of packages specified on the command line",
				},
				{
					name: "-u",
					description: "Update to newer minor or patch releases when available",
					args: {
						isOptional: true,
						suggestions: [
							{
								name: "patch",
								description: "Update to newer patch releases",
							},
						],
					},
				},
				{
					name: "-insecure",
					description: "Permit fetching from insecure origins",
				},
				{
					name: "-d",
					description:
						"Only update go.mod and download source code needed to build packages",
				},
			],
			args: {
				name: "url",
				isOptional: true,
			},
		},
		{
			name: "install",
			description: "Compile and install packages and dependencies",
			options: [...globalOptions],
			args: {
				name: "packages",
				isVariadic: true,
			},
		},
		{
			name: "list",
			description: "List packages or modules",
			options: [
				...globalOptions,
				{
					name: "-compiled",
					description: "Set CompiledGoFiles to the Go source files",
				},
				{
					name: "-deps",
					description:
						"Terate over not just the named packages but also all their dependencies",
				},
				{
					name: "-f",
					insertValue: "-f '{cursor}'",
					description: "Specify an alternate format for the list",
					args: {
						name: "format",
					},
				},
				{
					name: "-e",
					description:
						"Processes the erroneous packages with the usual printing",
				},
				{
					name: "-export",
					description:
						"Set the Export field to the name of a file containing up-to-date export information for the given package",
				},
				{
					name: "-find",
					description:
						"Identify the named packages but not resolve their dependencies",
				},
				{
					name: "-test",
					description: "Report test binaries",
				},
				{
					name: "-m",
					description: "List modules instead of packages",
				},
				{
					name: "-u",
					description: "Add information about available upgrades",
				},
				{
					name: "-versions",
					description:
						"Set the Module's Versions field to a list of all known versions of that module",
				},
				{
					name: "-retracted",
					description: "Eport information about retracted module versions",
				},
			],
			args: {
				isOptional: true,
			},
		},
		{
			name: "mod",
			description: "Module maintenance",
			subcommands: [
				{
					name: "download",
					description: "Download the named modules into the module cache",
					options: [
						{
							name: "-json",
							description:
								"Print a sequence of JSON objects to standard output, describing each downloaded module (or failure)",
						},
						{
							name: "-x",
							description:
								"Print the commands download executes to standard error",
						},
					],
					args: {
						name: "modules",
						isVariadic: true,
					},
				},
				{
					name: "edit",
					description: "Edit and format go.mod files",
					options: [
						{
							name: "-module",
							description: "Change the module's path",
						},
						{
							name: "-go",
							requiresSeparator: true,
							description: "Set the expected Go language version",
							args: {
								name: "version",
							},
						},
						{
							name: "-require",
							requiresSeparator: true,
							description: "Add a requirement on the given module",
							args: {
								name: "path",
							},
						},
						{
							name: "-droprequire",
							requiresSeparator: true,
							description: "Drop a requirement on the given module",
							args: {
								name: "path",
							},
						},
						{
							name: "-exclude",
							requiresSeparator: true,
							description: "Add an exclusion on the given module",
							args: {
								name: "path",
							},
						},
						{
							name: "-dropexclude",
							requiresSeparator: true,
							description: "Drop an exclusion on the given module",
							args: {
								name: "path",
							},
						},
						{
							name: "-replace",
							requiresSeparator: true,
							description:
								"Add a replacement of the given module path and version pair",
							args: {
								name: "path",
							},
						},
						{
							name: "-dropreplace",
							requiresSeparator: true,
							description:
								"Drops a replacement of the given module path and version pair",
							args: {
								name: "path",
							},
						},
						{
							name: "-retract",
							requiresSeparator: true,
							description: "Add a retraction for the given version",
							args: {
								name: "version",
							},
						},
						{
							name: "-dropretract",
							requiresSeparator: true,
							description: "Drop a retraction for the given version",
							args: {
								name: "version",
							},
						},
						{
							name: "-fmt",
							description:
								"Format the go.mod file without making other changes",
						},
						{
							name: "-print",
							description:
								"Print the final go.mod in its text format instead of writing it back to disk",
						},
						{
							name: "-json",
							description:
								"Print the final go.mod in JSON format instead of writing it back to disk in text forma",
						},
					],
				},
				{
					name: "graph",
					description: "Print the module requirement graph",
				},
				{
					name: "init",
					description:
						"Initialize and write a new go.mod file in the current directory",
					args: {
						name: "module path",
						isOptional: true,
					},
				},
				{
					name: "tidy",
					description:
						"Ensure that the go.mod file matches the source code in the module",
					options: [
						{
							name: "-e",
							description:
								"Attempt to proceed despite errors encountered while loading packages",
						},
						{
							name: "-v",
							description: "Print information about removed modules",
						},
					],
				},
				{
					name: "vendor",
					description:
						"Construct a directory named vendor in the main module's root directory",
					options: [
						{
							name: "-e",
							description:
								"Attempt to proceed despite errors encountered while loading packages",
						},
						{
							name: "-v",
							description: "Print information about removed modules",
						},
					],
				},
				{
					name: "verify",
					description:
						"Check that dependencies of the main module stored in the module cache have not been modified since they were downloaded",
				},
				{
					name: "why",
					description:
						"Show a shortest path in the import graph from the main module to each of the listed packages",
					options: [
						{
							name: "-m",
							description: "Treat its arguments as a list of modules",
						},
						{
							name: "-vendor",
							description:
								"Ignore imports in tests of packages outside the main module",
						},
					],
					args: {
						name: "packages",
						isVariadic: true,
					},
				},
			],
		},
		{
			name: "work",
			description: "Workspace maintenance",
			subcommands: [
				{
					name: "edit",
					description: "Edit go.work from tools or scripts",
					options: [
						{
							name: "-fmt",
							description:
								"The -fmt flag reformats the go.work file without making other changes. This reformatting is also implied by any other modifications that use or rewrite the go.mod file. The only time this flag is needed is if no other flags are specified, as in 'go work edit -fmt'",
						},
						{
							name: "-use",
							requiresSeparator: true,
							description:
								"The -use=path and -dropuse=path flags add and drop a use directive from the go.work file's set of module directories",
							args: {
								name: "path",
							},
						},
						{
							name: "-dropuse",
							requiresSeparator: true,
							description:
								"The -use=path and -dropuse=path flags add and drop a use directive from the go.work file's set of module directories",
							args: {
								name: "path",
							},
						},
						{
							name: "-replace",
							requiresSeparator: true,
							description:
								"The -replace=old[@v]=new[@v] flag adds a replacement of the given module path and version pair. If the @v in old@v is omitted, a replacement without a version on the left side is added, which applies to all versions of the old module path. If the @v in new@v is omitted, the new path should be a local module root directory, not a module path. Note that -replace overrides any redundant replacements for old[@v], so omitting @v will drop existing replacements for specific versions",
							args: {
								name: "old[@v]=new[@v]",
							},
						},
						{
							name: "-dropreplace",
							requiresSeparator: true,
							description:
								"The -dropreplace=old[@v] flag drops a replacement of the given module path and version pair. If the @v is omitted, a replacement without a version on the left side is dropped",
							args: {
								name: "old[@v]",
							},
						},
						{
							name: "-go",
							requiresSeparator: true,
							description: "Set the expected Go language version",
							args: {
								name: "version",
							},
						},
						{
							name: "-print",
							description:
								"The -print flag prints the final go.work in its text format instead of writing it back to go.mod",
						},
						{
							name: "-json",
							description:
								"The -json flag prints the final go.work file in JSON format instead of writing it back to go.mod",
						},
					],
				},
				{
					name: "init",
					description: "Initialize workspace file",
					args: {
						name: "moddirs",
						isVariadic: true,
					},
				},
				{
					name: "sync",
					description: "Sync workspace build list to modules",
				},
				{
					name: "use",
					description: "Add modules to workspace file",
					options: [
						{
							name: "-r",
							description:
								"The -r flag searches recursively for modules in the argument directories, and the use command operates as if each of the directories were specified as arguments: namely, use directives will be added for directories that exist, and removed for directories that do not exist",
						},
					],
					args: {
						name: "moddirs",
						isVariadic: true,
					},
				},
			],
		},
		{
			name: "run",
			description: "Compile and run Go program",
			options: [
				...globalOptions,
				{
					name: "-exec",
					description: "Invoke the binary using xprog",
					args: {},
				},
			],
			args: {
				name: "package",
				isScript: true,
			},
		},
		{
			name: "test",
			description: "Test packages",
			options: [
				...globalOptions,
				{
					name: "-args",
					description:
						"Pass the remainder of the command line to the test binary",
					args: {
						isVariadic: true,
					},
				},
				{
					name: "-c",
					description: "Compile the test binary to pkg.test but do not run it",
				},
				{
					name: "-exec",
					description: "Invoke the binary using xprog",
					args: {},
				},
				{
					name: "-i",
					description: "Install packages that are dependencies of the test",
				},
				{
					name: "-json",
					description: "Convert test output to JSON suitable",
				},
				{
					name: "-o",
					description: "Compile the test binary to the named file",
					args: {
						name: "file",
						template: "filepaths",
					},
				},
			],
		},
		{
			name: "tool",
			description: "Run specified go tool",
			options: [
				{
					name: "-n",
					description:
						"Print the command that would be executed but not execute it",
				},
			],
			args: {
				name: "tool",
				generators: {
					script: ["go", "tool"],
					splitOn: "\n",
				},
			},
		},
		{
			name: "version",
			description: "Print Go version",
			options: [
				{
					name: "-m",
					description:
						"Print each executable's embedded module version information",
				},
				{
					name: "-v",
					description: "Report unrecognized files",
				},
			],
			args: {
				name: "file",
				isOptional: true,
			},
		},
		{
			name: "vet",
			description: "Report likely mistakes in packages",
			options: [
				...resolutionAndExecutionOptions,
				{
					name: "-vettool",
					requiresSeparator: true,
					description:
						"Select a different analysis tool with alternative or additional checks",
					args: {
						name: "tool",
					},
				},
			],
			args: {
				name: "package",
				isOptional: true,
			},
		},
	],
};

export default completionSpec;
