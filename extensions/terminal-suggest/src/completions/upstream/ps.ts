const completionSpec: Fig.Spec = {
  name: "ps",
  description: "Report a snapshot of the current processes",
  options: [
    { name: ["-A", "-e"], description: "Select all processes" },
    {
      name: "-a",
      description: "Select all processes except both session leaders",
      args: { name: "getsid" },
    },
    {
      name: "-d",
      description: "Select all processes except session leaders",
    },
    {
      name: "--deselect",
      description:
        "Select all processes except those that fulfill the specified conditions",
    },
    {
      name: "-N",
      description:
        "Select all processes except those that fulfill the specified conditions (negates the selection)",
    },
    {
      name: "--pid",
      description: "Select by process ID",
      args: { name: "pidlist" },
    },
    {
      name: "--ppid",
      description:
        "Select by parent process ID. This selects the processes with a parent process ID in pidlist",
      args: { name: "pidlist" },
    },
    {
      name: "--sid",
      description: "Select by session ID",
      args: { name: "sesslist" },
    },
    {
      name: "--tty",
      description: "Select by terminal",
      args: { name: "ttylist" },
    },
    {
      name: "U",
      description: "Select by effective user ID (EUID) or name",
      args: { name: "userlist" },
    },
    {
      name: "-U",
      description: "Select by real user ID (RUID) or name",
      args: { name: "userlist" },
    },
    {
      name: "-u",
      description: "Select by effective user ID (EUID) or name",
      args: { name: "userlist" },
    },
    {
      name: "--User",
      description: "Select by real user ID (RUID) or name",
      args: { name: "userlist" },
    },
    {
      name: "--user",
      description: "Select by effective user ID (EUID) or name",
      args: { name: "userlist" },
    },
    {
      name: "-c",
      description: "Show different scheduler information for the -l option",
    },
    {
      name: "--context",
      description: "Display security context format (for SE Linux)",
    },
    { name: "-f", description: "Do full-format listing" },
    { name: "-F", description: "Extra full format" },
    {
      name: ["--format", "-o", "o"],
      description: "",
      args: { name: "format" },
      isRepeatable: true,
    },
    { name: ["-M", "Z"], description: "(for SE Linux)" },
    { name: ["-y", "-l"], description: "" },
    {
      name: "--cols",
      description: "Set screen width",
      args: { name: "n" },
    },
    {
      name: "--columns",
      description: "Set screen width",
      args: { name: "n" },
    },
    {
      name: "--cumulative",
      description:
        "Include some dead child process data (as a sum with the parent)",
    },
    { name: "--forest", description: "ASCII art process tree" },
    { name: "-H", description: "Show process hierarchy (forest)" },
    {
      name: "--headers",
      description: "Repeat header lines, one per page of output",
    },
    {
      name: "-n",
      description: "Set namelist file",
      args: { name: "namelist" },
    },
    {
      name: "--lines",
      description: "Set screen height",
      args: { name: "n" },
    },
    {
      name: ["--no-headers", "--no-heading"],
      description: "Print no header line at all",
    },
    {
      name: "--rows",
      description: "Set screen height",
      args: { name: "n" },
    },
    {
      name: "--sort",
      description: "Specify sorting order",
      args: { name: "spec" },
    },
    {
      name: "--width",
      description: "Set screen width",
      args: { name: "n" },
    },
    {
      name: "-L",
      description: "Show threads, possibly with LWP and NLWP columns",
    },
    {
      name: "-T",
      description: "Show threads, possibly with SPID column",
    },
    { name: "--help", description: "Print a help message" },
    { name: "--info", description: "Print debugging info" },
    { name: "--version", description: "Print the procps version" },
  ],
};

export default completionSpec;
