const completionSpec: Fig.Spec = {
	name: "sort",
	description: "Sort or merge records (lines) of text and binary files",
	args: {
		name: "file",
		isVariadic: true,
		template: "filepaths",
	},
	options: [
		{
			name: "--help",
			description: "Shows help message",
		},
		{
			name: "--version",
			description: "Displays the current version of sort",
		},
		{
			name: ["-c", "--check", "-C"],
			args: {
				name: "output",
				isOptional: true,
				suggestions: ["silent", "quiet"],
				description: "Suppress errors on false check",
			},
			description: "Check that the single input file is sorted",
		},
		{
			name: ["-m", "--merge"],
			description:
				"Merge only.  The input files are assumed to be pre-sorted.  If they are not sorted the output order is undefined",
		},
		{
			name: ["-o", "--output"],
			description:
				"Print the output to the output file instead of the standard output",
			args: {
				name: "output",
			},
		},
		{
			name: ["-S", "--buffer-size"],
			description: "Use size for the maximum size of the memory buffer",
			args: {
				name: "size",
			},
		},
		{
			name: ["-T", "--temporary-directory"],
			description: "Store temporary files in the directory dir",
			args: {
				name: "dir",
				template: "folders",
			},
		},
		{
			name: ["-u", "--unique"],
			description:
				"Unique keys. Suppress all lines that have a key that is equal to an already processed one",
		},
		{
			name: "-s",
			description:
				"Stable sort. This option maintains the original record order of records that have an equal key",
		},
		{
			name: ["-b", "--ignore-leading-blanks"],
			description: "Ignore leading blank characters when comparing lines",
		},
		{
			name: ["-d", "--dictionary-order"],
			description:
				"Consider only blank spaces and alphanumeric characters in comparisons",
		},
		{
			name: ["-f", "--ignore-case"],
			description:
				"Convert all lowercase characters to their upper case equivalent before comparison",
		},
		{
			name: ["-g", "--general-numeric-sort"],
			description: "Sort by general numerical value",
		},
		{
			name: ["-h", "--human-numeric-sort"],
			description:
				"Sort by numerical value, but take into account the SI suffix, if present",
		},
		{
			name: ["-i", "--ignore-nonprinting"],
			description: "Ignore all non-printable characters",
		},
		{
			name: ["-M", "--month-sort"],
			description:
				"Sort by month abbreviations.  Unknown strings are considered smaller than the month names",
		},
		{
			name: ["-n", "--numeric-sort"],
			description: "Sort fields numerically by arithmetic value",
		},
		{
			name: ["-R", "--random-sort"],
			description: "Sort by a random order",
		},
		{
			name: ["-r", "--reverse"],
			description: "Sort in reverse order",
		},
		{
			name: ["-V", "--version-sort"],
			description: "Sort version numbers",
		},
		{
			name: ["-k", "--key"],
			args: [
				{
					name: "field1",
				},
				{
					name: "field2",
					isOptional: true,
				},
			],
			description:
				"Define a restricted sort key that has the starting position field1, and optional ending position field2",
		},
		{
			name: ["-t", "--field-separator"],
			args: {
				name: "char",
			},
			description: "Use char as a field separator character",
		},
		{
			name: ["-z", "--zero-terminated"],
			description: "Use NUL as record separator",
		},
		{
			name: "--batch-size",
			args: {
				name: "num",
			},
			description:
				"Specify maximum number of files that can be opened by sort at once",
		},
		{
			name: "--compress-program",
			args: {
				name: "PROGRAM",
				template: "filepaths",
			},
			description: "Use PROGRAM to compress temporary files (eg. bzip2)",
		},
		{
			name: "--random-source",
			args: {
				name: "filename",
				template: "filepaths",
			},
			description:
				"In random sort, the file content is used as the source of the 'seed' data for the hash function choice",
		},
		{
			name: "--debug",
			description:
				"Print some extra information about the sorting process to the standard output",
		},
		{
			name: "--parallel",
			description:
				"Set the maximum number of execution threads.  Default number equals to the number of CPUs",
		},
		{
			name: "--files0-from",
			args: {
				name: "filename",
				template: "filepaths",
			},
			description: "Take the input file list from the file filename",
		},
		{
			name: "--radixsort",
			description: "Try to use radix sort, if the sort specifications allow",
		},
		{
			name: "--mergesort",
			description:
				"Use mergesort.  This is a universal algorithm that can always be used, but it is not always the fastest",
		},
		{
			name: "--qsort",
			description:
				"Try to use quick sort, if the sort specifications allow.  This sort algorithm cannot be used with -u and -s",
		},
		{
			name: "--heapsort",
			description:
				"Try to use heap sort, if the sort specifications allow.  This sort algorithm cannot be used with -u and -s",
		},
		{
			name: "--mmap",
			description:
				"Try to use file memory mapping system call.  It may increase speed in some cases",
		},
		{
			name: "--sort",
			args: {
				name: "type",
				suggestions: [
					"general-numeric",
					"human-numeric",
					"month",
					"numeric",
					"random",
				],
			},
			description: "Select how to sort values",
		},
	],
};

export default completionSpec;
