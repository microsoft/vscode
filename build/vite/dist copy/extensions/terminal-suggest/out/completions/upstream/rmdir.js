"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const completionSpec = {
    name: "rmdir",
    description: "Remove directories",
    args: {
        isVariadic: true,
        template: "folders",
    },
    options: [
        {
            name: "-p",
            description: "Remove each directory of path",
            isDangerous: true,
        },
    ],
};
exports.default = completionSpec;
//# sourceMappingURL=rmdir.js.map