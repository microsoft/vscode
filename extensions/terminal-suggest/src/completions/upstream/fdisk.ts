const completionSpec: Fig.Spec = {
	name: "fdisk",
	description: "Manipulate disk partition table",
	options: [
		{
			name: ["--help", "-h"],
			description: "Show help for fdisk",
		},
		{
			name: ["--version", "-V"],
			description: "Show version for lsblk",
		},
		{
			name: ["--sector-size", "-b"],
			description: "Specify the sector size of the disk",
			args: {
				name: "mode",
				description: "Valid values are 512, 1024, 2048, and 4096",
				suggestions: ["512", "1024", "2048", "4096"],
			},
		},
		{
			name: ["--protect-boot", "-B"],
			description:
				"Don't erase the beginning of the first disk sector when creating a new disk label",
		},
		{
			name: ["--compatibility", "-c"],
			description: "Specify the compatibility mode, 'dos' or 'nondos'",
			args: {
				name: "mode",
				isOptional: true,
				suggestions: ["dos", "nondos"],
			},
		},
		{
			name: ["--color", "-L"],
			description: "Colorize the output",
			args: {
				name: "when",
				isOptional: true,
				suggestions: ["always", "never", "auto"],
			},
		},
		{
			name: ["--list", "-l"],
			description:
				"List the partition tables for the specified devices and then exit",
		},
		{
			name: ["--list-details", "-x"],
			description: "Like --list, but provides more details",
		},
		{
			name: "--lock",
			description: "Use exclusive BSD lock for device or file it operates",
			args: {
				name: "mode",
				description:
					"Optional argument mode can be yes, no (or 1 and 0) or nonblock",
				isOptional: true,
				suggestions: ["yes", "no", "nonblock"],
			},
		},
		{
			name: ["--noauto-pt", "-n"],
			description:
				"Don't automatically create a default partition table on empty device",
		},
		{
			name: ["--output", "-o"],
			description: "Desc",
			args: {
				name: "list",
			},
		},
		{
			name: ["--getsz", "-s"],
			description:
				"Print the size in 512-byte sectors of each given block device. This option is DEPRECATED in favour of blockdev(8)",
			deprecated: {
				description: "This option is DEPRECATED in favour of blockdev(8)",
			},
		},
		{
			name: ["--type", "-t"],
			description:
				"Enable support only for disklabels of the specified type, and disable support for all other types",
			args: {
				name: "type",
			},
		},
		{
			name: ["--units", "-u"],
			description:
				"When listing partition tables, show sizes in 'sectors' or in 'cylinders'",
			args: {
				name: "unit",
				isOptional: true,
				suggestions: ["sectors", "cylinders"],
			},
		},
		{
			name: ["--cylinders", "-C"],
			description: "Specify the number of cylinders of the disk",
			args: {
				name: "number",
			},
		},
		{
			name: ["--heads", "-H"],
			description:
				"Specify the number of heads of the disk. (Not the physical number, of course, but the number used for partition tables.)",
			args: {
				name: "number",
			},
		},
		{
			name: ["--sectors", "-S"],
			description:
				"Specify the number of sectors per track of the disk. (Not the physical number, of course, but the number used for partition tables.)",
		},
		{
			name: ["--wipe", "-w"],
			description:
				"Wipe filesystem, RAID and partition-table signatures from the device, in order to avoid possible collisions",
			args: {
				name: "when",
				description: "The argument when can be auto, never or always",
				suggestions: ["auto", "never", "always"],
			},
		},
		{
			name: ["--wipe-partitions", "-W"],
			description:
				"Wipe filesystem, RAID and partition-table signatures from a newly created partitions, in order to avoid possible collisions",
			args: {
				name: "when",
				description: "The argument when can be auto, never or always",
			},
		},
	],
	args: {
		name: "device",
		description: "Device to list",
		isOptional: true,
		template: "filepaths",
	},
};
export default completionSpec;
