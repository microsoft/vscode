const completionSpec: Fig.Spec = {
	name: "htop",
	description: "Improved top (interactive process viewer)",
	options: [
		{
			name: ["--help", "-h"],
			description: "Show help for htop",
		},
		{
			name: ["--no-color", "-C"],
			description: "Use a monochrome color scheme",
		},
		{
			name: ["--delay", "-d"],
			description: "Delay between updates, in tenths of sec",
			args: {
				name: "delay",
				suggestions: ["10", "1", "60"],
			},
		},
		{
			name: ["--filter", "-F"],
			description: "Filter commands",
			args: {
				name: "filter",
			},
		},
		{
			name: ["--highlight-changes", "-H"],
			description: "Highlight new and old processes",
			args: {
				name: "delay",
				description: "Delay between updates of highlights, in tenths of sec",
				suggestions: ["10", "1", "60"],
				isOptional: true,
			},
		},
		{
			name: ["--no-mouse", "-M"],
			description: "Disable the mouse",
		},
		{
			name: ["--pid", "-p"],
			description: "Show only the given PIDs",
			args: {
				name: "PID",
				isVariadic: true,
			},
		},
		{
			name: ["--sort-key", "-s"],
			description: "Sort by COLUMN in list view",
			args: {
				name: "column",
			},
		},
		{
			name: ["--tree", "-t"],
			description: "Show the tree view",
		},
		{
			name: ["--user", "-u"],
			description: "Show only processes for a given user (or $USER)",
			args: {
				name: "user",
				isOptional: true,
				suggestions: ["$USER"],
			},
		},
		{
			name: ["--no-unicode", "-U"],
			description: "Do not use unicode but plain ASCII",
		},
		{
			name: ["--version", "-V"],
			description: "Print version info",
		},
	],
};
export default completionSpec;
