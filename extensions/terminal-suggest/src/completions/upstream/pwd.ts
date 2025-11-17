const completionSpec: Fig.Spec = {
	name: "pwd",
	description: "Return working directory name",
	options: [
		{
			name: "-L",
			description: "Display the logical current working directory",
		},
		{
			name: "-P",
			description: "Display the physical current working directory",
		},
	],
};

export default completionSpec;
