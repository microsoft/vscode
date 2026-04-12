function toTitleCase(str: string): string {
	return str
		.trim()
		.replace(
			/\w\S*/g,
			(txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
		);
}

const suggestions: Fig.Suggestion[] = [
	{
		name: "doctor",
		description: "Running sanity checks on your system",
		icon: "fig://icon?type=alert",
	},
	{
		name: "completion",
		description: "To enable shell completion for the yo command",
		icon: "fig://icon?type=asterisk",
	},
];

// GENERATORS
const yeomanGeneratorList: Fig.Generator = {
	script: ["yo", "--generators"],
	postProcess: function (out) {
		try {
			return out
				.split("\n")
				.filter((item) => item.trim() && item !== "Available Generators:")
				.map(
					(item) =>
						({
							name: item.trim(),
							icon: undefined,
							displayName: toTitleCase(item),
							description: `${toTitleCase(item)} Generator`,
							priority: 100,
							options: [
								{
									name: "--help",
									description: `Help of "${toTitleCase(item)}" generator`,
								},
							],
						}) as Fig.Suggestion
				) as Fig.Suggestion[];
		} catch (e) {
			console.error(e);
			return [];
		}
	},
};

const completionSpec: Fig.Spec = {
	name: "yo",
	description: "Yeoman generator",
	args: {
		name: "generator",
		generators: yeomanGeneratorList,
		suggestions: [...suggestions],
		isCommand: true,
		isOptional: true,
	},
	options: [
		{
			name: "--help",
			description: "Print info and generator's options and usage",
		},
		{
			name: ["-f", "--force"],
			description: "Overwrite files that already exist",
			isDangerous: true,
		},
		{
			name: "--version",
			description: "Print version",
		},
		{
			name: "--no-color",
			description: "Disable color",
		},
		{
			name: "--insight",
			description: "Enable anonymous tracking",
		},
		{
			name: "--no-insight",
			description: "Disable anonymous tracking",
		},
		{
			name: "--generators",
			description: "Print available generators",
		},
		{
			name: "--local-only",
			description: "Disable lookup of globally-installed generators",
		},
	],
};

export default completionSpec;
