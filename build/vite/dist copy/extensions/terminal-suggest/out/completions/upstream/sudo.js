"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const completionSpec = {
    name: "sudo",
    description: "Execute a command as the superuser or another user",
    options: [
        {
            name: ["-g", "--group"],
            description: "Run command as the specified group name or ID",
            args: {
                name: "group",
                description: "Group name or ID",
            },
        },
        {
            name: ["-h", "--help"],
            description: "Display help message and exit",
        },
        {
            name: ["-u", "--user"],
            description: "Run command as specified user name or ID",
            args: {
                name: "user",
                description: "User name or ID",
            },
        },
    ],
    // Only uncomment if sudo takes an argument
    args: {
        name: "command",
        description: "Command to run with elevated permissions",
        isCommand: true,
    },
};
exports.default = completionSpec;
//# sourceMappingURL=sudo.js.map