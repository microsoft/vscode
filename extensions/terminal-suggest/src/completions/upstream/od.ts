const completionSpec: Fig.Spec = {
	name: "od",
	description: "Octal, decimal, hex, ASCII dump",
	parserDirectives: {
		optionsMustPrecedeArguments: true,
	},
	options: [
		{
			name: "-A",
			description: `Specify the input address base.  The argument base may be
one of d, o, x or n, which specify decimal, octal,
hexadecimal addresses or no address, respectively`,
			args: {
				name: "base",
				suggestions: ["d", "o", "x", "n"],
				default: "d",
			},
		},
		{
			name: "-a",
			description: "Output named characters.  Equivalent to -t a",
		},
		{
			name: ["-B", "-o"],
			description: "Output octal shorts.  Equivalent to -t o2",
		},
		{
			name: "-b",
			description: "Output octal bytes.  Equivalent to -t o1",
		},
		{
			name: "-c",
			description: "Output C-style escaped characters.  Equivalent to -t c",
		},
		{
			name: "-D",
			description: "Output unsigned decimal ints.  Equivalent to -t u4",
		},
		{
			name: "-d",
			description: "Output unsigned decimal shorts.  Equivalent to -t u2",
		},
		{
			name: ["-e", "-F"],
			description:
				"Output double-precision floating point numbers.  Equivalent to -t fD",
		},
		{
			name: "-f",
			description:
				"Output single-precision floating point numbers.  Equivalent to -t fF",
		},
		{
			name: ["-H", "-X"],
			description: "Output hexadecimal ints.  Equivalent to -t x4",
		},
		{
			name: ["-h", "-x"],
			description: "Output hexadecimal shorts.  Equivalent to -t x2",
		},
		{
			name: ["-I", "-L", "-l"],
			description: "Output signed decimal longs.  Equivalent to -t dL",
		},
		{
			name: "-i",
			description: "Output signed decimal ints.  Equivalent to -t dI",
		},
		{
			name: "-j",
			description: `Skip skip bytes of the combined input before dumping.  The
number may be followed by one of b, k, m or g which
specify the units of the number as blocks (512 bytes),
kilobytes, megabytes and gigabytes, respectively`,
			args: {
				name: "skip",
			},
		},
		{
			name: "-N",
			description: "Dump at most length bytes of input",
			args: {
				name: "length",
			},
		},
		{
			name: "-O",
			description: "Output octal ints.  Equivalent to -t o4",
		},
		{
			name: "-s",
			description: "Output signed decimal shorts.  Equivalent to -t d2",
		},
		{
			name: "-t",
			description: `Specify the output format.  The type argument is a string
containing one or more of the following kinds of type specificers: a,
c, [d|o|u|x][C|S|I|L|n], or f[F|D|L|n]. See the man page for meanings`,
			args: {
				name: "type",
				suggestions: [
					"a",
					"c",
					"dC",
					"dS",
					"dI",
					"dL",
					"dn",
					"oC",
					"oS",
					"oI",
					"oL",
					"on",
					"uC",
					"uS",
					"uI",
					"uL",
					"un",
					"xC",
					"xS",
					"xI",
					"xL",
					"xn",
					"fF",
					"fD",
					"fL",
					"fn",
				],
			},
		},
		{
			name: "-v",
			description:
				"Write all input data, instead of replacing lines of duplicate values with a '*'",
		},
	],
	args: [
		{
			name: "[+]offset[.][Bb]",
			description: "Offset",
			suggestions: ["+0b"],
			default: "+0b",
			isOptional: true,
		},
		{
			name: "file",
			description: "File name",
			template: "filepaths",
			isOptional: true,
			isVariadic: true,
		},
	],
};
export default completionSpec;
