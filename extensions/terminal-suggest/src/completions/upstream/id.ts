const exclusiveOptions = ["-A", "-F", "-G", "-M", "-P", "-g", "-p", "-u"];

const completionSpec: Fig.Spec = {
	name: "id",
	description:
		"The id utility displays the user and group names and numeric IDs, of the calling process, to the standard output.  If the real and effective IDs are different, both are displayed, otherwise only the real ID is displayed. If a user (login name or user ID) is specified, the user and group IDs of that user are displayed.  In this case, the real and effective IDs are assumed to be the same",
	options: [
		{
			name: "-A",
			description:
				"Display the process audit user ID and other process audit properties, which requires privilege",
			exclusiveOn: exclusiveOptions,
		},
		{
			name: "-F",
			description: "Display the full name of the user",
			exclusiveOn: exclusiveOptions,
		},
		{
			name: "-G",
			description:
				"Display the different group IDs (effective, real and supplementary) as white-space separated numbers, in no particular order",
			exclusiveOn: exclusiveOptions,
		},
		{
			name: "-M",
			description: "Display the MAC label of the current process",
			exclusiveOn: exclusiveOptions,
		},
		{
			name: "-P",
			description: "Display the id as a password file entry",
			exclusiveOn: exclusiveOptions,
		},
		{
			name: "-g",
			description: "Display the effective group ID as a number",
			exclusiveOn: exclusiveOptions,
		},
		{
			name: "-n",
			description:
				"Display the name of the user or group ID for the -G, -g and -u options instead of the number.  If any of the ID numbers cannot be mapped into names the number will be displayed as usual",
			dependsOn: ["-G", "-g", "-u"],
			exclusiveOn: exclusiveOptions,
		},
		{
			name: "-p",
			description: "Make the output human-readable",
			exclusiveOn: exclusiveOptions,
		},
		{
			name: "-u",
			description: "Display the effective user ID as a number",
			exclusiveOn: exclusiveOptions,
		},
	],
	args: {
		name: "user",
		isOptional: true,
		generators: {
			script: ["bash", "-c", "dscl . -list /Users | grep -v '^_'"],
			postProcess: (out) =>
				out
					.trim()
					.split("\n")
					.map((username) => ({
						name: username,
						icon: "fig://template?badge=👤",
					})),
		},
	},
};
export default completionSpec;
