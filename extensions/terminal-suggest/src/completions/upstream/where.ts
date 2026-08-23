const completionSpec: Fig.Spec = {
	name: "where",
	description: "For each name, indicate how it should be interpreted",
	args: {
		name: "names",
		isVariadic: true,
	},
	options: [
		{
			name: "-w",
			description:
				"For each name, print 'name: word', where 'word' is the kind of command",
		},
		{
			name: "-p",
			description:
				"Do a path search for the name, even if it's an alias/function/builtin",
		},
		{
			name: "-m",
			description:
				"The arguments are taken as patterns (pattern characters must be quoted)",
		},
		{
			name: "-s",
			description:
				"If the pathname contains symlinks, print the symlink-free name as well",
		},
		{
			name: "-S",
			description: "Print intermediate symlinks and the resolved name",
		},
		{
			name: "-x",
			description: "Expand tabs when outputting shell function",
			args: { name: "num" },
		},
	],
};

export default completionSpec;
