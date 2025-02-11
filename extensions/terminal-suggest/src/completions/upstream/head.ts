const completionSpec: Fig.Spec = {
  name: "head",
  description: "Output the first part of files",
  args: {
    name: "file",
    template: "filepaths",
  },
  options: [
    {
      name: ["-c", "--bytes"],
      description: "Print the first [numBytes] bytes of each file",
      args: { name: "numBytes" },
    },
    {
      name: ["-n", "--lines"],
      description: "Print the first [numLines] lines instead of the first 10",
      args: { name: "numLines" },
    },
    {
      name: ["-q", "--quiet", "--silent"],
      description: "Never print headers giving file names",
    },
    {
      name: ["-v", "--verbose"],
      description: "Always print headers giving file names",
    },
    { name: "--help", description: "Display this help and exit" },
    {
      name: "--version",
      description: "Output version information and exit",
    },
  ],
};

export default completionSpec;
