/* eslint-disable @typescript-eslint/ban-types */
declare namespace Fig {
	/**
	 * Templates are generators prebuilt by Fig.
	 * @remarks
	 * Here are the three templates:
	 * - filepaths: show folders and filepaths. Allow autoexecute on filepaths
	 * - folders: show folders only. Allow autoexecute on folders
	 * - history: show suggestions for all items in history matching this pattern
	 * - help: show subcommands. Only includes the 'siblings' of the nearest 'parent' subcommand
	 */
	type TemplateStrings = "filepaths" | "folders" | "history" | "help";

	/**
	 * A template which is a single TemplateString or an array of TemplateStrings
	 *
	 * @remarks
	 * Templates are generators prebuilt by Fig. Here are the three templates:
	 * - filepaths: show folders and filepaths. Allow autoexecute on filepaths
	 * - folders: show folders only. Allow autoexecute on folders
	 * - history: show suggestions for all items in history matching this pattern
	 * - help: show subcommands. Only includes the 'siblings' of the nearest 'parent' subcommand
	 *
	 * @example
	 * `cd` uses the "folders" template
	 * `ls` used  ["filepaths", "folders"]. Why both? Because if I `ls` a directory, we want to enable a user to autoexecute on this directory. If we just did "filepaths" they couldn't autoexecute.
	 *
	 */
	type Template = TemplateStrings | TemplateStrings[];

	type HistoryContext = {
		currentWorkingDirectory: string;
		time: number;
		exitCode: number;
		shell: string;
	};

	type TemplateSuggestionContext =
		| { templateType: "filepaths" }
		| { templateType: "folders" }
		| { templateType: "help" }
		| ({ templateType: "history" } & Partial<HistoryContext>);

	type TemplateSuggestion = Modify<
		Suggestion,
		{ name?: string; context: TemplateSuggestionContext }
	>;

	/**
	 *
	 * The SpecLocation object defines well... the location of the completion spec we want to load.
	 * Specs can be "global" (ie hosted by Fig's cloud) or "local" (ie stored on your local machine)
	 *
	 * @remarks
	 * **The `SpecLocation` Object**
	 *
	 * The SpecLocation object defines well... the location of the completion spec we want to load.
	 * Specs can be "global" (ie hosted by Fig's cloud) or "local" (ie stored on your local machine).
	 *
	 * - Global `SpecLocation`:
	 * Load specs hosted in Fig's Cloud. Assume the current working directory is here: https://github.com/withfig/autocomplete/tree/master/src. Now set the value for the "name" prop to the relative location of your spec (without the .js file extension)
	 * ```js
	 * // e.g.
	 * { type: "global", name: "aws/s3" } // Loads up the aws s3 completion spec
	 * { type: "global", name: "python/http.server" } // Loads up the http.server completion spec
	 * ```
	 *
	 * - Local `SpecLocation`:
	 * Load specs saved on your local system / machine. Assume the current working directory is the user's current working directory.
	 * The `name` prop should take the name of the spec (without the .js file extension) e.g. my_cli_tool
	 * The `path` prop should take an absolute path OR a relative path (relative to the user's current working directory). The path should be to the directory that contains the `.fig` folder. Fig will then assume your spec is located in `.fig/autocomplete/build/`
	 * ```js
	 * // e.g.
	 * { type: "global", path: "node_modules/cowsay", name: "cowsay_cli" }  // will look for `cwd/node_modules/cowsay/.fig/autocomplete/build/cowsay_cli.js`
	 * { type: "global", path: "~", name: "my_cli" }  // will look for `~/.fig/autocomplete/build/my_cli.js`
	 * ```
	 * @irreplaceable
	 */
	type SpecLocation =
		| { type: "local"; path?: string; name: string }
		| { type: "global"; name: string };

	/**
	 * Dynamically load up another completion spec at runtime.
	 *
	 * See [`loadSpec` property in Subcommand Object](https://fig.io/docs/reference/subcommand#loadspec).
	 */
	type LoadSpec =
		| string
		| Subcommand
		| ((
			token: string,
			executeCommand: ExecuteCommandFunction
		) => Promise<SpecLocation | SpecLocation[] | Subcommand>);

	/**
	 * The type of a suggestion object.
	 * @remarks
	 * The type determines:
	 * - the default icon Fig uses (e.g. a file or folder searches for the system icon, a subcommand has a specific icon etc)
	 * - whether we allow users to auto-execute a command
	 */
	type SuggestionType =
		| "folder"
		| "file"
		| "arg"
		| "subcommand"
		| "option"
		| "special"
		| "mixin"
		| "shortcut";

	/**
	 * A single object of type `T` or an array of objects of type `T`.
	 */
	type SingleOrArray<T> = T | T[];

	/**
	 * An async function that returns the version of a given CLI tool.
	 * @remarks
	 * This is used in completion specs that want to version themselves the same way CLI tools are versioned. See fig.io/docs
	 *
	 * @param executeCommand -an async function that allows you to execute a shell command on the user's system and get the output as a string.
	 * @returns The version of a CLI tool
	 *
	 * @example
	 * `1.0.22`
	 *
	 * @example
	 * `v26`
	 *
	 */
	type GetVersionCommand = (executeCommand: ExecuteCommandFunction) => Promise<string>;

	/**
	 * Context about a current shell session.
	 */
	type ShellContext = {
		/**
		 * The current directory the shell is in
		 */
		currentWorkingDirectory: string;
		/**
		 * Exported environment variables from the shell
		 */
		environmentVariables: Record<string, string>;
		/**
		 * The name of the current process
		 */
		currentProcess: string;
		/**
		 * @hidden
		 * @deprecated
		 */
		sshPrefix: string;
	};

	type GeneratorContext = ShellContext & {
		isDangerous?: boolean;
		searchTerm: string;
	};

	/**
	 * A function which can have a `T` argument and a `R` result.
	 * @param param - A param of type `R`
	 * @returns Something of type `R`
	 */
	type Function<T = void, R = void> = (param: T) => R;

	/**
	 * A utility type to modify a property type
	 * @irreplaceable
	 */
	type Modify<T, R> = Omit<T, keyof R> & R;

	/**
	 * A `string` OR a `function` which can have a `T` argument and a `R` result.
	 * @param param - A param of type `R`
	 * @returns Something of type `R`
	 */
	type StringOrFunction<T = void, R = void> = string | Function<T, R>;

	/**
	 * @excluded
	 * @irreplaceable
	 */
	type ArgDiff = Modify<Fig.Arg, { remove?: true }>;

