const stringSuggestions: Fig.Suggestion[] = [
	{
		name: "a",
		description: "Any single character",
		priority: 40,
	},
	{
		name: "\\a",
		description: "Alert character",
		priority: 39,
	},
	{
		name: "\\b",
		description: "Backspace character",
		priority: 39,
	},
	{
		name: "\\f",
		description: "Form feed character",
		priority: 39,
	},
	{
		name: "\\n",
		description: "Newline character",
		priority: 39,
	},
	{
		name: "\\r",
		description: "Carriage return character",
		priority: 39,
	},
	{
		name: "\\t",
		description: "Tab character",
		priority: 39,
	},
	{
		name: "\\v",
		description: "Vertical tab character",
		priority: 39,
	},
	{
		name: "c-c",
		description:
			"For non-octal range endpoints represents the range of characters between the range endpoints, inclusive, in ascending order, as defined by the collation sequence",
		priority: 38,
	},
	{
		name: "[:alnum:]",
		description: "Alphanumeric characters",
		priority: 37,
	},
	{
		name: "[:alpha:]",
		description: "Alphabetic characters",
		priority: 37,
	},
	{
		name: "[:blank:]",
		description: "Blank characters",
		priority: 37,
	},
	{
		name: "[:cntrl:]",
		description: "Control characters",
		priority: 37,
	},
	{
		name: "[:digit:]",
		description: "Digit characters",
		priority: 37,
	},
	{
		name: "[:graph:]",
		description: "Graphic characters",
		priority: 37,
	},
	{
		name: "[:ideogram:]",
		description: "Ideographic characters",
		priority: 37,
	},
	{
		name: "[:lower:]",
		description: "Lower-case characters",
		priority: 37,
	},
	{
		name: "[:phonogram:]",
		description: "Phonographic characters",
		priority: 37,
	},
	{
		name: "[:print:]",
		description: "Printable characters",
		priority: 37,
	},
	{
		name: "[:punct:]",
		description: "Punctuation characters",
		priority: 37,
	},
	{
		name: "[:rune:]",
		description: "Valid characters",
		priority: 37,
	},
	{
		name: "[:space:]",
		description: "Space characters",
		priority: 37,
	},
	{
		name: "[:special:]",
		description: "Special characters",
		priority: 37,
	},
	{
		name: "[:upper:]",
		description: "Upper-case characters",
		priority: 37,
	},
	{
		name: "[:xdigit:]",
		description: "Hexadecimal characters",
		priority: 37,
	},
	{
		name: "[=equiv=]",
		description:
			"Represents all characters belonging to the same equivalence class as 'equiv', ordered by their encoded values",
		priority: 36,
	},
	{
		name: "[#*n]",
		description:
			"Represents 'n' repeated occurrences of the character represented by '#'",
		priority: 35,
	},
];

const completionSpec: Fig.Spec = {
	name: "tr",
	description: "Translate characters",
	parserDirectives: {
		optionsMustPrecedeArguments: true,
	},
	options: [
		{
			name: "-C",
			description:
				"Complement the set of characters in string1, that is '-C ab' includes every character except for 'a' and 'b'",
		},
		{
			name: "-c",
			description: "Same as '-C' but complement the set of values in string1",
		},
		{
			name: "-d",
			description: "Delete characters in string1 from the input",
		},
		{
			name: "-s",
			description:
				"Squeeze multiple occurrences of the characters listed in the last operand (either string1 or string2) in the input into a single instance of the character. This occurs after all deletion and translation is completed",
		},
		{
			name: "-u",
			description: "Guarantee that any output is unbuffered",
		},
	],
	args: [
		{
			name: "string1",
			description: "Candidate string",
			suggestions: stringSuggestions,
		},
		{
			name: "string2",
			description: "Replacment string",
			isOptional: true,
			suggestions: stringSuggestions,
		},
	],
};

export default completionSpec;
