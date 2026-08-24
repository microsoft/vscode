const completionSpec: Fig.Spec = {
	name: "dirname",
	description: "Return directory portion of pathname",
	args: {
		name: "string",
		description: "String to operate on (typically filenames)",
		isVariadic: true,
		template: "filepaths",
	},
};
export default completionSpec;