	/**
	 * @excluded
	 * @irreplaceable
	 */
	type OptionDiff = Modify<
		Fig.Option,
		{
			args?: ArgDiff | ArgDiff[];
			remove?: true;
		}
	>;

	/**
	 * @excluded
	 * @irreplaceable
	 */
	type SubcommandDiff = Modify<
		Fig.Subcommand,
		{
			subcommands?: SubcommandDiff[];
			options?: OptionDiff[];
			args?: ArgDiff | ArgDiff[];
			remove?: true;
		}
	>;

	/**
	 * @excluded
	 * @irreplaceable
	 */
	type SpecDiff = Omit<SubcommandDiff, "name" | "remove">;

	/**
	 * @excluded
	 * @irreplaceable
	 */
	type VersionDiffMap = Record<string, SpecDiff>;

	/**
	 * A spec object.
	 * Can be one of
	 * 1. A subcommand
	 * 2. A function that dynamically computes a subcommand
	 * 3. A function that returns the path to a versioned spec files (that exports a base subcommand and { versions: VersionDiffMap }
	 */
	type Spec =
		| Subcommand
		| ((version?: string) => Subcommand)
		| ((version?: string) => {
			versionedSpecPath: string;
			version?: string;
		});

	type ExecuteCommandInput = {
		/**
		 * The command to execute
		 */
		command: string;
		/**
		 * The arguments to the command to be run
		 */
		args: string[];
		/**
		 * The directory to run the command in
		 */
		cwd?: string;
		/**
		 * The environment variables to set when executing the command, `undefined` will unset the variable if it set
		 */
		env?: Record<string, string | undefined>;
		/**
		 * Duration of timeout in milliseconds, if the command takes longer than the timeout a error will be thrown.
		 * @defaultValue 5000
		 */
		timeout?: number;
	};

	/**
	 * The output of running a command
	 */
	type ExecuteCommandOutput = {
		/**
		 * The stdout (1) of running a command
		 */
		stdout: string;
		/**
		 * The stderr (2) of running a command
		 */
		stderr: string;
		/**
		 * The exit status of running a command
		 */
		status: number;
	};

	/**
	 * An async function to execute a command
	 * @returns The output of the command
	 */
	type ExecuteCommandFunction = (args: ExecuteCommandInput) => Promise<ExecuteCommandOutput>;

	type CacheMaxAge = {
		strategy: "max-age";
		/**
		 * The time to live for the cache in milliseconds.
		 * @example
		 * 3600
		 */
		ttl: number;
	};

	type CacheStaleWhileRevalidate = {
		strategy?: "stale-while-revalidate";
		/**
		 * The time to live for the cache in milliseconds.
		 * @example
		 * 3600
		 */
		ttl?: number;
	};

	type Cache = (CacheMaxAge | CacheStaleWhileRevalidate) & {
		/**
		 * Whether the cache should be based on the directory the user was currently in or not.
		 * @defaultValue false
		 */
		cacheByDirectory?: boolean;

		/**
		 * Hardcoded cache key that can be used to cache a single generator across
		 * multiple argument locations in a spec.
		 */
		cacheKey?: string;
	};

	type TriggerOnChange = {
		/** Trigger on any change to the token */
		on: "change";
	};

	type TriggerOnThreshold = {
		/** Trigger when the length of the token changes past a threshold */
		on: "threshold";
		length: number;
	};

	type TriggerOnMatch = {
		/** Trigger when the index of a string changes */
		on: "match";
		string: string | string[];
	};

	type Trigger =
		| string
		| ((newToken: string, oldToken: string) => boolean)
		| TriggerOnChange
		| TriggerOnThreshold
		| TriggerOnMatch;

	/**
	 * The BaseSuggestion object is the root of the Suggestion, Subcommand, and Option objects.
	 * It is where key properties like description, icon, and displayName are found
	 * @excluded
	 */
	interface BaseSuggestion {
		/**
		 * The string that is displayed in the UI for a given suggestion.
		 * @defaultValue the name prop
		 *
		 * @example
		 * The npm CLI has a subcommand called `install`. If we wanted
		 * to display some custom text like `Install an NPM package 📦` we would set
		 * `name: "install"` and `displayName: "Install an NPM package 📦"`
		 */
		displayName?: string;
		/**
		 * The value that's inserted into the terminal when a user presses enter/tab or clicks on a menu item.
		 *
		 * @remarks
		 * You can use `\n` to insert a newline or `\b` to insert a backspace.
		 * You can also optionally specify {cursor} in the string and Fig will automatically place the cursor there after insert.
		 *
		 * @defaultValue The value of the name prop.
		 *
		 * @example
		 * For the `git commit` subcommand, the `-m` option has an insert value of `-m '{cursor}'`
		 */
		insertValue?: string;
		/**
		 * When the suggestion is inserted, replace the command with this string
		 *
		 * @remarks
		 * You can use `\n` to insert a newline or `\b` to insert a backspace.
		 * You can also optionally specify {cursor} in the string and Fig will automatically place the cursor there after insert.
		 * Note that currently the entire edit buffer will be replaced. Eventually, only the root command will be replaced, preserving pipes and continuations.
		 */
		replaceValue?: string;
		/**
		 * The text that gets rendered at the bottom of the autocomplete box (or the side if you hit ⌘i)
		 *
		 * @example
		 * "Your commit message"
		 */
		description?: string;
		/**
		 * The icon that is rendered is based on the type.
		 *
		 * @remarks
		 * Icons can be a 1 character string, a URL, or Fig's [icon protocol](https://fig.io/docs/reference/suggestion/icon-api) (fig://) which lets you generate
		 * colorful and fun systems icons.
		 *
		 * @defaultValue related to the type of the object (e.g. `Suggestion`, `Subcommand`, `Option`, `Arg`)
		 *
		 * @example
		 * `A`
		 * @example
		 * `😊`
		 * @example
		 * `https://www.herokucdn.com/favicon.ico`
		 * @example
		 * `fig://icon?type=file`
		 *
		 */
		icon?: string;
		/**
		 * Specifies whether the suggestion is "dangerous".
		 *
		 * @remarks
		 * If true, Fig will not enable its autoexecute functionality. Autoexecute means if a user selects a suggestion it will insert the text and run the command. We signal this by changing the icon to red.
		 * Setting `isDangerous` to `true` will make it harder for a user to accidentally run a dangerous command.
		 *
		 * @defaultValue false
		 *
		 * @example
		 * This is used in the `rm` spec. Why? Because we don't want users to accidentally delete their files so we make it just a little bit harder...
		 */
		isDangerous?: boolean;
		/**
		 * The number used to rank suggestions in autocomplete. Number must be from 0-100. Higher priorities rank higher.
		 *
		 * @defaultValue 50
		 * @remarks
		 * Fig ranks suggestions by recency. To do this, we check if a suggestion has been selected before. If yes and the suggestions has:
		 * - a priority between 50-75, the priority will be replaced with 75, then we will add the timestamp of when that suggestion was selected as a decimal.
		 * - a priority outside of 50-75, the priority will be increased by the timestamp of when that suggestion was selected as a decimal.
		 * If it has not been selected before, Fig will keep the same priority as was set in the completion spec
		 * If it was not set in the spec, it will default to 50.
		 *
		 * @example
		 * Let's say a user has previously selected a suggestion at unix timestamp 1634087677:
		 *     - If completion spec did not set a priority (Fig treats this as priority 50), its priority would change to 75 + 0.1634087677 = 75.1634087677;
		 *     - If completion spec set a priority of 49 or less, its priority would change to 49 + 0.1634087677 = 49.1634087677;
		 *     - If completion spec set a priority of 76 or more, its priority would change to 76 + 0.1634087677 = 76.1634087677;
		 *     - If a user had never selected a suggestion, then its priority would just stay as is (or if not set, default to 50).
		 *
		 * @example
		 * If you want your suggestions to always be:
		 *     - at the top order, rank them 76 or above.
		 *     - at the bottom, rank them 49 or below
		 */
		priority?: number;
		/**
		 * Specifies whether a suggestion should be hidden from results.
		 * @remarks
		 * Fig will only show it if the user exactly types the name.
		 * @defaultValue false
		 * @example
		 * The "-" suggestion is hidden in the `cd` spec. You will only see it if you type exactly  `cd -`
		 */
		hidden?: boolean;
		/**
		 *
		 * Specifies whether a suggestion is deprecated.
		 * @remarks
		 * It is possible to specify a suggestion to replace the deprecated one.
		 * - The `description` of the deprecated object (e.g `deprecated: { description: 'The --no-ansi option has been deprecated in v2' }`) is used to provide infos about the deprecation.
		 * - `deprecated: true` and `deprecated: { }` behave the same and will just display the suggestion as deprecated.
		 * @example
		 * ```js
		 * deprecated: { insertValue: '--ansi never', description: 'The --no-ansi option has been deprecated in v2' }
		 * ```
		 */
		deprecated?: boolean | Omit<BaseSuggestion, "deprecated">;

