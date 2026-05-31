import { filepaths } from '../../helpers/filepaths';

const completionSpec: Fig.Spec = {
	name: "python3",
	description: "Run the python interpreter",
	generateSpec: async (tokens, executeShellCommand) => {
		const isDjangoManagePyFilePresentCommand = "cat manage.py | grep -q django";

		if (
			(
				await executeShellCommand({
					command: "bash",
					args: ["-c", isDjangoManagePyFilePresentCommand],
				})
			).status === 0
		) {
			return {
				name: "python3",
				subcommands: [{ name: "manage.py", loadSpec: "django-admin" }],
			};
		}
	},
	args: {
		name: "python script",
		isScript: true,
		generators: filepaths({
			extensions: ["py"],
			editFileSuggestions: { priority: 76 },
		}),
	},
	options: [
		{
			name: "-c",
			insertValue: "-c '{cursor}'",
			description:
				"Execute the Python code in command. command can be one or more statements separated by newlines, with significant leading whitespace as in normal module code",
			args: {
				name: "command",
				isCommand: true,
			},
		},
		{
			name: "-m",
			insertValue: "-m '{cursor}'",
			description:
				"Search sys.path for the named module and execute its contents as the __main__ module",
			args: {
				name: "command",
				isCommand: true,
			},
		},
		{
			name: ["-?", "-h", "--help"],
			description: "Print a short description of all command line options",
		},
		{
			name: ["-V", "--version"],
			description: "Print the Python version number and exit",
		},
		{
			name: "-b",
			description:
				"Issue a warning when comparing bytes or bytearray with str or bytes with int. Issue an error when the option is given twice (-bb)",
		},
		{
			name: "-B",
			description:
				"If given, Python won’t try to write .pyc files on the import of source modules",
		},
		{
			name: "--check-hash-based-pycs",
			description:
				"Control the validation behavior of hash-based .pyc files. See Cached bytecode invalidation",
			args: {
				suggestions: [
					{ name: "default" },
					{ name: "always" },
					{ name: "never" },
				],
			},
		},
		{
			name: "-d",
			description:
				"Turn on parser debugging output (for expert only, depending on compilation options)",
		},
		{
			name: "-E",
			description:
				"Ignore all PYTHON* environment variables, e.g. PYTHONPATH and PYTHONHOME, that might be set",
		},
		{
			name: "-i",
			description:
				"When a script is passed as first argument or the -c option is used, enter interactive mode after executing the script or the command, even when sys.stdin does not appear to be a terminal",
		},
		{
			name: "-I",
			description:
				"Run Python in isolated mode. This also implies -E and -s. In isolated mode sys.path contains neither the script’s directory nor the user’s site-packages directory",
		},
		{
			name: "-O",
			description:
				"Remove assert statements and any code conditional on the value of __debug__",
		},
		{
			name: "-OO",
			description: "Do -O and also discard docstrings",
		},
		{
			name: "-g",
			description:
				"Don’t display the copyright and version messages even in interactive mode",
		},
		{
			name: "-R",
			description:
				"Turn on hash randomization. This option only has an effect if the PYTHONHASHSEED environment variable is set to 0, since hash randomization is enabled by default",
		},
		{
			name: "-s",
			description: "Don’t add the user site-packages directory to sys.path",
		},
		{
			name: "-S",
			description:
				"Disable the import of the module site and the site-dependent manipulations of sys.path that it entails",
		},
		{
			name: "-u",
			description:
				"Force the stdout and stderr streams to be unbuffered. This option has no effect on the stdin stream",
		},
		{
			name: "-v",
			description:
				"Print a message each time a module is initialized, showing the place (filename or built-in module) from which it is loaded",
		},
		{
			name: "-W",
			description:
				"Warning control. Python’s warning machinery by default prints warning messages to sys.stderr",
			args: {},
		},
		{
			name: "-x",
			description:
				"Skip the first line of the source, allowing use of non-Unix forms of #!cmd. This is intended for a DOS specific hack only",
		},
		{
			name: "-X",
			description: "Reserved for various implementation-specific options",
			args: {
				suggestions: [
					{ name: "faulthandler" },
					{ name: "showrefcount" },
					{ name: "tracemalloc" },
					{ name: "showalloccount" },
					{ name: "importtime" },
					{ name: "dev" },
					{ name: "utf8" },
					{ name: "pycache_prefix=PATH" },
				],
			},
		},
	],
};

export default completionSpec;
