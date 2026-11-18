const sizeSuffixes: Fig.Suggestion[] = [
	{ name: "Blocks", insertValue: "{cursor}b" },
	{ name: "Bytes", insertValue: "{cursor}c" },
	{ name: "Gigabytes", insertValue: "{cursor}G" },
	{ name: "Kilobytes", insertValue: "{cursor}K" },
	{ name: "Megabytes", insertValue: "{cursor}M" },
	{ name: "Petabytes", insertValue: "{cursor}P" },
	{ name: "Terabytes", insertValue: "{cursor}T" },
	{ name: "Words", insertValue: "{cursor}w" },
];

const fileOptions: Fig.Option[] = [
	{
		name: ["f", "-f", "--file"],
		description: "Use archive file or device ARCHIVE",
		isRequired: true,
		args: { name: "ARCHIVE" },
	},
	{
		name: "--force-local",
		description: "Archive file is local even if it has a colon",
		dependsOn: ["f", "-f", "--file"],
	},
	{
		name: ["F", "-F", "--info-script", "--new-volume-script"],
		description: "Run  COMMAND  at the end of each tape",
		args: { name: "COMMAND" },
	},
	{
		name: ["L", "-L", "--tape-length"],
		description: "Change tape after writing Nx1024 bytes",
		args: { name: "N", suggestions: sizeSuffixes },
	},
	{
		name: ["M", "-M", "--multi-volume"],
		description: "Create/list/extract multi-volume archive",
	},
	{
		name: "--rmt-command",
		description: "Use  COMMAND instead of rmt when accessing remote archives",
		args: { name: "COMMAND" },
	},
	{
		name: "--rsh-command",
		description: "Use  COMMAND instead of rsh when accessing remote archives",
		args: { name: "COMMAND" },
	},
	{
		name: "--volno-file",
		description:
			"Tar will keep track of which volume of a multi-volume archive it is working in FILE",
		dependsOn: ["M", "-M", "--multi-volume"],
		args: { name: "FILE" },
	},
];

const compressionExclusive: string[] = [
	"a",
	"-a",
	"--auto-compress",
	"I",
	"-I",
	"--use-compress-program",
	"j",
	"-j",
	"--bzip2",
	"J",
	"-J",
	"--xz",
	"--lzip",
	"--lzma",
	"--lzop",
	"--no-auto-compress",
	"z",
	"-z",
	"--gzip",
	"--gunzip",
	"--ungzip",
	"Z",
	"-Z",
	"--compress",
	"--uncompress",
	"--zstd",
];

// --create && --append && --update && --list && --extract
const compressionOptions: Fig.Option[] = [
	{
		name: ["a", "-a", "--auto-compress"],
		description: "Use archive suffix to determine the compression program",
		exclusiveOn: compressionExclusive,
	},
	{
		name: ["I", "-I", "--use-compress-program"],
		description: "Filter data through COMMAND",
		exclusiveOn: compressionExclusive,
		args: { name: "COMMAND" },
	},
	{
		name: ["j", "-j", "--bzip2"],
		description: "Filter the archive through bzip2",
		exclusiveOn: compressionExclusive,
	},
	{
		name: ["J", "-J", "--xz"],
		description: "Filter the archive through xz",
		exclusiveOn: compressionExclusive,
	},
	{
		name: "--lzip",
		description: "Filter the archive through lzip",
		exclusiveOn: compressionExclusive,
	},
	{
		name: "--lzma",
		description: "Filter the archive through lzma",
		exclusiveOn: compressionExclusive,
	},
	{
		name: "--lzop",
		description: "Filter the archive through lzop",
		exclusiveOn: compressionExclusive,
	},
	{
		name: "--no-auto-compress",
		description:
			"Do not use archive suffix to determine the compression program",
		exclusiveOn: compressionExclusive,
	},
	{
		name: ["z", "-z", "--gzip", "--gunzip", "--ungzip"],
		description: "Filter the archive through gzip",
		exclusiveOn: compressionExclusive,
	},
	{
		name: ["Z", "-Z", "--compress", "--uncompress"],
		description: "Filter the archive through compress",
		exclusiveOn: compressionExclusive,
	},
	{
		name: "--zstd",
		description: "Filter the archive through zstd",
		exclusiveOn: compressionExclusive,
	},
	{
		name: ["--transform", "--xform"],
		description: "Use sed replace EXPRESSION to transform file names",
		args: { name: "EXPRESSION" },
	},
	{
		name: "--checkpoint",
		description: "Display progress messages every Nth record",
		args: { name: "N", isOptional: true, default: "10" },
	},
	{
		name: "--checkpoint-action",
		description: "Run ACTION on each checkpoint",
		args: { name: "ACTION" },
	},
	{
		name: "--full-time",
		description: "Print file time to its full resolution",
		dependsOn: ["v", "-v", "--verbose"],
	},
	{
		name: "--utc",
		description: "Print file modification times in UTC",
		dependsOn: ["v", "-v", "--verbose"],
	},
];

