const completionSpec: Fig.Spec = {
	name: "fmt",
	description: "Simple text formatter",
	parserDirectives: {
		optionsMustPrecedeArguments: true,
	},
	options: [
		{
			name: "-c",
			description: `Center the text, line by line.  In this case, most of the other
options are ignored; no splitting or joining of lines is done`,
		},
		{
			name: "-m",
			description: `Try to format mail header lines contained in the input
sensibly`,
		},
		{
			name: "-n",
			description: `Format lines beginning with a ‘.’ (dot) character`,
		},
		{
			name: "-p",
			description: `Allow indented paragraphs.  Without the -p flag, any change in
the amount of whitespace at the start of a line results in a
new paragraph being begun`,
		},
		{
			name: "-s",
			description: `Collapse whitespace inside lines, so that multiple whitespace
characters are turned into a single space.  (Or, at the end of
a sentence, a double space.)`,
		},
		{
			name: "-d",
			description: `Treat the chars (and no others) as sentence-ending characters.
By default the sentence-ending characters are full stop (‘.’),
question mark (‘?’) and exclamation mark (‘!’).  Remember that
some characters may need to be escaped to protect them from
your shell`,
			args: {
				name: "chars",
				suggestions: [".", "?", "!"],
				default: ".",
			},
		},
		{
			name: "-l",
			description: `Replace multiple spaces with tabs at the start of each output
line, if possible.  Each number spaces will be replaced with
one tab.  The default is 8.  If number is 0, spaces are
preserved`,
			args: {
				name: "number",
				suggestions: ["8"],
				default: "8",
			},
		},
		{
			name: "-t",
			description: `Assume that the input files' tabs assume number spaces per tab
stop.  The default is 8`,
			args: {
				name: "number",
				suggestions: ["8"],
				default: "8",
			},
		},
	],
	args: {
		name: "file",
		description: "File(s) to format",
		isOptional: true,
		isVariadic: true,
		template: "filepaths",
	},
};
export default completionSpec;
