const GlobalOptions: Fig.Option[] = [
	{
		name: ["-v", "--verbose"],
		description: "Enable verbose logging",
	},
	{
		name: ["-q", "--quiet"],
		description: "Print diagnostics, but nothing else",
	},
	{
		name: ["-s", "--silent"],
		description:
			'Disable all logging (but still exit with status code "1" upon detecting diagnostics)',
	},
	{
		name: "--config",
		description:
			"Path to the `pyproject.toml` or `ruff.toml` file to use for configuration",
		args: {
			name: "config",
			isOptional: true,
			template: "filepaths",
		},
	},
	{
		name: "--isolated",
		description: "Ignore all configuration files",
	},
	{
		name: "--help",
		description: "Print help",
	},
];

const checkOptions: Fig.Option[] = [
	{
		name: "--fix",
		description: "Apply fixes to resolve lint violations",
	},
	{
		name: "--unsafe-fixes",
		description:
			"Include fixes that may not retain the original intent of the code",
	},
	{
		name: "--show-fixes",
		description: "Show an enumeration of all fixed lint violations",
	},
	{
		name: "--diff",
		description:
			"Avoid writing any fixed files back; instead, output a diff for each changed file to stdout, and exit 0 if there are no diffs. Implies `--fix-only`",
	},
	{
		name: ["-w", "--watch"],
		description: "Run in watch mode by re-running whenever files change",
	},
	{
		name: "--fix-only",
		description:
			"Apply fixes to resolve lint violations, but don't report on, or exit non-zero for, leftover violations. Implies `--fix`",
	},
	{
		name: "--ignore-noqa",
		description: "Ignore any `# noqa` comments",
	},
	{
		name: "--output-format",
		description:
			"Output serialization format for violations. The default serialization format is 'full'",
		args: {
			name: "output_format",
			isOptional: true,
			suggestions: [
				"concise",
				"full",
				"json",
				"json-lines",
				"junit",
				"grouped",
				"github",
				"gitlab",
				"pylint",
				"rdjson",
				"azure",
				"sarif",
			],
		},
	},
	{
		name: ["-o", "--output-file"],
		description: "Specify file to write the linter output to (default: stdout)",
		args: {
			name: "output_file",
			isOptional: true,
			template: "filepaths",
		},
	},
	{
		name: "--target-version",
		description: "The minimum Python version that should be supported",
		args: {
			name: "target_version",
			isOptional: true,
			suggestions: ["py37", "py38", "py39", "py310", "py311", "py312", "py313"],
		},
	},
	{
		name: "--preview",
		description:
			"Enable preview mode; checks will include unstable rules and fixes",
	},
	{
		name: "--extension",
		description:
			"List of mappings from file extension to language (one of `python`, `ipynb`, `pyi`). For example, to treat `.ipy` files as IPython notebooks, use `--extension ipy:ipynb`",
		args: {
			name: "extension",
			isOptional: true,
		},
	},
	{
		name: "--statistics",
		description: "Show counts for every rule with at least one violation",
	},
	{
		name: "--add-noqa",
		description:
			"Enable automatic additions of `noqa` directives to failing lines",
	},
	{
		name: "--show-files",
		description:
			"See the files Ruff will be run against with the current settings",
	},
	{
		name: "--show-settings",
		description: "See the settings Ruff will use to lint a given Python file",
	},
	{
		name: ["-h", "--help"],
		description: "Print help",
	},
	{
		name: "--select",
		description:
			"Comma-separated list of rule codes to enable (or ALL, to enable all rules)",
		args: {
			name: "select",
			isOptional: true,
		},
	},
	{
		name: "--ignore",
		description: "Comma-separated list of rule codes to disable",
		args: {
			name: "ignore",
			isOptional: true,
		},
	},
	{
		name: "--extend-select",
		description:
			"Like --select, but adds additional rule codes on top of the selected ones",
		args: {
			name: "extend_select",
			isOptional: true,
		},
	},
	{
		name: "--per-file-ignores",
		description: "List of mappings from file pattern to code to exclude",
		args: {
			name: "per_file_ignores",
			isOptional: true,
		},
	},
	{
		name: "--extend-per-file-ignores",
		description:
			"Like `--per-file-ignores`, but adds additional ignores on top of those already specified",
		args: {
			name: "extend_per_file_ignores",
			isOptional: true,
		},
	},
	{
		name: "--fixable",
		description:
			"List of rule codes to treat as eligible for fix. Only applicable when fix itself is enabled (e.g., via `--fix`)",
		args: {
			name: "fixable",
			isOptional: true,
		},
	},
	{
		name: "--unfixable",
		description:
			"List of rule codes to treat as ineligible for fix. Only applicable when fix itself is enabled (e.g., via `--fix`)",
		args: {
			name: "unfixable",
			isOptional: true,
		},
	},
	{
		name: "--extend-fixable",
		description:
			"Like --fixable, but adds additional rule codes on top of those already specified",
		args: {
			name: "extend_fixable",
			isOptional: true,
		},
	},
	{
		name: "--exclude",
		description:
			"List of paths, used to omit files and/or directories from analysis",
		args: {
			name: "exclude",
			isOptional: true,
		},
	},
	{
		name: "--extend-exclude",
		description:
			"Like --exclude, but adds additional files and directories on top of those already excluded",
		args: {
			name: "extend_exclude",
			isOptional: true,
		},
	},
	{
		name: "--respect-gitignore",
		description:
			"Respect file exclusions via `.gitignore` and other standard ignore files",
	},
	{
		name: "--force-exclude",
		description:
			"Enforce exclusions, even for paths passed to Ruff directly on the command-line",
	},
	{
		name: ["-n", "--no-cache"],
		description: "Disable cache reads",
	},
	{
		name: "--cache-dir",
		description: "Path to the cache directory",
		args: {
			name: "cache_dir",
			isOptional: true,
			template: "filepaths",
		},
	},
	{
		name: "--stdin-filename",
		description: "The name of the file when passing it through stdin",
		args: {
			name: "stdin_filename",
			isOptional: true,
			template: "filepaths",
		},
	},
	{
		name: ["-e", "--exit-zero"],
		description:
			'Exit with status code "0", even upon detecting lint violations',
	},
	{
		name: "--exit-non-zero-on-fix",
		description:
			"Exit with a non-zero status code if any files were modified via fix, even if no lint violations remain",
	},
];

const formatOptions: Fig.Option[] = [
	{
		name: "--check",
		description:
			"Avoid writing any formatted files back; instead, exit with a non-zero status code if any files would have been modified, and zero otherwise",
	},
	{
		name: "--diff",
		description:
			"Avoid writing any formatted files back; instead, exit with a non-zero status code and the difference between the current file and how the formatted file would look like",
	},
	{
		name: "--extension",
		description:
			"List of mappings from file extension to language (one of `python`, `ipynb`, `pyi`). For example, to treat `.ipy` files as IPython notebooks, use `--extension ipy:ipynb`",
		args: {
			name: "extension",
			isOptional: true,
		},
	},
	{
		name: "--target-version",
		description: "The minimum Python version that should be supported",
		args: {
			name: "target_version",
			isOptional: true,
			suggestions: ["py37", "py38", "py39", "py310", "py311", "py312", "py313"],
		},
	},
	{
		name: "--preview",
		description:
			"Enable preview mode; enables unstable formatting. Use `--no-preview` to disable",
	},
	{
		name: ["-n", "--no-cache"],
		description: "Disable cache reads (env: RUFF_NO_CACHE=)",
	},
	{
		name: "--cache-dir",
		description: "Path to the cache directory (env: RUFF_CACHE_DIR=)",
		args: {
			name: "cache_dir",
			template: "filepaths",
		},
	},
	{
		name: "--stdin-filename",
		description: "The name of the file when passing it through stdin",
		args: {
			name: "stdin_filename",
			template: "filepaths",
		},
	},
	{
		name: "--respect-gitignore",
		description:
			"Respect file exclusions via `.gitignore` and other standard ignore files",
	},
	{
		name: "--exclude",
		description:
			"List of paths, used to omit files and/or directories from analysis",
		args: {
			name: "exclude",
			isOptional: true,
		},
	},
	{
		name: "--force-exclude",
		description:
			"Enforce exclusions, even for paths passed to Ruff directly on the command-line",
	},
	{
		name: "--line-length",
		description: "Set the line-length",
		args: {
			name: "line_length",
			isOptional: true,
		},
	},
	{
		name: "--range",
		description:
			"When specified, Ruff will try to only format the code in the given range",
		args: {
			name: "range",
			isOptional: true,
		},
	},
];