// --create && --append && --update
const dumpOptions: Fig.Option[] = [
	{
		name: "--ignore-failed-read",
		description: "Do not exit with nonzero on unreadable files",
	},
	{
		name: "--restrict",
		description: "Disable the use of some potentially harmful options",
		dependsOn: ["M", "-M", "--multi-volume"],
	},
	{
		name: "--remove-files",
		description: "Remove files from disk after adding them to the archive",
	},
	{
		name: ["W", "-W", "--verify"],
		description: "Verify the archive after writing it",
	},
	{
		name: "--atime-preserve",
		description: "Preserve access times on dumped files",
		args: {
			name: "METHOD",
			default: "replace",
			isOptional: true,
			suggestions: [
				{ name: "replace", description: "Restore the times after reading" },
				{
					name: "system",
					description: "Not setting the times in the first place",
				},
			],
		},
	},
	{
		name: "--group",
		description: "Force NAME as group for added files",
		args: {
			name: "NAME[:GID]",
			description:
				"If GID is not supplied, NAME can be either a user name or numeric GID",
		},
	},
	{
		name: "--group-map",
		description: "Read group translation map from FILE",
		args: {
			name: "FILE",
			description:
				"Each non-empty line in FILE defines translation for a single group",
			template: "filepaths",
		},
	},
	{
		name: "--mode",
		description: "Force symbolic mode CHANGES for added files",
		args: { name: "CHANGES" },
	},
	{
		name: "--mtime",
		description: "Set mtime for added files",
		args: {
			name: "DATE-OR-FILE",
			description:
				"Either a date/time in almost arbitrary format, or the name of an existing file",
			template: "filepaths",
		},
	},
	{
		name: "--owner",
		description: "Force NAME as owner for added files",
		args: {
			name: "NAME[:GID]",
			description:
				"If UID is not supplied, NAME can be either a user name or numeric UID",
		},
	},
	{
		name: "--owner-map",
		description: "Read owner translation map from FILE",
		args: {
			name: "FILE",
			description:
				"Each non-empty line in FILE defines translation for a single UID",
			template: "filepaths",
		},
	},
	{
		name: "--sort",
		description:
			"When creating an archive, sort directory entries according to ORDER",
		args: {
			name: "ORDER",
			default: "none",
			suggestions: ["none", "name", "inode"],
		},
	},
	{
		name: "--add-file",
		description: "Add FILE to the archive",
		args: {
			name: "FILE",
			template: "filepaths",
		},
	},
	{
		name: "--exclude",
		description: "Exclude files matching PATTERN",
		args: { name: "PATTERN", description: "A glob-style wildcard pattern" },
	},
	{ name: "--exclude-backups", description: "Exclude backup and lock files" },
	{
		name: "--exclude-caches",
		description:
			"Exclude contents of directories containing file CACHEDIR.TAG, except for the tag file itself",
		exclusiveOn: ["--exclude-caches-all", "--exclude-caches-under"],
	},
	{
		name: "--exclude-caches-all",
		description:
			"Exclude directories containing file CACHEDIR.TAG and the file itself",
		exclusiveOn: ["--exclude-caches", "--exclude-caches-under"],
	},
	{
		name: "--exclude-caches-under",
		description: "Exclude everything under directories containing CACHEDIR.TAG",
		exclusiveOn: ["--exclude-caches", "--exclude-caches-all"],
	},
	{
		name: "--exclude-ignore",
		description:
			"Read exclusion patterns from FILE in directory before dumping",
		exclusiveOn: ["--exclude-ignore-recursive"],
		args: { name: "FILE" },
	},
	{
		name: "--exclude-ignore-recursive",
		description:
			"Same  as --exclude-ignore, except that patterns from FILE affect both the directory and all its subdirectories",
		exclusiveOn: ["--exclude-ignore"],
		args: { name: "FILE" },
	},
	{
		name: "--exclude-tag",
		description:
			"Exclude contents of directories containing FILE, except for FILE itself",
		exclusiveOn: ["--exclude-tag-all", "--exclude-tag-under"],
		args: { name: "FILE" },
	},
	{
		name: "--exclude-tag-all",
		description: "Exclude directories containing FILE",
		exclusiveOn: ["--exclude-tag", "--exclude-tag-under"],
		args: { name: "FILE" },
	},
	{
		name: "--exclude-tag-under",
		description: "Exclude everything under directories containing FILE",
		exclusiveOn: ["--exclude-tag", "--exclude-tag-all"],
		args: { name: "FILE" },
	},
	{
		name: "--exclude-vcs",
		description: "Exclude version control system directories",
		exclusiveOn: ["--exclude-vcs-ignores"],
	},
	{
		name: "--exclude-vcs-ignores",
		description:
			"Exclude files that match patterns read from VCS-specific ignore files",
		exclusiveOn: ["--exclude-vcs"],
	},
	{
		name: ["h", "-h", "--dereference"],
		description: "Follow symlinks; archive and dump the files they point to",
	},
	{
		name: "--hard-dereference",
		description: "Follow hard links; archive and dump the files they refer to",
	},
	{
		name: ["N", "-N", "--newer", "--after-date"],
		description: "Only store files newer than DATE",
		args: {
			name: "DATE",
			description: "If DATE starts with / or . it is taken to be a file name",
			template: "filepaths",
		},
	},
	{
		name: "--one-file-system",
		description: "Stay in local file system when creating archive",
	},
	{
		name: ["P", "-P", "--absolute-names"],
		description: "Don't strip leading slashes from file names",
	},
	{
		name: "--anchored",
		description: "Patterns match file name start",
		dependsOn: ["--exclude"],
		exclusiveOn: ["--no-anchored"],
	},
	{
		name: "--ignore-case",
		description: "Ignore case",
		dependsOn: ["--exclude"],
		exclusiveOn: ["--no-ignore-case"],
	},
	{
		name: "--no-anchored",
		description: "Patterns match after any /",
		dependsOn: ["--exclude"],
		exclusiveOn: ["--anchored"],
	},
	{
		name: "--no-ignore-case",
		description: "Case sensitive matching",
		dependsOn: ["--exclude"],
		exclusiveOn: ["--ignore-case"],
	},
	{
		name: "--no-wildcards",
		description: "Verbatim string matching",
		dependsOn: ["--exclude"],
		exclusiveOn: ["--wildcards"],
	},
	{
		name: "--no-wildcards-match-slash",
		description: "Wildcards do not match /",
		dependsOn: ["--exclude", "--wildcards"],
		exclusiveOn: ["--no-wildcards", "--wildcards-match-slash"],
	},
	{
		name: "--wildcards",
		description: "Use wildcards",
		dependsOn: ["--exclude"],
		exclusiveOn: ["--no-wildcards"],
	},
	{
		name: "--wildcards-match-slash",
		description: "Wildcards match /",
		dependsOn: ["--exclude", "--wildcards"],
		exclusiveOn: ["--no-wildcards", "--no-wildcards-match-slash"],
	},
	{
		name: "--clamp-mtime",
		description:
			"Only set time when the file is more recent than what was given with --mtime",
		dependsOn: ["--mtime"],
	},
	{
		name: ["l", "-l", "--check-links"],
		description: "Print a message if not all links are dumped",
	},
	...compressionOptions,
];

