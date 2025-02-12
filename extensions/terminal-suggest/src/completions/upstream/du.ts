const completionSpec: Fig.Spec = {
  name: "du",
  description: "Display disk usage statistics",
  options: [
    {
      name: "-a",
      description: "Display an entry for each file in a file hierarchy",
      exclusiveOn: ["-s", "-d"],
    },
    {
      name: "-c",
      description: "Display a grand total",
    },
    {
      name: "-H",
      description:
        "Symbolic links on the command line are followed, symbolic links in file hierarchies are not followed",
      exclusiveOn: ["-L", "-P"],
    },
    {
      name: "-h",
      description:
        '"Human-readable" output.  Use unit suffixes: Byte, Kilobyte, Megabyte, Gigabyte, Terabyte and Petabyte',
      exclusiveOn: ["-k", "-m", "-g"],
    },
    {
      name: "-g",
      description: "Display block counts in 1073741824-byte (1-Gbyte) blocks",
      exclusiveOn: ["-k", "-m", "-h"],
    },
    {
      name: "-k",
      description: "Display block counts in 1024-byte (1-Kbyte) blocks",
      exclusiveOn: ["-g", "-m", "-h"],
    },
    {
      name: "-m",
      description: "Display block counts in 1048576-byte (1-Mbyte) blocks",
      exclusiveOn: ["-g", "-k", "-h"],
    },
    {
      name: "-I",
      description: "Ignore files and directories matching the specified mask",
      args: {
        name: "mask",
      },
    },
    {
      name: "-L",
      description:
        "Symbolic links on the command line and in file hierarchies are followed",
      exclusiveOn: ["-H", "-P"],
    },
    {
      name: "-r",
      description:
        "Generate messages about directories that cannot be read, files that cannot be opened, and so on.  This is the default case.  This option exists solely for conformance with X/Open Portability Guide Issue 4 (``XPG4'')",
    },
    {
      name: "-P",
      description: "No symbolic links are followed.  This is the default",
      exclusiveOn: ["-H", "-L"],
    },
    {
      name: "-d",
      description:
        "Display an entry for all files and directories depth directories deep",
      exclusiveOn: ["-a", "-s"],
      args: {
        name: "depth",
        suggestions: ["0", "1", "2"],
      },
    },
    {
      name: "-s",
      description:
        "Display an entry for each specified file.  (Equivalent to -d 0)",
      exclusiveOn: ["-a", "-d"],
    },
    {
      name: "-x",
      description:
        "Display an entry for each specified file.  (Equivalent to -d 0)",
    },
  ],
  args: {
    isOptional: true,
    name: "files",
    isVariadic: true,
    template: ["filepaths", "folders"],
  },
};
export default completionSpec;
