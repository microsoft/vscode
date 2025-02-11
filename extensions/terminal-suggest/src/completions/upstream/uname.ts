const completionSpec: Fig.Spec = {
  name: "uname",
  description: "Print operating system name",
  options: [
    {
      name: "-a",
      description: "Print all available system information",
    },
    {
      name: "-m",
      description: "Print the machine hardware name",
    },
    {
      name: "-n",
      description: "Print the system hostname",
    },
    {
      name: "-p",
      description: "Print the machine processor architecture name",
    },
    {
      name: "-r",
      description: "Print the operating system release",
    },
    {
      name: "-s",
      description: "Print the operating system name",
    },
    {
      name: "-v",
      description: "Print the operating system version",
    },
  ],
};

export default completionSpec;
