const environmentVariableGenerator: Fig.Generator = {
	custom: async (tokens, _, context) => {
		if (tokens.length < 3 || tokens[tokens.length - 1].startsWith("$")) {
			return Object.keys(context.environmentVariables).map((suggestion) => ({
				name: `$${suggestion}`,
				type: "arg",
				description: "Environment Variable",
			}));
		} else {
			return [];
		}
	},
	trigger: "$",
};

const completionSpec: Fig.Spec = {
	name: "echo",
	description: "Write arguments to the standard output",
	args: {
		name: "string",
		isVariadic: true,
		optionsCanBreakVariadicArg: false,
		suggestCurrentToken: true,
		generators: environmentVariableGenerator,
	},
	options: [
		{
			name: "-n",
			description: "Do not print the trailing newline character",
		},
		{
			name: "-e",
			description: "Interpret escape sequences",
		},
		{
			name: "-E",
			description: "Disable escape sequences",
		},
	],
};

export default completionSpec;