		/**
		 * Specifies which component to use to render the preview window.
		 *
		 * @remarks This should be the path within the `src` directory to the component without the extension.
		 *
		 * @example 'ls/filepathPreview'
		 */
		previewComponent?: string;

		/**
		 * This is a way to pass data to the Autocomplete Engine that is not formalized in the spec, do not use this in specs as it may change at any time
		 *
		 * @ignore
		 */
		_internal?: Record<string, unknown>;
	}

	/**
	 * Each item in Fig's autocomplete popup window is a Suggestion object. It is probably the most important object in Fig.
	 * Subcommand and Option objects compile down to Suggestion objects. Generators return Suggestion objects.
	 * The main things you can customize in your suggestion object is the text that's displayed, the icon, and what's inserted after being selected. In saying that, most of these have very sane defaults.
	 */
	interface Suggestion extends BaseSuggestion {
		/**
		 * The string Fig uses when filtering over a list of suggestions to check for a match.
		 * @remarks
		 * When a a user is typing in the terminal, the query term (the token they are currently typing) filters over all suggestions in a list by checking if the queryTerm matches the prefix of the name.
		 * The `displayName` prop also defaults to the value of name.
		 *
		 * The `name` props of suggestion, subcommand, option, and arg objects are all different. It's important to read them all carefully.
		 *
		 * @example
		 * If a user types git `c`, any Suggestion objects with a name prop that has a value starting with "c" will match.
		 *
		 */
		name?: SingleOrArray<string>;
		/**
		 * The type of a suggestion object.
		 * @remarks
		 * The type determines
		 * - the default icon Fig uses (e.g. a file or folder searches for the system icon, a subcommand has a specific icon etc)
		 * - whether we allow users to auto-execute a command
		 */
		type?: SuggestionType;
	}

	/**
	 * The subcommand object represent the tree structure of a completion spec. We sometimes also call it the skeleton.
	 *
	 * A subcommand can nest options, arguments, and more subcommands (it's recursive)
	 */
	interface Subcommand extends BaseSuggestion {
		/**
		 * The name of the subcommand. Should exactly match the name defined by the CLI tool.
		 *
		 * @remarks
		 * If a subcommand has multiple aliases, they should be included as an array.
		 *
		 * Note that Fig's autocomplete engine requires this `name` to match the text typed by the user in the shell.
		 *
		 * To customize the title that is displayed to the user, use `displayName`.
		 *
		 *
		 * @example
		 * For `git checkout`, the subcommand `checkout` would have `name: "checkout"`
		 * @example
		 * For `npm install`, the subcommand `install` would have `name: ["install", "i"]` as these two values both represent the same subcommand.
		 */
		name: SingleOrArray<string>;

		/**
		 * An array of `Subcommand` objects representing all the subcommands that exist beneath the current command.
		 *     *
		 * To support large CLI tools, `Subcommands` can be nested recursively.
		 *
		 * @example
		 * A CLI tool like `aws` is composed of many top-level subcommands (`s3`, `ec2`, `eks`...), each of which include child subcommands of their own.
		 */
		subcommands?: Subcommand[];

		/**
		 * Specifies whether the command requires a subcommand. This is false by default.
		 *
		 * A space will always be inserted after this command if `requiresSubcommand` is true.
		 * If the property is omitted, a space will be inserted if there is at least one required argument.
		 */
		requiresSubcommand?: boolean;

		/**
		 * An array of `Option` objects representing the options that are available on this subcommand.
		 *
		 * @example
		 * A command like `git commit` accepts various flags and options, such as `--message` and `--all`. These `Option` objects would be included in the `options` field.
		 */
		options?: Option[];

