const completionSpec: Fig.Spec = {
	name: "xargs",
	description:
		"Execute a command with whitespace-delimited strings (from stdin) as arguments",
	options: [
		{
			name: "-0",
			description: "Use NUL (0x00) as a separator, instead of whitespace",
		},
		{
			name: "-E",
			description: "Use this string as a logical EOF marker",
			args: {
				name: "eof-str",
				description: "The string to use that marks EOF",
			},
		},
		{
			name: "-I",
			description: "Replace occurrences of this string with the input",
			args: {
				name: "replacement-str",
				description: "The string to replace",
			},
		},
		{
			name: "-J",
			description:
				"Replace an argument exactly equal to this string with the input",
			args: {
				name: "replacement-str",
				description: "The string to replace",
			},
		},
		{
			name: "-L",
			description:
				"Run the program each time this many lines of input are read",
			args: {
				name: "number",
			},
			exclusiveOn: ["-n"],
		},
		{
			name: "-n",
			description:
				"The maximum number of arguments that can be taken from stdin on each run",
			args: {
				name: "number",
			},
			exclusiveOn: ["-L"],
		},
		{
			name: "-o",
			description:
				"Reopen stdin as /dev/tty (useful for running interactive applications)",
		},
		{
			name: "-P",
			description:
				"Run up to this many commands in parallel (as many as possible if 0)",
			args: {
				name: "max-procs",
			},
		},
		{
			name: "-p",
			description: "Prompt to run each command",
		},
		{
			name: "-r",
			description:
				"Run the command once if there's no input (compatible with GNU xargs)",
		},
		{
			name: "-R",
			description:
				"Specify the maximum number of occurrences that -I will replace",
			dependsOn: ["-I"],
			args: {
				name: "number",
			},
		},
		{
			name: "-S",
			description:
				"Specify the maximum size in bytes that -I can use for replacements (default: 255)",
			dependsOn: ["-I"],
			args: {
				name: "replacement-size",
			},
		},
		{
			name: "-s",
			description:
				"Maximum number of bytes that can be provided to the program (default: 4096)",
			args: {
				name: "max-args-size",
			},
		},
		{
			name: "-t",
			description: "Echo the command to stderr before it's executed",
		},
		{
			name: "-x",
			description:
				"Terminal if the arguments will not fit in the maximum line length",
			dependsOn: ["-n"],
		},
	],
	args: {
		name: "utility",
		description: "Run this program for each line of stdin (default: echo)",
		isCommand: true,
		isOptional: true,
	},
};

export default completionSpec;
