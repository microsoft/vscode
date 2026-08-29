const completionSpec: Fig.Spec = {
	name: "uniq",
	description: "Report or omit repeated line",
	options: [
		{
			name: ["-c", "--count"],
			description: "Prefix lines by the number of occurrences",
		},
		{
			name: ["-d", "--repeated"],
			description: "Only print duplicate lines",
		},
		{
			name: ["-D", "--all-repeated"],
			description:
				"Print all duplicate lines. Delimiting is done with blank lines",
			args: {
				name: "delimit-method",
				default: "none",
				isOptional: true,
				suggestions: ["none", "prepend", "separate"],
			},
		},
		{
			name: ["-f", "--skip-fields"],
			description: "Avoid comparing the first N fields",
			args: {
				name: "number",
			},
		},
		{
			name: ["-i", "--ignore-case"],
			description: "Ignore differences in case when comparing",
		},
		{
			name: ["-s", "--skip-chars"],
			description: "Avoid comparing the first N characters",
			args: {
				name: "number",
			},
		},
		{
			name: ["-u", "--unique"],
			description: "Only print unique lines",
		},
		{
			name: ["-z", "--zero-terminated"],
			description: "End lines with 0 byte, not newline",
		},
		{
			name: ["-w", "--check-chars"],
			description: "Compare no more than N characters in lines",
			args: {
				name: "number",
			},
		},
		{
			name: "--help",
			description: "Display this help and exit",
		},
		{
			name: "--version",
			description: "Output version information and exit",
		},
	],
	args: [
		{
			name: "input",
			isOptional: true,
			template: ["filepaths", "folders"],
		},
		{
			name: "output",
			isOptional: true,
		},
	],
};

export default completionSpec;