		/**
		 * An array of `Arg` objects representing the various parameters or "arguments" that can be passed to this subcommand.
		 *
		 */
		args?: SingleOrArray<Arg>;
		/**
		 * This option allows to enforce the suggestion filtering strategy for a specific subcommand.
		 * @remarks
		 * Users always want to have the most accurate results at the top of the suggestions list.
		 * For example we can enable fuzzy search on a subcommand that always requires fuzzy search to show the best suggestions.
		 * This property is also useful when subcommands or options have a prefix (e.g. the npm package scope) because enabling fuzzy search users can omit that part (see the second example below)
		 * @example
		 * yarn workspace [name] with fuzzy search is way more useful since we can omit the npm package scope
		 * @example
		 * fig settings <setting name> uses fuzzy search to prevent having to add the `autocomplete.` prefix to each searched setting
		 * ```typescript
		 * const figSpec: Fig.Spec {
		 *   name: "fig",
		 *   subcommands: [
		 *     {
		 *       name: "settings",
		 *       filterStrategy: "fuzzy",
		 *       subcommands: [
		 *         {
		 *           name: "autocomplete.theme", // if a user writes `fig settings theme` it gets the correct suggestions
		 *         },
		 *         // ... other settings
		 *       ]
		 *     },
		 *     // ... other fig subcommands
		 *   ]
		 * }
		 * ```
		 */
		filterStrategy?: "fuzzy" | "prefix" | "default";
		/**
		 * A list of Suggestion objects that are appended to the suggestions shown beneath a subcommand.
		 *
		 * @remarks
		 * You can use this field to suggest common workflows.
		 *
		 */
		additionalSuggestions?: (string | Suggestion)[];
		/**
		 * Dynamically load another completion spec at runtime.
		 *
		 * @param tokens - a tokenized array of the text the user has typed in the shell.
		 * @param executeCommand - an async function that can execute a shell command on behalf of the user. The output is a string.
		 * @returns A `SpecLocation` object or an array of `SpecLocation` objects.
		 *
		 * @remarks
		 * `loadSpec` can be invoked as string (recommended) or a function (advanced).
		 *
		 * The API tells the autocomplete engine where to look for a completion spec. If you pass a string, the engine will attempt to locate a matching spec that is hosted by Fig.
		 *
		 * @example
		 * Suppose you have an internal CLI tool that wraps `kubectl`. Instead of copying the `kubectl` completion spec, you can include the spec at runtime.
		 * ```typescript
		 * {
		 *   name: "kube",
		 *   description: "a wrapper around kubectl"
		 *   loadSpec: "kubectl"
		 * }
		 * ```
		 * @example
		 * In the `aws` completion spec, `loadSpec` is used to optimize performance. The completion spec is split into multiple files, each of which can be loaded separately.
		 * ```typescript
		 * {
		 *   name: "s3",
		 *   loadSpec: "aws/s3"
		 * }
		 * ```
		 */
		loadSpec?: LoadSpec;
		/**
		 * Dynamically *generate* a `Subcommand` object a runtime. The generated `Subcommand` is merged with the current subcommand.
		 *
		 * @remarks
		 * This API is often used by CLI tools where the structure of the CLI tool is not *static*. For instance, if the tool can be extended by plugins or otherwise shows different subcommands or options depending on the environment.
		 *
		 * @param tokens - a tokenized array of the text the user has typed in the shell.
		 * @param executeCommand - an async function that can execute a shell command on behalf of the user. The output is a string.
		 * @returns a `Fig.Spec` object
		 *
		 * @example
		 * The `python` spec uses `generateSpec` to include the`django-admin` spec if `django manage.py` exists.
		 * ```typescript
		 * generateSpec: async (tokens, executeCommand) => {
		 *    // Load the contents of manage.py
		 *    const managePyContents = await executeCommand("cat manage.py");
		 *    // Heuristic to determine if project uses django
		 *    if (managePyContents.contains("django")) {
		 *      return {
		 *        name: "python",
		 *        subcommands: [{ name: "manage.py", loadSpec: "django-admin" }],
		 *      };
		 *    }
		 *  },
		 * ```
		 */
		generateSpec?: (tokens: string[], executeCommand: ExecuteCommandFunction) => Promise<Spec | undefined>;

		/**
		 * Generating a spec can be expensive, but due to current guarantees they are not cached.
		 * This function generates a cache key which is used to cache the result of generateSpec.
		 * If `undefined` is returned, the cache will not be used.
		 */
		generateSpecCacheKey?: Function<{ tokens: string[] }, string | undefined> | string;

		/**
		 * Configure how the autocomplete engine will map the raw tokens to a given completion spec.
		 *
		 * @param flagsArePosixNoncompliant - Indicates that flags with one hyphen may have *more* than one character. Enabling this directive, turns off support for option chaining.
		 * @param optionsMustPrecedeArguments - Options will not be suggested after any argument of the Subcommand has been typed.
		 * @param optionArgSeparators - Indicate that options which take arguments will require one of the specified separators between the 'verbose' option name and the argument.
		 *
		 * @example
		 * The `-work` option from the `go` spec is parsed as a single flag when `parserDirectives.flagsArePosixNoncompliant` is set to true. Normally, this would be chained and parsed as `-w -o -r -k` if `flagsArePosixNoncompliant` is not set to true.
		 */
		parserDirectives?: {
			flagsArePosixNoncompliant?: boolean;
			optionsMustPrecedeArguments?: boolean;
			optionArgSeparators?: SingleOrArray<string>;
		};

		/**
		 * Specifies whether or not to cache the result of loadSpec and generateSpec
		 *
		 * @remarks
		 * Caching is good because it reduces the time to completion on subsequent calls to a dynamic subcommand, but when the data does not outlive the cache this allows a mechanism for opting out of it.
		 */
		cache?: boolean;
	}

	/**
	 * The option object represent CLI options (sometimes called flags).
	 *
	 * A option can have an argument. An option can NOT have subcommands or other option
	 */
	interface Option extends BaseSuggestion {
		/**
		 * The exact name of the subcommand as defined in the CLI tool.
		 *
		 * @remarks
		 * Fig's parser relies on your option name being exactly what the user would type. (e.g. if the user types `git "-m"`, you must have `name: "-m"` and not something like `name: "your message"` or even with an `=` sign like`name: "-m="`)
		 *
		 * If you want to customize what the text the popup says, use `displayName`.
		 *
		 * The name prop in an Option object compiles down to the name prop in a Suggestion object
		 *
		 * Final note: the name prop can be a string (most common) or an array of strings
		 *
		 *
		 * @example
		 * For `git commit -m` in the, message option nested beneath `commit` would have `name: ["-m", "--message"]`
		 * @example
		 * For `ls -l` the `-l` option would have `name: "-l"`
		 */
		name: SingleOrArray<string>;

