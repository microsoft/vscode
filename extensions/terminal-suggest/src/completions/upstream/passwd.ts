const generateUsers: Fig.Generator = {
	script: ["bash", "-c", "dscl . -list /Users | grep -E -v '^_'"],
	postProcess: (out) =>
		out
			.trim()
			.split("\n")
			.map((name) => ({ name, icon: "👤" })),
};

const completionSpec: Fig.Spec = {
	name: "passwd",
	description: "Modify a user's password",
	options: [
		{
			name: "-i",
			description: "Specify where the password update should be applied",
			args: {
				name: "infosystem",
				description: "The directory system",
				suggestions: ["PAM", "opendirectory", "file", "nis"],
			},
		},
		{
			name: "-l",
			description:
				"Causes the password to be updated in the given location of the chosen directory system",
			args: {
				name: "location",
				description: "The location of the chosen directory system",
				template: ["filepaths", "folders"],
			},
		},
		{
			name: "-u",
			description:
				"Specify the user name to use when authenticating to the directory node",
			args: {
				name: "authname",
				description: "The user name",
				generators: generateUsers,
			},
		},
	],
};

export default completionSpec;
