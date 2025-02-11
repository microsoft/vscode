const completionSpec: Fig.Spec = {
  name: "grep",
  description:
    "Matches patterns in input text. Supports simple patterns and regular expressions",
  args: [
    {
      name: "search pattern",
      suggestCurrentToken: true,
    },
    {
      name: "file",
      template: "filepaths",
    },
  ],
  options: [
    {
      name: "--help",
      description:
        "Print a usage message briefly summarizing these command-line options and the bug-reporting address, then exit",
    },
    {
      name: ["-E", "--extended-regexp"],
      description:
        "Interpret PATTERN as an extended regular expression (-E is specified by POSIX.)",
    },
    {
      name: ["-F", "--fixed-string"],
      description:
        "Interpret PATTERN as a list of fixed strings, separated by newlines, any of which is to be matched. (-F is specified by POSIX.)",
    },
    {
      name: ["-G", "--basic-regexp"],
      description:
        "Interpret PATTERN as a basic regular expression (BRE, see below). This is the default",
    },
    {
      name: ["-e", "--regexp"],
      description:
        "Use PATTERN as the pattern. This can be used to specify multiple search patterns, or to protect a pattern beginning with a hyphen (-). (-e is specified by POSIX.)",
      args: {
        name: "pattern",
      },
    },
    {
      name: ["-i", "--ignore-case", "-y"],
      description:
        "Ignore case distinctions in both the PATTERN and the input files. (-i is specified by POSIX.)",
    },
    {
      name: ["-v", "--invert-match"],
      description:
        "Invert the sense of matching, to select non-matching lines. (-v is specified by POSIX.)",
    },
    {
      name: ["-w", "--word-regexp"],
      description:
        "Select only those lines containing matches that form whole words. The test is that the matching substring must either be at the beginning of the line, or preceded by a non-word constituent character. Similarly, it must be either at the end of the line or followed by a non-word constituent character. Word-constituent characters are letters, digits, and the underscore",
    },
    {
      name: ["-x", "--line-regexp"],
      description:
        "Select only those matches that exactly match the whole line. (-x is specified by POSIX.)",
    },
    {
      name: ["-c", "--count"],
      description:
        "Suppress normal output; instead print a count of matching lines for each input file. With the -v, --invert-match option, count non-matching lines. (-c is specified by POSIX.)",
    },
    {
      name: "--color",
      description:
        "Surround the matched (non-empty) strings, matching lines, context lines, file names, line numbers, byte offsets, and separators (for fields and groups of context lines) with escape sequences to display them in color on the terminal. The colors are defined by the environment variable GREP_COLORS. The deprecated environment variable GREP_COLOR is still supported, but its setting does not have priority",
      args: {
        name: "WHEN",
        default: "auto",
        suggestions: ["never", "always", "auto"],
      },
    },
    {
      name: ["-L", "--files-without-match"],
      exclusiveOn: ["-l", "--files-with-matches"],
      description:
        "Suppress normal output; instead print the name of each input file from which no output would normally have been printed. The scanning will stop on the first match",
    },
    {
      name: ["-l", "--files-with-matches"],
      exclusiveOn: ["-L", "--files-without-match"],
      description:
        "Suppress normal output; instead print the name of each input file from which output would normally have been printed. The scanning will stop on the first match. (-l is specified by POSIX.)",
    },
    {
      name: ["-m", "--max-count"],
      description:
        "Stop reading a file after NUM matching lines. If the input is standard input from a regular file, and NUM matching lines are output, grep ensures that the standard input is positioned to just after the last matching line before exiting, regardless of the presence of trailing context lines. This enables a calling process to resume a search. When grep stops after NUM matching lines, it outputs any trailing context lines. When the -c or --count option is also used, grep does not output a count greater than NUM. When the -v or --invert-match option is also used, grep stops after outputting NUM non-matching lines",
      args: {
        name: "NUM",
      },
    },
    {
      name: ["-o", "--only-matching"],
      description:
        "Print only the matched (non-empty) parts of a matching line, with each such part on a separate output line",
    },
    {
      name: ["-q", "--quiet", "--silent"],
      description:
        "Quiet; do not write anything to standard output. Exit immediately with zero status if any match is found, even if an error was detected. Also see the -s or --no-messages option. (-q is specified by POSIX.)",
    },
    {
      name: ["-s", "--no-messages"],
      description:
        "Suppress error messages about nonexistent or unreadable files. Portability note: unlike GNU grep, 7th Edition Unix grep did not conform to POSIX, because it lacked -q and its -s option behaved like GNU grep's -q option. USG -style grep also lacked -q but its -s option behaved like GNU grep. Portable shell scripts should avoid both -q and -s and should redirect standard and error output to /dev/null instead. (-s is specified by POSIX.)",
    },
    {
      name: ["-b", "--byte-offset"],
      description:
        "Print the 0-based byte offset within the input file before each line of output. If -o (--only-matching) is specified, print the offset of the matching part itself",
    },
    {
      name: ["-H", "--with-filename"],
      description:
        "Print the file name for each match. This is the default when there is more than one file to search",
    },
    {
      name: ["-h", "--no-filename"],
      description:
        "Suppress the prefixing of file names on output. This is the default when there is only one file (or only standard input) to search",
    },
    {
      name: "--label",
      description:
        "Display input actually coming from standard input as input coming from file LABEL. This is especially useful when implementing tools like zgrep, e.g., gzip -cd foo.gz | grep --label=foo -H something",
      args: {
        name: "LABEL",
      },
    },
    {
      name: ["-n", "--line-number"],
      description:
        "Prefix each line of output with the 1-based line number within its input file. (-n is specified by POSIX.)",
    },
    {
      name: ["-T", "--initial-tab"],
      description:
        "Make sure that the first character of actual line content lies on a tab stop, so that the alignment of tabs looks normal. This is useful with options that prefix their output to the actual content: -H,-n, and -b. In order to improve the probability that lines from a single file will all start at the same column, this also causes the line number and byte offset (if present) to be printed in a minimum size field width",
    },
    {
      name: ["-u", "--unix-byte-offsets"],
      description:
        "Report Unix-style byte offsets. This switch causes grep to report byte offsets as if the file were a Unix-style text file, i.e., with CR characters stripped off. This will produce results identical to running grep on a Unix machine. This option has no effect unless -b option is also used; it has no effect on platforms other than MS-DOS and MS -Windows",
    },
    {
      name: "--null",
      description:
        "Output a zero byte (the ASCII NUL character) instead of the character that normally follows a file name. For example, grep -lZ outputs a zero byte after each file name instead of the usual newline. This option makes the output unambiguous, even in the presence of file names containing unusual characters like newlines. This option can be used with commands like find -print0, perl -0, sort -z, and xargs -0 to process arbitrary file names, even those that contain newline characters",
    },
    {
      name: ["-A", "--after-context"],
      description: "Print num lines of trailing context after each match",
      args: {
        name: "NUM",
      },
    },
    {
      name: ["-B", "--before-context"],
      description:
        "Print num lines of leading context before each match. See also the -A and -C options",
      args: {
        name: "NUM",
      },
    },
    {
      name: ["-C", "--context"],
      description:
        "Print NUM lines of output context. Places a line containing a group separator (--) between contiguous groups of matches. With the -o or --only-matching option, this has no effect and a warning is given",
      args: {
        name: "NUM",
      },
    },
    {
      name: ["-a", "--text"],
      description:
        "Treat all files as ASCII text. Normally grep will simply print ``Binary file ... matches'' if files contain binary characters. Use of this option forces grep to output lines matching the specified pattern",
    },
    {
      name: "--binary-files",
      description: "Controls searching and printing of binary files",
      args: {
        name: "value",
        default: "binary",
        suggestions: [
          {
            name: "binary",
            description: "Search binary files but do not print them",
          },
          {
            name: "without-match",
            description: "Do not search binary files",
          },
          {
            name: "text",
            description: "Treat all files as text",
          },
        ],
      },
    },
    {
      name: ["-D", "--devices"],
      description: "Specify the demanded action for devices, FIFOs and sockets",
      args: {
        name: "action",
        default: "read",
        suggestions: [
          {
            name: "read",
            description: "Read as if they were normal files",
          },
          {
            name: "skip",
            description: "Devices will be silently skipped",
          },
        ],
      },
    },
    {
      name: ["-d", "--directories"],
      description: "Specify the demanded action for directories",
      args: {
        name: "action",
        default: "read",
        suggestions: [
          {
            name: "read",
            description:
              "Directories are read in the same manner as normal files",
          },
          {
            name: "skip",
            description: "Silently ignore the directories",
          },
          {
            name: "recurse",
            description: "Read directories recursively",
          },
        ],
      },
    },
    {
      name: "--exclude",
      description:
        "Note that --exclude patterns take priority over --include patterns, and if no --include pattern is specified, all files are searched that are not excluded. Patterns are matched to the full path specified, not only to the filename component",
      args: {
        name: "GLOB",
        isOptional: true,
      },
    },
    {
      name: "--exclude-dir",
      description:
        "If -R is specified, only directories matching the given filename pattern are searched.  Note that --exclude-dir patterns take priority over --include-dir patterns",
      isRepeatable: true,
      args: {
        name: "dir",
        template: "folders",
        isOptional: true,
      },
    },
    {
      name: "-I",
      description:
        "Ignore binary files. This option is equivalent to --binary-file=without-match option",
    },
    {
      name: "--include",
      description:
        "If specified, only files matching the given filename pattern are searched. Note that --exclude patterns take priority over --include patterns. Patterns are matched to the full path specified, not only to the filename component",
      args: {
        name: "GLOB",
        isOptional: true,
      },
    },
    {
      name: "--include-dir",
      description:
        "If -R is specified, only directories matching the given filename pattern are searched. Note that --exclude-dir patterns take priority over --include-dir patterns",
      args: {
        name: "dir",
        template: "folders",
        isOptional: true,
      },
    },
    {
      name: ["-R", "-r", "--recursive"],
      description: "Recursively search subdirectories listed",
    },
    {
      name: "--line-buffered",
      description:
        "Force output to be line buffered. By default, output is line buffered when standard output is a terminal and block buffered otherwise",
    },
    {
      name: ["-U", "--binary"],
      description: "Search binary files, but do not attempt to print them",
    },
    {
      name: ["-J", "-bz2decompress"],
      description:
        "Decompress the bzip2(1) compressed file before looking for the text",
    },
    {
      name: ["-V", "--version"],
      description: "Print version number of grep to the standard output stream",
    },
    {
      name: ["-P", "--perl-regexp"],
      description: "Interpret pattern as a Perl regular expression",
    },
    {
      name: ["-f", "--file"],
      description:
        "Obtain patterns from FILE, one per line. The empty file contains zero patterns, and therefore matches nothing. (-f is specified by POSIX.)",
      args: {
        name: "FILE",
        template: "filepaths",
      },
    },
  ],
  additionalSuggestions: [
    {
      name: "-RIn",
      description:
        "Search for a pattern [R]ecursively in the current directory, showing matching line [n]umbers, [I]gnoring non-text files",
      insertValue: "-RI{cursor}",
    },
    {
      name: "-Hn",
      description:
        "Print file name with the corresponding line number (n) for each match",
      insertValue: "-H{cursor}",
    },
  ],
};

export default completionSpec;
