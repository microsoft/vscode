const completionSpec: Fig.Spec = {
	name: "stat",
	description: "Display file status",
	options: [
		{
			name: "-F",
			description:
				"As in ls(1), display a slash ('/') immediately after each pathname that is a directory, an asterisk ('*') after each that is executable, an at sign ('@') after each symbolic link, a percent sign ('%') after each whiteout, an equal sign ('=') after each socket, and a vertical bar ('|') after each that is a FIFO.  The use of -F implies -l",
		},
		{
			name: "-L",
			description:
				"Use stat(2) instead of lstat(2). The information reported by stat will refer to the target of file, if file is a symbolic link, and not to file itself.  If the link is broken or the target does not exist, fall back on lstat(2) and report information about the link",
		},
		{
			name: "-f",
			description:
				"Display information using the specified format; similar to printf(3) formats in that they start with %, are then followed by a sequence of formatting characters, and end in a character that selects the field of the struct stat which is to be formatted",
			args: {
				name: "format",
			},
			exclusiveOn: ["-l", "-r", "-s", "-x"],
		},
		{
			name: "-l",
			description: "Display output in 'ls -lT' format",
			exclusiveOn: ["-f", "-r", "-s", "-x"],
		},
		{
			name: "-n",
			description:
				"Do not force a newline to appear at the end of each piece of output",
		},
		{
			name: "-q",
			description:
				"Suppress failure messages if calls to stat(2) or lstat(2) fail. When run as 'readlink', error messages are automatically suppressed",
		},
		{
			name: "-r",
			description:
				"Display raw information. That is, for all the fields in the stat structure, display the raw, numerical value (for example, times in seconds since the epoch, etc.)",
			exclusiveOn: ["-f", "-l", "-s", "-x"],
		},
		{
			name: "-s",
			description:
				"Display information in 'shell output' format, suitable for initializing variables",
			exclusiveOn: ["-f", "-l", "-r", "-x"],
		},
		{
			name: "-t",
			description:
				"Display timestamps using the specified format. This format is passed directly to strftime(3)",
			args: {
				name: "timefmt",
			},
		},
		{
			name: "-x",
			description:
				"Display information in a more verbose way as known from some Linux distributions",
		},
	],
	args: {
		name: "file",
		description: "File(s) to stat",
		isVariadic: true,
		template: "filepaths",
	},
};
export default completionSpec;
