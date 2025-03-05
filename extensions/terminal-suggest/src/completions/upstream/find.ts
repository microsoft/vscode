const completionSpec: Fig.Spec = {
  name: "find",
  description: "Walk a file hierarchy",
  args: [
    {
      name: "path",
      isOptional: true,
      isVariadic: true,
      template: ["folders"],
    },
    {
      // TODO Suggestions for primaries and operands. See `man find`
      name: "expression",
      description: "Composition of primaries and operands",
      isOptional: true,
      isVariadic: true,
    },
  ],
  options: [
    {
      name: "-E",
      description:
        "Interpret regular expressions followed by -regex and -iregex primaries as extended",
    },
    {
      name: "-H",
      description:
        "Cause the file information and file type returned for each symbolic link specified to be those referenced by the link",
      exclusiveOn: ["-L", "-P"],
    },
    {
      name: "-L",
      description:
        "Cause the file information and file type returned for each symbolic link to be those of the file referenced by the link",
      exclusiveOn: ["-H", "-P"],
    },
    {
      name: "-P",
      description:
        "Cause the file information and file type returned for each symbolic link to be those for the link itself",
      exclusiveOn: ["-H", "-L"],
    },
    {
      name: "-X",
      description: "Permit find to be safely used in conjunction with xargs",
    },
    {
      name: "-d",
      description: "Cause find to perform a depth-first traversal",
    },
    {
      name: "-f",
      description: "Specify a file hierarch for find to traverse",
      args: {
        name: "path",
      },
    },
    {
      name: "-s",
      description:
        "Cause find to traverse the file hierarchies in lexicographical order",
    },
    {
      name: "-x",
      description:
        "Prevent find from descending into directories that have a device number different than that of the file from which the descent began",
    },
  ],
};

export default completionSpec;
