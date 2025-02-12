const completionSpec: Fig.Spec = {
  name: "mkdir",
  description: "Make directories",
  args: {
    name: "directory name",
    template: "folders",
    suggestCurrentToken: true,
  },
  options: [
    {
      name: ["-m", "--mode"],
      description: "Set file mode (as in chmod), not a=rwx - umask",
      args: { name: "MODE" },
    },
    {
      name: ["-p", "--parents"],
      description: "No error if existing, make parent directories as needed",
    },
    {
      name: ["-v", "--verbose"],
      description: "Print a message for each created directory",
    },
    {
      name: ["-Z", "--context"],
      description:
        "Set the SELinux security context of each created directory to CTX",
      args: { name: "CTX" },
    },
    { name: "--help", description: "Display this help and exit" },
    {
      name: "--version",
      description: "Output version information and exit",
    },
  ],
};

export default completionSpec;
