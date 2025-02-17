const completionSpec: Fig.Spec = {
  name: "ls",
  description: "List directory contents",
  args: {
    isVariadic: true,
    template: ["filepaths", "folders"],
    filterStrategy: "fuzzy",
  },
  options: [
    {
      name: "-@",
      description:
        "Display extended attribute keys and sizes in long (-l) output",
    },
    {
      name: "-1",
      description:
        "(The numeric digit ``one''.)  Force output to be one entry per line.  This is the default when output is not to a terminal",
    },
    {
      name: "-A",
      description:
        "List all entries except for . and ...  Always set for the super-user",
    },
    {
      name: "-a",
      description: "Include directory entries whose names begin with a dot (.)",
    },
    {
      name: "-B",
      description:
        "Force printing of non-printable characters (as defined by ctype(3) and current locale settings) in file names as xxx, where xxx is the numeric value of the character in octal",
    },
    {
      name: "-b",
      description: "As -B, but use C escape codes whenever possible",
    },
    {
      name: "-C",
      description:
        "Force multi-column output; this is the default when output is to a terminal",
    },
    {
      name: "-c",
      description:
        "Use time when file status was last changed for sorting (-t) or long printing (-l)",
    },
    {
      name: "-d",
      description:
        "Directories are listed as plain files (not searched recursively)",
    },
    {
      name: "-e",
      description:
        "Print the Access Control List (ACL) associated with the file, if present, in long (-l) output",
    },
    {
      name: "-F",
      description:
        "Display a slash (/) immediately after each pathname that is a directory, an asterisk (*) after each that is executable, an at sign (@) after each symbolic link, an equals sign (=) after each socket, a percent sign (%) after each whiteout, and a vertical bar (|) after each that is a FIFO",
    },
    {
      name: "-f",
      description: "Output is not sorted.  This option turns on the -a option",
    },
    {
      name: "-G",
      description:
        "Enable colorized output.  This option is equivalent to defining CLICOLOR in the environment.  (See below.)",
    },
    {
      name: "-g",
      description:
        "This option is only available for compatibility with POSIX; it is used to display the group name in the long (-l) format output (the owner name is suppressed)",
    },
    {
      name: "-H",
      description:
        "Symbolic links on the command line are followed.  This option is assumed if none of the -F, -d, or -l options are specified",
    },
    {
      name: "-h",
      description:
        "When used with the -l option, use unit suffixes: Byte, Kilobyte, Megabyte, Gigabyte, Terabyte and Petabyte in order to reduce the number of digits to three or less using base 2 for sizes",
    },
    {
      name: "-i",
      description:
        "For each file, print the file's file serial number (inode number)",
    },
    {
      name: "-k",
      description:
        "If the -s option is specified, print the file size allocation in kilobytes, not blocks.  This option overrides the environment variable BLOCKSIZE",
    },
    {
      name: "-L",
      description:
        "Follow all symbolic links to final target and list the file or directory the link references rather than the link itself.  This option cancels the -P option",
    },
    {
      name: "-l",
      description:
        "(The lowercase letter ``ell''.)  List in long format.  (See below.)  A total sum for all the file sizes is output on a line before the long listing",
    },
    {
      name: "-m",
      description:
        "Stream output format; list files across the page, separated by commas",
    },
    {
      name: "-n",
      description:
        "Display user and group IDs numerically, rather than converting to a user or group name in a long (-l) output.  This option turns on the -l option",
    },
    {
      name: "-O",
      description: "Include the file flags in a long (-l) output",
    },
    { name: "-o", description: "List in long format, but omit the group id" },
    {
      name: "-P",
      description:
        "If argument is a symbolic link, list the link itself rather than the object the link references.  This option cancels the -H and -L options",
    },
    {
      name: "-p",
      description:
        "Write a slash (`/') after each filename if that file is a directory",
    },
    {
      name: "-q",
      description:
        "Force printing of non-graphic characters in file names as the character `?'; this is the default when output is to a terminal",
    },
    { name: "-R", description: "Recursively list subdirectories encountered" },
    {
      name: "-r",
      description:
        "Reverse the order of the sort to get reverse lexicographical order or the oldest entries first (or largest files last, if combined with sort by size",
    },
    { name: "-S", description: "Sort files by size" },
    {
      name: "-s",
      description:
        "Display the number of file system blocks actually used by each file, in units of 512 bytes, where partial units are rounded up to the next integer value.  If the output is to a terminal, a total sum for all the file sizes is output on a line before the listing.  The environment variable BLOCKSIZE overrides the unit size of 512 bytes",
    },
    {
      name: "-T",
      description:
        "When used with the -l (lowercase letter ``ell'') option, display complete time information for the file, including month, day, hour, minute, second, and year",
    },
    {
      name: "-t",
      description:
        "Sort by time modified (most recently modified first) before sorting the operands by lexicographical order",
    },
    {
      name: "-u",
      description:
        "Use time of last access, instead of last modification of the file for sorting (-t) or long printing (-l)",
    },
    {
      name: "-U",
      description:
        "Use time of file creation, instead of last modification for sorting (-t) or long output (-l)",
    },
    {
      name: "-v",
      description:
        "Force unedited printing of non-graphic characters; this is the default when output is not to a terminal",
    },
    {
      name: "-W",
      description: "Display whiteouts when scanning directories.  (-S) flag)",
    },
    {
      name: "-w",
      description:
        "Force raw printing of non-printable characters.  This is the default when output is not to a terminal",
    },
    {
      name: "-x",
      description:
        "The same as -C, except that the multi-column output is produced with entries sorted across, rather than down, the columns",
    },
    {
      name: "-%",
      description:
        "Distinguish dataless files and directories with a '%' character in long (-l) output, and don't materialize dataless directories when listing them",
    },
    {
      name: "-,",
      description: `When the -l option is set, print file sizes grouped and separated by thousands using the non-monetary separator returned
by localeconv(3), typically a comma or period.  If no locale is set, or the locale does not have a non-monetary separator, this
option has no effect.  This option is not defined in IEEE Std 1003.1-2001 (“POSIX.1”)`,
      dependsOn: ["-l"],
    },
    {
      name: "--color",
      description: `Output colored escape sequences based on when, which may be set to either always, auto, or never`,
      requiresSeparator: true,
      args: {
        name: "when",
        suggestions: [
          {
            name: ["always", "yes", "force"],
            description: "Will make ls always output color",
          },
          {
            name: "auto",
            description:
              "Will make ls output escape sequences based on termcap(5), but only if stdout is a tty and either the -G flag is specified or the COLORTERM environment variable is set and not empty",
          },
          {
            name: ["never", "no", "none"],
            description:
              "Will disable color regardless of environment variables",
          },
        ],
      },
    },
  ],
};

export default completionSpec;
