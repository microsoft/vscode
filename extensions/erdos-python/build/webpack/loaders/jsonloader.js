// For some reason this has to be in commonjs format

module.exports = function (source) {
    // Just inline the source and fix up defaults so that they don't
    // mess up the logic in the setOptions.js file
    return `module.exports = ${source}\nmodule.exports.default = false`;
};
