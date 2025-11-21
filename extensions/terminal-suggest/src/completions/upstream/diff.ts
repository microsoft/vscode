// https://www.gnu.org/software/diffutils
const groupFormatOptions = (names: string[]) =>
	names.map<Fig.Option>((name) => ({
		name: `--${name}-group-format`,
		description: `Similar, but format ${name} input groups with GFTM`,
		args: {
			name: "GFTM",
			description: `%<  lines from FILE1
%>  lines from FILE2
%=  lines common to FILE1 and FILE2
%[-][WIDTH][.[PREC]]{doxX}LETTER  printf-style spec for LETTER
LETTERs are as follows for new group, lower case for old group:
F  first line number
L  last line number
N  number of lines = L-F+1
E  F-1
M  L+1
%%  %
%c'C'  the single character C
%c'\OOO'  the character with octal code OOO`,
		},
	}));

const lineFormatOptions = (names: string[]) =>
	names.map<Fig.Option>((name) => ({
		name: `--${name}-line-format`,
		description: `Format ${name} input lines with LFTM`,
		args: {
			name: "LFTM",
			description: `%L  contents of line
%l  contents of line, excluding any trailing newline
%[-][WIDTH][.[PREC]]{doxX}n  printf-style spec for input line number
%%  %
%c'C'  the single character C
%c'\OOO'  the character with octal code OOO`,
		},
	}));

const completionSpec: Fig.Spec = {
	name: "diff",
	description: "Compare files line by line",
	args: {
		name: "file",
		isVariadic: true,
		template: "filepaths",
	},
	options: [
		{
			name: ["-i", "--ignore-case"],
			description: "Ignore case differences in file contents",
		},
		{
			name: "--ignore-file-name-case",
			description: "Ignore case when comparing file names",
			exclusiveOn: ["--no-ignore-file-name-case"],
		},
		{
			name: "--no-ignore-file-name-case",
			description: "Consider case when comparing file names",
			exclusiveOn: ["--ignore-file-name-case"],
		},
		{
			name: ["-E", "--ignore-tab-expansion"],
			description: "Ignore changes due to tab expansion",
		},
		{
			name: ["-b", "--ignore-space-change"],
			description: "Ignore changes in the amount of white space",
		},
		{
			name: ["-w", "--ignore-all-space"],
			description: "Ignore all white space",
		},
		{
			name: ["-B", "--ignore-blank-lines"],
			description: "Ignore changes whose lines are all blank",
		},
		{
			name: ["-I", "--ignore-matching-lines"],
			description: "Ignore changes whose lines all match RE",
			args: {
				name: "RE",
			},
		},
		{
			name: "--strip-trailing-cr",
			description: "Strip trailing carriage return on input",
		},
		{ name: ["-a", "--text"], description: "Treat all files as text" },
		{
			name: ["-c", "-C", "--context"],
			description: "Output NUM lines of copied context",
			args: { name: "NUM", default: "3" },
		},
		{
			name: ["-u", "-U", "--unified"],
			description: "Output NUM lines of unified context",
			args: { name: "NUM", default: "3" },
		},
		{
			name: "--label",
			description: "Use LABEL instead of file name",
			args: { name: "LABEL" },
		},
		{
			name: ["-p", "--show-c-function"],
			description: "Show which C function each change is in",
		},
		{
			name: ["-F", "--show-function-line"],
			description: "Show the most recent line matching RE",
			args: { name: "RE" },
		},
		{
			name: ["-q", "--brief"],
			description: "Output only whether files differ",
		},
		{ name: ["-e", "--ed"], description: "Output an ed script" },
		{ name: "--normal", description: "Output a normal diff" },
		{ name: ["-n", "--rcs"], description: "Output an RCS format diff" },
		{ name: ["-y", "--side-by-side"], description: "Output in two columns" },
		{
			name: ["-W", "--width"],
			description: "Output at most NUM (default 130) print columns",
			args: { name: "NUM" },
		},
		{
			name: "--left-column",
			description: "Output only the left column of common lines",
		},
		{
			name: "--suppress-common-lines",
			description: "Do not output common lines",
		},
		{
			name: ["-D", "--ifdef"],
			description: "Output merged file to show `#ifdef NAME' diffs",
			args: { name: "NAME" },
		},
		{
			name: ["-l", "--paginate"],
			description: "Pass the output through `pr' to paginate it",
		},
		{
			name: ["-t", "--expand-tabs"],
			description: "Expand tabs to spaces in output",
		},
		{
			name: ["-T", "--initial-tab"],
			description: "Make tabs line up by prepending a tab",
		},
		{
			name: ["-r", "--recursive"],
			description: "Recursively compare any subdirectories found",
		},
		{ name: ["-N", "--new-file"], description: "Treat absent files as empty" },
		{
			name: "--unidirectional-new-file",
			description: "Treat absent first files as empty",
		},
		{
			name: ["-s", "--report-identical-files"],
			description: "Report when two files are the same",
		},
		{
			name: ["-x", "--exclude"],
			description: "Exclude files that match PAT",
			args: { name: "PAT" },
		},
		{
			name: ["-X", "--exclude-from"],
			description: "Exclude files that match any pattern in FILE",
			args: { name: "FILE", template: "filepaths" },
		},
		{
			name: ["-S", "--starting-file"],
			description: "Start with FILE when comparing directories",
			args: { name: "FILE", template: "filepaths" },
		},
		{
			name: "--from-file",
			description: "Compare FILE1 to all operands. FILE1 can be a directory",
			args: { name: "FILE1", template: ["filepaths", "folders"] },
		},
		{
			name: "--to-file",
			description: "Compare all operands to FILE2. FILE2 can be a directory",
			args: { name: "FILE2", template: ["filepaths", "folders"] },
		},
		{
			name: "--horizon-lines",
			description: "Keep NUM lines of the common prefix and suffix",
			args: { name: "NUM" },
		},
		{
			name: ["-d", "--minimal"],
			description: "Try hard to find a smaller set of changes",
		},
		{
			name: "--speed-large-files",
			description: "Assume large files and many scattered small changes",
		},
		{ name: ["-v", "--version"], description: "Output version info" },
		{ name: "--help", description: "Show help" },

		...groupFormatOptions(["old", "new", "unchanged", "changed"]),
		{
			name: "--line-format",
			description: "Format all input lines with LFMT",
			args: { name: "LFTM" },
		},
		...lineFormatOptions(["old", "new", "unchanged"]),
	],
};

export default completionSpec;
