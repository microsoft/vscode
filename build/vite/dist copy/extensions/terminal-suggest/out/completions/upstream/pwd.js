"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const completionSpec = {
    name: "pwd",
    description: "Return working directory name",
    options: [
        {
            name: "-L",
            description: "Display the logical current working directory",
        },
        {
            name: "-P",
            description: "Display the physical current working directory",
        },
    ],
};
exports.default = completionSpec;
//# sourceMappingURL=pwd.js.map