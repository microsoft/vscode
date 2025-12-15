const completionSpec: Fig.Spec = {
	name: "who",
	description: "Display who is logged in",
	parserDirectives: {
		optionsMustPrecedeArguments: true,
	},
	subcommands: [
		{
			name: "am",
			description: "Returns the invoker's real user name",
			additionalSuggestions: [
				{
					name: "am I",
					insertValue: "I{cursor}",
					icon: "fig://icon?type=command",
				},
			],
			priority: 40,
		},
	],
	options: [
		{
			name: "-a",
			description: "Same as -bdlprTtu",
		},
		{
			name: "-b",
			description: "Time of last system boot",
		},
		{
			name: "-d",
			description: "Print dead processes",
		},
		{
			name: "-H",
			description: "Write column headings above the regular output",
		},
		{
			name: "-l",
			description: "Print system login processes (unsupported)",
		},
		{
			name: "-m",
			description: "Only print information about the current terminal",
		},
		{
			name: "-p",
			description: "Print active processes spawned by launchd(8) (unsupported)",
		},
		{
			name: "-q",
			description:
				"'Quick mode': List only names and number of users currently logged on",
			exclusiveOn: [
				"-a",
				"-b",
				"-d",
				"-H",
				"-l",
				"-m",
				"-p",
				"-r",
				"-s",
				"-T",
				"-t",
				"-u",
			],
		},
		{
			name: "-r",
			description: "Print the current runlevel",
		},
		{
			name: "-s",
			description:
				"List only the name, line and time fields (this is the default)",
		},
		{
			name: "-T",
			description:
				"Print a character after the user name indicating the state of the terminal line: '+' writable, '-' not writable, '?' bad",
		},
		{
			name: "-t",
			description: "Print last system clock change (unsupported)",
		},
		{
			name: "-u",
			description:
				"Print the idle time for each user and the associated process ID",
		},
	],
	args: {
		name: "file",
		description:
			"By default, who gathers information from the file /var/run/utmpx; an alternative file may be specified",
		isOptional: true,
		template: "filepaths",
	},
};
export default completionSpec;
