const completionSpec: Fig.Spec = {
	name: "pkill",
	description:
		"Send  the  specified  signal  (by default SIGTERM) to each specified process",
	options: [
		{
			name: "--signal",
			description: "Signal to send (either number or name)",
			args: {
				name: "signal",
				description: "Signal to send",
				suggestions: [
					"SIGABRT",
					"SIGALRM",
					"SIGBUS",
					"SIGCHLD",
					"SIGCLD",
					"SIGCONT",
					"SIGEMT",
					"SIGFPE",
					"SIGHUP",
					"SIGILL",
					"SIGINFO",
					"SIGINT",
					"SIGIO",
					"SIGIOT",
					"SIGKILL",
					"SIGLOST",
					"SIGPIPE",
					"SIGPOLL",
					"SIGPROF",
					"SIGPWR",
					"SIGQUIT",
					"SIGSEGV",
					"SIGSTKFLT",
					"SIGSTOP",
					"SIGTSTP",
					"SIGSYS",
					"SIGTERM",
					"SIGTRAP",
					"SIGTTIN",
					"SIGTTOU",
					"SIGUNUSED",
					"SIGURG",
					"SIGUSR1",
					"SIGUSR2",
					"SIGVTALRM",
					"SIGXCPU",
					"SIGXFSZ",
					"SIGWINCH",
				],
			},
		},
		{
			name: ["-q", "--queue"],
			description: "Integer value to be sent with the signal",
			args: {
				name: "value",
			},
		},
		{
			name: ["-e", "--echo"],
			description: "Display what is killed",
		},
		{
			name: ["-f", "--full"],
			description: "Use full process name to match",
		},
		{
			name: ["-g", "--pgroup"],
			description: "Match listed process group IDs",
			args: {
				name: "PGID",
				isVariadic: true,
			},
		},
		{
			name: ["-G", "--group"],
			description: "Match real group IDs",
			args: {
				name: "GID",
				isVariadic: true,
			},
		},
		{
			name: ["-i", "--ignore-case"],
			description: "Match case insensitively",
		},
		{
			name: ["-n", "--newest"],
			description: "Select most recently started",
		},
		{
			name: ["-o", "--oldest"],
			description: "Select least recently started",
		},
		{
			name: ["-O", "--older"],
			description: "Select where older than seconds",
			args: {
				name: "seconds",
			},
		},
		{
			name: ["-P", "--parent"],
			description: "Match only child processes of the given parent",
			args: {
				name: "PPID",
				isVariadic: true,
			},
		},
		{
			name: ["-s", "--session"],
			description: "Match session IDs",
			args: {
				name: "SID",
				isVariadic: true,
			},
		},
		{
			name: ["-t", "--terminal"],
			description: "Match by controlling terminal",
			args: {
				name: "tty",
				isVariadic: true,
			},
		},
		{
			name: ["-u", "--euid"],
			description: "Match by effective IDs",
			args: {
				name: "ID",
				isVariadic: true,
			},
		},
		{
			name: ["-U", "--uid"],
			description: "Match by real IDs",
			args: {
				name: "ID",
				isVariadic: true,
			},
		},
		{
			name: ["-x", "--exact"],
			description: "Match exactly with the command name",
		},
		{
			name: ["-F", "--pidfile"],
			description: "Read PIDs from file",
			args: {
				name: "file",
				template: "filepaths",
			},
		},
		{
			name: ["-L", "logpidfile"],
			description: "Fail if PID file is not locked",
		},
		{
			name: ["-r", "--runstates"],
			description: "Match runstates",
			args: {
				name: "state",
			},
		},
		{
			name: "--ns",
			description: "Match the processes that belong to a specified PID",
			args: {
				name: "PID",
			},
		},
		{
			name: "--nslist",
			description:
				"List which namespaces will be considered for the --ns option",
			dependsOn: ["--ns"],
			args: {
				name: "ns",
				isVariadic: true,
				suggestions: ["ipc", "mnt", "net", "pid", "user", "uts"],
			},
		},
		{
			name: ["-h", "--help"],
			description: "Output help message and exit",
		},
		{
			name: ["-V", "--version"],
			description: "Output version information and exit",
		},
	],
	args: {
		name: "pattern",
		description:
			"Specifies an Extended Regular Expression for matching against the process names or command lines",
	},
};
export default completionSpec;
