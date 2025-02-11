const completionSpec: Fig.Spec = {
  name: "more",
  description: "Opposite of less",
  options: [
    {
      name: ["-d", "--silent"],
      description:
        "Prompt with '[Press space to continue, 'q' to quit.]', and display '[Press 'h' for instructions.]' instead of ringing the bell when an illegal key is pressed",
    },
    {
      name: ["-l", "--logical"],
      description: "Do not pause after any line containing a ^L (form feed)",
    },
    {
      name: ["-f", "--no-pause"],
      description: "Count logical lines, rather than screen lines",
    },
    {
      name: ["-p", "--print-over"],
      description: "Instead, clear the whole screen and then display the text",
    },
    {
      name: ["-c", "--clean-print"],
      description:
        "Instead, paint each screen from the top, clearing the remainder of each line as it is displayed",
    },
    {
      name: ["-s", "--squeeze"],
      description: "Squeeze multiple blank lines into one",
    },
    {
      name: ["-u", "--plain"],
      description: "Silently ignored as backwards compatibility",
    },
    {
      name: ["-n", "--lines"],
      description: "Specify the number of lines per screenful",
      args: { name: "n" },
    },
    {
      name: "--help",
      description: "Display help text",
    },
    {
      name: ["-V", "--version"],
      description: "Display version information",
    },
  ],
  args: {
    isVariadic: true,
    template: "filepaths",
  },
};

export default completionSpec;
