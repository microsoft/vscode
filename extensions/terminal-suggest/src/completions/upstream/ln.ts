const sourceDestArgs: Fig.Arg[] = [
	{
		name: "source_file",
		template: ["filepaths", "folders"],
		// isVariadic: true,
		// source_file is variadic but usability wise having it is less useful
		// because it keeps recommending "source_file" repeatedly and not "link_name or link_dirname"
		// and since most people won't need multiple files and those who do can look it up
	},
	{
		name: "link_name or link_dirname",
		isOptional: true,
	},
];

const completionSpec: Fig.Spec = {
	name: "ln",
	description: "Create (default hard) symbolic links to files",
	args: sourceDestArgs,
	options: [
		{
			name: "-s",
			description: "Create a symbolic link",
			args: sourceDestArgs,
		},
		{
			name: "-v",
			description: "Verbose",
		},
		{
			name: "-F",
			description: "If link name already exists replace it",
			args: sourceDestArgs,
		},
		{
			name: "-h",
			description: "Don't follow symbolic links",
		},
		{
			name: "-f",
			description:
				"If link name already exists unlink the old one before creating the new one",
			args: sourceDestArgs,
		},
		{
			name: "-i",
			description: "Prompt if proposed link already exists",
			args: sourceDestArgs,
		},
		{
			name: "-n",
			description: "Same as -h don't follow symbolic links",
		},
	],
};

export default completionSpec;
