const labelArg: Fig.Arg = {
	name: "label",
	isOptional: true,
};

const textArg: Fig.Arg = {
	name: "text",
};

const filenameArg: Fig.Arg = {
	name: "filename",
	template: "filepaths",
};

const completionSpec: Fig.Spec = {
	name: "sed",
	description: "Stream editor",
	subcommands: [
		{
			name: "a",
			description: "Appends `text` after a line",
			args: textArg,
		},
		{
			name: "b",
			description: "Branch unconditionally to `label`",
			args: labelArg,
		},
		{
			name: "c",
			description: "Replace (change) lines with `text`",
			args: textArg,
		},
		{
			name: "d",
			description: "Delete the pattern space; immediately start next cycle",
		},
		{
			name: "D",
			description:
				"If pattern space contains newlines, delete text in the pattern space up to the first newline, and restart cycle with the resultant pattern space, without reading a new line of input. If pattern space contains no newline, start a normal new cycle as if the d command was issued",
		},
		{
			name: "e",
			description:
				"Executes the command that is found in pattern space and replaces the pattern space with the output; a trailing newline is suppressed",
			args: {
				name: "command",
				isCommand: true,
				isOptional: true,
			},
		},
		{
			name: "F",
			description: "Prints the file name of the current input file",
		},
		{
			name: "g",
			description:
				"Replaces the contents of the pattern space with the contents of the hold space",
		},
		{
			name: "G",
			description:
				"Appends a newline to the contents of the pattern space, and then appends the contents of the hold space to that of the pattern space",
		},
		{
			name: "h",
			description:
				"Replaces the contents of the hold space with the contents of the pattern space",
		},
		{
			name: "H",
			description:
				"Appends a newline to the contents of the hold space, and then appends the contents of the pattern space to that of the hold space",
		},
		{
			name: "i",
			description: "Insert text before a line",
			args: textArg,
		},
		{
			name: "l",
			description: "Prints the pattern space in an unambiguous form",
		},
		{
			name: "n",
			description:
				"Prints the pattern space, then, regardless, replaces the pattern space with the next line of input. If there is no more input then sed exits without processing any more commands",
		},
		{
			name: "N",
			description:
				"Adds a newline to the pattern space, then appends the next line of input to the pattern space. If there is no more input then sed exits without processing any more commands",
		},
		{
			name: "p",
			description: "Prints the pattern space",
		},
		{
			name: "P",
			description: "Prints the pattern space up to the first newline",
		},
		{
			name: "q",
			description: "Exit sed without processing any more commands or input",
			args: {
				name: "Exit Code",
				isOptional: true,
			},
		},
		{
			name: "Q",
			description:
				"This command is the same as q, but will not print the contents of pattern space",
			args: {
				name: "Exit Code",
				isOptional: true,
			},
		},
		{
			name: "r",
			description: "Reads file",
			args: filenameArg,
		},
		{
			name: "R",
			description:
				"Queue a line of filename to be read and inserted into the output stream at the end of the current cycle, or when the next input line is read",
			args: filenameArg,
		},
		{
			name: ["s", "regexp", "replacement"],
			description:
				"Match the regular-expression against the content of the pattern space. If found, replace matched string with replacement",
		},
		{
			name: "t",
			description:
				"(test) Branch to label only if there has been a successful substitution since the last input line was read or conditional branch was taken. The label may be omitted, in which case the next cycle is started",
			args: labelArg,
		},
		{
			name: "T",
			description:
				"(test) Branch to label only if there have been no successful substitutions since the last input line was read or conditional branch was taken. The label may be omitted, in which case the next cycle is started",
			args: labelArg,
		},
		{
			name: "v",
			description:
				"Makes sed fail if GNU sed extensions are not supported, or if the requested version is not available",
			args: {
				name: "version",
				isOptional: true,
			},
		},
		{
			name: "w",
			description: "Writes the pattern space to the file",
			args: filenameArg,
		},
		{
			name: "W",
			description:
				"Writes to the given filename the portion of the pattern space up to the first newline",
			args: filenameArg,
		},
		{
			name: "x",
			description: "Exchanges the contents of the hold and pattern spaces",
		},
		{
			name: ["y", "src", "dst"],
			description:
				"Transliterate any characters in the pattern space which match any of the source-chars with the corresponding character in dest-chars",
		},
		{
			name: "z",
			description: "(zap) Empties the content of pattern space",
		},
		{
			name: "#",
			description: "Comment until the next newline",
		},
	],
	options: [
		{
			name: "-E",
			description:
				"Interprets regular expressions as extended (modern) regular expressions rather than basic regular expressions",
		},
		{
			name: "-a",
			description:
				"Causes sed to delay opening each file until a command containing the related ``w'' function is applied to a line of input",
		},
		{
			name: "-e",
			description:
				"Appends the editing commands specified by the command argument to the list of commands",
			args: {
				name: "command",
			},
		},
		{
			name: "-f",
			description:
				"Appends the editing commands found in the file command_file to the list of commands. The editing commands should each be listed on a separate line",
			args: {
				name: "command_file",
				template: "filepaths",
			},
		},
		{
			name: "-I",
			description:
				"Edits files in-place, saving backups with the specified extension.  If a zero-length extension is given, no backup will be saved",
			args: {
				name: "extension",
			},
		},
		{
			name: "-i",
			description:
				"Edits files in-place similarly to `-I`, but treats each file independently from other files.  In particular, line numbers in each file start at 1, the ``$'' address matches the last line of the current file, and address ranges are limited to the current file",
			args: {
				name: "extension",
			},
		},
		{
			name: "-l",
			description: "Makes output line buffered",
		},
		{
			name: "-n",
			description:
				"By default, each line of input is echoed to the standard output after all of the commands have been applied to it.  The `-n` option suppresses this behavior",
		},
		{
			name: "-r",
			description: "Same as `-E` for compatibility with GNU sed",
		},
		{
			name: "-u",
			description: "Makes output unbuffered",
		},
	],
	args: [
		{
			name: "command",
		},
		{
			name: "file",
			template: "filepaths",
			isVariadic: true,
			isOptional: true,
		},
	],
};

export default completionSpec;
