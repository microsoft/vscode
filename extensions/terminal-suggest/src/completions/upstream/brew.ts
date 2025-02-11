const servicesGenerator = (action: string): Fig.Generator => ({
  script: ["bash", "-c", "brew services list | sed -e 's/ .*//' | tail -n +2"],
  postProcess: function (out) {
    return out
      .split("\n")
      .filter((line) => !line.includes("unbound"))
      .map((line) => ({
        name: line,
        icon: "fig://icon?type=package",
        description: `${action} ${line}`,
      }));
  },
});

const repositoriesGenerator = (): Fig.Generator => ({
  script: ["brew", "tap"],
  postProcess: (out) => {
    return out.split("\n").map((line) => ({ name: line }));
  },
});

const formulaeGenerator: Fig.Generator = {
  script: ["brew", "list", "-1"],
  postProcess: function (out) {
    return out
      .split("\n")
      .filter((line) => !line.includes("="))
      .map((formula) => ({
        name: formula,
        icon: "🍺",
        description: "Installed formula",
      }));
  },
};

const outdatedformulaeGenerator: Fig.Generator = {
  script: ["brew", "outdated", "-q"],
  postProcess: function (out) {
    return out.split("\n").map((formula) => ({
      name: formula,
      icon: "🍺",
      description: "Outdated formula",
    }));
  },
};

const generateAllFormulae: Fig.Generator = {
  script: ["brew", "formulae"],
  postProcess: function (out) {
    return out.split("\n").map((formula) => ({
      name: formula,
      icon: "🍺",
      description: "Formula",
      priority: 51,
    }));
  },
};

const generateAllCasks: Fig.Generator = {
  script: ["brew", "casks"],
  postProcess: function (out) {
    return out.split("\n").map((cask) => ({
      name: cask,
      icon: "🍺",
      description: "Cask",
      priority: 52,
    }));
  },
};
const generateAliases: Fig.Generator = {
  script: [
    "bash",
    "-c",
    'find ~/.brew-aliases/ -type f ! -name "*.*" -d 1 | sed "s/.*\\///"',
  ],
  postProcess: function (out) {
    return out
      .split("\n")
      .filter((line) => line && line.trim() !== "")
      .map((line) => ({
        name: line,
        icon: "fig://icon?type=command",
        description: `Execute alias ${line}`,
      }));
  },
};

const commonOptions: Fig.Option[] = [
  {
    name: ["-d", "--debug"],
    description: "Display any debugging information",
  },
  {
    name: ["-q", "--quiet"],
    description: "Make some output more quiet",
  },
  {
    name: ["-v", "--verbose"],
    description: "Make some output more verbose",
  },
  { name: ["-h", "--help"], description: "Show help message" },
];

