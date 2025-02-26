const completionSpec: Fig.Spec = {
  name: "vim",
  description: "Vi IMproved, a programmer's text editor",
  args: {
    template: "filepaths",
    // suggestCurrentToken: true,
  },
  options: [
    {
      name: "-v",
      description: "Vi mode (like 'vi')",
    },
    {
      name: "-e",
      description: "Ex mode (like 'ex')",
    },
    {
      name: "-E",
      description: "Improved Ex mode",
    },
    {
      name: "-s",
      description:
        "Enable silent mode (when in ex mode), or Read Normal mode commands from file",
      args: {
        name: "scriptin",
        template: "filepaths",
        isOptional: true,
      },
    },
    {
      name: "-d",
      description: "Diff mode (like 'vimdiff')",
    },
    {
      name: "-y",
      description: "Easy mode (like 'evim', modeless)",
    },
    {
      name: "-R",
      description: "Readonly mode (like 'view')",
    },
    {
      name: "-Z",
      description: "Restricted mode (like 'rvim')",
    },
    {
      name: "-m",
      description: "Modifications (writing files) not allowed",
    },
    {
      name: "-M",
      description: "Modifications in text not allowed",
    },
    {
      name: "-b",
      description: "Binary mode",
    },
    {
      name: "-l",
      description: "Lisp mode",
    },
    {
      name: "-C",
      description: "Compatible with Vi: 'compatible'",
    },
    {
      name: "-N",
      description: "Not fully Vi compatible: 'nocompatible'",
    },
    {
      name: "-V",
      description: "Be verbose [level N] [log messages to fname]",
      args: [
        {
          name: "N",
        },
        {
          name: "fname",
          template: "filepaths",
        },
      ],
    },
    {
      name: "-D",
      description: "Debugging mode",
    },
    {
      name: "-n",
      description: "No swap file, use memory only",
    },
    {
      name: "-r",
      description:
        "Recover crashed session if filename is specified, otherwise list swap files and exit",
      args: {
        name: "filename",
        isOptional: true,
        template: "filepaths",
      },
    },
    {
      name: "-L",
      description: "Same as -r",
      args: {
        name: "filename",
        template: "filepaths",
      },
    },
    {
      name: "-T",
      description: "Set terminal type to <terminal>",
      args: {
        name: "terminal",
      },
    },
    {
      name: "--not-a-term",
      description: "Skip warning for input/output not being a terminal",
    },
    {
      name: "--ttyfail",
      description: "Exit if input or output is not a terminal",
    },
    {
      name: "-u",
      description: "Use <vimrc> instead of any .vimrc",
      args: {
        name: "vimrc",
        template: "filepaths",
      },
    },
    {
      name: "--noplugin",
      description: "Don't load plugin scripts",
    },
    {
      name: "-p",
      description: "Open N tab pages (default: one for each file)",
      args: {
        name: "N",
        isOptional: true,
      },
    },
    {
      name: "-o",
      description: "Open N windows (default: one for each file)",
      args: {
        name: "N",
        isOptional: true,
      },
    },
    {
      name: "-O",
      description: "Like -o but split vertically",
      args: {
        name: "N",
        isOptional: true,
      },
    },
    {
      name: "+",
      description:
        "Start at end of file, if line number is specified, start at that line",
      args: {
        name: "lnum",
        isOptional: true,
      },
    },
    {
      name: "--cmd",
      description: "Execute <command> before loading any vimrc file",
      args: {
        name: "command",
        isCommand: true,
      },
    },
    {
      name: "-c",
      description: "Execute <command> after loading the first file",
      args: {
        name: "command",
      },
    },
    {
      name: "-S",
      description: "Source file <session> after loading the first file",
      args: {
        name: "session",
        template: "filepaths",
      },
    },
    {
      name: "-w",
      description: "Append all typed commands to file <scriptout>",
      args: {
        name: "scriptout",
        template: "filepaths",
      },
    },
    {
      name: "-W",
      description: "Write all typed commands to file <scriptout>",
      args: {
        name: "scriptout",
        template: "filepaths",
      },
    },
    {
      name: "-x",
      description: "Edit encrypted files",
    },
    {
      name: "--startuptime",
      description: "Write startup timing messages to <file>",
      args: {
        name: "file",
        template: "filepaths",
      },
    },
    {
      name: "-i",
      description: "Use <viminfo> instead of .viminfo",
      args: {
        name: "viminfo",
        template: "filepaths",
      },
    },
    {
      name: "--clean",
      description: "'nocompatible', Vim defaults, no plugins, no viminfo",
    },
    {
      name: ["-h", "--help"],
      description: "Print Help message and exit",
    },
    {
      name: "--version",
      description: "Print version information and exit",
    },
  ],
};

export default completionSpec;
