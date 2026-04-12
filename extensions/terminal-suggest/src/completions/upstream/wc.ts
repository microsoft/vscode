const completionSpec: Fig.Spec = {
	name: "wc",
	description: "World, line, character, and byte count",
	options: [
		{
			name: "-c",
			description: "Output the number of bytes to the standard input",
		},
		{
			name: "-l",
			description: "Output the number of lines to the standard input",
		},
		{
			name: "-m",
			description: "Output the number of characters to the standard input",
		},
		{
			name: "-w",
			description: "Output the number of words to the standard input",
		},
	],
	args: {
		name: "file",
		description: "File to count in",
		template: "filepaths",
		isOptional: true,
		isVariadic: true,
	},
};

export default completionSpec;
