const completionSpec: Fig.Spec = {
	name: "lsof",
	description: "List open files",
	args: {
		name: "names",
		description: "Select named files or files on named file systems",
		template: ["folders"],
		isVariadic: true,
		isOptional: true,
	},
	options: [
		{
			name: ["-?", "-h", "--help"],
			description: "Help",
		},
		{
			name: "-a",
			description: "Apply AND to the selections (defaults to OR)",
		},
		{
			name: "-b",
			description: "Avoid kernel blocks",
		},
		{
			name: "-c",
			description:
				"Select the listing of files for processes executing a command",
			args: {
				name: "string or regexp (optional ending with /i /b /x)",
			},
		},
		{
			name: "+c",
			description: "COMMAND width (9)",
			args: {
				name: "number",
			},
		},
		{
			name: "+d",
			description:
				"Search for all open instances/files/directories of directory",
			args: {
				name: "file",
				template: ["folders"],
			},
		},
		{
			name: "-d",
			description:
				"Specify a list of file descriptors (FDs) to exclude from or include in the output listing",
			args: {
				name: "File descriptor number",
			},
		},
		{
			name: "+D",
			description:
				"Search tree for all open instances/files/directories of directory. *SLOW?*",
			args: {
				name: "file",
				template: ["folders"],
			},
		},
		{
			name: "+f",
			description: "Enable path name arguments to be interpreted",
			args: {
				isOptional: true,
				name: "flags",
				suggestions: [
					{
						name: "c",
						description: "File structure use count",
					},
					{
						name: "g",
						description: "File flag abbreviations",
					},
					{
						name: "G",
						description: "File flags in hexadecimal",
					},
				],
			},
		},
		{
			name: "-f",
			description: "Inhibit path name arguments to be interpreted",
			args: {
				name: "flags",
				suggestions: [
					{
						name: "c",
						description: "File structure use count",
					},
					{
						name: "g",
						description: "File flag abbreviations",
					},
					{
						name: "G",
						description: "File flags in hexadecimal",
					},
				],
			},
		},
		{
			name: "-F",
			description: "Select fields to output",
			args: {
				name: "options",
				isVariadic: true,
				suggestions: [
					{
						name: "a",
						description: "Access: r = read; w = write; u = read/write",
					},
					{
						name: "c",
						description: "Command name",
					},
					{
						name: "C",
						description: "File struct share count",
					},
					{
						name: "d",
						description: "Device character code",
					},
					{
						name: "D",
						description: "Major/minor device number as 0x<hex>",
					},
					{
						name: "f",
						description: "File descriptor (always selected)",
					},
					{
						name: "G",
						description: "File flaGs",
					},
					{
						name: "i",
						description: "Inode number",
					},
					{
						name: "k",
						description: "Link count",
					},
					{
						name: "K",
						description: "Task ID (TID)",
					},
					{
						name: "l",
						description: "Lock: r/R = read; w/W = write; u = read/write",
					},
					{
						name: "L",
						description: "Login name",
					},
					{
						name: "m",
						description: "Marker between repeated output",
					},
					{
						name: "M",
						description: "Task comMand name",
					},
					{
						name: "n",
						description: "Comment, name, Internet addresses",
					},
					{
						name: "o",
						description: "File offset as 0t<dec> or 0x<hex>",
					},
					{
						name: "p",
						description: "Process ID (PID)",
					},
					{
						name: "g",
						description: "Process group ID (PGID)",
					},
					{
						name: "P",
						description: "Protocol name",
					},
					{
						name: "r",
						description: "Raw device number as 0x<hex>",
					},
					{
						name: "R",
						description: "PaRent PID",
					},
					{
						name: "s",
						description: "File size",
					},
					{
						name: "S",
						description: "Stream module and device names",
					},
					{
						name: "t",
						description: "File type",
					},
					{
						name: "T",
						description: "TCP/TPI info",
					},
					{
						name: "u",
						description: "User ID (UID)",
					},
					{
						name: "0",
						description: "(zero) use NUL field terminator instead of N",
					},
				],
			},
		},
		{
			name: "-F?",
			description: "Show fields for -F",
		},
		{
			name: "-g",
			description: "Exclude or select by process group IDs (PGID)",
			args: {
				name: "PGID",
				description: "Process Group ID (comma separated)",
			},
		},
		{
			name: "-i",
			// below you will find a valiant attempt to codify the following description into generators
			description:
				"Selects files by [46][protocol][@hostname|hostaddr][:service|port]",
			args: {
				name: "options",
				generators: [
					{
						script: ["echo"],
						postProcess: function () {
							const startParams = ["4", "6"];
							return startParams.map((param) => ({
								name: param,
							}));
						},
					},
					{
						script: ["echo"],
						postProcess: function (out, tokens) {
							const startParams = ["tcp", "udp", "TCP", "UDP"];
							const token =
								tokens[1].match(/^(-i[46])/) ||
								(tokens[2] && tokens[2].match(/^[46]/));
							const prefix = token && token.length > 0 ? token[1] : "";
							const result = startParams.map((param) => ({
								name: prefix + param,
							}));
							return result;
						},
					},
					{
						script: ["ifconfig"],
						postProcess: function (out, tokens) {
							const ips = out
								.split("\n")
								.filter((line) => line.match(/inet\b/))
								.map((line) => {
									const parts = line.split(" ");
									return parts[1];
								});
							let token = "@";
							if (tokens[1].match("@[^:]*$")) {
								token = tokens[1];
							} else if (tokens[2] && tokens[2].match("@[^:]*$")) {
								token = tokens[2];
							}
							const prefix = token.split("@")[0] + "@";
							const result = ips.map((ip) => ({
								name: prefix + ip,
							}));
							return result;
						},
						trigger: "@",
					},
					{
						script: ["echo"],
						postProcess: function (out, tokens) {
							const colonParams = ["http", "https", "who", "time"];
							let token = ":";
							if (tokens[1].match(":[^:]*")) {
								token = tokens[1];
							} else if (tokens[2] && tokens[2].match(":[^:]+")) {
								token = tokens[2];
							}
							const prefix = token.split(":")[0] + ":";

							return colonParams.map((param) => ({
								name: prefix + param,
							}));
						},
						trigger: ":",
					},
				],
			},
		},
		{
			name: "-l",
			description: "Inhibit conversion of user IDs to login names",
		},
		{
			name: "+L",
			description: "Enable listing of file link counts",
			args: {
				isOptional: true,
				name: "number",
			},
		},
		{
			name: "-L",
			description: "Disable listing of file link counts",
			args: {
				isOptional: true,
				name: "number",
			},
		},
		{
			name: "+M",
			description: "Enable portMap registration",
		},
		{
			name: "-M",
			description: "Disable portMap registration",
		},
		{
			name: "-n",
			description: "No host names",
		},
		{
			name: "-N",
			description: "Select NFS files",
		},
		{
			name: "-o",
			description: "List file offset",
		},
		{
			name: "-O",
			description: "No overhead *RISKY*",
		},
		{
			name: "-p",
			description: "Exclude or select process identification numbers (PIDs)",
			args: {
				name: "PIDs",
				description: "PIDs to select or exclude ( with ^)",
			},
		},
		{
			name: "-P",
			description: "No port names",
		},
		{
			name: "+r",
			description: "Repeat every t seconds (15) until no files",
			args: {
				name: "time (seconds)",
				description: "Time per repeat",
			},
		},
		{
			name: "-r",
			description: "Repeat every t seconds (15) forever",
			args: {
				name: "time (seconds)",
				description: "Time per repeat",
			},
		},
		{
			name: "-R",
			description: "List parent PID",
		},
		{
			name: "-s",
			description: "List file size or exclude/select protocol",
			args: {
				isOptional: true,
				name: "protocol:state",
			},
		},
		{
			name: "-S",
			description: "Stat timeout in seconds (lstat/readlink/stat)",
			args: {
				isOptional: true,
				name: "timeout (seconds)",
			},
		},
		{
			name: "-T",
			description: "Disable TCP/TPI info",
			args: {
				name: "info",
				suggestions: [
					{
						name: "f",
						description:
							"Selects reporting of socket options/states/values and tcp flag values",
					},
					{ name: "q", description: "Selects queue length reporting" },
					{ name: "s", description: "Selects connection state reporting" },
					{ name: "w", description: "Selects window size reporting" },
					{ name: "", description: "Disables info" },
				],
			},
		},
		{
			name: "-t",
			description: "Specify terse listing",
		},
		{
			name: "-u",
			description: "Exclude/select login|UID set",
			args: {
				name: "UIDs",
			},
		},
		{
			name: "-U",
			description: "Select Unix socket",
		},
		{
			name: "-v",
			description: "List version info",
		},
		{
			name: "-V",
			description: "Verbose search",
		},
		{
			name: "+w",
			description: "Enable warnings",
		},
		{
			name: "-w",
			description: "Disable warnings",
		},
		{
			name: "-x",
			description: "Cross over +d|+D File systems or symbolic links",
			args: {
				name: "cross-over option",
				suggestions: [
					{
						name: "f",
						description: "File system mount point cross-over processing",
					},
					{
						name: "l",
						description: "Symbolic link cross-over processing",
					},
				],
			},
		},
		{
			name: "-X",
			description: "File descriptor table only",
		},
	],
};

export default completionSpec;
