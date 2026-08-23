const completionSpec: Fig.Spec = {
	name: "truncate",
	description: "Shrink or extend the size of a file to the specified size",
	options: [
		{
			name: ["--no-create", "-c"],
			description: "Do not create any files",
		},
		{
			name: ["--io-blocks", "-o"],
			description: "Treat SIZE as number of IO blocks instead of bytes",
		},
		{
			name: ["--reference", "-r"],
			description: "Base size on RFILE",
			args: {
				name: "RFILE",
			},
		},
		{
			name: ["--size", "-s"],
			description: "Set or adjust the file size by SIZE bytes",
			args: {
				name: "SIZE",
				description:
					"The SIZE argument is an integer and optional unit; units are K,M,G,T,P,E,Z,Y (powers of 1024) or KB,MB,... (powers of 1000). Binary prefixes can be used, too: KiB=K, MiB=M, and so on",
			},
		},
		{
			name: "--help",
			description: "Show help for truncate",
		},
		{
			name: "--version",
			description: "Output version information and exit",
		},
	],
	args: {
		name: "FILE",
		isVariadic: true,
		template: "filepaths",
	},
};
export default completionSpec;