		/**
		 * An array of arg objects or a single arg object
		 *
		 * @remarks
		 * If a subcommand takes an argument, please at least include an empty Arg Object. (e.g. `{ }`). Why? If you don't, Fig will assume the subcommand does not take an argument. When the user types their argument
		 * If the argument is optional, signal this by saying `isOptional: true`.
		 *
		 * @example
		 * `npm run` takes one mandatory argument. This can be represented by `args: { }`
		 * @example
		 * `git push` takes two optional arguments. This can be represented by: `args: [{ isOptional: true }, { isOptional: true }]`
		 * @example
		 * `git clone` takes one mandatory argument and one optional argument. This can be represented by: `args: [{ }, { isOptional: true }]`
		 */
		args?: SingleOrArray<Arg>;
		/**
		 *
		 * Signals whether an option is persistent, meaning that it will still be available
		 * as an option for all child subcommands.
		 *
		 * @remarks
		 * As of now there is no way to disable this
		 * persistence for certain children. Also see
		 * https://github.com/spf13/cobra/blob/master/user_guide.md#persistent-flags.
		 *
		 * @defaultValue false
		 *
		 * @example
		 * Say the `git` spec had an option at the top level with `{ name: "--help", isPersistent: true }`.
		 * Then the spec would recognize both `git --help` and `git commit --help`
		 * as a valid as we are passing the `--help` option to all `git` subcommands.
		 *
		 */
		isPersistent?: boolean;
		/**
		 * Signals whether an option is required.
		 *
		 * @defaultValue false (option is NOT required)
		 * @example
		 * The `-m` option of `git commit` is required
		 *
		 */
		isRequired?: boolean;
		/**
		 *
		 * Signals whether an equals sign is required to pass an argument to an option (e.g. `git commit --message="msg"`)
		 * @defaultValue false (does NOT require an equal)
		 *
		 * @example
		 * When `requiresEqual: true` the user MUST do `--opt=value` and cannot do `--opt value`
		 *
		 * @deprecated use `requiresSeparator` instead
		 *
		 */
		requiresEquals?: boolean;
		/**
		 *
		 * Signals whether one of the separators specified in parserDirectives is required to pass an argument to an option (e.g. `git commit --message[separator]"msg"`)
		 * If set to true this will automatically insert an equal after the option name.
		 * If set to a separator (string) this will automatically insert the separator specified after the option name.
		 * @defaultValue false (does NOT require a separator)
		 *
		 * @example
		 * When `requiresSeparator: true` the user MUST do `--opt=value` and cannot do `--opt value`
		 * @example
		 * When `requiresSeparator: ':'` the user MUST do `--opt:value` and cannot do `--opt value`
		 */
		requiresSeparator?: boolean | string;
		/**
		 *
		 * Signals whether an option can be passed multiple times.
		 *
		 * @defaultValue false (option is NOT repeatable)
		 *
		 * @remarks
		 * Passing `isRepeatable: true` will allow an option to be passed any number
		 * of times, while passing `isRepeatable: 2` will allow it to be passed
		 * twice, etc. Passing `isRepeatable: false` is the same as passing
		 * `isRepeatable: 1`.
		 *
		 * If you explicitly specify the isRepeatable option in a spec, this
		 * constraint will be enforced at the parser level, meaning after the option
		 * (say `-o`) has been passed the maximum number of times, Fig's parser will
		 * not recognize `-o` as an option if the user types it again.
		 *
		 * @example
		 * In `npm install` doesn't specify `isRepeatable` for `{ name: ["-D", "--save-dev"] }`.
		 * When the user types `npm install -D`, Fig will no longer suggest `-D`.
		 * If the user types `npm install -D -D`. Fig will still parse the second
		 * `-D` as an option.
		 *
		 * Suppose `npm install` explicitly specified `{ name: ["-D", "--save-dev"], isRepeatable: false }`.
		 * Now if the user types `npm install -D -D`, Fig will instead parse the second
		 * `-D` as the argument to the `install` subcommand instead of as an option.
		 *
		 * @example
		 * SSH has `{ name: "-v", isRepeatable: 3 }`. When the user types `ssh -vv`, Fig
		 * will still suggest `-v`, when the user types `ssh -vvv` Fig will stop
		 * suggesting `-v` as an option. Finally if the user types `ssh -vvvv` Fig's
		 * parser will recognize that this is not a valid string of chained options
		 * and will treat this as an argument to `ssh`.
		 *
		 */
		isRepeatable?: boolean | number;
		/**
		 *
		 * Signals whether an option is mutually exclusive with other options (ie if the user has this option, Fig should not show the options specified).
		 * @defaultValue false
		 *
		 * @remarks
		 * Options that are mutually exclusive with flags the user has already passed will not be shown in the suggestions list.
		 *
		 * @example
		 * You might see `[-a | --interactive | --patch]` in a man page. This means each of these options are mutually exclusive on each other.
		 * If we were defining the exclusive prop of the "-a" option, then we would have `exclusive: ["--interactive", "--patch"]`
		 *
		 */
		exclusiveOn?: string[];
		/**
		 *
		 *
		 * Signals whether an option depends on other options (ie if the user has this option, Fig should only show these options until they are all inserted).
		 *
		 * @defaultValue false
		 *
		 * @remarks
		 * If the user has an unmet dependency for a flag they've already typed, this dependency will have boosted priority in the suggestion list.
		 *
		 * @example
		 * In a tool like firebase, we may want to delete a specific extension. The command might be `firebase delete --project ABC --extension 123` This would mean we delete the 123 extension from the ABC project.
		 * In this case, `--extension` dependsOn `--project`
		 *
		 */
		dependsOn?: string[];
	}

	/**
	 * The arg object represent CLI arguments (sometimes called positional arguments).
	 *
	 * An argument is different to a subcommand object and option object. It does not compile down to a suggestion object. Rather, it represents custom user input. If you want to generate suggestions for this custom user input, you should use the generator prop nested beneath an Arg object
	 */
	interface Arg {
		/**
		 * The name of an argument. This is different to the `name` prop for subcommands, options, and suggestion objects so please read carefully.
		 * This `name` prop signals a normal, human readable string. It usually signals to the user the type of argument they are inserting if there are no available suggestions.
		 * Unlike subcommands and options, Fig does NOT use this value for parsing. Therefore, it can be whatever you want.
		 *
		 * @example
		 * The name prop for the `git commit -m <msg>` arg object is "msg". But you could also make it "message" or "your message". It is only used for description purposes (you see it when you type the message), not for parsing!
		 */
		name?: string;

		/**
		 * The text that gets rendered at the bottom of the autocomplete box a) when the user is inputting an argument and there are no suggestions and b) for all generated suggestions for an argument
		 * Keep it short and direct!
		 *
		 * @example
		 * "Your commit message"
		 */
		description?: string;

		/**
		 * Specifies whether the suggestions generated for this argument are "dangerous".
		 *
		 * @remarks
		 * If true, Fig will not enable its autoexecute functionality. Autoexecute means if a user selects a suggestion it will insert the text and run the command. We signal this by changing the icon to red.
		 * Turning on isDangerous will make it harder for a user to accidentally run a dangerous command.
		 *
		 * @defaultValue false
		 *
		 * @example
		 * This is used for all arguments in the `rm` spec.
		 */
		isDangerous?: boolean;

