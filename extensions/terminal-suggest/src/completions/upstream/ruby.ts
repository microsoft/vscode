const completionSpec: Fig.Spec = {
	name: "ruby",
	description: "Interpreted object-oriented scripting language",
	options: [
		{
			name: "--copyright",
			description: "Prints the copyright notice",
		},
		{
			name: "--version",
			description: "Prints the version of Ruby interpreter",
		},
		{
			name: "-0",
			description:
				"Specifies the input record separator ($/) as an octal number",
			args: { name: "octal" },
		},
		{
			name: "-C",
			description: "Causes Ruby to switch to the directory",
			args: { name: "directory", template: "folders" },
		},
		{
			name: "-F",
			description: "Specifies input field separator ($;)",
			args: { name: "pattern" },
		},
		{
			name: "-I",
			description:
				"Used to tell Ruby where to load the library scripts. Directory path will be added to the load-path variable ($:)",
			args: { name: "directory", template: "folders" },
		},
		{
			name: "-K",
			description: "Specifies KANJI (Japanese) encoding",
			args: { name: "kcode" },
		},
		{
			name: "-S",
			description:
				"Makes Ruby use the PATH environment variable to search for script, unless its name begins with a slash. This is used to emulate #! on machines that don't support it, in the following manner: #! /usr/local/bin/ruby # This line makes the next one a comment in Ruby \\ exec /usr/local/bin/ruby -S $0 $*",
		},
		{
			name: "-T",
			description: "Turns on taint checks at the specified level (default 1)",
			args: { name: "level" },
		},
		{
			name: "-a",
			description: "Turns on auto-split mode when used with -n or -p",
		},
		{
			name: "-c",
			description:
				"Causes Ruby to check the syntax of the script and exit without executing. If there are no syntax errors, Ruby will print “Syntax OK” to the standard output",
		},
		{
			name: ["-d", "--debug"],
			description: "Turns on debug mode. $DEBUG will be set to true",
		},
		{
			name: "-e",
			description:
				"Specifies script from command-line while telling Ruby not to search the rest of arguments for a script file name",
			args: { name: "command" },
		},
		{
			name: ["-h", "--help"],
			description: "Prints a summary of the options",
		},
		{
			name: "-i",
			description:
				"Specifies in-place-edit mode. The extension, if specified, is added to old file name to make a backup copy",
			args: { name: "extension", isOptional: true },
		},
		{
			name: "-l",
			description:
				"Enables automatic line-ending processing, which means to firstly set $\\ to the value of $/, and secondly chops every line read using chop!",
		},
		{
			name: "-n",
			description:
				"Causes Ruby to assume the following loop around your script",
		},
		{
			name: "-p",
			description: `Acts mostly same as -n switch, but print the value of variable $_ at the each end of the loop`,
		},
		{
			name: "-r",
			description: "Causes Ruby to load the library using require",
			args: { name: "library" },
		},
		{
			name: "-s",
			description:
				"Enables some switch parsing for switches after script name but before any file name arguments (or before a --)",
		},
		{
			name: ["-v", "--verbose"],
			description: "Enables verbose mode",
		},
		{
			name: "-w",
			description:
				"Enables verbose mode without printing version message at the beginning. It sets the $VERBOSE variable to true",
		},
		{
			name: "-x",
			description:
				"Tells Ruby that the script is embedded in a message. Leading garbage will be discarded until the first that starts with “#!” and contains the string, “ruby”. Any meaningful switches on that line will applied. The end of script must be specified with either EOF, ^D (control-D), ^Z (control-Z), or reserved word __END__. If the directory name is specified, Ruby will switch to that directory before executing script",
			args: { name: "directory", template: "folders" },
		},
		{
			name: ["-y", "--yydebug"],
			description:
				"Turns on compiler debug mode. Ruby will print a bunch of internal state messages during compiling scripts. You don't have to specify this switch, unless you are going to debug the Ruby interpreter",
		},
	],
};

export default completionSpec;
