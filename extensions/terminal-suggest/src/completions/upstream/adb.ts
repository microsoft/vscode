const installOptions: Fig.Option[] = [
	{
		name: "-l",
		description: "Forward-lock the app",
	},
	{
		name: "-r",
		description: "Replace existing application",
	},
	{
		name: "-t",
		description: "Allow test packages",
	},
	{
		name: "-d",
		description: "Allow version code downgrade (debuggable packages only)",
	},
	{
		name: "-s",
		description: "Install on SD card instead of internal storage",
	},
	{
		name: "-g",
		description: "Grant all runtime permissions",
	},
	{
		description: "Override platform's default ABI",
		name: "--abi",
		args: {
			name: "ABI",
		},
	},
	{
		description: "Cause the app to be installed as an ephemeral install app",
		name: "--instant",
	},
	{
		description:
			"Always push APK to device and invoke Package Manager as separate steps",
		name: "--no-streaming",
	},
	{
		description: "Force streaming APK directly into Package Manager",
		name: "--streaming",
	},
	{
		description: "Use fast deploy",
		name: "--fastdeploy",
	},
	{
		description: "Prevent use of fast deploy",
		name: "--no-fastdeploy",
	},
	{
		description: "Force update of deployment agent when using fast deploy",
		name: "--force-agent",
	},
	{
		description:
			"Update deployment agent when local version is newer and using fast deploy",
		name: "--date-check-agent",
	},
	{
		description:
			"Update deployment agent when local version has different version code and using fast deploy",
		name: "--version-check-agent",
	},
	{
		description:
			"Locate agent files from local source build (instead of SDK location)",
		name: "--local-agent",
	},
];

const compressionOptions: Fig.Option[] = [
	{
		description:
			"Enable compression with a specified algorithm (any, none, brotli)",
		name: "-z",
		args: {
			name: "ALGORITHM",
			suggestions: [
				{
					name: "any",
				},
				{
					name: "none",
				},
				{
					name: "brotli",
				},
			],
		},
	},
	{
		description: "Disable compression",
		name: "-Z",
	},
];

const forwardConnectionSuggestions: Fig.Suggestion[] = [
	{
		name: "tcp",
		insertValue: "tcp:",
	},
	{
		name: "localabstract",
		insertValue: "localabstract:",
	},
	{
		name: "localreserved",
		insertValue: "localreserved:",
	},
	{
		name: "localfilesystem",
		insertValue: "localfilesystem:",
	},
	{
		name: "dev",
		insertValue: "dev:",
	},
	{
		name: "jdwp",
		insertValue: "jdwp:",
	},
	{
		name: "acceptfd",
		insertValue: "acceptfd:",
	},
];

const reverseConnectionSuggestions: Fig.Suggestion[] = [
	{
		name: "tcp",
		insertValue: "tcp:",
	},
	{
		name: "localabstract",
		insertValue: "localabstract:",
	},
	{
		name: "localreserved",
		insertValue: "localreserved:",
	},
	{
		name: "localfilesystem",
		insertValue: "localfilesystem:",
	},
];

