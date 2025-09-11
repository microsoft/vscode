const completionSpec: Fig.Spec = {
	name: "basename",
	description: "Return filename portion of pathname",
	options: [
		{
			name: "-a",
			description: "Treat every argument as a string",
		},
		{
			name: "-s",
			description: "Suffix to remove from string",
			args: {
				name: "suffix",
			},
		},
	],
	args: {
		name: "string",
		description: "String to operate on (typically filenames)",
		isVariadic: true,
		template: "filepaths",
	},
};
export default completionSpec;
