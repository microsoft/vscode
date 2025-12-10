const postProcessDockerPs: Fig.Generator["postProcess"] = (out) => {
	return out.split("\n").map((i) => {
		try {
			const parsedJSON: Record<string, string> = JSON.parse(i);
			return {
				name: parsedJSON.Names,
				displayName: `${parsedJSON.Names} (${parsedJSON.Image})`,
				icon: "fig://icon?type=docker",
			};
		} catch (error) {
			console.error(error); return null!;
		}
	});
};

const sharedPostProcess: Fig.Generator["postProcess"] = (out) => {
	return out
		.split("\n")
		.map((line) => JSON.parse(line))
		.map((i) => ({
			name: i.Name,
			description: i.ID,
			icon: "fig://icon?type=docker",
		}));
};

const dockerGenerators: Record<string, Fig.Generator> = {
	runningDockerContainers: {
		script: ["docker", "ps", "--format", "{{ json . }}"],
		postProcess: postProcessDockerPs,
	},
	allDockerContainers: {
		script: ["docker", "ps", "-a", "--format", "{{ json . }}"],
		postProcess: postProcessDockerPs,
	},
	pausedDockerContainers: {
		script: [
			"docker",
			"ps",
			"--filter",
			"status=paused",
			"--format",
			"{{ json . }}",
		],
		postProcess: postProcessDockerPs,
	},
	allLocalImages: {
		script: ["docker", "image", "ls", "--format", "{{ json . }}"],
		postProcess: function (out) {
			return out
				.split("\n")
				.map((line) => JSON.parse(line))
				.map((i) => ({
					name: `${i.ID}`,
					displayName: `${i.Repository} - ${i.ID}`,
					icon: "fig://icon?type=docker",
				}));
		},
	},
	allLocalImagesWithRepository: {
		script: ["docker", "image", "ls", "--format", "{{ json . }}"],
		postProcess: function (out) {
			return out
				.split("\n")
				.map((line) => JSON.parse(line))
				.map((i) => ({
					name: i.Repository,
					displayName: `${i.Repository} - ${i.ID}`,
					icon: "fig://icon?type=docker",
				}));
		},
	},
	dockerHubSearch: {
		script: function (context) {
			if (context[context.length - 1] === "") return undefined;
			const searchTerm = context[context.length - 1];
			return ["docker", "search", searchTerm, "--format", "{{ json . }}"];
		},
		postProcess: function (out) {
			return out
				.split("\n")
				.map((line) => JSON.parse(line))
				.map((i) => ({
					name: `${i.Name}`,
					icon: "fig://icon?type=docker",
				}));
		},
		trigger: function () {
			return true;
		},
	},
	allDockerContexts: {
		script: ["docker", "context", "list", "--format", "{{ json . }}"],
		postProcess: function (out) {
			return out
				.split("\n")
				.map((line) => JSON.parse(line))
				.map((i) => ({
					name: i.Name,
					description: i.Description,
					icon: "fig://icon?type=docker",
				}));
		},
	},
	listDockerNetworks: {
		script: ["docker", "network", "list", "--format", "{{ json . }}"],
		postProcess: sharedPostProcess,
	},
	listDockerSwarmNodes: {
		script: ["docker", "node", "list", "--format", "{{ json . }}"],
		postProcess: function (out) {
			return out
				.split("\n")
				.map((line) => JSON.parse(line))
				.map((i) => ({
					name: i.ID,
					displayName: `${i.ID} - ${i.Hostname}`,
					description: i.Status,
					icon: "fig://icon?type=docker",
				}));
		},
	},
	listDockerPlugins: {
		script: ["docker", "plugin", "list", "--format", "{{ json . }}"],
		postProcess: sharedPostProcess,
	},
	listDockerSecrets: {
		script: ["docker", "secret", "list", "--format", "{{ json . }}"],
		postProcess: sharedPostProcess,
	},
	listDockerServices: {
		script: ["docker", "service", "list", "--format", "{{ json . }}"],
		postProcess: function (out) {
			return out
				.split("\n")
				.map((line) => JSON.parse(line))
				.map((i) => ({
					name: i.Name,
					description: i.Image,
					icon: "fig://icon?type=docker",
				}));
		},
	},
	listDockerServicesReplicas: {
		script: ["docker", "service", "list", "--format", "{{ json . }}"],
		postProcess: function (out) {
			return out
				.split("\n")
				.map((line) => JSON.parse(line))
				.map((i) => ({
					name: `${i.Name}=`,
					description: i.Image,
					icon: "fig://icon?type=docker",
				}));
		},
	},
	listDockerStacks: {
		script: ["docker", "stack", "list", "--format", "{{ json . }}"],
		postProcess: function (out) {
			return out
				.split("\n")
				.map((line) => JSON.parse(line))
				.map((i) => ({
					name: i.Name,
					icon: "fig://icon?type=docker",
				}));
		},
	},
	listDockerVolumes: {
		script: ["docker", "volume", "list", "--format", "{{ json . }}"],
		postProcess: function (out) {
			return out
				.split("\n")
				.map((line) => JSON.parse(line))
				.map((i) => ({
					name: i.Name,
					icon: "fig://icon?type=docker",
				}));
		},
	},
};

const containersArg = {
	name: "container",
	generators: dockerGenerators.runningDockerContainers,
};

const imagesArg = {
	name: "image",
	generators: dockerGenerators.allLocalImages,
};

const containerAndCommandArgs = [
	containersArg,
	{
		name: "command",
		isCommand: true,
	},
];

const contextsArg = {
	name: "CONTEXT",
	generators: dockerGenerators.allDockerContexts,
};

