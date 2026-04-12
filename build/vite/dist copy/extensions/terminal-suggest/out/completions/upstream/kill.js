"use strict";
// Compatibility: macOS
Object.defineProperty(exports, "__esModule", { value: true });
function processIcon(path) {
    const idx = path.indexOf(".app/");
    if (idx === -1) {
        return "fig://icon?type=gear";
    }
    return "fig://" + path.slice(0, idx + 4);
}
const completionSpec = {
    name: "kill",
    description: "Terminate or signal a process",
    args: {
        name: "pid",
        isVariadic: true,
        generators: {
            script: ["bash", "-c", "ps axo pid,comm | sed 1d"],
            postProcess: (result) => {
                return result.split("\n").map((line) => {
                    const [pid, path] = line.trim().split(/\s+/);
                    const name = path.slice(path.lastIndexOf("/") + 1);
                    return {
                        name: pid,
                        description: path,
                        displayName: `${pid} (${name})`,
                        icon: processIcon(path),
                    };
                });
            },
        },
    },
    options: [
        {
            name: "-s",
            description: "A symbolic signal name specifying the signal to be sent",
            args: {
                name: "signal_name",
                generators: {
                    // Bash's `kill` builtin has different output to /bin/kill
                    script: ["env", "kill", "-l"],
                    postProcess: (out) => out.match(/\w+/g)?.map((name) => ({
                        name,
                        description: `Send ${name} instead of TERM`,
                        icon: "fig://icon?type=string",
                    })),
                },
            },
        },
        {
            name: "-l",
            description: "If no operand is given, list the signal names; otherwise, write the signal name corresponding to exit_status",
            args: {
                name: "exit_status",
                isOptional: true,
            },
        },
    ],
};
exports.default = completionSpec;
//# sourceMappingURL=kill.js.map