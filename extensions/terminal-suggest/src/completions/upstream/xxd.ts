const completionSpec: Fig.Spec = {
	name: "xxd",
	description: "Make a hexdump or do the reverse",
	parserDirectives: {
		flagsArePosixNoncompliant: true,
	},
	options: [
		{
			name: ["-help", "-h"],
			description: "Show help for xxd",
		},
		{
			name: ["-autoskip", "-a"],
			description:
				"Toggle autoskip: A single '*' replaces nul-lines.  Default off",
		},
		{
			name: ["-bits", "-b"],
			description: "Switch to bits (binary digits) dump, rather than hexdump",
			exclusiveOn: ["-postscript", "-plain", "-ps", "-p", "-r", "-i"],
		},
		{
			name: ["-cols", "-c"],
			description: "Format <cols> octets per line. Default 16",
			args: {
				name: "cols",
			},
		},
		{
			name: ["-capitalize", "-C"],
			description:
				"Capitalize variable names in C include file style, when using -i",
		},
		{
			name: ["-EBCDIC", "-E"],
			description:
				"Change the character encoding in the righthand column from ASCII to EBCDIC",
			exclusiveOn: ["-postscript", "-plain", "-ps", "-p", "-r", "-i"],
		},
		{
			name: "-e",
			description: "Switch to little-endian hexdump",
		},
		{
			name: ["-groupsize", "-g"],
			description: "Separate the output of every <bytes> bytes",
			args: {
				name: "bytes",
			},
		},
		{
			name: ["-include", "-i"],
			description: "Output in C include file style",
			exclusiveOn: ["-EBCDIC", "-E", "-bits", "-b"],
		},
		{
			name: ["-len", "-l"],
			description: "Stop after writing <len> octets",
			args: {
				name: "len",
			},
		},
		{
			name: ["-name", "-n"],
			description: "Override the variable name output when -i is used",
			args: {
				name: "name",
			},
		},
		{
			name: "-o",
			description: "Add <offset> to the displayed file position",
			args: {
				name: "offset",
			},
		},
		{
			name: ["-postscript", "-plain", "-ps", "-p"],
			description: "Output in postscript continuous hexdump style",
			exclusiveOn: ["-EBCDIC", "-E", "-bits", "-b"],
		},
		{
			name: ["-revert", "-r"],
			description: "Reverse operation: convert (or patch) hexdump into binary",
			exclusiveOn: ["-EBCDIC", "-E", "-bits", "-b"],
		},
		{
			name: "-seek",
			description:
				"When used after -r: revert with <offset> added to file positions found in hexdump",
			args: {
				name: "offset",
			},
		},
		{
			name: "-u",
			description: "Use upper case hex letters. Default is lower case",
		},
		{
			name: ["-version", "-v"],
			description: "Show version string",
		},
	],
	args: [
		{
			name: "infile",
			template: "filepaths",
		},
		{
			name: "outfile",
			template: "filepaths",
		},
	],
};
export default completionSpec;