const sharedCommands: Record<string, Fig.Subcommand> = {
	build: {
		name: "build",
		description: "Build an image from a Dockerfile",
		args: {
			name: "path",
			generators: {
				template: "folders",
			},
		},
		options: [
			{
				name: "--add-host",
				args: {
					name: "list",
					description: "Add a custom host-to-IP mapping (host:ip)",
				},
			},
			{
				name: "--build-arg",
				args: {
					name: "list",
					description: "Set build-time variables",
				},
			},
			{
				name: "--cache-from",
				args: {
					name: "strings",
					description: "Images to consider as cache sources",
				},
			},
			{
				name: "--disable-content-trust",
				description: "Skip image verification (default true)",
			},
			{
				name: ["-f", "--file"],
				description: "Name of the Dockerfile (Default is 'PATH/Dockerfile')",
				args: {
					name: "string",
					generators: {
						template: "filepaths",
					},
				},
			},
			{
				name: "--iidfile",
				description: "Write the image ID to the file",
				args: {
					name: "string",
				},
			},
			{
				name: "--isolation",
				description: "Container isolation technology",
				args: {
					name: "string",
				},
			},
			{
				name: "--label",
				description: "Set metadata for an image",
				args: {
					name: "list",
				},
			},
			{
				name: "--network",
				description:
					'Set the networking mode for the RUN instructions during build (default "default")',
				args: {
					name: "string",
				},
			},
			{
				name: "--no-cache",
				description: "Do not use cache when building the image",
			},
			{
				name: ["-o", "--output"],
				description: "Output destination (format: type=local,dest=path)",
				args: {
					name: "stringArray",
				},
			},
			{
				name: "--platform",
				description: "Set platform if server is multi-platform capable",
				args: {
					name: "string",
				},
			},
			{
				name: "--progress",
				description:
					"Set type of progress output (auto, plain, tty). Use plain to show container output",
				args: {
					name: "string",
					suggestions: ["auto", "plain", "tty"].map((i) => ({ name: i })),
				},
			},
			{
				name: "--pull",
				description: "Always attempt to pull a newer version of the image",
			},
			{
				name: ["-q", "--quiet"],
				description: "Suppress the build output and print image ID on success",
			},
			{
				name: "--secret",
				description: `Secret file to expose to the build (only if BuildKit enabled): id=mysecret,src=/local/secret`,
				args: {
					name: "stringArray",
				},
			},
			{
				name: "--squash",
				description: "Squash newly built layers into a single new layer",
			},
			{
				name: "--ssh",
				description: `SSH agent socket or keys to expose to the build (only if BuildKit enabled) (format: default|<id>[=<socket>|<key>[,<key>]])`,
				args: {
					name: "stringArray",
				},
			},
			{
				name: ["-t", "--tag"],
				description: "Name and optionally a tag in the 'name:tag' format",
			},
			{
				name: "--target",
				description: "Set the target build stage to build",
				args: {
					name: "target build stage",
					generators: {
						trigger: function () {
							return true;
						},
						script: function (context) {
							let fileFlagIndex, dockerfilePath;
							if (context.includes("-f")) {
								fileFlagIndex = context.indexOf("-f");
								dockerfilePath = context[fileFlagIndex + 1];
							} else if (context.includes("--file")) {
								fileFlagIndex = context.indexOf("--file");
								dockerfilePath = context[fileFlagIndex + 1];
							} else {
								dockerfilePath = "Dockerfile";
							}

							return ["grep", "-iE", "FROM.*AS", dockerfilePath];
						},
						postProcess: function (out) {
							// This just searches the Dockerfile for the alias name after AS,
							// and due to the grep above, will only match lines where FROM and AS
							// are on the same line. This could certainly be made more robust
							// down the line.
							const imageNameRegexp = /(?:[aA][sS]\s+)([\w:.-]+)/;
							return out
								.split("\n")
								.map((i) => {
									const result = imageNameRegexp.exec(i);
									if (result) {
										return {
											name: result[1],
										};
									}
								})
								.filter((i) => i !== undefined);
						},
					},
				},
			},
		],
	},
	create: {
		name: "create",
		description: "Create a new container",
		args: [
			{
				name: "container",
				generators: dockerGenerators.allLocalImages,
			},
			{
				name: "command",
				isCommand: true,
			},
		],
		options: [
			{
				args: {
					name: "list",
				},
				description: "Add a custom host-to-IP mapping (host:ip)",
				name: "--add-host",
			},
			{
				args: {
					name: "list",
				},
				description: "Attach to STDIN, STDOUT or STDERR",
				name: ["-a", "--attach"],
			},
			{
				args: {
					name: "uint16",
				},
				description:
					"Block IO (relative weight), between 10 and 1000, or 0 to disable (default 0)",
				name: "--blkio-weight",
			},
			{
				args: {
					name: "list",
				},
				description: "Block IO weight (relative device weight) (default [])",
				name: "--blkio-weight-device",
			},
			{
				args: {
					name: "list",
				},
				description: "Add Linux capabilities",
				name: "--cap-add",
			},
			{
				args: {
					name: "list",
				},
				description: "Drop Linux capabilities",
				name: "--cap-drop",
			},
			{
				args: {
					name: "string",
				},
				description: "Optional parent cgroup for the container",
				name: "--cgroup-parent",
			},
			{
				args: {
					name: "string",
				},
				description: "Cgroup namespace to use (host|private)",
				name: "--cgroupns",
			},
			{
				args: {
					name: "string",
				},
				description: "Write the container ID to the file",
				name: "--cidfile",
			},
			{
				args: {
					name: "int",
				},
				description: "Limit CPU CFS (Completely Fair Scheduler) period",
				name: "--cpu-period",
			},
			{
				args: {
					name: "int",
				},
				description: "Limit CPU CFS (Completely Fair Scheduler) quota",
				name: "--cpu-quota",
			},
			{
				args: {
					name: "int",
				},
				description: "Limit CPU real-time period in microseconds",
				name: "--cpu-rt-period",
			},
			{
				args: {
					name: "int",
				},
				description: "Limit CPU real-time runtime in microseconds",
				name: "--cpu-rt-runtime",
			},
			{
				args: {
					name: "int",
				},
				description: "CPU shares (relative weight)",
				name: ["-c", "--cpu-shares"],
			},
			{
				args: {
					name: "decimal",
				},
				description: "Number of CPUs",
				name: "--cpus",
			},
			{
				args: {
					name: "string",
				},
				description: "CPUs in which to allow execution (0-3, 0,1)",
				name: "--cpuset-cpus",
			},
			{
				args: {
					name: "string",
				},
				description: "MEMs in which to allow execution (0-3, 0,1)",
				name: "--cpuset-mems",
			},
			{
				args: {
					name: "list",
				},
				description: "Add a host device to the container",
				name: "--device",
			},
			{
				args: {
					name: "list",
				},
				description: "Add a rule to the cgroup allowed devices list",
				name: "--device-cgroup-rule",
			},
			{
				args: {
					name: "list",
				},
				description:
					"Limit read rate (bytes per second) from a device (default [])",
				name: "--device-read-bps",
			},
			{
				args: {
					name: "list",
				},
				description:
					"Limit read rate (IO per second) from a device (default [])",
				name: "--device-read-iops",
			},
			{
				args: {
					name: "list",
				},
				description:
					"Limit write rate (bytes per second) to a device (default [])",
				name: "--device-write-bps",
			},
			{
				args: {
					name: "list",
				},
				description:
					"Limit write rate (IO per second) to a device (default [])",
				name: "--device-write-iops",
			},
			{
				description: "Skip image verification (default true)",
				name: "--disable-content-trust",
			},
			{
				args: {
					name: "list",
				},
				description: "Set custom DNS servers",
				name: "--dns",
			},
			{
				args: {
					name: "list",
				},
				description: "Set DNS options",
				name: "--dns-option",
			},
			{
				args: {
					name: "list",
				},
				description: "Set custom DNS search domains",
				name: "--dns-search",
			},
			{
				args: {
					name: "string",
				},
				description: "Container NIS domain name",
				name: "--domainname",
			},
			{
				args: {
					name: "string",
				},
				description: "Overwrite the default ENTRYPOINT of the image",
				name: "--entrypoint",
			},
			{
				args: {
					name: "list",
				},
				description: "Set environment variables",
				name: ["-e", "--env"],
			},
			{
				args: {
					name: "list",
				},
				description: "Read in a file of environment variables",
				name: "--env-file",
			},
			{
				args: {
					name: "list",
				},
				description: "Expose a port or a range of ports",
				name: "--expose",
			},
			{
				args: {
					name: "gpu-request",
				},
				description:
					"GPU devices to add to the container ('all' to pass all GPUs)",
				name: "--gpus",
			},
			{
				args: {
					name: "list",
				},
				description: "Add additional groups to join",
				name: "--group-add",
			},
			{
				args: {
					name: "string",
				},
				description: "Command to run to check health",
				name: "--health-cmd",
			},
			{
				args: {
					name: "duration",
				},
				description: "Time between running the check (ms|s|m|h) (default 0s)",
				name: "--health-interval",
			},
			{
				args: {
					name: "int",
				},
				description: "Consecutive failures needed to report unhealthy",
				name: "--health-retries",
			},
			{
				args: {
					name: "duration",
				},
				description:
					"Start period for the container to initialize before starting health-retries countdown (ms|s|m|h) (default 0s)",
				name: "--health-start-period",
			},
			{
				args: {
					name: "duration",
				},
				description:
					"Maximum time to allow one check to run (ms|s|m|h) (default 0s)",
				name: "--health-timeout",
			},
			{
				description: "Print usage",
				name: "--help",
			},
			{
				args: {
					name: "string",
				},
				description: "Container host name",
				name: ["-h", "--hostname"],
			},
			{
				description:
					"Run an init inside the container that forwards signals and reaps processes",
				name: "--init",
			},
			{
				description: "Keep STDIN open even if not attached",
				name: ["-i", "--interactive"],
			},
			{
				args: {
					name: "string",
				},
				description: "IPv4 address (e.g., 172.30.100.104)",
				name: "--ip",
			},
			{
				args: {
					name: "string",
				},
				description: "IPv6 address (e.g., 2001:db8::33)",
				name: "--ip6",
			},
			{
				args: {
					name: "string",
				},
				description: "IPC mode to use",
				name: "--ipc",
			},
			{
				args: {
					name: "string",
				},
				description: "Container isolation technology",
				name: "--isolation",
			},
			{
				args: {
					name: "bytes",
				},
				description: "Kernel memory limit",
				name: "--kernel-memory",
			},
			{
				args: {
					name: "list",
				},
				description: "Set meta data on a container",
				name: ["-l", "--label"],
			},
			{
				args: {
					name: "list",
				},
				description: "Read in a line delimited file of labels",
				name: "--label-file",
			},
			{
				args: {
					name: "list",
				},
				description: "Add link to another container",
				name: "--link",
			},
			{
				args: {
					name: "list",
				},
				description: "Container IPv4/IPv6 link-local addresses",
				name: "--link-local-ip",
			},
			{
				args: {
					name: "string",
				},
				description: "Logging driver for the container",
				name: "--log-driver",
			},
			{
				args: {
					name: "list",
				},
				description: "Log driver options",
				name: "--log-opt",
			},
			{
				args: {
					name: "string",
				},
				description: "Container MAC address (e.g., 92:d0:c6:0a:29:33)",
				name: "--mac-address",
			},
			{
				args: {
					name: "bytes",
				},
				description: "Memory limit",
				name: ["-m", "--memory"],
			},
			{
				args: {
					name: "bytes",
				},
				description: "Memory soft limit",
				name: "--memory-reservation",
			},
			{
				args: {
					name: "bytes",
				},
				description:
					"Swap limit equal to memory plus swap: '-1' to enable unlimited swap",
				name: "--memory-swap",
			},
			{
				args: {
					name: "int",
				},
				description: "Tune container memory swappiness (0 to 100) (default -1)",
				name: "--memory-swappiness",
			},
			{
				args: {
					name: "mount",
				},
				description: "Attach a filesystem mount to the container",
				name: "--mount",
			},
			{
				args: {
					name: "string",
				},
				description: "Assign a name to the container",
				name: "--name",
			},
			{
				args: {
					name: "network",
				},
				description: "Connect a container to a network",
				name: "--network",
			},
			{
				args: {
					name: "list",
				},
				description: "Add network-scoped alias for the container",
				name: "--network-alias",
			},
			{
				description: "Disable any container-specified HEALTHCHECK",
				name: "--no-healthcheck",
			},
			{
				description: "Disable OOM Killer",
				name: "--oom-kill-disable",
			},
			{
				args: {
					name: "int",
				},
				description: "Tune host's OOM preferences (-1000 to 1000)",
				name: "--oom-score-adj",
			},
			{
				args: {
					name: "string",
				},
				description: "PID namespace to use",
				name: "--pid",
			},
			{
				args: {
					name: "int",
				},
				description: "Tune container pids limit (set -1 for unlimited)",
				name: "--pids-limit",
			},
			{
				args: {
					name: "string",
				},
				description: "Set platform if server is multi-platform capable",
				name: "--platform",
			},
			{
				description: "Give extended privileges to this container",
				name: "--privileged",
			},
			{
				args: {
					name: "list",
				},
				description: "Publish a container's port(s) to the host",
				name: ["-p", "--publish"],
			},
			{
				description: "Publish all exposed ports to random ports",
				name: ["-P", "--publish-all"],
			},
			{
				args: {
					name: "string",
				},
				description:
					'Pull image before creating ("always"|"missing"|"never") (default "missing")',
				name: "--pull",
			},
			{
				description: "Mount the container's root filesystem as read only",
				name: "--read-only",
			},
			{
				args: {
					name: "string",
				},
				description:
					'Restart policy to apply when a container exits (default "no")',
				name: "--restart",
			},
			{
				description: "Automatically remove the container when it exits",
				name: "--rm",
			},
			{
				args: {
					name: "string",
				},
				description: "Runtime to use for this container",
				name: "--runtime",
			},
			{
				args: {
					name: "list",
				},
				description: "Security Options",
				name: "--security-opt",
			},
			{
				args: {
					name: "bytes",
				},
				description: "Size of /dev/shm",
				name: "--shm-size",
			},
			{
				args: {
					name: "string",
				},
				description: 'Signal to stop a container (default "SIGTERM")',
				name: "--stop-signal",
			},
			{
				args: {
					name: "int",
				},
				description: "Timeout (in seconds) to stop a container",
				name: "--stop-timeout",
			},
			{
				args: {
					name: "list",
				},
				description: "Storage driver options for the container",
				name: "--storage-opt",
			},
			{
				args: {
					name: "map",
				},
				description: "Sysctl options (default map[])",
				name: "--sysctl",
			},
			{
				args: {
					name: "list",
				},
				description: "Mount a tmpfs directory",
				name: "--tmpfs",
			},
			{
				description: "Allocate a pseudo-TTY",
				name: ["-t", "--tty"],
			},
			{
				args: {
					name: "ulimit",
				},
				description: "Ulimit options (default [])",
				name: "--ulimit",
			},
			{
				args: {
					name: "string",
				},
				description: "Username or UID (format: <name|uid>[:<group|gid>])",
				name: ["-u", "--user"],
			},
			{
				args: {
					name: "string",
				},
				description: "User namespace to use",
				name: "--userns",
			},
			{
				args: {
					name: "string",
				},
				description: "UTS namespace to use",
				name: "--uts",
			},
			{
				args: {
					name: "list",
				},
				description: "Bind mount a volume",
				name: ["-v", "--volume"],
			},
			{
				args: {
					name: "string",
				},
				description: "Optional volume driver for the container",
				name: "--volume-driver",
			},
			{
				args: {
					name: "list",
				},
				description: "Mount volumes from the specified container(s)",
				name: "--volumes-from",
			},
			{
				args: {
					name: "string",
				},
				description: "Working directory inside the container",
				name: ["-w", "--workdir"],
			},
		],
	},
	attach: {
		name: "attach",
		description:
			"Attach local standard input, output, and error streams to a running container,",
		options: [
			{
				name: "--detach-keys",
				description: "Override the key sequence for detaching a container",
				args: {
					name: "string",
				},
			},
			{
				name: "--no-stdin",
				description: "Do not attach STDIN",
			},
			{
				name: "--sig-proxy",
				description: "Proxy all received signals to the process (default true)",
			},
		],
	},
	commit: {
		name: "commit",
		description: "Create a new image from a container's changes",
		args: [
			containersArg,
			{
				name: "[REPOSITORY[:TAG]]",
			},
		],
		options: [
			{
				args: {
					name: "string",
				},
				description:
					'Author (e.g., "John Hannibal Smith <hannibal@a-team.com>")',
				name: ["-a", "--author"],
			},
			{
				args: {
					name: "list",
				},
				description: "Apply Dockerfile instruction to the created image",
				name: ["-c", "--change"],
			},
			{
				args: {
					name: "string",
				},
				description: "Commit message",
				name: ["-m", "--message"],
			},
			{
				description: "Pause container during commit (default true)",
				name: ["-p", "--pause"],
			},
		],
	},
	cp: {
		name: "cp",
		description:
			"Copy files/folders between a container and the local filesystem",
		args: {
			name: "CONTAINER:SRC_PATH DEST_PATH|- OR SRC_PATH|- CONTAINER:DEST_PATH",
		},
		options: [
			{
				description: "Archive mode (copy all uid/gid information)",
				name: ["-a", "--archive"],
			},
			{
				description: "Always follow symbol link in SRC_PATH",
				name: ["-L", "--follow-link"],
			},
		],
	},
	diff: {
		name: "diff",
		description:
			"Inspect changes to files or directories on a container's filesystem",
		args: containersArg,
	},
	exec: {
		name: "exec",
		description: "Run a command in a running container",
		options: [
			{
				name: "-it",
				description: "Launch an interactive session",
				icon: "fig://icon?type=commandkey",
			},
			{
				description: "Detached mode: run command in the background",
				name: ["-d", "--detach"],
			},
			{
				args: {
					name: "string",
				},
				description: "Override the key sequence for detaching a container",
				name: "--detach-keys",
			},
			{
				args: {
					name: "list",
				},
				description: "Set environment variables",
				name: ["-e", "--env"],
			},
			{
				args: {
					name: "list",
				},
				description: "Read in a file of environment variables",
				name: "--env-file",
			},
			{
				description: "Keep STDIN open even if not attached",
				name: ["-i", "--interactive"],
			},
			{
				description: "Give extended privileges to the command",
				name: "--privileged",
			},
			{
				description: "Allocate a pseudo-TTY",
				name: ["-t", "--tty"],
			},
			{
				args: {
					name: "string",
				},
				description: "Username or UID (format: <name|uid>[:<group|gid>])",
				name: ["-u", "--user"],
			},
			{
				args: {
					name: "string",
				},
				description: "Working directory inside the container",
				name: ["-w", "--workdir"],
			},
		],
		args: containerAndCommandArgs,
	},
	export: {
		name: "export",
		description: "Export a container's filesystem as a tar archive",
		args: containersArg,
		options: [
			{
				description: "Write to a file, instead of STDOUT",
				name: ["-o", "--output"],
				args: {
					name: "string",
				},
			},
		],
	},
	kill: {
		name: "kill",
		description: "Kill one or more running containers",
		args: { ...containersArg, isVariadic: true },
		options: [
			{
				description: 'Signal to send to the container (default "KILL")',
				name: ["-s", "--signal"],
				args: {
					name: "string",
				},
			},
		],
	},
	logs: {
		name: "logs",
		description: "Fetch the logs of a container",
		args: containersArg,
		options: [
			{
				description: "Show extra details provided to logs",
				name: "--details",
			},
			{
				description: "Follow log output",
				name: ["-f", "--follow"],
			},
			{
				description:
					"Show logs since timestamp (e.g. 2013-01-02T13:23:37Z) or relative (e.g. 42m for 42 minutes)",
				name: "--since",
				args: {
					name: "string",
				},
			},
			{
				description:
					'Number of lines to show from the end of the logs (default "all")',
				name: ["-n", "--tail"],
				args: {
					name: "string",
				},
			},
			{
				description: "Show timestamps",
				name: ["-t", "--timestamps"],
			},
			{
				description:
					"Show logs before a timestamp (e.g. 2013-01-02T13:23:37Z) or relative (e.g. 42m for 42 minutes)",
				name: "--until",
				args: {
					name: "string",
				},
			},
		],
	},
	pause: {
		name: "pause",
		description: "Pause all processes within one or more containers",
		args: containersArg,
	},
	port: {
		name: "port",
		description: "List port mappings or a specific mapping for the container",
		args: [
			containersArg,
			{
				name: "[PRIVATE_PORT[/PROTO]]",
			},
		],
	},
	rename: {
		name: "rename",
		description: "Rename a container",
		args: [
			containersArg,
			{
				name: "NEW_NAME",
			},
		],
	},
	restart: {
		name: "restart",
		description: "Restart one or more containers",
		args: containersArg,
		options: [
			{
				description:
					"Seconds to wait for stop before killing the container (default 10)",
				name: ["-t", "--time"],
				args: {
					name: "int",
				},
			},
		],
	},
	rm: {
		name: "rm",
		description: "Remove one or more containers",
		args: {
			isVariadic: true,
			name: "containers",
			generators: dockerGenerators.allDockerContainers,
		},
		options: [
			{
				name: ["-f", "--force"],
				description: "Force the removal of a running container (uses SIGKILL)",
			},
			{
				name: ["-l", "--link"],
				description: "Remove the specified link",
			},
			{
				name: ["-v", "--volumes"],
				description:
					"Remove the anonymous volumes associated with the container",
			},
		],
	},
	run: {
		name: "run",
		description: "Run a command in a new container",
		options: [
			{
				name: "-it",
				description: "Launch an interactive session",
				icon: "fig://icon?type=commandkey",
			},
			{
				name: "--add-host",
				description: "Add a custom host-to-IP mapping (host:ip)",
				args: {
					name: "list",
				},
			},
			{
				name: ["-a", "--attach"],
				description: "Attach to STDIN, STDOUT or STDERR",
				args: {
					name: "list",
				},
			},
			{
				name: "--blkio-weight",
				description:
					"Block IO (relative weight), between 10 and 1000, or 0 to disable (default 0)",
				args: {
					name: "uint16",
				},
			},
			{
				name: "--blkio-weight-device",
				description: "Block IO weight (relative device weight) (default [])",
				args: {
					name: "list",
				},
			},
			{
				name: "--cap-add",
				description: "Add Linux capabilities",
				args: {
					name: "list",
				},
			},
			{
				name: "--cap-drop",
				description: "Drop Linux capabilities",
				args: {
					name: "list",
				},
			},
			{
				name: "--cgroup-parent",
				description: "Optional parent cgroup for the container",
				args: {
					name: "string",
				},
			},
			{
				name: "--cgroupns",
				description: `Cgroup namespace to use (host|private)
'host':    Run the container in the Docker host's cgroup namespace
'private': Run the container in its own private cgroup namespace
'':        Use the cgroup namespace as configured by the
default-cgroupns-mode option on the daemon (default)`,
				args: {
					name: "string",
				},
			},
			{
				name: "--cidfile",
				description: "Write the container ID to the file",
				args: {
					name: "string",
				},
			},
			{
				name: "--cpu-period",
				description: "Limit CPU CFS (Completely Fair Scheduler) period",
				args: {
					name: "int",
				},
			},
			{
				name: "--cpu-quota",
				description: "Limit CPU CFS (Completely Fair Scheduler) quota",
				args: {
					name: "int",
				},
			},
			{
				name: "--cpu-rt-period",
				description: "Limit CPU real-time period in microseconds",
				args: {
					name: "int",
				},
			},
			{
				name: "--cpu-rt-runtime",
				description: "Limit CPU real-time runtime in microseconds",
				args: {
					name: "int",
				},
			},
			{
				name: ["-c", "--cpu-shares"],
				description: "CPU shares (relative weight)",
				args: {
					name: "int",
				},
			},
			{
				name: "--cpus",
				description: "Number of CPUs",
				args: {
					name: "decimal",
				},
			},
			{
				name: "--cpuset-cpus",
				description: "CPUs in which to allow execution (0-3, 0,1)",
				args: {
					name: "string",
				},
			},
			{
				name: "--cpuset-mems",
				description: "MEMs in which to allow execution (0-3, 0,1)",
				args: {
					name: "string",
				},
			},
			{
				name: ["-d", "--detach"],
				description: "Run container in background and print container ID",
			},
			{
				name: "--detach-keys",
				description: "Override the key sequence for detaching a container",
				args: {
					name: "string",
				},
			},
			{
				name: "--device",
				description: "Add a host device to the container",
				args: {
					name: "list",
				},
			},
			{
				name: "--device-cgroup-rule",
				description: "Add a rule to the cgroup allowed devices list",
				args: {
					name: "list",
				},
			},
			{
				name: "--device-read-bps",
				description:
					"Limit read rate (bytes per second) from a device (default [])",
				args: {
					name: "list",
				},
			},
			{
				name: "--device-read-iops",
				description:
					"Limit read rate (IO per second) from a device (default [])",
				args: {
					name: "list",
				},
			},
			{
				name: "--device-write-bps",
				description:
					"Limit write rate (bytes per second) to a device (default [])",
				args: {
					name: "list",
				},
			},
			{
				name: "--device-write-iops",
				description:
					"Limit write rate (IO per second) to a device (default [])",
				args: {
					name: "list",
				},
			},
			{
				name: "--disable-content-trust",
				description: "Skip image verification (default true)",
			},
			{
				name: "--dns",
				description: "Set custom DNS servers",
				args: {
					name: "list",
				},
			},
			{
				name: "--dns-option",
				description: "Set DNS options",
				args: {
					name: "list",
				},
			},
			{
				name: "--dns-search",
				description: "Set custom DNS search domains",
				args: {
					name: "list",
				},
			},
			{
				name: "--domainname",
				description: "Container NIS domain name",
				args: {
					name: "string",
				},
			},
			{
				name: "--entrypoint",
				description: "Overwrite the default ENTRYPOINT of the image",
				args: {
					name: "string",
				},
			},
			{
				name: ["-e", "--env"],
				description: "Set environment variables",
				args: {
					name: "list",
				},
			},
			{
				name: "--env-file",
				description: "Read in a file of environment variables",
				args: {
					name: "list",
				},
			},
			{
				name: "--expose",
				description: "Expose a port or a range of ports",
				args: {
					name: "list",
				},
			},
			{
				name: "--gpus",
				description:
					"GPU devices to add to the container ('all' to pass all GPUs)",
				args: {
					name: "gpu-request",
				},
			},
			{
				name: "--group-add",
				description: "Add additional groups to join",
				args: {
					name: "list",
				},
			},
			{
				name: "--health-cmd",
				description: "Command to run to check health",
				args: {
					name: "string",
				},
			},
			{
				name: "--health-interval",
				description: "Time between running the check (ms|s|m|h) (default 0s)",
				args: {
					name: "duration",
				},
			},
			{
				name: "--health-retries",
				description: "Consecutive failures needed to report unhealthy",
				args: {
					name: "int",
				},
			},
			{
				name: "--health-start-period",
				description:
					"Start period for the container to initialize before starting health-retries countdown (ms|s|m|h) (default 0s)",
				args: {
					name: "duration",
				},
			},
			{
				name: "--health-timeout",
				description:
					"Maximum time to allow one check to run (ms|s|m|h) (default 0s)",
				args: {
					name: "duration",
				},
			},
			{
				name: "--help",
				description: "Print usage",
			},
			{
				name: ["-h", "--hostname"],
				description: "Container host name",
				args: {
					name: "string",
				},
			},
			{
				name: "--init",
				description:
					"Run an init inside the container that forwards signals and reaps processes",
			},
			{
				name: ["-i", "--interactive"],
				description: "Keep STDIN open even if not attached",
			},
			{
				name: "--ip",
				description: "IPv4 address (e.g., 172.30.100.104)",
				args: {
					name: "string",
				},
			},
			{
				name: "--ip6",
				description: "IPv6 address (e.g., 2001:db8::33)",
				args: {
					name: "string",
				},
			},
			{
				name: "--ipc",
				description: "IPC mode to use",
				args: {
					name: "string",
				},
			},
			{
				name: "--isolation",
				description: "Container isolation technology",
				args: {
					name: "string",
				},
			},
			{
				name: "--kernel-memory",
				description: "Kernel memory limit",
				args: {
					name: "bytes",
				},
			},
			{
				name: ["-l", "--label"],
				description: "Set meta data on a container",
				args: {
					name: "list",
				},
			},
			{
				name: "--label-file",
				description: "Read in a line delimited file of labels",
				args: {
					name: "list",
				},
			},
			{
				name: "--link",
				description: "Add link to another container",
				args: {
					name: "list",
				},
			},
			{
				name: "--link-local-ip",
				description: "Container IPv4/IPv6 link-local addresses",
				args: {
					name: "list",
				},
			},
			{
				name: "--log-driver",
				description: "Logging driver for the container",
				args: {
					name: "string",
					suggestions: [
						"json-file",
						"syslog",
						"journald",
						"gelf",
						"fluentd",
						"awslogs",
						"splunk",
						"etwlogs",
						"gcplogs",
						"none",
					],
				},
			},
			{
				name: "--log-opt",
				description: "Log driver options",
				args: {
					name: "list",
				},
			},
			{
				name: "--mac-address",
				description: "Container MAC address (e.g., 92:d0:c6:0a:29:33)",
				args: {
					name: "string",
				},
			},
			{
				name: ["-m", "--memory"],
				description: "Memory limit",
				args: {
					name: "bytes",
				},
			},
			{
				name: "--memory-reservation",
				description: "Memory soft limit",
				args: {
					name: "bytes",
				},
			},
			{
				name: "--memory-swap",
				description:
					"Swap limit equal to memory plus swap: '-1' to enable unlimited swap",
				args: {
					name: "bytes",
				},
			},
			{
				name: "--memory-swappiness",
				description: "Tune container memory swappiness (0 to 100) (default -1)",
				args: {
					name: "int",
				},
			},
			{
				name: "--mount",
				description: "Attach a filesystem mount to the container",
				args: {
					name: "mount",
				},
			},
			{
				name: "--name",
				description: "Assign a name to the container",
				args: {
					name: "string",
				},
			},
			{
				name: "--network",
				description: "Connect a container to a network",
				args: {
					name: "network",
				},
			},
			{
				name: "--network-alias",
				description: "Add network-scoped alias for the container",
				args: {
					name: "list",
				},
			},
			{
				name: "--no-healthcheck",
				description: "Disable any container-specified HEALTHCHECK",
			},
			{
				name: "--oom-kill-disable",
				description: "Disable OOM Killer",
			},
			{
				name: "--oom-score-adj",
				description: "Tune host's OOM preferences (-1000 to 1000)",
				args: {
					name: "int",
				},
			},
			{
				name: "--pid",
				description: "PID namespace to use",
				args: {
					name: "string",
				},
			},
			{
				name: "--pids-limit",
				description: "Tune container pids limit (set -1 for unlimited)",
				args: {
					name: "int",
				},
			},
			{
				name: "--platform",
				description: "Set platform if server is multi-platform capable",
				args: {
					name: "string",
				},
			},
			{
				name: "--privileged",
				description: "Give extended privileges to this container",
			},
			{
				name: ["-p", "--publish"],
				description: "Publish a container's port(s) to the host",
				args: {
					name: "list",
				},
			},
			{
				name: ["-P", "--publish-all"],
				description: "Publish all exposed ports to random ports",
			},
			{
				name: "--pull",
				description:
					"Pull image before running ('always'|'missing'|'never') (default 'missing')",
				args: {
					name: "string",
				},
			},
			{
				name: "--read-only",
				description: "Mount the container's root filesystem as read only",
			},
			{
				name: "--restart",
				description:
					"Restart policy to apply when a container exits (default 'no')",
				args: {
					name: "string",
				},
			},
			{
				name: "--rm",
				description: "Automatically remove the container when it exits",
			},
			{
				name: "--runtime",
				description: "Runtime to use for this container",
				args: {
					name: "string",
				},
			},
			{
				name: "--security-opt",
				description: "Security Options",
				args: {
					name: "list",
				},
			},
			{
				name: "--shm-size",
				description: "Size of /dev/shm",
				args: {
					name: "bytes",
				},
			},
			{
				name: "--sig-proxy",
				description: "Proxy received signals to the process (default true)",
			},
			{
				name: "--stop-signal",
				description: "Signal to stop a container (default 'SIGTERM')",
				args: {
					name: "string",
				},
			},
			{
				name: "--stop-timeout",
				description: "Timeout (in seconds) to stop a container",
				args: {
					name: "int",
				},
			},
			{
				name: "--storage-opt",
				description: "Storage driver options for the container",
				args: {
					name: "list",
				},
			},
			{
				name: "--sysctl",
				description: "Sysctl options (default map[])",
				args: {
					name: "map",
				},
			},
			{
				name: "--tmpfs",
				description: "Mount a tmpfs directory",
				args: {
					name: "list",
				},
			},
			{
				name: ["-t", "--tty"],
				description: "Allocate a pseudo-TTY",
			},
			{
				name: "--ulimit",
				description: "Ulimit options (default [])",
				args: {
					name: "ulimit",
				},
			},
			{
				name: ["-u", "--user"],
				description: "Username or UID (format: <name|uid>[:<group|gid>])",
				args: {
					name: "string",
				},
			},
			{
				name: "--userns",
				description: "User namespace to use",
				args: {
					name: "string",
				},
			},
			{
				name: "--uts",
				description: "UTS namespace to use",
				args: {
					name: "string",
				},
			},
			{
				name: ["-v", "--volume"],
				description: "Bind mount a volume",
				args: {
					name: "list",
				},
			},
			{
				name: "--volume-driver",
				description: "Optional volume driver for the container",
				args: {
					name: "string",
				},
			},
			{
				name: "--volumes-from",
				description: "Mount volumes from the specified container(s)",
				args: {
					name: "list",
				},
			},
			{
				name: ["-w", "--workdir"],
				description: "Working directory inside the container",
				args: {
					name: "string",
				},
			},
		],
		args: [
			{
				name: "image",
				description: "The Docker image to use",
				generators: {
					script: [
						"docker",
						"images",
						"--format",
						"{{.Repository}} {{.Size}} {{.Tag}} {{.ID}}",
					],
					postProcess: function (out) {
						return out.split("\n").map((image) => {
							const [repo, size, tag, id] = image.split(" ");
							return {
								name: repo,
								description: `${id}@${tag} - ${size}`,
								icon: "fig://icon?type=docker",
							};
						});
					},
				},
			},
			{
				name: "command",
				// description: "The command to run in the container"
			},
		],
	},
	sbom: {
		name: "sbom",
		description:
			"View the packaged-based Software Bill Of Materials (SBOM) for an image",
		args: {
			name: "image",
			generators: dockerGenerators.allLocalImagesWithRepository,
		},
		options: [
			{
				description: "Show debug logging",
				name: ["-D", "--debug"],
			},
			{
				description: "Exclude paths from being scanned using a glob expression",
				name: "--exclude",
				args: {
					name: "paths",
				},
			},
			{
				description: "Report output format",
				name: "--format",
				args: {
					name: "fromat",
					suggestions: [
						"syft-json",
						"cyclonedx-xml",
						"cyclonedx-json",
						"github-0-json",
						"spdx-tag-value",
						"spdx-json",
						"table",
						"text",
					],
					default: "table",
				},
			},
			{
				description: "[experimental] selection of layers to catalog",
				name: "--layers",
				args: {
					name: "layers",
					suggestions: ["squashed", "all"],
					default: "squashed",
				},
			},
			{
				name: ["-o", "--output"],
				description:
					"File to write the default report output to (default is STDOUT)",
				args: {
					name: "file",
					template: ["filepaths"],
					suggestCurrentToken: true,
				},
			},
			{
				name: "--platform",
				description:
					"An optional platform specifier for container image sources (e.g. 'linux/arm64', 'linux/arm64/v8', 'arm64', 'linux')",
				args: {
					name: "platform",
				},
			},
			{
				name: "--quiet",
				description: "Suppress all non-report output",
			},
			{
				name: ["-v", "--version"],
				description: "Version for sbom",
			},
		],
	},
	start: {
		name: "start",
		description: "Start one or more stopped containers",
		args: {
			name: "container",
			generators: dockerGenerators.allDockerContainers,
		},
		options: [
			{
				description: "Attach STDOUT/STDERR and forward signals",
				name: ["-a", "--attach"],
			},
			{
				description: "Override the key sequence for detaching a container",
				name: "--detach-keys",
				args: {
					name: "string",
				},
			},
			{
				description: "Attach container's STDIN",
				name: ["-i", "--interactive"],
			},
		],
	},
	stats: {
		name: "stats",
		description:
			"Display a live stream of container(s) resource usage statistics",
		args: containersArg,
		options: [
			{
				description: "Show all containers (default shows just running)",
				name: ["-a", "--all"],
			},
			{
				description: "Pretty-print images using a Go template",
				name: "--format",
				args: {
					name: "string",
				},
			},
			{
				description: "Disable streaming stats and only pull the first result",
				name: "--no-stream",
			},
			{
				description: "Do not truncate output",
				name: "--no-trunc",
			},
		],
	},
	stop: {
		name: "stop",
		description: "Stop one or more running containers",
		args: containersArg,
		options: [
			{
				name: ["-t", "--t"],
				description: "Seconds to wait for stop before killing it (default 10)",
				args: {
					name: "int",
				},
			},
		],
	},
	top: {
		name: "top",
		description: "Display the running processes of a container",
		// TODO: You can pass in psOptions?
		args: containersArg,
	},
	unpause: {
		name: "unpause",
		description: "Unpause all processes within one or more containers",
		args: {
			name: "container",
			generators: dockerGenerators.pausedDockerContainers,
		},
	},
	update: {
		name: "update",
		description: "Update configuration of one or more containers",
		// INFO: You can do this on any container, even if it's not running - Is that useful though?
		// INFO: For now, only displaying running containers
		args: containersArg,
		options: [
			{
				args: {
					name: "uint16",
				},
				description:
					"Block IO (relative weight), between 10 and 1000, or 0 to disable (default 0)",
				name: "--blkio-weight",
			},
			{
				args: {
					name: "int",
				},
				description: "Limit CPU CFS (Completely Fair Scheduler) period",
				name: "--cpu-period",
			},
			{
				args: {
					name: "int",
				},
				description: "Limit CPU CFS (Completely Fair Scheduler) quota",
				name: "--cpu-quota",
			},
			{
				args: {
					name: "int",
				},
				description: "Limit the CPU real-time period in microseconds",
				name: "--cpu-rt-period",
			},
			{
				args: {
					name: "int",
				},
				description: "Limit the CPU real-time runtime in microseconds",
				name: "--cpu-rt-runtime",
			},
			{
				args: {
					name: "int",
				},
				description: "CPU shares (relative weight)",
				name: ["-c", "--cpu-shares"],
			},
			{
				args: {
					name: "decimal",
				},
				description: "Number of CPUs",
				name: "--cpus",
			},
			{
				args: {
					name: "string",
				},
				description: "CPUs in which to allow execution (0-3, 0,1)",
				name: "--cpuset-cpus",
			},
			{
				args: {
					name: "string",
				},
				description: "MEMs in which to allow execution (0-3, 0,1)",
				name: "--cpuset-mems",
			},
			{
				args: {
					name: "bytes",
				},
				description: "Kernel memory limit",
				name: "--kernel-memory",
			},
			{
				args: {
					name: "bytes",
				},
				description: "Memory limit",
				name: ["-m", "--memory"],
			},
			{
				args: {
					name: "bytes",
				},
				description: "Memory soft limit",
				name: "--memory-reservation",
			},
			{
				args: {
					name: "bytes",
				},
				description:
					"Swap limit equal to memory plus swap: '-1' to enable unlimited swap",
				name: "--memory-swap",
			},
			{
				args: {
					name: "int",
				},
				description: "Tune container pids limit (set -1 for unlimited)",
				name: "--pids-limit",
			},
			{
				args: {
					name: "string",
				},
				description: "Restart policy to apply when a container exits",
				name: "--restart",
			},
		],
	},
	wait: {
		name: "wait",
		description:
			"Block until one or more containers stop, then print their exit codes",
		args: containersArg,
	},
	ps: {
		name: "ps",
		description: "List containers",
		options: [
			{
				description: "Show all containers (default shows just running)",
				name: ["-a", "--all"],
			},
			{
				args: {
					name: "filter",
				},
				description: "Filter output based on conditions provided",
				name: ["-f", "--filter"],
			},
			{
				args: {
					name: "string",
				},
				description: "Pretty-print containers using a Go template",
				name: "--format",
			},
			{
				args: {
					name: "int",
				},
				description:
					"Show n last created containers (includes all states) (default -1)",
				name: ["-n", "--last"],
			},
			{
				description: "Show the latest created container (includes all states)",
				name: ["-l", "--latest"],
			},
			{
				description: "Don't truncate output",
				name: "--no-trunc",
			},
			{
				description: "Only display container IDs",
				name: ["-q", "--quiet"],
			},
			{
				description: "Display total file sizes",
				name: ["-s", "--size"],
			},
		],
	},
	history: {
		name: "history",
		description: "Show the history of an image",
		args: imagesArg,
		options: [
			{
				description: "Pretty-print images using a Go template",
				name: "--format",
				args: {
					name: "string",
				},
			},
			{
				description:
					"Print sizes and dates in human readable format (default true)",
				name: ["-H", "--human"],
			},
			{
				description: "Don't truncate output",
				name: "--no-trunc",
			},
			{
				description: "Only show image IDs",
				name: ["-q", "--quiet"],
			},
		],
	},
	imageImport: {
		name: "import",
		description:
			"Import the contents from a tarball to create a filesystem image",
		args: {
			name: "file|URL|- [REPOSITORY[:TAG]]",
		},
		options: [
			{
				args: {
					name: "list",
				},
				description: "Apply Dockerfile instruction to the created image",
				name: ["-c", "--change"],
			},
			{
				args: {
					name: "string",
				},
				description: "Set commit message for imported image",
				name: ["-m", "--message"],
			},
			{
				args: {
					name: "string",
				},
				description: "Set platform if server is multi-platform capable",
				name: "--platform",
			},
		],
	},
	imageList: {
		name: "images",
		description: "List images",
		args: {
			name: "[REPOSITORY[:TAG]]",
		},
		options: [
			{
				name: ["-a", "--all"],
				description: "Show all images (default hides intermediate images)",
			},
			{
				name: "--digests",
				description: "Show digests",
			},
			{
				name: ["-f", "--filter"],
				description: "Filter output based on conditions provided",
				args: {
					name: "filter",
				},
			},
			{
				name: "--format",
				description: "Pretty-print images using a Go template",
				args: {
					name: "string",
				},
			},
			{
				name: "--no-trunc",
				description: "Don't truncate output",
			},
			{
				name: ["-q", "--quiet"],
				description: "Only show image IDs",
			},
		],
	},
	load: {
		name: "load",
		description: "Load an image from a tar archive or STDIN",
		options: [
			{
				name: "-i",
				description: "Read from tar archive file, instead of STDIN",
				args: {
					name: "string",
				},
			},
			{
				name: ["-q", "--quiet"],
				description: "Suppress the load output",
			},
		],
	},
	pull: {
		name: "pull",
		description: "Pull an image or a repository from a registry",
		args: {
			name: "NAME[:TAG|@DIGEST]",
			generators: dockerGenerators.dockerHubSearch,
			debounce: true,
		},
		options: [
			{
				description: "Download all tagged images in the repository",
				name: ["-a", "--all-tags"],
			},
			{
				description: "Skip image verification (default true)",
				name: "--disable-content-trust",
			},
			{
				description: "Set platform if server is multi-platform capable",
				name: "--platform",
				args: {
					name: "string",
				},
			},
			{
				description: "Suppress verbose output",
				name: ["-q", "--quiet"],
			},
		],
	},
	push: {
		name: "push",
		description: "Push an image or a repository to a registry",
		// TODO: Autocomplete images
		args: {
			name: "NAME[:TAG]",
		},
		options: [
			{
				description: "Push all tagged images in the repository",
				name: ["-a", "--all-tags"],
			},
			{
				description: "Skip image signing (default true)",
				name: "--disable-content-trust",
			},
			{
				description: "Suppress verbose output",
				name: ["-q", "--quiet"],
			},
		],
	},
	tag: {
		name: "tag",
		description: "Create a tag TARGET_IMAGE that refers to SOURCE_IMAGE",
		args: {
			name: "SOURCE_IMAGE[:TAG] TARGET_IMAGE[:TAG]",
		},
	},
	imageSave: {
		name: "save",
		description:
			"Save one or more images to a tar archive (streamed to STDOUT by default)",
		args: imagesArg,
		options: [
			{
				description: "Write to a file, instead of STDOUT",
				name: ["-o", "--output"],
				args: {
					name: "string",
				},
			},
		],
	},
	removeImage: {
		name: "rmi",
		description: "Remove one or more images",
		args: { ...imagesArg, isVariadic: true },
		options: [
			{
				name: ["-f", "--force"],
				description: "Force removal of the image",
			},
			{
				name: "--no-prune",
				description: "Do not delete untagged parents",
			},
		],
	},
};