// --delete && --diff && --extract && --list
const occurrenceOption: Fig.Option = {
	name: "--occurrence",
	description: "Process only the Nth occurrence of each file in the archive",
	args: {
		name: "N",
		default: "1",
		isOptional: true,
	},
};

// --list && --extract
const readOptions: Fig.Option[] = [
	{
		name: ["n", "-n", "--seek"],
		description: "Assume the archive is seekable",
		exclusiveOn: ["--no-seek"],
	},
	{
		name: "--no-seek",
		description: "Assume the archive is not seekable",
		exclusiveOn: ["n", "-n", "--seek"],
	},
	occurrenceOption,
	{
		name: ["B", "-B", "--read-full-records"],
		description:
			"When listing or extracting, accept incomplete input records after end-of-file marker",
	},
	{
		name: ["i", "-i", "--ignore-zeros"],
		description: "Ignore zeroed blocks in archive",
	},
	{
		name: ["V", "-V", "--label"],
		description: "Use TEXT as a globbing pattern for volume name",
		args: { name: "TEXT" },
	},
	...compressionOptions,
	{
		name: ["K", "-K", "--starting-file"],
		description: "Begin at the given member in the archive",
		args: { name: "MEMBER" },
	},
	{
		name: "--show-omitted-dirs",
		description: "List each directory that does not match search criteria",
	},
];

const warningSuggestions: Fig.Suggestion[] = [
	{ name: "all", description: "Enable all warning messages" },
	{ name: "none", description: "Disable all warning messages" },
	{
		name: "filename-with-nuls",
		description: '"%s: file name read contains nul character"',
	},
	{
		name: "no-filename-with-nuls",
		description: 'No "%s: file name read contains nul character"',
	},
	{ name: "alone-zero-block", description: '"A lone zero block at %s"' },
	{ name: "no-alone-zero-block", description: 'No "A lone zero block at %s"' },
];

