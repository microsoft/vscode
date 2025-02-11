// Linux incompatible

const signals = [
  "hup",
  "int",
  "quit",
  "ill",
  "trap",
  "abrt",
  "emt",
  "fpe",
  "kill",
  "bus",
  "segv",
  "sys",
  "pipe",
  "alrm",
  // This is the default signal
  // "term",
  "urg",
  "stop",
  "tstp",
  "cont",
  "chld",
  "ttin",
  "ttou",
  "io",
  "xcpu",
  "xfsz",
  "vtalrm",
  "prof",
  "winch",
  "info",
  "usr1",
  "usr2",
];

const completionSpec: Fig.Spec = {
  name: "killall",
  description: "Kill processes by name",
  args: {
    name: "process_name",
    isVariadic: true,
    generators: {
      // All processes, only display the path
      script: ["bash", "-c", "ps -A -o comm | sort -u"],
      postProcess: (out) =>
        out
          .trim()
          .split("\n")
          .map((path) => {
            const appExtIndex = path.indexOf(".app/");
            const isApp = appExtIndex !== -1;
            const name = path.slice(path.lastIndexOf("/") + 1);
            const nameChars = new Set(name);
            const badChars = ["(", "_", "."];
            return {
              name,
              description: path,
              priority:
                !badChars.some((char) => nameChars.has(char)) && isApp
                  ? 51
                  : 40,
              icon: isApp
                ? "fig://" + path.slice(0, appExtIndex + 4)
                : "fig://icon?type=gear",
            };
          }),
    },
  },
  options: [
    {
      name: "-d",
      description: "Be verbose (dry run) and display number of user processes",
    },
    {
      name: "-e",
      description:
        "Use the effective user ID instead of the real user ID for matching processes with -u",
    },
    {
      name: "-help",
      description: "Display help and exit",
    },
    {
      name: "-I",
      description: "Request confirmation before killing each process",
    },
    {
      name: "-l",
      description: "List the names of the available signals and exit",
    },
    {
      name: "-m",
      description: "Match the process name as a regular expression",
    },
    {
      name: "-v",
      description: "Be verbose",
    },
    {
      name: "-s",
      description: "Be verbose (dry run)",
    },
    ...signals.map((signal) => ({
      name: "-SIG" + signal.toUpperCase(),
      description: `Send ${signal.toUpperCase()} instead of TERM`,
    })),
    {
      name: "-u",
      description:
        "Limit potentially matching processes to those belonging to the user",
      args: {
        name: "user",
        generators: {
          script: ["bash", "-c", "dscl . -list /Users | grep -v '^_'"],
          postProcess: (out) =>
            out
              .trim()
              .split("\n")
              .map((username) => ({
                name: username,
                icon: "fig://template?badge=👤",
              })),
        },
      },
    },
    {
      name: "-t",
      description:
        "Limit matching processes to those running on the specified TTY",
      args: {
        name: "tty",
      },
    },
    {
      name: "-c",
      description: "Limit matching processes to those matching the given name",
      args: {
        name: "name",
      },
    },
    {
      name: "-q",
      description: "Suppress error message if no processes are matched",
    },
    {
      name: "-z",
      description: "Do not skip zombies",
    },
  ],
};
export default completionSpec;