		/**
		 * A list of Suggestion objects that are shown when a user is typing an argument.
		 *
		 * @remarks
		 * These suggestions are static meaning you know them beforehand and they are not generated at runtime. If you want to generate suggestions at runtime, use a generator
		 *
		 * @example
		 * For `git reset <branch or commit>`, a two common arguments to pass are "head" and "head^". Therefore, the spec suggests both of these by using the suggestion prop
		 */
		suggestions?: (string | Suggestion)[];
		/**
		 * A template which is a single TemplateString or an array of TemplateStrings
		 *
		 * @remarks
		 * Templates are generators prebuilt by Fig. Here are the three templates:
		 * - filepaths: show folders and filepaths. Allow autoexecute on filepaths
		 * - folders: show folders only. Allow autoexecute on folders
		 * - history: show suggestions for all items in history matching this pattern
		 * - help: show subcommands. Only includes the 'siblings' of the nearest 'parent' subcommand
		 *
		 * @example
		 * `cd` uses the "folders" template
		 * @example
		 * `ls` used  ["filepaths", "folders"]. Why both? Because if I `ls` a directory, we want to enable a user to autoexecute on this directory. If we just did "filepaths" they couldn't autoexecute.
		 *
		 */
		template?: Template;
		/**
		 *
		 * Generators let you dynamically generate suggestions for arguments by running shell commands on a user's device.
		 *
		 * This takes a single generator or an array of generators
		 */
		generators?: SingleOrArray<Generator>;
		/**
		 * This option allows to enforce the suggestion filtering strategy for a specific argument suggestions.
		 * @remarks
		 * Users always want to have the most accurate results at the top of the suggestions list.
		 * For example we can enable fuzzy search on an argument that always requires fuzzy search to show the best suggestions.
		 * This property is also useful when argument suggestions have a prefix (e.g. the npm package scope) because enabling fuzzy search users can omit that part (see the second example below)
		 * @example
		 * npm uninstall [packages...] uses fuzzy search to allow searching for installed packages ignoring the package scope
		 * ```typescript
		 * const figSpec: Fig.Spec {
		 *   name: "npm",
		 *   subcommands: [
		 *     {
		 *       args: {
		 *         name: "packages",
		 *         filterStrategy: "fuzzy", // search in suggestions provided by the generator (in this case) using fuzzy search
		 *         generators: generateNpmDeps,
		 *         isVariadic: true,
		 *       },
		 *     },
		 *     // ... other npm commands
		 *   ],
		 * }
		 * ```
		 */
		filterStrategy?: "fuzzy" | "prefix" | "default";
		/**
		 * Provide a suggestion at the top of the list with the current token that is being typed by the user.
		 */
		suggestCurrentToken?: boolean;
		/**
		 * Specifies that the argument is variadic and therefore repeats infinitely.
		 *
		 * @remarks
		 * Man pages represent variadic arguments with an ellipsis e.g. `git add <pathspec...>`
		 *
		 * @example
		 * `echo` takes a variadic argument (`echo hello world ...`)
		 * @example
		 * `git add` also takes a variadic argument
		 */
		isVariadic?: boolean;

		/**
		 * Specifies whether options can interrupt variadic arguments. There is
		 * slightly different behavior when this is used on an option argument and
		 * on a subcommand argument:
		 *
		 * - When an option breaks a *variadic subcommand argument*, after the option
		 * and any arguments are parsed, the parser will continue parsing variadic
		 * arguments to the subcommand
		 * - When an option breaks a *variadic option argument*, after the breaking
		 * option and any arguments are parsed, the original variadic options
		 * arguments will be terminated. See the second examples below for details.
		 *
		 *
		 * @defaultValue true
		 *
		 * @example
		 * When true for git add's argument:
		 * `git add file1 -v file2` will interpret `-v` as an option NOT an
		 * argument, and will continue interpreting file2 as a variadic argument to
		 * add after
		 *
		 * @example
		 * When true for -T's argument, where -T is a variadic list of tags:
		 * `cmd -T tag1 tag2 -p project tag3` will interpret `-p` as an option, but
		 * will then terminate the list of tags. So tag3 is not parsed as an
		 * argument to `-T`, but rather as a subcommand argument to `cmd` if `cmd`
		 * takes any arguments.
		 *
		 * @example
		 * When false:
		 * `echo hello -n world` will treat -n as an argument NOT an option.
		 * However, in `echo -n hello world` it will treat -n as an option as
		 * variadic arguments haven't started yet
		 *
		 */
		optionsCanBreakVariadicArg?: boolean;

		/**
		 * `true` if an argument is optional (ie the CLI spec says it is not mandatory to include an argument, but you can if you want to).
		 *
		 * @remarks
		 * NOTE: It is important you include this for our parsing. If you don't, Fig will assume the argument is mandatory. When we assume an argument is mandatory, we force the user to input the argument and hide all other suggestions.
		 *
		 * @example
		 * `git push [remote] [branch]` takes two optional args.
		 */
		isOptional?: boolean;
		/**
		 * Syntactic sugar over the `loadSpec` prop.
		 *
		 * @remarks
		 * Specifies that the argument is an entirely new command which Fig should start completing on from scratch.
		 *
		 * @example
		 * `time` and `builtin` have only one argument and this argument has the `isCommand` property. If I type `time git`, Fig will load up the git completion spec because the isCommand property is set.
		 */
		isCommand?: boolean;
		/**
		 * The same as the `isCommand` prop, except Fig will look for a completion spec in the `.fig/autocomplete/build` folder in the user's current working directory.
		 *
		 * @remarks
		 * See our docs for more on building completion specs for local scripts [Fig for Teams](https://fig.io/docs/)
		 * @example
		 * `python` take one argument which is a `.py` file. If I have a `main.py` file on my desktop and my current working directory is my desktop, if I type `python main.py[space]` Fig will look for a completion spec in `~/Desktop/.fig/autocomplete/build/main.py.js`
		 */
		isScript?: boolean;
		/**
		 * The same as the `isCommand` prop, except you specify a string to prepend to what the user inputs and fig will load the completion spec accordingly.
		 * @remarks
		 * If isModule: "python/", Fig would load up the `python/USER_INPUT.js` completion spec from the `~/.fig/autocomplete` folder.
		 * @example
		 * For `python -m`, the user can input a specific module such as http.server. Each module is effectively a mini CLI tool that should have its own completions. Therefore the argument object for -m has `isModule: "python/"`. Whatever the modules user inputs, Fig will look under the `~/.fig/autocomplete/python/` directory for completion spec.
		 *
		 * @deprecated use `loadSpec` instead
		 */
		isModule?: string;