const completionSpec: Fig.Spec = {
	name: "docker",
	description: "A self-sufficient runtime for containers",
	subcommands: [
		sharedCommands.attach,
		sharedCommands.build,
		sharedCommands.commit,
		sharedCommands.cp,
		sharedCommands.create,
		sharedCommands.diff,
		{
			name: "events",
			description: "Get real time events from the server",
			options: [
				{
					args: {
						name: "filter",
					},
					description: "Filter output based on conditions provided",
					name: ["-f", "--filter"],
				},
				{
					args: {
						name: "string",
					},
					description: "Format the output using the given Go template",
					name: "--format",
				},
				{
					args: {
						name: "string",
					},
					description: "Show all events created since timestamp",
					name: "--since",
				},
				{
					args: {
						name: "string",
					},
					description: "Stream events until this timestamp",
					name: "--until",
				},
			],
		},
		sharedCommands.exec,
		sharedCommands.export,
		sharedCommands.history,
		sharedCommands.imageList,
		sharedCommands.imageImport,
		{
			name: "info",
			description: "Display system-wide information",
			options: [
				{
					args: {
						name: "string",
					},
					description: "Format the output using the given Go template",
					name: ["-f", "--format"],
				},
			],
		},
		{
			name: "inspect",
			description: "Return low-level information on Docker objects",
			args: {
				// TODO: There are more types of docker objects beyond running containers
				// that can be inspected
				name: "Name or ID",
				generators: [
					{
						script: ["docker", "ps", "-a", "--format", "{{ json . }}"],
						postProcess: function (out) {
							const allLines = out.split("\n").map((line) => JSON.parse(line));
							return allLines.map((i) => ({
								name: i.ID,
								displayName: `[con] ${i.ID} (${i.Image})`,
							}));
						},
					},
					{
						script: ["docker", "images", "-a", "--format", "{{ json . }}"],
						postProcess: function (out) {
							const allLines = out.split("\n").map((line) => JSON.parse(line));
							return allLines.map((i) => {
								let displayName;
								if (i.Repository === "\u003cnone\u003e") {
									displayName = i.ID;
								} else {
									displayName = i.Repository;
									if (i.Tag !== "\u003cnone\u003e") {
										displayName += `:${i.Tag}`;
									}
								}

								return {
									name: i.ID,
									displayName: `[img] ${displayName}`,
								};
							});
						},
					},
					{
						script: ["docker", "volume", "ls", "--format", "{{ json . }}"],
						postProcess: function (out) {
							const allLines = out.split("\n").map((line) => JSON.parse(line));
							return allLines.map((i) => ({
								name: i.Name,
								displayName: `[vol] ${i.Name}`,
							}));
						},
					},
				],
			},
			options: [
				{
					name: ["-f", "--format"],
					description: "Format the output using the given Go template",
					args: {
						name: "string",
					},
				},
				{
					name: ["-s", "--size"],
					description: "Display total file sizes if the type is container",
				},
				{
					name: "--type",
					description: "Return JSON for specified type",
					args: {
						name: "string",
					},
				},
			],
		},
		sharedCommands.kill,
		sharedCommands.load,
		{
			name: "login",
			description: "Log in to a Docker registry",
			args: {
				name: "server",
			},
			options: [
				{
					description: "Password",
					name: ["-p", "--password"],
					args: {
						name: "string",
					},
				},
				{
					description: "Take the password from stdin",
					name: "--password-stdin",
				},
				{
					description: "Username",
					name: ["-u", "--username"],
					args: {
						name: "string",
					},
				},
			],
		},
		{
			name: "logout",
			description: "Log out from a Docker registry",
			args: {
				name: "server",
			},
		},
		sharedCommands.logs,
		sharedCommands.pause,
		sharedCommands.port,
		sharedCommands.ps,
		sharedCommands.pull,
		sharedCommands.push,
		sharedCommands.rename,
		sharedCommands.restart,
		sharedCommands.rm,
		sharedCommands.removeImage,
		sharedCommands.run,
		sharedCommands.imageSave,
		{
			name: "search",
			description: "Search the Docker Hub for images",
			args: {
				name: "TERM",
				description: "Search term",
			},
			options: [
				{
					args: {
						name: "filter",
					},
					description: "Filter output based on conditions provided",
					name: ["-f", "--filter"],
				},
				{
					args: {
						name: "string",
					},
					description: "Pretty-print search using a Go template",
					name: "--format",
				},
				{
					args: {
						name: "int",
					},
					description: "Max number of search results (default 25)",
					name: "--limit",
				},
				{
					description: "Don't truncate output",
					name: "--no-trunc",
				},
			],
		},
		sharedCommands.sbom,
		sharedCommands.start,
		sharedCommands.stats,
		sharedCommands.stop,
		sharedCommands.tag,
		sharedCommands.top,
		sharedCommands.unpause,
		sharedCommands.update,
		{
			name: "version",
			description: "Show the Docker version information",
			options: [
				{
					description:
						"Format the output. Values: [pretty | json]. (Default: pretty)",
					name: ["-f", "--format"],
					args: {
						name: "string",
						suggestions: ["pretty", "json"],
					},
				},
				{
					description: "Kubernetes config file",
					name: "--kubeconfig",
					args: {
						name: "string",
					},
				},
			],
		},
		sharedCommands.wait,
		{
			name: "builder",
			description: "Manage builds",
			subcommands: [
				sharedCommands.build,
				{
					name: "prune",
					description: "Amount of disk space to keep for cache",
					options: [
						{
							name: ["-a", "--all"],
							description:
								"Remove all unused build cache, not just dangling ones",
						},
						{
							name: "--filter",
							description: "Provide filter values (e.g. 'until=24h')",
							args: {
								name: "filter",
							},
						},
						{
							name: ["-f", "--force"],
							description: "Do not prompt for confirmation",
						},
						{
							name: "--keep-storage",
							description: "Amount of disk space to keep for cache",
							args: {
								name: "bytes",
							},
						},
					],
				},
			],
		},
		{
			name: "config",
			description: "Manage Docker configs",
			subcommands: [
				{
					name: "create",
					description: "Create a config from a file or STDIN",
					args: {
						name: "file",
						template: "filepaths",
					},
					options: [
						{
							name: "-l",
							description: "Config labels",
							args: {
								name: "list",
							},
						},
						{
							name: "--template-driver",
							description: "Template driver",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "inspect",
					description: "Display detailed information on one or more configs",
					args: {
						name: "CONFIG",
						isVariadic: true,
					},
					options: [
						{
							name: "-f",
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--pretty",
							description: "Print the information in a human friendly format",
						},
					],
				},
				{
					name: "ls",
					description: "List configs",
					options: [
						{
							name: "-f",
							description: "Filter output based on conditions provided",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Pretty-print configs using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: ["-q", "--quiet"],
							description: "Only display IDs",
						},
					],
				},
				{
					name: "rm",
					description: "Remove one or more configs",
					args: {
						name: "CONFIG",
						isVariadic: true,
					},
				},
			],
		},
		{
			name: "container",
			description: "Manage containers",
			subcommands: [
				sharedCommands.attach,
				sharedCommands.cp,
				sharedCommands.create,
				sharedCommands.diff,
				sharedCommands.exec,
				sharedCommands.export,
				{
					name: "inspect",
					description: "Return low-level information on Docker objects",
					args: containersArg,
					options: [
						{
							name: ["-f", "--format"],
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
						{
							name: ["-s", "--size"],
							description: "Display total file sizes if the type is container",
						},
					],
				},
				sharedCommands.kill,
				sharedCommands.logs,
				{ ...sharedCommands.ps, name: "ls" },
				sharedCommands.pause,
				sharedCommands.port,
				{
					name: "prune",
					description: "Remove all stopped containers",
					options: [
						{
							name: "--filter",
							description: "Provide filter values (e.g. 'until=<timestamp>')",
							args: {
								name: "filter",
							},
						},
						{
							name: ["-f", "--force"],
							description: "Do not prompt for confirmation",
						},
					],
				},
				sharedCommands.rename,
				sharedCommands.restart,
				sharedCommands.rm,
				sharedCommands.run,
				sharedCommands.start,
				sharedCommands.stats,
				sharedCommands.stop,
				sharedCommands.top,
				sharedCommands.unpause,
				sharedCommands.update,
				sharedCommands.wait,
			],
		},
		{
			name: "context",
			description: "Manage contexts",
			subcommands: [
				{
					name: "create",
					description: "Create new context",
					subcommands: [
						{
							name: "aci",
							description: "Create a context for Azure Container Instances",
							args: {
								name: "CONTEXT",
							},
							options: [
								{
									name: "--description",
									description: "Description of the context",
									args: {
										name: "string",
									},
								},
								{
									name: ["-h", "--help"],
									description: "Help for aci",
								},
								{
									name: "--location",
									description: 'Location (default "eastus")',
									args: {
										name: "string",
									},
								},
								{
									name: "--resource-group",
									description: "Resource group",
									args: {
										name: "string",
									},
								},
								{
									name: "--subscription-id",
									description: "Location",
									args: {
										name: "string",
									},
								},
							],
						},
						{
							name: "ecs",
							description: "Create a context for Amazon ECS",
							args: {
								name: "CONTEXT",
							},
							options: [
								{
									name: "--access-keys",
									description: "Use AWS access keys from file",
									args: {
										name: "string",
									},
								},
								{
									name: "--description",
									description: "Description of the context",
									args: {
										name: "string",
									},
								},
								{
									name: "--from-env",
									description:
										"Use AWS environment variables for profile, or credentials and region",
								},
								{
									name: ["-h", "--help"],
									description: "Help for ecs",
								},
								{
									name: "--local-simulation",
									description:
										"Create context for ECS local simulation endpoints",
								},
								{
									name: "--profile",
									description: "Use an existing AWS profile",
									args: {
										name: "string",
									},
								},
							],
						},
					],
					options: [
						{
							name: "--default-stack-orchestrator",
							description:
								"Default orchestrator for stack operations to use with this context (swarm|kubernetes|all)",
							args: {
								name: "string",
								suggestions: ["swarm", "kubernetes", "all"],
							},
						},
						{
							name: "--description",
							description: "Description of the context",
							args: {
								name: "string",
							},
						},
						{
							name: "--docker",
							description: "Set the docker endpoint (default [])",
							args: {
								name: "stringToString",
							},
						},
						{
							name: "--from",
							description: "Create context from a named context",
							args: {
								name: "string",
							},
						},
						{
							name: ["-h", "--help"],
							description: "Help for create",
						},
						{
							name: "--kubernetes",
							description: "Set the kubernetes endpoint (default [])",
							args: {
								name: "stringToString",
							},
						},
					],
				},
				{
					name: "export",
					description: "Export a context to a tar or kubeconfig file",
					args: [
						contextsArg,
						{
							name: "FILE",
							template: "filepaths",
						},
					],
					options: [
						{
							name: ["-h", "--help"],
							description: "Help for export",
						},
						{
							name: "--kubeconfig",
							description: "Export as a kubeconfig file",
						},
					],
				},
				{
					name: "import",
					description: "Import a context from a tar or zip file",
					args: [
						{
							name: "CONTEXT",
						},
						{
							name: "FILE",
							template: "filepaths",
						},
					],
					options: [
						{
							name: ["-h", "--help"],
							description: "Help for export",
						},
					],
				},
				{
					name: "inspect",
					description: "Display detailed information on one or more contexts",
					args: { ...contextsArg, isVariadic: true },
					options: [
						{
							name: "-f",
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
						{
							name: ["-h", "--help"],
							description: "Help for inspect",
						},
					],
				},
				{
					name: "list",
					description: "List available contexts",
					options: [
						{
							name: "--format",
							description:
								"Format the output. Values: [pretty | json]. (Default: pretty)",
							args: {
								name: "string",
								suggestions: ["pretty", "json"],
							},
						},
						{
							name: ["-h", "--help"],
							description: "Help for list",
						},
						{
							name: ["-q", "--quiet"],
							description: "Only show context names",
						},
					],
				},
				{
					name: "rm",
					description: "Remove one or more contexts",
					args: { ...contextsArg, isVariadic: true },
					options: [
						{
							name: ["-f", "--force"],
							description: "Force removing current context",
						},
						{
							name: ["-h", "--help"],
							description: "Help for rm",
						},
					],
				},
				{
					name: "show",
					description: "Print the current context",
					options: [
						{
							name: ["-h", "--help"],
							description: "Help for show",
						},
					],
				},
				{
					name: "update",
					description: "Update a context",
					args: contextsArg,
					options: [
						{
							name: "--default-stack-orchestrator",
							description:
								"Default orchestrator for stack operations to use with this context (swarm|kubernetes|all)",
							args: {
								name: "string",
								suggestions: ["swarm", "kubernetes", "all"],
							},
						},
						{
							name: "--description",
							description: "Description of the context",
							args: {
								name: "string",
							},
						},
						{
							name: "--docker",
							description: "Set the docker endpoint (default [])",
							args: {
								name: "stringToString",
							},
						},
						{
							name: ["-h", "--help"],
							description: "Help for update",
						},
						{
							name: "--kubernetes",
							description: "Set the kubernetes endpoint (default [])",
							args: {
								name: "stringToString",
							},
						},
					],
				},
				{
					name: "use",
					description: "Set the default context",
					args: contextsArg,
					options: [
						{
							name: ["-h", "--help"],
							description: "Help for use",
						},
					],
				},
			],
			options: [
				{
					name: ["-h", "--help"],
					description: "Help for context",
				},
			],
		},
		{
			name: "image",
			description: "Manage images",
			subcommands: [
				sharedCommands.build,
				sharedCommands.history,
				sharedCommands.imageImport,
				{
					name: "inspect",
					description: "Display detailed information on one or more images",
					args: { ...imagesArg, isVariadic: true },
					options: [
						{
							name: "-f",
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
					],
				},
				sharedCommands.load,
				{ ...sharedCommands.imageList, name: "ls" },
				{
					name: "prune",
					description: "Remove unused images",
					options: [
						{
							name: ["-a", "--all"],
							description: "Remove all unused images, not just dangling ones",
						},
						{
							name: "--filter",
							description: "Provide filter values (e.g. 'until=<timestamp>')",
							args: {
								name: "filter",
							},
						},
						{
							name: ["-f", "--force"],
							description: "Do not prompt for confirmation",
						},
					],
				},
				sharedCommands.pull,
				sharedCommands.push,
				{ ...sharedCommands.removeImage, name: "rm" },
				sharedCommands.imageSave,
				sharedCommands.tag,
			],
		},
		{
			name: "network",
			description: "Manage networks",
			subcommands: [
				{
					name: "connect",
					description: "Connect a container to a network",
					args: [
						{
							name: "NETWORK",
							generators: dockerGenerators.listDockerNetworks,
						},
						containersArg,
					],
					options: [
						{
							name: "--alias",
							description: "Add network-scoped alias for the container",
							args: {
								name: "strings",
							},
						},
						{
							name: "--driver-opt",
							description: "Driver options for the network",
							args: {
								name: "strings",
							},
						},
						{
							name: "--ip",
							description: "IPv4 address (e.g., 172.30.100.104)",
							args: {
								name: "string",
							},
						},
						{
							name: "--ip6",
							description: "IPv6 address (e.g., 2001:db8::33)",
							args: {
								name: "string",
							},
						},
						{
							name: "--link",
							description: "Add link to another container",
							args: {
								name: "list",
							},
						},
						{
							name: "--link-local-ip",
							description: "Add a link-local address for the container",
							args: {
								name: "strings",
							},
						},
					],
				},
				{
					name: "create",
					description: "Create a network",
					args: {
						name: "NETWORK",
					},
					options: [
						{
							name: "--attachable",
							description: "Enable manual container attachment",
						},
						{
							name: "--aux-address",
							description:
								"Auxiliary IPv4 or IPv6 addresses used by Network driver (default map[])",
							args: {
								name: "map",
							},
						},
						{
							name: "--config-from",
							description: "The network from which to copy the configuration",
							args: {
								name: "string",
							},
						},
						{
							name: "--config-only",
							description: "Create a configuration only network",
						},
						{
							name: ["-d", "--driver"],
							description: 'Driver to manage the Network (default "bridge")',
							args: {
								name: "string",
							},
						},
						{
							name: "--gateway",
							description: "IPv4 or IPv6 Gateway for the master subnet",
							args: {
								name: "strings",
							},
						},
						{
							name: "--ingress",
							description: "Create swarm routing-mesh network",
						},
						{
							name: "--internal",
							description: "Restrict external access to the network",
						},
						{
							name: "--ip-range",
							description: "Allocate container ip from a sub-range",
							args: {
								name: "strings",
							},
						},
						{
							name: "--ipam-driver",
							description: 'IP Address Management Driver (default "default")',
							args: {
								name: "string",
							},
						},
						{
							name: "--ipam-opt",
							description: "Set IPAM driver specific options (default map[])",
							args: {
								name: "map",
							},
						},
						{
							name: "--ipv6",
							description: "Enable IPv6 networking",
						},
						{
							name: "--label",
							description: "Set metadata on a network",
							args: {
								name: "list",
							},
						},
						{
							name: ["-o", "--opt"],
							description: "Set driver specific options (default map[])",
							args: {
								name: "map",
							},
						},
						{
							name: "--scope",
							description: "Control the network's scope",
							args: {
								name: "string",
							},
						},
						{
							name: "--subnet",
							description:
								"Subnet in CIDR format that represents a network segment",
							args: {
								name: "strings",
							},
						},
					],
				},
				{
					name: "disconnect",
					description: "Disconnect a container from a network",
					args: [
						{
							name: "NETWORK",
							generators: dockerGenerators.listDockerNetworks,
						},
						containersArg,
					],
					options: [
						{
							name: ["-f", "--force"],
							description: "Force the container to disconnect from a network",
						},
					],
				},
				{
					name: "inspect",
					description: "Display detailed information on one or more networks",
					args: {
						name: "NETWORK",
						generators: dockerGenerators.listDockerNetworks,
						isVariadic: true,
					},
					options: [
						{
							name: ["-f", "--format"],
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
						{
							name: ["-v", "--verbose"],
							description: "Verbose output for diagnostics",
						},
					],
				},
				{
					name: "ls",
					description: "List networks",
					options: [
						{
							name: ["-f", "--filter"],
							description: "Provide filter values (e.g. 'driver=bridge')",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Pretty-print networks using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--no-trunc",
							description: "Do not truncate the output",
						},
						{
							name: ["-q", "--quiet"],
							description: "Only display network IDs",
						},
					],
				},
				{
					name: "prune",
					description: "Remove all unused networks",
					options: [
						{
							name: "--filter",
							description: "Provide filter values (e.g. 'until=<timestamp>')",
							args: {
								name: "filter",
							},
						},
						{
							name: ["-f", "--force"],
							description: "Do not prompt for confirmation",
						},
					],
				},
				{
					name: "rm",
					description: "Remove one or more networks",
					args: {
						name: "NETWORK",
						generators: dockerGenerators.listDockerNetworks,
						isVariadic: true,
					},
				},
			],
		},
		{
			name: "node",
			description: "Manage Swarm nodes",
			subcommands: [
				{
					name: "demote",
					description: "Demote one or more nodes from manager in the swarm",
					args: {
						name: "NODE",
						generators: dockerGenerators.listDockerSwarmNodes,
						isVariadic: true,
					},
				},
				{
					name: "inspect",
					description: "Display detailed information on one or more nodes",
					args: {
						name: "NODE",
						generators: dockerGenerators.listDockerSwarmNodes,
						isVariadic: true,
					},
					options: [
						{
							name: ["-f", "--format"],
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--pretty",
							description: "Print the information in a human friendly format",
						},
					],
				},
				{
					name: "ls",
					description: "List nodes in the swarm",
					options: [
						{
							name: ["-f", "--filter"],
							description: "Filter output based on conditions provided",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Pretty-print nodes using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: ["-q", "--quiet"],
							description: "Only display IDs",
						},
					],
				},
				{
					name: "promote",
					description: "Promote one or more nodes to manager in the swarm",
					args: {
						name: "NODE",
						generators: dockerGenerators.listDockerSwarmNodes,
						isVariadic: true,
					},
				},
				{
					name: "ps",
					description:
						"List tasks running on one or more nodes, defaults to current node",
					args: {
						name: "NODE",
						generators: dockerGenerators.listDockerSwarmNodes,
						isVariadic: true,
					},
					options: [
						{
							name: ["-f", "--filter"],
							description: "Filter output based on conditions provided",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Pretty-print tasks using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--no-resolve",
							description: "Do not map IDs to Names",
						},
						{
							name: "--no-trunc",
							description: "Do not truncate output",
						},
						{
							name: ["-q", "--quiet"],
							description: "Only display task IDs",
						},
					],
				},
				{
					name: "rm",
					description: "Remove one or more nodes from the swarm",
					args: {
						name: "NODE",
						generators: dockerGenerators.listDockerSwarmNodes,
						isVariadic: true,
					},
					options: [
						{
							name: ["-f", "--force"],
							description: "Force remove a node from the swarm",
						},
					],
				},
				{
					name: "update",
					description: "Update a node",
					args: {
						name: "NODE",
						generators: dockerGenerators.listDockerSwarmNodes,
						isVariadic: true,
					},
					options: [
						{
							name: "--availability",
							description:
								'Availability of the node ("active"|"pause"|"drain")',
							args: {
								name: "string",
							},
						},
						{
							name: "--label-add",
							description: "Add or update a node label (key=value)",
							args: {
								name: "list",
							},
						},
						{
							name: "--label-rm",
							description: "Remove a node label if exists",
							args: {
								name: "list",
							},
						},
						{
							name: "--role",
							description: 'Role of the node ("worker"|"manager")',
							args: {
								name: "string",
							},
						},
					],
				},
			],
		},
		{
			name: "buildx",
			description: "Extended build capabilities with BuildKit",
			subcommands: [
				{
					name: "bake",
					description:
						"Bake is a high-level build command. Each specified target will run in parallel as part of the build",
					args: {
						name: "string",
					},
					options: [
						{
							name: ["-f", "--file"],
							description: "Build definition file",
							args: {
								name: "string",
								isVariadic: true,
							},
						},
						{
							name: "--load",
							description: "Shorthand for --set=*.output=type=docker",
							args: {
								name: "string",
							},
						},
						{
							name: "--metadata-file",
							description: "Write build result metadata to the file",
							args: {
								name: "string",
							},
						},
						{
							name: "--no-cache",
							description: "Do not use cache when building the image",
							args: {
								name: "string",
							},
						},
						{
							name: "--print",
							description: "Print the options without building",
							args: {
								name: "string",
							},
						},
						{
							name: "--progress",
							description:
								"Set type of progress output (auto, plain, tty). Use plain to show container output",
							args: {
								name: "progress",
								default: "auto",
								suggestions: ["auto", "plain", "tty"],
							},
						},
						{
							name: "--pull",
							description: "Always attempt to pull all referenced images",
							args: {
								name: "string",
							},
						},
						{
							name: "--push",
							description: "Shorthand for --set=*.output=type=registry",
							args: {
								name: "string",
							},
						},
						{
							name: "--set",
							description:
								"Override target value (e.g., targetpattern.key=value)",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "build",
					description:
						"The buildx build command starts a build using BuildKit. This command is similar to the UI of docker build command and takes the same flags and arguments",
					args: {
						name: "string",
					},
					options: [
						{
							name: "--add-host",
							description: "Add a custom host-to-IP mapping",
							args: {
								name: "string",
							},
						},
						{
							name: "--allow",
							description: "Allow extra privileged entitlement",
							args: {
								name: "string",
							},
						},
						{
							name: "--build-arg",
							description: "Set build-time variables",
							args: {
								name: "string",
							},
						},
						{
							name: "--build-context",
							description: "Additional build contexts",
							args: {
								name: "string",
							},
						},
						{
							name: "--cache-from",
							description: "External cache sources",
							args: {
								name: "string",
							},
						},
						{
							name: "--cache-to",
							description: "Cache export destinations",
							args: {
								name: "string",
							},
						},
						{
							name: "--cgroup-parent",
							description: "Optional parent cgroup for the container",
							args: {
								name: "string",
							},
						},
						{
							name: "--compress",
							description: "Compress the build context using gzip",
							args: {
								name: "string",
							},
						},
						{
							name: "--cpu-period",
							description:
								"Limit the CPU CFS (Completely Fair Scheduler) period",
							args: {
								name: "string",
							},
						},
						{
							name: "--cpu-quota",
							description:
								"Limit the CPU CFS (Completely Fair Scheduler) quota",
							args: {
								name: "string",
							},
						},
						{
							name: ["--cpu-shares", "-c"],
							description: "CPU shares (relative weight)",
							args: {
								name: "string",
							},
						},
						{
							name: "--cpuset-cpus",
							description: "CPUs in which to allow execution (0-3, 0,1)",
							args: {
								name: "string",
							},
						},
						{
							name: "--cpuset-mems",
							description: "MEMs in which to allow execution (0-3, 0,1)",
							args: {
								name: "string",
							},
						},
						{
							name: ["--file", "-f"],
							description: "Name of the Dockerfile",
							args: {
								name: "string",
							},
						},
						{
							name: "--force-rm",
							description: "Always remove intermediate containers",
							args: {
								name: "string",
							},
						},
						{
							name: "--iidfile",
							description: "Write the image ID to the file",
							args: {
								name: "string",
							},
						},
						{
							name: "--invoke",
							description: "Invoke a command after the build [experimental]",
							args: {
								name: "string",
							},
						},
						{
							name: "--isolation",
							description: "Container isolation technology",
							args: {
								name: "string",
							},
						},
						{
							name: "--label",
							description: "Set metadata for an image",
							args: {
								name: "string",
							},
						},
						{
							name: "--load",
							description: "Shorthand for --output=type=docker",
							args: {
								name: "string",
							},
						},
						{
							name: ["--memory", "-m"],
							description: "Memory limit",
							args: {
								name: "string",
							},
						},
						{
							name: "--memory-swap",
							description:
								"Swap limit equal to memory plus swap: -1 to enable unlimited swap",
							args: {
								name: "string",
							},
						},
						{
							name: "--metadata-file",
							description: "Write build result metadata to the file",
							args: {
								name: "string",
							},
						},
						{
							name: "--network",
							description:
								"Set the networking mode for the RUN instructions during build",
							args: {
								name: "string",
							},
						},
						{
							name: "--no-cache",
							description: "Do not use cache when building the image",
							args: {
								name: "string",
							},
						},
						{
							name: "--no-cache-filter",
							description: "Do not cache specified stages",
							args: {
								name: "string",
							},
						},
						{
							name: ["--output", "-o"],
							description: "Output destination (format: type=local,dest=path)",
							args: {
								name: "string",
							},
						},
						{
							name: "--platform",
							description: "Set target platform for build",
							args: {
								name: "string",
							},
						},
						{
							name: "--print",
							description:
								"Print result of information request (e.g., outline, targets) [experimental]",
							args: {
								name: "string",
							},
						},
						{
							name: "--progress",
							description:
								"Set type of progress output (auto, plain, tty). Use plain to show container output",
							args: {
								name: "progress",
								default: "auto",
								suggestions: ["auto", "plain", "tty"],
							},
						},
						{
							name: "--pull",
							description: "Always attempt to pull all referenced images",
							args: {
								name: "string",
							},
						},
						{
							name: "--push",
							description: "Shorthand for --output=type=registry",
							args: {
								name: "string",
							},
						},
						{
							name: ["--quiet", "-q"],
							description:
								"Suppress the build output and print image ID on success",
							args: {
								name: "string",
							},
						},
						{
							name: "--rm",
							description:
								"Remove intermediate containers after a successful build",
							args: {
								name: "container",
								default: "true",
							},
						},
						{
							name: "--secret",
							description:
								"Secret to expose to the build (format: id=mysecret[,src=/local/secret])",
							args: {
								name: "string",
							},
						},
						{
							name: "--security-opt",
							description: "Security options",
							args: {
								name: "string",
							},
						},
						{
							name: "--shm-size",
							description: "Size of /dev/shm",
							args: {
								name: "string",
							},
						},
						{
							name: "--squash",
							description: "Squash newly built layers into a single new layer",
							args: {
								name: "string",
							},
						},
						{
							name: "--ssh",
							description:
								"SSH agent socket or keys to expose to the build (format: default|&lt;id&gt;[=&lt;socket&gt;|&lt;key&gt;[,&lt;key&gt;]])",
							args: {
								name: "string",
							},
						},
						{
							name: ["--tag", "-t"],
							description: "Name and optionally a tag (format: name:tag)",
							args: {
								name: "string",
							},
						},
						{
							name: "--target",
							description: "Set the target build stage to build",
							args: {
								name: "string",
							},
						},
						{
							name: "--ulimit",
							description: "Ulimit options",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "create",
					description: "Create a new builder instance",
					args: {
						name: "string",
					},
					options: [
						{
							name: "--append",
							description: "Append a node to builder instead of changing it",
							args: {
								name: "string",
							},
						},
						{
							name: "--bootstrap",
							description: "Boot builder after creation",
							args: {
								name: "string",
							},
						},
						{
							name: "--buildkitd-flags",
							description: "Flags for buildkitd daemon",
							args: {
								name: "string",
							},
						},
						{
							name: "--config",
							description: "BuildKit config file",
							args: {
								name: "string",
							},
						},
						{
							name: "--driver",
							description:
								"Driver to use (available: docker-container, kubernetes, remote)",
							args: {
								name: "string",
							},
						},
						{
							name: "--driver-opt",
							description: "Options for the driver",
							args: {
								name: "string",
							},
						},
						{
							name: "--leave",
							description: "Remove a node from builder instead of changing it",
							args: {
								name: "string",
							},
						},
						{
							name: "--name",
							description: "Builder instance name",
							args: {
								name: "string",
							},
						},
						{
							name: "--node",
							description: "Create/modify node with given name",
							args: {
								name: "string",
							},
						},
						{
							name: "--platform",
							description: "Fixed platforms for current node",
							args: {
								name: "string",
							},
						},
						{
							name: "--use",
							description: "Set the current builder instance",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "du",
					description: "Disk usage",
					args: {
						name: "string",
					},
					options: [
						{ name: "--filter", description: "Provide filter values" },
						{
							name: "--verbose",
							description: "Provide a more verbose output",
						},
					],
				},
				{
					name: "imagetools",
					description:
						"Imagetools contains commands for working with manifest lists in the registry. These commands are useful for inspecting multi-platform build results",
					args: {
						name: "string",
					},
					subcommands: [
						{
							name: "create",
							description: "Create a new image based on source images",
							args: {
								name: "string",
							},
							options: [
								{
									name: "--append",
									description: "Append to existing manifest",
									args: {
										name: "string",
									},
								},
								{
									name: "--dry-run",
									description: "Show final image instead of pushing",
									args: {
										name: "string",
									},
								},
								{
									name: ["--file", "-f"],
									description: "Read source descriptor from file",
									args: {
										name: "string",
									},
								},
								{
									name: "--progress",
									description:
										"Set type of progress output (auto, plain, tty). Use plain to show container output",
									args: {
										name: "progress",
										default: "auto",
										suggestions: ["auto", "plain", "tty"],
									},
								},
								{
									name: ["--tag", "-t"],
									description: "Set reference for new image",
									args: {
										name: "string",
									},
								},
							],
						},
						{
							name: "inspect",
							description: "Inspect current builder instance",
							args: {
								name: "string",
							},
							options: [
								{
									name: "--format",
									description: "Format the output using the given Go template",
									args: {
										name: "sting",
										default: "{{.Manifest}}",
									},
								},
								{
									name: "--raw",
									description: "Show original, unformatted JSON manifest",
								},
							],
						},
					],
				},
				{
					name: "inspect",
					description: "Inspect current builder instance",
					args: {
						name: "string",
					},
					options: [
						{
							name: "--bootstrap",
							description: "Ensure builder has booted before inspecting",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "install",
					description: "Install buildx as a ‘docker builder’ alias",
				},
				{
					name: "ls",
					description: "List builder instances",
				},
				{
					name: "prune",
					description: "Remove build cache",
					args: {
						name: "string",
					},
					options: [
						{
							name: ["--all", "-a"],
							description: "Include internal/frontend images",
							args: {
								name: "string",
							},
						},
						{
							name: "--filter",
							description: "Provide filter values (e.g., until=24h)",
							args: {
								name: "string",
							},
						},
						{
							name: ["--force", "-f"],
							description: "Do not prompt for confirmation",
							args: {
								name: "string",
							},
						},
						{
							name: "--keep-storage",
							description: "Amount of disk space to keep for cache",
							args: {
								name: "string",
							},
						},
						{
							name: "--verbose",
							description: "Provide a more verbose output",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "rm",
					description: "Remove a builder instance",
					args: {
						name: "string",
					},
					options: [
						{
							name: "--all-inactive",
							description: "Remove all inactive builders",
							args: {
								name: "string",
							},
						},
						{
							name: ["--force", "-f"],
							description: "Do not prompt for confirmation",
							args: {
								name: "string",
							},
						},
						{
							name: "--keep-daemon",
							description: "Keep the buildkitd daemon running",
							args: {
								name: "string",
							},
						},
						{
							name: "--keep-state",
							description: "Keep BuildKit state",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "stop",
					description: "Stop builder instance",
					args: {
						name: "string",
					},
				},
				{
					name: "uninstall",
					description: "Uninstall the ‘docker builder’ alias",
				},
				{
					name: "use",
					description: "Set the current builder instance",
					args: {
						name: "string",
					},
					options: [
						{
							name: "--default",
							description: "Set builder as default for current context",
							args: {
								name: "string",
							},
						},
						{
							name: "--global",
							description: "Builder persists context changes",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "version",
					description: "Show buildx version information",
				},
			],
			options: [
				{
					name: "--builder",
					description: "Override the configured builder instance",
					isPersistent: true,
					args: {
						name: "string",
					},
				},
			],
		},
		{
			name: "plugin",
			description: "Manage plugins",
			subcommands: [
				{
					name: "create",
					description:
						"Create a plugin from a rootfs and configuration. Plugin data directory must contain config.json and rootfs directory",
					args: [
						{ name: "PLUGIN" },
						{ name: "PLUGIN-DATA-DIR", template: "filepaths" },
					],
					options: [
						{
							name: "--compress",
							description: "Compress the context using gzip",
						},
					],
				},
				{
					name: "disable",
					description: "Disable a plugin",
					args: {
						name: "PLUGIN",
						generators: dockerGenerators.listDockerPlugins,
					},
					options: [
						{
							name: ["-f", "--force"],
							description: "Force the disable of an active plugin",
						},
					],
				},
				{
					name: "enable",
					description: "Enable a plugin",
					args: {
						name: "PLUGIN",
						generators: dockerGenerators.listDockerPlugins,
					},
					options: [
						{
							name: "--timeout",
							description: "HTTP client timeout (in seconds) (default 30)",
							args: {
								name: "int",
							},
						},
					],
				},
				{
					name: "inspect",
					description: "Display detailed information on one or more plugins",
					args: {
						name: "PLUGIN",
						generators: dockerGenerators.listDockerPlugins,
						isVariadic: true,
					},
					options: [
						{
							name: ["-f", "--format"],
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "install",
					description: "Install a plugin",
					args: [{ name: "PLUGIN" }, { name: "KEY=VALUE", isVariadic: true }],
					options: [
						{
							name: "--alias",
							description: "Local name for plugin",
							args: {
								name: "string",
							},
						},
						{
							name: "--disable",
							description: "Do not enable the plugin on install",
						},
						{
							name: "--disable-content-trust",
							description: "Skip image verification (default true)",
						},
						{
							name: "--grant-all-permissions",
							description: "Grant all permissions necessary to run the plugin",
						},
					],
				},
				{
					name: "ls",
					description: "List plugins",
					options: [
						{
							name: ["-f", "--filter"],
							description: "Provide filter values (e.g. 'enabled=true')",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Pretty-print plugins using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--no-trunc",
							description: "Don't truncate output",
						},
						{
							name: ["-q", "--quiet"],
							description: "Only display plugin IDs",
						},
					],
				},
				{
					name: "push",
					description: "Push a plugin to a registry",
					args: { name: "PLUGIN:[TAG]" },
					options: [
						{
							name: "--disable-content-trust",
							description: "Skip image signing (default true)",
						},
					],
				},
				{
					name: "rm",
					description: "Remove one or more plugins",
					args: {
						name: "PLUGIN",
						generators: dockerGenerators.listDockerPlugins,
						isVariadic: true,
					},
					options: [
						{
							name: ["-f", "--force"],
							description: "Force the removal of an active plugin",
						},
					],
				},
				{
					name: "set",
					description: "Change settings for a plugin",
					args: [
						{
							name: "PLUGIN",
							generators: dockerGenerators.listDockerPlugins,
						},
						{ name: "KEY=VALUE", isVariadic: true },
					],
				},
				{
					name: "upgrade",
					description: "Upgrade an existing plugin",
					args: [
						{
							name: "PLUGIN",
							generators: dockerGenerators.listDockerPlugins,
						},
						{ name: "REMOTE" },
					],
					options: [
						{
							name: "--disable-content-trust",
							description: "Skip image verification (default true)",
						},
						{
							name: "--grant-all-permissions",
							description: "Grant all permissions necessary to run the plugin",
						},
						{
							name: "--skip-remote-check",
							description:
								"Do not check if specified remote plugin matches existing plugin image",
						},
					],
				},
			],
		},
		{
			name: "secret",
			description: "Manage Docker secrets",
			subcommands: [
				{
					name: "create",
					description: "Create a secret from a file or STDIN as content",
					args: [
						{
							name: "SECRET NAME",
						},
						{
							name: "SECRET",
							template: "filepaths",
						},
					],
					options: [
						{
							name: ["-d", "--driver"],
							description: "Secret driver",
							args: {
								name: "string",
							},
						},
						{
							name: ["-l", "--label"],
							description: "Secret labels",
							args: {
								name: "list",
							},
						},
						{
							name: "--template-driver",
							description: "Template driver",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "inspect",
					description: "Display detailed information on one or more secrets",
					args: {
						name: "SECRET",
						generators: dockerGenerators.listDockerSecrets,
						isVariadic: true,
					},
					options: [
						{
							name: ["-f", "--format"],
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--pretty",
							description: "Print the information in a human friendly format",
						},
					],
				},
				{
					name: "ls",
					description: "List secrets",
					options: [
						{
							name: ["-f", "--filter"],
							description: "Filter output based on conditions provided",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Pretty-print secrets using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: ["-q", "--quiet"],
							description: "Only display IDs",
						},
					],
				},
				{
					name: "rm",
					description: "Remove one or more secrets",
					args: {
						name: "SECRET",
						generators: dockerGenerators.listDockerSecrets,
						isVariadic: true,
					},
				},
			],
		},
		{
			name: "service",
			description: "Manage services",
			subcommands: [
				{
					name: "create",
					description: "Create a new service",
					args: [
						imagesArg,
						{
							name: "COMMAND",
							isOptional: true,
							isCommand: true,
						},
					],
					options: [
						{
							name: "--cap-add",
							description: "Add Linux capabilities",
							args: {
								name: "list",
							},
						},
						{
							name: "--cap-drop",
							description: "Drop Linux capabilities",
							args: {
								name: "list",
							},
						},
						{
							name: "--config",
							description: "Specify configurations to expose to the service",
							args: {
								name: "config",
							},
						},
						{
							name: "--constraint",
							description: "Placement constraints",
							args: {
								name: "list",
							},
						},
						{
							name: "--container-label",
							description: "Container labels",
							args: {
								name: "list",
							},
						},
						{
							name: "--credential-spec",
							description:
								"Credential spec for managed service account (Windows only)",
							args: {
								name: "credential-spec",
							},
						},
						{
							name: ["-d", "--detach"],
							description:
								"Exit immediately instead of waiting for the service to converge",
						},
						{
							name: "--dns",
							description: "Set custom DNS servers",
							args: {
								name: "list",
							},
						},
						{
							name: "--dns-option",
							description: "Set DNS options",
							args: {
								name: "list",
							},
						},
						{
							name: "--dns-search",
							description: "Set custom DNS search domains",
							args: {
								name: "list",
							},
						},
						{
							name: "--endpoint-mode",
							description: 'Endpoint mode (vip or dnsrr) (default "vip")',
							args: {
								name: "string",
							},
						},
						{
							name: "--entrypoint",
							description: "Overwrite the default ENTRYPOINT of the image",
							args: {
								name: "command",
							},
						},
						{
							name: ["-e", "--env"],
							description: "Set environment variables",
							args: {
								name: "list",
							},
						},
						{
							name: "--env-file",
							description: "Read in a file of environment variables",
							args: {
								name: "list",
							},
						},
						{
							name: "--generic-resource",
							description: "User defined resources",
							args: {
								name: "list",
							},
						},
						{
							name: "--group",
							description:
								"Set one or more supplementary user groups for the container",
							args: {
								name: "list",
							},
						},
						{
							name: "--health-cmd",
							description: "Command to run to check health",
							args: {
								name: "string",
							},
						},
						{
							name: "--health-interval",
							description: "Time between running the check (ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--health-retries",
							description: "Consecutive failures needed to report unhealthy",
							args: {
								name: "int",
							},
						},
						{
							name: "--health-start-period",
							description:
								"Start period for the container to initialize before counting retries towards unstable (ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--health-timeout",
							description: "Maximum time to allow one check to run (ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--host",
							description:
								"Set one or more custom host-to-IP mappings (host:ip)",
							args: {
								name: "list",
							},
						},
						{
							name: "--hostname",
							description: "Container hostname",
							args: {
								name: "string",
							},
						},
						{
							name: "--init",
							description:
								"Use an init inside each service container to forward signals and reap processes",
						},
						{
							name: "--isolation",
							description: "Service container isolation mode",
							args: {
								name: "string",
							},
						},
						{
							name: ["-l", "--label"],
							description: "Service labels",
							args: {
								name: "list",
							},
						},
						{
							name: "--limit-cpu",
							description: "Limit CPUs",
							args: {
								name: "decimal",
							},
						},
						{
							name: "--limit-memory",
							description: "Limit Memory",
							args: {
								name: "bytes",
							},
						},
						{
							name: "--limit-pids",
							description:
								"Limit maximum number of processes (default 0 = unlimited)",
							args: {
								name: "int",
							},
						},
						{
							name: "--log-driver",
							description: "Logging driver for service",
							args: {
								name: "string",
							},
						},
						{
							name: "--log-opt",
							description: "Logging driver options",
							args: {
								name: "list",
							},
						},
						{
							name: "--max-concurrent",
							description:
								"Number of job tasks to run concurrently (default equal to --replicas)",
							args: {
								name: "uint",
							},
						},
						{
							name: "--mode",
							description:
								'Service mode (replicated, global, replicated-job, or global-job) (default "replicated")',
							args: {
								name: "string",
								suggestions: [
									"replicated",
									"global",
									"replicated-job",
									"global-job",
								],
							},
						},
						{
							name: "--mount",
							description: "Attach a filesystem mount to the service",
							args: {
								name: "mount",
							},
						},
						{
							name: "--name",
							description: "Service name",
							args: {
								name: "string",
							},
						},
						{
							name: "--network",
							description: "Network attachments",
							args: {
								name: "network",
							},
						},
						{
							name: "--no-healthcheck",
							description: "Disable any container-specified HEALTHCHECK",
						},
						{
							name: "--no-resolve-image",
							description:
								"Do not query the registry to resolve image digest and supported platforms",
						},
						{
							name: "--placement-pref",
							description: "Add a placement preference",
							args: {
								name: "pref",
							},
						},
						{
							name: ["-p", "--publish"],
							description: "Publish a port as a node port",
							args: {
								name: "port",
							},
						},
						{
							name: ["-q", "--quiet"],
							description: "Suppress progress output",
						},
						{
							name: "--read-only",
							description: "Mount the container's root filesystem as read only",
						},
						{
							name: "--replicas",
							description: "Number of tasks",
							args: {
								name: "uint",
							},
						},
						{
							name: "--replicas-max-per-node",
							description:
								"Maximum number of tasks per node (default 0 = unlimited)",
							args: {
								name: "uint",
							},
						},
						{
							name: "--reserve-cpu",
							description: "Reserve CPUs",
							args: {
								name: "decimal",
							},
						},
						{
							name: "--reserve-memory",
							description: "Reserve Memory",
							args: {
								name: "bytes",
							},
						},
						{
							name: "--restart-condition",
							description:
								'Restart when condition is met ("none"|"on-failure"|"any") (default "any")',
							args: {
								name: "string",
							},
						},
						{
							name: "--restart-delay",
							description:
								"Delay between restart attempts (ns|us|ms|s|m|h) (default 5s)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--restart-max-attempts",
							description: "Maximum number of restarts before giving up",
							args: {
								name: "uint",
							},
						},
						{
							name: "--restart-window",
							description:
								"Window used to evaluate the restart policy (ns|us|ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--rollback-delay",
							description:
								"Delay between task rollbacks (ns|us|ms|s|m|h) (default 0s)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--rollback-failure-action",
							description:
								'Action on rollback failure ("pause"|"continue") (default "pause")',
							args: {
								name: "string",
							},
						},
						{
							name: "--rollback-max-failure-ratio",
							description:
								"Failure rate to tolerate during a rollback (default 0)",
							args: {
								name: "float",
							},
						},
						{
							name: "--rollback-monitor",
							description:
								"Duration after each task rollback to monitor for failure (ns|us|ms|s|m|h) (default 5s)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--rollback-order",
							description:
								'Rollback order ("start-first"|"stop-first") (default "stop-first")',
							args: {
								name: "string",
							},
						},
						{
							name: "--rollback-parallelism",
							description:
								"Maximum number of tasks rolled back simultaneously (0 to roll back all at once) (default 1)",
							args: {
								name: "uint",
							},
						},
						{
							name: "--secret",
							description: "Specify secrets to expose to the service",
							args: {
								name: "secret",
							},
						},
						{
							name: "--stop-grace-period",
							description:
								"Time to wait before force killing a container (ns|us|ms|s|m|h) (default 10s)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--stop-signal",
							description: "Signal to stop the container",
							args: {
								name: "string",
							},
						},
						{
							name: "--sysctl",
							description: "Sysctl options",
							args: {
								name: "list",
							},
						},
						{
							name: ["-t", "--tty"],
							description: "Allocate a pseudo-TTY",
						},
						{
							name: "--ulimit",
							description: "Ulimit options (default [])",
							args: {
								name: "ulimit",
							},
						},
						{
							name: "--update-delay",
							description:
								"Delay between updates (ns|us|ms|s|m|h) (default 0s)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--update-failure-action",
							description:
								'Action on update failure ("pause"|"continue"|"rollback") (default "pause")',
							args: {
								name: "string",
							},
						},
						{
							name: "--update-max-failure-ratio",
							description:
								"Failure rate to tolerate during an update (default 0)",
							args: {
								name: "float",
							},
						},
						{
							name: "--update-monitor",
							description:
								"Duration after each task update to monitor for failure (ns|us|ms|s|m|h) (default 5s)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--update-order",
							description:
								'Update order ("start-first"|"stop-first") (default "stop-first")',
							args: {
								name: "string",
							},
						},
						{
							name: "--update-parallelism",
							description:
								"Maximum number of tasks updated simultaneously (0 to update all at once) (default 1)",
							args: {
								name: "uint",
							},
						},
						{
							name: ["-u", "--user"],
							description: "Username or UID (format: <name|uid>[:<group|gid>])",
							args: {
								name: "string",
							},
						},
						{
							name: "--with-registry-auth",
							description:
								"Send registry authentication details to swarm agents",
						},
						{
							name: ["-w", "--workdir"],
							description: "Working directory inside the container",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "inspect",
					description: "Display detailed information on one or more services",
					args: {
						name: "SERVICE",
						generators: dockerGenerators.listDockerServices,
						isVariadic: true,
					},
					options: [
						{
							name: ["-f", "--format"],
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--pretty",
							description: "Print the information in a human friendly format",
						},
					],
				},
				{
					name: "logs",
					description: "Fetch the logs of a service or task",
					args: {
						name: "SERVICE OR TASK",
						generators: dockerGenerators.listDockerServices,
					},
					options: [
						{
							name: "--details",
							description: "Show extra details provided to logs",
						},
						{
							name: ["-f", "--follow"],
							description: "Follow log output",
						},
						{
							name: "--no-resolve",
							description: "Do not map IDs to Names in output",
						},
						{
							name: "--no-task-ids",
							description: "Do not include task IDs in output",
						},
						{
							name: "--no-trunc",
							description: "Do not truncate output",
						},
						{
							name: "--raw",
							description: "Do not neatly format logs",
						},
						{
							name: "--since",
							description:
								"Show logs since timestamp (e.g. 2013-01-02T13:23:37Z) or relative (e.g. 42m for 42 minutes)",
							args: {
								name: "string",
							},
						},
						{
							name: ["-n", "--tail"],
							description:
								'Number of lines to show from the end of the logs (default "all")',
							args: {
								name: "string",
							},
						},
						{
							name: ["-t", "--timestamps"],
							description: "Show timestamps",
						},
					],
				},
				{
					name: "ls",
					description: "List services",
					options: [
						{
							name: ["-f", "--filter"],
							description: "Filter output based on conditions provided",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Pretty-print services using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: ["-q", "--quiet"],
							description: "Only display IDs",
						},
					],
				},
				{
					name: "ps",
					description: "List the tasks of one or more services",
					args: {
						name: "SERVICE",
						generators: dockerGenerators.listDockerServices,
						isVariadic: true,
					},
					options: [
						{
							name: ["-f", "--filter"],
							description: "Filter output based on conditions provided",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Pretty-print tasks using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--no-resolve",
							description: "Do not map IDs to Names",
						},
						{
							name: "--no-trunc",
							description: "Do not truncate output",
						},
						{
							name: ["-q", "--quiet"],
							description: "Only display task IDs",
						},
					],
				},
				{
					name: "rm",
					description: "Remove one or more services",
					args: {
						name: "SERVICE",
						generators: dockerGenerators.listDockerServices,
						isVariadic: true,
					},
				},
				{
					name: "rollback",
					description: "Revert changes to a service's configuration",
					args: {
						name: "SERVICE",
						generators: dockerGenerators.listDockerServices,
					},
					options: [
						{
							name: ["-d", "--detach"],
							description:
								"Exit immediately instead of waiting for the service to converge",
						},
						{
							name: ["-q", "--quiet"],
							description: "Suppress progress output",
						},
					],
				},
				{
					name: "scale",
					description: "Scale one or multiple replicated services",
					args: {
						name: "SERVICE=REPLICAS",
						generators: dockerGenerators.listDockerServicesReplicas,
						isVariadic: true,
					},
					options: [
						{
							name: ["-d", "--detach"],
							description:
								"Exit immediately instead of waiting for the service to converge",
						},
					],
				},
				{
					name: "update",
					description: "Update a service",
					args: {
						name: "SERVICE",
						generators: dockerGenerators.listDockerServices,
					},
					options: [
						{
							name: "--args",
							description: "Service command args",
							args: {
								name: "command",
							},
						},
						{
							name: "--cap-add",
							description: "Add Linux capabilities",
							args: {
								name: "list",
							},
						},
						{
							name: "--cap-drop",
							description: "Drop Linux capabilities",
							args: {
								name: "list",
							},
						},
						{
							name: "--config-add",
							description: "Add or update a config file on a service",
							args: {
								name: "config",
							},
						},
						{
							name: "--config-rm",
							description: "Remove a configuration file",
							args: {
								name: "list",
							},
						},
						{
							name: "--constraint-add",
							description: "Add or update a placement constraint",
							args: {
								name: "list",
							},
						},
						{
							name: "--constraint-rm",
							description: "Remove a constraint",
							args: {
								name: "list",
							},
						},
						{
							name: "--container-label-add",
							description: "Add or update a container label",
							args: {
								name: "list",
							},
						},
						{
							name: "--container-label-rm",
							description: "Remove a container label by its key",
							args: {
								name: "list",
							},
						},
						{
							name: "--credential-spec",
							description:
								"Credential spec for managed service account (Windows only)",
							args: {
								name: "credential-spec",
							},
						},
						{
							name: ["-d", "--detach"],
							description:
								"Exit immediately instead of waiting for the service to converge",
						},
						{
							name: "--dns-add",
							description: "Add or update a custom DNS server",
							args: {
								name: "list",
							},
						},
						{
							name: "--dns-option-add",
							description: "Add or update a DNS option",
							args: {
								name: "list",
							},
						},
						{
							name: "--dns-option-rm",
							description: "Remove a DNS option",
							args: {
								name: "list",
							},
						},
						{
							name: "--dns-rm",
							description: "Remove a custom DNS server",
							args: {
								name: "list",
							},
						},
						{
							name: "--dns-search-add",
							description: "Add or update a custom DNS search domain",
							args: {
								name: "list",
							},
						},
						{
							name: "--dns-search-rm",
							description: "Remove a DNS search domain",
							args: {
								name: "list",
							},
						},
						{
							name: "--endpoint-mode",
							description: "Endpoint mode (vip or dnsrr)",
							args: {
								name: "string",
							},
						},
						{
							name: "--entrypoint",
							description: "Overwrite the default ENTRYPOINT of the image",
							args: {
								name: "command",
							},
						},
						{
							name: "--env-add",
							description: "Add or update an environment variable",
							args: {
								name: "list",
							},
						},
						{
							name: "--env-rm",
							description: "Remove an environment variable",
							args: {
								name: "list",
							},
						},
						{
							name: "--force",
							description: "Force update even if no changes require it",
						},
						{
							name: "--generic-resource-add",
							description: "Add a Generic resource",
							args: {
								name: "list",
							},
						},
						{
							name: "--generic-resource-rm",
							description: "Remove a Generic resource",
							args: {
								name: "list",
							},
						},
						{
							name: "--group-add",
							description:
								"Add an additional supplementary user group to the container",
							args: {
								name: "list",
							},
						},
						{
							name: "--group-rm",
							description:
								"Remove a previously added supplementary user group from the container",
							args: {
								name: "list",
							},
						},
						{
							name: "--health-cmd",
							description: "Command to run to check health",
							args: {
								name: "string",
							},
						},
						{
							name: "--health-interval",
							description: "Time between running the check (ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--health-retries",
							description: "Consecutive failures needed to report unhealthy",
							args: {
								name: "int",
							},
						},
						{
							name: "--health-start-period",
							description:
								"Start period for the container to initialize before counting retries towards unstable (ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--health-timeout",
							description: "Maximum time to allow one check to run (ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--host-add",
							description: "Add a custom host-to-IP mapping (host:ip)",
							args: {
								name: "list",
							},
						},
						{
							name: "--host-rm",
							description: "Remove a custom host-to-IP mapping (host:ip)",
							args: {
								name: "list",
							},
						},
						{
							name: "--hostname",
							description: "Container hostname",
							args: {
								name: "string",
							},
						},
						{
							name: "--image",
							description: "Service image tag",
							args: {
								name: "string",
							},
						},
						{
							name: "--init",
							description:
								"Use an init inside each service container to forward signals and reap processes",
						},
						{
							name: "--isolation",
							description: "Service container isolation mode",
							args: {
								name: "string",
							},
						},
						{
							name: "--label-add",
							description: "Add or update a service label",
							args: {
								name: "list",
							},
						},
						{
							name: "--label-rm",
							description: "Remove a label by its key",
							args: {
								name: "list",
							},
						},
						{
							name: "--limit-cpu",
							description: "Limit CPUs",
							args: {
								name: "decimal",
							},
						},
						{
							name: "--limit-memory",
							description: "Limit Memory",
							args: {
								name: "bytes",
							},
						},
						{
							name: "--limit-pids",
							description:
								"Limit maximum number of processes (default 0 = unlimited)",
							args: {
								name: "int",
							},
						},
						{
							name: "--log-driver",
							description: "Logging driver for service",
							args: {
								name: "string",
							},
						},
						{
							name: "--log-opt",
							description: "Logging driver options",
							args: {
								name: "list",
							},
						},
						{
							name: "--max-concurrent",
							description:
								"Number of job tasks to run concurrently (default equal to --replicas)",
							args: {
								name: "uint",
							},
						},
						{
							name: "--mount-add",
							description: "Add or update a mount on a service",
							args: {
								name: "mount",
							},
						},
						{
							name: "--mount-rm",
							description: "Remove a mount by its target path",
							args: {
								name: "list",
							},
						},
						{
							name: "--network-add",
							description: "Add a network",
							args: {
								name: "network",
							},
						},
						{
							name: "--network-rm",
							description: "Remove a network",
							args: {
								name: "list",
							},
						},
						{
							name: "--no-healthcheck",
							description: "Disable any container-specified HEALTHCHECK",
						},
						{
							name: "--no-resolve-image",
							description:
								"Do not query the registry to resolve image digest and supported platforms",
						},
						{
							name: "--placement-pref-add",
							description: "Add a placement preference",
							args: {
								name: "pref",
							},
						},
						{
							name: "--placement-pref-rm",
							description: "Remove a placement preference",
							args: {
								name: "pref",
							},
						},
						{
							name: "--publish-add",
							description: "Add or update a published port",
							args: {
								name: "port",
							},
						},
						{
							name: "--publish-rm",
							description: "Remove a published port by its target port",
							args: {
								name: "port",
							},
						},
						{
							name: ["-q", "--quiet"],
							description: "Suppress progress output",
						},
						{
							name: "--read-only",
							description: "Mount the container's root filesystem as read only",
						},
						{
							name: "--replicas",
							description: "Number of tasks",
							args: {
								name: "uint",
							},
						},
						{
							name: "--replicas-max-per-node",
							description:
								"Maximum number of tasks per node (default 0 = unlimited)",
							args: {
								name: "uint",
							},
						},
						{
							name: "--reserve-cpu",
							description: "Reserve CPUs",
							args: {
								name: "decimal",
							},
						},
						{
							name: "--reserve-memory",
							description: "Reserve Memory",
							args: {
								name: "bytes",
							},
						},
						{
							name: "--restart-condition",
							description:
								'Restart when condition is met ("none"|"on-failure"|"any")',
							args: {
								name: "string",
							},
						},
						{
							name: "--restart-delay",
							description: "Delay between restart attempts (ns|us|ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--restart-max-attempts",
							description: "Maximum number of restarts before giving up",
							args: {
								name: "uint",
							},
						},
						{
							name: "--restart-window",
							description:
								"Window used to evaluate the restart policy (ns|us|ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--rollback",
							description: "Rollback to previous specification",
						},
						{
							name: "--rollback-delay",
							description: "Delay between task rollbacks (ns|us|ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--rollback-failure-action",
							description: 'Action on rollback failure ("pause"|"continue")',
							args: {
								name: "string",
							},
						},
						{
							name: "--rollback-max-failure-ratio",
							description: "Failure rate to tolerate during a rollback",
							args: {
								name: "float",
							},
						},
						{
							name: "--rollback-monitor",
							description:
								"Duration after each task rollback to monitor for failure (ns|us|ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--rollback-order",
							description: 'Rollback order ("start-first"|"stop-first")',
							args: {
								name: "string",
							},
						},
						{
							name: "--rollback-parallelism",
							description:
								"Maximum number of tasks rolled back simultaneously (0 to roll back all at once)",
							args: {
								name: "uint",
							},
						},
						{
							name: "--secret-add",
							description: "Add or update a secret on a service",
							args: {
								name: "secret",
							},
						},
						{
							name: "--secret-rm",
							description: "Remove a secret",
							args: {
								name: "list",
							},
						},
						{
							name: "--stop-grace-period",
							description:
								"Time to wait before force killing a container (ns|us|ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--stop-signal",
							description: "Signal to stop the container",
							args: {
								name: "string",
							},
						},
						{
							name: "--sysctl-add",
							description: "Add or update a Sysctl option",
							args: {
								name: "list",
							},
						},
						{
							name: "--sysctl-rm",
							description: "Remove a Sysctl option",
							args: {
								name: "list",
							},
						},
						{
							name: ["-t", "--tty"],
							description: "Allocate a pseudo-TTY",
						},
						{
							name: "--ulimit-add",
							description: "Add or update a ulimit option (default [])",
							args: {
								name: "ulimit",
							},
						},
						{
							name: "--ulimit-rm",
							description: "Remove a ulimit option",
							args: {
								name: "list",
							},
						},
						{
							name: "--update-delay",
							description: "Delay between updates (ns|us|ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--update-failure-action",
							description:
								'Action on update failure ("pause"|"continue"|"rollback")',
							args: {
								name: "string",
							},
						},
						{
							name: "--update-max-failure-ratio",
							description: "Failure rate to tolerate during an update",
							args: {
								name: "float",
							},
						},
						{
							name: "--update-monitor",
							description:
								"Duration after each task update to monitor for failure (ns|us|ms|s|m|h)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--update-order",
							description: 'Update order ("start-first"|"stop-first")',
							args: {
								name: "string",
							},
						},
						{
							name: "--update-parallelism",
							description:
								"Maximum number of tasks updated simultaneously (0 to update all at once)",
							args: {
								name: "uint",
							},
						},
						{
							name: ["-u", "--user"],
							description: "Username or UID (format: <name|uid>[:<group|gid>])",
							args: {
								name: "string",
							},
						},
						{
							name: "--with-registry-auth",
							description:
								"Send registry authentication details to swarm agents",
						},
						{
							name: ["-w", "--workdir"],
							description: "Working directory inside the container",
							args: {
								name: "string",
							},
						},
					],
				},
			],
		},
		{
			name: "stack",
			description: "Manage Docker stacks",
			subcommands: [
				{
					name: "deploy",
					description: "Deploy a new stack or update an existing stack",
					args: {
						name: "STACK",
					},
					options: [
						{
							name: ["-c", "--compose-file"],
							description: 'Path to a Compose file, or "-" to read from stdin',
							args: {
								name: "strings",
								template: "filepaths",
							},
						},
						{
							name: "--orchestrator",
							description: "Orchestrator to use (swarm|kubernetes|all)",
							args: {
								name: "string",
							},
						},
						{
							name: "--prune",
							description: "Prune services that are no longer referenced",
						},
						{
							name: "--resolve-image",
							description:
								'Query the registry to resolve image digest and supported platforms ("always"|"changed"|"never") (default "always")',
							args: {
								name: "string",
							},
						},
						{
							name: "--with-registry-auth",
							description:
								"Send registry authentication details to Swarm agents",
						},
					],
				},
				{
					name: "ls",
					description: "List stacks",
					options: [
						{
							name: "--format",
							description: "Pretty-print stacks using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--orchestrator",
							description: "Orchestrator to use (swarm|kubernetes|all)",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "ps",
					description: "List the tasks in the stack",
					args: {
						name: "STACK",
						generators: dockerGenerators.listDockerStacks,
					},
					options: [
						{
							name: ["-f", "--filter"],
							description: "Filter output based on conditions provided",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Pretty-print tasks using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--no-resolve",
							description: "Do not map IDs to Names",
						},
						{
							name: "--no-trunc",
							description: "Do not truncate output",
						},
						{
							name: "--orchestrator",
							description: "Orchestrator to use (swarm|kubernetes|all)",
							args: {
								name: "string",
							},
						},
						{
							name: ["-q", "--quiet"],
							description: "Only display task IDs",
						},
					],
				},
				{
					name: "rm",
					description: "Remove one or more stacks",
					args: {
						name: "STACK",
						generators: dockerGenerators.listDockerStacks,
						isVariadic: true,
					},
					options: [
						{
							name: "--orchestrator",
							description: "Orchestrator to use (swarm|kubernetes|all)",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "services",
					description: "List the services in the stack",
					args: {
						name: "STACK",
						generators: dockerGenerators.listDockerStacks,
					},
					options: [
						{
							name: ["-f", "--filter"],
							description: "Filter output based on conditions provided",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Pretty-print services using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--orchestrator",
							description: "Orchestrator to use (swarm|kubernetes|all)",
							args: {
								name: "string",
							},
						},
						{
							name: ["-q", "--quiet"],
							description: "Only display IDs",
						},
					],
				},
			],
		},
		{
			name: "swarm",
			description: "Manage Swarm",
			subcommands: [
				{
					name: "ca",
					description: "Display and rotate the root CA",
					options: [
						{
							name: "--ca-cert",
							description:
								"Path to the PEM-formatted root CA certificate to use for the new cluster",
							args: {
								name: "pem-file",
								template: "filepaths",
							},
						},
						{
							name: "--ca-key",
							description:
								"Path to the PEM-formatted root CA key to use for the new cluster",
							args: {
								name: "pem-file",
								template: "filepaths",
							},
						},
						{
							name: "--cert-expiry",
							description:
								"Validity period for node certificates (ns|us|ms|s|m|h) (default 2160h0m0s)",
							args: {
								name: "duration",
							},
						},
						{
							name: ["-d", "--detach"],
							description:
								"Exit immediately instead of waiting for the root rotation to converge",
						},
						{
							name: "--external-ca",
							description:
								"Specifications of one or more certificate signing endpoints",
							args: {
								name: "external-ca",
							},
						},
						{
							name: ["-q", "--quiet"],
							description: "Suppress progress output",
						},
						{
							name: "--rotate",
							description:
								"Rotate the swarm CA - if no certificate or key are provided, new ones will be generated",
						},
					],
				},
				{
					name: "init",
					description: "Initialize a swarm",
					options: [
						{
							name: "--advertise-addr",
							description: "Advertised address (format: <ip|interface>[:port])",
							args: {
								name: "string",
							},
						},
						{
							name: "--autolock",
							description:
								"Enable manager autolocking (requiring an unlock key to start a stopped manager)",
						},
						{
							name: "--availability",
							description:
								'Availability of the node ("active"|"pause"|"drain") (default "active")',
							args: {
								name: "string",
							},
						},
						{
							name: "--cert-expiry",
							description:
								"Validity period for node certificates (ns|us|ms|s|m|h) (default 2160h0m0s)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--data-path-addr",
							description:
								"Address or interface to use for data path traffic (format: <ip|interface>)",
							args: {
								name: "string",
							},
						},
						{
							name: "--data-path-port",
							description:
								"Port number to use for data path traffic (1024 - 49151). If no value is set or is set to 0, the default port (4789) is used",
							args: {
								name: "uint32",
							},
						},
						{
							name: "--default-addr-pool",
							description: "Default address pool in CIDR format (default [])",
							args: {
								name: "ipNetSlice",
							},
						},
						{
							name: "--default-addr-pool-mask-length",
							description:
								"Default address pool subnet mask length (default 24)",
							args: {
								name: "uint32",
							},
						},
						{
							name: "--dispatcher-heartbeat",
							description:
								"Dispatcher heartbeat period (ns|us|ms|s|m|h) (default 5s)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--external-ca",
							description:
								"Specifications of one or more certificate signing endpoints",
							args: {
								name: "external-ca",
							},
						},
						{
							name: "--force-new-cluster",
							description: "Force create a new cluster from current state",
						},
						{
							name: "--listen-addr",
							description:
								"Listen address (format: <ip|interface>[:port]) (default 0.0.0.0:2377)",
							args: {
								name: "node-addr",
							},
						},
						{
							name: "--max-snapshots",
							description: "Number of additional Raft snapshots to retain",
							args: {
								name: "uint",
							},
						},
						{
							name: "--snapshot-interval",
							description:
								"Number of log entries between Raft snapshots (default 10000)",
							args: {
								name: "uint",
							},
						},
						{
							name: "--task-history-limit",
							description: "Task history retention limit (default 5)",
							args: {
								name: "int",
							},
						},
					],
				},
				{
					name: "join",
					description: "Join a swarm as a node and/or manager",
					args: {
						name: "HOST:PORT",
					},
					options: [
						{
							name: "--advertise-addr",
							description: "Advertised address (format: <ip|interface>[:port])",
							args: {
								name: "string",
							},
						},
						{
							name: "--availability",
							description:
								'Availability of the node ("active"|"pause"|"drain") (default "active")',
							args: {
								name: "string",
							},
						},
						{
							name: "--data-path-addr",
							description:
								"Address or interface to use for data path traffic (format: <ip|interface>)",
							args: {
								name: "string",
							},
						},
						{
							name: "--listen-addr",
							description:
								"Listen address (format: <ip|interface>[:port]) (default 0.0.0.0:2377)",
							args: {
								name: "node-addr",
							},
						},
						{
							name: "--token",
							description: "Token for entry into the swarm",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "join-token",
					description: "Manage join tokens",
					args: {
						name: "worker or manager",
						suggestions: ["worker", "manager"],
					},
					options: [
						{
							name: ["-q", "--quiet"],
							description: "Only display token",
						},
						{
							name: "--rotate",
							description: "Rotate join token",
						},
					],
				},
				{
					name: "leave",
					description: "Leave the swarm",
					options: [
						{
							name: ["-f", "--force"],
							description:
								"Force this node to leave the swarm, ignoring warnings",
						},
					],
				},
				{
					name: "unlock",
					description: "Unlock swarm",
				},
				{
					name: "unlock-key",
					description: "Manage the unlock key",
					options: [
						{
							name: ["-q", "--quiet"],
							description: "Only display token",
						},
						{
							name: "--rotate",
							description: "Rotate unlock key",
						},
					],
				},
				{
					name: "update",
					description: "Update the swarm",
					options: [
						{
							name: "--autolock",
							description: "Change manager autolocking setting (true|false)",
							args: {
								suggestions: ["true", "false"],
							},
						},
						{
							name: "--cert-expiry",
							description:
								"Validity period for node certificates (ns|us|ms|s|m|h) (default 2160h0m0s)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--dispatcher-heartbeat",
							description:
								"Dispatcher heartbeat period (ns|us|ms|s|m|h) (default 5s)",
							args: {
								name: "duration",
							},
						},
						{
							name: "--external-ca",
							description:
								"Specifications of one or more certificate signing endpoints",
							args: {
								name: "external-ca",
							},
						},
						{
							name: "--max-snapshots",
							description: "Number of additional Raft snapshots to retain",
							args: {
								name: "uint",
							},
						},
						{
							name: "--snapshot-interval",
							description:
								"Number of log entries between Raft snapshots (default 10000)",
							args: {
								name: "uint",
							},
						},
						{
							name: "--task-history-limit",
							description: "Task history retention limit (default 5)",
							args: {
								name: "int",
							},
						},
					],
				},
			],
		},
		{
			name: "system",
			description: "Manage Docker",
			subcommands: [
				{
					name: "prune",
					description: "Remove unused data",
					options: [
						{
							name: ["-a", "--all"],
							description: "Remove all unused images not just dangling ones",
						},
						{
							name: "--filter",
							description: `Provide filter values (e.g. 'label=<key>=<value')`,
							args: {
								name: "filter",
							},
						},
						{
							name: ["-f", "--force"],
							description: "Do not prompt for confirmation",
						},
						{
							name: "--volumes",
							description: "Prune volumes",
						},
					],
				},
				{
					name: "df",
					description: "Show docker disk usage",
					options: [
						{
							name: "--format",
							description: "Pretty-print images using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: ["-v", "--verbose"],
							description: "Show detailed information on space usage",
						},
					],
				},
				{
					name: "events",
					description: "Get real time events from the server",
					options: [
						{
							name: ["-f", "--filter"],
							description: "Filter output based on conditions provided",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
						{
							name: "--since",
							description: "Show all events created since timestamp",
							args: {
								name: "string",
							},
						},
						{
							name: "--until",
							description: "Stream events until this timestamp",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "info",
					description: "Display system-wide information",
					options: [
						{
							name: ["-f", "--format"],
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
					],
				},
			],
		},
		{
			name: "trust",
			description: "Manage trust on Docker images",
			subcommands: [
				{
					name: "inspect",
					description: "Return low-level information about keys and signatures",
					args: {
						name: "IMAGE[:TAG]",
						isVariadic: true,
					},
					options: [
						{
							name: "--pretty",
							description: "Print the information in a human friendly format",
						},
					],
				},
				{
					name: "revoke",
					description: "Remove trust for an image",
					args: imagesArg,
					options: [
						{
							name: ["-y", "--yes"],
							description: "Do not prompt for confirmation",
						},
					],
				},
				{
					name: "sign",
					description: "Sign an image",
					args: imagesArg,
					options: [
						{
							name: "--local",
							description: "Sign a locally tagged image",
						},
					],
				},
			],
		},
		{
			name: "volume",
			description: "Manage volumes",
			subcommands: [
				{
					name: "create",
					description: "Create a volume",
					args: {
						name: "VOLUME",
					},
					options: [
						{
							name: ["-d", "--driver"],
							description: 'Specify volume driver name (default "local")',
							args: {
								name: "string",
							},
						},
						{
							name: "--label",
							description: "Set metadata for a volume",
							args: {
								name: "list",
							},
						},
						{
							name: ["-o", "--opt"],
							description: "Set driver specific options (default map[])",
							args: {
								name: "map",
							},
						},
					],
				},
				{
					name: "inspect",
					description: "Display detailed information on one or more volumes",
					args: {
						name: "VOLUME",
						generators: dockerGenerators.listDockerVolumes,
						isVariadic: true,
					},
					options: [
						{
							name: ["-f", "--format"],
							description: "Format the output using the given Go template",
							args: {
								name: "string",
							},
						},
					],
				},
				{
					name: "ls",
					description: "List volumes",
					options: [
						{
							name: ["-f", "--filter"],
							description: "Provide filter values (e.g. 'dangling=true')",
							args: {
								name: "filter",
							},
						},
						{
							name: "--format",
							description: "Pretty-print volumes using a Go template",
							args: {
								name: "string",
							},
						},
						{
							name: ["-q", "--quiet"],
							description: "Only display volume names",
						},
					],
				},
				{
					name: "prune",
					description: "Remove all unused local volumes",
					options: [
						{
							name: "--filter",
							description: "Provide filter values (e.g. 'label=<label>')",
							args: {
								name: "filter",
							},
						},
						{
							name: ["-f", "--force"],
							description: "Do not prompt for confirmation",
						},
					],
				},
				{
					name: "rm",
					description: "Remove one or more volumes",
					args: {
						name: "VOLUME",
						generators: dockerGenerators.listDockerVolumes,
						isVariadic: true,
					},
					options: [
						{
							name: ["-f", "--force"],
							description: "Force the removal of one or more volumes",
						},
					],
				},
			],
		},
		{
			name: "compose",
			description: "Define and run multi-container applications with Docker",
			loadSpec: "docker-compose",
		},
	],
};

export default completionSpec;
