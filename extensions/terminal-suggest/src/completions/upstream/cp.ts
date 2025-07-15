const completionSpec: Fig.Spec = {
	name: "cp",
	description: "Copy files and directories",
	args: [
		{
			name: "source",
			template: ["filepaths", "folders"],
			isVariadic: true,
		},
		{
			name: "target",
			template: ["filepaths", "folders"],
		},
	],
	options: [
		{
			name: "-a",
			description:
				"Preserves structure and attributes of files but not directory structure",
		},
		{
			name: "-f",
			description:
				"If the destination file cannot be opened, remove it and create a new file, without prompting for confirmation",
			exclusiveOn: ["-n"],
		},
		{
			name: "-H",
			description:
				"If the -R option is specified, symbolic links on the command line are followed",
			exclusiveOn: ["-L", "-P"],
			dependsOn: ["-R"],
		},
		{
			name: "-i",
			description:
				"Cause cp to write a prompt to the standard error output before copying a file that would overwrite an existing file",
			exclusiveOn: ["-n"],
		},
		{
			name: "-L",
			description:
				"If the -R option is specified, all symbolic links are followed",
			exclusiveOn: ["-H", "-P"],
			dependsOn: ["-R"],
		},
		{
			name: "-n",
			description: "Do not overwrite an existing file",
			exclusiveOn: ["-f", "-i"],
		},
		{
			name: "-P",
			description:
				"If the -R option is specified, no symbolic links are followed",
			exclusiveOn: ["-H", "-L"],
			dependsOn: ["-R"],
		},
		{
			name: "-R",
			description:
				"If source designates a directory, cp copies the directory and the entire subtree connected at that point. If source ends in a /, the contents of the directory are copied rather than the directory itself",
		},
		{
			name: "-v",
			description: "Cause cp to be verbose, showing files as they are copied",
		},
		{
			name: "-X",
			description: "Do not copy Extended Attributes (EAs) or resource forks",
		},
		{
			name: "-c",
			description: "Copy files using clonefile",
		},
	],
};

export default completionSpec;
