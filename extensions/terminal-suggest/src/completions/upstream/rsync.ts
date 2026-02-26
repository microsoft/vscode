import { knownHosts, configHosts } from "./ssh";

const infoArgs: Fig.SingleOrArray<Fig.Arg> = [
	{ name: "BACKUP", description: "Mention files backed up" },
	{
		name: "COPY",
		description: "Mention files copied locally on the receiving side",
	},
	{ name: "DEL", description: "Mention deletions on the receiving side" },
	{
		name: "FLIST",
		description: "Mention file-list receiving/sending (levels 1-2)",
	},
	{
		name: "MISC",
		description: "Mention miscellaneous information (levels 1-2)",
	},
	{
		name: "MOUNT",
		description: "Mention mounts that were found or skipped",
	},
	{
		name: "NAME",
		description: "Mention 1) updated file/dir names, 2) unchanged names",
	},
	{
		name: "PROGRESS",
		description: "Mention 1) per-file progress or 2) total transfer progress",
	},
	{
		name: "REMOVE",
		description: "Mention files removed on the sending side",
	},
	{
		name: "SKIP",
		description: "Mention files that are skipped due to options used",
	},
	{
		name: "STATS",
		description: "Mention statistics at end of run (levels 1-3)",
	},
	{ name: "SYMSAFE", description: "Mention symlinks that are unsafe" },
	{ name: "ALL", description: "Set all --info options (e.g. all4)" },
	{
		name: "NONE",
		description: "Silence all --info options (same as all0)",
	},
	{ name: "HELP", description: "Output this help message" },
];

const debugArgs: Fig.SingleOrArray<Fig.Arg> = [
	{ name: "BACKUP", description: "Mention files backed up" },
	{
		name: "COPY",
		description: "Mention files copied locally on the receiving side",
	},
	{ name: "DEL", description: "Mention deletions on the receiving side" },
	{
		name: "FLIST",
		description: "Mention file-list receiving/sending (levels 1-2)",
	},
	{
		name: "MISC",
		description: "Mention miscellaneous information (levels 1-2)",
	},
	{
		name: "MOUNT",
		description: "Mention mounts that were found or skipped",
	},
	{
		name: "NAME",
		description: "Mention 1) updated file/dir names, 2) unchanged names",
	},
	{
		name: "PROGRESS",
		description: "Mention 1) per-file progress or 2) total transfer progress",
	},
	{
		name: "REMOVE",
		description: "Mention files removed on the sending side",
	},
	{
		name: "SKIP",
		description: "Mention files that are skipped due to options used",
	},
	{
		name: "STATS",
		description: "Mention statistics at end of run (levels 1-3)",
	},
	{ name: "SYMSAFE", description: "Mention symlinks that are unsafe" },
	{ name: "ALL", description: "Set all --info options (e.g. all4)" },
	{
		name: "NONE",
		description: "Silence all --info options (same as all0)",
	},
	{ name: "HELP", description: "Output this help message" },
];

