const completionSpec: Fig.Spec = {
	name: "readlink",
	description: "Display file status",
	options: [
		{
			name: "-f",
			description:
				"Display information using the specified format; similar to printf(3) formats in that they start with %, are then followed by a sequence of formatting characters, and end in a character that selects the field of the struct stat which is to be formatted",
			args: {
				name: "format",
			},
		},
		{
			name: "-n",
			description:
				"Do not force a newline to appear at the end of each piece of output",
		},
	],
	args: {
		name: "file",
		description: "File(s) to readlink",
		isVariadic: true,
		template: "filepaths",
	},
};
export default completionSpec;
