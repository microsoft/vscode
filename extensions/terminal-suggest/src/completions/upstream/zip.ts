const completionSpec: Fig.Spec = {
	name: "zip",
	description: "Package and compress (archive) files into zip file",
	args: [
		{
			name: "name",
			description: "Name of archive",
		},
		{
			name: "dir",
			template: "folders",
		},
	],
	options: [
		{
			name: "-r",
			description:
				"Package and compress a directory and its contents, recursively",
		},
		{
			name: "-e",
		},
		{
			name: "-s",
			args: {
				name: "split size",
			},
		},
		{
			name: "-d",
			args: {
				name: "file",
				template: "filepaths",
			},
		},
		{
			name: "-9",
			description:
				"Archive a directory and its contents with the highest level [9] of compression",
		},
	],
};

export default completionSpec;