		/**
		 * This will debounce every keystroke event for this particular arg.
		 * @remarks
		 * If there are no keystroke events after 100ms, Fig will execute all the generators in this arg and return the suggestions.
		 *
		 * @example
		 * `npm install` and `pip install` send debounced network requests after inactive typing from users.
		 */
		debounce?: boolean;
		/**
		 * The default value for an optional argument.
		 *
		 * @remarks
		 * Note: This is currently not used anywhere in Fig's autocomplete popup, but will be soon.
		 *
		 */
		default?: string;
		/**
		 * See [`loadSpec` in Subcommand Object](https://fig.io/docs/reference/subcommand#loadspec).
		 *
		 * @remarks
		 * There is a very high chance you want to use one of the following:
		 * 1. `isCommand` (See [Arg Object](https://fig.io/docs/reference/arg#iscommand))
		 * 2. `isScript` (See [Arg Object](https://fig.io/docs/reference/arg#isscript))
		 *
		 */
		loadSpec?: LoadSpec;

		/**
		 * The `arg.parserDirective.alias` prop defines whether Fig's tokenizer should expand out an alias into separate tokens then offer completions accordingly.
		 *
		 * @remarks
		 * This is similar to how Fig is able to offer autocomplete for user defined shell aliases, but occurs at the completion spec level.
		 *
		 * @param token - The token that the user has just typed that is an alias for something else
		 * @param executeCommand -an async function that allows you to execute a shell command on the user's system and get the output as a string.
		 * @returns The expansion of the alias that Fig's bash parser will reparse as if it were typed out in full, rather than the alias.
		 *
		 * If for some reason you know exactly what it will be, you may also just pass in the expanded alias, not a function that returns the expanded alias.
		 *
		 * @example
		 * git takes git aliases. These aliases are defined in a user's gitconfig file. Let's say a user has an alias for `p=push`, then if a user typed `git p[space]`, this function would take the `p` token, return `push` and then offer suggestions as if the user had typed `git push[space]`
		 *
		 * @example
		 * `npm run <script>` also takes an arg called "script". This arg is technically an alias for another shell command that is specified in the package.json.
		 * If the user typed `npm run start[space]`, the package.json had script `start=node index.js`, then Fig would start offering suggestions for as if you had just typed `node index.js[space]`
		 *
		 * Note: In both cases, the alias function is only used to expand a given alias NOT to generate the list of aliases. To generate a list of aliases, scripts etc, use a generator.
		 */
		parserDirectives?: {
			alias?: string | ((token: string, exec: ExecuteCommandFunction) => Promise<string>);
		};
	}

