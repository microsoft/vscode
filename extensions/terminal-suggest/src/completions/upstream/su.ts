const completionSpec: Fig.Spec = {
	name: "su",
	description: "",
	options: [
		{
			name: "-f",
			description:
				"If the invoked shell is csh(1), this option prevents it from reading the .cshrc file",
		},
		{
			name: "-l",
			description:
				"Simulate a full login.  The environment is discarded except for  HOME, SHELL, PATH, TERM, and USER. HOME and SHELL are modified as above.  USER is set to the target login.  PATH is set to   ``/bin:/usr/bin''.  TERM is imported from your current environment.  The invoked shell is the target login's, and su willchange directory to the target login's home directory",
		},
		{ name: "-", description: "(no letter) The same as -l" },
		{
			name: "-m",
			description:
				"Leave the environment unmodified.  The invoked shell is your login shell, and no directory changes are made.  As a security precaution, if the target user's shell is a non-standard shell (as defined by getusershell(3)) and the caller's real uid is non-zero, su will fail",
		},
	],
	args: [
		{ name: "login", isOptional: true },
		{ name: "ARGS", isOptional: true },
	],
};

export default completionSpec;
