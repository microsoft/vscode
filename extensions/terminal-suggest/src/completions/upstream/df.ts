const completionSpec: Fig.Spec = {
	name: "df",
	description: "Display free disk space",
	args: {
		name: "file or filesystem",
	},
	options: [
		{
			name: "-a",
			description: "Show all mount points",
		},
		{
			name: ["-b", "-P"],
			description: "Use 512-byte blocks (default)",
			exclusiveOn: ["-g", "-k", "-m"],
		},
		{
			name: "-g",
			description: "Use 1073741824-byte (1-Gbyte) blocks",
			exclusiveOn: ["-b", "-P", "-m", "-k"],
		},
		{
			name: "-m",
			description: "Use 1048576-byte (1-Mbyte) blocks",
			exclusiveOn: ["-b", "-P", "-g", "-k"],
		},
		{
			name: "-k",
			description: "Use 1024-byte (1-Kbyte) blocks",
			exclusiveOn: ["-b", "-P", "-g", "-m"],
		},
		{
			name: "-H",
			description: '"Human-readable" output, uses base 10 unit suffixes',
			exclusiveOn: ["-h"],
		},
		{
			name: "-h",
			description: '"Human-readable" output, uses base 2 unit suffixes',
			exclusiveOn: ["-H"],
		},
		{
			name: "-i",
			description: "Include the number of free inodes",
		},
		{
			name: "-l",
			description: "Only display information about locally-mounted filesystems",
		},
		{
			name: "-n",
			description: "Print out the previously obtained statistics",
		},
		{
			name: "-T",
			description:
				"Only print out statistics for filesystems of the specified types (comma separated)",
			args: {
				name: "filesystem",
			},
		},
	],
};

export default completionSpec;
