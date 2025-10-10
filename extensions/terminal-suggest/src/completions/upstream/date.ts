const completionSpec: Fig.Spec = {
	name: "date",
	description: "Display or set date and time",
	options: [
		{
			name: "-d",
			description: "Set the kernel's value for daylight saving time",
			args: {
				name: "dst",
			},
		},
		{
			name: "-f",
			description:
				"Use specified format for input instead of the default [[[mm]dd]HH]MM[[cc]yy][.ss] format",
			args: [
				{
					name: "input_fmt",
					description: "The format with which to parse the new date value",
				},
				{
					name: "new_date",
					description: "The new date to set",
				},
			],
		},
		{
			name: "-j",
			description: "Don't try to set the date",
		},
		{
			name: "-n",
			description:
				"Only set time on the current machine, instead of all machines in the local group",
		},
		{
			name: "-R",
			description: "Use RFC 2822 date and time output format",
		},
		{
			name: "-r",
			description:
				"Print the date and time represented by the specified number of seconds since the Epoch",
			args: {
				name: "seconds",
				description:
					"Number of seconds since the Epoch (00:00:00 UTC, January 1, 1970)",
			},
		},
		{
			name: "-t",
			description: "Set the system's value for minutes west of GMT",
			args: {
				name: "minutes_west",
			},
		},
		{
			name: "-u",
			description:
				"Display or set the date in UTC (Coordinated Universal) time",
		},
		{
			name: "-v",
			description:
				"Adjust and print (but don't set) the second, minute, hour, month day, week day, month, or year according to val",
			args: {
				name: "val",
				description: "[+|-]val[ymwdHMS]",
			},
		},
	],
	args: {
		name: "new_time OR output_fmt",
		description:
			"New_time: [[[mm]dd]HH]MM[[cc]yy][.ss], output_fmt: '+' followed by user-defined format string",
		isOptional: true,
		isDangerous: true,
	},
};
export default completionSpec;
