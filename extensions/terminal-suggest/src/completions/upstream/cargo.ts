import { filepaths } from '../../helpers/filepaths';
import { keyValue } from '../../helpers/keyvalue';

const rustEditions: Fig.Suggestion[] = [
	{
		name: "2015",
		description: "2015 edition",
	},
	{
		name: "2018",
		description: "2018 edition",
	},
	{
		name: "2021",
		description: "2021 edition",
	},
];

const vcsOptions: {
	name: string;
	icon: string;
	description: string;
}[] = [
	{
		name: "git",
		icon: "fig://icon?type=git",
		description: "Initialize with Git",
	},
	{
		name: "hg",
		icon: "⚗️",
		description: "Initialize with Mercurial",
	},
	{
		name: "pijul",
		icon: "🦜",
		description: "Initialize with Pijul",
	},
	{
		name: "fossil",
		icon: "🦴",
		description: "Initialize with Fossil",
	},
	{
		name: "none",
		icon: "🚫",
		description: "Initialize with no VCS",
	},
];

// TODO(grant): add this back but better with no awk
// const testGenerator: Fig.Generator = {
//   cache: {
//     cacheByDirectory: true,
//     strategy: "stale-while-revalidate",
//     ttl: 1000 * 60 * 5,
//   },
//   script: (context) => {
//     const base = context[context.length - 1];
//     // allow split by single colon so that it triggers on a::b:
//     const indexIntoModPath = Math.max(base.split(/::?/).length, 1);
//     // split by :: so that tokens with a single colon are allowed
//     const moduleTokens = base.split("::");
//     const lastModule = moduleTokens.pop();
//     // check if the token has a : on the end
//     const hasColon = lastModule[lastModule.length - 1] == ":" ? ":" : "";
//     return `cargo t -- --list | awk '/: test$/ { print substr($1, 1, length($1) - 1) }' | awk -F "::" '{ print "${hasColon}"$${indexIntoModPath},int( NF / ${indexIntoModPath} ) }'`;
//   },
//   postProcess: (out) => {
//     return [...new Set(out.split("\n"))].map((line) => {
//       const [display, last] = line.split(" ");
//       const lastModule = parseInt(last);
//       const displayName = display.replaceAll(":", "");
//       const name = displayName.length
//         ? `${display}${lastModule ? "" : "::"}`
//         : "";
//       return { name, displayName };
//     });
//   },
//   trigger: ":",
//   getQueryTerm: ":",
// };

type Metadata = {
	packages: Package[];
	resolve: Resolve;
	workspace_root: string;
};

type Package = {
	name: string;
	version: string;
	id: string;
	description?: string;
	source?: string;
	targets: Target[];
	dependencies: Dependency[];
};

type Target = {
	name: string;
	src_path: string;
	kind: TargetKind[];
};

type Dependency = {
	name: string;
	req: string;
	kind: "dev" | "build" | null;
	target: string | null;
};

type TargetKind = "lib" | "bin" | "example" | "test" | "bench" | "custom-build";

type Resolve = {
	root?: string;
};

const rootPackageOrLocal = (manifest: Metadata) => {
	const rootManifestPath = `${manifest.workspace_root}/Cargo.toml`;

	const rootPackage = manifest.packages.find(
		(pkg) => pkg.source === rootManifestPath
	);
	return rootPackage
		? [rootPackage]
		: manifest.packages.filter((pkg) => !pkg.source);
};

const packageGenerator: Fig.Generator = {
	script: ["cargo", "metadata", "--format-version", "1", "--no-deps"],
	postProcess: (data) => {
		const manifest: Metadata = JSON.parse(data);
		return manifest.packages.map((pkg) => {
			return {
				icon: "📦",
				name: pkg.name,
				description: `${pkg.version}${
					pkg.description ? ` - ${pkg.description}` : ""
				}`,
			};
		});
	},
};

const directDependencyGenerator: Fig.Generator = {
	script: ["cargo", "metadata", "--format-version", "1"],
	postProcess: (data: string) => {
		const manifest: Metadata = JSON.parse(data);
		const packages = rootPackageOrLocal(manifest);
		const deps = packages
			.flatMap((pkg) => pkg.dependencies)
			.map((dep) => ({
				name: dep.name,
				description: dep.req,
			}));
		return [...new Map(deps.map((dep) => [dep.name, dep])).values()];
	},
};

const targetGenerator: ({ kind }: { kind?: TargetKind }) => Fig.Generator = ({
	kind,
}) => ({
	custom: async (_, executeShellCommand, context) => {
		const { stdout } = await executeShellCommand({
			command: "cargo",
			args: ["metadata", "--format-version", "1", "--no-deps"],
		});
		const manifest: Metadata = JSON.parse(stdout);
		const packages = rootPackageOrLocal(manifest);

		let targets = packages.flatMap((pkg) => pkg.targets);

		if (kind) {
			targets = targets.filter((target) => target.kind.includes(kind));
		}

		return targets.map((pkg) => {
			const path = pkg.src_path.replace(context.currentWorkingDirectory, "");
			return {
				icon: "🎯",
				name: pkg.name,
				description: path,
			};
		});
	},
});

const dependencyGenerator: Fig.Generator = {
	script: ["cargo", "metadata", "--format-version", "1"],
	postProcess: (data: string) => {
		const metadata: Metadata = JSON.parse(data);
		return metadata.packages.map((pkg) => ({
			name: pkg.name,
			description: pkg.description,
		}));
	},
};

const featuresGenerator: Fig.Generator = {
	script: ["cargo", "read-manifest"],
	postProcess: (data: string) => {
		const manifest = JSON.parse(data);
		return Object.keys(manifest.features || {}).map((name) => ({
			icon: "🎚",
			name,
			description: `Features: [${manifest.features[name].join(", ")}]`,
		}));
	},
};

const makeTasksGenerator: Fig.Generator = {
	custom: async function (tokens, executeCommand) {
		let makefileLocation = "Makefile.toml";

		const makefileFlagIdx = tokens.findIndex((param) => param === "--makefile");
		if (makefileFlagIdx !== -1 && tokens.length > makefileFlagIdx + 1)
			makefileLocation = tokens[makefileFlagIdx + 1];

		const args = [makefileLocation];
		const { stdout } = await executeCommand({
			command: "cat",
			args,
		});

		const taskRegex = /\[tasks\.([^\]]+)\]/g;
		let match;
		const tasks = [];

		while ((match = taskRegex.exec(stdout)) !== null) {
			tasks.push({
				name: match[1],
			});
		}

		return tasks;
	},
};

type CrateSearchResults = {
	crates: Crate[];
};

type Crate = {
	description?: string;
	name: string;
	newest_version: string;
	recent_downloads: number;
};

type VersionSearchResults = {
	versions: Version[];
};

type Version = {
	num: string;
	downloads: number;
	created_at: string;
	yanked: boolean;
};

// Search for crates
// If context is empty, return the most downloaded crates for the search term,
// if there is an `@` in the context, return the versions for the crate
export const searchGenerator: Fig.Generator = {
	custom: async (context, executeShellCommand) => {
		const numberFormatter = new Intl.NumberFormat(undefined, {
			notation: "compact",
			compactDisplay: "short",
			maximumSignificantDigits: 3,
		});

		const lastToken = context[context.length - 1];
		if (lastToken.includes("@") && !lastToken.startsWith("@")) {
			const [crate, _version] = lastToken.split("@");
			const query = encodeURIComponent(crate);
			const { stdout } = await executeShellCommand({
				command: "curl",
				args: ["-sfL", `https://crates.io/api/v1/crates/${query}/versions`],
			});
			const json: VersionSearchResults = JSON.parse(stdout);

			return json.versions.map((version) => ({
				name: `${crate}@${version.num}`,
				insertValue: `${version.num}`,
				description: `${numberFormatter.format(
					version.downloads
				)} downloads - ${new Date(version.created_at).toLocaleDateString()}`,
				hidden: version.yanked,
			}));
		} else if (lastToken.length > 0) {
			const query = encodeURIComponent(lastToken);
			const [{ stdout: remoteStdout }, { stdout: localStdout }] =
				await Promise.all([
					executeShellCommand({
						command: "curl",
						args: [
							"-sfL",
							`https://crates.io/api/v1/crates?q=${query}&per_page=60`,
						],
					}),
					executeShellCommand({
						command: "cargo",
						args: ["metadata", "--format-version", "1", "--no-deps"],
					}),
				]);

			const remoteJson: CrateSearchResults = JSON.parse(remoteStdout);
			const remoteSuggustions: Fig.Suggestion[] = remoteJson.crates
				.sort((a, b) => b.recent_downloads - a.recent_downloads)
				.map((crate) => ({
					icon: "📦",
					displayName: `${crate.name}@${crate.newest_version}`,
					name: crate.name,
					description: `${numberFormatter.format(crate.recent_downloads)}${
						crate.description ? ` - ${crate.description}` : ""
					}`,
				}));

			let localSuggestions: Fig.Suggestion[] = [];
			if (localStdout.trim().length > 0) {
				const localJson: Metadata = JSON.parse(localStdout);
				localSuggestions = localJson.packages
					.filter((pkg) => !pkg.source)
					.map((pkg) => ({
						icon: "📦",
						displayName: `${pkg.name}@${pkg.version}`,
						name: pkg.name,
						description: `Local Crate ${pkg.version}${
							pkg.description ? ` - ${pkg.description}` : ""
						}`,
					}));
			}

			return remoteSuggustions.concat(localSuggestions);
		} else {
			return [];
		}
	},
	trigger: (oldTokens, newTokens) => {
		const atIndexOld = oldTokens.indexOf("@");
		const atIndexNew = newTokens.indexOf("@");
		return (
			(atIndexOld === -1 && atIndexNew === -1) || atIndexOld !== atIndexNew
		);
	},
	getQueryTerm: "@",
};

const tripleGenerator: Fig.Generator = {
	script: ["rustc", "--print", "target-list"],
	postProcess: (data: string) => {
		return data
			.split("\n")
			.filter((line) => line.trim() !== "")
			.map((name) => ({
				name,
			}));
	},
};

const tomlBool: Fig.Suggestion[] = [
	{
		name: "true",
	},
	{
		name: "false",
	},
];

const configPairs: Record<
	string,
	Omit<Fig.Suggestion, "name"> & {
		tomlSuggestions?: Fig.Suggestion[];
	}
> = {
	"build.jobs": {
		description:
			"Sets the maximum number of compiler processes to run in parallel",
	},
	"build.rustc": {
		description: "Path to the rustc compiler",
	},
	"build.rustc-wrapper": {
		description: "Sets a wrapper to execute instead of rustc",
	},
	"build.target": {
		description: "The default target platform triples to compile to",
	},
	"build.target-dir": {
		description: "The path to where all compiler output is placed",
	},
	"build.rustflags": {
		description: "Extra command-line flags to pass to rustc",
	},
	"build.rustdocflags": {
		description: "Extra command-line flags to pass to rustdoc",
	},
	"build.incremental": {
		description: "Whether or not to perform incremental compilation",
		tomlSuggestions: tomlBool,
	},
	"build.dep-info-basedir": {
		description: "Strips the given path prefix from dep info file paths",
	},
	"doc.browser": {
		description:
			"This option sets the browser to be used by cargo doc, overriding the BROWSER environment variable when opening documentation with the --open option",
	},
	"cargo-new.vcs": {
		description:
			"Specifies the source control system to use for initializing a new repository",
		tomlSuggestions: vcsOptions.map((vcs) => ({
			...vcs,
			name: `\\"${vcs.name}\\"`,
			insertValue: `\\"${vcs.name}\\"`,
		})),
	},
	"future-incompat-report.frequency": {
		description:
			"Controls how often we display a notification to the terminal when a future incompat report is available",
		tomlSuggestions: [
			{
				name: '\\"always\\"',
				// eslint-disable-next-line @withfig/fig-linter/no-useless-insertvalue
				insertValue: '\\"always\\"',
				description:
					"Always display a notification when a command (e.g. cargo build) produces a future incompat report",
			},
			{
				name: '\\"never\\"',
				// eslint-disable-next-line @withfig/fig-linter/no-useless-insertvalue
				insertValue: '\\"never\\"',
				description: "Never display a notification",
			},
		],
	},
	"http.debug": {
		description: "If true, enables debugging of HTTP requests",
		tomlSuggestions: tomlBool,
	},
	"http.proxy": {
		description: "Sets an HTTP and HTTPS proxy to use",
	},
	"http.timeout": {
		description: "Sets the timeout for each HTTP request, in seconds",
	},
	"http.cainfo": {
		description: "Sets the path to a CA certificate bundle",
	},
	"http.check-revoke": {
		description:
			"This determines whether or not TLS certificate revocation checks should be performed. This only works on Windows",
		tomlSuggestions: tomlBool,
	},
	"http.ssl-version": {
		description: "This sets the minimum TLS version to use",
	},
	"http.low-speed-limit": {
		description: "This setting controls timeout behavior for slow connections",
	},
	"http.multiplexing": {
		description:
			"When `true`, Cargo will attempt to use the HTTP2 protocol with multiplexing",
		tomlSuggestions: tomlBool,
	},
	"http.user-agent": {
		description: "Specifies a custom user-agent header to use",
	},
	"install.root": {
		description:
			"Sets the path to the root directory for installing executables for `cargo install`",
	},
	"net.retry": {
		description: "Number of times to retry possibly spurious network errors",
	},
	"net.git-fetch-with-cli": {
		description:
			"If this is `true`, then Cargo will use the git executable to fetch registry indexes and git dependencies. If `false`, then it uses a built-in git library",
		tomlSuggestions: tomlBool,
	},
	"net.offline": {
		description:
			"If this is true, then Cargo will avoid accessing the network, and attempt to proceed with locally cached data",
		tomlSuggestions: tomlBool,
	},
};

