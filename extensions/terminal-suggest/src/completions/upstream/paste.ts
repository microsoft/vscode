const completionSpec: Fig.Spec = {
	name: "paste",
	description:
		"The paste utility concatenates the corresponding lines of the given input files, replacing all but the last file's newline characters with a single tab character, and writes the resulting lines to standard output.  If end-of-file is reached on an input file while other input files still contain data, the file is treated as if it were an endless source of empty lines",
	options: [
		{
			name: "-d",
			description:
				"Use one or more of the provided characters to replace the newline characters instead of the default tab. The characters in list are used circularly, i.e., when list is exhausted the first character from list is reused. This continues until a line from the last input file (in default operation) or the last line in each file (using the -s option) is displayed, at which time paste begins selecting characters from the beginning of list again",
			args: {
				name: "list",
				suggestions: ["\\t\\n", "\\t", "\\n", "\\\\", "\\0"],
				default: "\\n",
			},
		},
		{
			name: "-s",
			description:
				"Concatenate all of the lines of each separate input file in command line order. The newline character of every line except the last line in each input file is replaced with the tab character, unless otherwise specified by the -d option",
		},
	],
	args: {
		name: "file",
		template: "filepaths",
	},
};
export default completionSpec;
