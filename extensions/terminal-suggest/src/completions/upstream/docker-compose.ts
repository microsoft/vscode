const getComposeCommand = (tokens: string[]) =>
	tokens[0] === "docker" ? ["docker", "compose"] : ["docker-compose"];

const extractFileArgs = (tokens: string[]): string[] => {
	const files: string[] = [];
	for (let i = 0; i < tokens.length - 1; i++) {
		if (tokens[i] === "-f") {
			files.push(tokens[i + 1]);
			i += 1;
		}
	}
	return files.flatMap((f) => ["-f", f]);
};

const servicesGenerator: Fig.Generator = {
	script: (tokens) => {
		const compose = getComposeCommand(tokens);
		const fileArgs = extractFileArgs(tokens);
		return [...compose, ...fileArgs, "config", "--services"];
	},
	splitOn: "\n",
};

const profilesGenerator: Fig.Generator = {
	script: (tokens) => {
		const compose = getComposeCommand(tokens);
		const fileArgs = extractFileArgs(tokens);
		return [...compose, ...fileArgs, "config", "--profiles"];
	},
	splitOn: "\n",
};

const completionSpec: Fig.Spec = {
	name: "docker-compose",
	description: "Define and run multi-container applications with Docker",
	subcommands: [
		{
			name: "build",
			description: "Build or rebuild services",
			args: {
				name: "services",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: "--build-arg",
					description: "Set build-time variables for services",
					isRepeatable: true,
					args: {
						name: "key=value",
						generators: servicesGenerator,
					},
				},
				{
					name: "--compress",
					description: "Compress the build context using gzip. DEPRECATED",
					hidden: true,
					deprecated: true,
				},
				{
					name: "--force-rm",
					description: "Always remove intermediate containers. DEPRECATED",
					hidden: true,
					deprecated: true,
				},
				{
					name: ["--memory", "-m"],
					description:
						"Set memory limit for the build container. Not supported on buildkit yet",
					hidden: true,
					args: {
						name: "memory",
					},
				},
				{
					name: "--no-cache",
					description: "Do not use cache when building the image",
				},
				{
					name: "--no-rm",
					description:
						"Do not remove intermediate containers after a successful build. DEPRECATED",
					hidden: true,
					deprecated: true,
				},
				{
					name: "--parallel",
					description: "Build images in parallel. DEPRECATED",
					deprecated: true,
					hidden: true,
				},
				{
					name: "--progress",
					description: "Set type of progress output (auto, tty, plain, quiet)",
					args: {
						name: "progress",
						default: "auto",
						suggestions: ["auto", "tty", "plain", "quiet"],
					},
				},
				{
					name: "--pull",
					description: "Always attempt to pull a newer version of the image",
				},
				{
					name: ["--quiet", "-q"],
					description: "Don't print anything to STDOUT",
				},
				{
					name: "--ssh",
					description:
						"Set SSH authentications used when building service images. (use 'default' for using your default SSH Agent)",
					args: {
						name: "ssh",
					},
				},
			],
		},
		{
			name: ["config", "convert"],
			description: "Converts the compose file to platform's canonical format",
			args: {
				name: "services",
				isVariadic: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: "--format",
					description: "Format the output. Values: [yaml | json]",
					args: {
						name: "format",
						default: "yaml",
						suggestions: ["yaml", "json"],
					},
				},
				{
					name: "--hash",
					description: "Print the service config hash, one per line",
					args: {
						name: "hash",
					},
				},
				{
					name: "--images",
					description: "Print the image names, one per line",
				},
				{
					name: "--no-interpolate",
					description: "Don't interpolate environment variables",
				},
				{
					name: "--no-normalize",
					description: "Don't normalize compose model",
				},
				{
					name: ["--output", "-o"],
					description: "Save to file (default to stdout)",
					args: {
						name: "output",
						template: "filepaths",
						suggestCurrentToken: true,
					},
				},
				{
					name: "--profiles",
					description: "Print the profile names, one per line",
				},
				{
					name: ["--quiet", "-q"],
					description: "Only validate the configuration, don't print anything",
				},
				{
					name: "--resolve-image-digests",
					description: "Pin image tags to digests",
				},
				{
					name: "--services",
					description: "Print the service names, one per line",
				},
				{
					name: "--volumes",
					description: "Print the volume names, one per line",
				},
			],
		},
		{
			name: "cp",
			description:
				"Copy files/folders between a service container and the local filesystem",
			args: [{ name: "source path" }, { name: "dest path" }],
			options: [
				{
					name: "--all",
					description: "Copy to all the containers of the service",
					hidden: true,
				},
				{
					name: ["--archive", "-a"],
					description: "Archive mode (copy all uid/gid information)",
				},
				{
					name: ["--follow-link", "-L"],
					description: "Always follow symbol link in SRC_PATH",
				},
				{
					name: "--index",
					description:
						"Index of the container if there are multiple instances of a service",
					args: {
						name: "index",
						default: "0",
					},
				},
			],
		},
		{
			name: "create",
			description: "Creates containers for a service",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: "--build",
					description: "Build images before starting containers",
				},
				{
					name: "--force-recreate",
					description:
						"Recreate containers even if their configuration and image haven't changed",
				},
				{
					name: "--no-build",
					description: "Don't build an image, even if it's missing",
				},
				{
					name: "--no-recreate",
					description:
						"If containers already exist, don't recreate them. Incompatible with --force-recreate",
				},
			],
		},
		{
			name: "down",
			description: "Stop and remove containers, networks",
			options: [
				{
					name: "--remove-orphans",
					description:
						"Remove containers for services not defined in the Compose file",
				},
				{
					name: "--rmi",
					description:
						'Remove images used by services. "local" remove only images that don\'t have a custom tag ("local"|"all")',
					args: {
						name: "rmi",
					},
				},
				{
					name: ["--timeout", "-t"],
					description: "Specify a shutdown timeout in seconds",
					args: {
						name: "timeout",
						default: "10",
					},
				},
				{
					name: ["--volumes", "-v"],
					description:
						"Remove named volumes declared in the `volumes` section of the Compose file and anonymous volumes attached to containers",
				},
			],
		},
		{
			name: "events",
			description: "Receive real time events from containers",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: "--json",
					description: "Output events as a stream of json objects",
				},
			],
		},
		{
			name: "exec",
			description: "Execute a command in a running container",
			args: [
				{ name: "service", generators: servicesGenerator },
				{ name: "command", isCommand: true, isVariadic: true },
			],
			options: [
				{
					name: ["--detach", "-d"],
					description: "Detached mode: Run command in the background",
				},
				{
					name: ["--env", "-e"],
					description: "Set environment variables",
					isRepeatable: true,
					args: {
						name: "key=value",
					},
				},
				{
					name: "--index",
					description:
						"Index of the container if there are multiple instances of a service [default: 1]",
					args: {
						name: "index",
						default: "1",
					},
				},
				{
					name: ["--interactive", "-i"],
					description: "Keep STDIN open even if not attached",
					hidden: true,
				},
				{
					name: ["--no-TTY", "-T"],
					description:
						"Disable pseudo-TTY allocation. By default `docker compose exec` allocates a TTY",
				},
				{
					name: "--privileged",
					description: "Give extended privileges to the process",
				},
				{
					name: ["--tty", "-t"],
					description: "Allocate a pseudo-TTY",
					hidden: true,
				},
				{
					name: ["--user", "-u"],
					description: "Run the command as this user",
					args: {
						name: "user",
					},
				},
				{
					name: ["--workdir", "-w"],
					description: "Path to workdir directory for this command",
					args: {
						name: "workdir",
						template: "folders",
					},
				},
			],
		},
		{
			name: "images",
			description: "List images used by the created containers",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: ["--quiet", "-q"],
					description: "Only display IDs",
				},
			],
		},
		{
			name: "kill",
			description: "Force stop service containers",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: ["--signal", "-s"],
					description: "SIGNAL to send to the container",
					args: {
						name: "signal",
						default: "SIGKILL",
					},
				},
			],
		},
		{
			name: "logs",
			description: "View output from containers",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: ["--follow", "-f"],
					description: "Follow log output",
				},
				{
					name: "--no-color",
					description: "Produce monochrome output",
				},
				{
					name: "--no-log-prefix",
					description: "Don't print prefix in logs",
				},
				{
					name: "--since",
					description:
						"Show logs since timestamp (e.g. 2013-01-02T13:23:37Z) or relative (e.g. 42m for 42 minutes)",
					args: {
						name: "since",
					},
				},
				{
					name: "--tail",
					description:
						"Number of lines to show from the end of the logs for each container",
					args: {
						name: "lines",
						suggestions: ["all"],
						default: "all",
					},
				},
				{
					name: ["--timestamps", "-t"],
					description: "Show timestamps",
				},
				{
					name: "--until",
					description:
						"Show logs before a timestamp (e.g. 2013-01-02T13:23:37Z) or relative (e.g. 42m for 42 minutes)",
					args: {
						name: "timestamp",
					},
				},
			],
		},
		{
			name: "ls",
			description: "List running compose projects",
			options: [
				{
					name: ["--all", "-a"],
					description: "Show all stopped Compose projects",
				},
				{
					name: "--filter",
					description: "Filter output based on conditions provided",
					args: {
						name: "filter",
					},
				},
				{
					name: "--format",
					description: "Format the output. Values: [pretty | json]",
					args: {
						name: "format",
						default: "pretty",
						suggestions: ["pretty", "json"],
					},
				},
				{
					name: ["--quiet", "-q"],
					description: "Only display IDs",
				},
			],
		},
		{
			name: "pause",
			description: "Pause services",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
		},
		{
			name: "port",
			description: "Print the public port for a port binding",
			args: [
				{ name: "service", generators: servicesGenerator },
				{ name: "private_port" },
			],
			options: [
				{
					name: "--index",
					description:
						"Index of the container if service has multiple replicas",
					args: {
						name: "index",
						default: "1",
					},
				},
				{
					name: "--protocol",
					description: "Tcp or udp",
					args: {
						name: "protocol",
						default: "tcp",
						suggestions: ["tcp", "udp"],
					},
				},
			],
		},
		{
			name: "ps",
			description: "List containers",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: ["--all", "-a"],
					description:
						"Show all stopped containers (including those created by the run command)",
				},
				{
					name: "--filter",
					description:
						"Filter services by a property (supported filters: status)",
					args: {
						name: "filter",
					},
				},
				{
					name: "--format",
					description: "Format the output. Values: [pretty | json]",
					args: {
						name: "format",
						default: "pretty",
						suggestions: ["pretty", "json"],
					},
				},
				{
					name: ["--quiet", "-q"],
					description: "Only display IDs",
				},
				{
					name: "--services",
					description: "Display services",
				},
				{
					name: "--status",
					description:
						"Filter services by status. Values: [paused | restarting | removing | running | dead | created | exited]",
					isRepeatable: true,
					args: {
						name: "status",
						suggestions: [
							"paused",
							"restarting",
							"removing",
							"running",
							"dead",
							"created",
							"exited",
						],
					},
				},
			],
		},
		{
			name: "pull",
			description: "Pull service images",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: "--ignore-pull-failures",
					description: "Pull what it can and ignores images with pull failures",
				},
				{
					name: "--include-deps",
					description: "Also pull services declared as dependencies",
				},
				{
					name: "--no-parallel",
					description: "DEPRECATED disable parallel pulling",
					deprecated: true,
					hidden: true,
				},
				{
					name: "--parallel",
					description: "DEPRECATED pull multiple images in parallel",
					deprecated: true,
					hidden: true,
				},
				{
					name: ["--quiet", "-q"],
					description: "Pull without printing progress information",
				},
			],
		},
		{
			name: "push",
			description: "Push service images",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: "--ignore-push-failures",
					description: "Push what it can and ignores images with push failures",
				},
			],
		},
		{
			name: "restart",
			description: "Restart containers",
			options: [
				{
					name: ["--timeout", "-t"],
					description: "Specify a shutdown timeout in seconds",
					args: {
						name: "timeout",
						default: "10",
					},
				},
			],
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
		},
		{
			name: "rm",
			description: "Removes stopped service containers",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: ["--all", "-a"],
					description: "Deprecated - no effect",
					hidden: true,
				},
				{
					name: ["--force", "-f"],
					description: "Don't ask to confirm removal",
				},
				{
					name: ["--stop", "-s"],
					description: "Stop the containers, if required, before removing",
				},
				{
					name: ["--volumes", "-v"],
					description: "Remove any anonymous volumes attached to containers",
				},
			],
		},
		{
			name: "run",
			description: "Run a one-off command on a service",
			args: [
				{ name: "service", generators: servicesGenerator },
				{ name: "command", isCommand: true },
			],
			options: [
				{
					name: ["--detach", "-d"],
					description: "Run container in background and print container ID",
				},
				{
					name: "--entrypoint",
					description: "Override the entrypoint of the image",
					args: {
						name: "entrypoint",
					},
				},
				{
					name: ["--env", "-e"],
					description: "Set environment variables",
					isRepeatable: true,
					args: {
						name: "env",
					},
				},
				{
					name: ["--interactive", "-i"],
					description: "Keep STDIN open even if not attached",
				},
				{
					name: ["--label", "-l"],
					description: "Add or override a label",
					isRepeatable: true,
					args: {
						name: "label",
					},
				},
				{
					name: "--name",
					description: "Assign a name to the container",
					args: {
						name: "name",
					},
				},
				{
					name: ["--no-TTY", "-T"],
					description: "Disable pseudo-TTY allocation (default: auto-detected)",
				},
				{
					name: "--no-deps",
					description: "Don't start linked services",
				},
				{
					name: ["--publish", "-p"],
					description: "Publish a container's port(s) to the host",
					isRepeatable: true,
					args: {
						name: "publish",
					},
				},
				{
					name: "--quiet-pull",
					description: "Pull without printing progress information",
				},
				{
					name: "--rm",
					description: "Automatically remove the container when it exits",
				},
				{
					name: "--service-ports",
					description:
						"Run command with the service's ports enabled and mapped to the host",
				},
				{
					name: ["--tty", "-t"],
					description: "Allocate a pseudo-TTY",
					hidden: true,
				},
				{
					name: "--use-aliases",
					description:
						"Use the service's network useAliases in the network(s) the container connects to",
				},
				{
					name: ["--user", "-u"],
					description: "Run as specified username or uid",
					args: {
						name: "user",
					},
				},
				{
					name: ["--volume", "-v"],
					description: "Bind mount a volume",
					isRepeatable: true,
					args: {
						name: "volume",
					},
				},
				{
					name: ["--workdir", "-w"],
					description: "Working directory inside the container",
					args: {
						name: "workdir",
						template: "folders",
					},
				},
			],
		},
		{
			name: "start",
			description: "Start services",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
		},
		{
			name: "stop",
			description: "Stop services",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: ["--timeout", "-t"],
					description: "Specify a shutdown timeout in seconds",
					args: {
						name: "timeout",
						default: "10",
					},
				},
			],
		},
		{
			name: "top",
			description: "Display the running processes",
			args: {
				name: "service",
				isOptional: true,
				isVariadic: true,
				generators: servicesGenerator,
			},
		},
		{
			name: "unpause",
			description: "Unpause services",
			args: {
				name: "service",
				isOptional: true,
				isVariadic: true,
				generators: servicesGenerator,
			},
		},
		{
			name: "up",
			description: "Create and start containers",
			args: {
				name: "service",
				isVariadic: true,
				isOptional: true,
				generators: servicesGenerator,
			},
			options: [
				{
					name: "--abort-on-container-exit",
					description:
						"Stops all containers if any container was stopped. Incompatible with -d",
				},
				{
					name: "--always-recreate-deps",
					description:
						"Recreate dependent containers. Incompatible with --no-recreate",
				},
				{
					name: "--attach",
					description: "Attach to service output",
					isRepeatable: true,
					args: {
						name: "attach",
					},
				},
				{
					name: "--attach-dependencies",
					description: "Attach to dependent containers",
				},
				{
					name: "--build",
					description: "Build images before starting containers",
				},
				{
					name: ["--detach", "-d"],
					description: "Detached mode: Run containers in the background",
				},
				{
					name: "--exit-code-from",
					description:
						"Return the exit code of the selected service container. Implies --abort-on-container-exit",
					args: {
						name: "exit-code-from",
					},
				},
				{
					name: "--force-recreate",
					description:
						"Recreate containers even if their configuration and image haven't changed",
				},
				{
					name: "--no-build",
					description: "Don't build an image, even if it's missing",
				},
				{
					name: "--no-color",
					description: "Produce monochrome output",
				},
				{
					name: "--no-deps",
					description: "Don't start linked services",
				},
				{
					name: "--no-log-prefix",
					description: "Don't print prefix in logs",
				},
				{
					name: "--no-recreate",
					description:
						"If containers already exist, don't recreate them. Incompatible with --force-recreate",
				},
				{
					name: "--no-start",
					description: "Don't start the services after creating them",
				},
				{
					name: "--quiet-pull",
					description: "Pull without printing progress information",
				},
				{
					name: "--remove-orphans",
					description:
						"Remove containers for services not defined in the Compose file",
				},
				{
					name: ["--renew-anon-volumes", "-V"],
					description:
						"Recreate anonymous volumes instead of retrieving data from the previous containers",
				},
				{
					name: "--scale",
					description:
						"Scale SERVICE to NUM instances. Overrides the `scale` setting in the Compose file if present",
					isRepeatable: true,
					args: {
						name: "scale",
					},
				},
				{
					name: ["--timeout", "-t"],
					description:
						"Use this timeout in seconds for container shutdown when attached or when containers are already running",
					args: {
						name: "timeout",
						default: "10",
					},
				},
				{
					name: "--wait",
					description:
						"Wait for services to be running|healthy. Implies detached mode",
				},
			],
		},
		{
			name: "version",
			description: "Show the Docker Compose version information",
			options: [
				{
					name: ["--format", "-f"],
					description:
						"Format the output. Values: [pretty | json]. (Default: pretty)",
					args: {
						name: "format",
						suggestions: ["pretty", "json"],
					},
				},
				{
					name: "--short",
					description: "Shows only Compose's version number",
				},
			],
		},
	],
	options: [
		{
			name: "--ansi",
			description:
				'Control when to print ANSI control characters ("never"|"always"|"auto")',
			args: {
				name: "ansi",
				default: "auto",
				suggestions: ["never", "always", "auto"],
			},
		},
		{
			name: "--compatibility",
			description: "Run compose in backward compatibility mode",
		},
		{
			name: "--env-file",
			description: "Specify an alternate environment file",
			args: {
				name: "env-file",
				template: "filepaths",
			},
		},
		{
			name: ["--file", "-f"],
			description: "Compose configuration files",
			isRepeatable: true,
			args: {
				name: "file",
				template: "filepaths",
			},
		},
		{
			name: "--no-ansi",
			description: "Do not print ANSI control characters (DEPRECATED)",
			deprecated: true,
			hidden: true,
		},
		{
			name: "--profile",
			description: "Specify a profile to enable",
			isRepeatable: true,
			args: {
				name: "profile",
				generators: profilesGenerator,
			},
		},
		{
			name: "--project-directory",
			description:
				"Specify an alternate working directory (default: the path of the, first specified, Compose file)",
			args: {
				name: "project-directory",
				template: "folders",
			},
		},
		{
			name: ["--project-name", "-p"],
			description: "Project name",
			args: {
				name: "project-name",
			},
		},
		{
			name: "--verbose",
			description: "Show more output",
			hidden: true,
		},
		{
			name: "--workdir",
			description:
				"DEPRECATED! USE --project-directory INSTEAD. Specify an alternate working directory (default: the path of the, first specified, Compose file)",
			deprecated: true,
			hidden: true,
			args: {
				name: "workdir",
			},
		},
	],
};

export default completionSpec;