const completionSpec: Fig.Spec = {
	name: "rsync",
	description:
		"Rsync is a file transfer program capable of efficient remote update via a fast differencing algorithm",
	args: [
		{
			name: "SRC",
			isVariadic: true,
			generators: [
				knownHosts,
				configHosts,
				{ template: ["history", "filepaths", "folders"] },
			],
		},
		{
			name: "DEST",
			generators: [
				knownHosts,
				configHosts,
				{ template: ["history", "filepaths", "folders"] },
			],
		},
	],
	options: [
		{
			name: ["-v", "--verbose"],
			description: "Increase verbosity",
		},
		{
			name: "--info",
			description: "Fine-grained informational verbosity",
			requiresSeparator: true,
			args: infoArgs,
		},
		{
			name: "--debug",
			description: "Fine-grained debug verbosity",
			requiresSeparator: true,
			args: debugArgs,
		},
		{
			name: "--msgs2stderr",
			description: "Special output handling for debugging",
		},
		{
			name: ["--quiet", "-q"],
			description: "Suppress non-error messages",
		},
		{
			name: "--no-motd",
			description: "Suppress daemon-mode MOTD (see manpage caveat)",
		},
		{
			name: ["--checksum", "-c"],
			description: "Skip based on checksum, not mod-time & size",
		},
		{
			name: ["-a", "--archive"],
			description: "Archive mode; equals -rlptgoD (no -H,-A,-X)",
			exclusiveOn: ["-H", "-A", "-X"],
		},
		{
			name: "--no-OPTION",
			description: "Turn off an implied OPTION (e.g. --no-D)",
		},
		{ name: ["-r", "--recursive"], description: "Recurse into directories" },
		{ name: ["-R", "--relative"], description: "Use relative path names" },
		{
			name: "--no-implied-dirs",
			description: "Don't send implied dirs with --relative",
			dependsOn: ["--relative"],
		},
		{
			name: ["-b", "--backup"],
			description: "Make backups (see --suffix & --backup-dir)",
		},
		{
			name: "--backup-dir",
			description: "Make backups into hierarchy based in DIR",
			requiresSeparator: true,
			args: {
				name: "DIR",
				template: "folders",
			},
		},
		{
			name: "--suffix",
			description: "Set backup suffix (default ~ w/o --backup-dir)",
			requiresSeparator: true,
			args: {
				name: "SUFFIX",
			},
		},
		{
			name: ["-u", "--update"],
			description: "Skip files that are newer on the receiver",
		},
		{
			name: "--inplace",
			description: "Update destination files in-place (SEE MAN PAGE)",
		},
		{ name: "--append", description: "Append data onto shorter files" },
		{
			name: "--append-verify",
			description: "Like --append, but with old data in file checksum",
		},
		{
			name: ["-d", "--dirs"],
			description: "Transfer directories without recursing",
			args: {
				name: "DIR",
				template: "folders",
			},
		},
		{ name: ["-l", "--links"], description: "Copy symlinks as symlinks" },
		{
			name: ["-L", "--copy-links"],
			description: "Transform symlink into referent file/dir",
		},
		{
			name: "--copy-unsafe-links",
			description: 'Only "unsafe" symlinks are transformed',
		},
		{
			name: "--safe-links",
			description: "Ignore symlinks that point outside the source tree",
		},
		{
			name: "--munge-links",
			description: "Munge symlinks to make them safer (but unusable)",
		},
		{
			name: ["-k", "--copy-dirlinks"],
			description: "Transform symlink to a dir into referent dir",
		},
		{
			name: ["-K", "--keep-dirlinks"],
			description: "Treat symlinked dir on receiver as dir",
		},
		{ name: ["-H", "--hard-links"], description: "Preserve hard links" },
		{ name: ["-p", "--perms"], description: "Preserve permissions" },
		{
			name: ["-E", "--executability"],
			description: "Preserve the file's executability",
		},
		{
			name: "--chmod",
			description: "Affect file and/or directory permissions",
			requiresSeparator: true,
			args: {
				name: "CHMOD",
			},
		},
		{
			name: ["-A", "--acls"],
			description: "Preserve ACLs (implies --perms)",
			dependsOn: ["--perms"],
		},
		{ name: ["-X", "--xattrs"], description: "Preserve extended attributes" },
		{
			name: ["-o", "--owner"],
			description: "Preserve owner (super-user only)",
		},
		{ name: ["-g", "--group"], description: "Preserve group" },
		{
			name: "--devices",
			description: "Preserve device files (super-user only)",
		},
		{
			name: "--copy-devices",
			description: "Copy device contents as regular file",
		},
		{ name: "--specials", description: "Preserve special files" },
		{ name: "-D", description: "Same as --devices --specials" },
		{ name: ["-t", "--times"], description: "Preserve modification times" },
		{
			name: ["-O", "--omit-dir-times"],
			description: "Omit directories from --times",
			dependsOn: ["--times"],
			args: {
				name: "DIR",
				template: "folders",
				isVariadic: true,
			},
		},
		{
			name: ["-J", "--omit-link-times"],
			description: "Omit symlinks from --times",
			dependsOn: ["--times"],
		},
		{ name: "--super", description: "Receiver attempts super-user activities" },
		{
			name: "--fake-super",
			description: "Store/recover privileged attrs using xattrs",
		},
		{
			name: ["-S", "--sparse"],
			description: "Turn sequences of nulls into sparse blocks",
		},
		{
			name: "--preallocate",
			description: "Allocate dest files before writing them",
		},
		{
			name: ["-n", "--dry-run"],
			description: "Perform a trial run with no changes made",
		},
		{
			name: ["-W", "--whole-file"],
			description: "Copy files whole (without delta-xfer algorithm)",
		},
		{
			name: "--checksum-choice",
			description: "Choose the checksum algorithms",
			requiresSeparator: true,
			args: {
				name: "ALGORITHM",
				suggestions: ["auto", "md4", "md5", "none"],
			},
		},
		{
			name: ["-x", "--one-file-system"],
			description: "Don't cross filesystem boundaries",
		},
		{
			name: ["-B", "--block-size"],
			description: "Force a fixed checksum block-size",
			requiresSeparator: true,
			args: {
				name: "SIZE",
			},
		},
		{
			name: ["-e", "--rsh"],
			description: "Specify the remote shell to use",
			requiresSeparator: true,
			args: {
				name: "COMMAND",
			},
		},
		{
			name: "--rsync-path",
			description: "Specify the rsync to run on the remote machine",
			requiresSeparator: true,
			args: {
				name: "PATH",
			},
		},
		{ name: "--existing", description: "Skip creating new files on receiver" },
		{
			name: "--ignore-existing",
			description: "Skip updating files that already exist on receiver",
		},
		{
			name: "--remove-source-files",
			description: "Sender removes synchronized files (non-dirs)",
		},
		{
			name: "--delete",
			description: "Delete extraneous files from destination dirs",
		},
		{
			name: "--delete-before",
			description: "Receiver deletes before transfer, not during",
		},
		{
			name: ["--delete-during", "--del"],
			description: "Receiver deletes during the transfer",
		},
		{
			name: "--delete-delay",
			description: "Find deletions during, delete after",
		},
		{
			name: "--delete-after",
			description: "Receiver deletes after transfer, not during",
		},
		{
			name: "--delete-excluded",
			description: "Also delete excluded files from destination dirs",
		},
		{
			name: "--ignore-missing-args",
			description: "Ignore missing source args without error",
		},
		{
			name: "--delete-missing-args",
			description: "Delete missing source args from destination",
		},
		{
			name: "--ignore-errors",
			description: "Delete even if there are I/O errors",
		},
		{
			name: "--force",
			description: "Force deletion of directories even if not empty",
		},
		{
			name: "--max-delete",
			description: "Don't delete more than NUM files",
			requiresSeparator: true,
			args: {
				name: "NUM",
			},
		},
		{
			name: "--max-size",
			description: "Don't transfer any file larger than SIZE",
			requiresSeparator: true,
			args: {
				name: "SIZE",
			},
		},
		{
			name: "--min-size",
			description: "Don't transfer any file smaller than SIZE",
			requiresSeparator: true,
			args: {
				name: "SIZE",
			},
		},
		{ name: "--partial", description: "Keep partially transferred files" },
		{
			name: "--partial-dir=DIR",
			description: "Put a partially transferred file into DIR",
			requiresSeparator: true,
			args: {
				name: "DIR",
				template: "folders",
			},
		},
		{
			name: "--delay-updates",
			description: "Put all updated files into place at transfer's end",
		},
		{
			name: ["-m", "--prune-empty-dirs"],
			description: "Prune empty directory chains from the file-list",
		},
		{
			name: "--numeric-ids",
			description: "Don't map uid/gid values by user/group name",
		},
		{
			name: "--usermap",
			description: "Custom username mapping",
			requiresSeparator: true,
			args: {
				name: "STRING",
			},
		},
		{
			name: "--groupmap",
			description: "Custom groupname mapping",
			requiresSeparator: true,
			args: {
				name: "STRING",
			},
		},
		{
			name: "--chown=USER:GROUP",
			description: "Simple username/groupname mapping",
			requiresSeparator: true,
			args: {
				name: "USER:GROUP",
			},
		},
		{
			name: "--timeout",
			description: "Set I/O timeout in seconds",
			requiresSeparator: true,
			args: {
				name: "SECONDS",
			},
		},
		{
			name: "--contimeout",
			description: "Set daemon connection timeout in seconds",
			requiresSeparator: true,
			args: {
				name: "SECONDS",
			},
		},
		{
			name: ["-I", "--ignore-times"],
			description: "Don't skip files that match in size and mod-time",
		},
		{
			name: "-M",
			description: "Send OPTION to the remote side only",
			args: {
				name: "OPTION",
			},
		},
		{
			name: "--remote-option",
			description: "Send OPTION to the remote side only",
			requiresSeparator: true,
			args: {
				name: "OPTION",
			},
		},
		{ name: "--size-only", description: "Skip files that match in size" },
		{
			name: "-@",
			description: "Set the accuracy for mod-time comparisons",
			args: {
				name: "NUM",
			},
		},
		{
			name: "--modify-window",
			description: "Set the accuracy for mod-time comparisons",
			requiresSeparator: true,
			args: {
				name: "NUM",
			},
		},
		{
			name: "-T",
			description: "Create temporary files in directory DIR",
			args: {
				name: "DIR",
				template: "folders",
			},
		},
		{
			name: "--temp-dir",
			description: "Create temporary files in directory DIR",
			requiresSeparator: true,
			args: {
				name: "DIR",
				template: "folders",
			},
		},
		{
			name: ["-y", "--fuzzy"],
			description: "Find similar file for basis if no dest file",
		},
		{
			name: "--compare-dest",
			description: "Also compare destination files relative to DIR",
			requiresSeparator: true,
			args: {
				name: "DIR",
				template: "folders",
			},
		},
		{
			name: "--copy-dest",
			description:
				"Also compare destination files relative to DIR and include copies of unchanged files",
			args: {
				name: "DIR",
				template: "folders",
			},
		},
		{
			name: "--link-dest",
			description: "Hardlink to files in DIR when unchanged",
			requiresSeparator: true,
			args: {
				name: "DIR",
				template: "folders",
			},
		},
		{
			name: ["-z", "--compress"],
			description: "Compress file data during the transfer",
		},
		{
			name: "--compress-level",
			description: "Explicitly set compression level",
			requiresSeparator: true,
			args: {
				name: "NUM",
				suggestions: Array.from(Array(10).keys()).map((v) => v.toString()),
			},
		},
		{
			name: "--skip-compress",
			description: "Skip compressing files with a suffix in LIST",
			requiresSeparator: true,
			args: {
				name: "LIST",
			},
		},
		{
			name: ["-C", "--cvs-exclude"],
			description: "Auto-ignore files the same way CVS does",
		},
		{
			name: "-f",
			description: "Add a file-filtering RULE",
			args: {
				name: "RULE",
			},
		},
		{
			name: "--filter",
			description: "Add a file-filtering RULE",
			requiresSeparator: true,
			args: {
				name: "RULE",
			},
		},
		{
			name: "-F",
			description: "Same as --filter='dir-merge /.rsync-filter'",
			args: {
				name: "DIR",
				template: "folders",
				isVariadic: true,
			},
		},
		{
			name: "--exclude",
			description: "Exclude files matching PATTERN",
			requiresSeparator: true,
			args: {
				name: "PATTERN",
			},
		},
		{
			name: "--exclude-from",
			description: "Read exclude patterns from FILE",
			requiresSeparator: true,
			args: {
				name: "FILE",
				template: "filepaths",
			},
		},
		{
			name: "--include",
			description: "Don't exclude files matching PATTERN",
			requiresSeparator: true,
			args: {
				name: "PATTERN",
			},
		},
		{
			name: "--include-from",
			description: "Read include patterns from FILE",
			requiresSeparator: true,
			args: {
				name: "FILE",
				template: "filepaths",
			},
		},
		{
			name: "--files-from",
			description: "Read list of source-file names from FILE",
			requiresSeparator: true,
			args: {
				name: "FILE",
				template: "filepaths",
			},
		},
		{
			name: ["-0", "--from0"],
			description: "All *-from/filter files are delimited by 0s",
		},
		{
			name: ["-s", "--protect-args"],
			description: "No space-splitting; only wildcard special-chars",
		},
		{
			name: "--address",
			description: "Bind address for outgoing socket to daemon",
			requiresSeparator: true,
			args: {
				name: "ADDRESS",
			},
		},
		{
			name: "--port",
			description: "Specify double-colon alternate port number",
			requiresSeparator: true,
			args: {
				name: "PORT",
			},
		},
		{
			name: "--sockopts",
			description: "Specify custom TCP options",
			requiresSeparator: true,
			args: {
				name: "OPTIONS",
			},
		},
		{
			name: "--blocking-io",
			description: "Use blocking I/O for the remote shell",
		},
		{ name: "--stats", description: "Give some file-transfer stats" },
		{
			name: ["-8", "--8-bit-output"],
			description: "Leave high-bit chars unescaped in output",
		},
		{
			name: ["-h", "--human-readable"],
			description: "Output numbers in a human-readable format",
		},
		{ name: "--progress", description: "Show progress during transfer" },
		{ name: "-P", description: "Same as --partial --progress" },
		{
			name: ["-i", "--itemize-changes"],
			description: "Output a change-summary for all updates",
		},
		{
			name: "--out-format",
			description: "Output updates using the specified FORMAT",
			requiresSeparator: true,
			args: {
				name: "FORMAT",
			},
		},
		{
			name: "--log-file",
			description: "Log what we're doing to the specified FILE",
			requiresSeparator: true,
			args: {
				name: "FILE",
				template: "filepaths",
			},
		},
		{
			name: "--log-file-format",
			description: "Log updates using the specified FMT",
			requiresSeparator: true,
			args: {
				name: "FMT",
			},
		},
		{
			name: "--password-file",
			description: "Read daemon-access password from FILE",
			requiresSeparator: true,
			args: {
				name: "FILE",
				template: "filepaths",
			},
		},
		{
			name: "--list-only",
			description: "List the files instead of copying them",
		},
		{
			name: "--bwlimit",
			description: "Limit socket I/O bandwidth",
			requiresSeparator: true,
			args: {
				name: "RATE",
			},
		},
		{
			name: "--stop-at",
			description: "Stop rsync at year-month-dayThour:minute",
			requiresSeparator: true,
			args: {
				name: "y-m-dTh:m",
			},
		},
		{
			name: "--time-limit",
			description: "Stop rsync after MINS minutes have elapsed",
			requiresSeparator: true,
			args: {
				name: "MINS",
			},
		},
		{
			name: "--outbuf",
			description: "Set output buffering to None, Line, or Block",
			requiresSeparator: true,
			args: {
				name: "BUFFER",
				suggestions: ["N", "L", "B"],
			},
		},
		{
			name: "--write-batch",
			description: "Write a batched update to FILE",
			requiresSeparator: true,
			args: {
				name: "FILE",
				template: "filepaths",
			},
		},
		{
			name: "--only-write-batch",
			description: "Like --write-batch but w/o updating destination",
			requiresSeparator: true,
			args: {
				name: "FILE",
				template: "filepaths",
			},
		},
		{
			name: "--read-batch",
			description: "Read a batched update from FILE",
			requiresSeparator: true,
			args: {
				name: "FILE",
				template: "filepaths",
			},
		},
		{
			name: "--protocol",
			description: "Force an older protocol version to be used",
			requiresSeparator: true,
			args: {
				name: "NUM",
			},
		},
		{
			name: "--iconv",
			description: "Request charset conversion of filenames",
			requiresSeparator: true,
			args: {
				name: "CONVERT_SPEC",
			},
		},
		{
			name: "--checksum-seed",
			description: "Set block/file checksum seed (advanced)",
			requiresSeparator: true,
			args: {
				name: "NUM",
			},
		},
		{
			name: "--noatime",
			description: "Do not alter atime when opening source files",
		},
		{ name: ["-4", "--ipv4"], description: "Prefer IPv4" },
		{ name: ["-6", "--ipv6"], description: "Prefer IPv6" },
		{ name: "--version", description: "Print version number" },
		{
			/*
			 * This is according with rsync spec.
			 */
			// eslint-disable-next-line @withfig/fig-linter/no-duplicate-options-subcommands
			name: ["-h", "--help"],
			description: "Show help for rsync (-h is --help only if used alone)",
		},
	],
};
export default completionSpec;
