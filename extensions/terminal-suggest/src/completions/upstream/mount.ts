const completionSpec: Fig.Spec = {
	name: "mount",
	description: "Mount disks and manage subtrees",
	args: [
		{
			name: "Disk/loopfile",
			template: "filepaths",
			generators: [
				{
					script: ["cat", "/proc/partitions"], // this way we don't depend on lsblk
					postProcess: (out) => {
						return out
							.trim()
							.split("\n")
							.splice(2, out.length)
							.map((line) => "/dev/" + line.split(" ").pop())
							.filter((x) => x != "/dev/")
							.map((blk) => {
								return { name: blk, description: "Block device" };
							});
					},
				},
				{
					script: ["ls", "-1", "/dev/mapper"], // usually LUKS encrypted partitions are here
					postProcess: (out) => {
						return out
							.trim()
							.split("\n")
							.filter((x) => x.length != 0)
							.map((blk) => {
								return {
									name: "/dev/mapper/" + blk,
									description: "Mapped block device",
								};
							});
					},
				},
			],
		},
		{
			name: "mountpoint",
			template: "folders",
			suggestions: ["/mnt", "/run/media/"],
		},
	],
	options: [
		{
			name: ["-h", "--help"],
			description: "Help for abc",
		},
		{
			name: ["-a", "--all"],
			description: "Mount all filesystems in fstab",
		},
		{
			name: ["-c", "--no-canonicalize"],
			description: "Don't canonicalize paths",
		},
		{
			name: ["-f", "--fake"],
			description: "Dry run; skip the mount(2) syscall",
		},
		{
			name: ["-F", "--fork"],
			description: "Fork off for each device (use with -a)",
		},
		{
			name: ["-T", "--fstab"],
			description: "Alternative file to /etc/fstab",
			args: {
				name: "fstab",
				template: "filepaths",
				default: "/etc/fstab",
			},
		},
		{
			name: ["-i", "--internal-only"],
			description: "Don't call the mount.<type> helpers",
		},
		{
			name: ["-l", "--show-labels"],
			description: "Show also filesystem labels",
		},
		{
			name: ["-m", "--mkdir"],
			description: "Alias to '-o X-mount.mkdir",
		},
		{
			name: ["-n", "--no-mtab"],
			description: "Don't write to /etc/mtab",
		},
		{
			name: "--options-mode",
			description: "What to do with options loaded from fstab",
			args: {
				name: "mode",
			},
		},
		{
			name: "--options-source",
			description: "Mount options source",
			args: {
				name: "source",
				template: "filepaths",
			},
		},
		{
			name: "--options-source-force",
			description: "Force use of options from fstab/mtab",
		},
		{
			name: ["-o", "--options"],
			description: "Comma-separated list of mount options",
			args: {
				name: "list",
			},
		},
		{
			name: ["-O", "--test-opts"],
			description: "Limit the set of filesystems (use with -a)",
			args: {
				name: "list",
			},
		},
		{
			name: ["-r", "--read-only"],
			description: "Mount the filesystem read-only (same as -o ro)",
		},
		{
			name: ["-t", "--types"],
			description: "Limit the set of filesystem types",
			args: {
				name: "list",
			},
		},
		{
			name: "--source",
			description: "Explicitly specifies source",
			args: {
				name: "source",
				suggestions: ["path", "label", "uuid"],
			},
		},
		{
			name: "--target",
			description: "Explicitly specifies mountpoint",
			args: {
				name: "mountpoint",
				template: "folders",
			},
		},
		{
			name: "--target-prefix",
			description: "Specifies path used for all mountpoints",
			args: {
				name: "path",
				template: "folders",
			},
		},
		{
			name: ["-v", "--verbose"],
			description: "Say what is being done",
		},
		{
			name: ["-w", "--rw", "--read-write"],
			description: "Mount the filesystem read-write (default)",
		},
		{
			name: ["-V", "--version"],
			description: "Display version",
		},
		{
			name: ["-B", "--bind"],
			description: "Mount a subtree somewhere else (same as -o bind)",
		},
		{
			name: ["-M", "--move"],
			description: "Move a subtree to some other place",
		},
		{
			name: ["-R", "-rbind"],
			description: "Mount a subtree and all submounts somewhere else",
		},
		{
			name: "--make-shared",
			description: "Mark a subtree as shared",
		},
		{
			name: "--make-slave",
			description: "Mark a subtree as slave",
		},
		{
			name: "--make-private",
			description: "Mark a subtree as private",
		},
		{
			name: "--make-unbindable",
			description: "Mark a subtree as unbindable",
		},
		{
			name: "--make-rshared",
			description: "Recursively mark a whole subtree as shared",
		},
		{
			name: "--make-rslave",
			description: "Recursively mark a whole subtree as slave",
		},
		{
			name: "--make-rprivate",
			description: "Recursively mark a whole subtree as private",
		},
		{
			name: "--make-runbindable",
			description: "Recursively mark a whole subtree as unbindable",
		},
	],
};

export default completionSpec;