// Configs are in the format `key=value` where value is a toml value
const configGenerator: Fig.Generator = keyValue({
	keys: Object.entries(configPairs).map(([key, other]) => ({
		name: key,
		...other,
	})),
	values: async (tokens, execute) => {
		const key = tokens[tokens.length - 1].split("=")?.[0];
		const pair = configPairs[key];
		if (pair?.tomlSuggestions) {
			return pair.tomlSuggestions;
		}
	},
	separator: "=",
});

const completionSpec: (toolchain?: boolean) => Fig.Spec = (
	toolchain = true
) => ({
	name: "cargo",
	icon: "📦",
	description: "CLI Interface for Cargo",
	subcommands: [
		{
			name: "bench",
			icon: "📊",
			description: "Execute all benchmarks of a local package",
			options: [
				{
					name: "--bin",
					description: "Benchmark only the specified binary",
					isRepeatable: true,
					args: {
						name: "bin",
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bin" }),
						isVariadic: true,
					},
				},
				{
					name: "--example",
					description: "Benchmark only the specified example",
					isRepeatable: true,
					args: {
						name: "example",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "example" }),
					},
				},
				{
					name: "--test",
					description: "Benchmark only the specified test target",
					isRepeatable: true,
					args: {
						name: "test",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "test" }),
					},
				},
				{
					name: "--bench",
					description: "Benchmark only the specified bench target",
					isRepeatable: true,
					args: {
						name: "bench",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bench" }),
					},
				},
				{
					name: ["-p", "--package"],
					description: "Package to run benchmarks for",
					isRepeatable: true,
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--exclude",
					description: "Exclude packages from the benchmark",
					isRepeatable: true,
					args: {
						name: "exclude",
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--profile",
					description: "Build artifacts with the specified profile",
					args: {
						name: "profile",
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,
						isVariadic: true,
					},
				},
				{
					name: "--target",
					description: "Build for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--message-format",
					description: "Error format",
					isRepeatable: true,
					args: {
						name: "message-format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["auto", "always", "never"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--lib",
					description: "Benchmark only this package's library",
				},
				{
					name: "--bins",
					description: "Benchmark all binaries",
				},
				{
					name: "--examples",
					description: "Benchmark all examples",
				},
				{
					name: "--tests",
					description: "Benchmark all tests",
				},
				{
					name: "--benches",
					description: "Benchmark all benches",
				},
				{
					name: "--all-targets",
					description: "Benchmark all targets",
				},
				{
					name: "--no-run",
					description: "Compile, but don't run benchmarks",
				},
				{
					name: "--workspace",
					description: "Benchmark all packages in the workspace",
				},
				{
					name: "--all",
					description: "Alias for --workspace (deprecated)",
					hidden: true,
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--ignore-rust-version",
					description: "Ignore `rust-version` specification in packages",
				},
				{
					name: "--no-fail-fast",
					description: "Run all benchmarks regardless of failure",
				},
				{
					name: "--unit-graph",
					description: "Output build graph in JSON (unstable)",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: "--timings",
					description: "Timing output formats (unstable)",
				},
			],
			args: [
				{
					name: "BENCHNAME",
				},
				{
					name: "args",
					isVariadic: true,
				},
			],
		},
		{
			name: ["build", "b"],
			icon: "📦",
			description: "Compile a local package and all of its dependencies",
			options: [
				{
					name: ["-p", "--package"],
					description: "Package to build (see `cargo help pkgid`)",
					isRepeatable: true,
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--exclude",
					description: "Exclude packages from the build",
					isRepeatable: true,
					args: {
						name: "exclude",
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--bin",
					description: "Build only the specified binary",
					isRepeatable: true,
					args: {
						name: "bin",
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bin" }),
						isVariadic: true,
					},
				},
				{
					name: "--example",
					description: "Build only the specified example",
					isRepeatable: true,
					args: {
						name: "example",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "example" }),
					},
				},
				{
					name: "--test",
					description: "Build only the specified test target",
					isRepeatable: true,
					args: {
						name: "test",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "test" }),
					},
				},
				{
					name: "--bench",
					description: "Build only the specified bench target",
					isRepeatable: true,
					args: {
						name: "bench",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bench" }),
					},
				},
				{
					name: "--profile",
					description: "Build artifacts with the specified profile",
					args: {
						name: "profile",
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,
						isVariadic: true,
					},
				},
				{
					name: "--target",
					description: "Build for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--out-dir",
					description: "Copy final artifacts to this directory (unstable)",
					args: {
						name: "out-dir",
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--message-format",
					description: "Error format",
					isRepeatable: true,
					args: {
						name: "message-format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["auto", "always", "never"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--workspace",
					description: "Build all packages in the workspace",
				},
				{
					name: "--all",
					description: "Alias for --workspace (deprecated)",
					hidden: true,
				},
				{
					name: "--lib",
					description: "Build only this package's library",
				},
				{
					name: "--bins",
					description: "Build all binaries",
				},
				{
					name: "--examples",
					description: "Build all examples",
				},
				{
					name: "--tests",
					description: "Build all tests",
				},
				{
					name: "--benches",
					description: "Build all benches",
				},
				{
					name: "--all-targets",
					description: "Build all targets",
				},
				{
					name: ["-r", "--release"],
					description: "Build artifacts in release mode, with optimizations",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--ignore-rust-version",
					description: "Ignore `rust-version` specification in packages",
				},
				{
					name: "--build-plan",
					description: "Output the build plan in JSON (unstable)",
				},
				{
					name: "--unit-graph",
					description: "Output build graph in JSON (unstable)",
				},
				{
					name: "--future-incompat-report",
					description:
						"Outputs a future incompatibility report at the end of the build",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: "--timings",
					description: "Timing output formats (unstable)",
				},
			],
		},
		{
			name: ["check", "c"],
			icon: "🛠",
			description:
				"Check a local package and all of its dependencies for errors",
			options: [
				{
					name: ["-p", "--package"],
					description: "Package(s) to check",
					isRepeatable: true,
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--exclude",
					description: "Exclude packages from the check",
					isRepeatable: true,
					args: {
						name: "exclude",
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--bin",
					description: "Check only the specified binary",
					isRepeatable: true,
					args: {
						name: "bin",
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bin" }),
						isVariadic: true,
					},
				},
				{
					name: "--example",
					description: "Check only the specified example",
					isRepeatable: true,
					args: {
						name: "example",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "example" }),
					},
				},
				{
					name: "--test",
					description: "Check only the specified test target",
					isRepeatable: true,
					args: {
						name: "test",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "test" }),
					},
				},
				{
					name: "--bench",
					description: "Check only the specified bench target",
					isRepeatable: true,
					args: {
						name: "bench",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bench" }),
					},
				},
				{
					name: "--profile",
					description: "Check artifacts with the specified profile",
					args: {
						name: "profile",
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,
						isVariadic: true,
					},
				},
				{
					name: "--target",
					description: "Check for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--message-format",
					description: "Error format",
					isRepeatable: true,
					args: {
						name: "message-format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["auto", "always", "never"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--workspace",
					description: "Check all packages in the workspace",
				},
				{
					name: "--all",
					description: "Alias for --workspace (deprecated)",
					hidden: true,
				},
				{
					name: "--lib",
					description: "Check only this package's library",
				},
				{
					name: "--bins",
					description: "Check all binaries",
				},
				{
					name: "--examples",
					description: "Check all examples",
				},
				{
					name: "--tests",
					description: "Check all tests",
				},
				{
					name: "--benches",
					description: "Check all benches",
				},
				{
					name: "--all-targets",
					description: "Check all targets",
				},
				{
					name: ["-r", "--release"],
					description: "Check artifacts in release mode, with optimizations",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--ignore-rust-version",
					description: "Ignore `rust-version` specification in packages",
				},
				{
					name: "--unit-graph",
					description: "Output build graph in JSON (unstable)",
				},
				{
					name: "--future-incompat-report",
					description:
						"Outputs a future incompatibility report at the end of the build",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: "--timings",
					description: "Timing output formats (unstable)",
				},
			],
		},
		{
			name: "clean",
			icon: "🛠",
			description: "Remove artifacts that cargo has generated in the past",
			options: [
				{
					name: ["-p", "--package"],
					description: "Package to clean artifacts for",
					isRepeatable: true,
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--target",
					description: "Target triple to clean output for",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--profile",
					description: "Clean artifacts of the specified profile",
					args: {
						name: "profile",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["auto", "always", "never"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-r", "--release"],
					description: "Whether or not to clean release artifacts",
				},
				{
					name: "--doc",
					description:
						"Whether or not to clean just the documentation directory",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "config",
			icon: "⚙️",
			description: "Inspect configuration values",
			subcommands: [
				{
					name: "get",
					options: [
						{
							name: "--format",
							description: "Display format",
							args: {
								name: "format",
								suggestions: ["toml", "json", "json-value"],
							},
						},
						{
							name: "--merged",
							description: "Whether or not to merge config values",
							args: {
								name: "merged",
								suggestions: ["yes", "no"],
							},
						},
						{
							name: "--color",
							description: "Coloring: auto, always, never",
							args: {
								name: "color",
								suggestions: ["auto", "always", "never"],
							},
						},
						{
							name: "--config",
							description: "Override a configuration value",
							isRepeatable: true,
							args: {
								name: "config",
								generators: configGenerator,
							},
						},
						{
							name: "-Z",
							description:
								"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
							isRepeatable: true,
							args: {
								name: "unstable-features",
							},
						},
						{
							name: "--version",
							description: "Print version information",
						},
						{
							name: "--show-origin",
							description: "Display where the config value is defined",
						},
						{
							name: ["-h", "--help"],
							description: "Print help information",
						},
						{
							name: ["-v", "--verbose"],
							description:
								"Use verbose output (-vv very verbose/build.rs output)",
							isRepeatable: true,
						},
						{
							name: "--frozen",
							description: "Require Cargo.lock and cache are up to date",
						},
						{
							name: "--locked",
							description: "Require Cargo.lock is up to date",
						},
						{
							name: "--offline",
							description: "Run without accessing the network",
						},
					],
				},
				{
					name: "help",
					description:
						"Print this message or the help of the given subcommand(s)",
					options: [
						{
							name: "--color",
							description: "Coloring: auto, always, never",
							args: {
								name: "color",
								suggestions: ["auto", "always", "never"],
							},
						},
						{
							name: "--config",
							description: "Override a configuration value",
							isRepeatable: true,
							args: {
								name: "config",
								generators: configGenerator,
							},
						},
						{
							name: "-Z",
							description:
								"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
							isRepeatable: true,
							args: {
								name: "unstable-features",
							},
						},
						{
							name: "--version",
							description: "Print version information",
						},
						{
							name: ["-h", "--help"],
							description: "Print help information",
						},
						{
							name: ["-v", "--verbose"],
							description:
								"Use verbose output (-vv very verbose/build.rs output)",
							isRepeatable: true,
						},
						{
							name: "--frozen",
							description: "Require Cargo.lock and cache are up to date",
						},
						{
							name: "--locked",
							description: "Require Cargo.lock is up to date",
						},
						{
							name: "--offline",
							description: "Run without accessing the network",
						},
					],
					args: {
						name: "subcommand",
					},
				},
			],
			options: [
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["auto", "always", "never"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: ["doc", "d"],
			icon: "📄",
			description: "Build a package's documentation",
			options: [
				{
					name: ["-p", "--package"],
					description: "Package to document",
					isRepeatable: true,
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--exclude",
					description: "Exclude packages from the build",
					isRepeatable: true,
					args: {
						name: "exclude",
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--bin",
					description: "Document only the specified binary",
					isRepeatable: true,
					args: {
						name: "bin",
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bin" }),
						isVariadic: true,
					},
				},
				{
					name: "--example",
					description: "Document only the specified example",
					isRepeatable: true,
					args: {
						name: "example",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "example" }),
					},
				},
				{
					name: "--profile",
					description: "Build artifacts with the specified profile",
					args: {
						name: "profile",
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,

						isVariadic: true,
					},
				},
				{
					name: "--target",
					description: "Build for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--message-format",
					description: "Error format",
					isRepeatable: true,
					args: {
						name: "message-format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--open",
					description: "Opens the docs in a browser after the operation",
				},
				{
					name: "--workspace",
					description: "Document all packages in the workspace",
				},
				{
					name: "--all",
					description: "Alias for --workspace (deprecated)",
					hidden: true,
				},
				{
					name: "--no-deps",
					description: "Don't build documentation for dependencies",
				},
				{
					name: "--document-private-items",
					description: "Document private items",
				},
				{
					name: "--lib",
					description: "Document only this package's library",
				},
				{
					name: "--bins",
					description: "Document all binaries",
				},
				{
					name: "--examples",
					description: "Document all examples",
				},
				{
					name: ["-r", "--release"],
					description: "Build artifacts in release mode, with optimizations",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--ignore-rust-version",
					description: "Ignore `rust-version` specification in packages",
				},
				{
					name: "--unit-graph",
					description: "Output build graph in JSON (unstable)",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: "--timings",
					description: "Timing output formats (unstable)",
				},
			],
		},
		{
			name: "fetch",
			icon: "📦",
			description: "Fetch dependencies of a package from the network",
			options: [
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--target",
					description: "Fetch dependencies for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "fix",
			icon: "🔧",
			description: "Automatically fix lint warnings reported by rustc",
			options: [
				{
					name: ["-p", "--package"],
					description: "Package(s) to fix",
					isRepeatable: true,
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--exclude",
					description: "Exclude packages from the fixes",
					isRepeatable: true,
					args: {
						name: "exclude",
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--bin",
					description: "Fix only the specified binary",
					isRepeatable: true,
					args: {
						name: "bin",
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bin" }),
						isVariadic: true,
					},
				},
				{
					name: "--example",
					description: "Fix only the specified example",
					isRepeatable: true,
					args: {
						name: "example",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "example" }),
					},
				},
				{
					name: "--test",
					description: "Fix only the specified test target",
					isRepeatable: true,
					args: {
						name: "test",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "test" }),
					},
				},
				{
					name: "--bench",
					description: "Fix only the specified bench target",
					isRepeatable: true,
					args: {
						name: "bench",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bench" }),
					},
				},
				{
					name: "--profile",
					description: "Build artifacts with the specified profile",
					args: {
						name: "profile",
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,
						isVariadic: true,
					},
				},
				{
					name: "--target",
					description: "Fix for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--message-format",
					description: "Error format",
					isRepeatable: true,
					args: {
						name: "message-format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--workspace",
					description: "Fix all packages in the workspace",
				},
				{
					name: "--all",
					description: "Alias for --workspace (deprecated)",
					hidden: true,
				},
				{
					name: "--lib",
					description: "Fix only this package's library",
				},
				{
					name: "--bins",
					description: "Fix all binaries",
				},
				{
					name: "--examples",
					description: "Fix all examples",
				},
				{
					name: "--tests",
					description: "Fix all tests",
				},
				{
					name: "--benches",
					description: "Fix all benches",
				},
				{
					name: "--all-targets",
					description: "Fix all targets (default)",
				},
				{
					name: ["-r", "--release"],
					description: "Fix artifacts in release mode, with optimizations",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--broken-code",
					description: "Fix code even if it already has compiler errors",
				},
				{
					name: "--edition",
					description: "Fix in preparation for the next edition",
				},
				{
					name: "--edition-idioms",
					description: "Fix warnings to migrate to the idioms of an edition",
				},
				{
					name: "--allow-no-vcs",
					description: "Fix code even if a VCS was not detected",
				},
				{
					name: "--allow-dirty",
					description: "Fix code even if the working directory is dirty",
				},
				{
					name: "--allow-staged",
					description:
						"Fix code even if the working directory has staged changes",
				},
				{
					name: "--ignore-rust-version",
					description: "Ignore `rust-version` specification in packages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: "--timings",
					description: "Timing output formats (unstable)",
				},
			],
		},
		{
			name: "generate-lockfile",
			icon: "📦",
			description: "Generate the lockfile for a package",
			options: [
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "git-checkout",
			icon: "📦",
			description: "This subcommand has been removed",
			hidden: true,
			options: [
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "init",
			icon: "📦",
			description: "Create a new cargo package in an existing directory",
			options: [
				{
					name: "--registry",
					description: "Registry to use",
					args: {
						name: "registry",
					},
				},
				{
					name: "--vcs",
					description:
						"Initialize a new repository for the given version control system (git, hg, pijul, or fossil) or do not initialize any version control at all (none), overriding a global configuration",
					args: {
						name: "vcs",
						suggestions: vcsOptions,
					},
				},
				{
					name: "--edition",
					description: "Edition to set for the crate generated",
					args: {
						name: "edition",
						suggestions: rustEditions,
					},
				},
				{
					name: "--name",
					description:
						"Set the resulting package name, defaults to the directory name",
					args: {
						name: "name",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--bin",
					description: "Use a binary (application) template [default]",
				},
				{
					name: "--lib",
					description: "Use a library template",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
			args: {
				name: "path",
			},
		},
		{
			name: "install",
			icon: "📦",
			description:
				"Install a Rust binary. Default location is $HOME/.cargo/bin",
			options: [
				{
					name: "--version",
					description: "Specify a version to install",
					args: {
						name: "version",
					},
				},
				{
					name: "--git",
					description: "Git URL to install the specified crate from",
					exclusiveOn: ["--path", "--index", "--registry"],
					args: {
						name: "git",
					},
				},
				{
					name: "--branch",
					description: "Branch to use when installing from git",
					args: {
						name: "branch",
					},
				},
				{
					name: "--tag",
					description: "Tag to use when installing from git",
					args: {
						name: "tag",
					},
				},
				{
					name: "--rev",
					description: "Specific commit to use when installing from git",
					args: {
						name: "rev",
					},
				},
				{
					name: "--path",
					description: "Filesystem path to local crate to install",
					exclusiveOn: ["--git", "--index", "--registry"],
					args: {
						name: "path",
						template: "folders",
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,
						isVariadic: true,
					},
				},
				{
					name: "--profile",
					description: "Install artifacts with the specified profile",
					args: {
						name: "profile",
					},
				},
				{
					name: "--bin",
					description: "Install only the specified binary",
					isRepeatable: true,
					args: {
						name: "bin",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bin" }),
					},
				},
				{
					name: "--example",
					description: "Install only the specified example",
					isRepeatable: true,
					args: {
						name: "example",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "example" }),
					},
				},
				{
					name: "--target",
					description: "Build for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--root",
					description: "Directory to install packages into",
					args: {
						name: "root",
					},
				},
				{
					name: "--index",
					description: "Registry index to install from",
					exclusiveOn: ["--git", "--path", "--registry"],
					args: {
						name: "index",
					},
				},
				{
					name: "--registry",
					description: "Registry to use",
					exclusiveOn: ["--git", "--path", "--index"],
					args: {
						name: "registry",
					},
				},
				{
					name: "--message-format",
					description: "Error format",
					isRepeatable: true,
					args: {
						name: "message-format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--list",
					description: "List all installed packages and their versions",
				},
				{
					name: ["-f", "--force"],
					description: "Force overwriting existing crates or binaries",
				},
				{
					name: "--no-track",
					description: "Do not save tracking information",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--debug",
					description: "Build in debug mode instead of release mode",
				},
				{
					name: "--bins",
					description: "Install all binaries",
				},
				{
					name: "--examples",
					description: "Install all examples",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: "--timings",
					description: "Timing output formats (unstable)",
				},
			],
			args: {
				name: "crate",
				generators: searchGenerator,
				filterStrategy: "fuzzy",
				debounce: true,
				isVariadic: true,
				suggestCurrentToken: true,
			},
		},
		{
			name: "locate-project",
			icon: "📦",
			description:
				"Print a JSON representation of a Cargo.toml file's location",
			options: [
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--message-format",
					description: "Output representation [possible values: json, plain]",
					args: {
						name: "message-format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--workspace",
					description: "Locate Cargo.toml of the workspace root",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "login",
			icon: "📦",
			description:
				"Save an api token from the registry locally. If token is not specified, it will be read from stdin",
			options: [
				{
					name: "--registry",
					description: "Registry to use",
					args: {
						name: "registry",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
			args: {
				name: "token",
			},
		},
		{
			name: "logout",
			icon: "📦",
			description: "Remove an API token from the registry locally",
			options: [
				{
					name: "--registry",
					description: "Registry to use",
					args: {
						name: "registry",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "metadata",
			icon: "📦",
			description:
				"Output the resolved dependencies of a package, the concrete used versions including overrides, in machine-readable format",
			options: [
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,
						isVariadic: true,
					},
				},
				{
					name: "--filter-platform",
					description:
						"Only include resolve dependencies matching the given target-triple",
					isRepeatable: true,
					args: {
						name: "filter-platform",
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--format-version",
					description: "Format version",
					args: {
						name: "format-version",
						suggestions: ["1"],
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--no-deps",
					description:
						"Output information only about the workspace members and don't fetch dependencies",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "new",
			icon: "📦",
			description: "Create a new cargo package at <path>",
			options: [
				{
					name: "--registry",
					description: "Registry to use",
					args: {
						name: "registry",
					},
				},
				{
					name: "--vcs",
					description:
						"Initialize a new repository for the given version control system (git, hg, pijul, or fossil) or do not initialize any version control at all (none), overriding a global configuration",
					args: {
						name: "vcs",
						suggestions: vcsOptions,
					},
				},
				{
					name: "--edition",
					description: "Edition to set for the crate generated",
					args: {
						name: "edition",
						suggestions: rustEditions,
					},
				},
				{
					name: "--name",
					description:
						"Set the resulting package name, defaults to the directory name",
					args: {
						name: "name",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--bin",
					description: "Use a binary (application) template [default]",
				},
				{
					name: "--lib",
					description: "Use a library template",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
			args: {
				name: "path",
				template: "folders",
			},
		},
		{
			name: "owner",
			icon: "📦",
			description: "Manage the owners of a crate on the registry",
			options: [
				{
					name: ["-a", "--add"],
					description: "Name of a user or team to invite as an owner",
					isRepeatable: true,
					args: {
						name: "add",
					},
				},
				{
					name: ["-r", "--remove"],
					description: "Name of a user or team to remove as an owner",
					isRepeatable: true,
					args: {
						name: "remove",
					},
				},
				{
					name: "--index",
					description: "Registry index to modify owners for",
					args: {
						name: "index",
					},
				},
				{
					name: "--token",
					description: "API token to use when authenticating",
					args: {
						name: "token",
					},
				},
				{
					name: "--registry",
					description: "Registry to use",
					args: {
						name: "registry",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-l", "--list"],
					description: "List owners of a crate",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
			args: {
				name: "crate",
			},
		},
		{
			name: "package",
			icon: "📦",
			description: "Assemble the local package into a distributable tarball",
			options: [
				{
					name: "--target",
					description: "Build for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,
						isVariadic: true,
					},
				},
				{
					name: ["-p", "--package"],
					description: "Package(s) to assemble",
					isRepeatable: true,
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--exclude",
					description: "Don't assemble specified packages",
					isRepeatable: true,
					args: {
						name: "exclude",
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-l", "--list"],
					description: "Print files included in a package without making one",
				},
				{
					name: "--no-verify",
					description: "Don't verify the contents by building them",
				},
				{
					name: "--no-metadata",
					description: "Ignore warnings about a lack of human-usable metadata",
				},
				{
					name: "--allow-dirty",
					description: "Allow dirty working directories to be packaged",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--workspace",
					description: "Assemble all packages in the workspace",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "pkgid",
			icon: "📦",
			description: "Print a fully qualified package specification",
			options: [
				{
					name: ["-p", "--package"],
					description: "Argument to get the package ID specifier for",
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
			args: {
				name: "SPEC",
				filterStrategy: "fuzzy",
				generators: packageGenerator,
			},
		},
		{
			name: "publish",
			icon: "📦",
			description: "Upload a package to the registry",
			options: [
				{
					name: "--index",
					description: "Registry index URL to upload the package to",
					args: {
						name: "index",
					},
				},
				{
					name: "--token",
					description: "Token to use when uploading",
					args: {
						name: "token",
					},
				},
				{
					name: "--target",
					description: "Build for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: ["-p", "--package"],
					description: "Package to publish",
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,

						isVariadic: true,
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--registry",
					description: "Registry to publish to",
					args: {
						name: "registry",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--no-verify",
					description: "Don't verify the contents by building them",
				},
				{
					name: "--allow-dirty",
					description: "Allow dirty working directories to be packaged",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--dry-run",
					description: "Perform all checks without uploading",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "read-manifest",
			icon: "📦",
			description:
				"Print a JSON representation of a Cargo.toml manifest. Deprecated, use `cargo metadata --no-deps` instead",
			hidden: true,
			options: [
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "report",
			icon: "📦",
			description: "Generate and display various kinds of reports",
			subcommands: [
				{
					name: "future-incompatibilities",
					description:
						"Reports any crates which will eventually stop compiling",
					options: [
						{
							name: "--id",
							description:
								"Identifier of the report generated by a Cargo command invocation",
							args: {
								name: "id",
							},
						},
						{
							name: ["-p", "--package"],
							description: "Package to display a report for",
							args: {
								name: "package",
								isVariadic: true,
								filterStrategy: "fuzzy",
								generators: packageGenerator,
							},
						},
						{
							name: "--color",
							description: "Coloring: auto, always, never",
							args: {
								name: "color",
								suggestions: ["always", "never", "auto"],
							},
						},
						{
							name: "--config",
							description: "Override a configuration value",
							isRepeatable: true,
							args: {
								name: "config",
								generators: configGenerator,
							},
						},
						{
							name: "-Z",
							description:
								"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
							isRepeatable: true,
							args: {
								name: "unstable-features",
							},
						},
						{
							name: "--version",
							description: "Print version information",
						},
						{
							name: ["-h", "--help"],
							description: "Print help information",
						},
						{
							name: ["-v", "--verbose"],
							description:
								"Use verbose output (-vv very verbose/build.rs output)",
							isRepeatable: true,
						},
						{
							name: "--frozen",
							description: "Require Cargo.lock and cache are up to date",
						},
						{
							name: "--locked",
							description: "Require Cargo.lock is up to date",
						},
						{
							name: "--offline",
							description: "Run without accessing the network",
						},
					],
				},
				{
					name: "help",
					description:
						"Print this message or the help of the given subcommand(s)",
					options: [
						{
							name: "--color",
							description: "Coloring: auto, always, never",
							args: {
								name: "color",
								suggestions: ["always", "never", "auto"],
							},
						},
						{
							name: "--config",
							description: "Override a configuration value",
							isRepeatable: true,
							args: {
								name: "config",
								generators: configGenerator,
							},
						},
						{
							name: "-Z",
							description:
								"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
							isRepeatable: true,
							args: {
								name: "unstable-features",
							},
						},
						{
							name: "--version",
							description: "Print version information",
						},
						{
							name: ["-h", "--help"],
							description: "Print help information",
						},
						{
							name: ["-v", "--verbose"],
							description:
								"Use verbose output (-vv very verbose/build.rs output)",
							isRepeatable: true,
						},
						{
							name: "--frozen",
							description: "Require Cargo.lock and cache are up to date",
						},
						{
							name: "--locked",
							description: "Require Cargo.lock is up to date",
						},
						{
							name: "--offline",
							description: "Run without accessing the network",
						},
					],
					args: {
						name: "subcommand",
					},
				},
			],
			options: [
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: ["run", "r"],
			icon: "📦",
			description: "Run a binary or example of the local package",
			options: [
				{
					name: "--bin",
					description: "Name of the bin target to run",
					isRepeatable: true,
					args: {
						name: "bin",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bin" }),
					},
				},
				{
					name: "--example",
					description: "Name of the example target to run",
					isRepeatable: true,
					args: {
						name: "example",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "example" }),
					},
				},
				{
					name: ["-p", "--package"],
					description: "Package with the target to run",
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--profile",
					description: "Build artifacts with the specified profile",
					args: {
						name: "profile",
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,

						isVariadic: true,
					},
				},
				{
					name: "--target",
					description: "Build for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--message-format",
					description: "Error format",
					isRepeatable: true,
					args: {
						name: "message-format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-r", "--release"],
					description: "Build artifacts in release mode, with optimizations",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--unit-graph",
					description: "Output build graph in JSON (unstable)",
				},
				{
					name: "--ignore-rust-version",
					description: "Ignore `rust-version` specification in packages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: "--timings",
					description: "Timing output formats (unstable)",
				},
			],
			args: {
				name: "args",
				isVariadic: true,
				isOptional: true,
			},
		},
		{
			name: "rustc",
			icon: "📦",
			description: "Compile a package, and pass extra options to the compiler",
			options: [
				{
					name: ["-p", "--package"],
					description: "Package to build",
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--bin",
					description: "Build only the specified binary",
					isRepeatable: true,
					args: {
						name: "bin",
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bin" }),
						isVariadic: true,
					},
				},
				{
					name: "--example",
					description: "Build only the specified example",
					isRepeatable: true,
					args: {
						name: "example",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "example" }),
					},
				},
				{
					name: "--test",
					description: "Build only the specified test target",
					isRepeatable: true,
					args: {
						name: "test",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "test" }),
					},
				},
				{
					name: "--bench",
					description: "Build only the specified bench target",
					isRepeatable: true,
					args: {
						name: "bench",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bench" }),
					},
				},
				{
					name: "--profile",
					description: "Build artifacts with the specified profile",
					args: {
						name: "profile",
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,

						isVariadic: true,
					},
				},
				{
					name: "--target",
					description: "Target triple which compiles will be for",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--print",
					description: "Output compiler information without compiling",
					args: {
						name: "print",
					},
				},
				{
					name: "--crate-type",
					description:
						"Comma separated list of types of crates for the compiler to emit",
					isRepeatable: true,
					args: {
						name: "crate-type",
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--message-format",
					description: "Error format",
					isRepeatable: true,
					args: {
						name: "message-format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--lib",
					description: "Build only this package's library",
				},
				{
					name: "--bins",
					description: "Build all binaries",
				},
				{
					name: "--examples",
					description: "Build all examples",
				},
				{
					name: "--tests",
					description: "Build all tests",
				},
				{
					name: "--benches",
					description: "Build all benches",
				},
				{
					name: "--all-targets",
					description: "Build all targets",
				},
				{
					name: ["-r", "--release"],
					description: "Build artifacts in release mode, with optimizations",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--unit-graph",
					description: "Output build graph in JSON (unstable)",
				},
				{
					name: "--ignore-rust-version",
					description: "Ignore `rust-version` specification in packages",
				},
				{
					name: "--future-incompat-report",
					description:
						"Outputs a future incompatibility report at the end of the build",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: "--timings",
					description: "Timing output formats (unstable)",
				},
			],
			args: {
				name: "args",
				isVariadic: true,
			},
		},
		{
			name: "rustdoc",
			icon: "📦",
			description:
				"Build a package's documentation, using specified custom flags",
			options: [
				{
					name: ["-p", "--package"],
					description: "Package to document",
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--bin",
					description: "Build only the specified binary",
					isRepeatable: true,
					args: {
						name: "bin",
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bin" }),
						isVariadic: true,
					},
				},
				{
					name: "--example",
					description: "Build only the specified example",
					isRepeatable: true,
					args: {
						name: "example",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "example" }),
					},
				},
				{
					name: "--test",
					description: "Build only the specified test target",
					isRepeatable: true,
					args: {
						name: "test",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "test" }),
					},
				},
				{
					name: "--bench",
					description: "Build only the specified bench target",
					isRepeatable: true,
					args: {
						name: "bench",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bench" }),
					},
				},
				{
					name: "--profile",
					description: "Build artifacts with the specified profile",
					args: {
						name: "profile",
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,
						isVariadic: true,
					},
				},
				{
					name: "--target",
					description: "Build for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--message-format",
					description: "Error format",
					isRepeatable: true,
					args: {
						name: "message-format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--open",
					description: "Opens the docs in a browser after the operation",
				},
				{
					name: "--lib",
					description: "Build only this package's library",
				},
				{
					name: "--bins",
					description: "Build all binaries",
				},
				{
					name: "--examples",
					description: "Build all examples",
				},
				{
					name: "--tests",
					description: "Build all tests",
				},
				{
					name: "--benches",
					description: "Build all benches",
				},
				{
					name: "--all-targets",
					description: "Build all targets",
				},
				{
					name: ["-r", "--release"],
					description: "Build artifacts in release mode, with optimizations",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--unit-graph",
					description: "Output build graph in JSON (unstable)",
				},
				{
					name: "--ignore-rust-version",
					description: "Ignore `rust-version` specification in packages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: "--timings",
					description: "Timing output formats (unstable)",
				},
			],
			args: {
				name: "args",
				isVariadic: true,
			},
		},
		{
			name: "search",
			icon: "🔎",
			description: "Search packages in crates.io",
			options: [
				{
					name: "--index",
					description: "Registry index URL to upload the package to",
					args: {
						name: "index",
					},
				},
				{
					name: "--limit",
					description: "Limit the number of results (default: 10, max: 100)",
					args: {
						name: "limit",
					},
				},
				{
					name: "--registry",
					description: "Registry to use",
					args: {
						name: "registry",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
			args: {
				name: "query",
				generators: searchGenerator,
				filterStrategy: "fuzzy",
				debounce: true,
				isVariadic: true,
				suggestCurrentToken: true,
			},
		},
		{
			name: ["test", "t"],
			icon: "📦",
			description:
				"Execute all unit and integration tests and build examples of a local package",
			options: [
				{
					name: "--bin",
					description: "Test only the specified binary",
					isRepeatable: true,
					args: {
						name: "bin",
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bin" }),
						isVariadic: true,
					},
				},
				{
					name: "--example",
					description: "Test only the specified example",
					isRepeatable: true,
					args: {
						name: "example",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "example" }),
					},
				},
				{
					name: "--test",
					description: "Test only the specified test target",
					isRepeatable: true,
					args: {
						name: "test",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "test" }),
					},
				},
				{
					name: "--bench",
					description: "Test only the specified bench target",
					isRepeatable: true,
					args: {
						name: "bench",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: targetGenerator({ kind: "bench" }),
					},
				},
				{
					name: ["-p", "--package"],
					description: "Package to run tests for",
					isRepeatable: true,
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--exclude",
					description: "Exclude packages from the test",
					isRepeatable: true,
					args: {
						name: "exclude",
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: ["-j", "--jobs"],
					description: "Number of parallel jobs, defaults to # of CPUs",
					args: {
						name: "jobs",
					},
				},
				{
					name: "--profile",
					description: "Build artifacts with the specified profile",
					args: {
						name: "profile",
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,

						isVariadic: true,
					},
				},
				{
					name: "--target",
					description: "Build for the target triple",
					isRepeatable: true,
					args: {
						name: "target",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: "--target-dir",
					description: "Directory for all generated artifacts",
					args: {
						name: "target-dir",
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--message-format",
					description: "Error format",
					isRepeatable: true,
					args: {
						name: "message-format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["auto", "always", "never"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Display one character per test instead of one line",
				},
				{
					name: "--lib",
					description: "Test only this package's library unit tests",
				},
				{
					name: "--bins",
					description: "Test all binaries",
				},
				{
					name: "--examples",
					description: "Test all examples",
				},
				{
					name: "--tests",
					description: "Test all tests",
				},
				{
					name: "--benches",
					description: "Test all benches",
				},
				{
					name: "--all-targets",
					description: "Test all targets",
				},
				{
					name: "--doc",
					description: "Test only this library's documentation",
				},
				{
					name: "--no-run",
					description: "Compile, but don't run tests",
				},
				{
					name: "--no-fail-fast",
					description: "Run all tests regardless of failure",
				},
				{
					name: "--workspace",
					description: "Test all packages in the workspace",
				},
				{
					name: "--all",
					description: "Alias for --workspace (deprecated)",
					hidden: true,
				},
				{
					name: ["-r", "--release"],
					description: "Build artifacts in release mode, with optimizations",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--ignore-rust-version",
					description: "Ignore `rust-version` specification in packages",
				},
				{
					name: "--unit-graph",
					description: "Output build graph in JSON (unstable)",
				},
				{
					name: "--future-incompat-report",
					description:
						"Outputs a future incompatibility report at the end of the build",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: "--timings",
					description: "Timing output formats (unstable)",
				},
			],
			args: [
				{
					name: "TESTNAME",
					isOptional: true,
				},
				{
					name: "args",
					isOptional: true,
					isVariadic: true,
				},
			],
		},
		{
			name: "tree",
			icon: "📦",
			description: "Display a tree visualization of a dependency graph",
			options: [
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: ["-p", "--package"],
					description: "Package to be used as the root of the tree",
					isRepeatable: true,
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--exclude",
					description: "Exclude specific workspace members",
					isRepeatable: true,
					args: {
						name: "exclude",
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--features",
					description: "Space or comma separated list of features to activate",
					isRepeatable: true,
					args: {
						name: "features",
						generators: featuresGenerator,
						isVariadic: true,
					},
				},
				{
					name: "--target",
					description:
						"Filter dependencies matching the given target-triple (default host platform). Pass `all` to include all targets",
					isRepeatable: true,
					args: {
						name: "target",
						suggestions: ["all"],
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: ["-e", "--edges"],
					description:
						"The kinds of dependencies to display (features, normal, build, dev, all, no-normal, no-build, no-dev, no-proc-macro)",
					isRepeatable: true,
					args: {
						name: "edges",
						suggestions: [
							"features",
							"normal",
							"build",
							"dev",
							"all",
							"no-normal",
							"no-build",
							"no-dev",
							"no-proc-macro",
						],
					},
				},
				{
					name: ["-i", "--invert"],
					description:
						"Invert the tree direction and focus on the given package",
					isRepeatable: true,
					args: {
						name: "invert",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: dependencyGenerator,
					},
				},
				{
					name: "--prune",
					description:
						"Prune the given package from the display of the dependency tree",
					isRepeatable: true,
					args: {
						name: "prune",
						filterStrategy: "fuzzy",
						generators: dependencyGenerator,
					},
				},
				{
					name: "--depth",
					description: "Maximum display depth of the dependency tree",
					args: {
						name: "depth",
					},
				},
				{
					name: "--prefix",
					description:
						"Change the prefix (indentation) of how each entry is displayed",
					args: {
						name: "prefix",
						suggestions: ["depth", "indent", "none"],
					},
				},
				{
					name: "--charset",
					description: "Character set to use in output: utf8, ascii",
					args: {
						name: "charset",
						suggestions: ["utf8", "ascii"],
					},
				},
				{
					name: ["-f", "--format"],
					description: "Format string used for printing dependencies",
					args: {
						name: "format",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["auto", "always", "never"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--workspace",
					description: "Display the tree for all packages in the workspace",
				},
				{
					name: ["-a", "--all"],
				},
				{
					name: "--all-targets",
				},
				{
					name: "--all-features",
					description: "Activate all available features",
				},
				{
					name: "--no-default-features",
					description: "Do not activate the `default` feature",
				},
				{
					name: "--no-dev-dependencies",
				},
				{
					name: "--no-indent",
				},
				{
					name: "--prefix-depth",
				},
				{
					name: "--no-dedupe",
					description: "Do not de-duplicate (repeats all shared dependencies)",
				},
				{
					name: ["-d", "--duplicates"],
					description:
						"Show only dependencies which come in multiple versions (implies -i)",
				},
				{
					name: ["-V", "--version"],
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "uninstall",
			icon: "📦",
			description: "Remove a Rust binary",
			options: [
				{
					name: ["-p", "--package"],
					description: "Package to uninstall",
					isRepeatable: true,
					args: {
						name: "package",
						isVariadic: true,
					},
				},
				{
					name: "--bin",
					description: "Only uninstall the binary NAME",
					isRepeatable: true,
					args: {
						name: "bin",
					},
				},
				{
					name: "--root",
					description: "Directory to uninstall packages from",
					args: {
						name: "root",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["auto", "always", "never"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
			args: {
				name: "SPEC",
				generators: {
					script: [
						"bash",
						"-c",
						`cargo install --list | \\grep -E "^[a-zA-Z\\-]+\\sv" | cut -d ' ' -f 1`,
					],
					splitOn: "\n",
				},
				isVariadic: true,
			},
		},
		{
			name: "update",
			icon: "📦",
			description: "Update dependencies as recorded in the local lock file",
			options: [
				{
					name: ["-p", "--package"],
					description: "Package to update",
					isRepeatable: true,
					args: {
						name: "package",
						isVariadic: true,
						filterStrategy: "fuzzy",
						generators: dependencyGenerator,
					},
				},
				{
					name: "--precise",
					description:
						"Update a single dependency to exactly PRECISE when used with -p",
					dependsOn: ["--package", "-p"],
					args: {
						name: "precise",
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-w", "--workspace"],
					description: "Only update the workspace packages",
				},
				{
					name: "--aggressive",
					description:
						"Force updating all dependencies of SPEC as well when used with -p",
				},
				{
					name: "--dry-run",
					description: "Don't actually write the lockfile",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "vendor",
			icon: "📦",
			description: "Vendor all dependencies for a project locally",
			options: [
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: ["-s", "--sync"],
					description: "Additional `Cargo.toml` to sync and vendor",
					isRepeatable: true,
					args: {
						name: "tomls",
						isVariadic: true,
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--no-delete",
					description: "Don't delete older crates in the vendor directory",
				},
				{
					name: "--respect-source-config",
					description: "Respect `[source]` config in `.cargo/config`",
					isRepeatable: true,
				},
				{
					name: "--versioned-dirs",
					description: "Always include version in subdir name",
				},
				{
					name: "--no-merge-sources",
				},
				{
					name: "--relative-path",
				},
				{
					name: "--only-git-deps",
				},
				{
					name: "--disallow-duplicates",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
			args: {
				name: "path",
			},
		},
		{
			name: "verify-project",
			icon: "📦",
			description: "Check correctness of crate manifest",
			options: [
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "manifest-path",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "version",
			icon: "📦",
			description: "Show version information",
			options: [
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
		},
		{
			name: "yank",
			icon: "📦",
			description: "Remove a pushed crate from the index",
			options: [
				{
					name: "--vers",
					description: "The version to yank or un-yank",
					args: {
						name: "vers",
					},
				},
				{
					name: "--index",
					description: "Registry index to yank from",
					args: {
						name: "index",
					},
				},
				{
					name: "--token",
					description: "API token to use when authenticating",
					args: {
						name: "token",
					},
				},
				{
					name: "--registry",
					description: "Registry to use",
					args: {
						name: "registry",
					},
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--undo",
					description: "Undo a yank, putting a version back into the index",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
			args: {
				name: "crate",
			},
		},
		{
			name: "help",
			icon: "📦",
			description: "Print this message or the help of the given subcommand(s)",
			options: [
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "color",
						suggestions: ["always", "never", "auto"],
					},
				},
				{
					name: "--config",
					description: "Override a configuration value",
					isRepeatable: true,
					args: {
						name: "config",
						generators: configGenerator,
					},
				},
				{
					name: "-Z",
					description:
						"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
					isRepeatable: true,
					args: {
						name: "unstable-features",
					},
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output (-vv very verbose/build.rs output)",
					isRepeatable: true,
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
			],
			args: {
				name: "subcommand",
			},
		},
		{
			name: "add",
			icon: "📦",
			description: "Add dependencies to a Cargo.toml manifest file",
			options: [
				{
					name: "--no-default-features",
					description: "Disable the default features",
				},
				{
					name: "--default-features",
					description: "Re-enable the default features",
				},
				{
					name: ["-F", "--features"],
					description: "Space or comma separated list of features to activate",
				},
				{
					name: "--optional",
					description: "Mark the dependency as optional",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output",
				},
				{
					name: "--no-optional",
					description: "Mark the dependency as required",
				},
				{
					name: "--color",
					args: {
						name: "WHEN",
						suggestions: ["auto", "always", "never"],
					},
				},
				{
					name: "--rename",
					description: "Rename the dependency",
					args: {
						name: "NAME",
					},
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: ["-p", "--package"],
					description: "Package to modify",
					args: {
						name: "SPEC",
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--dry-run",
					description: "Don't actually write the manifest",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: "--path",
					description: "Filesystem path to local crate to add",
					args: {
						name: "PATH",
						template: "folders",
					},
				},
				{
					name: "--git",
					description: "Git repository location",
					args: {
						name: "URI",
					},
				},
				{
					name: "--branch",
					description: "Git branch to download the crate from",
					dependsOn: ["--git"],
					args: {
						name: "BRANCH",
					},
				},
				{
					name: "--tag",
					description: "Git tag to download the crate from",
					dependsOn: ["--git"],
					args: {
						name: "TAG",
					},
				},
				{
					name: "--rev",
					description: "Git reference to download the crate from",
					dependsOn: ["--git"],
					args: {
						name: "REV",
					},
				},
				{
					name: "--registry",
					description: "Package registry for this dependency",
					args: {
						name: "NAME",
					},
				},
				{
					name: "--dev",
					description: "Add as development dependency",
				},
				{
					name: "--build",
					description: "Add as build dependency",
				},
				{
					name: "--target",
					description: "Add as dependency to the given target platform",
					args: {
						name: "TARGET",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
			],
			args: {
				name: "DEP_ID",
				generators: searchGenerator,
				filterStrategy: "fuzzy",
				debounce: true,
				isVariadic: true,
				suggestCurrentToken: true,
			},
		},
		{
			name: ["remove", "rm"],
			icon: "📦",
			description: "Remove dependencies from a Cargo.toml manifest file",
			options: [
				{
					name: "--dev",
					description: "Remove as development dependency",
				},
				{
					name: "--build",
					description: "Remove as build dependency",
				},
				{
					name: "--target",
					description: "Remove as dependency to the given target platform",
					args: {
						name: "TARGET",
						filterStrategy: "fuzzy",
						generators: tripleGenerator,
					},
				},
				{
					name: ["-p", "--package"],
					description: "Package to remove from",
					args: {
						name: "SPEC",
						filterStrategy: "fuzzy",
						generators: packageGenerator,
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
				},
				{
					name: ["-q", "--quiet"],
					description: "Do not print cargo log messages",
				},
				{
					name: "--dry-run",
					description: "Don't actually write the manifest",
				},
				{
					name: ["-v", "--verbose"],
					description: "Use verbose output",
				},
				{
					name: "--color",
					args: {
						name: "WHEN",
						suggestions: ["auto", "always", "never"],
					},
				},
				{
					name: "--frozen",
					description: "Require Cargo.lock and cache are up to date",
				},
				{
					name: "--locked",
					description: "Require Cargo.lock is up to date",
				},
				{
					name: "--offline",
					description: "Run without accessing the network",
				},
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
			],
			args: {
				name: "DEP_ID",
				generators: directDependencyGenerator,
				filterStrategy: "fuzzy",
				isVariadic: true,
			},
		},
	],
	options: [
		{
			name: "--explain",
			description: "Run `rustc --explain CODE`",
			args: {
				name: "explain",
			},
		},
		{
			name: "--color",
			description: "Coloring: auto, always, never",
			args: {
				name: "color",
				suggestions: ["always", "never", "auto"],
			},
		},
		{
			name: "--config",
			description: "Override a configuration value",
			isRepeatable: true,
			args: {
				name: "config",
				generators: configGenerator,
			},
		},
		{
			name: "-Z",
			description:
				"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
			isRepeatable: true,
			args: {
				name: "unstable-features",
			},
		},
		{
			name: ["-h", "--help"],
			description: "Print help information",
		},
		{
			name: ["-V", "--version"],
			description: "Print version info and exit",
		},
		{
			name: "--list",
			description: "List installed commands",
		},
		{
			name: ["-v", "--verbose"],
			description: "Use verbose output (-vv very verbose/build.rs output)",
			isRepeatable: true,
		},
		{
			name: ["-q", "--quiet"],
			description: "Do not print cargo log messages",
		},
		{
			name: "--frozen",
			description: "Require Cargo.lock and cache are up to date",
		},
		{
			name: "--locked",
			description: "Require Cargo.lock is up to date",
		},
		{
			name: "--offline",
			description: "Run without accessing the network",
		},
	],
	generateSpec: async (_tokens, executeShellCommand) => {
		const [{ stdout: toolchainStdout }, { stdout: listOutput }] =
			await Promise.all([
				executeShellCommand({
					command: "rustup",
					args: ["toolchain", "list"],
				}),
				// eslint-disable-next-line @withfig/fig-linter/no-useless-arrays
				executeShellCommand({ command: "cargo", args: ["--list"] }),
			]);

		const toolchains: Fig.Option[] = toolchainStdout
			.split("\n")
			.map((toolchain) => {
				return {
					icon: "🧰",
					name: `+${toolchain.split("-")[0]}`,
					description: toolchain,
				};
			});

		const subcommands: Fig.Subcommand[] = [];
		const commands = listOutput
			.split("\n")
			.filter((_, i) => i != 0)
			.map((line) => line.trim().split(/\s+/, 1)[0]);

		if (commands.includes("fmt")) {
			const fmt: Fig.Subcommand = {
				name: "fmt",
				icon: "🛠",
				description:
					"This utility formats all bin and lib files of the current crate using rustfmt",
				subcommands: [
					{
						name: "--",
						description: "All other arguments are passed to rustfmt",
						args: {
							generators: filepaths({
								extensions: ["rs"],
							}),
						},
						options: [
							{
								name: "--check",
								description:
									"Run in 'check' mode. Exits with 0 if input is formatted correctly. Exits with 1 and prints a diff if formatting is required",
							},
							{
								name: "--emit",
								description: "What data to emit and how",
								args: {
									suggestions: ["files", "stdout"],
								},
							},
							{
								name: "--backup",
								description: "Backup any modified files",
							},
							{
								name: "--config-path",
								description: "Path for the configuration file",
								args: {
									generators: filepaths({
										equals: ["rustfmt.toml"],
									}),
								},
							},
							{
								name: "--edition",
								description: "Rust edition to use",
								args: {
									suggestions: rustEditions,
								},
							},
							{
								name: "--print-config",
								description: "Dumps a default or minimal config to PATH",
								args: [
									{
										name: "verbosity",
										suggestions: ["default", "minimal", "current"],
									},
									{
										name: "PATH",
										template: "filepaths",
									},
								],
							},
							{
								name: ["-l", "--files-with-diff"],
								description:
									"Prints the names of mismatched files that were formatted",
							},
						],
					},
				],
				options: [
					{
						name: "--check",
						description: "Run rustfmt in check mode",
					},
					{
						name: "--all",
						description:
							"Format all packages, and also their local path-based dependencies",
					},
					{
						name: ["-h", "--help"],
						description: "Print help information",
					},
					{
						name: ["-q", "--quiet"],
						description: "No output printed to stdout",
					},
					{
						name: ["-v", "--verbose"],
						description: "Use verbose output",
					},
					{
						name: "--version",
						description: "Print rustfmt version and exit",
					},
					{
						name: "--manifest-path",
						description: "Specify path to Cargo.toml",
						args: {
							name: "manifest-path",
							generators: filepaths({
								equals: ["Cargo.toml"],
							}),
						},
					},
					{
						name: "--message-format",
						description: "Specify message-format",
						args: {
							name: "message-format",
							suggestions: ["short", "json", "human"],
						},
					},
					{
						name: ["-p", "--package"],
						description: "Specify package to format",
						args: {
							name: "package",
							filterStrategy: "fuzzy",
							generators: packageGenerator,
						},
					},
				],
			};
			subcommands.push(fmt);
		}

		if (commands.includes("clippy")) {
			const clippy: Fig.Subcommand = {
				name: "clippy",
				icon: "📎",
				description: "Runs the Clippy linter",
				subcommands: [
					{
						name: "--",
						description: "All other arguments are passed to clippy",
						options: [
							{
								name: ["-W", "--warn"],
								description: "Set lint warnings",
								args: {},
							},
							{
								name: ["-A", "--allow"],
								description: "Set lint allowed",
								args: {},
							},
							{
								name: ["-D", "--deny"],
								description: "Set lint denied",
								args: {},
							},
							{
								name: ["-F", "--forbid"],
								description: "Set lint forbidden",
								args: {},
							},
						],
					},
				],
				options: [
					{
						name: "--no-deps",
						description:
							"Run Clippy only on the given crate, without linting the dependencies",
					},
					{
						name: "--fix",
						description:
							"Automatically apply lint suggestions. This flag implies `--no-deps`",
					},
					{
						name: "--allow-dirty",
						description:
							"Allow fix to apply even if the working directory is dirty",
						dependsOn: ["--fix"],
					},
					{
						name: "--allow-staged",
						description:
							"Allow fix to apply even if the working directory has staged changes",
						dependsOn: ["--fix"],
					},
				],
			};
			subcommands.push(clippy);
		}

		if (commands.includes("flamegraph")) {
			const flamegraph: Fig.Subcommand = {
				name: "flamegraph",
				icon: "🔥",
				description: "Generates a flamegraph of the current crate",
				options: [
					{
						name: "--deterministic",
						description:
							"Colors are selected such that the color of a function does not change between runs",
					},
					{
						name: "--dev",
						description: "Build with the dev profile",
					},
					{
						name: ["-i", "--inverted"],
						description: "Plot the flame graph up-side-down",
					},
					{
						name: "--no-default-features",
						description: "Disable default features",
					},
					{
						name: "--open",
						description: "Open the output .svg file with default program",
					},
					{
						name: "--reverse",
						description: "Generate stack-reversed flame graph",
					},
					{
						name: "--root",
						description: "Run with root privileges (using `sudo`)",
					},
					{
						name: "--no-inline",
						description:
							"Disable inlining for perf script because of performance issues",
					},
				],
			};
			subcommands.push(flamegraph);
		}

		if (commands.includes("audit")) {
			const audit: Fig.Subcommand = {
				name: "audit",
				icon: "📚",
				description: "Runs the cargo audit tool",
				options: [
					{
						name: ["-d", "--db"],
						description: "Advisory database git repo path",
						args: {
							name: "DB",
							template: "folders",
						},
					},
					{
						name: ["-D", "--deny"],
						description: "Exit with an error on the argument",
						args: {
							isVariadic: true,
							suggestions: [
								{ name: "warnings", description: "Warnings (any)" },
								{ name: "unmaintained", description: "Unmaintained crates" },
								{ name: "unsound", description: "Unsound Rust code" },
								{ name: "yanked", description: "Yanked crates" },
							],
						},
					},
					{
						name: ["-f", "--file"],
						description: "Cargo lockfile to inspect",
						args: {
							suggestions: [{ name: "-", description: "Stdin" }],
							generators: filepaths({
								equals: ["Cargo.lock"],
							}),
						},
					},
					{
						name: ["-n", "--no-fetch"],
						description: "Do not perform a git fetch on the advisory DB",
					},
					{
						name: "--stale",
						description: "Allow stale database",
					},
					{
						name: "--target-arch",
						description: "Filter vulnerabilities by CPU",
						args: {},
					},
					{
						name: "--target-os",
						description: "Filter vulnerabilities by OS",
						args: {},
					},
					{
						name: ["-u", "--url"],
						description: "URL for advisory database git repo",
					},
					{
						name: "--json",
						description: "Output report in JSON format",
					},
					{
						name: "--no-local-crates",
						description:
							"Vulnerability querying does not consider local crates",
					},
				],
			};
			subcommands.push(audit);
		}

		if (commands.includes("outdated")) {
			const outdated: Fig.Subcommand = {
				name: "outdated",
				icon: "📦",
				description: "Displays information about project dependency versions",
				options: [
					{
						name: ["-a", "--aggressive"],
						description: "Ignores channels for latest updates",
					},
					{
						name: "--color",
						description: "Output coloring",
						args: {
							name: "COLOR",
							suggestions: ["always", "never", "auto"],
							default: "auto",
						},
					},
					{
						name: ["-d", "--depth"],
						description:
							"How deep in the dependency chain to search (Defaults to all dependencies when omitted)",
						args: {
							name: "DEPTH",
						},
						exclusiveOn: ["-R", "--root-deps-only"],
					},
					{
						name: ["-x", "--exclude"],
						description: "Exclude a dependency from the output",
						isRequired: true,
						args: {
							name: "DEPENDENCY",
							filterStrategy: "fuzzy",
							generators: dependencyGenerator,
						},
					},
					{
						name: "--exit-code",
						description: "The exit code to return on new versions found",
						args: {
							name: "NUM",
							suggestions: ["0", "1"],
							default: "0",
						},
					},
					{
						name: "--features",
						description: "Space-separated list of features",
						args: {
							name: "FEATURES",
							generators: featuresGenerator,
							isVariadic: true,
						},
					},
					{
						name: "--format",
						description: "Output formatting",
						args: {
							name: "FORMAT",
							suggestions: ["json", "list"],
							default: "list",
						},
					},
					{
						name: ["-h", "--help"],
						description: "Prints help information",
					},
					{
						name: ["-i", "--ignore"],
						description: "Dependencies to not print in the output",
						args: {
							name: "DEPENDENCY",
							filterStrategy: "fuzzy",
							generators: dependencyGenerator,
						},
					},
					{
						name: ["-e", "--ignore-external-rel"],
						description:
							"Ignore relative dependencies external to workspace and check root dependencies only",
					},
					{
						name: ["-m", "--manifest-path"],
						description: "Path to the Cargo.toml file to use",
						args: {
							name: "PATH",
							generators: filepaths({
								equals: ["Cargo.toml"],
							}),
						},
					},
					{
						name: ["-o", "--offline"],
						description: "Run without accessing the network",
					},
					{
						name: ["-p", "--packages"],
						description: "Packages to inspect for updates",
						args: {
							name: "PACKAGES",
							filterStrategy: "fuzzy",
							generators: packageGenerator,
						},
					},
					{
						name: ["-q", "--quiet"],
						description: "Suppresses warnings",
					},
					{
						name: ["-r", "--root"],
						description: "Package to treat as the root package",
						args: {
							name: "PACKAGE",
							filterStrategy: "fuzzy",
							generators: packageGenerator,
						},
					},
					{
						name: ["-R", "--root-deps-only"],
						description: "Only check root dependencies",
						exclusiveOn: ["-d", "--depth"],
					},
					{
						name: ["-V", "--version"],
						description: "Prints version information",
					},
					{
						name: ["-v", "--verbose"],
						description: "Use verbose output",
					},
					{
						name: ["-w", "--workspace"],
						description:
							"Checks updates for all workspace members rather than only the root package",
					},
				],
			};
			subcommands.push(outdated);
		}

		if (commands.includes("udeps")) {
			const udeps: Fig.Subcommand = {
				name: "udeps",
				icon: "📦",
				description: "Find unused dependencies in Cargo.toml files",
				options: [
					{
						name: ["-q", "--quiet"],
						description: "No output printed to stdout",
					},
					{
						name: ["-p", "--package"],
						description: "Package(s) to check",
						args: {
							name: "SPEC",
							filterStrategy: "fuzzy",
							generators: packageGenerator,
						},
					},
					{
						name: "--all",
						description: "Alias for --workspace (deprecated)",
						hidden: true,
						deprecated: true,
					},
					{
						name: "--workspace",
						description: "Check all packages in the workspace",
					},
					{
						name: "--exclude",
						description: "Exclude packages from the check",
						args: {
							name: "SPEC",
							filterStrategy: "fuzzy",
							generators: packageGenerator,
						},
					},
					{
						name: ["-j", "--jobs"],
						description: "Number of parallel jobs, defaults to # of CPUs",
						args: {
							name: "N",
						},
					},
					{
						name: "--lib",
						description: "Check only this package's library",
					},
					{
						name: "--bin",
						description: "Check only the specified binary",
						args: {
							name: "NAME",
							filterStrategy: "fuzzy",
							generators: targetGenerator({ kind: "bin" }),
						},
					},
					{
						name: "--bins",
						description: "Check all binaries",
					},
					{
						name: "--example",
						description: "Check only the specified example",
						args: {
							name: "NAME",
							filterStrategy: "fuzzy",
							generators: targetGenerator({ kind: "example" }),
						},
					},
					{
						name: "--examples",
						description: "Check all examples",
					},
					{
						name: "--test",
						description: "Check only the specified test target",
						args: {
							name: "NAME",
							filterStrategy: "fuzzy",
							generators: targetGenerator({ kind: "test" }),
						},
					},
					{
						name: "--tests",
						description: "Check all tests",
					},
					{
						name: "--bench",
						description: "Check only the specified bench target",
						args: {
							name: "NAME",
							filterStrategy: "fuzzy",
							generators: targetGenerator({ kind: "bench" }),
						},
					},
					{
						name: "--benches",
						description: "Check all benches",
					},
					{
						name: "--all-targets",
						description: "Check all targets",
					},
					{
						name: "--release",
						description: "Check artifacts in release mode, with optimizations",
					},
					{
						name: "--profile",
						description: "Check artifacts with the specified profile",
						args: {
							name: "PROFILE-NAME",
						},
					},
					{
						name: "--features",
						description: "Space-separated list of features to activate",
						args: {
							name: "FEATURES",
							isVariadic: true,
						},
					},
					{
						name: "--all-features",
						description: "Activate all available features",
					},
					{
						name: "--no-default-features",
						description: "Do not activate the `default` feature",
					},
					{
						name: "--target",
						description: "Check for the target triple",
						args: {
							name: "TRIPLE",
						},
					},
					{
						name: "--target-dir",
						description: "Directory for all generated artifacts",
						args: {
							name: "DIRECTORY",
						},
					},
					{
						name: "--manifest-path",
						description: "Path to Cargo.toml",
						args: {
							name: "PATH",
						},
					},
					{
						name: "--message-format",
						description: "Error format",
						args: {
							name: "FMT",
							default: "human",
							suggestions: ["human", "json", "short"],
						},
					},
					{
						name: ["-v", "--verbose"],
						description:
							"Use verbose output (-vv very verbose/build.rs output)",
					},
					{
						name: "--color",
						description: "Coloring",
						args: {
							name: "WHEN",
							suggestions: ["auto", "always", "never"],
						},
					},
					{
						name: "--frozen",
						description: "Require Cargo.lock and cache are up to date",
					},
					{
						name: "--locked",
						description: "Require Cargo.lock is up to date",
					},
					{
						name: "--offline",
						description: "Run without accessing the network",
					},
					{
						name: "--output",
						description: "Output format",
						args: {
							name: "OUTPUT",
							default: "human",
							suggestions: ["human", "json"],
						},
					},
					{
						name: "--backend",
						description: "Backend to use for determining unused deps",
						args: {
							name: "BACKEND",
							suggestions: ["save-analysis", "depinfo"],
						},
					},
					{
						name: "--keep-going",
						description:
							"Needed because the keep-going flag is asked about by cargo code",
					},
					{
						name: "--show-unused-transitive",
						description:
							"Show unused dependencies that get used transitively by main dependencies. Works only with 'save-analysis' backend",
						dependsOn: ["--backend"],
					},
					{
						name: ["-h", "--help"],
						description: "Print help information",
					},
					{
						name: ["-V", "--version"],
						description: "Print version information",
					},
				],
			};
			subcommands.push(udeps);
		}

		if (commands.includes("deny")) {
			const deny: Fig.Subcommand = {
				name: "deny",
				icon: "❌",
				description: "Cargo plugin to help you manage large dependency graphs",
				subcommands: [
					{
						name: "check",
						description: "Checks a project's crate graph",
						options: [
							{
								name: "--audit-compatible-output",
								description:
									"To ease transition from cargo-audit to cargo-deny, this flag will tell cargo-deny to output the exact same output as cargo-audit would, to `stdout` instead of `stderr`, just as with cargo-audit",
							},
							{
								name: ["-c", "--config"],
								description:
									"Path to the config to use. Defaults to <cwd>/deny.toml if not specified",
								args: {
									name: "CONFIG",
									generators: filepaths({ equals: "deny.toml" }),
								},
							},
							{
								name: ["-d", "--disable-fetch"],
								description: "Disable fetching of the advisory database",
							},
							{
								name: ["-g", "--graph"],
								description: "Path to graph_output root directory",
								args: {
									name: "GRAPH",
									template: "folders",
								},
							},
							{
								name: ["-h", "--help"],
								description: "Print help information",
							},
							{
								name: "--hide-inclusion-graph",
								description:
									"Hides the inclusion graph when printing out info for a crate",
							},
							{
								name: ["-s", "--show-stats"],
								description:
									"Show stats for all the checks, regardless of the log-level",
							},
						],
						args: {
							name: "WHICH",
							isOptional: true,
							suggestions: [
								{
									name: "advisories",
									description: "Checks for known security vulnerabilities",
								},
								{
									name: "ban",
									description: "Checks for banned crates",
								},
								{
									name: "bans",
									description: "Checks for banned crates",
								},
								{
									name: "license",
									description: "Checks for crates with unknown licenses",
								},
								{
									name: "licenses",
									description: "Checks for crates with unknown licenses",
								},
								{
									name: "sources",
									description: "Checks for crates with unknown sources",
								},
								{
									name: "all",
									description: "Runs all checks",
								},
							],
							isVariadic: true,
						},
					},
					{
						name: "fetch",
						description: "Fetches remote data",
						options: [
							{
								name: ["-c", "--config"],
								description: "Path to the config to use",
								args: {
									name: "CONFIG",
									generators: filepaths({ equals: "deny.toml" }),
								},
							},
							{
								name: ["-h", "--help"],
								description: "Print help information",
							},
						],
						args: {
							name: "SOURCES",
							isOptional: true,
							suggestions: [
								{
									name: "db",
									description: "Fetches the advisory database",
								},
								{
									name: "index",
									description: "Fetches the crates.io index",
								},
								{
									name: "all",
									description: "Fetches all remote data",
								},
							],
						},
					},
					{
						name: "help",
						description:
							"Print this message or the help of the given subcommand(s)",
						args: {
							template: "help",
							isOptional: true,
						},
					},
					{
						name: "init",
						description: "Creates a cargo-deny config from a template",
						options: [
							{
								name: ["-h", "--help"],
								description: "Print help information",
							},
						],
						args: {
							name: "CONFIG",
							description: "The path to create",
							generators: filepaths({ equals: "deny.toml" }),
						},
					},
					{
						name: "list",
						description:
							"Outputs a listing of all licenses and the crates that use them",
						options: [
							{
								name: ["-c", "--config"],
								description: "Path to the config to use",
								args: {
									name: "CONFIG",
									generators: filepaths({ equals: "deny.toml" }),
								},
							},
							{
								name: ["-f", "--format"],
								description: "The format of the output",
								args: {
									name: "FORMAT",
									suggestions: ["human", "json", "tsv"],
								},
							},
							{
								name: ["-h", "--help"],
								description: "Print help information",
							},
							{
								name: ["-l", "--layout"],
								description: "The layout for the output",
								args: {
									name: "LAYOUT",
									suggestions: [{ name: "crate" }, { name: "license" }],
								},
							},
							{
								name: ["-t", "--threshold"],
								description: "Minimum confidence threshold for license text",
								args: {
									name: "THRESHOLD",
									suggestions: [
										"0.0",
										"0.1",
										"0.2",
										"0.3",
										"0.4",
										"0.5",
										"0.6",
										"0.7",
										"0.8",
										"0.9",
										"1.0",
									],
								},
							},
						],
					},
				],
				options: [
					{
						name: "--all-features",
						description: "Activate all available features",
					},
					{
						name: ["-c", "--color"],
						description: "Coloring",
						args: {
							name: "WHEN",
							suggestions: ["auto", "always", "never"],
						},
					},
					{
						name: "--exclude",
						description:
							"One or more crates to exclude from the crate graph that is used",
						args: {
							name: "EXCLUDE",
							filterStrategy: "fuzzy",
							generators: packageGenerator,
						},
					},
					{
						name: ["-f", "--format"],
						description: "Specify the format of cargo-deny's output",
						args: {
							name: "FORMAT",
							default: "human",
							suggestions: ["human", "json"],
						},
					},
					{
						name: "--features",
						description:
							"Space or comma separated list of features to activate",
						args: {
							name: "FEATURES",
							isVariadic: true,
						},
					},
					{
						name: "--frozen",
						description: "Require Cargo.lock and cache are up to date",
					},
					{
						name: ["-h", "--help"],
						description: "Print help information",
					},
					{
						name: ["-L", "--log-level"],
						description: "The log level for messages",
						args: {
							name: "LOG_LEVEL",
							default: "warn",
							suggestions: ["off", "error", "warn", "info", "debug", "trace"],
						},
					},
					{
						name: "--locked",
						description: "Require Cargo.lock is up to date",
					},
					{
						name: "--manifest-path",
						description:
							"The path of a Cargo.toml to use as the context for the operation",
						args: {
							name: "MANIFEST_PATH",
						},
					},
					{
						name: "--no-default-features",
						description: "Do not activate the `default` feature",
					},
					{
						name: "--offline",
						description:
							"Run without accessing the network. If used with the `check` subcommand, this also disables advisory database fetching",
					},
					{
						name: ["-t", "--target"],
						description: "One or more platforms to filter crates by",
						args: {
							name: "TARGET",
						},
					},
					{
						name: ["-V", "--version"],
						description: "Print version information",
					},
					{
						name: "--workspace",
						description:
							"If passed, all workspace packages are used as roots for the crate graph",
					},
				],
			};
			subcommands.push(deny);
		}

		if (commands.includes("bloat")) {
			const bloat: Fig.Subcommand = {
				name: "bloat",
				icon: "⚖️",
				description: "Find out what takes most of the space in your executable",
				options: [
					{
						name: ["-h", "--help"],
						description: "Print help information",
					},
					{
						name: ["-V", "--version"],
						description: "Print version information",
					},
					{
						name: "--lib",
						description: "Build only this package's library",
					},
					{
						name: "--bin",
						description: "Build only the specified binary",
						args: {
							name: "NAME",
						},
					},
					{
						name: "--example",
						description: "Build only the specified example",
						args: {
							name: "NAME",
						},
					},
					{
						name: "--test",
						description: "Build only the specified test target",
						args: {
							name: "NAME",
						},
					},
					{
						name: ["-p", "--package"],
						description: "Package to build",
						args: {
							name: "SPEC",
							filterStrategy: "fuzzy",
							generators: packageGenerator,
						},
					},
					{
						name: "--release",
						description: "Build artifacts in release mode, with optimizations",
					},
					{
						name: ["-j", "--jobs"],
						description: "Number of parallel jobs, defaults to # of CPUs",
						args: {
							name: "N",
						},
					},
					{
						name: "--features",
						description: "Space-separated list of features to activate",
						args: {
							name: "FEATURES",
						},
					},
					{
						name: "--all-features",
						description: "Activate all available features",
					},
					{
						name: "--no-default-features",
						description: "Do not activate the `default` feature",
					},
					{
						name: "--profile",
						description: "Build with the given profile",
						args: {
							name: "PROFILE",
						},
					},
					{
						name: "--target",
						description: "Build for the target triple",
						args: {
							name: "TARGET",
						},
					},
					{
						name: "--target-dir",
						description: "Directory for all generated artifacts",
						args: {
							name: "DIRECTORY",
						},
					},
					{
						name: "--frozen",
						description: "Require Cargo.lock and cache are up to date",
					},
					{
						name: "--locked",
						description: "Require Cargo.lock is up to date",
					},
					{
						name: "-Z",
						description:
							"Unstable (nightly-only) flags to Cargo, see 'cargo -Z help' for details",
						args: {
							name: "FLAG",
							isVariadic: true,
						},
					},
					{
						name: "--crates",
						description: "Per crate bloatedness",
					},
					{
						name: "--time",
						description: "Per crate build time. Will run `cargo clean` first",
					},
					{
						name: "--filter",
						description: "Filter functions by crate",
						args: {
							name: "CRATE|REGEXP",
						},
					},
					{
						name: "--split-std",
						description:
							"Split the 'std' crate to original crates like core, alloc, etc",
					},
					{
						name: "--symbols-section",
						description: "Use custom symbols section (ELF-only)",
						args: {
							name: "NAME",
							default: ".text",
						},
					},
					{
						name: "--no-relative-size",
						description: "Hide 'File' and '.text' columns",
					},
					{
						name: "--full-fn",
						description: "Print full function name with hash values",
					},
					{
						name: "-n",
						description: "Number of lines to show, 0 to show all [default: 20]",
						args: {
							name: "NUM",
							default: "20",
						},
					},
					{
						name: ["-w", "--wide"],
						description: "Do not trim long function names",
					},
					{
						name: "--message-format",
						description: "Output format",
						args: {
							name: "FMT",
							default: "table",
							suggestions: ["table", "json"],
						},
					},
				],
			};
			subcommands.push(bloat);
		}

		if (commands.includes("sort")) {
			const sort: Fig.Subcommand = {
				name: "sort",
				icon: "🛠",
				description: "Ensure Cargo.toml dependency tables are sorted",
				options: [
					{
						name: ["-h", "--help"],
						description: "Print help information",
					},
					{
						name: ["-V", "--version"],
						description: "Print version information",
					},
					{
						name: ["-c", "--check"],
						description:
							"Non-zero exit if Cargo.toml is unsorted, overrides default behavior",
					},
					{
						name: ["-g", "--grouped"],
						description:
							"When sorting groups of key value pairs blank lines are kept",
					},
					{
						name: ["-p", "--print"],
						description: "Prints Cargo.toml, lexically sorted, to stdout",
					},
					{
						name: ["-w", "--workspace"],
						description: "Checks every crate in a workspace",
					},
					{
						name: ["-n", "--no-format"],
						description: "Skip formatting after sorting",
						args: {
							name: "no-format",
						},
					},
					{
						name: ["-o", "--order"],
						description:
							"When sorting groups of key value pairs blank lines are kept",
						args: {
							name: "order",
						},
					},
				],
				args: {
					name: "CWD",
					description: "The directory to run the command in",
					isOptional: true,
					template: "folders",
				},
			};
			subcommands.push(sort);
		}

		if (commands.includes("fuzz")) {
			const fuzz: Fig.Subcommand = {
				name: "fuzz",
				icon: "🛠",
				description: "A `cargo` subcommand for fuzzing with `libFuzzer`!",
				subcommands: [
					{
						name: "add",
						description: "Add a new fuzz target",
					},
					{
						name: "build",
						description: "Build fuzz targets",
					},
					{
						name: "cmin",
						description: "Minify a corpus",
					},
					{
						name: "coverage",
						description:
							"Run program on the generated corpus and generate coverage information",
					},
					{
						name: "fmt",
						description: "Print the `std::fmt::Debug` output for an input",
					},
					{
						name: "help",
						description:
							"Prints this message or the help of the given subcommand(s)",
					},
					{
						name: "init",
						description: "Initialize the fuzz directory",
					},
					{
						name: "list",
						description: "List all the existing fuzz targets",
					},
					{
						name: "run",
						description: "Run a fuzz target",
					},
					{
						name: "tmin",
						description: "Minify a test case",
					},
				],
			};
			subcommands.push(fuzz);
		}

		if (commands.includes("insta")) {
			const commonOptions: Fig.Option[] = [
				{
					name: ["-h", "--help"],
					description: "Print help information",
				},
				{
					name: ["-V", "--version"],
					description: "Print version information",
				},
				{
					name: "--color",
					description: "Coloring: auto, always, never",
					args: {
						name: "WHEN",
						default: "auto",
						suggestions: ["auto", "always", "never"],
					},
				},
				{
					name: "--manifest-path",
					description: "Path to Cargo.toml",
					args: {
						name: "PATH",
						generators: filepaths({ equals: "Cargo.toml" }),
					},
				},
				{
					name: "--workspace-root",
					description: "Explicit path to the workspace root",
					args: {
						name: "PATH",
						template: "folders",
					},
				},
				{
					name: ["-e", "--extensions"],
					description: "Sets the extensions to consider.  Defaults to `.snap`",
					args: {
						name: "EXTENSIONS",
						isVariadic: true,
					},
				},
				{
					name: "--all",
					description: "Work on all packages in the workspace",
				},
				{
					name: "--no-ignore",
					description: "Also walk into ignored paths",
				},
			];

			const insta: Fig.Subcommand = {
				name: "insta",
				icon: "🛠",
				description: "A `cargo` subcommand for snapshot testing",
				subcommands: [
					{
						name: "review",
						description: "Interactively review snapshots",
						options: [
							...commonOptions,
							{
								name: "--snapshot",
								description: "Limits the operation to one or more snapshots",
								args: {
									name: "snapshot-filter",
									isVariadic: true,
								},
							},
							{
								name: ["-q", "--quiet"],
								description: "Do not print to stdout",
							},
						],
					},
					{
						name: "reject",
						description: "Rejects all snapshots",
						options: [
							...commonOptions,
							{
								name: "--snapshot",
								description: "Limits the operation to one or more snapshots",
								args: {
									name: "snapshot-filter",
									isVariadic: true,
								},
							},
							{
								name: ["-q", "--quiet"],
								description: "Do not print to stdout",
							},
						],
					},
					{
						name: "accept",
						description: "Accepts all snapshots",
						options: [
							...commonOptions,
							{
								name: "--snapshot",
								description: "Limits the operation to one or more snapshots",
								args: {
									name: "snapshot-filter",
									isVariadic: true,
								},
							},
							{
								name: ["-q", "--quiet"],
								description: "Do not print to stdout",
							},
						],
					},
					{
						name: "test",
						description: "Run tests and then reviews",
						options: [
							...commonOptions,
							{
								name: "--snapshot",
								description: "Limits the operation to one or more snapshots",
								args: {
									name: "snapshot-filter",
									isVariadic: true,
								},
							},
							{
								name: ["-q", "--quiet"],
								description: "Do not print to stdout",
							},
							{
								name: ["-p", "--package"],
								description: "Package to run tests for",
								args: {
									name: "SPEC",
									filterStrategy: "fuzzy",
									generators: packageGenerator,
								},
							},
							{
								name: "--no-force-pass",
								description: "Disable force-passing of snapshot tests",
							},
							{
								name: "--fail-fast",
								description: "Prevent running all tests regardless of failure",
							},
							{
								name: "--features",
								description: "Space-separated list of features to activate",
								args: {
									name: "features",
								},
							},
							{
								name: ["-j", "--jobs"],
								description: "Number of parallel jobs, defaults to # of CPUs",
								args: {
									name: "jobs",
								},
							},
							{
								name: "--release",
								description:
									"Build artifacts in release mode, with optimizations",
							},
							{
								name: "--all-features",
								description: "Activate all available features",
							},
							{
								name: "--no-default-features",
								description: "Do not activate the `default` feature",
							},
							{
								name: "--review",
								description: "Follow up with review",
							},
							{
								name: "--accept",
								description: "Accept all snapshots after test",
							},
							{
								name: "--accept-unseen",
								description: "Accept all new (previously unseen)",
							},
							{
								name: "--keep-pending",
								description: "Do not reject pending snapshots before run",
							},
							{
								name: "--force-update-snapshots",
								description:
									"Update all snapshots even if they are still matching",
							},
							{
								name: "--delete-unreferenced-snapshots",
								description: "Delete unreferenced snapshots after the test run",
							},
							{
								name: "--glob-filter",
								description: "Filters to apply to the insta glob feature",
								args: {
									name: "glob-filter",
									isVariadic: true,
								},
							},
							{
								name: ["-Q", "--no-quiet"],
								description: "Do not pass the quiet flag (`-q`) to tests",
							},
							{
								name: "--test-runner",
								description: "Picks the test runner",
								args: {
									name: "test-runner",
								},
							},
						],
					},
					{
						name: "pending",
						description: "Print a summary of all pending snapshots",
						options: [
							...commonOptions,
							{
								name: "--as-json",
								description: "Changes the output from human readable to JSON",
							},
						],
					},
					{
						name: "show",
						description: "Shows a specific snapshot",
						options: commonOptions,
						args: {
							name: "path",
							description: "The path to the snapshot file",
							generators: filepaths({ extensions: ["snap"] }),
						},
					},
				],
				options: [
					{
						name: ["-h", "--help"],
						description: "Print help information",
					},
					{
						name: ["-V", "--version"],
						description: "Print version information",
					},
					{
						name: "--color",
						description: "Coloring: auto, always, never",
						args: {
							name: "WHEN",
							default: "auto",
							suggestions: ["auto", "always", "never"],
						},
					},
				],
			};
			subcommands.push(insta);
		}

		if (commands.includes("make")) {
			const make: Fig.Subcommand = {
				name: "make",
				icon: "🛠",
				description: "Rust cargo-make task runner and build tool",
				args: {
					name: "TASK",
					filterStrategy: "fuzzy",
					isVariadic: true,
					isOptional: true,
					generators: makeTasksGenerator,
				},
				options: [
					{
						name: ["--help", "-h"],
						description: "Print help information",
					},
					{
						name: ["--version", "-V"],
						description: "Print version information",
					},
					{
						name: "--makefile",
						description:
							"The optional toml file containing the tasks definitions",
						args: { name: "FILE", template: "filepaths" },
					},
					{
						name: ["--task", "-t"],
						description: "The task name to execute",
						args: {
							name: "TASK",
							filterStrategy: "fuzzy",
							isVariadic: true,
							isOptional: true,
							generators: makeTasksGenerator,
						},
					},
					{
						name: ["--profile", "-p"],
						description: "The profile name",
						args: { name: "PROFILE", default: "development" },
					},
					{
						name: "--cwd",
						description: "Set the current working directory",
						args: { name: "DIRECTORY", template: "folders" },
					},
					{
						name: "--no-workspace",
						description: "Disable workspace support",
					},
					{
						name: "--no-on-error",
						description:
							"Disable on error flow even if defined in config sections",
					},
					{
						name: "--allow-private",
						description: "Allow invocation of private tasks",
					},
					{
						name: "--skip-init-end-tasks",
						description: "If set, init and end tasks are skipped",
					},
					{
						name: "--skip-tasks",
						description: "Skip all tasks that match the provided regex",
						args: { name: "SKIP_TASK_PATTERNS" },
					},
					{
						name: "--env-file",
						description: "Set environment variables from provided file",
						args: { name: "FILE", template: "filepaths" },
					},
					{
						name: ["--env", "-e"],
						description: "Set environment variables",
						args: { name: "ENV" },
					},
					{
						name: ["--loglevel", "-l"],
						description: "The log level",
						args: {
							name: "LOG LEVEL",
							suggestions: ["verbose", "info", "error", "off"],
						},
					},
					{
						name: ["--verbose", "-v"],
						description: "Sets the log level to verbose",
					},
					{
						name: "--quiet",
						description: "Sets the log level to error",
					},
					{
						name: "--silent",
						description: "Sets the log level to off",
					},
					{
						name: "--no-color",
						description: "Disables colorful output",
					},
					{
						name: "--time-summary",
						description: "Print task level time summary at end of flow",
					},
					{
						name: "--experimental",
						description:
							"Allows access to unsupported experimental predefined tasks",
					},
					{
						name: "--disable-check-for-updates",
						description: "Disables the update check during startup",
					},
					{
						name: "--output-format",
						description: "The print/list steps format",
						args: {
							name: "OUTPUT FORMAT",
							suggestions: [
								"default",
								"short-description",
								"markdown",
								"markdown-single-page",
								"markdown-sub-section",
								"autocomplete",
							],
						},
					},
					{
						name: "--output-file",
						description: "The list steps output file name",
						args: { name: "OUTPUT_FILE", template: "filepaths" },
					},
					{
						name: "--hide-uninteresting",
						description: "Hide any minor tasks such as pre/post hooks",
					},
					{
						name: "--print-steps",
						description:
							"Only prints the steps of the build in the order they will be invoked but without invoking them",
					},
					{
						name: "--list-all-steps",
						description: "Lists all known steps",
					},
					{
						name: "--list-category-steps",
						description: "List steps for a given category",
						args: { name: "CATEGORY" },
					},
					{
						name: "--diff-steps",
						description:
							"Runs diff between custom flow and prebuilt flow (requires git)",
					},
				],
			};
			subcommands.push(make);
		}

		return {
			name: "cargo",
			subcommands,
			options: toolchains,
		};
	},
});

export default completionSpec();
