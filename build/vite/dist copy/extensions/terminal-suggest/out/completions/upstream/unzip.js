"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const completionSpec = {
    name: "unzip",
    description: "Extract compressed files in a ZIP archive",
    args: {
        name: "file",
        template: "filepaths",
    },
    options: [
        {
            name: "-l",
            description: "List the contents of a zip file without extracting",
            args: {
                name: "file",
                template: "filepaths",
            },
        },
        {
            name: "-c",
            args: {
                name: "file",
                template: "filepaths",
            },
        },
        {
            name: "-0",
            description: "Extract a zip file created in windows, containing files with non-ascii (chinese) filenames",
            args: [
                {
                    name: "gbk",
                },
                {
                    name: "file",
                    template: "filepaths",
                },
            ],
        },
        {
            name: "-d",
            args: {
                name: "destination",
                template: "folders",
            },
        },
    ],
};
exports.default = completionSpec;
//# sourceMappingURL=unzip.js.map