const rules: Fig.Suggestion[] = [
	{ name: "F401", description: "Unused-import" },
	{ name: "F402", description: "Import-shadowed-by-loop-var" },
	{ name: "F403", description: "Undefined-local-with-import-star" },
	{ name: "F404", description: "Late-future-import" },
	{ name: "F405", description: "Undefined-local-with-import-star-usage" },
	{
		name: "F406",
		description: "Undefined-local-with-nested-import-star-usage",
	},
	{ name: "F407", description: "Future-feature-not-defined" },
	{ name: "F501", description: "Percent-format-invalid-format" },
	{ name: "F502", description: "Percent-format-expected-mapping" },
	{ name: "F503", description: "Percent-format-expected-sequence" },
	{ name: "F504", description: "Percent-format-extra-named-arguments" },
	{ name: "F505", description: "Percent-format-missing-argument" },
	{
		name: "F506",
		description: "Percent-format-mixed-positional-and-named",
	},
	{ name: "F507", description: "Percent-format-positional-count-mismatch" },
	{ name: "F508", description: "Percent-format-star-requires-sequence" },
	{
		name: "F509",
		description: "Percent-format-unsupported-format-character",
	},
	{ name: "F521", description: "String-dot-format-invalid-format" },
	{ name: "F522", description: "String-dot-format-extra-named-arguments" },
	{
		name: "F523",
		description: "String-dot-format-extra-positional-arguments",
	},
	{ name: "F524", description: "String-dot-format-missing-arguments" },
	{ name: "F525", description: "String-dot-format-mixing-automatic" },
	{ name: "F541", description: "F-string-missing-placeholders" },
	{ name: "F601", description: "Multi-value-repeated-key-literal" },
	{ name: "F602", description: "Multi-value-repeated-key-variable" },
	{ name: "F621", description: "Expressions-in-star-assignment" },
	{ name: "F622", description: "Multiple-starred-expressions" },
	{ name: "F631", description: "Assert-tuple" },
	{ name: "F632", description: "Is-literal" },
	{ name: "F633", description: "Invalid-print-syntax" },
	{ name: "F634", description: "If-tuple" },
	{ name: "F701", description: "Break-outside-loop" },
	{ name: "F702", description: "Continue-outside-loop" },
	{ name: "F704", description: "Yield-outside-function" },
	{ name: "F706", description: "Return-outside-function" },
	{ name: "F707", description: "Default-except-not-last" },
	{ name: "F722", description: "Forward-annotation-syntax-error" },
	{ name: "F811", description: "Redefined-while-unused" },
	{ name: "F821", description: "Undefined-name" },
	{ name: "F822", description: "Undefined-export" },
	{ name: "F823", description: "Undefined-local" },
	{ name: "F841", description: "Unused-variable" },
	{ name: "F842", description: "Unused-annotation" },
	{ name: "F901", description: "Raise-not-implemented" },
	{ name: "E101", description: "Mixed-spaces-and-tabs" },
	{ name: "E111", description: "Indentation-with-invalid-multiple" },
	{ name: "E112", description: "No-indented-block" },
	{ name: "E113", description: "Unexpected-indentation" },
	{
		name: "E114",
		description: "Indentation-with-invalid-multiple-comment",
	},
	{ name: "E115", description: "No-indented-block-comment" },
	{ name: "E116", description: "Unexpected-indentation-comment" },
	{ name: "E117", description: "Over-indented" },
	{ name: "E201", description: "Whitespace-after-open-bracket" },
	{ name: "E202", description: "Whitespace-before-close-bracket" },
	{ name: "E203", description: "Whitespace-before-punctuation" },
	{ name: "E204", description: "Whitespace-after-decorator" },
	{ name: "E211", description: "Whitespace-before-parameters" },
	{ name: "E221", description: "Multiple-spaces-before-operator" },
	{ name: "E222", description: "Multiple-spaces-after-operator" },
	{ name: "E223", description: "Tab-before-operator" },
	{ name: "E224", description: "Tab-after-operator" },
	{ name: "E225", description: "Missing-whitespace-around-operator" },
	{
		name: "E226",
		description: "Missing-whitespace-around-arithmetic-operator",
	},
	{
		name: "E227",
		description: "Missing-whitespace-around-bitwise-or-shift-operator",
	},
	{
		name: "E228",
		description: "Missing-whitespace-around-modulo-operator",
	},
	{ name: "E231", description: "Missing-whitespace" },
	{ name: "E241", description: "Multiple-spaces-after-comma" },
	{ name: "E242", description: "Tab-after-comma" },
	{
		name: "E251",
		description: "Unexpected-spaces-around-keyword-parameter-equals",
	},
	{
		name: "E252",
		description: "Missing-whitespace-around-parameter-equals",
	},
	{ name: "E261", description: "Too-few-spaces-before-inline-comment" },
	{ name: "E262", description: "No-space-after-inline-comment" },
	{ name: "E265", description: "No-space-after-block-comment" },
	{
		name: "E266",
		description: "Multiple-leading-hashes-for-block-comment",
	},
	{ name: "E271", description: "Multiple-spaces-after-keyword" },
	{ name: "E272", description: "Multiple-spaces-before-keyword" },
	{ name: "E273", description: "Tab-after-keyword" },
	{ name: "E274", description: "Tab-before-keyword" },
	{ name: "E275", description: "Missing-whitespace-after-keyword" },
	{ name: "E301", description: "Blank-line-between-methods" },
	{ name: "E302", description: "Blank-lines-top-level" },
	{ name: "E303", description: "Too-many-blank-lines" },
	{ name: "E304", description: "Blank-line-after-decorator" },
	{ name: "E305", description: "Blank-lines-after-function-or-class" },
	{ name: "E306", description: "Blank-lines-before-nested-definition" },
	{ name: "E401", description: "Multiple-imports-on-one-line" },
	{ name: "E402", description: "Module-import-not-at-top-of-file" },
	{ name: "E501", description: "Line-too-long" },
	{ name: "E502", description: "Redundant-backslash" },
	{ name: "E701", description: "Multiple-statements-on-one-line-colon" },
	{
		name: "E702",
		description: "Multiple-statements-on-one-line-semicolon",
	},
	{ name: "E703", description: "Useless-semicolon" },
	{ name: "E711", description: "None-comparison" },
	{ name: "E712", description: "True-false-comparison" },
	{ name: "E713", description: "Not-in-test" },
	{ name: "E714", description: "Not-is-test" },
	{ name: "E721", description: "Type-comparison" },
	{ name: "E722", description: "Bare-except" },
	{ name: "E731", description: "Lambda-assignment" },
	{ name: "E741", description: "Ambiguous-variable-name" },
	{ name: "E742", description: "Ambiguous-class-name" },
	{ name: "E743", description: "Ambiguous-function-name" },
	{ name: "E902", description: "Io-error" },
	{ name: "W191", description: "Tab-indentation" },
	{ name: "W291", description: "Trailing-whitespace" },
	{ name: "W292", description: "Missing-newline-at-end-of-file" },
	{ name: "W293", description: "Blank-line-with-whitespace" },
	{ name: "W391", description: "Too-many-newlines-at-end-of-file" },
	{ name: "W505", description: "Doc-line-too-long" },
	{ name: "W605", description: "Invalid-escape-sequence" },
	{ name: "C901", description: "Complex-structure" },
	{ name: "N801", description: "Invalid-class-name" },
	{ name: "N802", description: "Invalid-function-name" },
	{ name: "N803", description: "Invalid-argument-name" },
	{
		name: "N804",
		description: "Invalid-first-argument-name-for-class-method",
	},
	{ name: "N805", description: "Invalid-first-argument-name-for-method" },
	{ name: "N806", description: "Non-lowercase-variable-in-function" },
	{ name: "N807", description: "Dunder-function-name" },
	{ name: "N811", description: "Constant-imported-as-non-constant" },
	{ name: "N812", description: "Lowercase-imported-as-non-lowercase" },
	{ name: "N813", description: "Camelcase-imported-as-lowercase" },
	{ name: "N814", description: "Camelcase-imported-as-constant" },
	{ name: "N815", description: "Mixed-case-variable-in-class-scope" },
	{ name: "N816", description: "Mixed-case-variable-in-global-scope" },
	{ name: "N817", description: "Camelcase-imported-as-acronym" },
	{ name: "N818", description: "Error-suffix-on-exception-name" },
	{ name: "N999", description: "Invalid-module-name" },
	{ name: "D100", description: "Undocumented-public-module" },
	{ name: "D101", description: "Undocumented-public-class" },
	{ name: "D102", description: "Undocumented-public-method" },
	{ name: "D103", description: "Undocumented-public-function" },
	{ name: "D104", description: "Undocumented-public-package" },
	{ name: "D105", description: "Undocumented-magic-method" },
	{ name: "D106", description: "Undocumented-public-nested-class" },
	{ name: "D107", description: "Undocumented-public-init" },
	{ name: "D200", description: "Fits-on-one-line" },
	{ name: "D201", description: "No-blank-line-before-function" },
	{ name: "D202", description: "No-blank-line-after-function" },
	{ name: "D203", description: "One-blank-line-before-class" },
	{ name: "D204", description: "One-blank-line-after-class" },
	{ name: "D205", description: "Blank-line-after-summary" },
	{ name: "D206", description: "Indent-with-spaces" },
	{ name: "D207", description: "Under-indentation" },
	{ name: "D208", description: "Over-indentation" },
	{ name: "D209", description: "New-line-after-last-paragraph" },
	{ name: "D210", description: "Surrounding-whitespace" },
	{ name: "D211", description: "Blank-line-before-class" },
	{ name: "D212", description: "Multi-line-summary-first-line" },
	{ name: "D213", description: "Multi-line-summary-second-line" },
	{ name: "D214", description: "Section-not-over-indented" },
	{ name: "D215", description: "Section-underline-not-over-indented" },
	{ name: "D300", description: "Triple-single-quotes" },
	{ name: "D301", description: "Escape-sequence-in-docstring" },
	{ name: "D400", description: "Ends-in-period" },
	{ name: "D401", description: "Non-imperative-mood" },
	{ name: "D402", description: "No-signature" },
	{ name: "D403", description: "First-line-capitalized" },
	{ name: "D404", description: "Docstring-starts-with-this" },
	{ name: "D405", description: "Capitalize-section-name" },
	{ name: "D406", description: "New-line-after-section-name" },
	{ name: "D407", description: "Dashed-underline-after-section" },
	{ name: "D408", description: "Section-underline-after-name" },
	{ name: "D409", description: "Section-underline-matches-section-length" },
	{ name: "D410", description: "No-blank-line-after-section" },
	{ name: "D411", description: "No-blank-line-before-section" },
	{ name: "D412", description: "Blank-lines-between-header-and-content" },
	{ name: "D413", description: "Blank-line-after-last-section" },
	{ name: "D414", description: "Empty-docstring-section" },
	{ name: "D415", description: "Ends-in-punctuation" },
	{ name: "D416", description: "Section-name-ends-in-colon" },
	{ name: "D417", description: "Undocumented-param" },
	{ name: "D418", description: "Overload-with-docstring" },
	{ name: "D419", description: "Empty-docstring" },
	{ name: "I001", description: "Unsorted-imports" },
	{ name: "I002", description: "Missing-required-import" },
	{ name: "UP001", description: "Useless-metaclass-type" },
	{ name: "UP003", description: "Type-of-primitive" },
	{ name: "UP004", description: "Useless-object-inheritance" },
	{ name: "UP005", description: "Deprecated-unittest-alias" },
	{ name: "UP006", description: "Non-pep585-annotation" },
	{ name: "UP007", description: "Non-pep604-annotation" },
	{ name: "UP008", description: "Super-call-with-parameters" },
	{ name: "UP009", description: "Utf8-encoding-declaration" },
	{ name: "UP010", description: "Unnecessary-future-import" },
	{ name: "UP011", description: "Lru-cache-without-parameters" },
	{ name: "UP012", description: "Unnecessary-encode-utf8" },
	{ name: "UP013", description: "Convert-typed-dict-functional-to-class" },
	{ name: "UP014", description: "Convert-named-tuple-functional-to-class" },
	{ name: "UP015", description: "Redundant-open-modes" },
	{ name: "UP017", description: "Datetime-timezone-utc" },
	{ name: "UP018", description: "Native-literals" },
	{ name: "UP019", description: "Typing-text-str-alias" },
	{ name: "UP020", description: "Open-alias" },
	{ name: "UP021", description: "Replace-universal-newlines" },
	{ name: "UP022", description: "Replace-stdout-stderr" },
	{ name: "UP023", description: "Deprecated-c-element-tree" },
	{ name: "UP024", description: "Os-error-alias" },
	{ name: "UP025", description: "Unicode-kind-prefix" },
	{ name: "UP026", description: "Deprecated-mock-import" },
	{ name: "UP027", description: "Unpacked-list-comprehension" },
	{ name: "UP028", description: "Yield-in-for-loop" },
	{ name: "UP029", description: "Unnecessary-builtin-import" },
	{ name: "UP030", description: "Format-literals" },
	{ name: "UP031", description: "Printf-string-formatting" },
	{ name: "UP032", description: "F-string" },
	{ name: "UP033", description: "Lru-cache-with-maxsize-none" },
	{ name: "UP034", description: "Extraneous-parentheses" },
	{ name: "UP035", description: "Deprecated-import" },
	{ name: "UP036", description: "Outdated-version-block" },
	{ name: "UP037", description: "Quoted-annotation" },
	{ name: "UP038", description: "Non-pep604-isinstance" },
	{ name: "UP039", description: "Unnecessary-class-parentheses" },
	{ name: "UP040", description: "Non-pep695-type-alias" },
	{ name: "UP041", description: "Timeout-error-alias" },
	{ name: "UP042", description: "Replace-str-enum" },
	{ name: "UP043", description: "Unnecessary-default-type-args" },
	{ name: "UP044", description: "Non-pep646-unpack" },
	{ name: "YTT101", description: "Sys-version-slice3" },
	{ name: "YTT102", description: "Sys-version2" },
	{ name: "YTT103", description: "Sys-version-cmp-str3" },
	{ name: "YTT201", description: "Sys-version-info0-eq3" },
	{ name: "YTT202", description: "Six-py3" },
	{ name: "YTT203", description: "Sys-version-info1-cmp-int" },
	{ name: "YTT204", description: "Sys-version-info-minor-cmp-int" },
	{ name: "YTT301", description: "Sys-version0" },
	{ name: "YTT302", description: "Sys-version-cmp-str10" },
	{ name: "YTT303", description: "Sys-version-slice1" },
	{ name: "ANN001", description: "Missing-type-function-argument" },
	{ name: "ANN002", description: "Missing-type-args" },
	{ name: "ANN003", description: "Missing-type-kwargs" },
	{
		name: "ANN201",
		description: "Missing-return-type-undocumented-public-function",
	},
	{ name: "ANN202", description: "Missing-return-type-private-function" },
	{ name: "ANN204", description: "Missing-return-type-special-method" },
	{ name: "ANN205", description: "Missing-return-type-static-method" },
	{ name: "ANN206", description: "Missing-return-type-class-method" },
	{ name: "ANN401", description: "Any-type" },
	{ name: "ASYNC100", description: "Cancel-scope-no-checkpoint" },
	{ name: "ASYNC105", description: "Trio-sync-call" },
	{ name: "ASYNC109", description: "Async-function-with-timeout" },
	{ name: "ASYNC110", description: "Async-busy-wait" },
	{ name: "ASYNC115", description: "Async-zero-sleep" },
	{ name: "ASYNC116", description: "Long-sleep-not-forever" },
	{ name: "ASYNC210", description: "Blocking-http-call-in-async-function" },
	{ name: "ASYNC220", description: "Create-subprocess-in-async-function" },
	{ name: "ASYNC221", description: "Run-process-in-async-function" },
	{ name: "ASYNC222", description: "Wait-for-process-in-async-function" },
	{ name: "ASYNC230", description: "Blocking-open-call-in-async-function" },
	{ name: "ASYNC251", description: "Blocking-sleep-in-async-function" },
	{ name: "S101", description: "Assert" },
	{ name: "S102", description: "Exec-builtin" },
	{ name: "S103", description: "Bad-file-permissions" },
	{ name: "S104", description: "Hardcoded-bind-all-interfaces" },
	{ name: "S105", description: "Hardcoded-password-string" },
	{ name: "S106", description: "Hardcoded-password-func-arg" },
	{ name: "S107", description: "Hardcoded-password-default" },
	{ name: "S108", description: "Hardcoded-temp-file" },
	{ name: "S110", description: "Try-except-pass" },
	{ name: "S112", description: "Try-except-continue" },
	{ name: "S113", description: "Request-without-timeout" },
	{ name: "S201", description: "Flask-debug-true" },
	{ name: "S202", description: "Tarfile-unsafe-members" },
	{ name: "S301", description: "Suspicious-pickle-usage" },
	{ name: "S302", description: "Suspicious-marshal-usage" },
	{ name: "S303", description: "Suspicious-insecure-hash-usage" },
	{ name: "S304", description: "Suspicious-insecure-cipher-usage" },
	{ name: "S305", description: "Suspicious-insecure-cipher-mode-usage" },
	{ name: "S306", description: "Suspicious-mktemp-usage" },
	{ name: "S307", description: "Suspicious-eval-usage" },
	{ name: "S308", description: "Suspicious-mark-safe-usage" },
	{ name: "S310", description: "Suspicious-url-open-usage" },
	{
		name: "S311",
		description: "Suspicious-non-cryptographic-random-usage",
	},
	{ name: "S312", description: "Suspicious-telnet-usage" },
	{ name: "S313", description: "Suspicious-xmlc-element-tree-usage" },
	{ name: "S314", description: "Suspicious-xml-element-tree-usage" },
	{ name: "S315", description: "Suspicious-xml-expat-reader-usage" },
	{ name: "S316", description: "Suspicious-xml-expat-builder-usage" },
	{ name: "S317", description: "Suspicious-xml-sax-usage" },
	{ name: "S318", description: "Suspicious-xml-mini-dom-usage" },
	{ name: "S319", description: "Suspicious-xml-pull-dom-usage" },
	{ name: "S320", description: "Suspicious-xmle-tree-usage" },
	{ name: "S321", description: "Suspicious-ftp-lib-usage" },
	{ name: "S323", description: "Suspicious-unverified-context-usage" },
	{ name: "S324", description: "Hashlib-insecure-hash-function" },
	{ name: "S401", description: "Suspicious-telnetlib-import" },
	{ name: "S402", description: "Suspicious-ftplib-import" },
	{ name: "S403", description: "Suspicious-pickle-import" },
	{ name: "S404", description: "Suspicious-subprocess-import" },
	{ name: "S405", description: "Suspicious-xml-etree-import" },
	{ name: "S406", description: "Suspicious-xml-sax-import" },
	{ name: "S407", description: "Suspicious-xml-expat-import" },
	{ name: "S408", description: "Suspicious-xml-minidom-import" },
	{ name: "S409", description: "Suspicious-xml-pulldom-import" },
	{ name: "S410", description: "Suspicious-lxml-import" },
	{ name: "S411", description: "Suspicious-xmlrpc-import" },
	{ name: "S412", description: "Suspicious-httpoxy-import" },
	{ name: "S413", description: "Suspicious-pycrypto-import" },
	{ name: "S415", description: "Suspicious-pyghmi-import" },
	{ name: "S501", description: "Request-with-no-cert-validation" },
	{ name: "S502", description: "Ssl-insecure-version" },
	{ name: "S503", description: "Ssl-with-bad-defaults" },
	{ name: "S504", description: "Ssl-with-no-version" },
	{ name: "S505", description: "Weak-cryptographic-key" },
	{ name: "S506", description: "Unsafe-yaml-load" },
	{ name: "S507", description: "Ssh-no-host-key-verification" },
	{ name: "S508", description: "Snmp-insecure-version" },
	{ name: "S509", description: "Snmp-weak-cryptography" },
	{ name: "S601", description: "Paramiko-call" },
	{ name: "S602", description: "Subprocess-popen-with-shell-equals-true" },
	{ name: "S603", description: "Subprocess-without-shell-equals-true" },
	{ name: "S604", description: "Call-with-shell-equals-true" },
	{ name: "S605", description: "Start-process-with-a-shell" },
	{ name: "S606", description: "Start-process-with-no-shell" },
	{ name: "S607", description: "Start-process-with-partial-path" },
	{ name: "S608", description: "Hardcoded-sql-expression" },
	{ name: "S609", description: "Unix-command-wildcard-injection" },
	{ name: "S610", description: "Django-extra" },
	{ name: "S611", description: "Django-raw-sql" },
	{ name: "S612", description: "Logging-config-insecure-listen" },
	{ name: "S701", description: "Jinja2-autoescape-false" },
	{ name: "S702", description: "Mako-templates" },
	{ name: "BLE001", description: "Do not catch blind exception" },
	{ name: "B002", description: "Unary-prefix-increment-decrement" },
	{ name: "B003", description: "Assignment-to-os-environ" },
	{ name: "B004", description: "Unreliable-callable-check" },
	{ name: "B005", description: "Strip-with-multi-characters" },
	{ name: "B006", description: "Mutable-argument-default" },
	{ name: "B007", description: "Unused-loop-control-variable" },
	{ name: "B008", description: "Function-call-in-default-argument" },
	{ name: "B009", description: "Get-attr-with-constant" },
	{ name: "B010", description: "Set-attr-with-constant" },
	{ name: "B011", description: "Assert-false" },
	{ name: "B012", description: "Jump-statement-in-finally" },
	{ name: "B013", description: "Redundant-tuple-in-exception-handler" },
	{ name: "B014", description: "Duplicate-handler-exception" },
	{ name: "B015", description: "Useless-comparison" },
	{ name: "B016", description: "Raise-literal" },
	{ name: "B017", description: "Assert-raises-exception" },
	{ name: "B018", description: "Useless-expression" },
	{ name: "B019", description: "Cached-instance-method" },
	{ name: "B020", description: "Loop-variable-overrides-iterator" },
	{ name: "B021", description: "F-string-docstring" },
	{ name: "B022", description: "Useless-contextlib-suppress" },
	{ name: "B023", description: "Function-uses-loop-variable" },
	{
		name: "B024",
		description: "Abstract-base-class-without-abstract-method",
	},
	{ name: "B025", description: "Duplicate-try-block-exception" },
	{ name: "B026", description: "Star-arg-unpacking-after-keyword-arg" },
	{ name: "B027", description: "Empty-method-without-abstract-decorator" },
	{ name: "B028", description: "No-explicit-stacklevel" },
	{ name: "B029", description: "Except-with-empty-tuple" },
	{ name: "B030", description: "Except-with-non-exception-classes" },
	{ name: "B031", description: "Reuse-of-groupby-generator" },
	{ name: "B032", description: "Unintentional-type-annotation" },
	{ name: "B033", description: "Duplicate-value" },
	{ name: "B034", description: "Re-sub-positional-args" },
	{ name: "B035", description: "Static-key-dict-comprehension" },
	{ name: "B039", description: "Mutable-contextvar-default" },
	{ name: "B901", description: "Return-in-generator" },
	{ name: "B904", description: "Raise-without-from-inside-except" },
	{ name: "B905", description: "Zip-without-explicit-strict" },
	{ name: "B909", description: "Loop-iterator-mutation" },
	{
		name: "FBT001",
		description: "Boolean-typed positional argument in function definition",
	},
	{
		name: "FBT002",
		description: "Boolean default positional argument in function definition",
	},
	{
		name: "FBT003",
		description: "Boolean positional value in function call",
	},
	{
		name: "A001",
		description: "Builtin-variable-shadowing",
	},
	{
		name: "A002",
		description: "Builtin-argument-shadowing",
	},
	{
		name: "A003",
		description: "Builtin-attribute-shadowing",
	},
	{
		name: "A004",
		description: "Builtin-import-shadowing",
	},
	{
		name: "A005",
		description: "Builtin-module-shadowing",
	},
	{
		name: "A006",
		description: "Builtin-lambda-argument-shadowing",
	},
	{
		name: "COM812",
		description: "Missing-trailing-comma",
	},
	{
		name: "COM818",
		description: "Trailing-comma-on-bare-tuple",
	},
	{
		name: "COM819",
		description: "Prohibited-trailing-comma",
	},
	{
		name: "CPY001",
		description: "Missing-copyright-notice",
	},
	{
		name: "C400",
		description: "Unnecessary-generator-list",
	},
	{
		name: "C401",
		description: "Unnecessary-generator-set",
	},
	{
		name: "C402",
		description: "Unnecessary-generator-dict",
	},
	{
		name: "C403",
		description: "Unnecessary-list-comprehension-set",
	},
	{
		name: "C404",
		description: "Unnecessary-list-comprehension-dict",
	},
	{
		name: "C405",
		description: "Unnecessary-literal-set",
	},
	{
		name: "C406",
		description: "Unnecessary-literal-dict",
	},
	{
		name: "C408",
		description: "Unnecessary-collection-call",
	},
	{
		name: "C409",
		description: "Unnecessary-literal-within-tuple-call",
	},
	{
		name: "C410",
		description: "Unnecessary-literal-within-list-call",
	},
	{
		name: "C411",
		description: "Unnecessary-list-call",
	},
	{
		name: "C413",
		description: "Unnecessary-call-around-sorted",
	},
	{
		name: "C414",
		description: "Unnecessary-double-cast-or-process",
	},
	{
		name: "C415",
		description: "Unnecessary-subscript-reversal",
	},
	{
		name: "C416",
		description: "Unnecessary-comprehension",
	},
	{
		name: "C417",
		description: "Unnecessary-map",
	},
	{
		name: "C418",
		description: "Unnecessary-literal-within-dict-call",
	},
	{
		name: "C419",
		description: "Unnecessary-comprehension-in-call",
	},
	{
		name: "C420",
		description: "Unnecessary-dict-comprehension-for-iterable",
	},
	{
		name: "DTZ001",
		description: "Call-datetime-without-tzinfo",
	},
	{
		name: "DTZ002",
		description: "Call-datetime-today",
	},
	{
		name: "DTZ003",
		description: "Call-datetime-utcnow",
	},
	{
		name: "DTZ004",
		description: "Call-datetime-utcfromtimestamp",
	},
	{
		name: "DTZ005",
		description: "Call-datetime-now-without-tzinfo",
	},
	{
		name: "DTZ006",
		description: "Call-datetime-fromtimestamp",
	},
	{
		name: "DTZ007",
		description: "Call-datetime-strptime-without-zone",
	},
	{
		name: "DTZ011",
		description: "Call-date-today",
	},
	{
		name: "DTZ012",
		description: "Call-date-fromtimestamp",
	},
	{
		name: "DTZ901",
		description: "Datetime-min-max",
	},
	{
		name: "DJ001",
		description: "Django-nullable-model-string-field",
	},
	{
		name: "DJ003",
		description: "Django-locals-in-render-function",
	},
	{
		name: "DJ006",
		description: "Django-exclude-with-model-form",
	},
	{
		name: "DJ007",
		description: "Django-all-with-model-form",
	},
	{
		name: "DJ008",
		description: "Django-model-without-dunder-str",
	},
	{
		name: "DJ012",
		description: "Django-unordered-body-content-in-model",
	},
	{
		name: "DJ013",
		description: "Django-non-leading-receiver-decorator",
	},
	{
		name: "EM101",
		description: "Raw-string-in-exception",
	},
	{
		name: "EM102",
		description: "F-string-in-exception",
	},
	{
		name: "EM103",
		description: "Dot-format-in-exception",
	},
	{
		name: "EXE001",
		description: "Shebang-not-executable",
	},
	{
		name: "EXE002",
		description: "Shebang-missing-executable-file",
	},
	{
		name: "EXE003",
		description: "Shebang-missing-python",
	},
	{
		name: "EXE004",
		description: "Shebang-leading-whitespace",
	},
	{
		name: "EXE005",
		description: "Shebang-not-first-line",
	},
	{
		name: "FA100",
		description: "Future-rewritable-type-annotation",
	},
	{
		name: "FA102",
		description: "Future-required-type-annotation",
	},
	{
		name: "ISC001",
		description: "Single-line-implicit-string-concatenation",
	},
	{
		name: "ISC002",
		description: "Multi-line-implicit-string-concatenation",
	},
	{
		name: "ISC003",
		description: "Explicit-string-concatenation",
	},
	{
		name: "ICN001",
		description: "Unconventional-import-alias",
	},
	{
		name: "ICN002",
		description: "Banned-import-alias",
	},
	{
		name: "ICN003",
		description: "Banned-import-from",
	},
	{
		name: "LOG001",
		description: "Direct-logger-instantiation",
	},
	{
		name: "LOG002",
		description: "Invalid-get-logger-argument",
	},
	{
		name: "LOG007",
		description: "Exception-without-exc-info",
	},
	{
		name: "LOG009",
		description: "Undocumented-warn",
	},
	{
		name: "LOG015",
		description: "Root-logger-call",
	},
	{
		name: "G001",
		description: "Logging-string-format",
	},
	{
		name: "G002",
		description: "Logging-percent-format",
	},
	{
		name: "G003",
		description: "Logging-string-concat",
	},
	{
		name: "G004",
		description: "Logging-f-string",
	},
	{
		name: "G010",
		description: "Logging-warn",
	},
	{
		name: "G101",
		description: "Logging-extra-attr-clash",
	},
	{
		name: "G201",
		description: "Logging-exc-info",
	},
	{
		name: "G202",
		description: "Logging-redundant-exc-info",
	},
	{
		name: "INP001",
		description: "Implicit-namespace-package",
	},
	{
		name: "PIE790",
		description: "Unnecessary-placeholder",
	},
	{
		name: "PIE794",
		description: "Duplicate-class-field-definition",
	},
	{
		name: "PIE796",
		description: "Non-unique-enums",
	},
	{
		name: "PIE800",
		description: "Unnecessary-spread",
	},
	{
		name: "PIE804",
		description: "Unnecessary-dict-kwargs",
	},
	{
		name: "PIE807",
		description: "Reimplemented-container-builtin",
	},
	{
		name: "PIE808",
		description: "Unnecessary-range-start",
	},
	{
		name: "PIE810",
		description: "Multiple-starts-ends-with",
	},
	{
		name: "T201",
		description: "Print",
	},
	{
		name: "T203",
		description: "P-print",
	},
	{
		name: "PYI001",
		description: "Unprefixed-type-param",
	},
	{
		name: "PYI002",
		description: "Complex-if-statement-in-stub",
	},
	{
		name: "PYI003",
		description: "Unrecognized-version-info-check",
	},
	{
		name: "PYI004",
		description: "Patch-version-comparison",
	},
	{
		name: "PYI005",
		description: "Wrong-tuple-length-version-comparison",
	},
	{
		name: "PYI006",
		description: "Bad-version-info-comparison",
	},
	{
		name: "PYI007",
		description: "Unrecognized-platform-check",
	},
	{
		name: "PYI008",
		description: "Unrecognized-platform-name",
	},
	{
		name: "PYI009",
		description: "Pass-statement-stub-body",
	},
	{
		name: "PYI010",
		description: "Non-empty-stub-body",
	},
	{
		name: "PYI011",
		description: "Typed-argument-default-in-stub",
	},
	{
		name: "PYI012",
		description: "Pass-in-class-body",
	},
	{
		name: "PYI013",
		description: "Ellipsis-in-non-empty-class-body",
	},
	{
		name: "PYI014",
		description: "Argument-default-in-stub",
	},
	{
		name: "PYI015",
		description: "Assignment-default-in-stub",
	},
	{
		name: "PYI016",
		description: "Duplicate-union-member",
	},
	{
		name: "PYI017",
		description: "Complex-assignment-in-stub",
	},
	{
		name: "PYI018",
		description: "Unused-private-type-var",
	},
	{
		name: "PYI019",
		description: "Custom-type-var-return-type",
	},
	{
		name: "PYI020",
		description: "Quoted-annotation-in-stub",
	},
	{
		name: "PYI021",
		description: "Docstring-in-stub",
	},
	{
		name: "PYI024",
		description: "Collections-named-tuple",
	},
	{
		name: "PYI025",
		description: "Unaliased-collections-abc-set-import",
	},
	{
		name: "PYI026",
		description: "Type-alias-without-annotation",
	},
	{
		name: "PYI029",
		description: "Str-or-repr-defined-in-stub",
	},
	{
		name: "PYI030",
		description: "Unnecessary-literal-union",
	},
	{
		name: "PYI032",
		description: "Any-eq-ne-annotation",
	},
	{
		name: "PYI033",
		description: "Type-comment-in-stub",
	},
	{
		name: "PYI034",
		description: "Non-self-return-type",
	},
	{
		name: "PYI035",
		description: "Unassigned-special-variable-in-stub",
	},
	{
		name: "PYI036",
		description: "Bad-exit-annotation",
	},
	{
		name: "PYI041",
		description: "Redundant-numeric-union",
	},
	{
		name: "PYI042",
		description: "Snake-case-type-alias",
	},
	{
		name: "PYI043",
		description: "T-suffixed-type-alias",
	},
	{
		name: "PYI044",
		description: "Future-annotations-in-stub",
	},
	{
		name: "PYI045",
		description: "Iter-method-return-iterable",
	},
	{
		name: "PYI046",
		description: "Unused-private-protocol",
	},
	{
		name: "PYI047",
		description: "Unused-private-type-alias",
	},
	{
		name: "PYI048",
		description: "Stub-body-multiple-statements",
	},
	{
		name: "PYI049",
		description: "Unused-private-typed-dict",
	},
	{
		name: "PYI050",
		description: "No-return-argument-annotation-in-stub",
	},
	{
		name: "PYI051",
		description: "Redundant-literal-union",
	},
	{
		name: "PYI052",
		description: "Unannotated-assignment-in-stub",
	},
	{
		name: "PYI053",
		description: "String-or-bytes-too-long",
	},
	{
		name: "PYI054",
		description: "Numeric-literal-too-long",
	},
	{
		name: "PYI055",
		description: "Unnecessary-type-union",
	},
	{
		name: "PYI056",
		description: "Unsupported-method-call-on-all",
	},
	{
		name: "PYI057",
		description: "Byte-string-usage",
	},
	{
		name: "PYI058",
		description: "Generator-return-from-iter-method",
	},
	{
		name: "PYI059",
		description: "Generic-not-last-base-class",
	},
	{
		name: "PYI061",
		description: "Redundant-none-literal",
	},
	{
		name: "PYI062",
		description: "Duplicate-literal-member",
	},
	{
		name: "PYI063",
		description: "Pep484-style-positional-only-parameter",
	},
	{
		name: "PYI064",
		description: "Redundant-final-literal",
	},
	{
		name: "PYI066",
		description: "Bad-version-info-order",
	},
	{
		name: "PT001",
		description: "Pytest-fixture-incorrect-parentheses-style",
	},
	{
		name: "PT002",
		description: "Pytest-fixture-positional-args",
	},
	{
		name: "PT003",
		description: "Pytest-extraneous-scope-function",
	},
	{
		name: "PT004",
		description: "Pytest-missing-fixture-name-underscore",
	},
	{
		name: "PT005",
		description: "Pytest-incorrect-fixture-name-underscore",
	},
	{
		name: "PT006",
		description: "Pytest-parametrize-names-wrong-type",
	},
	{
		name: "PT007",
		description: "Pytest-parametrize-values-wrong-type",
	},
	{
		name: "PT008",
		description: "Pytest-patch-with-lambda",
	},
	{
		name: "PT009",
		description: "Pytest-unittest-assertion",
	},
	{
		name: "PT010",
		description: "Pytest-raises-without-exception",
	},
	{
		name: "PT011",
		description: "Pytest-raises-too-broad",
	},
	{
		name: "PT012",
		description: "Pytest-raises-with-multiple-statements",
	},
	{
		name: "PT013",
		description: "Pytest-incorrect-pytest-import",
	},
	{
		name: "PT014",
		description: "Pytest-duplicate-parametrize-test-cases",
	},
	{
		name: "PT015",
		description: "Pytest-assert-always-false",
	},
	{
		name: "PT016",
		description: "Pytest-fail-without-message",
	},
	{
		name: "PT017",
		description: "Pytest-assert-in-except",
	},
	{
		name: "PT018",
		description: "Pytest-composite-assertion",
	},
	{
		name: "PT019",
		description: "Pytest-fixture-param-without-value",
	},
	{
		name: "PT020",
		description: "Pytest-deprecated-yield-fixture",
	},
	{
		name: "PT021",
		description: "Pytest-fixture-finalizer-callback",
	},
	{
		name: "PT022",
		description: "Pytest-useless-yield-fixture",
	},
	{
		name: "PT023",
		description: "Pytest-incorrect-mark-parentheses-style",
	},
	{
		name: "PT024",
		description: "Pytest-unnecessary-asyncio-mark-on-fixture",
	},
	{
		name: "PT025",
		description: "Pytest-erroneous-use-fixtures-on-fixture",
	},
	{
		name: "PT026",
		description: "Pytest-use-fixtures-without-parameters",
	},
	{
		name: "PT027",
		description: "Pytest-unittest-raises-assertion",
	},
	{
		name: "Q000",
		description: "Bad-quotes-inline-string",
	},
	{
		name: "Q001",
		description: "Bad-quotes-multiline-string",
	},
	{
		name: "Q002",
		description: "Bad-quotes-docstring",
	},
	{
		name: "Q003",
		description: "Avoidable-escaped-quote",
	},
	{
		name: "Q004",
		description: "Unnecessary-escaped-quote",
	},
	{
		name: "RSE102",
		description: "Unnecessary-paren-on-raise-exception",
	},
	{
		name: "RET501",
		description: "Unnecessary-return-none",
	},
	{
		name: "RET502",
		description: "Implicit-return-value",
	},
	{
		name: "RET503",
		description: "Implicit-return",
	},
	{
		name: "RET504",
		description: "Unnecessary-assign",
	},
	{
		name: "RET505",
		description: "Superfluous-else-return",
	},
	{
		name: "RET506",
		description: "Superfluous-else-raise",
	},
	{
		name: "RET507",
		description: "Superfluous-else-continue",
	},
	{
		name: "RET508",
		description: "Superfluous-else-break",
	},
	{
		name: "SLF001",
		description: "Private-member-access",
	},
	{
		name: "SLOT000",
		description: "No-slots-in-str-subclass",
	},
	{
		name: "SLOT001",
		description: "No-slots-in-tuple-subclass",
	},
	{
		name: "SLOT002",
		description: "No-slots-in-namedtuple-subclass",
	},
	{
		name: "SIM101",
		description: "Duplicate-isinstance-call",
	},
	{
		name: "SIM102",
		description: "Collapsible-if",
	},
	{
		name: "SIM103",
		description: "Needless-bool",
	},
	{
		name: "SIM105",
		description: "Suppressible-exception",
	},
	{
		name: "SIM107",
		description: "Return-in-try-except-finally",
	},
	{
		name: "SIM108",
		description: "If-else-block-instead-of-if-exp",
	},
	{
		name: "SIM109",
		description: "Compare-with-tuple",
	},
	{
		name: "SIM110",
		description: "Reimplemented-builtin",
	},
	{
		name: "SIM112",
		description: "Uncapitalized-environment-variables",
	},
	{
		name: "SIM113",
		description: "Enumerate-for-loop",
	},
	{
		name: "SIM114",
		description: "If-with-same-arms",
	},
	{
		name: "SIM115",
		description: "Open-file-with-context-handler",
	},
	{
		name: "SIM116",
		description: "If-else-block-instead-of-dict-lookup",
	},
	{
		name: "SIM117",
		description: "Multiple-with-statements",
	},
	{
		name: "SIM118",
		description: "In-dict-keys",
	},
	{
		name: "SIM201",
		description: "Negate-equal-op",
	},
	{
		name: "SIM202",
		description: "Negate-not-equal-op",
	},
	{
		name: "SIM208",
		description: "Double-negation",
	},
	{
		name: "SIM210",
		description: "If-expr-with-true-false",
	},
	{
		name: "SIM211",
		description: "If-expr-with-false-true",
	},
	{
		name: "SIM212",
		description: "If-expr-with-twisted-arms",
	},
	{
		name: "SIM220",
		description: "Expr-and-not-expr",
	},
	{
		name: "SIM221",
		description: "Expr-or-not-expr",
	},
	{
		name: "SIM222",
		description: "Expr-or-true",
	},
	{
		name: "SIM223",
		description: "Expr-and-false",
	},
	{
		name: "SIM300",
		description: "Yoda-conditions",
	},
	{
		name: "SIM401",
		description: "If-else-block-instead-of-dict-get",
	},
	{
		name: "SIM905",
		description: "Split-static-string",
	},
	{
		name: "SIM910",
		description: "Dict-get-with-none-default",
	},
	{
		name: "SIM911",
		description: "Zip-dict-keys-and-values",
	},
	{
		name: "TID251",
		description: "Banned-api",
	},
	{
		name: "TID252",
		description: "Relative-imports",
	},
	{
		name: "TID253",
		description: "Banned-module-level-imports",
	},
	{
		name: "TC001",
		description: "Typing-only-first-party-import",
	},
	{
		name: "TC002",
		description: "Typing-only-third-party-import",
	},
	{
		name: "TC003",
		description: "Typing-only-standard-library-import",
	},
	{
		name: "TC004",
		description: "Runtime-import-in-type-checking-block",
	},
	{
		name: "TC005",
		description: "Empty-type-checking-block",
	},
	{
		name: "TC006",
		description: "Runtime-cast-value",
	},
	{
		name: "TC007",
		description: "Unquoted-type-alias",
	},
	{
		name: "TC008",
		description: "Quoted-type-alias",
	},
	{
		name: "TC010",
		description: "Runtime-string-union",
	},
	{
		name: "INT001",
		description: "F-string-in-get-text-func-call",
	},
	{
		name: "INT002",
		description: "Format-in-get-text-func-call",
	},
	{
		name: "INT003",
		description: "Printf-in-get-text-func-call",
	},
	{
		name: "ARG001",
		description: "Unused-function-argument",
	},
	{
		name: "ARG002",
		description: "Unused-method-argument",
	},
	{
		name: "ARG003",
		description: "Unused-class-method-argument",
	},
	{
		name: "ARG004",
		description: "Unused-static-method-argument",
	},
	{
		name: "ARG005",
		description: "Unused-lambda-argument",
	},
	{
		name: "PTH100",
		description: "Os-path-abspath",
	},
	{
		name: "PTH101",
		description: "Os-chmod",
	},
	{
		name: "PTH102",
		description: "Os-mkdir",
	},
	{
		name: "PTH103",
		description: "Os-makedirs",
	},
	{
		name: "PTH104",
		description: "Os-rename",
	},
	{
		name: "PTH105",
		description: "Os-replace",
	},
	{
		name: "PTH106",
		description: "Os-rmdir",
	},
	{
		name: "PTH107",
		description: "Os-remove",
	},
	{
		name: "PTH108",
		description: "Os-unlink",
	},
	{
		name: "PTH109",
		description: "Os-getcwd",
	},
	{
		name: "PTH110",
		description: "Os-path-exists",
	},
	{
		name: "PTH111",
		description: "Os-path-expanduser",
	},
	{
		name: "PTH112",
		description: "Os-path-isdir",
	},
	{
		name: "PTH113",
		description: "Os-path-isfile",
	},
	{
		name: "PTH114",
		description: "Os-path-islink",
	},
	{
		name: "PTH115",
		description: "Os-readlink",
	},
	{
		name: "PTH116",
		description: "Os-stat",
	},
	{
		name: "PTH117",
		description: "Os-path-isabs",
	},
	{
		name: "PTH118",
		description: "Os-path-join",
	},
	{
		name: "PTH119",
		description: "Os-path-basename",
	},
	{
		name: "PTH120",
		description: "Os-path-dirname",
	},
	{
		name: "PTH121",
		description: "Os-path-samefile",
	},
	{
		name: "PTH122",
		description: "Os-path-splitext",
	},
	{
		name: "PTH123",
		description: "Builtin-open",
	},
	{
		name: "PTH124",
		description: "Py-path",
	},
	{
		name: "PTH201",
		description: "Path-constructor-current-directory",
	},
	{
		name: "PTH202",
		description: "Os-path-getsize",
	},
	{
		name: "PTH203",
		description: "Os-path-getatime",
	},
	{
		name: "PTH204",
		description: "Os-path-getmtime",
	},
	{
		name: "PTH205",
		description: "Os-path-getctime",
	},
	{
		name: "PTH206",
		description: "Os-sep-split",
	},
	{
		name: "PTH207",
		description: "Glob",
	},
	{
		name: "PTH208",
		description: "Os-listdir",
	},
	{
		name: "TD001",
		description: "Invalid-todo-tag",
	},
	{
		name: "TD002",
		description: "Missing-todo-author",
	},
	{
		name: "TD003",
		description: "Missing-todo-link",
	},
	{
		name: "TD004",
		description: "Missing-todo-colon",
	},
	{
		name: "TD005",
		description: "Missing-todo-description",
	},
	{
		name: "TD006",
		description: "Invalid-todo-capitalization",
	},
	{
		name: "TD007",
		description: "Missing-space-after-todo-colon",
	},
	{
		name: "FIX001",
		description: "Line-contains-fixme",
	},
	{
		name: "FIX002",
		description: "Line-contains-todo",
	},
	{
		name: "FIX003",
		description: "Line-contains-xxx",
	},
	{
		name: "FIX004",
		description: "Line-contains-hack",
	},
	{
		name: "ERA001",
		description: "Commented-out-code",
	},
	{
		name: "PD002",
		description: "Pandas-use-of-inplace-argument",
	},
	{
		name: "PD003",
		description: "Pandas-use-of-dot-is-null",
	},
	{
		name: "PD004",
		description: "Pandas-use-of-dot-not-null",
	},
	{
		name: "PD007",
		description: "Pandas-use-of-dot-ix",
	},
	{
		name: "PD008",
		description: "Pandas-use-of-dot-at",
	},
	{
		name: "PD009",
		description: "Pandas-use-of-dot-iat",
	},
	{
		name: "PD010",
		description: "Pandas-use-of-dot-pivot-or-unstack",
	},
	{
		name: "PD011",
		description: "Pandas-use-of-dot-values",
	},
	{
		name: "PD012",
		description: "Pandas-use-of-dot-read-table",
	},
	{
		name: "PD013",
		description: "Pandas-use-of-dot-stack",
	},
	{
		name: "PD015",
		description: "Pandas-use-of-pd-merge",
	},
	{
		name: "PD101",
		description: "Pandas-nunique-constant-series-check",
	},
	{
		name: "PD901",
		description: "Pandas-df-variable-name",
	},
	{
		name: "PGH001",
		description: "Eval",
	},
	{
		name: "PGH002",
		description: "Deprecated-log-warn",
	},
	{
		name: "PGH003",
		description: "Blanket-type-ignore",
	},
	{
		name: "PGH004",
		description: "Blanket-noqa",
	},
	{
		name: "PGH005",
		description: "Invalid-mock-access",
	},
	{
		name: "PLC0105",
		description: "Type-name-incorrect-variance",
	},
	{
		name: "PLC0131",
		description: "Type-bivariance",
	},
	{
		name: "PLC0132",
		description: "Type-param-name-mismatch",
	},
	{
		name: "PLC0205",
		description: "Single-string-slots",
	},
	{
		name: "PLC0206",
		description: "Dict-index-missing-items",
	},
	{
		name: "PLC0208",
		description: "Iteration-over-set",
	},
	{
		name: "PLC0414",
		description: "Useless-import-alias",
	},
	{
		name: "PLC0415",
		description: "Import-outside-top-level",
	},
	{
		name: "PLC1802",
		description: "Len-test",
	},
	{
		name: "PLC1901",
		description: "Compare-to-empty-string",
	},
	{
		name: "PLC2401",
		description: "Non-ascii-name",
	},
	{
		name: "PLC2403",
		description: "Non-ascii-import-name",
	},
	{
		name: "PLC2701",
		description: "Import-private-name",
	},
	{
		name: "PLC2801",
		description: "Unnecessary-dunder-call",
	},
	{
		name: "PLC3002",
		description: "Unnecessary-direct-lambda-call",
	},
	{
		name: "PLE0100",
		description: "Yield-in-init",
	},
	{
		name: "PLE0101",
		description: "Return-in-init",
	},
	{
		name: "PLE0115",
		description: "Nonlocal-and-global",
	},
	{
		name: "PLE0116",
		description: "Continue-in-finally",
	},
	{
		name: "PLE0117",
		description: "Nonlocal-without-binding",
	},
	{
		name: "PLE0118",
		description: "Load-before-global-declaration",
	},
	{
		name: "PLE0237",
		description: "Non-slot-assignment",
	},
	{
		name: "PLE0241",
		description: "Duplicate-bases",
	},
	{
		name: "PLE0302",
		description: "Unexpected-special-method-signature",
	},
	{
		name: "PLE0303",
		description: "Invalid-length-return-type",
	},
	{
		name: "PLE0304",
		description: "Invalid-bool-return-type",
	},
	{
		name: "PLE0305",
		description: "Invalid-index-return-type",
	},
	{
		name: "PLE0307",
		description: "Invalid-str-return-type",
	},
	{
		name: "PLE0308",
		description: "Invalid-bytes-return-type",
	},
	{
		name: "PLE0309",
		description: "Invalid-hash-return-type",
	},
	{
		name: "PLE0604",
		description: "Invalid-all-object",
	},
	{
		name: "PLE0605",
		description: "Invalid-all-format",
	},
	{
		name: "PLE0643",
		description: "Potential-index-error",
	},
	{
		name: "PLE0704",
		description: "Misplaced-bare-raise",
	},
	{
		name: "PLE1132",
		description: "Repeated-keyword-argument",
	},
	{
		name: "PLE1141",
		description: "Dict-iter-missing-items",
	},
	{
		name: "PLE1142",
		description: "Await-outside-async",
	},
	{
		name: "PLE1205",
		description: "Logging-too-many-args",
	},
	{
		name: "PLE1206",
		description: "Logging-too-few-args",
	},
	{
		name: "PLE1300",
		description: "Bad-string-format-character",
	},
	{
		name: "PLE1307",
		description: "Bad-string-format-type",
	},
	{
		name: "PLE1310",
		description: "Bad-str-strip-call",
	},
	{
		name: "PLE1507",
		description: "Invalid-envvar-value",
	},
	{
		name: "PLE1519",
		description: "Singledispatch-method",
	},
	{
		name: "PLE1520",
		description: "Singledispatchmethod-function",
	},
	{
		name: "PLE1700",
		description: "Yield-from-in-async-function",
	},
	{
		name: "PLE2502",
		description: "Bidirectional-unicode",
	},
	{
		name: "PLE2510",
		description: "Invalid-character-backspace",
	},
	{
		name: "PLE2512",
		description: "Invalid-character-sub",
	},
	{
		name: "PLE2513",
		description: "Invalid-character-esc",
	},
	{
		name: "PLE2514",
		description: "Invalid-character-nul",
	},
	{
		name: "PLE2515",
		description: "Invalid-character-zero-width-space",
	},
	{
		name: "PLE4703",
		description: "Modified-iterating-set",
	},
	{
		name: "PLR0124",
		description: "Comparison-with-itself",
	},
	{
		name: "PLR0133",
		description: "Comparison-of-constant",
	},
	{
		name: "PLR0202",
		description: "No-classmethod-decorator",
	},
	{
		name: "PLR0203",
		description: "No-staticmethod-decorator",
	},
	{
		name: "PLR0206",
		description: "Property-with-parameters",
	},
	{
		name: "PLR0402",
		description: "Manual-from-import",
	},
	{
		name: "PLR0904",
		description: "Too-many-public-methods",
	},
	{
		name: "PLR0911",
		description: "Too-many-return-statements",
	},
	{
		name: "PLR0912",
		description: "Too-many-branches",
	},
	{
		name: "PLR0913",
		description: "Too-many-arguments",
	},
	{
		name: "PLR0914",
		description: "Too-many-locals",
	},
	{
		name: "PLR0915",
		description: "Too-many-statements",
	},
	{
		name: "PLR0916",
		description: "Too-many-boolean-expressions",
	},
	{
		name: "PLR0917",
		description: "Too-many-positional-arguments",
	},
	{
		name: "PLR1701",
		description: "Repeated-isinstance-calls",
	},
	{
		name: "PLR1702",
		description: "Too-many-nested-blocks",
	},
	{
		name: "PLR1704",
		description: "Redefined-argument-from-local",
	},
	{
		name: "PLR1706",
		description: "And-or-ternary",
	},
	{
		name: "PLR1711",
		description: "Useless-return",
	},
	{
		name: "PLR1714",
		description: "Repeated-equality-comparison",
	},
	{
		name: "PLR1716",
		description: "Boolean-chained-comparison",
	},
	{
		name: "PLR1722",
		description: "Sys-exit-alias",
	},
	{
		name: "PLR1730",
		description: "If-stmt-min-max",
	},
	{
		name: "PLR1733",
		description: "Unnecessary-dict-index-lookup",
	},
	{
		name: "PLR1736",
		description: "Unnecessary-list-index-lookup",
	},
	{
		name: "PLR2004",
		description: "Magic-value-comparison",
	},
	{
		name: "PLR2044",
		description: "Empty-comment",
	},
	{
		name: "PLR5501",
		description: "Collapsible-else-if",
	},
	{
		name: "PLR6104",
		description: "Non-augmented-assignment",
	},
	{
		name: "PLR6201",
		description: "Literal-membership",
	},
	{
		name: "PLR6301",
		description: "No-self-use",
	},
	{
		name: "PLW0108",
		description: "Unnecessary-lambda",
	},
	{
		name: "PLW0120",
		description: "Useless-else-on-loop",
	},
	{
		name: "PLW0127",
		description: "Self-assigning-variable",
	},
	{
		name: "PLW0128",
		description: "Redeclared-assigned-name",
	},
	{
		name: "PLW0129",
		description: "Assert-on-string-literal",
	},
	{
		name: "PLW0131",
		description: "Named-expr-without-context",
	},
	{
		name: "PLW0133",
		description: "Useless-exception-statement",
	},
	{
		name: "PLW0177",
		description: "Nan-comparison",
	},
	{
		name: "PLW0211",
		description: "Bad-staticmethod-argument",
	},
	{
		name: "PLW0245",
		description: "Super-without-brackets",
	},
	{
		name: "PLW0406",
		description: "Import-self",
	},
	{
		name: "PLW0602",
		description: "Global-variable-not-assigned",
	},
	{
		name: "PLW0603",
		description: "Global-statement",
	},
	{
		name: "PLW0604",
		description: "Global-at-module-level",
	},
	{
		name: "PLW0642",
		description: "Self-or-cls-assignment",
	},
	{
		name: "PLW0711",
		description: "Binary-op-exception",
	},
	{
		name: "PLW1501",
		description: "Bad-open-mode",
	},
	{
		name: "PLW1507",
		description: "Shallow-copy-environ",
	},
	{
		name: "PLW1508",
		description: "Invalid-envvar-default",
	},
	{
		name: "PLW1509",
		description: "Subprocess-popen-preexec-fn",
	},
	{
		name: "PLW1510",
		description: "Subprocess-run-without-check",
	},
	{
		name: "PLW1514",
		description: "Unspecified-encoding",
	},
	{
		name: "PLW1641",
		description: "Eq-without-hash",
	},
	{
		name: "PLW2101",
		description: "Useless-with-lock",
	},
	{
		name: "PLW2901",
		description: "Redefined-loop-name",
	},
	{
		name: "PLW3201",
		description: "Bad-dunder-method-name",
	},
	{
		name: "PLW3301",
		description: "Nested-min-max",
	},
	{
		name: "TRY002",
		description: "Raise-vanilla-class",
	},
	{
		name: "TRY003",
		description: "Raise-vanilla-args",
	},
	{
		name: "TRY004",
		description: "Type-check-without-type-error",
	},
	{
		name: "TRY200",
		description: "Reraise-no-cause",
	},
	{
		name: "TRY201",
		description: "Verbose-raise",
	},
	{
		name: "TRY203",
		description: "Useless-try-except",
	},
	{
		name: "TRY300",
		description: "Try-consider-else",
	},
	{
		name: "TRY301",
		description: "Raise-within-try",
	},
	{
		name: "TRY400",
		description: "Error-instead-of-exception",
	},
	{
		name: "TRY401",
		description: "Verbose-log-message",
	},
	{
		name: "FLY002",
		description: "Static-join-to-f-string",
	},
	{
		name: "NPY001",
		description: "Numpy-deprecated-type-alias",
	},
	{
		name: "NPY002",
		description: "Numpy-legacy-random",
	},
	{
		name: "NPY003",
		description: "Numpy-deprecated-function",
	},
	{
		name: "NPY201",
		description: "Numpy2-deprecation",
	},
	{
		name: "FAST001",
		description: "Fast-api-redundant-response-model",
	},
	{
		name: "FAST002",
		description: "Fast-api-non-annotated-dependency",
	},
	{
		name: "FAST003",
		description: "Fast-api-unused-path-parameter",
	},
	{
		name: "AIR001",
		description: "Airflow-variable-name-task-id-mismatch",
	},
	{
		name: "AIR301",
		description: "Airflow-dag-no-schedule-argument",
	},
	{
		name: "AIR302",
		description: "Airflow3-removal",
	},
	{
		name: "PERF101",
		description: "Unnecessary-list-cast",
	},
	{
		name: "PERF102",
		description: "Incorrect-dict-iterator",
	},
	{
		name: "PERF203",
		description: "Try-except-in-loop",
	},
	{
		name: "PERF401",
		description: "Manual-list-comprehension",
	},
	{
		name: "PERF402",
		description: "Manual-list-copy",
	},
	{
		name: "PERF403",
		description: "Manual-dict-comprehension",
	},
	{
		name: "FURB101",
		description: "Read-whole-file",
	},
	{
		name: "FURB103",
		description: "Write-whole-file",
	},
	{
		name: "FURB105",
		description: "Print-empty-string",
	},
	{
		name: "FURB110",
		description: "If-exp-instead-of-or-operator",
	},
	{
		name: "FURB113",
		description: "Repeated-append",
	},
	{
		name: "FURB116",
		description: "F-string-number-format",
	},
	{
		name: "FURB118",
		description: "Reimplemented-operator",
	},
	{
		name: "FURB129",
		description: "Readlines-in-for",
	},
	{
		name: "FURB131",
		description: "Delete-full-slice",
	},
	{
		name: "FURB132",
		description: "Check-and-remove-from-set",
	},
	{
		name: "FURB136",
		description: "If-expr-min-max",
	},
	{
		name: "FURB140",
		description: "Reimplemented-starmap",
	},
	{
		name: "FURB142",
		description: "For-loop-set-mutations",
	},
	{
		name: "FURB145",
		description: "Slice-copy",
	},
	{
		name: "FURB148",
		description: "Unnecessary-enumerate",
	},
	{
		name: "FURB152",
		description: "Math-constant",
	},
	{
		name: "FURB154",
		description: "Repeated-global",
	},
	{
		name: "FURB156",
		description: "Hardcoded-string-charset",
	},
	{
		name: "FURB157",
		description: "Verbose-decimal-constructor",
	},
	{
		name: "FURB161",
		description: "Bit-count",
	},
	{
		name: "FURB163",
		description: "Redundant-log-base",
	},
	{
		name: "FURB164",
		description: "Unnecessary-from-float",
	},
	{
		name: "FURB166",
		description: "Int-on-sliced-str",
	},
	{
		name: "FURB167",
		description: "Regex-flag-alias",
	},
	{
		name: "FURB168",
		description: "Isinstance-type-none",
	},
	{
		name: "FURB169",
		description: "Type-none-comparison",
	},
	{
		name: "FURB171",
		description: "Single-item-membership-test",
	},
	{
		name: "FURB177",
		description: "Implicit-cwd",
	},
	{
		name: "FURB180",
		description: "Meta-class-abc-meta",
	},
	{
		name: "FURB181",
		description: "Hashlib-digest-hex",
	},
	{
		name: "FURB187",
		description: "List-reverse-copy",
	},
	{
		name: "FURB188",
		description: "Slice-to-remove-prefix-or-suffix",
	},
	{
		name: "FURB189",
		description: "Subclass-builtin",
	},
	{
		name: "FURB192",
		description: "Sorted-min-max",
	},
	{
		name: "DOC201",
		description: "Docstring-missing-returns",
	},
	{
		name: "DOC202",
		description: "Docstring-extraneous-returns",
	},
	{
		name: "DOC402",
		description: "Docstring-missing-yields",
	},
	{
		name: "DOC403",
		description: "Docstring-extraneous-yields",
	},
	{
		name: "DOC501",
		description: "Docstring-missing-exception",
	},
	{
		name: "DOC502",
		description: "Docstring-extraneous-exception",
	},
	{
		name: "RUF001",
		description: "Ambiguous-unicode-character-string",
	},
	{
		name: "RUF002",
		description: "Ambiguous-unicode-character-docstring",
	},
	{
		name: "RUF003",
		description: "Ambiguous-unicode-character-comment",
	},
	{
		name: "RUF005",
		description: "Collection-literal-concatenation",
	},
	{
		name: "RUF006",
		description: "Asyncio-dangling-task",
	},
	{
		name: "RUF007",
		description: "Zip-instead-of-pairwise",
	},
	{
		name: "RUF008",
		description: "Mutable-dataclass-default",
	},
	{
		name: "RUF009",
		description: "Function-call-in-dataclass-default-argument",
	},
	{
		name: "RUF010",
		description: "Explicit-f-string-type-conversion",
	},
	{
		name: "RUF011",
		description: "Ruff-static-key-dict-comprehension",
	},
	{
		name: "RUF012",
		description: "Mutable-class-default",
	},
	{
		name: "RUF013",
		description: "Implicit-optional",
	},
	{
		name: "RUF015",
		description: "Unnecessary-iterable-allocation-for-first-element",
	},
	{
		name: "RUF016",
		description: "Invalid-index-type",
	},
	{
		name: "RUF017",
		description: "Quadratic-list-summation",
	},
	{
		name: "RUF018",
		description: "Assignment-in-assert",
	},
	{
		name: "RUF019",
		description: "Unnecessary-key-check",
	},
	{
		name: "RUF020",
		description: "Never-union",
	},
	{
		name: "RUF021",
		description: "Parenthesize-chained-operators",
	},
	{
		name: "RUF022",
		description: "Unsorted-dunder-all",
	},
	{
		name: "RUF023",
		description: "Unsorted-dunder-slots",
	},
	{
		name: "RUF024",
		description: "Mutable-fromkeys-value",
	},
	{
		name: "RUF026",
		description: "Default-factory-kwarg",
	},
	{
		name: "RUF027",
		description: "Missing-f-string-syntax",
	},
	{
		name: "RUF028",
		description: "Invalid-formatter-suppression-comment",
	},
	{
		name: "RUF029",
		description: "Unused-async",
	},
	{
		name: "RUF030",
		description: "Assert-with-print-message",
	},
	{
		name: "RUF031",
		description: "Incorrectly-parenthesized-tuple-in-subscript",
	},
	{
		name: "RUF032",
		description: "Decimal-from-float-literal",
	},
	{
		name: "RUF033",
		description: "Post-init-default",
	},
	{
		name: "RUF034",
		description: "Useless-if-else",
	},
	{
		name: "RUF035",
		description: "Unsafe-markup-use",
	},
	{
		name: "RUF036",
		description: "None-not-at-end-of-union",
	},
	{
		name: "RUF038",
		description: "Redundant-bool-literal",
	},
	{
		name: "RUF039",
		description: "Unraw-re-pattern",
	},
	{
		name: "RUF040",
		description: "Invalid-assert-message-literal-argument",
	},
	{
		name: "RUF041",
		description: "Unnecessary-nested-literal",
	},
	{
		name: "RUF046",
		description: "Unnecessary-cast-to-int",
	},
	{
		name: "RUF048",
		description: "Map-int-version-parsing",
	},
	{
		name: "RUF052",
		description: "Used-dummy-variable",
	},
	{
		name: "RUF055",
		description: "Unnecessary-regular-expression",
	},
	{
		name: "RUF100",
		description: "Unused-noqa",
	},
	{
		name: "RUF101",
		description: "Redirected-noqa",
	},
	{
		name: "RUF200",
		description: "Invalid-pyproject-toml",
	},
];

