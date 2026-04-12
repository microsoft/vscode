"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const completionSpec = {
    name: "clear",
    description: "Clear the terminal screen",
    options: [
        {
            name: "-T",
            description: "Indicates the type of terminal",
            args: {
                name: "type",
            },
        },
        {
            name: "-V",
            description: "Reports version of ncurses used in this program, and exits",
        },
        {
            name: "-x",
            description: "Do not attempt to clear terminal's scrollback buffer using the extended E3 capability",
        },
    ],
};
exports.default = completionSpec;
//# sourceMappingURL=clear.js.map