	/**
	 * The generator object is used to generate suggestions for an arg object. To do this, it runs a defined shell command on the user's device, gets the output, and returns a list of Suggestion objects.
	 *
	 */
	interface Generator {
		/**
		 * A template which is a single `TemplateString` or an array of `TemplateStrings`.
		 *
		 * @remarks
		 * Templates are generators prebuilt by Fig. Here are the three templates:
		 * - filepaths: show folders and filepaths. Allow autoexecute on filepaths
		 * - folders: show folders only. Allow autoexecute on folders
		 * - history: show suggestions for all items in history matching this pattern
		 * - help: show subcommands. Only includes the 'siblings' of the nearest 'parent' subcommand
		 *
		 * @example
		 * `cd` uses the "folders" template
		 * @example
		 * `ls` uses  ["filepaths", "folders"]. Why both? Because if I `ls` a directory, we want to enable a user to autoexecute on this directory. If we just did "filepaths" they couldn't autoexecute.
		 *
		 */
		template?: Template;
		/**
		 *
		 * A function to filter and modify suggestions returned by a template
		 *
		 * @param templateSuggestions - the array of suggestion objects returned by the given template.
		 * @returns An array of `Suggestion` objects.
		 *
		 * @example
		 * The python spec has an arg object which has a template for "filepaths". However, we don't want to suggest non `.py` files. Therefore, we take the output of the template, filter out all files that don't end in `.py`, keep all folders that end with `/` and return the list of suggestions.
		 */
		filterTemplateSuggestions?: Function<TemplateSuggestion[], Suggestion[]>;
		/**
		 *
		 * The command you wish to run on the user's device at their shell session's current working directory.
		 *
		 * @remarks
		 * You can either specify
		 * 1. a command and args to be executed (like `["ls"]` or `["git", "branch"]`)
		 * 2. a function to generate the command and args to be executed. The function takes in an array of tokens of the user input and should output a array of string (command and args). You use a function when the script you run is dependent upon one of the tokens the user has already input (for instance an app name, a Kubernetes token etc.)
		 * After executing the script, the stdout output will be passed to one of `splitOn` or `postProcess` for further processing to produce suggestion objects.
		 *
		 * @example
		 * `git checkout <branch>` takes one argument which is a git branch. Its arg object has a generator with a `script: ["git", "branch"]"`. The stdout output of this shell command is then passed into the postProcess function to generate the final suggestions.
		 */
		script?:
		| string[]
		| Function<string[], string[] | undefined> // <-- VS Code edit to make results correct
		| ExecuteCommandInput
		| Function<string[], ExecuteCommandInput>;
		/**
		 * Set the execution timeout of the command specified in the `script` prop.
		 * @defaultValue 5000
		 */
		scriptTimeout?: number;
		/**
		 *
		 * Process the string output from the `script` prop and return a list of suggestions
		 *
		 * @param out - The output of the script that was executed on the user's device
		 * @param tokens - a tokenized array of what the user has typed
		 * @returns An array of `Suggestion` objects.
		 *
		 */
		postProcess?: (out: string, tokens: string[]) => (Suggestion | null)[] | undefined; // <-- VS Code edit to make results correct
		/**
		 * Syntactic sugar for `postProcess` function
		 *
		 * @remarks
		 * This takes in the text output of `script`, splits it on the string you provide here, and then automatically generates an array of suggestion objects for each item.
		 *
		 * @example
		 * Specify `\n` and Fig will split on new lines, and turn each line into a suggestion object with `name` prop equal to the value on the line.
		 */
		splitOn?: string;
		/**
		 *
		 * A function run on every keystroke that determines whether Fig should invalidate its cached list of suggestions and instead regenerate its list of suggestions.
		 *
		 * @remarks
		 * A note on how Fig works: Suggestions vs Filtered Suggestions
		 * Suggestions: Whenever you type a space indicating the start of a new token, Fig will regenerate a new list of suggestions e.g. `git[space]` will generate a list of suggestions for every subcommand, option, and arg
		 * Filtered Suggestions: When you type within the same token (e.g. `git c` -> `git ch`), Fig takes the token you are currently typing in and uses it to filter over the list of suggestions you have cached. e.g. `git c`. The list of suggestions is the same as before, but the filtered suggestions are now `commit`, `clean`, `clone`, and `checkout`.
		 *
		 * **Why don't we recalculate suggestions on each keystroke?**
		 * 1. It's expensive
		 * 2. We don't need to. The caching works nicely
		 *
		 * **So what does the trigger do?**
		 * The trigger function is run on every keystroke and tells us whether or not we should invalidate the cache and regenerate a list of suggestions.
		 * The trigger function is almost always used with a `custom` generator and the `getQueryTerm` function to make the autocomplete experience really good (it's how suggestions for `cd` work)
		 * It is especially beneficial when you want to generate suggestions for an argument contained inside a single string that is not separated by a space.
		 *
		 * **What is important to remember?**
		 * This function looks at the CHANGE in a token, not the current state of the token. If my token goes from `desktop` to `desktop/`, should I regenerate suggestions? Remember, users can paste text so theoretically any change is possible. It is totally valid for oldToken to be an empty string and newToken to be a 50 character string!
		 *
		 *
		 * @param newToken - The new token that was just typed by the user e.g. "desktop/""
		 * @param oldToken - The old token that was there before e.g. "desktop"
		 * @returns A boolean of whether or not we should regenerate suggestions
		 *
		 * @defaultValue
		 * `false`
		 * It means that the function returns false ie we do not regenerate suggestion on each keystroke and instead, keep our cached list of suggestions while the user is editing the current token.
		 *
		 * @example
		 * `chmod`: If I type `chmod u` we should generate suggestions for `u+x`, `u+r`, `u-w` etc. Whereas if I typed `chmod 7` we should generate suggestions for `755` or `777` etc.
		 * The suggestion we generate depends on the new information we have. The oldToken was an empty string, the new token could be a `7` or a `u` etc...
		 *
		 *   All this function's job is to say whether or not we should generate new suggestions. It does not specify how to create these new suggestions. This is the job of the `script` or `custom` props. Annoyingly, you may have to implement some of the same parsing logic again. However, because this is javascript, just create a function so you don't have to repeat yourself :)
		 *
		 *   Note: yes, we could have generate a list of suggestions at the start for every single permutation of 777 or u+x etc, however, there are so many and this is just not performant!
		 *
		 * @example
		 * `cd`: Let's say a user has "cd desktop" currently typed then the user types a "/" so the changes to "cd ~/desktop/".
		 * The old token is "~/desktop", new token is "desktop/". This is a perfect time for us to generate a new list of suggestions. We previously had all the folders in my ~ directory as suggestions, but after the total number of `/` in the tokens changed, we should trigger a new set of suggestions to be generated. This new set of suggestions should then generate suggestions for the desktop directory, not the ~ directory.
		 */
		trigger?: Trigger;
		/**
		 * A function that takes the token that the user has typed and determines which part of it should be used to filter over all the suggestions.
		 *
		 * @param token - The full token the user is currently typing
		 * @returns The query term that Fig will use to filter over suggestions
		 *
		 * @remarks
		 * Read the note above on how triggers work. Triggers and query term may seem similar but are actually different.
		 *
		 * The `trigger` function defines when to regenerate new suggestions.
		 * The `query` term defines what characters we should use to filter over these suggestions.
		 * The `getQueryTerm` function defines the queryTerm
		 *
		 * @example
		 * `cd` has a `getQueryTerm` function that takes the token the user has typed and returns everything after the last "/".
		 * if the user types cd `~/desktop/a`, the list of suggestions will be all the folders on the user's desktop. We want to filter over these folders with the query term `"a"` not `~/desktop/a`
		 *
		 */
		getQueryTerm?: StringOrFunction<string, string>;
		/**
		 * An async function that is similar to the function version of `script`, however, it gives you full control.
		 *
		 * @remarks
		 * This function is effectively `script` and `postProcess` combined. It is very useful in combination with `trigger` and `getQueryTerm` to generate suggestions as the user is typing inside a token. Read the description of `trigger` for more.
		 *
		 * @param tokens - a tokenized array of what the user has typed
		 * @param executeCommand - an async function that allows you to execute a shell command on the user's system and get the output as a string.
		 * @param shellContext - an object containing a user's currentWorkingDirectory, currentProcess, and if relevant, the sshPrefix string that can be used if the user is in an SSH session.
		 *
		 * @returns An array of suggestion objects
		 *
		 * @example
		 * In `cd` the custom function will combine the current working directory with everything up to the last `"/"` in the last token. It will then run `ls` at this path and generate a list of suggestions accordingly.
		 * e.g. if the user was currently in their home directory and typed "cd desktop/abcdef", then the custom function would return a list of directories at the `~/desktop` directory
		 * if the user was currently in their home directory and typed "cd desktop/my_folder/second_folder/aaaaa", then the custom function would return a list of directories at the `~/desktop/my_folder/second_folder` directory
		 * if the user was currently in their home directory and typed "cd /usr/bin/", then the custom function would return a list of directories at the `/usr/bin/` directory
		 *
		 * @example
		 * ```ts
		 * const generator: Fig.Generator = {
		 *   custom: async (tokens, executeCommand) => {
		 *     const out = await executeCommand("ls");
		 *     return out.split("\n").map((elm) => ({ name: elm }));
		 *   },
		 * };
		 * ```
		 */
		custom?: (
			tokens: string[],
			executeCommand: ExecuteCommandFunction,
			generatorContext: GeneratorContext
		) => Promise<(Suggestion | null)[] | undefined>; // <-- VS Code edit to make results correct
		/**
		 *
		 * Cache the response of generators for a specific period time and optionally by directory the commands were executed in.
		 *
		 * @remarks
		 * For commands that take a long time to run, Fig gives you the option to cache their response. You can cache the response globally or just by the directory they were run in.
		 * We currently have two cache strategies:
		 * - `stale-while-revalidate` (default): when cache becomes stale fig will return the stale data while fetching the updated one. This strategy accepts a `ttl` (time to live) to configure how long it takes for the cache to become stale.
		 * - `max-age`: will show a loading indicator when cache is stale. You need to specify a `ttl` for how long it takes for the cache to become stale.
		 * You can also optionally turn on the ability to just cache by directory (`cacheByDirectory: true`)
		 *
		 * @example
		 * The kubernetes spec makes use of this.
		 *
		 */
		cache?: Cache;
	}
}
