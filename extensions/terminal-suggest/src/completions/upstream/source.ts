const completionSpec: Fig.Spec = {
	name: "source",
	description: "Source files in shell",
	args: {
		isVariadic: true,
		name: "File to source",
		template: "filepaths",
	},
};

export default completionSpec;
