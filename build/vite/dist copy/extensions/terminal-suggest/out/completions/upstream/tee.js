"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const completionSpec = {
    name: "tee",
    description: "Duplicate standard input",
    options: [
        {
            name: "-a",
            description: "Append the output to the files rather than overwriting them",
        },
        {
            name: "-i",
            description: "Ignore the SIGINT signal",
        },
    ],
    args: {
        name: "file",
        description: "Pathname of an output file",
        isVariadic: true,
        template: "filepaths",
    },
};
exports.default = completionSpec;
//# sourceMappingURL=tee.js.map