const completionSpec: Fig.Spec = {
  name: "brew",
  description: "Package manager for macOS",
  subcommands: [
    {
      name: "list",
      description: "List all installed formulae",
      options: [
        ...commonOptions,
        {
          name: ["--formula", "--formulae"],
          description:
            "List only formulae, or treat all named arguments as formulae",
        },
        {
          name: ["--cask", "--casks"],
          description: "List only casks, or treat all named arguments as casks",
        },
        {
          name: "--unbrewed",
          description:
            "List files in Homebrew's prefix not installed by Homebrew. (disabled; replaced by brew --prefix --unbrewed)",
        },
        {
          name: "--full-name",
          description:
            "Print formulae with fully-qualified names. Unless --full-name, --versions or",
        },
        {
          name: "--pinned",
          description:
            "List only pinned formulae, or only the specified (pinned) formulae if formula are provided",
        },
        {
          name: "--versions",
          description:
            "Show the version number for installed formulae, or only the specified formulae if formula are provided",
        },
        {
          name: "--multiple",
          description: "Only show formulae with multiple versions installed",
        },
        {
          name: "--pinned",
          description:
            "List only pinned formulae, or only the specified (pinned) formulae if formula are provided. See also pin, unpin",
        },
        {
          name: "-1",
          description:
            "Force output to be one entry per line. This is the default when output is not to a terminal",
        },
        {
          name: "-l",
          description:
            "List formulae and/or casks in long format. Has no effect when a formula or cask name is passed as an argument",
        },
        {
          name: "-r",
          description:
            "Reverse the order of the formulae and/or casks sort to list the oldest entries first. Has no effect when a formula or cask name is passed as an argument",
        },
        {
          name: "-t",
          description:
            "Sort formulae and/or casks by time modified, listing most recently modified first. Has no effect when a formula or cask name is passed as an argument",
        },
      ],
      args: {
        isOptional: true,
        isVariadic: true,
        name: "formula",
        generators: formulaeGenerator,
      },
    },
    {
      name: "ls",
      description: "List all installed formulae",
      options: [
        ...commonOptions,
        {
          name: "--formula",
          description:
            "List only formulae, or treat all named arguments as formulae",
        },
        {
          name: "--cask",
          description: "List only casks, or treat all named arguments as casks",
        },
        {
          name: "--unbrewed",
          description:
            "List files in Homebrew's prefix not installed by Homebrew. (disabled; replaced by brew --prefix --unbrewed)",
        },
        {
          name: "--full-name",
          description:
            "Print formulae with fully-qualified names. Unless --full-name, --versions or",
        },
        {
          name: "--pinned",
          description:
            "List only pinned formulae, or only the specified (pinned) formulae if formula are provided",
        },
        {
          name: "--versions",
          description:
            "Show the version number for installed formulae, or only the specified formulae if formula are provided",
        },
        {
          name: "--multiple",
          description: "Only show formulae with multiple versions installed",
        },
        {
          name: "--pinned",
          description:
            "List only pinned formulae, or only the specified (pinned) formulae if formula are provided",
        },
        {
          name: "-1",
          description:
            "Force output to be one entry per line. This is the default when output is not to a terminal",
        },
        {
          name: "-l",
          description:
            "List formulae and/or casks in long format. Has no effect when a formula or cask name is passed as an argument",
        },
        {
          name: "-r",
          description:
            "Reverse the order of the formulae and/or casks sort to list the oldest entries first. Has no effect when a formula or cask name is passed as an argument",
        },
        {
          name: "-t",
          description:
            "Sort formulae and/or casks by time modified, listing most recently modified first. Has no effect when a formula or cask name is passed as an argument",
        },
      ],
      args: {
        isOptional: true,
        isVariadic: true,
        name: "formula",
        generators: formulaeGenerator,
      },
    },
    {
      name: "leaves",
      description:
        "List installed formulae that are not dependencies of another installed formula",
      options: [
        {
          name: ["-r", "--installed-on-request"],
          description: "Show manually installed formula",
        },
        {
          name: ["-p", "--installed-as-dependency"],
          description: "Show installed formula as dependencies",
        },
      ],
    },
    {
      name: "doctor",
      description: "Check your system for potential problems",
      options: [
        ...commonOptions,
        {
          name: "--list-checks",
          description: "List all audit methods",
        },
        {
          name: ["-D", "--audit-debug"],
          description: "Enable debugging and profiling of audit methods",
        },
      ],
    },
    {
      name: ["abv", "info"],
      description: "Display brief statistics for your Homebrew installation",
      args: {
        isVariadic: true,
        isOptional: true,
        name: "formula",
        description: "Formula or cask to summarize",
        generators: [generateAllFormulae, generateAllCasks],
      },
      options: [
        {
          name: ["--cask", "--casks"],
          description: "List only casks, or treat all named arguments as casks",
        },
        {
          name: "--analytics",
          description:
            "List global Homebrew analytics data or, if specified, installation and build error data for formula",
        },
        {
          name: "--days",
          description: "How many days of analytics data to retrieve",
          exclusiveOn: ["--analytics"],
          args: {
            name: "days",
            description: "Number of days of data to retrieve",
            suggestions: ["30", "90", "365"],
          },
        },
        {
          name: "--category",
          description: "Which type of analytics data to retrieve",
          exclusiveOn: ["--analytics"],
          args: {
            generators: {
              custom: async (ctx) => {
                // if anything provided after the subcommand does not begin with '-'
                // then a formula has been provided and we should provide info on it
                if (
                  ctx.slice(2, ctx.length - 1).some((token) => token[0] !== "-")
                ) {
                  return ["install", "install-on-request", "build-error"].map(
                    (sugg) => ({
                      name: sugg,
                    })
                  );
                }

                // if no formulas are specified, then we should provide system info
                return ["cask-install", "os-version"].map((sugg) => ({
                  name: sugg,
                }));
              },
            },
          },
        },
        {
          name: "--github",
          description: "Open the GitHub source page for formula in a browser",
        },
        {
          name: "--json",
          description: "Print a JSON representation",
        },
        {
          name: "--installed",
          exclusiveOn: ["--json"],
          description: "Print JSON of formulae that are currently installed",
        },
        {
          name: "--all",
          exclusiveOn: ["--json"],
          description: "Print JSON of all available formulae",
        },
        {
          name: ["-v", "--verbose"],
          description: "Show more verbose analytics data for formulae",
        },
        {
          name: "--formula",
          description: "Treat all named arguments as formulae",
        },
        {
          name: "--cash",
          description: "Treat all named arguments as casks",
        },
        {
          name: ["-d", "--debug"],
          description: "Display any debugging information",
        },
        {
          name: ["-q", "--quiet"],
          description: "List only the names of outdated kegs",
        },
        {
          name: ["-h", "--help"],
          description: "Get help with services command",
        },
      ],
    },
    {
      name: "update",
      description: "Fetch the newest version of Homebrew and all formulae",
      options: [
        {
          name: ["-f", "--force"],
          description: "Always do a slower, full update check",
        },
        {
          name: ["-v", "--verbose"],
          description:
            "Print the directories checked and git operations performed",
        },
        {
          name: ["-d", "--debug"],
          description:
            "Display a trace of all shell commands as they are executed",
        },
        { name: ["-h", "--help"], description: "Show help message" },
        {
          name: "--merge",
          description:
            "Use git merge to apply updates (rather than git rebase)",
        },
        {
          name: "--preinstall",
          description:
            "Run on auto-updates (e.g. before brew install). Skips some slower steps",
        },
      ],
    },
    {
      name: "outdated",
      description:
        "List installed casks and formulae that have an updated version available",
      options: [
        {
          name: ["-d", "--debug"],
          description: "Display any debugging information",
        },
        {
          name: ["-q", "--quiet"],
          description: "List only the names of outdated kegs",
        },
        {
          name: ["-v", "--verbose"],
          description: "Include detailed version information",
        },
        {
          name: ["-h", "--help"],
          description: "Show help message for the outdated command",
        },
        { name: "--cask", description: "List only outdated casks" },
        {
          name: "--fetch-HEAD",
          description:
            "Fetch the upstream repository to detect if the HEAD installation of the formula is outdated",
        },
        { name: "--formula", description: "List only outdated formulae" },
        {
          name: "--greedy",
          description:
            "Print outdated casks with auto_updates or version :latest",
        },
        {
          name: "--greedy-latest",
          description:
            "Print outdated casks including those with version :latest",
        },
        {
          name: "--greedy-auto-updates",
          description:
            "Print outdated casks including those with auto_updates true",
        },
        { name: "--json", description: "Print output in JSON format" },
      ],
    },
    {
      name: "pin",
      description: "Pin formula, preventing them from being upgraded",
      options: commonOptions,
      args: {
        isVariadic: true,
        name: "formula",
        generators: formulaeGenerator,
      },
    },
    {
      name: "unpin",
      description: "Unpin formula, allowing them to be upgraded",
      options: commonOptions,
      args: {
        isVariadic: true,
        name: "formula",
        generators: formulaeGenerator,
      },
    },
    {
      name: "upgrade",
      description:
        "Upgrade outdated casks and outdated, unpinned formulae using the same options they were originally installed with, plus any appended brew formula options",
      options: [
        {
          name: ["-d", "--debug"],
          description:
            "If brewing fails, open an interactive debugging session with access to IRB or a shell inside the temporary build directory",
        },
        {
          name: ["-f", "--force"],
          description:
            "Install formulae without checking for previously installed keg-only or non-migrated versions. When installing casks, overwrite existing files (binaries and symlinks are excluded, unless originally from the same cask)",
        },
        {
          name: ["-v", "--verbose"],
          description: "Print the verification and postinstall steps",
        },
        {
          name: ["-n", "--dry-run"],
          description:
            "Show what would be upgraded, but do not actually upgrade anything",
        },
        {
          name: ["-s", "--build-from-source"],
          description:
            "Compile formula from source even if a bottle is provided. Dependencies will still be installed from bottles if they are available",
        },
        {
          name: ["-i", "--interactive"],
          description: "Download and patch formula, then open a shell",
        },
        { name: ["-g", "--git"], description: "Create a Git repository" },
        {
          name: ["-q", "--quiet"],
          description: "Make some output more quiet",
        },
        { name: ["-h", "--help"], description: "Show this message" },
        {
          name: ["--formula", "--formulae"],
          description:
            "Treat all named arguments as formulae. If no named arguments are specified, upgrade only outdated formulae",
        },
        {
          name: "--env",
          description: "Disabled other than for internal Homebrew use",
        },
        {
          name: "--ignore-dependencies",
          description:
            "An unsupported Homebrew development flag to skip installing any dependencies of any kind. If the dependencies are not already present, the formula will have issues. If you're not developing Homebrew, consider adjusting your PATH rather than using this flag",
        },
        {
          name: "--only-dependencies",
          description:
            "Install the dependencies with specified options but do not install the formula itself",
        },
        {
          name: "--cc",
          description:
            "Attempt to compile using the specified compiler, which should be the name of the compiler's executable",
          args: {
            name: "compiler",
            suggestions: ["gcc-7", "llvm_clang", "clang"],
          },
        },
        {
          name: "--force-bottle",
          description:
            "Install from a bottle if it exists for the current or newest version of macOS, even if it would not normally be used for installation",
        },
        {
          name: "--include-test",
          description:
            "Install testing dependencies required to run brew test formula",
        },
        {
          name: "--HEAD",
          description:
            "If formula defines it, install the HEAD version, aka. main, trunk, unstable, master",
        },
        {
          name: "--fetch-HEAD",
          description:
            "Fetch the upstream repository to detect if the HEAD installation of the formula is outdated. Otherwise, the repository's HEAD will only be checked for updates when a new stable or development version has been released",
        },
        {
          name: "--ignore-pinned",
          description:
            "Set a successful exit status even if pinned formulae are not upgraded",
        },
        {
          name: "--keep-tmp",
          description: "Retain the temporary files created during installation",
        },
        {
          name: "--build-bottle",
          description:
            "Prepare the formula for eventual bottling during installation, skipping any post-install steps",
        },
        {
          name: "--bottle-arch",
          description:
            "Optimise bottles for the specified architecture rather than the oldest architecture supported by the version of macOS the bottles are built on",
        },
        {
          name: "--display-times",
          description:
            "Print install times for each formula at the end of the run",
        },
        {
          name: ["--cask", "--casks"],
          description:
            "Treat all named arguments as casks. If no named arguments are specified, upgrade only outdated casks",
        },
        {
          name: "--binaries",
          description:
            "Disable/enable linking of helper executables (default: enabled)",
          exclusiveOn: ["--no-binaries"],
        },
        {
          name: "--no-binaries",
          description:
            "Disable/enable linking of helper executables (default: enabled)",
          exclusiveOn: ["--binaries"],
        },
        {
          name: "--require-sha",
          description: "Require all casks to have a checksum",
        },
        {
          name: "--quarantine",
          description:
            "Disable/enable quarantining of downloads (default: enabled)",
          exclusiveOn: ["--no-quarantine"],
        },
        {
          name: "--no-quarantine",
          description:
            "Disable/enable quarantining of downloads (default: enabled)",
          exclusiveOn: ["--quarantine"],
        },
        {
          name: "--skip-cask-deps",
          description: "Skip installing cask dependencies",
        },
        {
          name: "--greedy",
          description:
            "Also include casks with auto_updates true or version :latest",
          exclusiveOn: ["--greedy-latest", "--greedy-auto-updates"],
        },
        {
          name: "--greedy-latest",
          description: "Also include casks with version :latest",
        },
        {
          name: "--greedy-auto-updates",
          description: "Also include casks with auto_updates true",
        },
        {
          name: "--appdir",
          description:
            "Target location for Applications (default: /Applications)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--colorpickerdir",
          description:
            "Target location for Color Pickers (default: ~/Library/ColorPickers)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--prefpanedir",
          description:
            "Target location for Preference Panes (default: ~/Library/PreferencePanes)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--qlplugindir",
          description:
            "Target location for QuickLook Plugins (default: ~/Library/QuickLook)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--mdimporterdir",
          description:
            "Target location for Spotlight Plugins (default: ~/Library/Spotlight)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--dictionarydir",
          description:
            "Target location for Dictionaries (default: ~/Library/Dictionaries)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--fontdir",
          description: "Target location for Fonts (default: ~/Library/Fonts)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--servicedir",
          description:
            "Target location for Services (default: ~/Library/Services)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--input-methoddir",
          description:
            "Target location for Input Methods (default: ~/Library/Input Methods)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--internet-plugindir",
          description:
            "Target location for Internet Plugins (default: ~/Library/Internet Plug-Ins)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--audio-unit-plugindir",
          description:
            "Target location for Audio Unit Plugins (default: ~/Library/Audio/Plug-Ins/Components)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--vst-plugindir",
          description:
            "Target location for VST Plugins (default: ~/Library/Audio/Plug-Ins/VST)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--vst3-plugindir",
          description:
            "Target location for VST3 Plugins (default: ~/Library/Audio/Plug-Ins/VST3)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--screen-saverdir",
          description:
            "Target location for Screen Savers (default: ~/Library/Screen Savers)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--language",
          description:
            "Comma-separated list of language codes to prefer for cask installation. The first matching language is used, otherwise it reverts to the cask's default language. The default value is the language of your system",
        },
      ],
      args: {
        isVariadic: true,
        isOptional: true,
        name: "outdated_formula|outdated_cask",
        generators: outdatedformulaeGenerator,
      },
    },
    {
      name: "search",
      description:
        "Perform a substring search of cask tokens and formula names",
      options: [
        ...commonOptions,
        {
          name: "--formula",
          description: "Search online and locally for formulae",
        },
        {
          name: "--cask",
          description: "Search online and locally for casks",
        },
        {
          name: "--desc",
          description:
            "Search for formulae with a description matching text and casks with a name matching text",
        },
        {
          name: "--pull-request",
          description: "Search for GitHub pull requests containing text",
        },
        {
          name: "--open",
          description: "Search for only open GitHub pull requests",
        },
        {
          name: "--closed",
          description: "Search for only closed GitHub pull requests",
        },
        {
          name: ["--repology", "--macports"],
          description: "Search for text in the given database",
        },
        {
          name: ["--fink", "--opensuse"],
          description: "Search for text in the given database",
        },
        {
          name: ["--fedora", "--debian"],
          description: "Search for text in the given database",
        },
        {
          name: "--ubuntu",
          description: "Search for text in the given database",
        },
      ],
    },
    {
      name: "config",
      description: "Show Homebrew and system configuration info",
    },
    {
      name: "postinstall",
      description: "Rerun the post install step for formula",
      options: [
        {
          name: ["-d", "--debug"],
          description: "Display any debugging information",
        },
        {
          name: ["-v", "--verbose"],
          description: "Make some output more verbose",
        },
        {
          name: ["-q", "--quiet"],
          description: "Make some output more quiet",
        },
        { name: ["-h", "--help"], description: "Show this message" },
      ],
      args: {
        isVariadic: true,
        name: "formula",
        generators: formulaeGenerator,
      },
    },
    {
      name: "install",
      description: "Install <formula>",
      options: [
        {
          name: ["-f", "--force"],
          description:
            "Install formulae without checking for previously installed keg-only or non-migrated versions. When installing casks",
        },
        {
          name: ["-v", "--verbose"],
          description: "Print the verification and postinstall steps",
        },
        {
          name: ["-s", "--build-from-source"],
          description:
            "Compile formula from source even if a bottle is provided. Dependencies will still be installed from bottles if they are available",
        },
        {
          name: ["-i", "--interactive"],
          description: "Download and patch formula",
        },
        { name: ["-g", "--git"], description: "Create a Git repository" },
        {
          name: ["-q", "--quiet"],
          description: "Make some output more quiet",
        },
        { name: ["-h", "--help"], description: "Show this message" },
        {
          name: "--formula",
          description: "Treat all named arguments as formulae",
        },
        {
          name: "--env",
          description: "Disabled other than for internal Homebrew use",
        },
        {
          name: "--ignore-dependencies",
          description:
            "An unsupported Homebrew development flag to skip installing any dependencies of any kind. If the dependencies are not already present, the formula will have issues. If you're not developing Homebrew, consider adjusting your PATH rather than using this flag",
        },
        {
          name: "--only-dependencies",
          description:
            "Install the dependencies with specified options but do not install the formula itself",
        },
        {
          name: "--cc",
          description:
            "Attempt to compile using the specified compiler, which should be the name of the compiler's executable",
          args: {
            name: "compiler",
            suggestions: ["gcc-7", "llvm_clang", "clang"],
          },
        },
        {
          name: "--force-bottle",
          description:
            "Install from a bottle if it exists for the current or newest version of macOS, even if it would not normally be used for installation",
        },
        {
          name: "--include-test",
          description:
            "Install testing dependencies required to run brew test formula",
        },
        {
          name: "--HEAD",
          description:
            "If formula defines it, install the HEAD version, aka. main, trunk, unstable, master",
        },
        {
          name: "--fetch-HEAD",
          description:
            "Fetch the upstream repository to detect if the HEAD installation of the formula is outdated. Otherwise, the repository's HEAD will only be checked for updates when a new stable or development version has been released",
        },
        {
          name: "--keep-tmp",
          description: "Retain the temporary files created during installation",
        },
        {
          name: "--build-bottle",
          description:
            "Prepare the formula for eventual bottling during installation, skipping any post-install steps",
        },
        {
          name: "--bottle-arch",
          description:
            "Optimise bottles for the specified architecture rather than the oldest architecture supported by the version of macOS the bottles are built on",
        },
        {
          name: "--display-times",
          description:
            "Print install times for each formula at the end of the run",
        },
        {
          name: "--cask",
          description: "--casks Treat all named arguments as casks",
        },
        {
          name: "--binaries",
          description:
            "Disable/enable linking of helper executables (default: enabled)",
        },
        {
          name: "--no-binaries",
          description:
            "Disable/enable linking of helper executables (default: enabled)",
        },
        {
          name: "--require-sha",
          description: "Require all casks to have a checksum",
        },
        {
          name: "--quarantine",
          description:
            "Disable/enable quarantining of downloads (default: enabled)",
        },
        {
          name: "--no-quarantine",
          description:
            "Disable/enable quarantining of downloads (default: enabled)",
        },
        {
          name: "--skip-cask-deps",
          description: "Skip installing cask dependencies",
        },
        {
          name: "--appdir",
          description:
            "Target location for Applications (default: /Applications)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--colorpickerdir",
          description:
            "Target location for Color Pickers (default: ~/Library/ColorPickers)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--prefpanedir",
          description:
            "Target location for Preference Panes (default: ~/Library/PreferencePanes)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--qlplugindir",
          description:
            "Target location for QuickLook Plugins (default: ~/Library/QuickLook)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--mdimporterdir",
          description:
            "Target location for Spotlight Plugins (default: ~/Library/Spotlight)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--dictionarydir",
          description:
            "Target location for Dictionaries (default: ~/Library/Dictionaries)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--fontdir",
          description: "Target location for Fonts (default: ~/Library/Fonts)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--servicedir",
          description:
            "Target location for Services (default: ~/Library/Services)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--input-methoddir",
          description:
            "Target location for Input Methods (default: ~/Library/Input Methods)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--internet-plugindir",
          description:
            "Target location for Internet Plugins (default: ~/Library/Internet Plug-Ins)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--audio-unit-plugindir",
          description:
            "Target location for Audio Unit Plugins (default: ~/Library/Audio/Plug-Ins/Components)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--vst-plugindir",
          description:
            "Target location for VST Plugins (default: ~/Library/Audio/Plug-Ins/VST)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--vst3-plugindir",
          description:
            "Target location for VST3 Plugins (default: ~/Library/Audio/Plug-Ins/VST3)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--screen-saverdir",
          description:
            "Target location for Screen Savers (default: ~/Library/Screen Savers)",
          args: {
            name: "location",
            template: "folders",
          },
        },
        {
          name: "--language",
          description:
            "Comma-separated list of language codes to prefer for cask installation. The first matching language is used, otherwise it reverts to the cask's default language. The default value is the language of your system",
        },
      ],
      args: {
        isVariadic: true,
        name: "formula",
        description: "Formula or cask to install",
        generators: [generateAllFormulae, generateAllCasks],
      },
    },
    {
      name: "reinstall",
      description:
        "Uninstall and then reinstall a formula or cask using the same options it was originally installed with, plus any appended options specific to a formula",
      options: [
        {
          name: ["-d", "--debug"],
          description:
            "If brewing fails, open an interactive debugging session with access to IRB or a shell inside the temporary build directory",
        },
        {
          name: ["-f", "--force"],
          description:
            "Install formulae without checking for previously installed keg-only or non-migrated versions. When installing casks",
        },
        {
          name: ["-v", "--verbose"],
          description: "Print the verification and postinstall steps",
        },
        {
          name: ["-s", "--build-from-source"],
          description:
            "Compile formula from source even if a bottle is provided. Dependencies will still be installed from bottles if they are available",
        },
        {
          name: ["-i", "--interactive"],
          description: "Download and patch formula",
        },
        { name: ["-g", "--git"], description: "Create a Git repository" },
        {
          name: "--formula",
          description: "Treat all named arguments as formulae",
        },
        {
          name: "--force-bottle",
          description:
            "Install from a bottle if it exists for the current or newest version of macOS, even if it would not normally be used for installation",
        },
        {
          name: "--keep-tmp",
          description: "Retain the temporary files created during installation",
        },
        {
          name: "--display-times",
          description:
            "Print install times for each formula at the end of the run",
        },
        {
          name: "--cask",
          description: "--casks Treat all named arguments as casks",
        },
        {
          name: "--binaries",
          description:
            "Disable/enable linking of helper executables (default: enabled)",
          exclusiveOn: ["--no-binaries"],
        },
        {
          name: "--no-binaries",
          description:
            "Disable/enable linking of helper executables (default: enabled)",
          exclusiveOn: ["--binaries"],
        },
        {
          name: "--require-sha",
          description: "Require all casks to have a checksum",
        },
        {
          name: "--quarantine",
          description:
            "Disable/enable quarantining of downloads (default: enabled)",
          exclusiveOn: ["--no-quarantine"],
        },
        {
          name: "--no-quarantine",
          description:
            "Disable/enable quarantining of downloads (default: enabled)",
          exclusiveOn: ["--quarantine"],
        },
        {
          name: "--skip-cask-deps",
          description: "Skip installing cask dependencies",
        },
      ],
      args: {
        isVariadic: true,
        name: "formula",
        generators: formulaeGenerator,
      },
    },
    {
      name: ["uninstall", "remove", "rm"],
      description: "Uninstall a formula or cask",
      args: {
        isVariadic: true,
        name: "formula",
        generators: formulaeGenerator,
      },
    },
    {
      // NOTE: this is actually a command even if it has the double dash in the front
      name: "--prefix",
      description: "Prefix of <formula>",
      args: {
        isVariadic: true,
        name: "formula",
        generators: formulaeGenerator,
      },
      options: [
        {
          name: "--unbrewed",
          description:
            "List files in Homebrew's prefix not installed by Homebrew",
        },
        {
          name: "--installed",
          description:
            "Outputs nothing and returns a failing status code if formula is not installed",
        },
      ],
    },
    {
      name: "cask",
      description:
        "Homebrew Cask provides a friendly CLI workflow for the administration of macOS applications distributed as binaries",
      subcommands: [
        {
          name: "install",
          description: "Installs the given cask",
          args: {
            name: "cask",
            description: "Cask to install",
          },
        },
        {
          name: "uninstall",
          description: "Uninstalls the given cask",
          options: [
            ...commonOptions,
            {
              name: "--zap",
              description:
                "Remove all files associated with a cask. May remove files which are shared between applications",
            },
            {
              name: "--ignore-dependencies",
              description:
                "Don't fail uninstall, even if formula is a dependency of any installed formulae",
            },
            {
              name: "--formula",
              description: "Treat all named arguments as formulae",
            },
            {
              name: "--cask",
              description: "Treat all named arguments as casks",
            },
          ],
          args: {
            isVariadic: true,

            generators: {
              script: ["brew", "list", "-1", "--cask"],
              postProcess: function (out) {
                return out.split("\n").map((formula) => {
                  return {
                    name: formula,
                    icon: "🍺",
                    description: "Installed formula",
                  };
                });
              },
            },
          },
        },
      ],
    },
    {
      name: "cleanup",
      description:
        "Remove stale lock files and outdated downloads for all formulae and casks and remove old versions of installed formulae",
      options: [
        ...commonOptions,
        {
          name: ["--prune", "--prune=all"],
          description: "Remove all cache files older than specified days",
        },
        {
          name: ["-n", "--dry-run"],
          description:
            "Show what would be removed, but do not actually remove anything",
        },
        {
          name: "-s",
          description:
            "Scrub the cache, including downloads for even the latest versions",
        },
        {
          name: "--prune-prefix",
          description:
            "Only prune the symlinks and directories from the prefix and remove no other files",
        },
      ],
      args: {
        isVariadic: true,
        isOptional: true,
        generators: servicesGenerator("Cleanup"),
      },
    },
    {
      name: "services",
      description:
        "Manage background services with macOS' launchctl(1) daemon manager",
      options: [
        ...commonOptions,
        {
          name: "--file",
          description:
            "Use the plist file from this location to start or run the service",
        },
        {
          name: "--all",
          description: "Run subcommand on all services",
        },
        {
          name: ["-v", "--verbose"],
          description: "Make some output more verbose",
        },
        {
          name: ["-h", "--help"],
          description: "Get help with services command",
        },
      ],
      subcommands: [
        {
          name: "cleanup",
          description: "Remove all unused services",
        },
        {
          name: "list",
          description: "List all services",
        },
        {
          name: "run",
          description:
            "Run the service formula without registering to launch at login (or boot)",
          options: [
            {
              name: "--all",
              description: "Start all services",
            },
          ],
          args: {
            isVariadic: true,
            generators: servicesGenerator("Run"),
          },
        },
        {
          name: "start",
          description:
            "Start the service formula immediately and register it to launch at login",
          options: [
            {
              name: "--all",
              description: "Start all services",
            },
          ],
          args: {
            isVariadic: true,
            generators: servicesGenerator("Start"),
          },
        },
        {
          name: "stop",
          description:
            "Stop the service formula immediately and unregister it from launching at",
          options: [
            {
              name: "--all",
              description: "Start all services",
            },
          ],
          args: {
            isVariadic: true,
            generators: servicesGenerator("Stop"),
          },
        },
        {
          name: "restart",
          description:
            "Stop (if necessary) and start the service formula immediately and register it to launch at login (or boot)",
          options: [
            {
              name: "--all",
              description: "Start all services",
            },
          ],
          args: {
            isVariadic: true,
            generators: servicesGenerator("Restart"),
          },
        },
      ],
    },
    {
      name: "analytics",
      description: "Manages analytics preferences",
      subcommands: [
        {
          name: "on",
          description: "Turns on analytics",
        },
        {
          name: "off",
          description: "Turns off analytics",
        },
        {
          name: "regenerate-uuid",
          description: "Regenerate the UUID used for analytics",
        },
      ],
    },
    {
      name: "autoremove",
      description:
        "Uninstall formulae that were only installed as a dependency of another formula and are now no longer needed",
      options: [
        {
          name: ["-n", "--dry-run"],
          description:
            "List what would be uninstalled, but do not actually uninstall anything",
        },
      ],
    },
    {
      name: "tap",
      description: "Tap a formula repository",
      options: [
        ...commonOptions,
        {
          name: "--full",
          description:
            "Convert a shallow clone to a full clone without untapping",
        },
        {
          name: "--shallow",
          description: "Fetch tap as a shallow clone rather than a full clone",
        },
        {
          name: "--force-auto-update",
          description: "Auto-update tap even if it is not hosted on GitHub",
        },
        {
          name: "--repair",
          description:
            "Migrate tapped formulae from symlink-based to directory-based structure",
        },
        {
          name: "--list-pinned",
          description: "List all pinned taps",
        },
      ],
      args: {
        name: "user/repo or URL",
      },
    },
    {
      name: "untap",
      description: "Remove a tapped formula repository",
      args: {
        name: "repository",
        generators: repositoriesGenerator(),
      },
      options: [
        {
          name: ["-f", "--force"],
          description:
            "Untap even if formulae or casks from this tap are currently installed",
        },
        {
          name: ["-d", "--debug"],
          description: "Display any debugging information",
        },
        {
          name: ["-q", "--quiet"],
          description: "Make some output more quiet",
        },
        {
          name: ["-v", "--verbose"],
          description: "Make some output more verbose",
        },
        {
          name: ["-h", "--help"],
          description: "Show help message",
        },
      ],
    },
    {
      name: "link",
      description:
        "Symlink all of formula's installed files into Homebrew's prefix",
      args: {
        isOptional: true,
        isVariadic: true,
        name: "formula",
        generators: formulaeGenerator,
      },
      options: [
        {
          name: "--overwrite",
          description:
            "Delete files that already exist in the prefix while linking",
        },
        {
          name: ["-n", "--dry-run"],
          description:
            "List files which would be linked or deleted by brew link --overwrite without actually linking or deleting any files",
        },
        {
          name: ["-f", "--force"],
          description: "Allow keg-only formulae to be linked",
        },
        {
          name: "--HEAD",
          description:
            "Link the HEAD version of the formula if it is installed",
        },
      ],
    },
    {
      name: "unlink",
      description: "Remove symlinks for formula from Homebrew's prefix",
      args: {
        isOptional: true,
        isVariadic: true,
        name: "formula",
        generators: formulaeGenerator,
      },
      options: [
        {
          name: ["-n", "--dry-run"],
          description:
            "List files which would be unlinked without actually unlinking or deleting any files",
        },
      ],
    },
    {
      name: "formulae",
      description: "List all available formulae",
    },
    {
      name: "casks",
      description: "List all available casks",
    },
    {
      name: "edit",
      description: "",
      args: {
        isVariadic: true,
        isOptional: true,
        name: "formula",
        description: "Formula or cask to install",
        generators: [generateAllFormulae, generateAllCasks],
      },
      options: [
        ...commonOptions,
        {
          name: ["--formula", "--formulae"],
          description: "Treat all named arguments as formulae",
        },
        {
          name: ["--cask", "--casks"],
          description: "Treat all named arguments as casks",
        },
      ],
    },
    {
      name: ["home", "homepage"],
      description:
        "Open a formula, cask's homepage in a browser, or open Homebrew's own homepage if no argument is provided",
      args: {
        isVariadic: true,
        isOptional: true,
        name: "formula",
        description: "Formula or cask to open homepage for",
        generators: [generateAllFormulae, generateAllCasks],
      },
      options: [
        ...commonOptions,
        {
          name: ["--formula", "--formulae"],
          description: "Treat all named arguments as formulae",
        },
        {
          name: ["--cask", "--casks"],
          description: "Treat all named arguments as casks",
        },
      ],
    },
    {
      name: "alias",
      description: "Manage custom user created brew aliases",
      options: [
        {
          name: "--edit",
          description: "Edit aliases in a text editor",
        },
        {
          name: ["-d", "--debug"],
          description: "Display any debugging information",
        },
        {
          name: ["-q", "--quiet"],
          description: "Make some output more quiet",
        },
        {
          name: ["-v", "--verbose"],
          description: "Make some output more verbose",
        },
        {
          name: ["-h", "--help"],
          description: "Show help message",
        },
      ],
      args: {
        name: "alias",
        generators: generateAliases,
        description: "Display the alias command",
        isOptional: true,
      },
    },
    {
      name: "developer",
      description: "Display the current state of Homebrew's developer mode",
      args: {
        name: "state",
        description: "Turn Homebrew's developer mode on or off respectively",
        suggestions: ["on", "off"],
        isOptional: true,
      },
    },
  ],
  options: [
    {
      name: "--version",
      description: "The current Homebrew version",
    },
  ],
  args: {
    name: "alias",
    generators: generateAliases,
    description: "Custom user defined brew alias",
    isOptional: true,
  },
};

export default completionSpec;
