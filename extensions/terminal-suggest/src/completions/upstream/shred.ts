const completionSpec: Fig.Spec = {
	name: "shred",
	description:
		"Overwrite a file to hide its contents, and optionally delete it",
	options: [
		{
			name: ["--force", "-f"],
			description: "Change permissions to allow writing if necessary",
		},
		{
			name: ["--iterations", "-n"],
			description: "Overwrite N times instead of the default (3)",
			args: {
				name: "N",
				suggestions: ["3", "5", "7"],
				default: "3",
			},
		},
		{
			name: "--random-source",
			description: "Get random bytes from FILE",
			args: {
				name: "FILE",
				suggestions: ["/dev/urandom", "/dev/random"],
				default: "/dev/urandom",
				template: "filepaths",
			},
		},
		{
			name: ["--size", "-s"],
			description: "Shred this many bytes (suffixes like K, M, G accepted)",
			args: {
				name: "N",
				suggestions: ["1K", "1M", "1G"],
			},
		},
		{
			name: "--remove",
			description: "Like -u but give control on HOW to delete",
			args: {
				name: "HOW",
				description:
					"'unlink' => use a standard unlink call, 'wipe' => also first obfuscate bytes in the name, 'wipesync' => also sync each obfuscated byte to the device",
				suggestions: ["unlink", "wipe", "wipesync"],
				default: "wipesync",
			},
		},
		{
			name: ["--verbose", "-v"],
			description: "Show progress",
		},
		{
			name: ["--exact", "-x"],
			description:
				"Do not round file sizes up to the next full block; this is the default for non-regular files",
		},
		{
			name: ["--zero", "-z"],
			description: "Add a final overwrite with zeros to hide shredding",
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
	args: {
		name: "FILE",
		description: "File(s) to shred",
		isVariadic: true,
		template: "filepaths",
	},
};
export default completionSpec;