const subCommands: Fig.Subcommand[] = [
	{
		name: "check",
		description: "Run Ruff on the given files or directories",
		options: checkOptions,
		args: {
			name: "Path",
			template: "filepaths",
			description: "The path to use for the project/script",
			default: ".",
			isVariadic: true,
		},
	},
	{
		name: "rule",
		description: "Explain a rule (or all rules)",
		args: {
			name: "rule",
			description: "Rule(s) to explain",
			suggestions: [
				...rules,
				{ name: "--all", description: "Explain all rules", displayName: "all" },
			],
		},
		options: [
			{
				name: "--all",
				description: "Explain all rules",
			},
			{
				name: "--output-format",
				description: "Output format [default: text]",
				args: {
					name: "output-format",
					suggestions: ["text", "json"],
				},
			},
		],
	},
	{
		name: "config",
		description: "List or describe the available configuration options",
		options: [
			{
				name: "--output-format",
				description: "Output format [default: text]",
				args: {
					name: "output-format",
					suggestions: ["text", "json"],
				},
			},
		],
	},
	{
		name: "linter",
		description: "List all supported upstream linters",
		options: [
			{
				name: "--output-format",
				description: "Output format",
				args: { name: "output-format", suggestions: ["text", "json"] },
			},
		],
	},
	{
		name: "clean",
		description:
			"Clear any caches in the current directory and any subdirectories",
	},
	{
		name: "format",
		description: "Run the Ruff formatter on the given files or directories",
		options: formatOptions,
		args: {
			name: "Path",
			template: "filepaths",
			description: "List of files or directories to format [default: .]",
			default: ".",
			isVariadic: true,
		},
	},
	{
		name: "server",
		description: "Run the language server",
		options: [
			{
				name: "--preview",
				description: "Enable preview mode. Use `--no-preview` to disable",
			},
			{
				name: "--no-preview",
				description: "Disable preview mode",
			},
		],
	},
	{
		name: "analyze",
		description: "Run analysis over Python source code",
		subcommands: [
			{
				name: "graph",
				description: "Generate a map of Python file dependencies or dependents",
				options: [
					{
						name: "--direction",
						description:
							"The direction of the import map. By default, generates a dependency map, i.e., a map from file to files that it depends on. Use `--direction dependents` to generate a map from file to files that depend on it",
						args: {
							name: "DIRECTION",
							suggestions: ["dependencies", "dependents"],
						},
					},
					{
						name: "--detect-string-imports",
						description: "Attempt to detect imports from string literals",
					},
					{
						name: "--preview",
						description: "Enable preview mode. Use `--no-preview` to disable",
					},
					{
						name: "--no-preview",
						description: "Disable preview mode",
					},
					{
						name: "--target-version",
						description: "The minimum Python version that should be supported",
						args: {
							name: "TARGET_VERSION",
							suggestions: [
								"py37",
								"py38",
								"py39",
								"py310",
								"py311",
								"py312",
								"py313",
							],
						},
					},
				],
				args: {
					name: "Path",
					template: "filepaths",
					description: "The path to use for the project/script",
					default: ".",
					isVariadic: true,
				},
			},
		],
	},
	{
		name: "version",
		description: "Display Ruff's version",
		options: [
			{
				name: "--output-format",
				description: "Output format",
				args: { name: "output-format", suggestions: ["text", "json"] },
			},
		],
	},
	{
		name: "help",
		description: "Print this message or the help of the given subcommand(s)",
	},
];

const completion: Fig.Spec = {
	name: "ruff",
	description: "Ruff: An extremely fast Python linter",
	subcommands: subCommands,
	options: GlobalOptions.map((option) => ({ ...option, isPersistent: true })),
};

export default completion;