const completionSpec: Fig.Spec = {
	name: "adb",
	description: "Android Debug Bridge",
	subcommands: [
		{
			name: "devices",
			description: "List connected devices",
			options: [
				{
					name: "-l",
					description: "Long output",
				},
			],
		},
		{
			name: "help",
			description: "Show this help message",
		},
		{
			name: "get-state",
			description: "Print offline | bootloader | device",
		},
		{
			name: "get-serialno",
			description: "Print <serial-number>",
		},
		{
			name: "get-devpath",
			description: "Print <device-path>",
		},
		{
			name: "remount",
			options: [
				{
					name: "-R",
					description: "Reboot device",
				},
			],
			description:
				"Remount partitions read-write. if a reboot is required, -R will automatically reboot the device",
		},
		{
			name: "jdwp",
			description: "List pids of processes hosting a JDWP transport",
		},
		{
			name: "root",
			description: "Restart adbd with root permissions",
		},
		{
			name: "unroot",
			description: "Restart adbd without root permissions",
		},
		{
			name: "usb",
			description: "Restart adbd listening on USB",
		},
		{
			name: "sideload",
			description: "Sideload the given full OTA package",
			args: {
				name: "OTAPACKAGE",
			},
		},
		{
			description: "Ensure that there is a server running",
			name: "start-server",
		},
		{
			description: "Kill the server if it is running",
			name: "kill-server",
		},
		{
			description: "Kick connection from host side to force reconnect",
			name: "reconnect",
			subcommands: [
				{
					description: "Kick connection from device side to force reconnect",
					name: "device",
				},
				{
					description: "Reset offline/unauthorized devices to force reconnect`",
					name: "offline",
				},
			],
		},
		{
			name: "tcpip",
			description: "Restart adbd listening on TCP on PORT",
			args: {
				name: "PORT",
			},
		},
		{
			name: "reboot",
			args: {
				isOptional: true,
				name: "type",
				suggestions: [
					{
						name: "bootloader",
					},
					{
						name: "recovery",
					},
					{
						name: "sideload",
					},
					{
						name: "sideload-auto-reboot",
					},
				],
			},
			description:
				"Reboot the device; defaults to booting system image but supports bootloader and recovery too. sideload reboots into recovery and automatically starts sideload mode, sideload-auto-reboot is the same but reboots after sideloading",
		},
		{
			name: "disable-verity",
			description: "Disable dm-verity checking on userdebug builds",
		},
		{
			name: "enable-verity",
			description: "Re-enable dm-verity checking on userdebug builds",
		},
		{
			name: "wait-for-device",
			description: "Wait for state=device",
		},
		{
			name: "wait-for-recovery",
			description: "Wait for state=recovery",
		},
		{
			name: "wait-for-rescue",
			description: "Wait for state=rescue",
		},
		{
			name: "wait-for-sideload",
			description: "Wait for state=sideload",
		},
		{
			name: "wait-for-bootloader",
			description: "Wait for state=bootloader",
		},
		{
			name: "wait-for-disconnect",
			description: "Wait for state=disconnect",
		},
		{
			name: "wait-for-usb-device",
			description: "Wait for usb in state=device",
		},
		{
			name: "wait-for-usb-recovery",
			description: "Wait for usb in state=recovery",
		},
		{
			name: "wait-for-usb-rescue",
			description: "Wait for usb in state=rescue",
		},
		{
			name: "wait-for-usb-sideload",
			description: "Wait for usb in state=sideload",
		},
		{
			name: "wait-for-usb-bootloader",
			description: "Wait for usb in state=bootloader",
		},
		{
			name: "wait-for-usb-disconnect",
			description: "Wait for usb in state=disconnect",
		},
		{
			name: "wait-for-local-device",
			description: "Wait for local in state=device",
		},
		{
			name: "wait-for-local-recovery",
			description: "Wait for local in state=recovery",
		},
		{
			name: "wait-for-local-rescue",
			description: "Wait for local in state=rescue",
		},
		{
			name: "wait-for-local-sideload",
			description: "Wait for local in state=sideload",
		},
		{
			name: "wait-for-local-bootloader",
			description: "Wait for local in state=bootloader",
		},
		{
			name: "wait-for-local-disconnect",
			description: "Wait for local in state=disconnect",
		},
		{
			name: "wait-for-any-device",
			description: "Wait for any in state=device",
		},
		{
			name: "wait-for-any-recovery",
			description: "Wait for any in state=recovery",
		},
		{
			name: "wait-for-any-rescue",
			description: "Wait for any in state=rescue",
		},
		{
			name: "wait-for-any-sideload",
			description: "Wait for any in state=sideload",
		},
		{
			name: "wait-for-any-bootloader",
			description: "Wait for any in state=bootloader",
		},
		{
			name: "wait-for-any-disconnect",
			description: "Wait for any in state=disconnect",
		},
		{
			name: "keygen",
			description:
				"Generate adb public/private key; private key stored in FILE",
			args: {
				name: "FILE",
				template: "filepaths",
			},
		},
		{
			name: "logcat",
			description: "Show device log (logcat --help for more)",
		},
		{
			name: "version",
			description: "Show version num",
		},
		{
			name: "connect",
			description: "Connect to a device via TCP/IP [default port=5555]",
			args: {
				name: "HOST[:PORT]",
			},
		},
		{
			name: "disconnect",
			description:
				"Disconnect from given TCP/IP device [default port=5555], or all",
			args: {
				name: "HOST[:PORT]",
				isOptional: true,
			},
		},
		{
			name: "uninstall",
			description: "Remove this app package from the device",
			options: [
				{
					name: "-k",
					description: "Keep the data and cache directories",
				},
			],
		},
		{
			name: "bugreport",
			description: "Write bugreport to given PATH [default=bugreport.zip];",
			args: {
				name: "PATH",
				isOptional: true,
			},
		},
		{
			name: "pair",
			description: "Pair with a device for secure TCP/IP communication",
			args: [
				{
					name: "HOST[:PORT]",
				},
				{
					name: "[PAIRING CODE]",
					isOptional: true,
				},
			],
		},
		{
			name: "ppp",
			description: "Run PPP over USB",
			args: [
				{
					name: "TTY",
				},
				{
					name: "[PARAMETER...]",
					isVariadic: true,
					isOptional: true,
				},
			],
		},
		{
			name: "emu",
			description: "Run emulator console command",
			args: {
				name: "COMMAND",
			},
		},
		{
			name: "install",
			description: "Push a single package to the device and install it",
			args: {
				name: "PACKAGE",
				template: "filepaths",
			},
			options: installOptions,
		},
		{
			name: "install-multiple",
			description:
				"Push multiple APKs to the device for a single package and install them",
			args: {
				name: "PACKAGE",
				template: "filepaths",
				isVariadic: true,
			},
			options: [
				{
					name: "-p",
					description: "Partial application install (install-multiple only)",
				},
				...installOptions,
			],
		},
		{
			name: "install-multi-package",
			description:
				"Push one or more packages to the device and install them atomically",
			args: {
				name: "PACKAGE",
				template: "filepaths",
				isVariadic: true,
			},
			options: [
				{
					name: "-p",
					description: "Partial application install (install-multiple only)",
				},
				...installOptions,
			],
		},
		{
			name: "shell",
			description:
				"Run remote shell command (interactive shell if no command given)",
			options: [
				{
					name: "-e",
					description: "Choose escape character, or `none` default '~'",
				},
				{
					name: "-n",
					description: "Don't read from stdin",
				},
				{
					name: "-T",
					description: "Disable pty allocation",
				},
				{
					name: "-t",
					description: "Allocate a pty if on a tty",
				},
				{
					name: "-tt",
					description: "-tt: force pty allocation",
				},
				{
					name: "-x",
					description: "Disable remote exit codes and stdout/stderr separation",
				},
			],
			args: {
				isOptional: true,
				name: "COMMANDS ...",
				isVariadic: true,
			},
		},
		{
			name: "mdns",
			description: "Mdns utils",
			subcommands: [
				{
					name: "check",
					description: "Check if mdns discovery is available",
				},
				{
					name: "services",
					description: "List all discovered services",
				},
			],
		},
		{
			name: "push",
			description: "Copy local files/directories to device",
			options: [
				{
					description:
						"Only push files that are newer on the host than the device",
					name: "--sync",
				},
				{
					description:
						"Dry run: push files to device without storing to the filesystem",
					name: "-n",
				},
				...compressionOptions,
			],
			args: [
				{
					name: "LOCAL",
					isVariadic: true,
					template: "filepaths",
				},
				{
					name: "REMOTE",
				},
			],
		},
		{
			name: "sync",
			description:
				"Sync a local build from $ANDROID_PRODUCT_OUT to the device (default all)",
			options: [
				{
					description:
						"Dry run: push files to device without storing to the filesystem",
					name: "-n",
				},
				{
					description: "List files that would be copied, but don't copy them",
					name: "-l",
				},
				...compressionOptions,
			],
			args: {
				isOptional: true,
				suggestions: [
					{
						name: "all",
					},
					{
						name: "data",
					},
					{
						name: "odm",
					},
					{
						name: "oem",
					},
					{
						name: "product",
					},
					{
						name: "system",
					},
					{
						name: "system_ext",
					},
					{
						name: "vendor",
					},
				],
			},
		},
		{
			name: "pull",
			description: "Copy files/dirs from device",
			options: [
				{
					description: "Preserve file timestamp and mode",
					name: "-a",
				},
				...compressionOptions,
			],
			args: [
				{
					name: "REMOTE",
					isVariadic: true,
					template: "filepaths",
				},
				{
					name: "LOCAL",
				},
			],
		},
		{
			name: "forward",
			description: "Forward connection",
			options: [
				{
					name: "--list",
					description: "List all forward socket connections",
				},
				{
					name: "--remove",
					description: "Remove specific forward socket connection",
					args: {
						name: "LOCAL",
					},
				},
				{
					name: "--remove-all",
					description: "Remove all forward socket connections",
				},
				{
					name: "--no-rebind",
					description:
						"Reversal fails if the specified socket is already bound through a previous reverse command",
				},
			],
			args: [
				{
					name: "LOCAL -> port|domain|device|pid",
					suggestions: forwardConnectionSuggestions,
				},
				{
					name: "REMOTE -> port|domain|device|pid",
					suggestions: forwardConnectionSuggestions,
				},
			],
		},
		{
			name: "reverse",
			description: "Reverse connection",
			options: [
				{
					name: "--list",
					description: "List all reverse socket connections from device",
				},
				{
					name: "--remove",
					description: "Remove specific reverse socket connection",
					args: {
						name: "REMOTE",
					},
				},
				{
					name: "--remove-all",
					description: "Remove all reverse socket connections from device",
				},
				{
					name: "--no-rebind",
					description:
						"Reversal fails if the specified socket is already bound through a previous reverse command",
				},
			],
			args: [
				{
					name: "REMOTE -> port|domain|device|pid",
					suggestions: reverseConnectionSuggestions,
				},
				{
					name: "LOCAL -> port|domain|device|pid",
					suggestions: reverseConnectionSuggestions,
				},
			],
		},
	],
	options: [
		{
			description: "Listen on all network interfaces, not just localhost",
			name: "-a",
		},
		{
			description: "Use USB device (error if multiple devices connected)",
			name: "-d",
		},
		{
			description:
				"Use TCP/IP device (error if multiple TCP/IP devices available)",
			name: "-e",
		},
		{
			description: "Use device with given serial (overrides $ANDROID_SERIAL)",
			name: "-s",
			args: {
				name: "SERIAL",
			},
		},
		{
			description: "Use device with given transport id",
			name: "-t",
			args: {
				name: "ID",
			},
		},
		{
			description: "Name of adb server host [default=localhost]",
			name: "-H",
			args: {
				name: "host name",
			},
		},
		{
			description: "Port of adb server [default=5037]",
			name: "-P",
			args: {
				name: "port",
			},
		},
		{
			description:
				"Listen on given socket for adb server [default=tcp:localhost:5037]",
			name: "-L",
			args: {
				name: "socket",
			},
		},
	],
};

export default completionSpec;
