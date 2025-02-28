const completionSpec: Fig.Spec = {
  name: "touch",
  description: "Change file access and modification times",
  args: {
    name: "file",
    isVariadic: true,
    template: "folders",
    suggestCurrentToken: true,
  },
  options: [
    {
      name: "-A",
      description:
        "Adjust the access and modification time stamps for the file by the specified value",
      args: {
        name: "time",
        description: "[-][[hh]mm]SS",
      },
    },
    { name: "-a", description: "Change the access time of the file" },
    {
      name: "-c",
      description: "Do not create the file if it does not exist",
    },
    {
      name: "-f",
      description:
        "Attempt to force the update, even if the file permissions do not currently permit it",
    },
    {
      name: "-h",
      description:
        "If the file is a symbolic link, change the times of the link itself rather than the file that the link points to",
    },
    {
      name: "-m",
      description: "Change the modification time of the file",
    },
    {
      name: "-r",
      description:
        "Use the access and modifications times from the specified file instead of the current time of day",
      args: {
        name: "file",
      },
    },
    {
      name: "-t",
      description:
        "Change the access and modification times to the specified time instead of the current time of day",
      args: {
        name: "timestamp",
        description: "[[CC]YY]MMDDhhmm[.SS]",
      },
    },
  ],
};

export default completionSpec;
