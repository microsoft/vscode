const completionSpec: Fig.Spec = {
	name: "lsblk",
	description: "List block devices",
	options: [
		{
			name: ["--help", "-h"],
			description: "Show help for lsblk",
		},
		{
			name: ["--version", "-V"],
			description: "Show version for lsblk",
		},
		{
			name: ["--all", "-a"],
			description: "Also list empty devices and RAM disk devices",
		},
		{
			name: ["--bytes", "-b"],
			description: "Print the SIZE column in bytes",
		},
		{
			name: ["--discard", "-D"],
			description:
				"Print information about the discarding capabilities (TRIM, UNMAP) for each device",
		},
		{
			name: ["--nodeps", "-d"],
			description: "Do not print holder devices or slaves",
		},
		{
			name: ["--dedup", "-E"],
			description:
				"Use column as a de-duplication key to de-duplicate output tree",
			args: {
				name: "column",
			},
		},
		{
			name: ["--exclude", "-e"],
			description:
				"Exclude the devices specified by the comma-separated list of major device numbers",
			args: {
				name: "list",
			},
		},
		{
			name: ["--fs", "-f"],
			description: "Output info about filesystems",
		},
		{
			name: ["--include", "-I"],
			description:
				"Include devices specified by the comma-separated list of major device numbers",
			args: {
				name: "list",
			},
		},
		{
			name: ["--ascii", "-i"],
			description: "Use ASCII characters for tree formatting",
		},
		{
			name: ["--json", "-J"],
			description: "Use JSON output format",
		},
		{
			name: ["--list", "-l"],
			description: "Produce output in the form of a list",
		},
		{
			name: ["--merge", "-M"],
			description:
				"Group parents of sub-trees to provide more readable output for RAIDs and Multi-path devices",
		},
		{
			name: ["--perms", "-m"],
			description: "Output info about device owner, group and mode",
		},
		{
			name: ["--noheadings", "-n"],
			description: "Do not print a header line",
		},
		{
			name: ["--output", "-o"],
			description: "Specify which output columns to print",
			args: {
				name: "list",
				isVariadic: true,
			},
		},
		{
			name: ["--output-all", "-O"],
			description: "Output all available columns",
		},
		{
			name: ["--pairs", "-P"],
			description: "Produce output in the form of key-value pairs",
		},
		{
			name: ["--raw", "-r"],
			description: "Produce output in raw format",
		},
		{
			name: ["--scsi", "-S"],
			description: "Output info about SCSI devices only",
		},
		{
			name: ["--inverse", "-s"],
			description: "Print dependencies in inverse order",
		},
		{
			name: ["--tree", "-T"],
			description: "Force tree-like output format",
			args: {
				name: "column",
			},
		},
		{
			name: ["--topology", "-t"],
			description: "Output info about block-device topology",
		},
		{
			name: ["--width", "-w"],
			description: "Specifies output width as a number of characters",
			args: {
				name: "number",
			},
		},
		{
			name: ["--sort", "-x"],
			description: "Sort output lines by column",
			args: {
				name: "column",
			},
		},
		{
			name: ["--zoned", "-z"],
			description: "Print the zone model for each device",
		},
		{
			name: "--sysroot",
			description:
				"Gather data for a Linux instance other than the instance from which the lsblk command is issued",
			args: {
				name: "directory",
			},
		},
	],
	args: {
		name: "device",
		description: "Device to list",
		isOptional: true,
	},
};
export default completionSpec;