const keepExclusives: string[] = [
	"k",
	"-k",
	"--keep-old-files",
	"--overwrite",
	"--overwrite-dir",
	"--recursive-unlink",
	"--skip-old-files",
	"U",
	"-U",
	"--unlink-first",
	"O",
	"-O",
	"--to-stdout",
];

const overwriteExclusives: string[] = [
	"k",
	"-k",
	"--keep-old-files",
	"--keep-newer-files",
	"--keep-directory-symlink",
	"--no-overwrite-dir",
	"--overwrite",
	"--skip-old-files",
	"U",
	"-U",
	"--unlink-first",
	"O",
	"-O",
	"--to-stdout",
];

const completionSpec: Fig.Spec = {
	name: "tar",
	description: "Manipulating archive files",
	options: [
		// Operation modifiers
		{
			name: ["g", "-g", "--listed-incremental"],
			description: "Handle new GNU-format incremental backups",
			isPersistent: true,
			exclusiveOn: ["G", "-G", "--incremental"],
			args: {
				name: "FILE",
				description: "The name of a snapshot file",
			},
		},
		{
			name: "--hole-detection",
			description: "Use METHOD to detect holes in sparse files",
			isPersistent: true,
			args: {
				name: "METHOD",
				default: "seek",
				isOptional: true,
				suggestions: ["seek", "raw"],
			},
		},
		{
			name: ["G", "-G", "--incremental"],
			description: "Handle old GNU-format incremental backups",
			isPersistent: true,
			exclusiveOn: ["g", "-g", "--listed-incremental"],
		},
		{
			name: "--sparse-version",
			description: "Set version of the sparse format to use",
			isPersistent: true,
			dependsOn: ["S", "-S", "--sparse"],
			args: {
				name: "MAJOR[.MINOR]",
				suggestions: ["0", "0.1", "1"],
			},
		},
		{
			name: ["S", "-S", "--sparse"],
			description: "Handle sparse files efficiently",
			isPersistent: true,
		},
		// Output stream selection
		{
			name: "--ignore-command-error",
			description: "Ignore subprocess exit codes",
			isPersistent: true,
			exclusiveOn: ["--no-ignore-command-error"],
		},
		{
			name: "--no-ignore-command-error",
			description: "Treat non-zero exit codes of children as error",
			isPersistent: true,
			exclusiveOn: ["--ignore-command-error"],
		},
		// Handling of file attributes
		{
			name: "--numeric-owner",
			description: "Always use numbers for user/group names",
			isPersistent: true,
		},
		// Extended file attributes
		{
			name: "--acls",
			description: "Enable POSIX ACLs support",
			exclusiveOn: ["--no-acls"],
			isPersistent: true,
		},
		{
			name: "--no-acls",
			description: "Disable POSIX ACLs support",
			exclusiveOn: ["--acls"],
			isPersistent: true,
		},
		{
			name: "--selinux",
			description: "Enable SELinux context support",
			exclusiveOn: ["--no-selinux"],
			isPersistent: true,
		},
		{
			name: "--no-selinux",
			description: "Disable SELinux context support",
			exclusiveOn: ["--selinux"],
			isPersistent: true,
		},
		{
			name: "--xattrs",
			description: "Enable extended attributes support",
			exclusiveOn: ["--no-xattrs"],
			isPersistent: true,
		},
		{
			name: "--no-xattrs",
			description: "Disable extended attributes support",
			exclusiveOn: ["--xattrs", "--xattrs-exclude", "--xattrs-include"],
			isPersistent: true,
		},
		{
			name: "--xattrs-exclude",
			description: "Specify the exclude pattern for xattr keys",
			exclusiveOn: ["--no-xattrs"],
			isPersistent: true,
			args: { name: "PATTERN", description: "A POSIX regular expression" },
		},
		{
			name: "--xattrs-include",
			description: "Specify the include pattern for xattr keys",
			isPersistent: true,
			args: { name: "PATTERN", description: "A POSIX regular expression" },
		},
		// Local file selection
		{
			name: "--backup",
			description: "Backup before removal",
			isPersistent: true,
			args: {
				name: "CONTROL",
				isOptional: true,
				default: "existing",
				suggestions: [
					{ name: ["none", "off"], description: "Never make backups" },
					{ name: ["t", "numbered"], description: "Make numbered backups" },
					{
						name: ["nil", "existing"],
						description: "Make numbered backups if numbered backups  exist",
					},
					{
						name: ["never", "simple"],
						description: "Always make simple backups",
					},
				],
			},
		},
		{
			name: ["C", "-C", "--directory"],
			description: "Change to DIR before performing any operations",
			isRepeatable: true,
			isPersistent: true,
			args: { name: "DIR", template: "folders" },
		},
		{
			name: "--newer-mtime",
			description: "Work on files whose data changed after the DATE",
			isPersistent: true,
			args: {
				name: "DATE",
				description: "If DATE starts with / or . it is taken to be a file name",
				template: "filepaths",
			},
		},
		{
			name: "--no-null",
			description: "Disable the effect of the previous --null option",
			dependsOn: ["T", "-T", "--files-from"],
			isPersistent: true,
		},
		{
			name: "--no-recursion",
			description: "Avoid descending automatically in directories",
			exclusiveOn: ["--recursion"],
			isPersistent: true,
		},
		{
			name: "--no-unquote",
			description: "Do not unquote input file or member names",
			exclusiveOn: ["--unquote"],
			isPersistent: true,
		},
		{
			name: "--no-verbatim-files-from",
			description:
				"Treat each line read from a file list as if it were supplied in the command line",
			dependsOn: ["T", "-T", "--files-from"],
			isRepeatable: true,
			isPersistent: true,
		},
		{
			name: "-null",
			description:
				"Instruct subsequent -T options to read null-terminated names verbatim",
			dependsOn: ["T", "-T", "--files-from"],
			isPersistent: true,
		},
		{
			name: "--recursion",
			description: "Recurse into directories",
			exclusiveOn: ["--no-recursion"],
			isPersistent: true,
		},
		{
			name: "--suffix",
			description: "Backup before removal, override usual suffix",
			dependsOn: ["--backup"],
			isPersistent: true,
			args: { name: "STRING", default: "~" },
		},
		{
			name: ["T", "-T", "--files-from"],
			description: "Get names to extract or create from FILE",
			isRepeatable: true,
			isPersistent: true,
			args: { name: "FILE", template: "filepaths" },
		},
		{
			name: "--unquote",
			description: "Unquote file or member names",
			exclusiveOn: ["--no-unquote"],
			isPersistent: true,
		},
		{
			name: "--verbatim-files-from",
			description:
				"Treat each line obtained from a file list as a file name, even if it starts with a dash",
			dependsOn: ["T", "-T", "--files-from"],
			isRepeatable: true,
			isPersistent: true,
		},
		{
			name: ["X", "-X", "--exclude-from"],
			description: "Exclude files matching patterns listed in FILE",
			isRepeatable: true,
			isPersistent: true,
			args: { name: "FILE", template: "filepaths" },
		},
		// Informative output
		{
			name: "--index-file",
			description: "Send verbose output to FILE",
			isPersistent: true,
			args: { name: "FILE" },
		},
		{
			name: "--no-quote-chars",
			description: "Disable quoting for characters from STRING",
			isPersistent: true,
			args: { name: "STRING" },
		},
		{
			name: "--quote-chars",
			description: "Additionally quote characters from STRING",
			isPersistent: true,
			args: { name: "STRING" },
		},
		{
			name: "--quoting-style",
			description: "Set quoting style for file and member names",
			isPersistent: true,
			args: {
				name: "STYLE",
				suggestions: [
					"literal",
					"shell",
					"shell-always",
					"c",
					"c-maybe",
					"escape",
					"locale",
					"clocale",
				],
			},
		},
		{
			name: ["R", "-R", "--block-number"],
			description: "Show block number within archive with each message",
			isPersistent: true,
		},
		{
			name: ["--show-transformed-names", "--show-stored-names"],
			description:
				"Show file or archive names after transformation by --strip and --transform options",
			isPersistent: true,
		},
		{
			name: "--totals",
			description: "Print total bytes after processing the archive",
			isPersistent: true,
			args: {
				name: "SIGNAL",
				description: "Print total bytes when this signal is delivered",
				isOptional: true,
				suggestions: [
					{ name: ["SIGHUP", "HUP"] },
					{ name: ["SIGQUIT", "QUIT"] },
					{ name: ["SIGINT", "INT"] },
					{ name: ["SIGUSR1", "USR1"] },
					{ name: ["SIGUSR2", "USR2"] },
				],
			},
		},
		{
			name: ["v", "-v", "--verbose"],
			description: "Verbosely list files processed",
			isRepeatable: true,
			isPersistent: true,
		},
		{
			name: ["w", "-w", "--interactive", "--confirmation"],
			description: "Ask for confirmation for every action",
		},
	],
	subcommands: [
		{
			name: ["A", "-A", "--catenate", "--concatenate"],
			description: "Append archive to the end of another archive",
			args: {
				name: "ARCHIVE",
				isVariadic: true,
				template: "filepaths",
			},
		},
		{
			name: ["c", "-c", "--create"],
			description: "Create a new archive",
			options: [
				{
					name: "--check-device",
					description:
						"Check device numbers when creating incremental archives",
					exclusiveOn: ["--no-check-device"],
					dependsOn: ["g", "-g", "--listed-incremental"],
				},
				{
					name: "--level",
					requiresSeparator: true,
					description: "Set dump level for created listed-incremental archive",
					args: { name: "NUMBER", default: "0" },
					dependsOn: ["g", "-g", "--listed-incremental"],
				},
				{
					name: "--no-check-device",
					description:
						"Do not check device numbers when creating incremental archives",
					exclusiveOn: ["--check-device"],
					dependsOn: ["g", "-g", "--listed-incremental"],
				},
				...dumpOptions,
				{
					name: ["b", "-b", "--blocking-factor"],
					description: "Set record size to BLOCKSx512 bytes",
					args: { name: "BLOCKS" },
				},
				{
					name: "--record-size",
					description: "Set record size",
					args: {
						name: "NUMBER",
						description: "The number of bytes per record",
						suggestions: sizeSuffixes,
					},
				},
				{
					name: ["H", "-H", "--format"],
					description: "Create archive of the given format",
					exclusiveOn: ["--old-archive", "--portability", "--posix", "o", "-o"],
					args: {
						name: "FORMAT",
						suggestions: [
							{ name: "gnu", description: "GNU tar 1.13.x format" },
							{ name: "oldgnu", description: "GNU format as per tar <= 1.12" },
							{
								name: ["pax", "posix"],
								description: "POSIX 1003.1-2001 (pax) format",
							},
							{
								name: "ustar",
								description: "POSIX 1003.1-1988 (ustar) format",
							},
							{ name: "v7", description: "Old V7 tar format" },
						],
					},
				},
				{
					name: ["--old-archive", "--portability"],
					description: "Same as --format=v7",
					exclusiveOn: [
						"H",
						"-H",
						"--format",
						"--pax-option",
						"--posix",
						"o",
						"-o",
					],
				},
				{
					name: "--pax-option",
					description: "Control pax keywords when creating PAX archives",
					dependsOn: ["H", "-H", "--format"],
					exclusiveOn: [
						"--old-archive",
						"--portability",
						"--old-archive",
						"--portability",
						"--posix",
						"o",
						"-o",
					],
					args: { name: "keyword[[:]=value][,keyword[[:]=value]]..." },
				},
				{
					name: "--posix",
					description: "Same as --format=posix",
					exclusiveOn: [
						"H",
						"-H",
						"--format",
						"--old-archive",
						"--portability",
						"--pax-option",
					],
				},
				{
					name: ["V", "-V", "--label"],
					description: "Create archive with volume name TEXT",
					args: { name: "TEXT" },
				},
				{
					name: "--warning",
					description:
						"Enable or disable warning messages identified by KEYWORD",
					isRepeatable: true,
					isPersistent: true,
					args: {
						name: "KEYWORD",
						default: "all",
						suggestions: [
							...warningSuggestions,
							{
								name: "cachedir",
								description: '"%s: contains a cache directory tag %s; %s"',
							},
							{
								name: "no-cachedir",
								description: 'No "%s: contains a cache directory tag %s; %s"',
							},
							{
								name: "file-shrank",
								description:
									'"%s: File shrank by %s bytes; padding with zeros"',
							},
							{
								name: "no-file-shrank",
								description:
									'No "%s: File shrank by %s bytes; padding with zeros"',
							},
							{
								name: "xdev",
								description:
									'"%s: file is on a different filesystem; not dumped"',
							},
							{
								name: "no-xdev",
								description:
									'No "%s: file is on a different filesystem; not dumped"',
							},
							{
								name: "file-ignored",
								description:
									'"%s: Unknown file type; file ignored", "%s: socket ignored", "%s: door ignored"',
							},
							{
								name: "no-file-ignored",
								description:
									'No "%s: Unknown file type; file ignored", "%s: socket ignored", "%s: door ignored"',
							},
							{
								name: "file-unchanged",
								description: '"%s: file is unchanged; not dumped"',
							},
							{
								name: "no-file-unchanged",
								description: 'No "%s: file is unchanged; not dumped"',
							},
							{
								name: "ignore-archive",
								description: '"%s: file is the archive; not dumped"',
							},
							{
								name: "no-ignore-archive",
								description: 'No "%s: file is the archive; not dumped"',
							},
							{
								name: "file-removed",
								description: '"%s: File removed before we read it"',
							},
							{
								name: "no-file-removed",
								description: 'No "%s: File removed before we read it"',
							},
							{
								name: "file-changed",
								description: '"%s: file changed as we read it"',
							},
							{
								name: "no-file-changed",
								description: 'No "%s: file changed as we read it"',
							},
							{
								name: "failed-read",
								description:
									"Enables warnings about unreadable files or directories",
							},
							{
								name: "no-failed-read",
								description:
									"Suppresses warnings about unreadable files or directories",
							},
						],
					},
				},
				{
					name: ["o", "-o"],
					description: "Same as --old-archive",
					exclusiveOn: [
						"H",
						"-H",
						"--format",
						"--old-archive",
						"--portability",
						"--posix",
						"o",
						"-o",
					],
				},
				...fileOptions,
			],
			args: {
				name: "FILE",
				isVariadic: true,
				template: "filepaths",
			},
		},
		{
			name: ["d", "-d", "--diff", "--compare"],
			description: "Find differences between archive and file system",
			options: [...fileOptions, occurrenceOption],
			args: {
				name: "FILE",
				isOptional: true,
				isVariadic: true,
				default: ".",
				template: "filepaths",
			},
		},
		{
			name: ["t", "-t", "--list"],
			description: "List the contents of an archive",
			options: [...fileOptions, ...readOptions],
			args: {
				name: "MEMBER",
				isOptional: true,
				isVariadic: true,
			},
		},
		{
			name: ["r", "-r", "--append"],
			description: "Append files to the end of an archive",
			options: [...fileOptions, ...dumpOptions],
			args: {
				name: "FILE",
				isVariadic: true,
				template: "filepaths",
			},
		},
		{
			name: ["u", "-u", "--update"],
			description:
				"Append files which are newer than the corresponding copy in  the archive",
			options: [...fileOptions, ...dumpOptions],
			args: {
				name: "FILE",
				isVariadic: true,
				template: "filepaths",
			},
		},
		{
			name: ["x", "-x", "--extract", "--get"],
			description: "Extract files from an archive",
			options: [
				...fileOptions,
				...readOptions,
				{
					name: ["k", "-k", "--keep-old-files"],
					description: "Don't replace existing files when extracting",
					exclusiveOn: [
						"--keep-newer-files",
						"--keep-directory-symlink",
						"--no-overwrite-dir",
						...keepExclusives,
					],
				},
				{
					name: "--keep-newer-files",
					description:
						"Don't replace existing files that are newer than their archive copies",
					exclusiveOn: keepExclusives,
				},
				{
					name: "--keep-directory-symlink",
					description:
						"Don't replace existing symlinks to directories when extracting",
					exclusiveOn: keepExclusives,
				},
				{
					name: "--no-overwrite-dir",
					description: "Preserve metadata of existing directories",
					exclusiveOn: keepExclusives,
				},
				{
					name: "--one-top-level",
					description: "Extract all files into DIR",
					args: { name: "DIR" },
				},
				{
					name: "--overwrite",
					description: "Overwrite existing files when extracting",
					exclusiveOn: [
						"--overwrite-dir",
						"--recursive-unlink",
						...overwriteExclusives,
					],
				},
				{
					name: "--overwrite-dir",
					description:
						"Overwrite metadata of existing directories when extracting",
					exclusiveOn: overwriteExclusives,
				},
				{
					name: "--recursive-unlink",
					description:
						"Recursively remove all files in the directory prior to extracting it",
					exclusiveOn: overwriteExclusives,
				},
				{
					name: "--skip-old-files",
					description:
						"Don't replace existing files when extracting, silently skip over them",
					exclusiveOn: [...keepExclusives, ...overwriteExclusives],
				},
				{
					name: ["U", "-U", "--unlink-first"],
					description: "Remove each file prior to extracting over it",
					exclusiveOn: [...keepExclusives, ...overwriteExclusives],
				},
				{
					name: ["O", "-O", "--to-stdout"],
					description: "Extract files to standard output",
					exclusiveOn: [...keepExclusives, ...overwriteExclusives],
				},
				{
					name: "--to-command",
					description: "Pipe extracted files to COMMAND",
					args: { name: "COMMAND", template: "filepaths" },
				},
				{
					name: "--delay-directory-restore",
					description:
						"Delay setting modification times and permissions of extracted directories until the end of extraction",
					exclusiveOn: ["--no-delay-directory-restore"],
				},
				{
					name: ["m", "-m", "--touch"],
					description: "Don't extract file modified time",
				},
				{
					name: "--no-delay-directory-restore",
					description:
						"Cancel the effect of the prior --delay-directory-restore option",
					exclusiveOn: ["--delay-directory-restore"],
				},
				{
					name: "--no-same-owner",
					description: "Extract files as yourself",
					exclusiveOn: ["--same-owner"],
				},
				{
					name: "--no-same-permissions",
					description:
						"Apply the user's umask when extracting permissions from the archive",
					exclusiveOn: [
						"p",
						"-p",
						"--preserve-permissions",
						"--same-permissions",
					],
				},
				{
					name: ["p", "-p", "--preserve-permissions", "--same-permissions"],
					description: "Extract information about file permissions",
					exclusiveOn: ["--no-same-permissions"],
				},
				{ name: "--preserve", description: "Same as both -p and -s" },
				{
					name: "--same-owner",
					description:
						"Try extracting files with the same ownership as exists in the archive",
					exclusiveOn: ["--no-same-owner"],
				},
				{
					name: ["s", "-s", "--preserve-order", "--same-order"],
					description: "Sort names to extract to match archive",
				},
				{
					name: "--strip-components",
					description:
						"Strip NUMBER leading components from file names on extraction",
					args: { name: "NUMBER" },
				},
				{
					name: "--warning",
					description:
						"Enable or disable warning messages identified by KEYWORD",
					isRepeatable: true,
					isPersistent: true,
					args: {
						name: "KEYWORD",
						default: "all",
						suggestions: [
							...warningSuggestions,
							{
								name: "existing-file",
								description: '"%s: skipping existing file"',
							},
							{
								name: "no-existing-file",
								description: 'No "%s: skipping existing file"',
							},
							{
								name: "timestamp",
								description:
									'"%s: implausibly old time stamp %s", "%s: time stamp %s is %s s in the future"',
							},
							{
								name: "no-timestamp",
								description:
									'No "%s: implausibly old time stamp %s", "%s: time stamp %s is %s s in the future"',
							},
							{
								name: "contiguous-cast",
								description: '"Extracting contiguous files as regular files"',
							},
							{
								name: "no-contiguous-cast",
								description:
									'No "Extracting contiguous files as regular files"',
							},
							{
								name: "symlink-cast",
								description:
									'"Attempting extraction of symbolic links as hard links"',
							},
							{
								name: "no-symlink-cast",
								description:
									'No "Attempting extraction of symbolic links as hard links"',
							},
							{
								name: "unknown-cast",
								description:
									"\"%s: Unknown file type '%c', extracted as normal file\"",
							},
							{
								name: "no-unknown-cast",
								description:
									"No \"%s: Unknown file type '%c', extracted as normal file\"",
							},
							{
								name: "ignore-newer",
								description: '"Current %s is newer or same age"',
							},
							{
								name: "no-ignore-newer",
								description: 'No "Current %s is newer or same age"',
							},
							{
								name: "unknown-keyword",
								description:
									"\"Ignoring unknown extended header keyword '%s'\"",
							},
							{
								name: "no-unknown-keyword",
								description:
									"No \"Ignoring unknown extended header keyword '%s'\"",
							},
							{
								name: "decompress-program",
								description:
									"Enables verbose description of failures occurring when trying to run alternative decompressor programs",
							},
							{
								name: "no-decompress-program",
								description:
									"Suppresses verbose description of failures occurring when trying to run alternative decompressor programs",
							},
							{
								name: "record-size",
								description: '"Record size = %lu blocks"',
							},
							{
								name: "no-record-size",
								description: 'No "Record size = %lu blocks"',
							},
							// Keywords controlling incremental extraction
							{
								name: "rename-directory",
								description:
									'"%s: Directory has been renamed from %s", "%s: Directory has been renamed"',
							},
							{
								name: "no-rename-directory",
								description:
									'No "%s: Directory has been renamed from %s", "%s: Directory has been renamed"',
							},
							{ name: "new-directory", description: '"%s: Directory is new"' },
							{
								name: "no-new-directory",
								description: 'No "%s: Directory is new"',
							},
							{
								name: "xdev",
								description:
									'"%s: directory is on a different device: not purging"',
							},
							{
								name: "no-xdev",
								description:
									'No "%s: directory is on a different device: not purging"',
							},
							{
								name: "bad-dumpdir",
								description: "\"Malformed dumpdir: 'X' never used\"",
							},
						],
					},
				},
				{
					name: ["o", "-o"],
					description: "Same as --no-same-owner",
					exclusiveOn: ["--no-same-owner", "--same-owner"],
				},
			],
			args: {
				name: "MEMBER",
				isOptional: true,
				isVariadic: true,
			},
		},
		{
			name: "--delete",
			description: "Delete from the archive",
			options: [...fileOptions, occurrenceOption],
			args: {
				name: "MEMBER",
				isVariadic: true,
			},
		},
		{
			name: "--test-label",
			description: "Test the archive volume label and exit",
			options: fileOptions,
			args: {
				name: "LABEL",
				isOptional: true,
				isVariadic: true,
			},
		},
		{
			name: "--show-defaults",
			description: "Show built-in defaults for various tar options and exit",
		},
		{
			name: ["?", "-?", "--help"],
			description: "Display a short option summary and exit",
		},
		{
			name: "--usage",
			description: "Display a list of available options and exit",
		},
		{
			name: "--version",
			description: "Print program version and copyright information and exit",
		},
	],
	parserDirectives: {
		flagsArePosixNoncompliant: true,
	},
};

export default completionSpec;
