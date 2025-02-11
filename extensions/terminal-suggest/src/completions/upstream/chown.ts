export const existingUsersandGroups: Fig.Generator = {
  custom: async function (tokens, executeShellCommand) {
    const colonAdded = tokens.find((token) => token.includes(":"));
    const nFlagUsed = tokens.find((token) => /^-.*n.*/.test(token));

    let shell: string;
    // Using `:` as a trigger, check to see if a colon is added
    // in the current command. If it is, get the system groups
    // else retrieve the list of system users
    if (colonAdded) {
      const { stdout } = await executeShellCommand({
        command: "bash",
        args: [
          "-c",
          "dscl . -list /Groups PrimaryGroupID | tr -s ' '| sort -r",
        ],
      });
      shell = stdout;
    } else {
      const { stdout } = await executeShellCommand({
        command: "bash",
        args: ["-c", "dscl . -list /Users UniqueID | tr -s ' '| sort -r"],
      });
      shell = stdout;
    }

    return (
      shell
        .split("\n")
        // The shell command retrieves a table
        // with rows that look like `user uid`
        // so each row is split again to get the
        // user/group and uid/gid
        .map((line) => line.split(" "))
        .map((value) => {
          return {
            // If the user has entered the option n
            // suggest the uid/gid instead of user/group
            name: nFlagUsed ? value[1] : value[0],
            description: colonAdded
              ? `Group - ${nFlagUsed ? value[0] : `gid: ${value[1]}`}`
              : `User - ${nFlagUsed ? value[0] : `uid: ${value[1]}`}`,
            icon: colonAdded ? "👥" : "👤",
            priority: 90,
          };
        })
    );
  },
  trigger: ":",
  getQueryTerm: ":",
};

const completionSpec: Fig.Spec = {
  name: "chown",
  description:
    "Change the user and/or group ownership of a given file, directory, or symbolic link",
  args: [
    {
      name: "owner[:group] or :group",
      generators: existingUsersandGroups,
    },
    {
      name: "file/directory",
      isVariadic: true,
      template: ["filepaths", "folders"],
    },
  ],
  options: [
    {
      name: "-f",
      description:
        "Don't report any failure to change file owner or group, nor modify the exit status to reflect such failures",
    },
    {
      name: "-h",
      description:
        "If the file is a symbolic link, change the user ID and/or the group ID of the link itself",
    },
    {
      name: "-n",
      description:
        "Interpret user ID and group ID as numeric, avoiding name lookups",
    },
    {
      name: "-v",
      description:
        "Cause chown to be verbose, showing files as the owner is modified",
    },
    {
      name: "-R",
      description:
        "Change the user ID and/or the group ID for the file hierarchies rooted in the files instead of just the files themselves",
    },
    {
      name: "-H",
      description:
        "If the -R option is specified, symbolic links on the command line are followed",
      exclusiveOn: ["-L", "-P"],
      dependsOn: ["-R"],
    },
    {
      name: "-L",
      description:
        "If the -R option is specified, all symbolic links are followed",
      exclusiveOn: ["-H", "-P"],
      dependsOn: ["-R"],
    },
    {
      name: "-P",
      description:
        "If the -R option is specified, no symbolic links are followed",
      exclusiveOn: ["-H", "-L"],
      dependsOn: ["-R"],
    },
  ],
};
export default completionSpec;
