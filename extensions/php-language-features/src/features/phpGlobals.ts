/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// file generated from PHP53Schema.xml using php-exclude_generate_php_globals.js

export interface IEntry { description?: string; signature?: string; }
export interface IEntries { [name: string]: IEntry; }

export var globalfunctions: IEntries = {
	password_get_info: {
		description: 'Returns information about the given hash. (5.5 only)',
		signature: '( string $hash ): array'
	},
	password_hash: {
		description: 'Creates a password hash. (5.5 only)',
		signature: '( string $password , integer $algo [, array $options ] ): string'
	},
	password_needs_rehash: {
		description: 'Checks if the given hash matches the given options. (5.5 only)',
		signature: '( string $hash , string $algo [, string $options ] ): boolean'
	},
	password_verify: {
		description: 'Verifies that a password matches a hash. (5.5 only)',
		signature: '( string $password , string $hash ): boolean'
	},
	hex2bin: {
		description: 'Decodes a hexadecimally encoded binary string. (5.4 only)',
		signature: '(string $data): string'
	},
	http_response_code: {
		description: 'If you pass no parameters then http_response_code will get the current status code. If you pass a parameter it will set the response code. (5.4 only)',
		signature: '([ int $response_code ] ): int'
	},
	get_declared_traits: {
		description: 'Returns an array of all declared traits. (5.4 only)',
		signature: '( void ): array'
	},
	getimagesizefromstring: {
		description: 'Get the size of an image from a string. (5.4 only)',
	},
	socket_import_stream: {
		description: 'Imports a stream that encapsulates a socket into a socket extension resource. (5.4 only)',
		signature: '( resource $stream ): void'
	},
	stream_set_chunk_size: {
		description: 'Set the stream chunk size. (5.4 only)',
	},
	trait_exists: {
		description: 'Checks if the trait exists. (5.4 only)',
		signature: '( string $traitname [, bool $autoload ] ): bool'
	},
	header_register_callback: {
		description: 'Registers a function that will be called when PHP starts sending output.  The callback is executed just after PHP prepares all headers to be sent, and before any other output is sent, creating a window to manipulate the outgoing headers before being sent. (5.4 only)',
		signature: '( callable $callback ): bool'
	},
	class_uses: {
		description: 'Returns an array with the names of the traits that the given class uses. This does however not include any traits used by a parent class. (5.4 only)',
		signature: '( mixed $class [, bool $autoload = true ] ): array'
	},
	session_status: {
		description: 'Returns the current session status. (5.4 only)',
		signature: '( void ): int'
	},
	session_register_shutdown: {
		description: 'Registers session_write_close() as a shutdown function. (5.4 only)',
		signature: '( void ): void'
	},
	mysqli_error_list: {
		description: 'Returns a array of errors for the most recent MySQLi function call that can succeed or fail. (5.4 only)',
		signature: '( mysqli $link ): array'
	},
	mysqli_stmt_error_list: {
		description: 'Returns an array of errors for the most recently invoked statement function that can succeed or fail. (5.4 only)',
		signature: '( mysqli_stmt $stmt ): array'
	},
	libxml_set_external_entity_loader: {
		description: 'Changes the default external entity loader. (5.4 only)',
		signature: '( callable $resolver_function ): void'
	},
	zlib_decode: {
		description: 'Uncompress any raw/gzip/zlib encoded data. (5.4 only)',
		signature: '( string $data [, string $max_decoded_len ] ): string'
	},
	zlib_encode: {
		description: 'Compress data with the specified encoding. (5.4 only)',
		signature: '( string $data , string $encoding [, string $level = -1 ] ): string'
	},
	zend_version: {
		description: 'Returns a string containing the version of the currently running Zend Engine.',
		signature: '(void): string'
	},
	func_num_args: {
		description: 'Gets the number of arguments passed to the function.',
		signature: '(void): int'
	},
	func_get_arg: {
		description: 'Gets the specified argument from a user-defined function\'s argument list.',
		signature: '(int $arg_num): mixed'
	},
	func_get_args: {
		description: 'Gets an array of the function\'s argument list.',
		signature: '(void): array'
	},
	strlen: {
		description: 'Returns the length of the given string.',
		signature: '(string $string): int'
	},
	strcmp: {
		description: 'Note that this comparison is case sensitive.',
		signature: '(string $str1 , string $str2): int'
	},
	strncmp: {
		description: 'This function is similar to strcmp(), with the difference that you can specify the (upper limit of the) number of characters from each string to be used in the comparison.',
		signature: '(string $str1 , string $str2 , int $len): int'
	},
	strcasecmp: {
		description: 'Binary safe case-insensitive string comparison.',
		signature: '(string $str1 , string $str2): int'
	},
	strncasecmp: {
		description: 'This function is similar to strcasecmp(), with the difference that you can specify the (upper limit of the) number of characters from each string to be used in the comparison.',
		signature: '(string $str1 , string $str2 , int $len): int'
	},
	each: {
		description: 'Return the current key and value pair from an array and advance the array cursor.',
		signature: '(array &$array): array'
	},
	error_reporting: {
		description: 'The error_reporting() function sets the error_reporting directive at runtime. PHP has many levels of errors, using this function sets that level for the duration (runtime) of your script. If the optional level is not set, error_reporting() will just return the current error reporting level.',
		signature: '([ int $level ]): int'
	},
	define: {
		description: 'Defines a named constant at runtime.',
		signature: '(string $name , mixed $value [, bool $case_insensitive = false ]): bool'
	},
	defined: {
		description: 'Checks whether the given constant exists and is defined.',
		signature: '(string $name): bool'
	},
	get_class: {
		description: 'Gets the name of the class of the given object.',
		signature: '([ object $object = NULL ]): string'
	},
	get_called_class: {
		description: 'Gets the name of the class the static method is called in.',
		signature: '(void): string'
	},
	get_parent_class: {
		description: 'Retrieves the parent class name for object or class.',
		signature: '([ mixed $object ]): string'
	},
	method_exists: {
		description: 'Checks if the class method exists in the given object.',
		signature: '(mixed $object , string $method_name): bool'
	},
	property_exists: {
		description: 'This function checks if the given property exists in the specified class.',
		signature: '(mixed $class , string $property): bool'
	},
	class_exists: {
		description: 'This function checks whether or not the given class has been defined.',
		signature: '(string $class_name [, bool $autoload = true ]): bool'
	},
	interface_exists: {
		description: 'Checks if the given interface has been defined.',
		signature: '(string $interface_name [, bool $autoload = true ]): bool'
	},
	function_exists: {
		description: 'Checks the list of defined functions, both built-in (internal) and user-defined, for function_name.',
		signature: '(string $function_name): bool'
	},
	class_alias: {
		description: 'Creates an alias named alias based on the defined class original. The aliased class is exactly the same as the original class.',
		signature: '([ string $original [, string $alias ]]): bool'
	},
	get_included_files: {
		description: 'Gets the names of all files that have been included using include(), include_once(), require() or require_once().',
		signature: '(void): array'
	},
	get_required_files: {
		description: 'Alias of get_included_files get_magic_quotes_runtime getenv PHP Options/Info Functions PHP Manual get_required_files (PHP 4, PHP 5)',
	},
	is_subclass_of: {
		description: 'Checks if the given object has the class class_name as one of its parents.',
		signature: '(mixed $object , string $class_name): bool'
	},
	is_a: {
		description: 'Checks if the given object is of this class or has this class as one of its parents.',
		signature: '(object $object , string $class_name): bool'
	},
	get_class_vars: {
		description: 'Get the default properties of the given class.',
		signature: '(string $class_name): array'
	},
	get_object_vars: {
		description: 'Gets the accessible non-static properties of the given object according to scope.',
		signature: '(object $object): array'
	},
	get_class_methods: {
		description: 'Gets the class methods names.',
		signature: '(mixed $class_name): array'
	},
	trigger_error: {
		description: 'Used to trigger a user error condition, it can be used by in conjunction with the built-in error handler, or with a user defined function that has been set as the new error handler (set_error_handler()).',
		signature: '(string $error_msg [, int $error_type = E_USER_NOTICE ]): bool'
	},
	user_error: {
		description: 'Alias of trigger_error trigger_error htscanner Error Handling Functions PHP Manual user_error (PHP 4, PHP 5)',
	},
	set_error_handler: {
		description: 'Sets a user function (error_handler) to handle errors in a script.',
		signature: '(callback $error_handler [, int $error_types = E_ALL | E_STRICT ]): mixed'
	},
	restore_error_handler: {
		description: 'Used after changing the error handler function using set_error_handler(), to revert to the previous error handler (which could be the built-in or a user defined function).',
		signature: '(void): bool'
	},
	set_exception_handler: {
		description: 'Sets the default exception handler if an exception is not caught within a try/catch block. Execution will stop after the exception_handler is called.',
		signature: '(callback $exception_handler): callback'
	},
	restore_exception_handler: {
		description: 'Used after changing the exception handler function using set_exception_handler(), to revert to the previous exception handler (which could be the built-in or a user defined function).',
		signature: '(void): bool'
	},
	get_declared_classes: {
		description: 'Gets the declared classes.',
		signature: '(void): array'
	},
	get_declared_interfaces: {
		description: 'Gets the declared interfaces.',
		signature: '(void): array'
	},
	get_defined_functions: {
		description: 'Gets an array of all defined functions.',
		signature: '(void): array'
	},
	get_defined_vars: {
		description: 'This function returns a multidimensional array containing a list of all defined variables, be them environment, server or user-defined variables, within the scope that get_defined_vars() is called.',
		signature: '(void): array'
	},
	create_function: {
		description: 'Creates an anonymous function from the parameters passed, and returns a unique name for it.',
		signature: '(string $args , string $code): string'
	},
	get_resource_type: {
		description: 'This function gets the type of the given resource.',
		signature: '(resource $handle): string'
	},
	get_loaded_extensions: {
		description: 'This function returns the names of all the modules compiled and loaded in the PHP interpreter.',
		signature: '([ bool $zend_extensions = false ]): array'
	},
	extension_loaded: {
		description: 'Finds out whether the extension is loaded.',
		signature: '(string $name): bool'
	},
	get_extension_funcs: {
		description: 'This function returns the names of all the functions defined in the module indicated by module_name.',
		signature: '(string $module_name): array'
	},
	get_defined_constants: {
		description: 'Returns the names and values of all the constants currently defined. This includes those created by extensions as well as those created with the define() function.',
		signature: '([ bool $categorize = false ]): array'
	},
	debug_backtrace: {
		description: 'debug_backtrace() generates a PHP backtrace.',
		signature: '([ int $options = DEBUG_BACKTRACE_PROVIDE_OBJECT [, int $limit = 0 ]]): array'
	},
	debug_print_backtrace: {
		description: 'debug_print_backtrace() prints a PHP backtrace. It prints the function calls, included/required files and eval()ed stuff.',
		signature: '([ int $options = 0 [, int $limit = 0 ]]): void'
	},
	gc_collect_cycles: {
		description: 'This function is currently not documented; only its argument list is available.',
		signature: '(void): int'
	},
	gc_enabled: {
		description: 'This function is currently not documented; only its argument list is available.',
		signature: '(void): bool'
	},
	gc_enable: {
		description: 'This function is currently not documented; only its argument list is available.',
		signature: '(void): void'
	},
	gc_disable: {
		description: 'This function is currently not documented; only its argument list is available.',
		signature: '(void): void'
	},
	bcadd: {
		description: 'Sums left_operand and right_operand.',
		signature: '(string $left_operand , string $right_operand [, int $scale ]): string'
	},
	bcsub: {
		description: 'Subtracts the right_operand from the left_operand.',
		signature: '(string $left_operand , string $right_operand [, int $scale ]): string'
	},
	bcmul: {
		description: 'Multiply the left_operand by the right_operand.',
		signature: '(string $left_operand , string $right_operand [, int $scale ]): string'
	},
	bcdiv: {
		description: 'Divides the left_operand by the right_operand.',
		signature: '(string $left_operand , string $right_operand [, int $scale ]): string'
	},
	bcmod: {
		description: 'Get the modulus of the left_operand using modulus.',
		signature: '(string $left_operand , string $modulus): string'
	},
	bcpow: {
		description: 'Raise left_operand to the power right_operand.',
		signature: '(string $left_operand , string $right_operand [, int $scale ]): string'
	},
	bcsqrt: {
		description: 'Return the square root of the operand.',
		signature: '(string $operand [, int $scale ]): string'
	},
	bcscale: {
		description: 'Sets the default scale parameter for all subsequent bc math functions that do not explicitly specify a scale parameter.',
		signature: '(int $scale): bool'
	},
	bccomp: {
		description: 'Compares the left_operand to the right_operand and returns the result as an integer.',
		signature: '(string $left_operand , string $right_operand [, int $scale ]): int'
	},
	bcpowmod: {
		description: 'Use the fast-exponentiation method to raise left_operand to the power right_operand with respect to the modulus modulus.',
		signature: '(string $left_operand , string $right_operand , string $modulus [, int $scale ]): string'
	},
	jdtogregorian: {
		description: 'Converts Julian Day Count to a string containing the Gregorian date in the format of \"month/day/year\".',
		signature: '(int $julianday): string'
	},
	gregoriantojd: {
		description: 'Valid Range for Gregorian Calendar 4714 B.C. to 9999 A.D.',
		signature: '(int $month , int $day , int $year): int'
	},
	jdtojulian: {
		description: 'Converts Julian Day Count to a string containing the Julian Calendar Date in the format of \"month/day/year\".',
		signature: '(int $julianday): string'
	},
	juliantojd: {
		description: 'Valid Range for Julian Calendar 4713 B.C. to 9999 A.D.',
		signature: '(int $month , int $day , int $year): int'
	},
	jdtojewish: {
		description: 'Converts a Julian Day Count to the Jewish Calendar.',
		signature: '(int $juliandaycount [, bool $hebrew = false [, int $fl = 0 ]]): string'
	},
	jewishtojd: {
		description: 'Although this function can handle dates all the way back to the year 1 (3761 B.C.), such use may not be meaningful. The Jewish calendar has been in use for several thousand years, but in the early days there was no formula to determine the start of a month. A new month was started when the new moon was first observed.',
		signature: '(int $month , int $day , int $year): int'
	},
	jdtofrench: {
		description: 'Converts a Julian Day Count to the French Republican Calendar.',
		signature: '(int $juliandaycount): string'
	},
	frenchtojd: {
		description: 'Converts a date from the French Republican Calendar to a Julian Day Count.',
		signature: '(int $month , int $day , int $year): int'
	},
	jddayofweek: {
		description: 'Returns the day of the week. Can return a string or an integer depending on the mode.',
		signature: '(int $julianday [, int $mode = CAL_DOW_DAYNO ]): mixed'
	},
	jdmonthname: {
		description: 'Returns a string containing a month name. mode tells this function which calendar to convert the Julian Day Count to, and what type of month names are to be returned. Calendar modes Mode Meaning Values 0 Gregorian - abbreviated Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec 1 Gregorian January, February, March, April, May, June, July, August, September, October, November, December 2 Julian - abbreviated Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec 3 Julian January, February, March, April, May, June, July, August, September, October, November, December 4 Jewish Tishri, Heshvan, Kislev, Tevet, Shevat, AdarI, AdarII, Nisan, Iyyar, Sivan, Tammuz, Av, Elul 5 French Republican Vendemiaire, Brumaire, Frimaire, Nivose, Pluviose, Ventose, Germinal, Floreal, Prairial, Messidor, Thermidor, Fructidor, Extra',
		signature: '(int $julianday , int $mode): string'
	},
	easter_date: {
		description: 'Returns the Unix timestamp corresponding to midnight on Easter of the given year.',
		signature: '([ int $year ]): int'
	},
	easter_days: {
		description: 'Returns the number of days after March 21 on which Easter falls for a given year. If no year is specified, the current year is assumed.',
		signature: '([ int $year [, int $method = CAL_EASTER_DEFAULT ]]): int'
	},
	unixtojd: {
		description: 'Return the Julian Day for a Unix timestamp (seconds since 1.1.1970), or for the current day if no timestamp is given.',
		signature: '([ int $timestamp = time() ]): int'
	},
	jdtounix: {
		description: 'This function will return a Unix timestamp corresponding to the Julian Day given in jday or FALSE if jday is not inside the Unix epoch (Gregorian years between 1970 and 2037 or 2440588 <= jday <= 2465342). The time returned is localtime (and not GMT).',
		signature: '(int $jday): int'
	},
	cal_to_jd: {
		description: 'cal_to_jd() calculates the Julian day count for a date in the specified calendar. Supported calendars are CAL_GREGORIAN, CAL_JULIAN, CAL_JEWISH and CAL_FRENCH.',
		signature: '(int $calendar , int $month , int $day , int $year): int'
	},
	cal_from_jd: {
		description: 'cal_from_jd() converts the Julian day given in jd into a date of the specified calendar. Supported calendar values are CAL_GREGORIAN, CAL_JULIAN, CAL_JEWISH and CAL_FRENCH.',
		signature: '(int $jd , int $calendar): array'
	},
	cal_days_in_month: {
		description: 'This function will return the number of days in the month of year for the specified calendar.',
		signature: '(int $calendar , int $month , int $year): int'
	},
	cal_info: {
		description: 'cal_info() returns information on the specified calendar.',
		signature: '([ int $calendar = -1 ]): array'
	},
	variant_set: {
		description: 'Converts value to a variant and assigns it to the variant object; no new variant object is created, and the old value of variant is freed/released.',
		signature: '(variant $variant , mixed $value): void'
	},
	variant_add: {
		description: 'Adds left to right using the following rules (taken from the MSDN library), which correspond to those of Visual Basic: Variant Addition Rules If Then Both expressions are of the string type Concatenation One expression is a string type and the other a character Addition One expression is numeric and the other is a string Addition Both expressions are numeric Addition Either expression is NULL NULL is returned Both expressions are empty Integer subtype is returned',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_cat: {
		description: 'Concatenates left with right and returns the result.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_sub: {
		description: 'Subtracts right from left.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_mul: {
		description: 'Multiplies left by right.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_and: {
		description: 'Performs a bitwise AND operation. Note that this is slightly different from a regular AND operation.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_div: {
		description: 'Divides left by right and returns the result.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_eqv: {
		description: 'Performs a bitwise equivalence on two variants.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_idiv: {
		description: 'Converts left and right to integer values, and then performs integer division.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_imp: {
		description: 'Performs a bitwise implication operation.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_mod: {
		description: 'Divides left by right and returns the remainder.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_or: {
		description: 'Performs a bitwise OR operation. Note that this is slightly different from a regular OR operation.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_pow: {
		description: 'Returns the result of left to the power of right.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_xor: {
		description: 'Performs a logical exclusion.',
		signature: '(mixed $left , mixed $right): mixed'
	},
	variant_abs: {
		description: 'Returns the absolute value of a variant.',
		signature: '(mixed $val): mixed'
	},
	variant_fix: {
		description: 'Gets the integer portion of a variant.',
		signature: '(mixed $variant): mixed'
	},
	variant_int: {
		description: 'Gets the integer portion of a variant.',
		signature: '(mixed $variant): mixed'
	},
	variant_neg: {
		description: 'Performs logical negation of variant.',
		signature: '(mixed $variant): mixed'
	},
	variant_not: {
		description: 'Performs bitwise not negation on variant and returns the result.',
		signature: '(mixed $variant): mixed'
	},
	variant_round: {
		description: 'Returns the value of variant rounded to decimals decimal places.',
		signature: '(mixed $variant , int $decimals): mixed'
	},
	variant_cmp: {
		description: 'Compares left with right.',
		signature: '(mixed $left , mixed $right [, int $lcid [, int $flags ]]): int'
	},
	variant_date_to_timestamp: {
		description: 'Converts variant from a VT_DATE (or similar) value into a Unix timestamp. This allows easier interopability between the Unix-ish parts of PHP and COM.',
		signature: '(variant $variant): int'
	},
	variant_date_from_timestamp: {
		description: 'Converts timestamp from a unix timestamp value into a variant of type VT_DATE. This allows easier interopability between the unix-ish parts of PHP and COM.',
		signature: '(int $timestamp): variant'
	},
	variant_get_type: {
		description: 'Returns the type of a variant object.',
		signature: '(variant $variant): int'
	},
	variant_set_type: {
		description: 'This function is similar to variant_cast() except that the variant is modified \"in-place\"; no new variant is created. The parameters for this function have identical meaning to those of variant_cast().',
		signature: '(variant $variant , int $type): void'
	},
	variant_cast: {
		description: 'This function makes a copy of variant and then performs a variant cast operation to force the copy to have the type given by type.',
		signature: '(variant $variant , int $type): variant'
	},
	com_create_guid: {
		description: 'Generates a Globally Unique Identifier (GUID).',
		signature: '(void): string'
	},
	com_event_sink: {
		description: 'Instructs COM to sink events generated by comobject into the PHP object sinkobject.',
		signature: '(variant $comobject , object $sinkobject [, mixed $sinkinterface ]): bool'
	},
	com_print_typeinfo: {
		description: 'The purpose of this function is to help generate a skeleton class for use as an event sink. You may also use it to generate a dump of any COM object, provided that it supports enough of the introspection interfaces, and that you know the name of the interface you want to display.',
		signature: '(object $comobject [, string $dispinterface [, bool $wantsink = false ]]): bool'
	},
	com_message_pump: {
		description: 'This function will sleep for up to timeoutms milliseconds, or until a message arrives in the queue.',
		signature: '([ int $timeoutms = 0 ]): bool'
	},
	com_load_typelib: {
		description: 'Loads a type-library and registers its constants in the engine, as though they were defined using define().',
		signature: '(string $typelib_name [, bool $case_insensitive = true ]): bool'
	},
	com_get_active_object: {
		description: 'com_get_active_object() is similar to creating a new instance of a COM object, except that it will only return an object to your script if the object is already running. OLE applications use something known as the Running Object Table to allow well-known applications to be launched only once; this function exposes the COM library function GetActiveObject() to get a handle on a running instance.',
		signature: '(string $progid [, int $code_page ]): variant'
	},
	ctype_alnum: {
		description: 'Checks if all of the characters in the provided string, text, are alphanumeric. In the standard C locale letters are just [A-Za-z].',
		signature: '(string $text): bool'
	},
	ctype_alpha: {
		description: 'Checks if all of the characters in the provided string, text, are alphabetic. In the standard C locale letters are just [A-Za-z] and ctype_alpha() is equivalent to (ctype_upper($text) || ctype_lower($text)) if $text is just a single character, but other languages have letters that are considered neither upper nor lower case.',
		signature: '(string $text): bool'
	},
	ctype_cntrl: {
		description: 'Checks if all of the characters in the provided string, text, are control characters. Control characters are e.g. line feed, tab, escape.',
		signature: '(string $text): bool'
	},
	ctype_digit: {
		description: 'Checks if all of the characters in the provided string, text, are numerical.',
		signature: '(string $text): bool'
	},
	ctype_lower: {
		description: 'Checks if all of the characters in the provided string, text, are lowercase letters.',
		signature: '(string $text): bool'
	},
	ctype_graph: {
		description: 'Checks if all of the characters in the provided string, text, creates visible output.',
		signature: '(string $text): bool'
	},
	ctype_print: {
		description: 'Checks if all of the characters in the provided string, text, are printable.',
		signature: '(string $text): bool'
	},
	ctype_punct: {
		description: 'Checks if all of the characters in the provided string, text, are punctuation character.',
		signature: '(string $text): bool'
	},
	ctype_space: {
		description: 'Checks if all of the characters in the provided string, text, creates whitespace.',
		signature: '(string $text): bool'
	},
	ctype_upper: {
		description: 'Checks if all of the characters in the provided string, text, are uppercase characters.',
		signature: '(string $text): bool'
	},
	ctype_xdigit: {
		description: 'Checks if all of the characters in the provided string, text, are hexadecimal \'digits\'.',
		signature: '(string $text): bool'
	},
	strtotime: {
		description: 'The function expects to be given a string containing an English date format and will try to parse that format into a Unix timestamp (the number of seconds since January 1 1970 00:00:00 UTC), relative to the timestamp given in now, or the current time if now is not supplied.',
		signature: '(string $time [, int $now ]): int'
	},
	date: {
		description: 'Returns a string formatted according to the given format string using the given integer timestamp or the current time if no timestamp is given. In other words, timestamp is optional and defaults to the value of time().',
		signature: '(string $format [, int $timestamp = time() ]): string'
	},
	idate: {
		description: 'Returns a number formatted according to the given format string using the given integer timestamp or the current local time if no timestamp is given. In other words, timestamp is optional and defaults to the value of time().',
		signature: '(string $format [, int $timestamp = time() ]): int'
	},
	gmdate: {
		description: 'Identical to the date() function except that the time returned is Greenwich Mean Time (GMT).',
		signature: '(string $format [, int $timestamp = time() ]): string'
	},
	mktime: {
		description: 'Returns the Unix timestamp corresponding to the arguments given. This timestamp is a long integer containing the number of seconds between the Unix Epoch (January 1 1970 00:00:00 GMT) and the time specified.',
		signature: '([ int $hour = date(\"H\") [, int $minute = date(\"i\") [, int $second = date(\"s\") [, int $month = date(\"n\") [, int $day = date(\"j\") [, int $year = date(\"Y\") [, int $is_dst = -1 ]]]]]]]): int'
	},
	gmmktime: {
		description: 'Identical to mktime() except the passed parameters represents a GMT date. gmmktime() internally uses mktime() so only times valid in derived local time can be used.',
		signature: '([ int $hour = gmdate(\"H\") [, int $minute = gmdate(\"i\") [, int $second = gmdate(\"s\") [, int $month = gmdate(\"n\") [, int $day = gmdate(\"j\") [, int $year = gmdate(\"Y\") [, int $is_dst = -1 ]]]]]]]): int'
	},
	checkdate: {
		description: 'Checks the validity of the date formed by the arguments. A date is considered valid if each parameter is properly defined.',
		signature: '(int $month , int $day , int $year): bool'
	},
	strftime: {
		description: 'Format the time and/or date according to locale settings. Month and weekday names and other language-dependent strings respect the current locale set with setlocale().',
		signature: '(string $format [, int $timestamp = time() ]): string'
	},
	gmstrftime: {
		description: 'Behaves the same as strftime() except that the time returned is Greenwich Mean Time (GMT). For example, when run in Eastern Standard Time (GMT -0500), the first line below prints \"Dec 31 1998 20:00:00\", while the second prints \"Jan 01 1999 01:00:00\".',
		signature: '(string $format [, int $timestamp = time() ]): string'
	},
	time: {
		description: 'Returns the current time measured in the number of seconds since the Unix Epoch (January 1 1970 00:00:00 GMT).',
		signature: '(void): int'
	},
	localtime: {
		description: 'The localtime() function returns an array identical to that of the structure returned by the C function call.',
		signature: '([ int $timestamp = time() [, bool $is_associative = false ]]): array'
	},
	getdate: {
		description: 'Returns an associative array containing the date information of the timestamp, or the current local time if no timestamp is given.',
		signature: '([ int $timestamp = time() ]): array'
	},
	date_create: {
		description: 'Alias of DateTime::__construct date_create_from_format date_date_set Date/Time Functions PHP Manual date_create (PHP 5 >= 5.2.0)',
	},
	date_create_from_format: {
		description: 'Alias of DateTime::createFromFormat date_add date_create Date/Time Functions PHP Manual date_create_from_format (PHP 5 >= 5.3.0)',
	},
	date_parse: {
		description: 'Parameters date Date in format accepted by strtotime().',
		signature: '(string $date): array'
	},
	date_parse_from_format: {
		description: 'Returns associative array with detailed info about given date.',
		signature: '(string $format , string $date): array'
	},
	date_get_last_errors: {
		description: 'Alias of DateTime::getLastErrors date_format date_interval_create_from_date_string Date/Time Functions PHP Manual date_get_last_errors (PHP 5 >= 5.3.0)',
	},
	date_format: {
		description: 'Alias of DateTime::format date_diff date_get_last_errors Date/Time Functions PHP Manual date_format (PHP 5 >= 5.2.0)',
	},
	date_modify: {
		description: 'Alias of DateTime::modify date_isodate_set date_offset_get Date/Time Functions PHP Manual date_modify (PHP 5 >= 5.2.0)',
	},
	date_add: {
		description: 'Alias of DateTime::add checkdate date_create_from_format Date/Time Functions PHP Manual date_add (PHP 5 >= 5.3.0)',
	},
	date_sub: {
		description: 'Alias of DateTime::sub date_parse date_sun_info Date/Time Functions PHP Manual date_sub (PHP 5 >= 5.3.0)',
	},
	date_timezone_get: {
		description: 'Alias of DateTime::getTimezone date_timestamp_set date_timezone_set Date/Time Functions PHP Manual date_timezone_get (PHP 5 >= 5.2.0)',
	},
	date_timezone_set: {
		description: 'Alias of DateTime::setTimezone date_timezone_get date Date/Time Functions PHP Manual date_timezone_set (PHP 5 >= 5.2.0)',
	},
	date_offset_get: {
		description: 'Alias of DateTime::getOffset date_modify date_parse_from_format Date/Time Functions PHP Manual date_offset_get (PHP 5 >= 5.2.0)',
	},
	date_diff: {
		description: 'Alias of DateTime::diff date_default_timezone_set date_format Date/Time Functions PHP Manual date_diff (PHP 5 >= 5.3.0)',
	},
	date_time_set: {
		description: 'Alias of DateTime::setTime date_sunset date_timestamp_get Date/Time Functions PHP Manual date_time_set (PHP 5 >= 5.2.0)',
	},
	date_date_set: {
		description: 'Alias of DateTime::setDate date_create date_default_timezone_get Date/Time Functions PHP Manual date_date_set (PHP 5 >= 5.2.0)',
	},
	date_isodate_set: {
		description: 'Alias of DateTime::setISODate date_interval_format date_modify Date/Time Functions PHP Manual date_isodate_set (PHP 5 >= 5.2.0)',
	},
	date_timestamp_set: {
		description: 'Alias of DateTime::setTimestamp date_timestamp_get date_timezone_get Date/Time Functions PHP Manual date_timestamp_set (PHP 5 >= 5.3.0)',
	},
	date_timestamp_get: {
		description: 'Alias of DateTime::getTimestamp date_time_set date_timestamp_set Date/Time Functions PHP Manual date_timestamp_get (PHP 5 >= 5.3.0)',
	},
	timezone_open: {
		description: 'Alias of DateTimeZone::__construct timezone_offset_get timezone_transitions_get Date/Time Functions PHP Manual timezone_open (PHP 5 >= 5.2.0)',
	},
	timezone_name_get: {
		description: 'Alias of DateTimeZone::getName timezone_name_from_abbr timezone_offset_get Date/Time Functions PHP Manual timezone_name_get (PHP 5 >= 5.2.0)',
	},
	timezone_name_from_abbr: {
		description: 'Parameters abbr Time zone abbreviation.',
		signature: '(string $abbr [, int $gmtOffset = -1 [, int $isdst = -1 ]]): string'
	},
	timezone_offset_get: {
		description: 'Alias of DateTimeZone::getOffset timezone_name_get timezone_open Date/Time Functions PHP Manual timezone_offset_get (PHP 5 >= 5.2.0)',
	},
	timezone_transitions_get: {
		description: 'Alias of DateTimeZone::getTransitions timezone_open timezone_version_get Date/Time Functions PHP Manual timezone_transitions_get (PHP 5 >= 5.2.0)',
	},
	timezone_location_get: {
		description: 'Alias of DateTimeZone::getLocation timezone_identifiers_list timezone_name_from_abbr Date/Time Functions PHP Manual timezone_location_get (PHP 5 >= 5.3.0)',
	},
	timezone_identifiers_list: {
		description: 'Alias of DateTimeZone::listIdentifiers timezone_abbreviations_list timezone_location_get Date/Time Functions PHP Manual timezone_identifiers_list (PHP 5 >= 5.2.0)',
	},
	timezone_abbreviations_list: {
		description: 'Alias of DateTimeZone::listAbbreviations time timezone_identifiers_list Date/Time Functions PHP Manual timezone_abbreviations_list (PHP 5 >= 5.2.0)',
	},
	timezone_version_get: {
		description: 'Returns the current version of the timezonedb.',
		signature: '(void): string'
	},
	date_interval_create_from_date_string: {
		description: 'Alias of DateInterval::createFromDateString date_get_last_errors date_interval_format Date/Time Functions PHP Manual date_interval_create_from_date_string (PHP 5 >= 5.3.0)',
	},
	date_interval_format: {
		description: 'Alias of DateInterval::format date_interval_create_from_date_string date_isodate_set Date/Time Functions PHP Manual date_interval_format (PHP 5 >= 5.3.0)',
	},
	date_default_timezone_set: {
		description: 'date_default_timezone_set() sets the default timezone used by all date/time functions.',
		signature: '(string $timezone_identifier): bool'
	},
	date_default_timezone_get: {
		description: 'In order of preference, this function returns the default timezone by: Reading the timezone set using the date_default_timezone_set() function (if any)',
		signature: '(void): string'
	},
	date_sunrise: {
		description: 'date_sunrise() returns the sunrise time for a given day (specified as a timestamp) and location.',
		signature: '(int $timestamp [, int $format = SUNFUNCS_RET_STRING [, float $latitude = ini_get(\"date.default_latitude\") [, float $longitude = ini_get(\"date.default_longitude\") [, float $zenith = ini_get(\"date.sunrise_zenith\") [, float $gmt_offset = 0 ]]]]]): mixed'
	},
	date_sunset: {
		description: 'date_sunset() returns the sunset time for a given day (specified as a timestamp) and location.',
		signature: '(int $timestamp [, int $format = SUNFUNCS_RET_STRING [, float $latitude = ini_get(\"date.default_latitude\") [, float $longitude = ini_get(\"date.default_longitude\") [, float $zenith = ini_get(\"date.sunset_zenith\") [, float $gmt_offset = 0 ]]]]]): mixed'
	},
	date_sun_info: {
		description: 'Parameters time Timestamp.',
		signature: '(int $time , float $latitude , float $longitude): array'
	},
	ereg: {
		description: 'Searches a string for matches to the regular expression given in pattern in a case-sensitive way.',
		signature: '(string $pattern , string $string [, array &$regs ]): int'
	},
	ereg_replace: {
		description: 'This function scans string for matches to pattern, then replaces the matched text with replacement.',
		signature: '(string $pattern , string $replacement , string $string): string'
	},
	eregi: {
		description: 'This function is identical to ereg() except that it ignores case distinction when matching alphabetic characters.',
		signature: '(string $pattern , string $string [, array &$regs ]): int'
	},
	eregi_replace: {
		description: 'This function is identical to ereg_replace() except that this ignores case distinction when matching alphabetic characters.',
		signature: '(string $pattern , string $replacement , string $string): string'
	},
	split: {
		description: 'Splits a string into array by regular expression.',
		signature: '(string $pattern , string $string [, int $limit = -1 ]): array'
	},
	spliti: {
		description: 'Splits a string into array by regular expression.',
		signature: '(string $pattern , string $string [, int $limit = -1 ]): array'
	},
	sql_regcase: {
		description: 'Creates a regular expression for a case insensitive match.',
		signature: '(string $string): string'
	},
	filter_input: {
		description: 'Parameters type One of INPUT_GET, INPUT_POST, INPUT_COOKIE, INPUT_SERVER, or INPUT_ENV.',
		signature: '(int $type , string $variable_name [, int $filter = FILTER_DEFAULT [, mixed $options ]]): mixed'
	},
	filter_var: {
		description: 'Parameters variable Value to filter.',
		signature: '(mixed $variable [, int $filter = FILTER_DEFAULT [, mixed $options ]]): mixed'
	},
	filter_input_array: {
		description: 'This function is useful for retrieving many values without repetitively calling filter_input().',
		signature: '(int $type [, mixed $definition ]): mixed'
	},
	filter_var_array: {
		description: 'This function is useful for retrieving many values without repetitively calling filter_var().',
		signature: '(array $data [, mixed $definition ]): mixed'
	},
	filter_list: {
		description: 'Return Values Returns an array of names of all supported filters, empty array if there are no such filters. Indexes of this array are not filter IDs, they can be obtained with filter_id() from a name instead.',
		signature: '(void): array'
	},
	filter_has_var: {
		description: 'Parameters type One of INPUT_GET, INPUT_POST, INPUT_COOKIE, INPUT_SERVER, or INPUT_ENV.',
		signature: '(int $type , string $variable_name): bool'
	},
	filter_id: {
		description: 'Parameters filtername Name of a filter to get.',
		signature: '(string $filtername): int'
	},
	ftp_connect: {
		description: 'ftp_connect() opens an FTP connection to the specified host.',
		signature: '(string $host [, int $port = 21 [, int $timeout = 90 ]]): resource'
	},
	ftp_login: {
		description: 'Logs in to the given FTP stream.',
		signature: '(resource $ftp_stream , string $username , string $password): bool'
	},
	ftp_pwd: {
		description: 'Returns the current directory name',
		signature: '(resource $ftp_stream): string'
	},
	ftp_cdup: {
		description: 'Changes to the parent directory.',
		signature: '(resource $ftp_stream): bool'
	},
	ftp_chdir: {
		description: 'Changes the current directory to the specified one.',
		signature: '(resource $ftp_stream , string $directory): bool'
	},
	ftp_exec: {
		description: 'Sends a SITE EXEC command request to the FTP server.',
		signature: '(resource $ftp_stream , string $command): bool'
	},
	ftp_raw: {
		description: 'Sends an arbitrary command to the FTP server.',
		signature: '(resource $ftp_stream , string $command): array'
	},
	ftp_mkdir: {
		description: 'Creates the specified directory on the FTP server.',
		signature: '(resource $ftp_stream , string $directory): string'
	},
	ftp_rmdir: {
		description: 'Removes the specified directory on the FTP server.',
		signature: '(resource $ftp_stream , string $directory): bool'
	},
	ftp_chmod: {
		description: 'Sets the permissions on the specified remote file to mode.',
		signature: '(resource $ftp_stream , int $mode , string $filename): int'
	},
	ftp_alloc: {
		description: 'Sends an ALLO command to the remote FTP server to allocate space for a file to be uploaded.',
		signature: '(resource $ftp_stream , int $filesize [, string &$result ]): bool'
	},
	ftp_nlist: {
		description: 'Parameters ftp_stream The link identifier of the FTP connection.',
		signature: '(resource $ftp_stream , string $directory): array'
	},
	ftp_rawlist: {
		description: 'ftp_rawlist() executes the FTP LIST command, and returns the result as an array.',
		signature: '(resource $ftp_stream , string $directory [, bool $recursive = false ]): array'
	},
	ftp_systype: {
		description: 'Returns the system type identifier of the remote FTP server.',
		signature: '(resource $ftp_stream): string'
	},
	ftp_pasv: {
		description: 'ftp_pasv() turns on or off passive mode. In passive mode, data connections are initiated by the client, rather than by the server. It may be needed if the client is behind firewall.',
		signature: '(resource $ftp_stream , bool $pasv): bool'
	},
	ftp_get: {
		description: 'ftp_get() retrieves a remote file from the FTP server, and saves it into a local file.',
		signature: '(resource $ftp_stream , string $local_file , string $remote_file , int $mode [, int $resumepos = 0 ]): bool'
	},
	ftp_fget: {
		description: 'ftp_fget() retrieves remote_file from the FTP server, and writes it to the given file pointer.',
		signature: '(resource $ftp_stream , resource $handle , string $remote_file , int $mode [, int $resumepos = 0 ]): bool'
	},
	ftp_put: {
		description: 'ftp_put() stores a local file on the FTP server.',
		signature: '(resource $ftp_stream , string $remote_file , string $local_file , int $mode [, int $startpos = 0 ]): bool'
	},
	ftp_fput: {
		description: 'ftp_fput() uploads the data from a file pointer to a remote file on the FTP server.',
		signature: '(resource $ftp_stream , string $remote_file , resource $handle , int $mode [, int $startpos = 0 ]): bool'
	},
	ftp_size: {
		description: 'ftp_size() returns the size of the given file in bytes.',
		signature: '(resource $ftp_stream , string $remote_file): int'
	},
	ftp_mdtm: {
		description: 'ftp_mdtm() gets the last modified time for a remote file.',
		signature: '(resource $ftp_stream , string $remote_file): int'
	},
	ftp_rename: {
		description: 'ftp_rename() renames a file or a directory on the FTP server.',
		signature: '(resource $ftp_stream , string $oldname , string $newname): bool'
	},
	ftp_delete: {
		description: 'ftp_delete() deletes the file specified by path from the FTP server.',
		signature: '(resource $ftp_stream , string $path): bool'
	},
	ftp_site: {
		description: 'ftp_site() sends the given SITE command to the FTP server.',
		signature: '(resource $ftp_stream , string $command): bool'
	},
	ftp_close: {
		description: 'ftp_close() closes the given link identifier and releases the resource.',
		signature: '(resource $ftp_stream): bool'
	},
	ftp_set_option: {
		description: 'This function controls various runtime options for the specified FTP stream.',
		signature: '(resource $ftp_stream , int $option , mixed $value): bool'
	},
	ftp_get_option: {
		description: 'This function returns the value for the requested option from the specified FTP connection.',
		signature: '(resource $ftp_stream , int $option): mixed'
	},
	ftp_nb_fget: {
		description: 'ftp_nb_fget() retrieves a remote file from the FTP server.',
		signature: '(resource $ftp_stream , resource $handle , string $remote_file , int $mode [, int $resumepos = 0 ]): int'
	},
	ftp_nb_get: {
		description: 'ftp_nb_get() retrieves a remote file from the FTP server, and saves it into a local file.',
		signature: '(resource $ftp_stream , string $local_file , string $remote_file , int $mode [, int $resumepos = 0 ]): int'
	},
	ftp_nb_continue: {
		description: 'Continues retrieving/sending a file non-blocking.',
		signature: '(resource $ftp_stream): int'
	},
	ftp_nb_put: {
		description: 'ftp_nb_put() stores a local file on the FTP server.',
		signature: '(resource $ftp_stream , string $remote_file , string $local_file , int $mode [, int $startpos = 0 ]): int'
	},
	ftp_nb_fput: {
		description: 'ftp_nb_fput() uploads the data from a file pointer to a remote file on the FTP server.',
		signature: '(resource $ftp_stream , string $remote_file , resource $handle , int $mode [, int $startpos = 0 ]): int'
	},
	ftp_quit: {
		description: 'Alias of ftp_close ftp_pwd ftp_raw FTP Functions PHP Manual ftp_quit (PHP 4, PHP 5)',
	},
	hash: {
		description: 'Parameters algo Name of selected hashing algorithm (i.e. \"md5\", \"sha256\", \"haval160,4\", etc..)',
		signature: '(string $algo , string $data [, bool $raw_output = false ]): string'
	},
	hash_file: {
		description: 'Parameters algo Name of selected hashing algorithm (i.e. \"md5\", \"sha256\", \"haval160,4\", etc..)',
		signature: '(string $algo , string $filename [, bool $raw_output = false ]): string'
	},
	hash_hmac: {
		description: 'Parameters algo Name of selected hashing algorithm (i.e. \"md5\", \"sha256\", \"haval160,4\", etc..) See hash_algos() for a list of supported algorithms.',
		signature: '(string $algo , string $data , string $key [, bool $raw_output = false ]): string'
	},
	hash_hmac_file: {
		description: 'Parameters algo Name of selected hashing algorithm (i.e. \"md5\", \"sha256\", \"haval160,4\", etc..) See hash_algos() for a list of supported algorithms.',
		signature: '(string $algo , string $filename , string $key [, bool $raw_output = false ]): string'
	},
	hash_init: {
		description: 'Parameters algo Name of selected hashing algorithm (i.e. \"md5\", \"sha256\", \"haval160,4\", etc..)',
		signature: '(string $algo [, int $options = 0 [, string $key = NULL ]]): resource'
	},
	hash_update: {
		description: 'Parameters context Hashing context returned by hash_init().',
		signature: '(resource $context , string $data): bool'
	},
	hash_update_stream: {
		description: 'Parameters context Hashing context returned by hash_init().',
		signature: '(resource $context , resource $handle [, int $length = -1 ]): int'
	},
	hash_update_file: {
		description: 'Parameters context Hashing context returned by hash_init().',
		signature: '(resource $context , string $filename [, resource $context = NULL ]): bool'
	},
	hash_final: {
		description: 'Parameters context Hashing context returned by hash_init().',
		signature: '(resource $context [, bool $raw_output = false ]): string'
	},
	hash_copy: {
		description: 'Parameters context Hashing context returned by hash_init().',
		signature: '(resource $context): resource'
	},
	hash_algos: {
		description: 'Return Values Returns a numerically indexed array containing the list of supported hashing algorithms.',
		signature: '(void): array'
	},
	mhash_keygen_s2k: {
		description: 'Generates a key according to the given hash, using an user provided password.',
		signature: '(int $hash , string $password , string $salt , int $bytes): string'
	},
	mhash_get_block_size: {
		description: 'Gets the size of a block of the specified hash.',
		signature: '(int $hash): int'
	},
	mhash_get_hash_name: {
		description: 'Gets the name of the specified hash.',
		signature: '(int $hash): string'
	},
	mhash_count: {
		description: 'Gets the highest available hash ID.',
		signature: '(void): int'
	},
	mhash: {
		description: 'mhash() applies a hash function specified by hash to the data.',
		signature: '(int $hash , string $data [, string $key ]): string'
	},
	iconv: {
		description: 'Performs a character set conversion on the string str from in_charset to out_charset.',
		signature: '(string $in_charset , string $out_charset , string $str): string'
	},
	ob_iconv_handler: {
		description: 'Converts the string encoded in internal_encoding to output_encoding.',
		signature: '(string $contents , int $status): string'
	},
	iconv_get_encoding: {
		description: 'Retrieve internal configuration variables of iconv extension.',
		signature: '([ string $type = \"all\" ]): mixed'
	},
	iconv_set_encoding: {
		description: 'Changes the value of the internal configuration variable specified by type to charset.',
		signature: '(string $type , string $charset): bool'
	},
	iconv_strlen: {
		description: 'In contrast to strlen(), iconv_strlen() counts the occurrences of characters in the given byte sequence str on the basis of the specified character set, the result of which is not necessarily identical to the length of the string in byte.',
		signature: '(string $str [, string $charset = ini_get(\"iconv.internal_encoding\") ]): int'
	},
	iconv_substr: {
		description: 'Cuts a portion of str specified by the offset and length parameters.',
		signature: '(string $str , int $offset [, int $length = iconv_strlen($str, $charset) [, string $charset = ini_get(\"iconv.internal_encoding\") ]]): string'
	},
	iconv_strpos: {
		description: 'Finds position of first occurrence of a needle within a haystack.',
		signature: '(string $haystack , string $needle [, int $offset = 0 [, string $charset = ini_get(\"iconv.internal_encoding\") ]]): int'
	},
	iconv_strrpos: {
		description: 'In contrast to strpos(), the return value of iconv_strrpos() is the number of characters that appear before the needle, rather than the offset in bytes to the position where the needle has been found.',
		signature: '(string $haystack , string $needle [, string $charset = ini_get(\"iconv.internal_encoding\") ]): int'
	},
	iconv_mime_encode: {
		description: 'Composes and returns a string that represents a valid MIME header field, which looks like the following: Subject: =?ISO-8859-1?Q?Pr=FCfung_f=FCr?= Entwerfen von einer MIME kopfzeile In the above example, \"Subject\" is the field name and the portion that begins with \"=?ISO-8859-1?...\" is the field value.',
		signature: '(string $field_name , string $field_value [, array $preferences = NULL ]): string'
	},
	iconv_mime_decode: {
		description: 'Decodes a MIME header field.',
		signature: '(string $encoded_header [, int $mode = 0 [, string $charset = ini_get(\"iconv.internal_encoding\") ]]): string'
	},
	iconv_mime_decode_headers: {
		description: 'Decodes multiple MIME header fields at once.',
		signature: '(string $encoded_headers [, int $mode = 0 [, string $charset = ini_get(\"iconv.internal_encoding\") ]]): array'
	},
	json_encode: {
		description: 'Returns a string containing the JSON representation of value.',
		signature: '(mixed $value [, int $options = 0 ]): string'
	},
	json_decode: {
		description: 'Takes a JSON encoded string and converts it into a PHP variable.',
		signature: '(string $json [, bool $assoc = false [, int $depth = 512 [, int $options = 0 ]]]): mixed'
	},
	json_last_error: {
		description: 'Returns the last error (if any) occurred during the last JSON encoding/decoding.',
		signature: '(void): int'
	},
	mcrypt_ecb: {
		description: 'The first prototype is when linked against libmcrypt 2.2.x, the second when linked against libmcrypt 2.4.x or higher. The mode should be either MCRYPT_ENCRYPT or MCRYPT_DECRYPT.',
		signature: '(int $cipher , string $key , string $data , int $mode): string'
	},
	mcrypt_cbc: {
		description: 'The first prototype is when linked against libmcrypt 2.2.x, the second when linked against libmcrypt 2.4.x or higher. The mode should be either MCRYPT_ENCRYPT or MCRYPT_DECRYPT.',
		signature: '(int $cipher , string $key , string $data , int $mode [, string $iv ]): string'
	},
	mcrypt_cfb: {
		description: 'The first prototype is when linked against libmcrypt 2.2.x, the second when linked against libmcrypt 2.4.x or higher. The mode should be either MCRYPT_ENCRYPT or MCRYPT_DECRYPT.',
		signature: '(int $cipher , string $key , string $data , int $mode , string $iv): string'
	},
	mcrypt_ofb: {
		description: 'The first prototype is when linked against libmcrypt 2.2.x, the second when linked against libmcrypt 2.4.x or higher. The mode should be either MCRYPT_ENCRYPT or MCRYPT_DECRYPT.',
		signature: '(int $cipher , string $key , string $data , int $mode , string $iv): string'
	},
	mcrypt_get_key_size: {
		description: 'The first prototype is when linked against libmcrypt 2.2.x, the second when linked against libmcrypt 2.4.x or 2.5.x.',
		signature: '(int $cipher): int'
	},
	mcrypt_get_block_size: {
		description: 'The first prototype is when linked against libmcrypt 2.2.x, the second when linked against libmcrypt 2.4.x or 2.5.x.',
		signature: '(int $cipher): int'
	},
	mcrypt_get_cipher_name: {
		description: 'mcrypt_get_cipher_name() is used to get the name of the specified cipher.',
		signature: '(int $cipher): string'
	},
	mcrypt_create_iv: {
		description: 'Creates an initialization vector (IV) from a random source.',
		signature: '(int $size [, int $source = MCRYPT_DEV_RANDOM ]): string'
	},
	mcrypt_list_algorithms: {
		description: 'Gets the list of all supported algorithms in the lib_dir parameter.',
		signature: '([ string $lib_dir = ini_get(\"mcrypt.algorithms_dir\") ]): array'
	},
	mcrypt_list_modes: {
		description: 'Gets the list of all supported modes in the lib_dir parameter.',
		signature: '([ string $lib_dir = ini_get(\"mcrypt.modes_dir\") ]): array'
	},
	mcrypt_get_iv_size: {
		description: 'Gets the size of the IV belonging to a specific cipher/mode combination.',
		signature: '(string $cipher , string $mode): int'
	},
	mcrypt_encrypt: {
		description: 'Encrypts the data and returns it.',
		signature: '(string $cipher , string $key , string $data , string $mode [, string $iv ]): string'
	},
	mcrypt_decrypt: {
		description: 'Decrypts the data and returns the unencrypted data.',
		signature: '(string $cipher , string $key , string $data , string $mode [, string $iv ]): string'
	},
	mcrypt_module_open: {
		description: 'This function opens the module of the algorithm and the mode to be used. The name of the algorithm is specified in algorithm, e.g. \"twofish\" or is one of the MCRYPT_ciphername constants. The module is closed by calling mcrypt_module_close().',
		signature: '(string $algorithm , string $algorithm_directory , string $mode , string $mode_directory): resource'
	},
	mcrypt_generic_init: {
		description: 'You need to call this function before every call to mcrypt_generic() or mdecrypt_generic().',
		signature: '(resource $td , string $key , string $iv): int'
	},
	mcrypt_generic: {
		description: 'This function encrypts data. The data is padded with \"\\0\" to make sure the length of the data is n * blocksize. This function returns the encrypted data. Note that the length of the returned string can in fact be longer than the input, due to the padding of the data.',
		signature: '(resource $td , string $data): string'
	},
	mdecrypt_generic: {
		description: 'This function decrypts data. Note that the length of the returned string can in fact be longer than the unencrypted string, due to the padding of the data.',
		signature: '(resource $td , string $data): string'
	},
	mcrypt_generic_end: {
		description: 'Warning This function is deprecated, use mcrypt_generic_deinit() instead. It can cause crashes when used with mcrypt_module_close() due to multiple buffer frees.',
		signature: '(resource $td): bool'
	},
	mcrypt_generic_deinit: {
		description: 'This function terminates encryption specified by the encryption descriptor (td). It clears all buffers, but does not close the module. You need to call mcrypt_module_close() yourself. (But PHP does this for you at the end of the script.)',
		signature: '(resource $td): bool'
	},
	mcrypt_enc_self_test: {
		description: 'This function runs the self test on the algorithm specified by the descriptor td.',
		signature: '(resource $td): int'
	},
	mcrypt_enc_is_block_algorithm_mode: {
		description: 'Tells whether the algorithm of the opened mode works on blocks (e.g. FALSE for stream, and TRUE for cbc, cfb, ofb)..',
		signature: '(resource $td): bool'
	},
	mcrypt_enc_is_block_algorithm: {
		description: 'Tells whether the algorithm of the opened mode is a block algorithm.',
		signature: '(resource $td): bool'
	},
	mcrypt_enc_is_block_mode: {
		description: 'Tells whether the opened mode outputs blocks (e.g. TRUE for cbc and ecb, and FALSE for cfb and stream).',
		signature: '(resource $td): bool'
	},
	mcrypt_enc_get_block_size: {
		description: 'Gets the blocksize of the opened algorithm.',
		signature: '(resource $td): int'
	},
	mcrypt_enc_get_key_size: {
		description: 'Gets the maximum supported key size of the algorithm in bytes.',
		signature: '(resource $td): int'
	},
	mcrypt_enc_get_supported_key_sizes: {
		description: 'Gets the supported key sizes of the opened algorithm.',
		signature: '(resource $td): array'
	},
	mcrypt_enc_get_iv_size: {
		description: 'This function returns the size of the IV of the algorithm specified by the encryption descriptor in bytes. An IV is used in cbc, cfb and ofb modes, and in some algorithms in stream mode.',
		signature: '(resource $td): int'
	},
	mcrypt_enc_get_algorithms_name: {
		description: 'This function returns the name of the algorithm.',
		signature: '(resource $td): string'
	},
	mcrypt_enc_get_modes_name: {
		description: 'This function returns the name of the mode.',
		signature: '(resource $td): string'
	},
	mcrypt_module_self_test: {
		description: 'This function runs the self test on the algorithm specified.',
		signature: '(string $algorithm [, string $lib_dir ]): bool'
	},
	mcrypt_module_is_block_algorithm_mode: {
		description: 'This function returns TRUE if the mode is for use with block algorithms, otherwise it returns FALSE. (e.g. FALSE for stream, and TRUE for cbc, cfb, ofb).',
		signature: '(string $mode [, string $lib_dir ]): bool'
	},
	mcrypt_module_is_block_algorithm: {
		description: 'This function returns TRUE if the specified algorithm is a block algorithm, or FALSE if it is a stream one.',
		signature: '(string $algorithm [, string $lib_dir ]): bool'
	},
	mcrypt_module_is_block_mode: {
		description: 'This function returns TRUE if the mode outputs blocks of bytes or FALSE if it outputs just bytes. (e.g. TRUE for cbc and ecb, and FALSE for cfb and stream).',
		signature: '(string $mode [, string $lib_dir ]): bool'
	},
	mcrypt_module_get_algo_block_size: {
		description: 'Gets the blocksize of the specified algorithm.',
		signature: '(string $algorithm [, string $lib_dir ]): int'
	},
	mcrypt_module_get_algo_key_size: {
		description: 'Gets the maximum supported keysize of the opened mode.',
		signature: '(string $algorithm [, string $lib_dir ]): int'
	},
	mcrypt_module_get_supported_key_sizes: {
		description: 'Returns an array with the key sizes supported by the specified algorithm. If it returns an empty array then all key sizes between 1 and mcrypt_module_get_algo_key_size() are supported by the algorithm.',
		signature: '(string $algorithm [, string $lib_dir ]): array'
	},
	mcrypt_module_close: {
		description: 'Closes the specified encryption handle.',
		signature: '(resource $td): bool'
	},
	odbc_autocommit: {
		description: 'Toggles autocommit behaviour.',
		signature: '(resource $connection_id [, bool $OnOff = false ]): mixed'
	},
	odbc_binmode: {
		description: 'Enables handling of binary column data. ODBC SQL types affected are BINARY, VARBINARY, and LONGVARBINARY.',
		signature: '(resource $result_id , int $mode): bool'
	},
	odbc_close: {
		description: 'Closes down the connection to the database server.',
		signature: '(resource $connection_id): void'
	},
	odbc_close_all: {
		description: 'odbc_close_all() will close down all connections to database server(s).',
		signature: '(void): void'
	},
	odbc_columns: {
		description: 'Lists all columns in the requested range.',
		signature: '(resource $connection_id [, string $qualifier [, string $schema [, string $table_name [, string $column_name ]]]]): resource'
	},
	odbc_commit: {
		description: 'Commits all pending transactions on the connection.',
		signature: '(resource $connection_id): bool'
	},
	odbc_connect: {
		description: 'The connection id returned by this functions is needed by other ODBC functions. You can have multiple connections open at once as long as they either use different db or different credentials.',
		signature: '(string $dsn , string $user , string $password [, int $cursor_type ]): resource'
	},
	odbc_cursor: {
		description: 'Gets the cursorname for the given result_id.',
		signature: '(resource $result_id): string'
	},
	odbc_data_source: {
		description: 'This function will return the list of available DSN (after calling it several times).',
		signature: '(resource $connection_id , int $fetch_type): array'
	},
	odbc_execute: {
		description: 'Executes a statement prepared with odbc_prepare().',
		signature: '(resource $result_id [, array $parameters_array ]): bool'
	},
	odbc_error: {
		description: 'Returns a six-digit ODBC state, or an empty string if there has been no errors.',
		signature: '([ resource $connection_id ]): string'
	},
	odbc_errormsg: {
		description: 'Returns a string containing the last ODBC error message, or an empty string if there has been no errors.',
		signature: '([ resource $connection_id ]): string'
	},
	odbc_exec: {
		description: 'Sends an SQL statement to the database server.',
		signature: '(resource $connection_id , string $query_string [, int $flags ]): resource'
	},
	odbc_fetch_array: {
		description: 'Fetch an associative array from an ODBC query. See the changelog below for when this function is available.',
		signature: '(resource $result [, int $rownumber ]): array'
	},
	odbc_fetch_object: {
		description: 'Fetch an object from an ODBC query. See the changelog below for when this function is available.',
		signature: '(resource $result [, int $rownumber ]): object'
	},
	odbc_fetch_row: {
		description: 'Fetches a row of the data that was returned by odbc_do() or odbc_exec(). After odbc_fetch_row() is called, the fields of that row can be accessed with odbc_result().',
		signature: '(resource $result_id [, int $row_number ]): bool'
	},
	odbc_fetch_into: {
		description: 'Fetch one result row into array.',
		signature: '(resource $result_id , array &$result_array [, int $rownumber ]): int'
	},
	odbc_field_len: {
		description: 'Gets the length of the field referenced by number in the given result identifier.',
		signature: '(resource $result_id , int $field_number): int'
	},
	odbc_field_scale: {
		description: 'Gets the scale of the field referenced by number in the given result identifier.',
		signature: '(resource $result_id , int $field_number): int'
	},
	odbc_field_name: {
		description: 'Gets the name of the field occupying the given column number in the given result identifier.',
		signature: '(resource $result_id , int $field_number): string'
	},
	odbc_field_type: {
		description: 'Gets the SQL type of the field referenced by number in the given result identifier.',
		signature: '(resource $result_id , int $field_number): string'
	},
	odbc_field_num: {
		description: 'Gets the number of the column slot that corresponds to the named field in the given result identifier.',
		signature: '(resource $result_id , string $field_name): int'
	},
	odbc_free_result: {
		description: 'Free resources associated with a result.',
		signature: '(resource $result_id): bool'
	},
	odbc_gettypeinfo: {
		description: 'Retrieves information about data types supported by the data source.',
		signature: '(resource $connection_id [, int $data_type ]): resource'
	},
	odbc_longreadlen: {
		description: 'Enables handling of LONG and LONGVARBINARY columns.',
		signature: '(resource $result_id , int $length): bool'
	},
	odbc_next_result: {
		description: 'Checks if there are more result sets available as well as allowing access to the next result set via odbc_fetch_array(), odbc_fetch_row(), odbc_result(), etc.',
		signature: '(resource $result_id): bool'
	},
	odbc_num_fields: {
		description: 'Gets the number of fields (columns) in an ODBC result.',
		signature: '(resource $result_id): int'
	},
	odbc_num_rows: {
		description: 'Gets the number of rows in a result. For INSERT, UPDATE and DELETE statements odbc_num_rows() returns the number of rows affected. For a SELECT clause this can be the number of rows available.',
		signature: '(resource $result_id): int'
	},
	odbc_pconnect: {
		description: 'Opens a persistent database connection.',
		signature: '(string $dsn , string $user , string $password [, int $cursor_type ]): resource'
	},
	odbc_prepare: {
		description: 'Prepares a statement for execution. The result identifier can be used later to execute the statement with odbc_execute().',
		signature: '(resource $connection_id , string $query_string): resource'
	},
	odbc_result: {
		description: 'Get result data',
		signature: '(resource $result_id , mixed $field): mixed'
	},
	odbc_result_all: {
		description: 'Prints all rows from a result identifier produced by odbc_exec(). The result is printed in HTML table format.',
		signature: '(resource $result_id [, string $format ]): int'
	},
	odbc_rollback: {
		description: 'Rolls back all pending statements on the connection.',
		signature: '(resource $connection_id): bool'
	},
	odbc_setoption: {
		description: 'This function allows fiddling with the ODBC options for a particular connection or query result. It was written to help find work around to problems in quirky ODBC drivers. You should probably only use this function if you are an ODBC programmer and understand the effects the various options will have. You will certainly need a good ODBC reference to explain all the different options and values that can be used. Different driver versions support different options.',
		signature: '(resource $id , int $function , int $option , int $param): bool'
	},
	odbc_specialcolumns: {
		description: 'Retrieves either the optimal set of columns that uniquely identifies a row in the table, or columns that are automatically updated when any value in the row is updated by a transaction.',
		signature: '(resource $connection_id , int $type , string $qualifier , string $owner , string $table , int $scope , int $nullable): resource'
	},
	odbc_statistics: {
		description: 'Get statistics about a table and its indexes.',
		signature: '(resource $connection_id , string $qualifier , string $owner , string $table_name , int $unique , int $accuracy): resource'
	},
	odbc_tables: {
		description: 'Lists all tables in the requested range.',
		signature: '(resource $connection_id [, string $qualifier [, string $owner [, string $name [, string $types ]]]]): resource'
	},
	odbc_primarykeys: {
		description: 'Returns a result identifier that can be used to fetch the column names that comprise the primary key for a table.',
		signature: '(resource $connection_id , string $qualifier , string $owner , string $table): resource'
	},
	odbc_columnprivileges: {
		description: 'Lists columns and associated privileges for the given table.',
		signature: '(resource $connection_id , string $qualifier , string $owner , string $table_name , string $column_name): resource'
	},
	odbc_tableprivileges: {
		description: 'Lists tables in the requested range and the privileges associated with each table.',
		signature: '(resource $connection_id , string $qualifier , string $owner , string $name): resource'
	},
	odbc_foreignkeys: {
		description: 'Retrieves a list of foreign keys in the specified table or a list of foreign keys in other tables that refer to the primary key in the specified table',
		signature: '(resource $connection_id , string $pk_qualifier , string $pk_owner , string $pk_table , string $fk_qualifier , string $fk_owner , string $fk_table): resource'
	},
	odbc_procedures: {
		description: 'Lists all procedures in the requested range.',
		signature: '(resource $connection_id): resource'
	},
	odbc_procedurecolumns: {
		description: 'Retrieve information about parameters to procedures.',
		signature: '(resource $connection_id): resource'
	},
	odbc_do: {
		description: 'Alias of odbc_exec odbc_data_source odbc_error ODBC Functions PHP Manual odbc_do (PHP 4, PHP 5)',
	},
	odbc_field_precision: {
		description: 'Alias of odbc_field_len odbc_field_num odbc_field_scale ODBC Functions PHP Manual odbc_field_precision (PHP 4, PHP 5)',
	},
	preg_match: {
		description: 'Searches subject for a match to the regular expression given in pattern.',
		signature: '(string $pattern , string $subject [, array &$matches [, int $flags = 0 [, int $offset = 0 ]]]): int'
	},
	preg_match_all: {
		description: 'Searches subject for all matches to the regular expression given in pattern and puts them in matches in the order specified by flags.',
		signature: '(string $pattern , string $subject , array &$matches [, int $flags = PREG_PATTERN_ORDER [, int $offset = 0 ]]): int'
	},
	preg_replace: {
		description: 'Searches subject for matches to pattern and replaces them with replacement.',
		signature: '(mixed $pattern , mixed $replacement , mixed $subject [, int $limit = -1 [, int &$count ]]): mixed'
	},
	preg_replace_callback: {
		description: 'The behavior of this function is almost identical to preg_replace(), except for the fact that instead of replacement parameter, one should specify a callback.',
		signature: '(mixed $pattern , callback $callback , mixed $subject [, int $limit = -1 [, int &$count ]]): mixed'
	},
	preg_filter: {
		description: 'preg_filter() is identical to preg_replace() except it only returns the (possibly transformed) subjects where there was a match. For details about how this function works, read the preg_replace() documentation.',
		signature: '(mixed $pattern , mixed $replacement , mixed $subject [, int $limit = -1 [, int &$count ]]): mixed'
	},
	preg_split: {
		description: 'Split the given string by a regular expression.',
		signature: '(string $pattern , string $subject [, int $limit = -1 [, int $flags = 0 ]]): array'
	},
	preg_quote: {
		description: 'preg_quote() takes str and puts a backslash in front of every character that is part of the regular expression syntax. This is useful if you have a run-time string that you need to match in some text and the string may contain special regex characters.',
		signature: '(string $str [, string $delimiter = NULL ]): string'
	},
	preg_grep: {
		description: 'Returns the array consisting of the elements of the input array that match the given pattern.',
		signature: '(string $pattern , array $input [, int $flags = 0 ]): array'
	},
	preg_last_error: {
		description: 'Returns the error code of the last PCRE regex execution.',
		signature: '(void): int'
	},
	session_name: {
		description: 'session_name() returns the name of the current session. If name is given, session_name() will update the session name and return the old session name.',
		signature: '([ string $name ]): string'
	},
	session_module_name: {
		description: 'session_module_name() gets the name of the current session module.',
		signature: '([ string $module ]): string'
	},
	session_save_path: {
		description: 'session_save_path() returns the path of the current directory used to save session data.',
		signature: '([ string $path ]): string'
	},
	session_id: {
		description: 'session_id() is used to get or set the session id for the current session.',
		signature: '([ string $id ]): string'
	},
	session_regenerate_id: {
		description: 'session_regenerate_id() will replace the current session id with a new one, and keep the current session information.',
		signature: '([ bool $delete_old_session = false ]): bool'
	},
	session_decode: {
		description: 'session_decode() decodes the session data in data, setting variables stored in the session.',
		signature: '(string $data): bool'
	},
	session_register: {
		description: 'session_register() accepts a variable number of arguments, any of which can be either a string holding the name of a variable or an array consisting of variable names or other arrays. For each name, session_register() registers the global variable with that name in the current session.',
		signature: '(mixed $name [, mixed $... ]): bool'
	},
	session_unregister: {
		description: 'session_unregister() unregisters the global variable named name from the current session.',
		signature: '(string $name): bool'
	},
	session_is_registered: {
		description: 'Finds out whether a global variable is registered in a session.',
		signature: '(string $name): bool'
	},
	session_encode: {
		description: 'session_encode() returns a string with the contents of the current session encoded within.',
		signature: '(void): string'
	},
	session_start: {
		description: 'session_start() creates a session or resumes the current one based on a session identifier passed via a GET or POST request, or passed via a cookie.',
		signature: '(void): bool'
	},
	session_destroy: {
		description: 'session_destroy() destroys all of the data associated with the current session. It does not unset any of the global variables associated with the session, or unset the session cookie. To use the session variables again, session_start() has to be called.',
		signature: '(void): bool'
	},
	session_unset: {
		description: 'The session_unset() function frees all session variables currently registered.',
		signature: '(void): void'
	},
	session_set_save_handler: {
		description: 'session_set_save_handler() sets the user-level session storage functions which are used for storing and retrieving data associated with a session. This is most useful when a storage method other than those supplied by PHP sessions is preferred. i.e. Storing the session data in a local database.',
		signature: '(callback $open , callback $close , callback $read , callback $write , callback $destroy , callback $gc): bool'
	},
	session_cache_limiter: {
		description: 'session_cache_limiter() returns the name of the current cache limiter.',
		signature: '([ string $cache_limiter ]): string'
	},
	session_cache_expire: {
		description: 'session_cache_expire() returns the current setting of session.cache_expire.',
		signature: '([ string $new_cache_expire ]): int'
	},
	session_set_cookie_params: {
		description: 'Set cookie parameters defined in the php.ini file. The effect of this function only lasts for the duration of the script. Thus, you need to call session_set_cookie_params() for every request and before session_start() is called.',
		signature: '(int $lifetime [, string $path [, string $domain [, bool $secure = false [, bool $httponly = false ]]]]): void'
	},
	session_get_cookie_params: {
		description: 'Gets the session cookie parameters.',
		signature: '(void): array'
	},
	session_write_close: {
		description: 'End the current session and store session data.',
		signature: '(void): void'
	},
	session_commit: {
		description: 'Alias of session_write_close session_cache_limiter session_decode Session Functions PHP Manual session_commit (PHP 4 >= 4.4.0, PHP 5)',
	},
	spl_classes: {
		description: 'This function returns an array with the current available SPL classes.',
		signature: '(void): array'
	},
	spl_autoload: {
		description: 'This function is intended to be used as a default implementation for __autoload(). If nothing else is specified and spl_autoload_register() is called without any parameters then this functions will be used for any later call to __autoload().',
		signature: '(string $class_name [, string $file_extensions = spl_autoload_extensions() ]): void'
	},
	spl_autoload_extensions: {
		description: 'This function can modify and check the file extensions that the built in __autoload() fallback function spl_autoload() will be using.',
		signature: '([ string $file_extensions ]): string'
	},
	spl_autoload_register: {
		description: 'Register a function with the spl provided __autoload stack. If the stack is not yet activated it will be activated.',
		signature: '([ callback $autoload_function [, bool $throw = true [, bool $prepend = false ]]]): bool'
	},
	spl_autoload_unregister: {
		description: 'Unregister a function from the spl provided __autoload stack. If the stack is activated and empty after unregistering the given function then it will be deactivated.',
		signature: '(mixed $autoload_function): bool'
	},
	spl_autoload_functions: {
		description: 'Get all registered __autoload() functions.',
		signature: '(void): array'
	},
	spl_autoload_call: {
		description: 'This function can be used to manually search for a class or interface using the registered __autoload functions.',
		signature: '(string $class_name): void'
	},
	class_parents: {
		description: 'This function returns an array with the name of the parent classes of the given class.',
		signature: '(mixed $class [, bool $autoload = true ]): array'
	},
	class_implements: {
		description: 'This function returns an array with the names of the interfaces that the given class and its parents implement.',
		signature: '(mixed $class [, bool $autoload = true ]): array'
	},
	spl_object_hash: {
		description: 'This function returns a unique identifier for the object. This id can be used as a hash key for storing objects or for identifying an object.',
		signature: '(object $obj): string'
	},
	iterator_to_array: {
		description: 'Copy the elements of an iterator into an array.',
		signature: '(Traversable $iterator [, bool $use_keys = true ]): array'
	},
	iterator_count: {
		description: 'Count the elements in an iterator.',
		signature: '(Traversable $iterator): int'
	},
	iterator_apply: {
		description: 'Calls a function for every element in an iterator.',
		signature: '(Traversable $iterator , callback $function [, array $args ]): int'
	},
	constant: {
		description: 'Return the value of the constant indicated by name.',
		signature: '(string $name): mixed'
	},
	bin2hex: {
		description: 'Returns an ASCII string containing the hexadecimal representation of str. The conversion is done byte-wise with the high-nibble first.',
		signature: '(string $str): string'
	},
	sleep: {
		description: 'Delays the program execution for the given number of seconds.',
		signature: '(int $seconds): int'
	},
	usleep: {
		description: 'Delays program execution for the given number of micro seconds.',
		signature: '(int $micro_seconds): void'
	},
	time_nanosleep: {
		description: 'Delays program execution for the given number of seconds and nanoseconds.',
		signature: '(int $seconds , int $nanoseconds): mixed'
	},
	time_sleep_until: {
		description: 'Makes the script sleep until the specified timestamp.',
		signature: '(float $timestamp): bool'
	},
	flush: {
		description: 'Flushes the write buffers of PHP and whatever backend PHP is using (CGI, a web server, etc). This attempts to push current output all the way to the browser with a few caveats.',
		signature: '(void): void'
	},
	wordwrap: {
		description: 'Wraps a string to a given number of characters using a string break character.',
		signature: '(string $str [, int $width = 75 [, string $break = \"\\n\" [, bool $cut = false ]]]): string'
	},
	htmlspecialchars: {
		description: 'Certain characters have special significance in HTML, and should be represented by HTML entities if they are to preserve their meanings. This function returns a string with some of these conversions made; the translations made are those most useful for everyday web programming. If you require all HTML character entities to be translated, use htmlentities() instead.',
		signature: '(string $string [, int $flags = ENT_COMPAT [, string $charset [, bool $double_encode = true ]]]): string'
	},
	htmlentities: {
		description: 'This function is identical to htmlspecialchars() in all ways, except with htmlentities(), all characters which have HTML character entity equivalents are translated into these entities.',
		signature: '(string $string [, int $flags = ENT_COMPAT [, string $charset [, bool $double_encode = true ]]]): string'
	},
	html_entity_decode: {
		description: 'html_entity_decode() is the opposite of htmlentities() in that it converts all HTML entities to their applicable characters from string.',
		signature: '(string $string [, int $quote_style = ENT_COMPAT [, string $charset = \'UTF-8\' ]]): string'
	},
	htmlspecialchars_decode: {
		description: 'This function is the opposite of htmlspecialchars(). It converts special HTML entities back to characters.',
		signature: '(string $string [, int $quote_style = ENT_COMPAT ]): string'
	},
	get_html_translation_table: {
		description: 'get_html_translation_table() will return the translation table that is used internally for htmlspecialchars() and htmlentities() with the default charset.',
		signature: '([ int $table = HTML_SPECIALCHARS [, int $quote_style = ENT_COMPAT [, string $charset_hint ]]]): array'
	},
	sha1: {
		description: 'Calculates the sha1 hash of str using the US Secure Hash Algorithm 1.',
		signature: '(string $str [, bool $raw_output = false ]): string'
	},
	sha1_file: {
		description: 'Calculates the sha1 hash of the file specified by filename using the US Secure Hash Algorithm 1, and returns that hash. The hash is a 40-character hexadecimal number.',
		signature: '(string $filename [, bool $raw_output = false ]): string'
	},
	md5: {
		description: 'Calculates the MD5 hash of str using the RSA Data Security, Inc. MD5 Message-Digest Algorithm, and returns that hash.',
		signature: '(string $str [, bool $raw_output = false ]): string'
	},
	md5_file: {
		description: 'Calculates the MD5 hash of the file specified by the filename parameter using the RSA Data Security, Inc. MD5 Message-Digest Algorithm, and returns that hash. The hash is a 32-character hexadecimal number.',
		signature: '(string $filename [, bool $raw_output = false ]): string'
	},
	crc32: {
		description: 'Generates the cyclic redundancy checksum polynomial of 32-bit lengths of the str. This is usually used to validate the integrity of data being transmitted.',
		signature: '(string $str): int'
	},
	iptcparse: {
		description: 'Parses an IPTC block into its single tags.',
		signature: '(string $iptcblock): array'
	},
	iptcembed: {
		description: 'Embeds binary IPTC data into a JPEG image.',
		signature: '(string $iptcdata , string $jpeg_file_name [, int $spool ]): mixed'
	},
	getimagesize: {
		description: 'The getimagesize() function will determine the size of any given image file and return the dimensions along with the file type and a height/width text string to be used inside a normal HTML IMG tag and the correspondant HTTP content type.',
		signature: '(string $filename [, array &$imageinfo ]): array'
	},
	image_type_to_mime_type: {
		description: 'The image_type_to_mime_type() function will determine the Mime-Type for an IMAGETYPE constant.',
		signature: '(int $imagetype): string'
	},
	image_type_to_extension: {
		description: 'Returns the extension for the given IMAGETYPE_XXX constant.',
		signature: '(int $imagetype [, bool $include_dot = TRUE ]): string'
	},
	phpinfo: {
		description: 'Outputs a large amount of information about the current state of PHP. This includes information about PHP compilation options and extensions, the PHP version, server information and environment (if compiled as a module), the PHP environment, OS version information, paths, master and local values of configuration options, HTTP headers, and the PHP License.',
		signature: '([ int $what = INFO_ALL ]): bool'
	},
	phpversion: {
		description: 'Returns a string containing the version of the currently running PHP parser or extension.',
		signature: '([ string $extension ]): string'
	},
	phpcredits: {
		description: 'This function prints out the credits listing the PHP developers, modules, etc. It generates the appropriate HTML codes to insert the information in a page.',
		signature: '([ int $flag = CREDITS_ALL ]): bool'
	},
	php_logo_guid: {
		description: 'This function returns the ID which can be used to display the PHP logo using the built-in image. Logo is displayed only if expose_php is On.',
		signature: '(void): string'
	},
	zend_logo_guid: {
		description: 'This function returns the ID which can be used to display the Zend logo using the built-in image.',
		signature: '(void): string'
	},
	php_sapi_name: {
		description: 'Returns a lowercase string that describes the type of interface (the Server API, SAPI) that PHP is using. For example, in CLI PHP this string will be \"cli\" whereas with Apache it may have several different values depending on the exact SAPI used. Possible values are listed below.',
		signature: '(void): string'
	},
	php_uname: {
		description: 'php_uname() returns a description of the operating system PHP is running on. This is the same string you see at the very top of the phpinfo() output. For the name of just the operating system, consider using the PHP_OS constant, but keep in mind this constant will contain the operating system PHP was built on.',
		signature: '([ string $mode = \"a\" ]): string'
	},
	php_ini_scanned_files: {
		description: 'php_ini_scanned_files() returns a comma-separated list of configuration files parsed after php.ini. These files are found in a directory defined by the --with-config-file-scan-dir option which is set during compilation.',
		signature: '(void): string'
	},
	php_ini_loaded_file: {
		description: 'Check if a php.ini file is loaded, and retrieve its path.',
		signature: '(void): string'
	},
	strnatcmp: {
		description: 'This function implements a comparison algorithm that orders alphanumeric strings in the way a human being would, this is described as a \"natural ordering\". Note that this comparison is case sensitive.',
		signature: '(string $str1 , string $str2): int'
	},
	strnatcasecmp: {
		description: 'This function implements a comparison algorithm that orders alphanumeric strings in the way a human being would. The behaviour of this function is similar to strnatcmp(), except that the comparison is not case sensitive. For more information see: Martin Pool\'s Natural Order String Comparison page.',
		signature: '(string $str1 , string $str2): int'
	},
	substr_count: {
		description: 'substr_count() returns the number of times the needle substring occurs in the haystack string. Please note that needle is case sensitive.',
		signature: '(string $haystack , string $needle [, int $offset = 0 [, int $length ]]): int'
	},
	strspn: {
		description: 'Finds the length of the initial segment of subject that contains only characters from mask.',
		signature: '(string $subject , string $mask [, int $start [, int $length ]]): int'
	},
	strcspn: {
		description: 'Returns the length of the initial segment of str1 which does not contain any of the characters in str2.',
		signature: '(string $str1 , string $str2 [, int $start [, int $length ]]): int'
	},
	strtok: {
		description: 'strtok() splits a string (str) into smaller strings (tokens), with each token being delimited by any character from token. That is, if you have a string like \"This is an example string\" you could tokenize this string into its individual words by using the space character as the token.',
		signature: '(string $str , string $token): string'
	},
	strtoupper: {
		description: 'Returns string with all alphabetic characters converted to uppercase.',
		signature: '(string $string): string'
	},
	strtolower: {
		description: 'Returns string with all alphabetic characters converted to lowercase.',
		signature: '(string $str): string'
	},
	strpos: {
		description: 'Returns the numeric position of the first occurrence of needle in the haystack string. Unlike the strrpos() before PHP 5, this function can take a full string as the needle parameter and the entire string will be used.',
		signature: '(string $haystack , mixed $needle [, int $offset = 0 ]): int'
	},
	stripos: {
		description: 'Returns the numeric position of the first occurrence of needle in the haystack string.',
		signature: '(string $haystack , string $needle [, int $offset = 0 ]): int'
	},
	strrpos: {
		description: 'Returns the numeric position of the last occurrence of needle in the haystack string.',
		signature: '(string $haystack , string $needle [, int $offset = 0 ]): int'
	},
	strripos: {
		description: 'Find position of last occurrence of a case-insensitive string in a string. Unlike strrpos(), strripos() is case-insensitive.',
		signature: '(string $haystack , string $needle [, int $offset = 0 ]): int'
	},
	strrev: {
		description: 'Returns string, reversed.',
		signature: '(string $string): string'
	},
	hebrev: {
		description: 'Converts logical Hebrew text to visual text.',
		signature: '(string $hebrew_text [, int $max_chars_per_line = 0 ]): string'
	},
	hebrevc: {
		description: 'This function is similar to hebrev() with the difference that it converts newlines (\\n) to \"<br>\\n\".',
		signature: '(string $hebrew_text [, int $max_chars_per_line = 0 ]): string'
	},
	nl2br: {
		description: 'Returns string with \'<br />\' or \'<br>\' inserted before all newlines (\\r\\n, \\n\\r, \\n and \\r).',
		signature: '(string $string [, bool $is_xhtml = true ]): string'
	},
	basename: {
		description: 'Given a string containing the path to a file or directory, this function will return the trailing name component.',
		signature: '(string $path [, string $suffix ]): string'
	},
	dirname: {
		description: 'Given a string containing the path of a file or directory, this function will return the parent directory\'s path.',
		signature: '(string $path): string'
	},
	pathinfo: {
		description: 'pathinfo() returns an associative array containing information about path.',
		signature: '(string $path [, int $options = PATHINFO_DIRNAME | PATHINFO_BASENAME | PATHINFO_EXTENSION | PATHINFO_FILENAME ]): mixed'
	},
	stripslashes: {
		description: 'Un-quotes a quoted string.',
		signature: '(string $str): string'
	},
	stripcslashes: {
		description: 'Returns a string with backslashes stripped off. Recognizes C-like \\n, \\r ..., octal and hexadecimal representation.',
		signature: '(string $str): string'
	},
	strstr: {
		description: 'Returns part of haystack string from the first occurrence of needle to the end of haystack.',
		signature: '(string $haystack , mixed $needle [, bool $before_needle = false ]): string'
	},
	stristr: {
		description: 'Returns all of haystack from the first occurrence of needle to the end.',
		signature: '(string $haystack , mixed $needle [, bool $before_needle = false ]): string'
	},
	strrchr: {
		description: 'This function returns the portion of haystack which starts at the last occurrence of needle and goes until the end of haystack.',
		signature: '(string $haystack , mixed $needle): string'
	},
	str_shuffle: {
		description: 'str_shuffle() shuffles a string. One permutation of all possible is created.',
		signature: '(string $str): string'
	},
	str_word_count: {
		description: 'Counts the number of words inside string. If the optional format is not specified, then the return value will be an integer representing the number of words found. In the event the format is specified, the return value will be an array, content of which is dependent on the format. The possible value for the format and the resultant outputs are listed below.',
		signature: '(string $string [, int $format = 0 [, string $charlist ]]): mixed'
	},
	str_split: {
		description: 'Converts a string to an array.',
		signature: '(string $string [, int $split_length = 1 ]): array'
	},
	strpbrk: {
		description: 'strpbrk() searches the haystack string for a char_list.',
		signature: '(string $haystack , string $char_list): string'
	},
	substr_compare: {
		description: 'substr_compare() compares main_str from position offset with str up to length characters.',
		signature: '(string $main_str , string $str , int $offset [, int $length [, bool $case_insensitivity = false ]]): int'
	},
	strcoll: {
		description: 'Note that this comparison is case sensitive, and unlike strcmp() this function is not binary safe.',
		signature: '(string $str1 , string $str2): int'
	},
	substr: {
		description: 'Returns the portion of string specified by the start and length parameters.',
		signature: '(string $string , int $start [, int $length ]): string'
	},
	substr_replace: {
		description: 'substr_replace() replaces a copy of string delimited by the start and (optionally) length parameters with the string given in replacement.',
		signature: '(mixed $string , mixed $replacement , mixed $start [, mixed $length ]): mixed'
	},
	quotemeta: {
		description: 'Returns a version of str with a backslash character (\\) before every character that is among these: . \\ + * ? [ ^ ] ( $)',
		signature: '(string $str): string'
	},
	ucfirst: {
		description: 'Returns a string with the first character of str capitalized, if that character is alphabetic.',
		signature: '(string $str): string'
	},
	lcfirst: {
		description: 'Returns a string with the first character of str , lowercased if that character is alphabetic.',
		signature: '(string $str): string'
	},
	ucwords: {
		description: 'Returns a string with the first character of each word in str capitalized, if that character is alphabetic.',
		signature: '(string $str): string'
	},
	strtr: {
		description: 'If given three arguments, this function returns a copy of str where all occurrences of each (single-byte) character in from have been translated to the corresponding character in to, i.e., every occurrence of $from[$n] has been replaced with $to[$n], where $n is a valid offset in both arguments.',
		signature: '(string $str , string $from , string $to): string'
	},
	addslashes: {
		description: 'Returns a string with backslashes before characters that need to be quoted in database queries etc. These characters are single quote (\'), double quote (\"), backslash (\\) and NUL (the NULL byte).',
		signature: '(string $str): string'
	},
	addcslashes: {
		description: 'Returns a string with backslashes before characters that are listed in charlist parameter.',
		signature: '(string $str , string $charlist): string'
	},
	rtrim: {
		description: 'This function returns a string with whitespace stripped from the end of str.',
		signature: '(string $str [, string $charlist ]): string'
	},
	str_replace: {
		description: 'This function returns a string or an array with all occurrences of search in subject replaced with the given replace value.',
		signature: '(mixed $search , mixed $replace , mixed $subject [, int &$count ]): mixed'
	},
	str_ireplace: {
		description: 'This function returns a string or an array with all occurrences of search in subject (ignoring case) replaced with the given replace value. If you don\'t need fancy replacing rules, you should generally use this function instead of preg_replace() with the i modifier.',
		signature: '(mixed $search , mixed $replace , mixed $subject [, int &$count ]): mixed'
	},
	str_repeat: {
		description: 'Returns input repeated multiplier times.',
		signature: '(string $input , int $multiplier): string'
	},
	count_chars: {
		description: 'Counts the number of occurrences of every byte-value (0..255) in string and returns it in various ways.',
		signature: '(string $string [, int $mode = 0 ]): mixed'
	},
	chunk_split: {
		description: 'Can be used to split a string into smaller chunks which is useful for e.g. converting base64_encode() output to match RFC 2045 semantics. It inserts end every chunklen characters.',
		signature: '(string $body [, int $chunklen = 76 [, string $end = \"\\r\\n\" ]]): string'
	},
	trim: {
		description: 'This function returns a string with whitespace stripped from the beginning and end of str. Without the second parameter, trim() will strip these characters: \" \" (ASCII 32 (0x20)), an ordinary space. \"\\t\" (ASCII 9 (0x09)), a tab. \"\\n\" (ASCII 10 (0x0A)), a new line (line feed). \"\\r\" (ASCII 13 (0x0D)), a carriage return. \"\\0\" (ASCII 0 (0x00)), the NUL-byte. \"\\x0B\" (ASCII 11 (0x0B)), a vertical tab.',
		signature: '(string $str [, string $charlist ]): string'
	},
	ltrim: {
		description: 'Strip whitespace (or other characters) from the beginning of a string.',
		signature: '(string $str [, string $charlist ]): string'
	},
	strip_tags: {
		description: 'This function tries to return a string with all NUL bytes, HTML and PHP tags stripped from a given str. It uses the same tag stripping state machine as the fgetss() function.',
		signature: '(string $str [, string $allowable_tags ]): string'
	},
	similar_text: {
		description: 'This calculates the similarity between two strings as described in Oliver [1993]. Note that this implementation does not use a stack as in Oliver\'s pseudo code, but recursive calls which may or may not speed up the whole process. Note also that the complexity of this algorithm is O(N**3) where N is the length of the longest string.',
		signature: '(string $first , string $second [, float &$percent ]): int'
	},
	explode: {
		description: 'Returns an array of strings, each of which is a substring of string formed by splitting it on boundaries formed by the string delimiter.',
		signature: '(string $delimiter , string $string [, int $limit ]): array'
	},
	implode: {
		description: 'Join array elements with a glue string.',
		signature: '(string $glue , array $pieces): string'
	},
	join: {
		description: 'Alias of implode implode lcfirst String Functions PHP Manual join (PHP 4, PHP 5)',
	},
	setlocale: {
		description: 'Sets locale information.',
		signature: '(int $category , string $locale [, string $... ]): string'
	},
	localeconv: {
		description: 'Returns an associative array containing localized numeric and monetary formatting information.',
		signature: '(void): array'
	},
	soundex: {
		description: 'Calculates the soundex key of str.',
		signature: '(string $str): string'
	},
	levenshtein: {
		description: 'The Levenshtein distance is defined as the minimal number of characters you have to replace, insert or delete to transform str1 into str2. The complexity of the algorithm is O(m*n), where n and m are the length of str1 and str2 (rather good when compared to similar_text(), which is O(max(n,m)**3), but still expensive).',
		signature: '(string $str1 , string $str2): int'
	},
	chr: {
		description: 'Returns a one-character string containing the character specified by ascii.',
		signature: '(int $ascii): string'
	},
	ord: {
		description: 'Returns the ASCII value of the first character of string.',
		signature: '(string $string): int'
	},
	parse_str: {
		description: 'Parses str as if it were the query string passed via a URL and sets variables in the current scope.',
		signature: '(string $str [, array &$arr ]): void'
	},
	str_getcsv: {
		description: 'Similar to fgetcsv() this functions parses a string as its input unlike fgetcsv() which takes a file as its input.',
		signature: '(string $input [, string $delimiter = \',\' [, string $enclosure = \'\"\' [, string $escape = \'\\\\\' ]]]): array'
	},
	str_pad: {
		description: 'This functions returns the input string padded on the left, the right, or both sides to the specified padding length. If the optional argument pad_string is not supplied, the input is padded with spaces, otherwise it is padded with characters from pad_string up to the limit.',
		signature: '(string $input , int $pad_length [, string $pad_string = \" \" [, int $pad_type = STR_PAD_RIGHT ]]): string'
	},
	chop: {
		description: 'Alias of rtrim bin2hex chr String Functions PHP Manual chop (PHP 4, PHP 5)',
	},
	strchr: {
		description: 'Alias of strstr strcasecmp strcmp String Functions PHP Manual strchr (PHP 4, PHP 5)',
	},
	sprintf: {
		description: 'Returns a string produced according to the formatting string format.',
		signature: '(string $format [, mixed $args [, mixed $... ]]): string'
	},
	printf: {
		description: 'Produces output according to format.',
		signature: '(string $format [, mixed $args [, mixed $... ]]): int'
	},
	vprintf: {
		description: 'Display array values as a formatted string according to format (which is described in the documentation for sprintf()).',
		signature: '(string $format , array $args): int'
	},
	vsprintf: {
		description: 'Operates as sprintf() but accepts an array of arguments, rather than a variable number of arguments.',
		signature: '(string $format , array $args): string'
	},
	fprintf: {
		description: 'Write a string produced according to format to the stream resource specified by handle.',
		signature: '(resource $handle , string $format [, mixed $args [, mixed $... ]]): int'
	},
	vfprintf: {
		description: 'Write a string produced according to format to the stream resource specified by handle.',
		signature: '(resource $handle , string $format , array $args): int'
	},
	sscanf: {
		description: 'The function sscanf() is the input analog of printf(). sscanf() reads from the string str and interprets it according to the specified format, which is described in the documentation for sprintf().',
		signature: '(string $str , string $format [, mixed &$... ]): mixed'
	},
	fscanf: {
		description: 'The function fscanf() is similar to sscanf(), but it takes its input from a file associated with handle and interprets the input according to the specified format, which is described in the documentation for sprintf().',
		signature: '(resource $handle , string $format [, mixed &$... ]): mixed'
	},
	parse_url: {
		description: 'This function parses a URL and returns an associative array containing any of the various components of the URL that are present.',
		signature: '(string $url [, int $component = -1 ]): mixed'
	},
	urlencode: {
		description: 'This function is convenient when encoding a string to be used in a query part of a URL, as a convenient way to pass variables to the next page.',
		signature: '(string $str): string'
	},
	urldecode: {
		description: 'Decodes any %## encoding in the given string. Plus symbols (' + ') are decoded to a space character.',
		signature: '(string $str): string'
	},
	rawurlencode: {
		description: 'Encodes the given string according to RFC 3986.',
		signature: '(string $str): string'
	},
	rawurldecode: {
		description: 'Returns a string in which the sequences with percent (%) signs followed by two hex digits have been replaced with literal characters.',
		signature: '(string $str): string'
	},
	http_build_query: {
		description: 'Generates a URL-encoded query string from the associative (or indexed) array provided.',
		signature: '(mixed $query_data [, string $numeric_prefix [, string $arg_separator [, int $enc_type = PHP_QUERY_RFC1738 ]]]): string'
	},
	readlink: {
		description: 'readlink() does the same as the readlink C function.',
		signature: '(string $path): string'
	},
	linkinfo: {
		description: 'Gets information about a link.',
		signature: '(string $path): int'
	},
	symlink: {
		description: 'symlink() creates a symbolic link to the existing target with the specified name link.',
		signature: '(string $target , string $link): bool'
	},
	link: {
		description: 'link() creates a hard link.',
		signature: '(string $target , string $link): bool'
	},
	unlink: {
		description: 'Deletes filename. Similar to the Unix C unlink() function. A E_WARNING level error will be generated on failure.',
		signature: '(string $filename [, resource $context ]): bool'
	},
	exec: {
		description: 'exec() executes the given command.',
		signature: '(string $command [, array &$output [, int &$return_var ]]): string'
	},
	system: {
		description: 'system() is just like the C version of the function in that it executes the given command and outputs the result.',
		signature: '(string $command [, int &$return_var ]): string'
	},
	escapeshellcmd: {
		description: 'escapeshellcmd() escapes any characters in a string that might be used to trick a shell command into executing arbitrary commands. This function should be used to make sure that any data coming from user input is escaped before this data is passed to the exec() or system() functions, or to the backtick operator.',
		signature: '(string $command): string'
	},
	escapeshellarg: {
		description: 'escapeshellarg() adds single quotes around a string and quotes/escapes any existing single quotes allowing you to pass a string directly to a shell function and having it be treated as a single safe argument. This function should be used to escape individual arguments to shell functions coming from user input. The shell functions include exec(), system() and the backtick operator.',
		signature: '(string $arg): string'
	},
	passthru: {
		description: 'The passthru() function is similar to the exec() function in that it executes a command. This function should be used in place of exec() or system() when the output from the Unix command is binary data which needs to be passed directly back to the browser. A common use for this is to execute something like the pbmplus utilities that can output an image stream directly. By setting the Content-type to image/gif and then calling a pbmplus program to output a gif, you can create PHP scripts that output images directly.',
		signature: '(string $command [, int &$return_var ]): void'
	},
	shell_exec: {
		description: 'This function is identical to the backtick operator.',
		signature: '(string $cmd): string'
	},
	proc_open: {
		description: 'proc_open() is similar to popen() but provides a much greater degree of control over the program execution.',
		signature: '(string $cmd , array $descriptorspec , array &$pipes [, string $cwd [, array $env [, array $other_options ]]]): resource'
	},
	proc_close: {
		description: 'proc_close() is similar to pclose() except that it only works on processes opened by proc_open(). proc_close() waits for the process to terminate, and returns its exit code. If you have open pipes to that process, you should fclose() them prior to calling this function in order to avoid a deadlock - the child process may not be able to exit while the pipes are open.',
		signature: '(resource $process): int'
	},
	proc_terminate: {
		description: 'Signals a process (created using proc_open()) that it should terminate. proc_terminate() returns immediately and does not wait for the process to terminate.',
		signature: '(resource $process [, int $signal = 15 ]): bool'
	},
	proc_get_status: {
		description: 'proc_get_status() fetches data about a process opened using proc_open().',
		signature: '(resource $process): array'
	},
	rand: {
		description: 'If called without the optional min, max arguments rand() returns a pseudo-random integer between 0 and getrandmax(). If you want a random number between 5 and 15 (inclusive), for example, use rand(5, 15).',
		signature: '(void): int'
	},
	srand: {
		description: 'Seeds the random number generator with seed or with a random value if no seed is given.',
		signature: '([ int $seed ]): void'
	},
	getrandmax: {
		description: 'Returns the maximum value that can be returned by a call to rand().',
		signature: '(void): int'
	},
	mt_rand: {
		description: 'Many random number generators of older libcs have dubious or unknown characteristics and are slow. By default, PHP uses the libc random number generator with the rand() function. The mt_rand() function is a drop-in replacement for this. It uses a random number generator with known characteristics using the Mersenne Twister, which will produce random numbers four times faster than what the average libc rand() provides.',
		signature: '(void): int'
	},
	mt_srand: {
		description: 'Seeds the random number generator with seed or with a random value if no seed is given.',
		signature: '([ int $seed ]): void'
	},
	mt_getrandmax: {
		description: 'Returns the maximum value that can be returned by a call to mt_rand().',
		signature: '(void): int'
	},
	getservbyname: {
		description: 'getservbyname() returns the Internet port which corresponds to service for the specified protocol as per /etc/services.',
		signature: '(string $service , string $protocol): int'
	},
	getservbyport: {
		description: 'getservbyport() returns the Internet service associated with port for the specified protocol as per /etc/services.',
		signature: '(int $port , string $protocol): string'
	},
	getprotobyname: {
		description: 'getprotobyname() returns the protocol number associated with the protocol name as per /etc/protocols.',
		signature: '(string $name): int'
	},
	getprotobynumber: {
		description: 'getprotobynumber() returns the protocol name associated with protocol number as per /etc/protocols.',
		signature: '(int $number): string'
	},
	getmyuid: {
		description: 'Gets the user ID of the current script.',
		signature: '(void): int'
	},
	getmygid: {
		description: 'Gets the group ID of the current script.',
		signature: '(void): int'
	},
	getmypid: {
		description: 'Gets the current PHP process ID.',
		signature: '(void): int'
	},
	getmyinode: {
		description: 'Gets the inode of the current script.',
		signature: '(void): int'
	},
	getlastmod: {
		description: 'Gets the time of the last modification of the current page.',
		signature: '(void): int'
	},
	base64_decode: {
		description: 'Decodes a base64 encoded data.',
		signature: '(string $data [, bool $strict = false ]): string'
	},
	base64_encode: {
		description: 'Encodes the given data with base64.',
		signature: '(string $data): string'
	},
	convert_uuencode: {
		description: 'convert_uuencode() encodes a string using the uuencode algorithm.',
		signature: '(string $data): string'
	},
	convert_uudecode: {
		description: 'convert_uudecode() decodes a uuencoded string.',
		signature: '(string $data): string'
	},
	abs: {
		description: 'Returns the absolute value of number.',
		signature: '(mixed $number): number'
	},
	ceil: {
		description: 'Returns the next highest integer value by rounding up value if necessary.',
		signature: '(float $value): float'
	},
	floor: {
		description: 'Returns the next lowest integer value by rounding down value if necessary.',
		signature: '(float $value): float'
	},
	round: {
		description: 'Returns the rounded value of val to specified precision (number of digits after the decimal point). precision can also be negative or zero (default).',
		signature: '(float $val [, int $precision = 0 [, int $mode = PHP_ROUND_HALF_UP ]]): float'
	},
	sin: {
		description: 'sin() returns the sine of the arg parameter. The arg parameter is in radians.',
		signature: '(float $arg): float'
	},
	cos: {
		description: 'cos() returns the cosine of the arg parameter. The arg parameter is in radians.',
		signature: '(float $arg): float'
	},
	tan: {
		description: 'tan() returns the tangent of the arg parameter. The arg parameter is in radians.',
		signature: '(float $arg): float'
	},
	asin: {
		description: 'Returns the arc sine of arg in radians. asin() is the complementary function of sin(), which means that a==sin(asin(a)) for every value of a that is within asin()\'s range.',
		signature: '(float $arg): float'
	},
	acos: {
		description: 'Returns the arc cosine of arg in radians. acos() is the complementary function of cos(), which means that a==cos(acos(a)) for every value of a that is within acos()\' range.',
		signature: '(float $arg): float'
	},
	atan: {
		description: 'Returns the arc tangent of arg in radians. atan() is the complementary function of tan(), which means that a==tan(atan(a)) for every value of a that is within atan()\'s range.',
		signature: '(float $arg): float'
	},
	atanh: {
		description: 'Returns the inverse hyperbolic tangent of arg, i.e. the value whose hyperbolic tangent is arg.',
		signature: '(float $arg): float'
	},
	atan2: {
		description: 'This function calculates the arc tangent of the two variables x and y. It is similar to calculating the arc tangent of y / x, except that the signs of both arguments are used to determine the quadrant of the result.',
		signature: '(float $y , float $x): float'
	},
	sinh: {
		description: 'Returns the hyperbolic sine of arg, defined as (exp(arg) - exp(-arg))/2.',
		signature: '(float $arg): float'
	},
	cosh: {
		description: 'Returns the hyperbolic cosine of arg, defined as (exp(arg) + exp(-arg))/2.',
		signature: '(float $arg): float'
	},
	tanh: {
		description: 'Returns the hyperbolic tangent of arg, defined as sinh(arg)/cosh(arg).',
		signature: '(float $arg): float'
	},
	asinh: {
		description: 'Returns the inverse hyperbolic sine of arg, i.e. the value whose hyperbolic sine is arg.',
		signature: '(float $arg): float'
	},
	acosh: {
		description: 'Returns the inverse hyperbolic cosine of arg, i.e. the value whose hyperbolic cosine is arg.',
		signature: '(float $arg): float'
	},
	expm1: {
		description: 'expm1() returns the equivalent to \'exp(arg) - 1\' computed in a way that is accurate even if the value of arg is near zero, a case where \'exp (arg) - 1\' would be inaccurate due to subtraction of two numbers that are nearly equal.',
		signature: '(float $arg): float'
	},
	log1p: {
		description: 'log1p() returns log(1 + number) computed in a way that is accurate even when the value of number is close to zero. log() might only return log(1) in this case due to lack of precision.',
		signature: '(float $number): float'
	},
	pi: {
		description: 'Returns an approximation of pi. The returned float has a precision based on the precision directive in php.ini, which defaults to 14. Also, you can use the M_PI constant which yields identical results to pi().',
		signature: '(void): float'
	},
	is_finite: {
		description: 'Checks whether val is a legal finite on this platform.',
		signature: '(float $val): bool'
	},
	is_nan: {
		description: 'Checks whether val is \'not a number\', like the result of acos(1.01).',
		signature: '(float $val): bool'
	},
	is_infinite: {
		description: 'Returns TRUE if val is infinite (positive or negative), like the result of log(0) or any value too big to fit into a float on this platform.',
		signature: '(float $val): bool'
	},
	pow: {
		description: 'Returns base raised to the power of exp.',
		signature: '(number $base , number $exp): number'
	},
	exp: {
		description: 'Returns e raised to the power of arg.',
		signature: '(float $arg): float'
	},
	log: {
		description: 'If the optional base parameter is specified, log() returns logbase arg, otherwise log() returns the natural logarithm of arg.',
		signature: '(float $arg [, float $base = M_E ]): float'
	},
	log10: {
		description: 'Returns the base-10 logarithm of arg.',
		signature: '(float $arg): float'
	},
	sqrt: {
		description: 'Returns the square root of arg.',
		signature: '(float $arg): float'
	},
	hypot: {
		description: 'hypot() returns the length of the hypotenuse of a right-angle triangle with sides of length x and y, or the distance of the point (x, y) from the origin. This is equivalent to sqrt(x*x + y*y).',
		signature: '(float $x , float $y): float'
	},
	deg2rad: {
		description: 'This function converts number from degrees to the radian equivalent.',
		signature: '(float $number): float'
	},
	rad2deg: {
		description: 'This function converts number from radian to degrees.',
		signature: '(float $number): float'
	},
	bindec: {
		description: 'Returns the decimal equivalent of the binary number represented by the binary_string argument.',
		signature: '(string $binary_string): number'
	},
	hexdec: {
		description: 'Returns the decimal equivalent of the hexadecimal number represented by the hex_string argument. hexdec() converts a hexadecimal string to a decimal number.',
		signature: '(string $hex_string): number'
	},
	octdec: {
		description: 'Returns the decimal equivalent of the octal number represented by the octal_string argument.',
		signature: '(string $octal_string): number'
	},
	decbin: {
		description: 'Returns a string containing a binary representation of the given number argument.',
		signature: '(int $number): string'
	},
	decoct: {
		description: 'Returns a string containing an octal representation of the given number argument. The largest number that can be converted is 4294967295 in decimal resulting to \"37777777777\".',
		signature: '(int $number): string'
	},
	dechex: {
		description: 'Returns a string containing a hexadecimal representation of the given number argument. The largest number that can be converted is 4294967295 in decimal resulting to \"ffffffff\".',
		signature: '(int $number): string'
	},
	base_convert: {
		description: 'Returns a string containing number represented in base tobase. The base in which number is given is specified in frombase. Both frombase and tobase have to be between 2 and 36, inclusive. Digits in numbers with a base higher than 10 will be represented with the letters a-z, with a meaning 10, b meaning 11 and z meaning 35.',
		signature: '(string $number , int $frombase , int $tobase): string'
	},
	number_format: {
		description: 'This function accepts either one, two, or four parameters (not three):',
		signature: '(float $number [, int $decimals = 0 ]): string'
	},
	fmod: {
		description: 'Returns the floating point remainder of dividing the dividend (x) by the divisor (y). The reminder (r) is defined as: x = i * y + r, for some integer i. If y is non-zero, r has the same sign as x and a magnitude less than the magnitude of y.',
		signature: '(float $x , float $y): float'
	},
	inet_ntop: {
		description: 'This function converts a 32bit IPv4, or 128bit IPv6 address (if PHP was built with IPv6 support enabled) into an address family appropriate string representation.',
		signature: '(string $in_addr): string'
	},
	inet_pton: {
		description: 'This function converts a human readable IPv4 or IPv6 address (if PHP was built with IPv6 support enabled) into an address family appropriate 32bit or 128bit binary structure.',
		signature: '(string $address): string'
	},
	ip2long: {
		description: 'The function ip2long() generates an IPv4 Internet network address from its Internet standard format (dotted string) representation.',
		signature: '(string $ip_address): int'
	},
	long2ip: {
		description: 'The function long2ip() generates an Internet address in dotted format (i.e.: aaa.bbb.ccc.ddd) from the proper address representation.',
		signature: '(string $proper_address): string'
	},
	getenv: {
		description: 'Gets the value of an environment variable.',
		signature: '(string $varname): string'
	},
	putenv: {
		description: 'Adds setting to the server environment. The environment variable will only exist for the duration of the current request. At the end of the request the environment is restored to its original state.',
		signature: '(string $setting): bool'
	},
	getopt: {
		description: 'Parses options passed to the script.',
		signature: '(string $options [, array $longopts ]): array'
	},
	microtime: {
		description: 'microtime() returns the current Unix timestamp with microseconds. This function is only available on operating systems that support the gettimeofday() system call.',
		signature: '([ bool $get_as_float = false ]): mixed'
	},
	gettimeofday: {
		description: 'This is an interface to gettimeofday(2). It returns an associative array containing the data returned from the system call.',
		signature: '([ bool $return_float = false ]): mixed'
	},
	uniqid: {
		description: 'Gets a prefixed unique identifier based on the current time in microseconds.',
		signature: '([ string $prefix = \"\" [, bool $more_entropy = false ]]): string'
	},
	quoted_printable_decode: {
		description: 'This function returns an 8-bit binary string corresponding to the decoded quoted printable string (according to RFC2045, section 6.7, not RFC2821, section 4.5.2, so additional periods are not stripped from the beginning of line).',
		signature: '(string $str): string'
	},
	quoted_printable_encode: {
		description: 'Returns a quoted printable string created according to RFC2045, section 6.7.',
		signature: '(string $str): string'
	},
	convert_cyr_string: {
		description: 'Converts from one Cyrillic character set to another.',
		signature: '(string $str , string $from , string $to): string'
	},
	get_current_user: {
		description: 'Returns the name of the owner of the current PHP script.',
		signature: '(void): string'
	},
	set_time_limit: {
		description: 'Set the number of seconds a script is allowed to run. If this is reached, the script returns a fatal error. The default limit is 30 seconds or, if it exists, the max_execution_time value defined in the php.ini.',
		signature: '(int $seconds): void'
	},
	get_cfg_var: {
		description: 'Gets the value of a PHP configuration option.',
		signature: '(string $option): string'
	},
	magic_quotes_runtime: {
		description: 'Alias of set_magic_quotes_runtime ini_set main PHP Options/Info Functions PHP Manual magic_quotes_runtime (PHP 4, PHP 5)',
	},
	set_magic_quotes_runtime: {
		description: 'Set the current active configuration setting of magic_quotes_runtime.',
		signature: '(bool $new_setting): bool'
	},
	get_magic_quotes_gpc: {
		description: 'Returns the current configuration setting of magic_quotes_gpc',
		signature: '(void): int'
	},
	get_magic_quotes_runtime: {
		description: 'Returns the current active configuration setting of magic_quotes_runtime.',
		signature: '(void): int'
	},
	import_request_variables: {
		description: 'Imports GET/POST/Cookie variables into the global scope. It is useful if you disabled register_globals, but would like to see some variables in the global scope.',
		signature: '(string $types [, string $prefix ]): bool'
	},
	error_log: {
		description: 'Sends an error message to the web server\'s error log or to a file.',
		signature: '(string $message [, int $message_type = 0 [, string $destination [, string $extra_headers ]]]): bool'
	},
	error_get_last: {
		description: 'Gets information about the last error that occurred.',
		signature: '(void): array'
	},
	call_user_func: {
		description: 'Call a user defined function given by the function parameter.',
		signature: '(callback $function [, mixed $parameter [, mixed $... ]]): mixed'
	},
	call_user_func_array: {
		description: 'Call a user defined function with the parameters in param_arr.',
		signature: '(callback $function , array $param_arr): mixed'
	},
	call_user_method: {
		description: 'The function is deprecated as of PHP 4.1.0.',
		signature: '(string $method_name , object &$obj [, mixed $parameter [, mixed $... ]]): mixed'
	},
	call_user_method_array: {
		description: 'The function is deprecated as of PHP 4.1.0.',
		signature: '(string $method_name , object &$obj , array $params): mixed'
	},
	forward_static_call: {
		description: 'Calls a user defined function or method given by the function parameter, with the following arguments. This function must be called within a method context, it can\'t be used outside a class. It uses the late static binding.',
		signature: '(callback $function [, mixed $parameter [, mixed $... ]]): mixed'
	},
	forward_static_call_array: {
		description: 'Calls a user defined function or method given by the function parameter. This function must be called within a method context, it can\'t be used outside a class. It uses the late static binding. All arguments of the forwarded method are passed as values, and as an array, similarly to call_user_func_array().',
		signature: '(callback $function , array $parameters): mixed'
	},
	serialize: {
		description: 'Generates a storable representation of a value',
		signature: '(mixed $value): string'
	},
	unserialize: {
		description: 'unserialize() takes a single serialized variable and converts it back into a PHP value.',
		signature: '(string $str): mixed'
	},
	var_dump: {
		description: 'This function displays structured information about one or more expressions that includes its type and value. Arrays and objects are explored recursively with values indented to show structure.',
		signature: '(mixed $expression [, mixed $... ]): void'
	},
	var_export: {
		description: 'var_export() gets structured information about the given variable. It is similar to var_dump() with one exception: the returned representation is valid PHP code.',
		signature: '(mixed $expression [, bool $return = false ]): mixed'
	},
	debug_zval_dump: {
		description: 'Dumps a string representation of an internal zend value to output.',
		signature: '(mixed $variable): void'
	},
	print_r: {
		description: 'print_r() displays information about a variable in a way that\'s readable by humans.',
		signature: '(mixed $expression [, bool $return = false ]): mixed'
	},
	memory_get_usage: {
		description: 'Returns the amount of memory, in bytes, that\'s currently being allocated to your PHP script.',
		signature: '([ bool $real_usage = false ]): int'
	},
	memory_get_peak_usage: {
		description: 'Returns the peak of memory, in bytes, that\'s been allocated to your PHP script.',
		signature: '([ bool $real_usage = false ]): int'
	},
	register_shutdown_function: {
		description: 'Registers the function named by function to be executed when script processing is complete or when exit() is called.',
		signature: '(callback $function [, mixed $parameter [, mixed $... ]]): void'
	},
	register_tick_function: {
		description: 'Registers the given function to be executed when a tick is called.',
		signature: '(callback $function [, mixed $arg [, mixed $... ]]): bool'
	},
	unregister_tick_function: {
		description: 'De-registers the function named by function_name so it is no longer executed when a tick is called.',
		signature: '(string $function_name): void'
	},
	highlight_file: {
		description: 'Prints out or returns a syntax highlighted version of the code contained in filename using the colors defined in the built-in syntax highlighter for PHP.',
		signature: '(string $filename [, bool $return = false ]): mixed'
	},
	show_source: {
		description: 'Alias of highlight_file php_strip_whitespace sleep Misc. Functions PHP Manual show_source (PHP 4, PHP 5)',
	},
	highlight_string: {
		description: 'Outputs or returns a syntax highlighted version of the given PHP code using the colors defined in the built-in syntax highlighter for PHP.',
		signature: '(string $str [, bool $return = false ]): mixed'
	},
	php_strip_whitespace: {
		description: 'Returns the PHP source code in filename with PHP comments and whitespace removed. This may be useful for determining the amount of actual code in your scripts compared with the amount of comments. This is similar to using php -w from the commandline.',
		signature: '(string $filename): string'
	},
	ini_get: {
		description: 'Returns the value of the configuration option on success.',
		signature: '(string $varname): string'
	},
	ini_get_all: {
		description: 'Returns all the registered configuration options.',
		signature: '([ string $extension [, bool $details = true ]]): array'
	},
	ini_set: {
		description: 'Sets the value of the given configuration option. The configuration option will keep this new value during the script\'s execution, and will be restored at the script\'s ending.',
		signature: '(string $varname , string $newvalue): string'
	},
	ini_alter: {
		description: 'Alias of ini_set getrusage ini_get_all PHP Options/Info Functions PHP Manual ini_alter (PHP 4, PHP 5)',
	},
	ini_restore: {
		description: 'Restores a given configuration option to its original value.',
		signature: '(string $varname): void'
	},
	get_include_path: {
		description: 'Gets the current include_path configuration option value.',
		signature: '(void): string'
	},
	set_include_path: {
		description: 'Sets the include_path configuration option for the duration of the script.',
		signature: '(string $new_include_path): string'
	},
	restore_include_path: {
		description: 'Restores the include_path configuration option back to its original master value as set in php.ini',
		signature: '(void): void'
	},
	setcookie: {
		description: 'setcookie() defines a cookie to be sent along with the rest of the HTTP headers. Like other headers, cookies must be sent before any output from your script (this is a protocol restriction). This requires that you place calls to this function prior to any output, including <html> and <head> tags as well as any whitespace.',
		signature: '(string $name [, string $value [, int $expire = 0 [, string $path [, string $domain [, bool $secure = false [, bool $httponly = false ]]]]]]): bool'
	},
	setrawcookie: {
		description: 'setrawcookie() is exactly the same as setcookie() except that the cookie value will not be automatically urlencoded when sent to the browser.',
		signature: '(string $name [, string $value [, int $expire = 0 [, string $path [, string $domain [, bool $secure = false [, bool $httponly = false ]]]]]]): bool'
	},
	header: {
		description: 'header() is used to send a raw HTTP header. See the HTTP/1.1 specification for more information on HTTP headers.',
		signature: '(string $string [, bool $replace = true [, int $http_response_code ]]): void'
	},
	header_remove: {
		description: 'Removes an HTTP header previously set using header().',
		signature: '([ string $name ]): void'
	},
	headers_sent: {
		description: 'Checks if or where headers have been sent.',
		signature: '([ string &$file [, int &$line ]]): bool'
	},
	headers_list: {
		description: 'headers_list() will return a list of headers to be sent to the browser / client. To determine whether or not these headers have been sent yet, use headers_sent().',
		signature: '(void): array'
	},
	connection_aborted: {
		description: 'Checks whether the client disconnected.',
		signature: '(void): int'
	},
	connection_status: {
		description: 'Gets the connection status bitfield.',
		signature: '(void): int'
	},
	ignore_user_abort: {
		description: 'Sets whether a client disconnect should cause a script to be aborted.',
		signature: '([ string $value ]): int'
	},
	parse_ini_file: {
		description: 'parse_ini_file() loads in the ini file specified in filename, and returns the settings in it in an associative array.',
		signature: '(string $filename [, bool $process_sections = false [, int $scanner_mode = INI_SCANNER_NORMAL ]]): array'
	},
	parse_ini_string: {
		description: 'parse_ini_string() returns the settings in string ini in an associative array.',
		signature: '(string $ini [, bool $process_sections = false [, int $scanner_mode = INI_SCANNER_NORMAL ]]): array'
	},
	is_uploaded_file: {
		description: 'Returns TRUE if the file named by filename was uploaded via HTTP POST. This is useful to help ensure that a malicious user hasn\'t tried to trick the script into working on files upon which it should not be working--for instance, /etc/passwd.',
		signature: '(string $filename): bool'
	},
	move_uploaded_file: {
		description: 'This function checks to ensure that the file designated by filename is a valid upload file (meaning that it was uploaded via PHP\'s HTTP POST upload mechanism). If the file is valid, it will be moved to the filename given by destination.',
		signature: '(string $filename , string $destination): bool'
	},
	gethostbyaddr: {
		description: 'Returns the host name of the Internet host specified by ip_address.',
		signature: '(string $ip_address): string'
	},
	gethostbyname: {
		description: 'Returns the IPv4 address of the Internet host specified by hostname.',
		signature: '(string $hostname): string'
	},
	gethostbynamel: {
		description: 'Returns a list of IPv4 addresses to which the Internet host specified by hostname resolves.',
		signature: '(string $hostname): array'
	},
	gethostname: {
		description: 'gethostname() gets the standard host name for the local machine.',
		signature: '(void): string'
	},
	dns_check_record: {
		description: 'Alias of checkdnsrr define_syslog_variables dns_get_mx Network Functions PHP Manual dns_check_record (PHP 5)',
	},
	checkdnsrr: {
		description: 'Searches DNS for records of type type corresponding to host.',
		signature: '(string $host [, string $type = \"MX\" ]): bool'
	},
	dns_get_mx: {
		description: 'Alias of getmxrr dns_check_record dns_get_record Network Functions PHP Manual dns_get_mx (PHP 5)',
	},
	getmxrr: {
		description: 'Searches DNS for MX records corresponding to hostname.',
		signature: '(string $hostname , array &$mxhosts [, array &$weight ]): bool'
	},
	dns_get_record: {
		description: 'Fetch DNS Resource Records associated with the given hostname.',
		signature: '(string $hostname [, int $type = DNS_ANY [, array &$authns [, array &$addtl ]]]): array'
	},
	intval: {
		description: 'Returns the integer value of var, using the specified base for the conversion (the default is base 10). intval() should not be used on objects, as doing so will emit an E_NOTICE level error and return 1.',
		signature: '(mixed $var [, int $base = 10 ]): int'
	},
	floatval: {
		description: 'Gets the float value of var.',
		signature: '(mixed $var): float'
	},
	doubleval: {
		description: 'Alias of floatval debug_zval_dump empty Variable handling Functions PHP Manual doubleval (PHP 4, PHP 5)',
	},
	strval: {
		description: 'Get the string value of a variable. See the documentation on string for more information on converting to string.',
		signature: '(mixed $var): string'
	},
	gettype: {
		description: 'Returns the type of the PHP variable var.',
		signature: '(mixed $var): string'
	},
	settype: {
		description: 'Set the type of variable var to type.',
		signature: '(mixed &$var , string $type): bool'
	},
	is_null: {
		description: 'Finds whether the given variable is NULL.',
		signature: '(mixed $var): bool'
	},
	is_resource: {
		description: 'Finds whether the given variable is a resource.',
		signature: '(mixed $var): bool'
	},
	is_bool: {
		description: 'Finds whether the given variable is a boolean.',
		signature: '(mixed $var): bool'
	},
	is_long: {
		description: 'Alias of is_int is_integer is_null Variable handling Functions PHP Manual is_long (PHP 4, PHP 5)',
	},
	is_float: {
		description: 'Finds whether the type of the given variable is float.',
		signature: '(mixed $var): bool'
	},
	is_int: {
		description: 'Finds whether the type of the given variable is integer.',
		signature: '(mixed $var): bool'
	},
	is_integer: {
		description: 'Alias of is_int is_int is_long Variable handling Functions PHP Manual is_integer (PHP 4, PHP 5)',
	},
	is_double: {
		description: 'Alias of is_float is_callable is_float Variable handling Functions PHP Manual is_double (PHP 4, PHP 5)',
	},
	is_real: {
		description: 'Alias of is_float is_object is_resource Variable handling Functions PHP Manual is_real (PHP 4, PHP 5)',
	},
	is_numeric: {
		description: 'Finds whether the given variable is numeric. Numeric strings consist of optional sign, any number of digits, optional decimal part and optional exponential part. Thus +0123.45e6 is a valid numeric value. Hexadecimal notation (0xFF) is allowed too but only without sign, decimal and exponential part.',
		signature: '(mixed $var): bool'
	},
	is_string: {
		description: 'Finds whether the type given variable is string.',
		signature: '(mixed $var): bool'
	},
	is_array: {
		description: 'Finds whether the given variable is an array.',
		signature: '(mixed $var): bool'
	},
	is_object: {
		description: 'Finds whether the given variable is an object.',
		signature: '(mixed $var): bool'
	},
	is_scalar: {
		description: 'Finds whether the given variable is a scalar.',
		signature: '(mixed $var): bool'
	},
	is_callable: {
		description: 'Verify that the contents of a variable can be called as a function. This can check that a simple variable contains the name of a valid function, or that an array contains a properly encoded object and function name.',
		signature: '(callback $name [, bool $syntax_only = false [, string &$callable_name ]]): bool'
	},
	pclose: {
		description: 'Closes a file pointer to a pipe opened by popen().',
		signature: '(resource $handle): int'
	},
	popen: {
		description: 'Opens a pipe to a process executed by forking the command given by command.',
		signature: '(string $command , string $mode): resource'
	},
	readfile: {
		description: 'Reads a file and writes it to the output buffer.',
		signature: '(string $filename [, bool $use_include_path = false [, resource $context ]]): int'
	},
	rewind: {
		description: 'Sets the file position indicator for handle to the beginning of the file stream.',
		signature: '(resource $handle): bool'
	},
	rmdir: {
		description: 'Attempts to remove the directory named by dirname. The directory must be empty, and the relevant permissions must permit this. A E_WARNING level error will be generated on failure.',
		signature: '(string $dirname [, resource $context ]): bool'
	},
	umask: {
		description: 'umask() sets PHP\'s umask to mask & 0777 and returns the old umask. When PHP is being used as a server module, the umask is restored when each request is finished.',
		signature: '([ int $mask ]): int'
	},
	fclose: {
		description: 'The file pointed to by handle is closed.',
		signature: '(resource $handle): bool'
	},
	feof: {
		description: 'Tests for end-of-file on a file pointer.',
		signature: '(resource $handle): bool'
	},
	fgetc: {
		description: 'Gets a character from the given file pointer.',
		signature: '(resource $handle): string'
	},
	fgets: {
		description: 'Gets a line from file pointer.',
		signature: '(resource $handle [, int $length ]): string'
	},
	fgetss: {
		description: 'Identical to fgets(), except that fgetss() attempts to strip any NUL bytes, HTML and PHP tags from the text it reads.',
		signature: '(resource $handle [, int $length [, string $allowable_tags ]]): string'
	},
	fread: {
		description: 'fread() reads up to length bytes from the file pointer referenced by handle. Reading stops as soon as one of the following conditions is met: length bytes have been read EOF (end of file) is reached a packet becomes available or the socket timeout occurs (for network streams) if the stream is read buffered and it does not represent a plain file, at most one read of up to a number of bytes equal to the chunk size (usually 8192) is made; depending on the previously buffered data, the size of the returned data may be larger than the chunk size.',
		signature: '(resource $handle , int $length): string'
	},
	fopen: {
		description: 'fopen() binds a named resource, specified by filename, to a stream.',
		signature: '(string $filename , string $mode [, bool $use_include_path = false [, resource $context ]]): resource'
	},
	fpassthru: {
		description: 'Reads to EOF on the given file pointer from the current position and writes the results to the output buffer.',
		signature: '(resource $handle): int'
	},
	ftruncate: {
		description: 'Takes the filepointer, handle, and truncates the file to length, size.',
		signature: '(resource $handle , int $size): bool'
	},
	fstat: {
		description: 'Gathers the statistics of the file opened by the file pointer handle. This function is similar to the stat() function except that it operates on an open file pointer instead of a filename.',
		signature: '(resource $handle): array'
	},
	fseek: {
		description: 'Sets the file position indicator for the file referenced by handle. The new position, measured in bytes from the beginning of the file, is obtained by adding offset to the position specified by whence.',
		signature: '(resource $handle , int $offset [, int $whence = SEEK_SET ]): int'
	},
	ftell: {
		description: 'Returns the position of the file pointer referenced by handle.',
		signature: '(resource $handle): int'
	},
	fflush: {
		description: 'This function forces a write of all buffered output to the resource pointed to by the file handle.',
		signature: '(resource $handle): bool'
	},
	fwrite: {
		description: 'fwrite() writes the contents of string to the file stream pointed to by handle.',
		signature: '(resource $handle , string $string [, int $length ]): int'
	},
	fputs: {
		description: 'Alias of fwrite fputcsv fread Filesystem Functions PHP Manual fputs (PHP 4, PHP 5)',
	},
	mkdir: {
		description: 'Attempts to create the directory specified by pathname.',
		signature: '(string $pathname [, int $mode = 0777 [, bool $recursive = false [, resource $context ]]]): bool'
	},
	rename: {
		description: 'Attempts to rename oldname to newname.',
		signature: '(string $oldname , string $newname [, resource $context ]): bool'
	},
	copy: {
		description: 'Makes a copy of the file source to dest.',
		signature: '(string $source , string $dest [, resource $context ]): bool'
	},
	tempnam: {
		description: 'Creates a file with a unique filename, with access permission set to 0600, in the specified directory. If the directory does not exist, tempnam() may generate a file in the system\'s temporary directory, and return the name of that.',
		signature: '(string $dir , string $prefix): string'
	},
	tmpfile: {
		description: 'Creates a temporary file with a unique name in read-write (w+) mode and returns a file handle .',
		signature: '(void): resource'
	},
	file: {
		description: 'Reads an entire file into an array.',
		signature: '(string $filename [, int $flags = 0 [, resource $context ]]): array'
	},
	file_get_contents: {
		description: 'This function is similar to file(), except that file_get_contents() returns the file in a string, starting at the specified offset up to maxlen bytes. On failure, file_get_contents() will return FALSE.',
		signature: '(string $filename [, bool $use_include_path = false [, resource $context [, int $offset = -1 [, int $maxlen ]]]]): string'
	},
	file_put_contents: {
		description: 'This function is identical to calling fopen(), fwrite() and fclose() successively to write data to a file.',
		signature: '(string $filename , mixed $data [, int $flags = 0 [, resource $context ]]): int'
	},
	stream_select: {
		description: 'The stream_select() function accepts arrays of streams and waits for them to change status. Its operation is equivalent to that of the socket_select() function except in that it acts on streams.',
		signature: '(array &$read , array &$write , array &$except , int $tv_sec [, int $tv_usec = 0 ]): int'
	},
	stream_context_create: {
		description: 'Creates and returns a stream context with any options supplied in options preset.',
		signature: '([ array $options [, array $params ]]): resource'
	},
	stream_context_set_params: {
		description: 'Sets parameters on the specified context.',
		signature: '(resource $stream_or_context , array $params): bool'
	},
	stream_context_get_params: {
		description: 'Retrieves parameter and options information from the stream or context.',
		signature: '(resource $stream_or_context): array'
	},
	stream_context_set_option: {
		description: 'Sets an option on the specified context. value is set to option for wrapper',
		signature: '(resource $stream_or_context , string $wrapper , string $option , mixed $value): bool'
	},
	stream_context_get_options: {
		description: 'Returns an array of options on the specified stream or context.',
		signature: '(resource $stream_or_context): array'
	},
	stream_context_get_default: {
		description: 'Returns the default stream context which is used whenever file operations (fopen(), file_get_contents(), etc...) are called without a context parameter. Options for the default context can optionally be specified with this function using the same syntax as stream_context_create().',
		signature: '([ array $options ]): resource'
	},
	stream_context_set_default: {
		description: 'Set the default stream context which will be used whenever file operations (fopen(), file_get_contents(), etc...) are called without a context parameter. Uses the same syntax as stream_context_create().',
		signature: '(array $options): resource'
	},
	stream_filter_prepend: {
		description: 'Adds filtername to the list of filters attached to stream.',
		signature: '(resource $stream , string $filtername [, int $read_write [, mixed $params ]]): resource'
	},
	stream_filter_append: {
		description: 'Adds filtername to the list of filters attached to stream.',
		signature: '(resource $stream , string $filtername [, int $read_write [, mixed $params ]]): resource'
	},
	stream_filter_remove: {
		description: 'Removes a stream filter previously added to a stream with stream_filter_prepend() or stream_filter_append(). Any data remaining in the filter\'s internal buffer will be flushed through to the next filter before removing it.',
		signature: '(resource $stream_filter): bool'
	},
	stream_socket_client: {
		description: 'Initiates a stream or datagram connection to the destination specified by remote_socket. The type of socket created is determined by the transport specified using standard URL formatting: transport://target. For Internet Domain sockets (AF_INET) such as TCP and UDP, the target portion of the remote_socket parameter should consist of a hostname or IP address followed by a colon and a port number. For Unix domain sockets, the target portion should point to the socket file on the filesystem.',
		signature: '(string $remote_socket [, int &$errno [, string &$errstr [, float $timeout = ini_get(\"default_socket_timeout\") [, int $flags = STREAM_CLIENT_CONNECT [, resource $context ]]]]]): resource'
	},
	stream_socket_server: {
		description: 'Creates a stream or datagram socket on the specified local_socket.',
		signature: '(string $local_socket [, int &$errno [, string &$errstr [, int $flags = STREAM_SERVER_BIND | STREAM_SERVER_LISTEN [, resource $context ]]]]): resource'
	},
	stream_socket_accept: {
		description: 'Accept a connection on a socket previously created by stream_socket_server().',
		signature: '(resource $server_socket [, float $timeout = ini_get(\"default_socket_timeout\") [, string &$peername ]]): resource'
	},
	stream_socket_get_name: {
		description: 'Returns the local or remote name of a given socket connection.',
		signature: '(resource $handle , bool $want_peer): string'
	},
	stream_socket_recvfrom: {
		description: 'stream_socket_recvfrom() accepts data from a remote socket up to length bytes.',
		signature: '(resource $socket , int $length [, int $flags = 0 [, string &$address ]]): string'
	},
	stream_socket_sendto: {
		description: 'Sends the specified data through the socket.',
		signature: '(resource $socket , string $data [, int $flags = 0 [, string $address ]]): int'
	},
	stream_socket_enable_crypto: {
		description: 'Enable or disable encryption on the stream.',
		signature: '(resource $stream , bool $enable [, int $crypto_type [, resource $session_stream ]]): mixed'
	},
	stream_socket_shutdown: {
		description: 'Shutdowns (partially or not) a full-duplex connection.',
		signature: '(resource $stream , int $how): bool'
	},
	stream_socket_pair: {
		description: 'stream_socket_pair() creates a pair of connected, indistinguishable socket streams. This function is commonly used in IPC (Inter-Process Communication).',
		signature: '(int $domain , int $type , int $protocol): array'
	},
	stream_copy_to_stream: {
		description: 'Makes a copy of up to maxlength bytes of data from the current position (or from the offset position, if specified) in source to dest. If maxlength is not specified, all remaining content in source will be copied.',
		signature: '(resource $source , resource $dest [, int $maxlength = -1 [, int $offset = 0 ]]): int'
	},
	stream_get_contents: {
		description: 'Identical to file_get_contents(), except that stream_get_contents() operates on an already open stream resource and returns the remaining contents in a string, up to maxlength bytes and starting at the specified offset.',
		signature: '(resource $handle [, int $maxlength = -1 [, int $offset = -1 ]]): string'
	},
	stream_supports_lock: {
		description: 'Tells whether the stream supports locking through flock().',
		signature: '(resource $stream): bool'
	},
	fgetcsv: {
		description: 'Similar to fgets() except that fgetcsv() parses the line it reads for fields in CSV format and returns an array containing the fields read.',
		signature: '(resource $handle [, int $length = 0 [, string $delimiter = \',\' [, string $enclosure = \'\"\' [, string $escape = \'\\\\\' ]]]]): array'
	},
	fputcsv: {
		description: 'fputcsv() formats a line (passed as a fields array) as CSV and write it (terminated by a newline) to the specified file handle.',
		signature: '(resource $handle , array $fields [, string $delimiter = \',\' [, string $enclosure = \'\"\' ]]): int'
	},
	flock: {
		description: 'flock() allows you to perform a simple reader/writer model which can be used on virtually every platform (including most Unix derivatives and even Windows).',
		signature: '(resource $handle , int $operation [, int &$wouldblock ]): bool'
	},
	get_meta_tags: {
		description: 'Opens filename and parses it line by line for <meta> tags in the file. The parsing stops at </head>.',
		signature: '(string $filename [, bool $use_include_path = false ]): array'
	},
	stream_set_read_buffer: {
		description: 'Sets the read buffer. It\'s the equivalent of stream_set_write_buffer(), but for read operations.',
		signature: '(resource $stream , int $buffer): int'
	},
	stream_set_write_buffer: {
		description: 'Sets the buffering for write operations on the given stream to buffer bytes.',
		signature: '(resource $stream , int $buffer): int'
	},
	set_file_buffer: {
		description: 'Alias of stream_set_write_buffer rmdir stat Filesystem Functions PHP Manual set_file_buffer (PHP 4, PHP 5)',
	},
	set_socket_blocking: {
		description: 'Alias of stream_set_blocking Stream Functions stream_bucket_append Stream Functions PHP Manual set_socket_blocking (PHP 4, PHP 5)',
	},
	stream_set_blocking: {
		description: 'Sets blocking or non-blocking mode on a stream.',
		signature: '(resource $stream , int $mode): bool'
	},
	socket_set_blocking: {
		description: 'Alias of stream_set_blocking socket_get_status socket_set_timeout Network Functions PHP Manual socket_set_blocking (PHP 4, PHP 5)',
	},
	stream_get_meta_data: {
		description: 'Returns information about an existing stream.',
		signature: '(resource $stream): array'
	},
	stream_get_line: {
		description: 'Gets a line from the given handle.',
		signature: '(resource $handle , int $length [, string $ending ]): string'
	},
	stream_wrapper_register: {
		description: 'Allows you to implement your own protocol handlers and streams for use with all the other filesystem functions (such as fopen(), fread() etc.).',
		signature: '(string $protocol , string $classname [, int $flags = 0 ]): bool'
	},
	stream_register_wrapper: {
		description: 'Alias of stream_wrapper_register stream_notification_callback stream_resolve_include_path Stream Functions PHP Manual stream_register_wrapper (PHP 4 >= 4.3.0, PHP 5)',
	},
	stream_wrapper_unregister: {
		description: 'Allows you to disable an already defined stream wrapper. Once the wrapper has been disabled you may override it with a user-defined wrapper using stream_wrapper_register() or reenable it later on with stream_wrapper_restore().',
		signature: '(string $protocol): bool'
	},
	stream_wrapper_restore: {
		description: 'Restores a built-in wrapper previously unregistered with stream_wrapper_unregister().',
		signature: '(string $protocol): bool'
	},
	stream_get_wrappers: {
		description: 'Retrieve list of registered streams available on the running system.',
		signature: '(void): array'
	},
	stream_get_transports: {
		description: 'Returns an indexed array containing the name of all socket transports available on the running system.',
		signature: '(void): array'
	},
	stream_resolve_include_path: {
		description: 'Resolve filename against the include path according to the same rules as fopen()/include().',
		signature: '(string $filename): string'
	},
	stream_is_local: {
		description: 'Checks if a stream, or a URL, is a local one or not.',
		signature: '(mixed $stream_or_url): bool'
	},
	get_headers: {
		description: 'get_headers() returns an array with the headers sent by the server in response to a HTTP request.',
		signature: '(string $url [, int $format = 0 ]): array'
	},
	stream_set_timeout: {
		description: 'Sets the timeout value on stream, expressed in the sum of seconds and microseconds.',
		signature: '(resource $stream , int $seconds [, int $microseconds = 0 ]): bool'
	},
	socket_set_timeout: {
		description: 'Alias of stream_set_timeout socket_set_blocking syslog Network Functions PHP Manual socket_set_timeout (PHP 4, PHP 5)',
	},
	socket_get_status: {
		description: 'Alias of stream_get_meta_data setrawcookie socket_set_blocking Network Functions PHP Manual socket_get_status (PHP 4, PHP 5)',
	},
	realpath: {
		description: 'realpath() expands all symbolic links and resolves references to \'/./\', \'/../\' and extra \'/\' characters in the input path and return the canonicalized absolute pathname.',
		signature: '(string $path): string'
	},
	fnmatch: {
		description: 'fnmatch() checks if the passed string would match the given shell wildcard pattern.',
		signature: '(string $pattern , string $string [, int $flags = 0 ]): bool'
	},
	fsockopen: {
		description: 'Initiates a socket connection to the resource specified by hostname.',
		signature: '(string $hostname [, int $port = -1 [, int &$errno [, string &$errstr [, float $timeout = ini_get(\"default_socket_timeout\") ]]]]): resource'
	},
	pfsockopen: {
		description: 'This function behaves exactly as fsockopen() with the difference that the connection is not closed after the script finishes. It is the persistent version of fsockopen().',
		signature: '(string $hostname [, int $port = -1 [, int &$errno [, string &$errstr [, float $timeout = ini_get(\"default_socket_timeout\") ]]]]): resource'
	},
	pack: {
		description: 'Pack given arguments into binary string according to format.',
		signature: '(string $format [, mixed $args [, mixed $... ]]): string'
	},
	unpack: {
		description: 'Unpacks from a binary string into an array according to the given format.',
		signature: '(string $format , string $data): array'
	},
	get_browser: {
		description: 'Attempts to determine the capabilities of the user\'s browser, by looking up the browser\'s information in the browscap.ini file.',
		signature: '([ string $user_agent [, bool $return_array = false ]]): mixed'
	},
	crypt: {
		description: 'crypt() will return a hashed string using the standard Unix DES-based algorithm or alternative algorithms that may be available on the system.',
		signature: '(string $str [, string $salt ]): string'
	},
	opendir: {
		description: 'Opens up a directory handle to be used in subsequent closedir(), readdir(), and rewinddir() calls.',
		signature: '(string $path [, resource $context ]): resource'
	},
	closedir: {
		description: 'Closes the directory stream indicated by dir_handle. The stream must have previously been opened by opendir().',
		signature: '([ resource $dir_handle ]): void'
	},
	chdir: {
		description: 'Changes PHP\'s current directory to directory.',
		signature: '(string $directory): bool'
	},
	getcwd: {
		description: 'Gets the current working directory.',
		signature: '(void): string'
	},
	rewinddir: {
		description: 'Resets the directory stream indicated by dir_handle to the beginning of the directory.',
		signature: '([ resource $dir_handle ]): void'
	},
	readdir: {
		description: 'Returns the filename of the next file from the directory. The filenames are returned in the order in which they are stored by the filesystem.',
		signature: '([ resource $dir_handle ]): string'
	},
	scandir: {
		description: 'Returns an array of files and directories from the directory.',
		signature: '(string $directory [, int $sorting_order = 0 [, resource $context ]]): array'
	},
	glob: {
		description: 'The glob() function searches for all the pathnames matching pattern according to the rules used by the libc glob() function, which is similar to the rules used by common shells.',
		signature: '(string $pattern [, int $flags = 0 ]): array'
	},
	fileatime: {
		description: 'Gets the last access time of the given file.',
		signature: '(string $filename): int'
	},
	filectime: {
		description: 'Gets the inode change time of a file.',
		signature: '(string $filename): int'
	},
	filegroup: {
		description: 'Gets the file group. The group ID is returned in numerical format, use posix_getgrgid() to resolve it to a group name.',
		signature: '(string $filename): int'
	},
	fileinode: {
		description: 'Gets the file inode.',
		signature: '(string $filename): int'
	},
	filemtime: {
		description: 'This function returns the time when the data blocks of a file were being written to, that is, the time when the content of the file was changed.',
		signature: '(string $filename): int'
	},
	fileowner: {
		description: 'Gets the file owner.',
		signature: '(string $filename): int'
	},
	fileperms: {
		description: 'Gets permissions for the given file.',
		signature: '(string $filename): int'
	},
	filesize: {
		description: 'Gets the size for the given file.',
		signature: '(string $filename): int'
	},
	filetype: {
		description: 'Returns the type of the given file.',
		signature: '(string $filename): string'
	},
	file_exists: {
		description: 'Checks whether a file or directory exists.',
		signature: '(string $filename): bool'
	},
	is_writable: {
		description: 'Returns TRUE if the filename exists and is writable. The filename argument may be a directory name allowing you to check if a directory is writable.',
		signature: '(string $filename): bool'
	},
	is_writeable: {
		description: 'Alias of is_writable is_writable lchgrp Filesystem Functions PHP Manual is_writeable (PHP 4, PHP 5)',
	},
	is_readable: {
		description: 'Tells whether a file exists and is readable.',
		signature: '(string $filename): bool'
	},
	is_executable: {
		description: 'Tells whether the filename is executable.',
		signature: '(string $filename): bool'
	},
	is_file: {
		description: 'Tells whether the given file is a regular file.',
		signature: '(string $filename): bool'
	},
	is_dir: {
		description: 'Tells whether the given filename is a directory.',
		signature: '(string $filename): bool'
	},
	is_link: {
		description: 'Tells whether the given file is a symbolic link.',
		signature: '(string $filename): bool'
	},
	stat: {
		description: 'Gathers the statistics of the file named by filename. If filename is a symbolic link, statistics are from the file itself, not the symlink.',
		signature: '(string $filename): array'
	},
	lstat: {
		description: 'Gathers the statistics of the file or symbolic link named by filename.',
		signature: '(string $filename): array'
	},
	chown: {
		description: 'Attempts to change the owner of the file filename to user user. Only the superuser may change the owner of a file.',
		signature: '(string $filename , mixed $user): bool'
	},
	chgrp: {
		description: 'Attempts to change the group of the file filename to group.',
		signature: '(string $filename , mixed $group): bool'
	},
	chmod: {
		description: 'Attempts to change the mode of the specified file to that given in mode.',
		signature: '(string $filename , int $mode): bool'
	},
	touch: {
		description: 'Attempts to set the access and modification times of the file named in the filename parameter to the value given in time. Note that the access time is always modified, regardless of the number of parameters.',
		signature: '(string $filename [, int $time = time() [, int $atime ]]): bool'
	},
	clearstatcache: {
		description: 'When you use stat(), lstat(), or any of the other functions listed in the affected functions list (below), PHP caches the information those functions return in order to provide faster performance. However, in certain cases, you may want to clear the cached information. For instance, if the same file is being checked multiple times within a single script, and that file is in danger of being removed or changed during that script\'s operation, you may elect to clear the status cache. In these cases, you can use the clearstatcache() function to clear the information that PHP caches about a file.',
		signature: '([ bool $clear_realpath_cache = false [, string $filename ]]): void'
	},
	disk_total_space: {
		description: 'Given a string containing a directory, this function will return the total number of bytes on the corresponding filesystem or disk partition.',
		signature: '(string $directory): float'
	},
	disk_free_space: {
		description: 'Given a string containing a directory, this function will return the number of bytes available on the corresponding filesystem or disk partition.',
		signature: '(string $directory): float'
	},
	diskfreespace: {
		description: 'Alias of disk_free_space disk_total_space fclose Filesystem Functions PHP Manual diskfreespace (PHP 4, PHP 5)',
	},
	mail: {
		description: 'Sends an email.',
		signature: '(string $to , string $subject , string $message [, string $additional_headers [, string $additional_parameters ]]): bool'
	},
	ezmlm_hash: {
		description: 'ezmlm_hash() calculates the hash value needed when keeping EZMLM mailing lists in a MySQL database.',
		signature: '(string $addr): int'
	},
	openlog: {
		description: 'openlog() opens a connection to the system logger for a program.',
		signature: '(string $ident , int $option , int $facility): bool'
	},
	syslog: {
		description: 'syslog() generates a log message that will be distributed by the system logger.',
		signature: '(int $priority , string $message): bool'
	},
	closelog: {
		description: 'closelog() closes the descriptor being used to write to the system logger. The use of closelog() is optional.',
		signature: '(void): bool'
	},
	define_syslog_variables: {
		description: 'Initializes all variables used in the syslog functions.',
		signature: '(void): void'
	},
	lcg_value: {
		description: 'lcg_value() returns a pseudo random number in the range of (0, 1). The function combines two CGs with periods of 2^31 - 85 and 2^31 - 249. The period of this function is equal to the product of both primes.',
		signature: '(void): float'
	},
	metaphone: {
		description: 'Calculates the metaphone key of str.',
		signature: '(string $str [, int $phonemes = 0 ]): string'
	},
	ob_start: {
		description: 'This function will turn output buffering on. While output buffering is active no output is sent from the script (other than headers), instead the output is stored in an internal buffer.',
		signature: '([ callback $output_callback [, int $chunk_size = 0 [, bool $erase = true ]]]): bool'
	},
	ob_flush: {
		description: 'This function will send the contents of the output buffer (if any). If you want to further process the buffer\'s contents you have to call ob_get_contents() before ob_flush() as the buffer contents are discarded after ob_flush() is called.',
		signature: '(void): void'
	},
	ob_clean: {
		description: 'This function discards the contents of the output buffer.',
		signature: '(void): void'
	},
	ob_end_flush: {
		description: 'This function will send the contents of the topmost output buffer (if any) and turn this output buffer off. If you want to further process the buffer\'s contents you have to call ob_get_contents() before ob_end_flush() as the buffer contents are discarded after ob_end_flush() is called.',
		signature: '(void): bool'
	},
	ob_end_clean: {
		description: 'This function discards the contents of the topmost output buffer and turns off this output buffering. If you want to further process the buffer\'s contents you have to call ob_get_contents() before ob_end_clean() as the buffer contents are discarded when ob_end_clean() is called.',
		signature: '(void): bool'
	},
	ob_get_flush: {
		description: 'ob_get_flush() flushes the output buffer, return it as a string and turns off output buffering.',
		signature: '(void): string'
	},
	ob_get_clean: {
		description: 'Gets the current buffer contents and delete current output buffer.',
		signature: '(void): string'
	},
	ob_get_length: {
		description: 'This will return the length of the contents in the output buffer.',
		signature: '(void): int'
	},
	ob_get_level: {
		description: 'Returns the nesting level of the output buffering mechanism.',
		signature: '(void): int'
	},
	ob_get_status: {
		description: 'ob_get_status() returns status information on either the top level output buffer or all active output buffer levels if full_status is set to TRUE.',
		signature: '([ bool $full_status = FALSE ]): array'
	},
	ob_get_contents: {
		description: 'Gets the contents of the output buffer without clearing it.',
		signature: '(void): string'
	},
	ob_implicit_flush: {
		description: 'ob_implicit_flush() will turn implicit flushing on or off. Implicit flushing will result in a flush operation after every output call, so that explicit calls to flush() will no longer be needed.',
		signature: '([ int $flag = true ]): void'
	},
	ob_list_handlers: {
		description: 'Lists all output handlers in use.',
		signature: '(void): array'
	},
	ksort: {
		description: 'Sorts an array by key, maintaining key to data correlations. This is useful mainly for associative arrays.',
		signature: '(array &$array [, int $sort_flags = SORT_REGULAR ]): bool'
	},
	krsort: {
		description: 'Sorts an array by key in reverse order, maintaining key to data correlations. This is useful mainly for associative arrays.',
		signature: '(array &$array [, int $sort_flags = SORT_REGULAR ]): bool'
	},
	natsort: {
		description: 'This function implements a sort algorithm that orders alphanumeric strings in the way a human being would while maintaining key/value associations. This is described as a \"natural ordering\". An example of the difference between this algorithm and the regular computer string sorting algorithms (used in sort()) can be seen in the example below.',
		signature: '(array &$array): bool'
	},
	natcasesort: {
		description: 'natcasesort() is a case insensitive version of natsort().',
		signature: '(array &$array): bool'
	},
	asort: {
		description: 'This function sorts an array such that array indices maintain their correlation with the array elements they are associated with. This is used mainly when sorting associative arrays where the actual element order is significant.',
		signature: '(array &$array [, int $sort_flags = SORT_REGULAR ]): bool'
	},
	arsort: {
		description: 'This function sorts an array such that array indices maintain their correlation with the array elements they are associated with.',
		signature: '(array &$array [, int $sort_flags = SORT_REGULAR ]): bool'
	},
	sort: {
		description: 'This function sorts an array. Elements will be arranged from lowest to highest when this function has completed.',
		signature: '(array &$array [, int $sort_flags = SORT_REGULAR ]): bool'
	},
	rsort: {
		description: 'This function sorts an array in reverse order (highest to lowest).',
		signature: '(array &$array [, int $sort_flags = SORT_REGULAR ]): bool'
	},
	usort: {
		description: 'This function will sort an array by its values using a user-supplied comparison function. If the array you wish to sort needs to be sorted by some non-trivial criteria, you should use this function.',
		signature: '(array &$array , callback $cmp_function): bool'
	},
	uasort: {
		description: 'This function sorts an array such that array indices maintain their correlation with the array elements they are associated with, using a user-defined comparison function.',
		signature: '(array &$array , callback $cmp_function): bool'
	},
	uksort: {
		description: 'uksort() will sort the keys of an array using a user-supplied comparison function. If the array you wish to sort needs to be sorted by some non-trivial criteria, you should use this function.',
		signature: '(array &$array , callback $cmp_function): bool'
	},
	shuffle: {
		description: 'This function shuffles (randomizes the order of the elements in) an array.',
		signature: '(array &$array): bool'
	},
	array_walk: {
		description: 'Applies the user-defined function funcname to each element of the array array.',
		signature: '(array &$array , callback $funcname [, mixed $userdata ]): bool'
	},
	array_walk_recursive: {
		description: 'Applies the user-defined function funcname to each element of the input array. This function will recur into deeper arrays.',
		signature: '(array &$input , callback $funcname [, mixed $userdata ]): bool'
	},
	count: {
		description: 'Counts all elements in an array, or something in an object.',
		signature: '(mixed $var [, int $mode = COUNT_NORMAL ]): int'
	},
	end: {
		description: 'end() advances array\'s internal pointer to the last element, and returns its value.',
		signature: '(array &$array): mixed'
	},
	prev: {
		description: 'Rewind the internal array pointer.',
		signature: '(array &$array): mixed'
	},
	next: {
		description: 'next() behaves like current(), with one difference. It advances the internal array pointer one place forward before returning the element value. That means it returns the next array value and advances the internal array pointer by one.',
		signature: '(array &$array): mixed'
	},
	reset: {
		description: 'reset() rewinds array\'s internal pointer to the first element and returns the value of the first array element.',
		signature: '(array &$array): mixed'
	},
	current: {
		description: 'Every array has an internal pointer to its \"current\" element, which is initialized to the first element inserted into the array.',
		signature: '(array &$array): mixed'
	},
	key: {
		description: 'key() returns the index element of the current array position.',
		signature: '(array &$array): mixed'
	},
	min: {
		description: 'If the first and only parameter is an array, min() returns the lowest value in that array. If at least two parameters are provided, min() returns the smallest of these values.',
		signature: '(array $values): mixed'
	},
	max: {
		description: 'If the first and only parameter is an array, max() returns the highest value in that array. If at least two parameters are provided, max() returns the biggest of these values.',
		signature: '(array $values): mixed'
	},
	in_array: {
		description: 'Searches haystack for needle using loose comparison unless strict is set.',
		signature: '(mixed $needle , array $haystack [, bool $strict = FALSE ]): bool'
	},
	array_search: {
		description: 'Searches haystack for needle.',
		signature: '(mixed $needle , array $haystack [, bool $strict = false ]): mixed'
	},
	extract: {
		description: 'Import variables from an array into the current symbol table.',
		signature: '(array &$var_array [, int $extract_type = EXTR_OVERWRITE [, string $prefix ]]): int'
	},
	compact: {
		description: 'Creates an array containing variables and their values.',
		signature: '(mixed $varname [, mixed $... ]): array'
	},
	array_fill: {
		description: 'Fills an array with num entries of the value of the value parameter, keys starting at the start_index parameter.',
		signature: '(int $start_index , int $num , mixed $value): array'
	},
	array_fill_keys: {
		description: 'Fills an array with the value of the value parameter, using the values of the keys array as keys.',
		signature: '(array $keys , mixed $value): array'
	},
	range: {
		description: 'Create an array containing a range of elements.',
		signature: '(mixed $start , mixed $limit [, number $step = 1 ]): array'
	},
	array_multisort: {
		description: 'array_multisort() can be used to sort several arrays at once, or a multi-dimensional array by one or more dimensions.',
		signature: '(array &$arr [, mixed $arg = SORT_ASC [, mixed $arg = SORT_REGULAR [, mixed $... ]]]): bool'
	},
	array_push: {
		description: 'array_push() treats array as a stack, and pushes the passed variables onto the end of array. The length of array increases by the number of variables pushed. Has the same effect as: <?php $array[] = $var;?> repeated for each var.',
		signature: '(array &$array , mixed $var [, mixed $... ]): int'
	},
	array_pop: {
		description: 'array_pop() pops and returns the last value of the array, shortening the array by one element. If array is empty (or is not an array), NULL will be returned. Will additionally produce a Warning when called on a non-array.',
		signature: '(array &$array): mixed'
	},
	array_shift: {
		description: 'array_shift() shifts the first value of the array off and returns it, shortening the array by one element and moving everything down. All numerical array keys will be modified to start counting from zero while literal keys won\'t be touched.',
		signature: '(array &$array): mixed'
	},
	array_unshift: {
		description: 'array_unshift() prepends passed elements to the front of the array. Note that the list of elements is prepended as a whole, so that the prepended elements stay in the same order. All numerical array keys will be modified to start counting from zero while literal keys won\'t be touched.',
		signature: '(array &$array , mixed $var [, mixed $... ]): int'
	},
	array_splice: {
		description: 'Removes the elements designated by offset and length from the input array, and replaces them with the elements of the replacement array, if supplied.',
		signature: '(array &$input , int $offset [, int $length = 0 [, mixed $replacement ]]): array'
	},
	array_slice: {
		description: 'array_slice() returns the sequence of elements from the array array as specified by the offset and length parameters.',
		signature: '(array $array , int $offset [, int $length [, bool $preserve_keys = false ]]): array'
	},
	array_merge: {
		description: 'Merges the elements of one or more arrays together so that the values of one are appended to the end of the previous one. It returns the resulting array.',
		signature: '(array $array1 [, array $... ]): array'
	},
	array_merge_recursive: {
		description: 'array_merge_recursive() merges the elements of one or more arrays together so that the values of one are appended to the end of the previous one. It returns the resulting array.',
		signature: '(array $array1 [, array $... ]): array'
	},
	array_replace: {
		description: 'array_replace() replaces the values of the first array with the same values from all the following arrays. If a key from the first array exists in the second array, its value will be replaced by the value from the second array. If the key exists in the second array, and not the first, it will be created in the first array. If a key only exists in the first array, it will be left as is. If several arrays are passed for replacement, they will be processed in order, the later arrays overwriting the previous values.',
		signature: '(array &$array , array &$array1 [, array &$... ]): array'
	},
	array_replace_recursive: {
		description: 'array_replace_recursive() replaces the values of the first array with the same values from all the following arrays. If a key from the first array exists in the second array, its value will be replaced by the value from the second array. If the key exists in the second array, and not the first, it will be created in the first array. If a key only exists in the first array, it will be left as is. If several arrays are passed for replacement, they will be processed in order, the later array overwriting the previous values.',
		signature: '(array &$array , array &$array1 [, array &$... ]): array'
	},
	array_keys: {
		description: 'array_keys() returns the keys, numeric and string, from the input array.',
		signature: '(array $input [, mixed $search_value [, bool $strict = false ]]): array'
	},
	array_values: {
		description: 'array_values() returns all the values from the input array and indexes numerically the array.',
		signature: '(array $input): array'
	},
	array_count_values: {
		description: 'array_count_values() returns an array using the values of the input array as keys and their frequency in input as values.',
		signature: '(array $input): array'
	},
	array_reverse: {
		description: 'Takes an input array and returns a new array with the order of the elements reversed.',
		signature: '(array $array [, bool $preserve_keys = false ]): array'
	},
	array_reduce: {
		description: 'array_reduce() applies iteratively the function function to the elements of the array input, so as to reduce the array to a single value.',
		signature: '(array $input , callback $function [, mixed $initial = NULL ]): mixed'
	},
	array_pad: {
		description: 'array_pad() returns a copy of the input padded to size specified by pad_size with value pad_value. If pad_size is positive then the array is padded on the right, if it\'s negative then on the left. If the absolute value of pad_size is less than or equal to the length of the input then no padding takes place. It is possible to add most 1048576 elements at a time.',
		signature: '(array $input , int $pad_size , mixed $pad_value): array'
	},
	array_flip: {
		description: 'array_flip() returns an array in flip order, i.e. keys from trans become values and values from trans become keys.',
		signature: '(array $trans): array'
	},
	array_change_key_case: {
		description: 'Returns an array with all keys from input lowercased or uppercased. Numbered indices are left as is.',
		signature: '(array $input [, int $case = CASE_LOWER ]): array'
	},
	array_rand: {
		description: 'Picks one or more random entries out of an array, and returns the key (or keys) of the random entries.',
		signature: '(array $input [, int $num_req = 1 ]): mixed'
	},
	array_unique: {
		description: 'Takes an input array and returns a new array without duplicate values.',
		signature: '(array $array [, int $sort_flags = SORT_STRING ]): array'
	},
	array_intersect: {
		description: 'array_intersect() returns an array containing all the values of array1 that are present in all the arguments. Note that keys are preserved.',
		signature: '(array $array1 , array $array2 [, array $ ... ]): array'
	},
	array_intersect_key: {
		description: 'array_intersect_key() returns an array containing all the entries of array1 which have keys that are present in all the arguments.',
		signature: '(array $array1 , array $array2 [, array $ ... ]): array'
	},
	array_intersect_ukey: {
		description: 'array_intersect_ukey() returns an array containing all the values of array1 which have matching keys that are present in all the arguments.',
		signature: '(array $array1 , array $array2 [, array $... ], callback $key_compare_func): array'
	},
	array_uintersect: {
		description: 'Computes the intersection of arrays, compares data by a callback function.',
		signature: '(array $array1 , array $array2 [, array $ ... ], callback $data_compare_func): array'
	},
	array_intersect_assoc: {
		description: 'array_intersect_assoc() returns an array containing all the values of array1 that are present in all the arguments. Note that the keys are used in the comparison unlike in array_intersect().',
		signature: '(array $array1 , array $array2 [, array $ ... ]): array'
	},
	array_uintersect_assoc: {
		description: 'Computes the intersection of arrays with additional index check, compares data by a callback function.',
		signature: '(array $array1 , array $array2 [, array $ ... ], callback $data_compare_func): array'
	},
	array_intersect_uassoc: {
		description: 'array_intersect_uassoc() returns an array containing all the values of array1 that are present in all the arguments. Note that the keys are used in the comparison unlike in array_intersect().',
		signature: '(array $array1 , array $array2 [, array $ ... ], callback $key_compare_func): array'
	},
	array_uintersect_uassoc: {
		description: 'Computes the intersection of arrays with additional index check, compares data and indexes by a callback functions Note that the keys are used in the comparison unlike in array_uintersect(). Both the data and the indexes are compared by using separate callback functions.',
		signature: '(array $array1 , array $array2 [, array $ ... ], callback $data_compare_func , callback $key_compare_func): array'
	},
	array_diff: {
		description: 'Compares array1 against array2 and returns the difference.',
		signature: '(array $array1 , array $array2 [, array $ ... ]): array'
	},
	array_diff_key: {
		description: 'Compares the keys from array1 against the keys from array2 and returns the difference. This function is like array_diff() except the comparison is done on the keys instead of the values.',
		signature: '(array $array1 , array $array2 [, array $... ]): array'
	},
	array_diff_ukey: {
		description: 'Compares the keys from array1 against the keys from array2 and returns the difference. This function is like array_diff() except the comparison is done on the keys instead of the values.',
		signature: '(array $array1 , array $array2 [, array $ ... ], callback $key_compare_func): array'
	},
	array_udiff: {
		description: 'Computes the difference of arrays by using a callback function for data comparison. This is unlike array_diff() which uses an internal function for comparing the data.',
		signature: '(array $array1 , array $array2 [, array $ ... ], callback $data_compare_func): array'
	},
	array_diff_assoc: {
		description: 'Compares array1 against array2 and returns the difference. Unlike array_diff() the array keys are used in the comparison.',
		signature: '(array $array1 , array $array2 [, array $... ]): array'
	},
	array_udiff_assoc: {
		description: 'Computes the difference of arrays with additional index check, compares data by a callback function.',
		signature: '(array $array1 , array $array2 [, array $ ... ], callback $data_compare_func): array'
	},
	array_diff_uassoc: {
		description: 'Compares array1 against array2 and returns the difference. Unlike array_diff() the array keys are used in the comparison.',
		signature: '(array $array1 , array $array2 [, array $... ], callback $key_compare_func): array'
	},
	array_udiff_uassoc: {
		description: 'Computes the difference of arrays with additional index check, compares data and indexes by a callback function.',
		signature: '(array $array1 , array $array2 [, array $ ... ], callback $data_compare_func , callback $key_compare_func): array'
	},
	array_sum: {
		description: 'array_sum() returns the sum of values in an array.',
		signature: '(array $array): number'
	},
	array_product: {
		description: 'array_product() returns the product of values in an array.',
		signature: '(array $array): number'
	},
	array_filter: {
		description: 'Iterates over each value in the input array passing them to the callback function. If the callback function returns true, the current value from input is returned into the result array. Array keys are preserved.',
		signature: '(array $input [, callback $callback ]): array'
	},
	array_map: {
		description: 'array_map() returns an array containing all the elements of arr1 after applying the callback function to each one. The number of parameters that the callback function accepts should match the number of arrays passed to the array_map()',
		signature: '(callback $callback , array $arr1 [, array $... ]): array'
	},
	array_chunk: {
		description: 'Chunks an array into size large chunks. The last chunk may contain less than size elements.',
		signature: '(array $input , int $size [, bool $preserve_keys = false ]): array'
	},
	array_combine: {
		description: 'Creates an array by using the values from the keys array as keys and the values from the values array as the corresponding values.',
		signature: '(array $keys , array $values): array'
	},
	array_key_exists: {
		description: 'array_key_exists() returns TRUE if the given key is set in the array. key can be any value possible for an array index.',
		signature: '(mixed $key , array $search): bool'
	},
	pos: {
		description: 'Alias of current next prev Array Functions PHP Manual pos (PHP 4, PHP 5)',
	},
	sizeof: {
		description: 'Alias of count shuffle sort Array Functions PHP Manual sizeof (PHP 4, PHP 5)',
	},
	assert: {
		description: 'assert() will check the given assertion and take appropriate action if its result is FALSE.',
		signature: '(mixed $assertion): bool'
	},
	assert_options: {
		description: 'Set the various assert() control options or just query their current settings.',
		signature: '(int $what [, mixed $value ]): mixed'
	},
	version_compare: {
		description: 'version_compare() compares two \"PHP-standardized\" version number strings. This is useful if you would like to write programs working only on some versions of PHP.',
		signature: '(string $version1 , string $version2 [, string $operator ]): mixed'
	},
	str_rot13: {
		description: 'Performs the ROT13 encoding on the str argument and returns the resulting string.',
		signature: '(string $str): string'
	},
	stream_get_filters: {
		description: 'Retrieve the list of registered filters on the running system.',
		signature: '(void): array'
	},
	stream_filter_register: {
		description: 'stream_filter_register() allows you to implement your own filter on any registered stream used with all the other filesystem functions (such as fopen(), fread() etc.).',
		signature: '(string $filtername , string $classname): bool'
	},
	stream_bucket_make_writeable: {
		description: 'This function is currently not documented; only its argument list is available.',
		signature: '(resource $brigade): object'
	},
	stream_bucket_prepend: {
		description: 'This function is currently not documented; only its argument list is available.',
		signature: '(resource $brigade , resource $bucket): void'
	},
	stream_bucket_append: {
		description: 'This function is currently not documented; only its argument list is available.',
		signature: '(resource $brigade , resource $bucket): void'
	},
	stream_bucket_new: {
		description: 'This function is currently not documented; only its argument list is available.',
		signature: '(resource $stream , string $buffer): object'
	},
	output_add_rewrite_var: {
		description: 'This function adds another name/value pair to the URL rewrite mechanism. The name and value will be added to URLs (as GET parameter) and forms (as hidden input fields) the same way as the session ID when transparent URL rewriting is enabled with session.use_trans_sid. Please note that absolute URLs (http://example.com/..) aren\'t rewritten.',
		signature: '(string $name , string $value): bool'
	},
	output_reset_rewrite_vars: {
		description: 'This function resets the URL rewriter and removes all rewrite variables previously set by the output_add_rewrite_var() function or the session mechanism (if session.use_trans_sid was set on session_start()).',
		signature: '(void): bool'
	},
	sys_get_temp_dir: {
		description: 'Returns the path of the directory PHP stores temporary files in by default.',
		signature: '(void): string'
	},
	token_get_all: {
		description: 'token_get_all() parses the given source string into PHP language tokens using the Zend engine\'s lexical scanner.',
		signature: '(string $source): array'
	},
	token_name: {
		description: 'token_name() gets the symbolic name for a PHP token value.',
		signature: '(int $token): string'
	},
	zip_open: {
		description: 'Opens a new zip archive for reading.',
		signature: '(string $filename): mixed'
	},
	zip_close: {
		description: 'Closes the given ZIP file archive.',
		signature: '(resource $zip): void'
	},
	zip_read: {
		description: 'Reads the next entry in a zip file archive.',
		signature: '(resource $zip): mixed'
	},
	zip_entry_open: {
		description: 'Opens a directory entry in a zip file for reading.',
		signature: '(resource $zip , resource $zip_entry [, string $mode ]): bool'
	},
	zip_entry_close: {
		description: 'Closes the specified directory entry.',
		signature: '(resource $zip_entry): bool'
	},
	zip_entry_read: {
		description: 'Reads from an open directory entry.',
		signature: '(resource $zip_entry [, int $length ]): string'
	},
	zip_entry_filesize: {
		description: 'Returns the actual size of the specified directory entry.',
		signature: '(resource $zip_entry): int'
	},
	zip_entry_name: {
		description: 'Returns the name of the specified directory entry.',
		signature: '(resource $zip_entry): string'
	},
	zip_entry_compressedsize: {
		description: 'Returns the compressed size of the specified directory entry.',
		signature: '(resource $zip_entry): int'
	},
	zip_entry_compressionmethod: {
		description: 'Returns the compression method of the directory entry specified by zip_entry.',
		signature: '(resource $zip_entry): string'
	},
	readgzfile: {
		description: 'Reads a file, decompresses it and writes it to standard output.',
		signature: '(string $filename [, int $use_include_path = 0 ]): int'
	},
	gzrewind: {
		description: 'Sets the file position indicator of the given gz-file pointer to the beginning of the file stream.',
		signature: '(resource $zp): bool'
	},
	gzclose: {
		description: 'Closes the given gz-file pointer.',
		signature: '(resource $zp): bool'
	},
	gzeof: {
		description: 'Tests the given GZ file pointer for EOF.',
		signature: '(resource $zp): int'
	},
	gzgetc: {
		description: 'Returns a string containing a single (uncompressed) character read from the given gz-file pointer.',
		signature: '(resource $zp): string'
	},
	gzgets: {
		description: 'Gets a (uncompressed) string of up to length - 1 bytes read from the given file pointer. Reading ends when length - 1 bytes have been read, on a newline, or on EOF (whichever comes first).',
		signature: '(resource $zp , int $length): string'
	},
	gzgetss: {
		description: 'Identical to gzgets(), except that gzgetss() attempts to strip any HTML and PHP tags from the text it reads.',
		signature: '(resource $zp , int $length [, string $allowable_tags ]): string'
	},
	gzread: {
		description: 'gzread() reads up to length bytes from the given gz-file pointer. Reading stops when length (uncompressed) bytes have been read or EOF is reached, whichever comes first.',
		signature: '(resource $zp , int $length): string'
	},
	gzopen: {
		description: 'Opens a gzip (.gz) file for reading or writing.',
		signature: '(string $filename , string $mode [, int $use_include_path = 0 ]): resource'
	},
	gzpassthru: {
		description: 'Reads to EOF on the given gz-file pointer from the current position and writes the (uncompressed) results to standard output.',
		signature: '(resource $zp): int'
	},
	gzseek: {
		description: 'Sets the file position indicator for the given file pointer to the given offset byte into the file stream. Equivalent to calling (in C) gzseek(zp, offset, SEEK_SET).',
		signature: '(resource $zp , int $offset [, int $whence = SEEK_SET ]): int'
	},
	gztell: {
		description: 'Gets the position of the given file pointer; i.e., its offset into the uncompressed file stream.',
		signature: '(resource $zp): int'
	},
	gzwrite: {
		description: 'gzwrite() writes the contents of string to the given gz-file.',
		signature: '(resource $zp , string $string [, int $length ]): int'
	},
	gzputs: {
		description: 'Alias of gzwrite gzpassthru gzread Zlib Functions PHP Manual gzputs (PHP 4, PHP 5)',
	},
	gzfile: {
		description: 'This function is identical to readgzfile(), except that it returns the file in an array.',
		signature: '(string $filename [, int $use_include_path = 0 ]): array'
	},
	gzcompress: {
		description: 'This function compress the given string using the ZLIB data format.',
		signature: '(string $data [, int $level = -1 ]): string'
	},
	gzuncompress: {
		description: 'This function uncompress a compressed string.',
		signature: '(string $data [, int $length = 0 ]): string'
	},
	gzdeflate: {
		description: 'This function compress the given string using the DEFLATE data format.',
		signature: '(string $data [, int $level = -1 ]): string'
	},
	gzinflate: {
		description: 'This function inflate a deflated string.',
		signature: '(string $data [, int $length = 0 ]): string'
	},
	gzencode: {
		description: 'This function returns a compressed version of the input data compatible with the output of the gzip program.',
		signature: '(string $data [, int $level = -1 [, int $encoding_mode = FORCE_GZIP ]]): string'
	},
	ob_gzhandler: {
		description: 'ob_gzhandler() is intended to be used as a callback function for ob_start() to help facilitate sending gz-encoded data to web browsers that support compressed web pages. Before ob_gzhandler() actually sends compressed data, it determines what type of content encoding the browser will accept (\"gzip\", \"deflate\" or none at all) and will return its output accordingly. All browsers are supported since it\'s up to the browser to send the correct header saying that it accepts compressed web pages. If a browser doesn\'t support compressed pages this function returns FALSE.',
		signature: '(string $buffer , int $mode): string'
	},
	zlib_get_coding_type: {
		description: 'Returns the coding type used for output compression.',
		signature: '(void): string'
	},
	libxml_set_streams_context: {
		description: 'Sets the streams context for the next libxml document load or write.',
		signature: '(resource $streams_context): void'
	},
	libxml_use_internal_errors: {
		description: 'libxml_use_internal_errors() allows you to disable standard libxml errors and enable user error handling.',
		signature: '([ bool $use_errors = false ]): bool'
	},
	libxml_get_last_error: {
		description: 'Retrieve last error from libxml.',
		signature: '(void): LibXMLError'
	},
	libxml_clear_errors: {
		description: 'libxml_clear_errors() clears the libxml error buffer.',
		signature: '(void): void'
	},
	libxml_get_errors: {
		description: 'Retrieve array of errors.',
		signature: '(void): array'
	},
	libxml_disable_entity_loader: {
		description: 'Disable/enable the ability to load external entities.',
		signature: '([ bool $disable = true ]): bool'
	},
	dom_import_simplexml: {
		description: 'This function takes the node node of class SimpleXML and makes it into a DOMElement node. This new object can then be used as a native DOMElement node.',
		signature: '(SimpleXMLElement $node): DOMElement'
	},
	simplexml_load_file: {
		description: 'Convert the well-formed XML document in the given file to an object.',
		signature: '(string $filename [, string $class_name = \"SimpleXMLElement\" [, int $options = 0 [, string $ns [, bool $is_prefix = false ]]]]): object'
	},
	simplexml_load_string: {
		description: 'Takes a well-formed XML string and returns it as an object.',
		signature: '(string $data [, string $class_name = \"SimpleXMLElement\" [, int $options = 0 [, string $ns [, bool $is_prefix = false ]]]]): object'
	},
	simplexml_import_dom: {
		description: 'This function takes a node of a DOM document and makes it into a SimpleXML node. This new object can then be used as a native SimpleXML element.',
		signature: '(DOMNode $node [, string $class_name = \"SimpleXMLElement\" ]): SimpleXMLElement'
	},
	wddx_serialize_value: {
		description: 'Creates a WDDX packet from a single given value.',
		signature: '(mixed $var [, string $comment ]): string'
	},
	wddx_serialize_vars: {
		description: 'Creates a WDDX packet with a structure that contains the serialized representation of the passed variables.',
		signature: '(mixed $var_name [, mixed $... ]): string'
	},
	wddx_packet_start: {
		description: 'Start a new WDDX packet for incremental addition of variables. It automatically creates a structure definition inside the packet to contain the variables.',
		signature: '([ string $comment ]): resource'
	},
	wddx_packet_end: {
		description: 'Ends and returns the given WDDX packet.',
		signature: '(resource $packet_id): string'
	},
	wddx_add_vars: {
		description: 'Serializes the passed variables and add the result to the given packet.',
		signature: '(resource $packet_id , mixed $var_name [, mixed $... ]): bool'
	},
	wddx_deserialize: {
		description: 'Unserializes a WDDX packet.',
		signature: '(string $packet): mixed'
	},
	xml_parser_create: {
		description: 'xml_parser_create() creates a new XML parser and returns a resource handle referencing it to be used by the other XML functions.',
		signature: '([ string $encoding ]): resource'
	},
	xml_parser_create_ns: {
		description: 'xml_parser_create_ns() creates a new XML parser with XML namespace support and returns a resource handle referencing it to be used by the other XML functions.',
		signature: '([ string $encoding [, string $separator = \':\' ]]): resource'
	},
	xml_set_object: {
		description: 'This function allows to use parser inside object. All callback functions could be set with xml_set_element_handler() etc and assumed to be methods of object.',
		signature: '(resource $parser , object &$object): bool'
	},
	xml_set_element_handler: {
		description: 'Sets the element handler functions for the XML parser. start_element_handler and end_element_handler are strings containing the names of functions that must exist when xml_parse() is called for parser.',
		signature: '(resource $parser , callback $start_element_handler , callback $end_element_handler): bool'
	},
	xml_set_character_data_handler: {
		description: 'Sets the character data handler function for the XML parser parser.',
		signature: '(resource $parser , callback $handler): bool'
	},
	xml_set_processing_instruction_handler: {
		description: 'Sets the processing instruction (PI) handler function for the XML parser parser.',
		signature: '(resource $parser , callback $handler): bool'
	},
	xml_set_default_handler: {
		description: 'Sets the default handler function for the XML parser parser.',
		signature: '(resource $parser , callback $handler): bool'
	},
	xml_set_unparsed_entity_decl_handler: {
		description: 'Sets the unparsed entity declaration handler function for the XML parser parser.',
		signature: '(resource $parser , callback $handler): bool'
	},
	xml_set_notation_decl_handler: {
		description: 'Sets the notation declaration handler function for the XML parser parser.',
		signature: '(resource $parser , callback $handler): bool'
	},
	xml_set_external_entity_ref_handler: {
		description: 'Sets the external entity reference handler function for the XML parser parser.',
		signature: '(resource $parser , callback $handler): bool'
	},
	xml_set_start_namespace_decl_handler: {
		description: 'Set a handler to be called when a namespace is declared. Namespace declarations occur inside start tags. But the namespace declaration start handler is called before the start tag handler for each namespace declared in that start tag.',
		signature: '(resource $parser , callback $handler): bool'
	},
	xml_set_end_namespace_decl_handler: {
		description: 'Set a handler to be called when leaving the scope of a namespace declaration. This will be called, for each namespace declaration, after the handler for the end tag of the element in which the namespace was declared.',
		signature: '(resource $parser , callback $handler): bool'
	},
	xml_parse: {
		description: 'xml_parse() parses an XML document. The handlers for the configured events are called as many times as necessary.',
		signature: '(resource $parser , string $data [, bool $is_final = false ]): int'
	},
	xml_parse_into_struct: {
		description: 'This function parses an XML string into 2 parallel array structures, one (index) containing pointers to the location of the appropriate values in the values array. These last two parameters must be passed by reference.',
		signature: '(resource $parser , string $data , array &$values [, array &$index ]): int'
	},
	xml_get_error_code: {
		description: 'Gets the XML parser error code.',
		signature: '(resource $parser): int'
	},
	xml_error_string: {
		description: 'Gets the XML parser error string associated with the given code.',
		signature: '(int $code): string'
	},
	xml_get_current_line_number: {
		description: 'Gets the current line number for the given XML parser.',
		signature: '(resource $parser): int'
	},
	xml_get_current_column_number: {
		description: 'Gets the current column number of the given XML parser.',
		signature: '(resource $parser): int'
	},
	xml_get_current_byte_index: {
		description: 'Gets the current byte index of the given XML parser.',
		signature: '(resource $parser): int'
	},
	xml_parser_free: {
		description: 'Frees the given XML parser.',
		signature: '(resource $parser): bool'
	},
	xml_parser_set_option: {
		description: 'Sets an option in an XML parser.',
		signature: '(resource $parser , int $option , mixed $value): bool'
	},
	xml_parser_get_option: {
		description: 'Gets an option value from an XML parser.',
		signature: '(resource $parser , int $option): mixed'
	},
	utf8_encode: {
		description: 'This function encodes the string data to UTF-8, and returns the encoded version. UTF-8 is a standard mechanism used by Unicode for encoding wide character values into a byte stream. UTF-8 is transparent to plain ASCII characters, is self-synchronized (meaning it is possible for a program to figure out where in the bytestream characters start) and can be used with normal string comparison functions for sorting and such. PHP encodes UTF-8 characters in up to four bytes, like this: UTF-8 encoding bytes bits representation 1 7 0bbbbbbb 2 11 110bbbbb 10bbbbbb 3 16 1110bbbb 10bbbbbb 10bbbbbb 4 21 11110bbb 10bbbbbb 10bbbbbb 10bbbbbb Each b represents a bit that can be used to store character data.',
		signature: '(string $data): string'
	},
	utf8_decode: {
		description: 'This function decodes data, assumed to be UTF-8 encoded, to ISO-8859-1.',
		signature: '(string $data): string'
	},
	xmlwriter_open_uri: {
		description: 'Creates a new XMLWriter using uri for the output.',
	},
	xmlwriter_open_memory: {
		description: 'Creates a new XMLWriter using memory for string output.',
	},
	xmlwriter_set_indent: {
		description: 'Toggles indentation on or off.',
	},
	xmlwriter_set_indent_string: {
		description: 'Sets the string which will be used to indent each element/attribute of the resulting xml.',
	},
	xmlwriter_start_comment: {
		description: 'Starts a comment.',
	},
	xmlwriter_end_comment: {
		description: 'Ends the current comment.',
	},
	xmlwriter_start_attribute: {
		description: 'Starts an attribute.',
	},
	xmlwriter_end_attribute: {
		description: 'Ends the current attribute.',
	},
	xmlwriter_write_attribute: {
		description: 'Writes a full attribute.',
	},
	xmlwriter_start_attribute_ns: {
		description: 'Starts a namespaced attribute.',
	},
	xmlwriter_write_attribute_ns: {
		description: 'Writes a full namespaced attribute.',
	},
	xmlwriter_start_element: {
		description: 'Starts an element.',
	},
	xmlwriter_end_element: {
		description: 'Ends the current element.',
	},
	xmlwriter_full_end_element: {
		description: 'End the current xml element. Writes an end tag even if the element is empty.',
	},
	xmlwriter_start_element_ns: {
		description: 'Starts a namespaced element.',
	},
	xmlwriter_write_element: {
		description: 'Writes a full element tag.',
	},
	xmlwriter_write_element_ns: {
		description: 'Writes a full namespaced element tag.',
	},
	xmlwriter_start_pi: {
		description: 'Starts a processing instruction tag.',
	},
	xmlwriter_end_pi: {
		description: 'Ends the current processing instruction.',
	},
	xmlwriter_write_pi: {
		description: 'Writes a processing instruction.',
	},
	xmlwriter_start_cdata: {
		description: 'Starts a CDATA.',
	},
	xmlwriter_end_cdata: {
		description: 'Ends the current CDATA section.',
	},
	xmlwriter_write_cdata: {
		description: 'Writes a full CDATA.',
	},
	xmlwriter_text: {
		description: 'Writes a text.',
	},
	xmlwriter_write_raw: {
		description: 'Writes a raw xml text.',
	},
	xmlwriter_start_document: {
		description: 'Starts a document.',
	},
	xmlwriter_end_document: {
		description: 'Ends the current document.',
	},
	xmlwriter_write_comment: {
		description: 'Writes a full comment.',
	},
	xmlwriter_start_dtd: {
		description: 'Starts a DTD.',
	},
	xmlwriter_end_dtd: {
		description: 'Ends the DTD of the document.',
	},
	xmlwriter_write_dtd: {
		description: 'Writes a full DTD.',
	},
	xmlwriter_start_dtd_element: {
		description: 'Starts a DTD element.',
	},
	xmlwriter_end_dtd_element: {
		description: 'Ends the current DTD element.',
	},
	xmlwriter_write_dtd_element: {
		description: 'Writes a full DTD element.',
	},
	xmlwriter_start_dtd_attlist: {
		description: 'Starts a DTD attribute list.',
	},
	xmlwriter_end_dtd_attlist: {
		description: 'Ends the current DTD attribute list.',
	},
	xmlwriter_write_dtd_attlist: {
		description: 'Writes a DTD attribute list.',
	},
	xmlwriter_start_dtd_entity: {
		description: 'Starts a DTD entity.',
	},
	xmlwriter_end_dtd_entity: {
		description: 'Ends the current DTD entity.',
	},
	xmlwriter_write_dtd_entity: {
		description: 'Writes a full DTD entity.',
	},
	xmlwriter_output_memory: {
		description: 'Returns the current buffer.',
	},
	xmlwriter_flush: {
		description: 'Flushes the current buffer.',
	},
	mysql_connect: {
		description: 'Opens or reuses a connection to a MySQL server.',
		signature: '([ string $server = ini_get(\"mysql.default_host\") [, string $username = ini_get(\"mysql.default_user\") [, string $password = ini_get(\"mysql.default_password\") [, bool $new_link = false [, int $client_flags = 0 ]]]]]): resource'
	},
	mysql_pconnect: {
		description: 'Establishes a persistent connection to a MySQL server.',
		signature: '([ string $server = ini_get(\"mysql.default_host\") [, string $username = ini_get(\"mysql.default_user\") [, string $password = ini_get(\"mysql.default_password\") [, int $client_flags ]]]]): resource'
	},
	mysql_close: {
		description: 'mysql_close() closes the non-persistent connection to the MySQL server that\'s associated with the specified link identifier. If link_identifier isn\'t specified, the last opened link is used.',
		signature: '([ resource $link_identifier ]): bool'
	},
	mysql_select_db: {
		description: 'Sets the current active database on the server that\'s associated with the specified link identifier. Every subsequent call to mysql_query() will be made on the active database.',
		signature: '(string $database_name [, resource $link_identifier ]): bool'
	},
	mysql_query: {
		description: 'mysql_query() sends a unique query (multiple queries are not supported) to the currently active database on the server that\'s associated with the specified link_identifier.',
		signature: '(string $query [, resource $link_identifier ]): resource'
	},
	mysql_unbuffered_query: {
		description: 'mysql_unbuffered_query() sends the SQL query query to MySQL without automatically fetching and buffering the result rows as mysql_query() does. This saves a considerable amount of memory with SQL queries that produce large result sets, and you can start working on the result set immediately after the first row has been retrieved as you don\'t have to wait until the complete SQL query has been performed. To use mysql_unbuffered_query() while multiple database connections are open, you must specify the optional parameter link_identifier to identify which connection you want to use.',
		signature: '(string $query [, resource $link_identifier ]): resource'
	},
	mysql_db_query: {
		description: 'mysql_db_query() selects a database, and executes a query on it.',
		signature: '(string $database , string $query [, resource $link_identifier ]): resource'
	},
	mysql_list_dbs: {
		description: 'Returns a result pointer containing the databases available from the current mysql daemon.',
		signature: '([ resource $link_identifier ]): resource'
	},
	mysql_list_tables: {
		description: 'Retrieves a list of table names from a MySQL database.',
		signature: '(string $database [, resource $link_identifier ]): resource'
	},
	mysql_list_fields: {
		description: 'Retrieves information about the given table name.',
		signature: '(string $database_name , string $table_name [, resource $link_identifier ]): resource'
	},
	mysql_list_processes: {
		description: 'Retrieves the current MySQL server threads.',
		signature: '([ resource $link_identifier ]): resource'
	},
	mysql_error: {
		description: 'Returns the error text from the last MySQL function. Errors coming back from the MySQL database backend no longer issue warnings. Instead, use mysql_error() to retrieve the error text. Note that this function only returns the error text from the most recently executed MySQL function (not including mysql_error() and mysql_errno()), so if you want to use it, make sure you check the value before calling another MySQL function.',
		signature: '([ resource $link_identifier ]): string'
	},
	mysql_errno: {
		description: 'Returns the error number from the last MySQL function.',
		signature: '([ resource $link_identifier ]): int'
	},
	mysql_affected_rows: {
		description: 'Get the number of affected rows by the last INSERT, UPDATE, REPLACE or DELETE query associated with link_identifier.',
		signature: '([ resource $link_identifier ]): int'
	},
	mysql_insert_id: {
		description: 'Retrieves the ID generated for an AUTO_INCREMENT column by the previous query (usually INSERT).',
		signature: '([ resource $link_identifier ]): int'
	},
	mysql_result: {
		description: 'Retrieves the contents of one cell from a MySQL result set.',
		signature: '(resource $result , int $row [, mixed $field = 0 ]): string'
	},
	mysql_num_rows: {
		description: 'Retrieves the number of rows from a result set. This command is only valid for statements like SELECT or SHOW that return an actual result set. To retrieve the number of rows affected by a INSERT, UPDATE, REPLACE or DELETE query, use mysql_affected_rows().',
		signature: '(resource $result): int'
	},
	mysql_num_fields: {
		description: 'Retrieves the number of fields from a query.',
		signature: '(resource $result): int'
	},
	mysql_fetch_row: {
		description: 'Returns a numerical array that corresponds to the fetched row and moves the internal data pointer ahead.',
		signature: '(resource $result): array'
	},
	mysql_fetch_array: {
		description: 'Returns an array that corresponds to the fetched row and moves the internal data pointer ahead.',
		signature: '(resource $result [, int $result_type = MYSQL_BOTH ]): array'
	},
	mysql_fetch_assoc: {
		description: 'Returns an associative array that corresponds to the fetched row and moves the internal data pointer ahead. mysql_fetch_assoc() is equivalent to calling mysql_fetch_array() with MYSQL_ASSOC for the optional second parameter. It only returns an associative array.',
		signature: '(resource $result): array'
	},
	mysql_fetch_object: {
		description: 'Returns an object with properties that correspond to the fetched row and moves the internal data pointer ahead.',
		signature: '(resource $result [, string $class_name [, array $params ]]): object'
	},
	mysql_data_seek: {
		description: 'mysql_data_seek() moves the internal row pointer of the MySQL result associated with the specified result identifier to point to the specified row number. The next call to a MySQL fetch function, such as mysql_fetch_assoc(), would return that row.',
		signature: '(resource $result , int $row_number): bool'
	},
	mysql_fetch_lengths: {
		description: 'Returns an array that corresponds to the lengths of each field in the last row fetched by MySQL.',
		signature: '(resource $result): array'
	},
	mysql_fetch_field: {
		description: 'Returns an object containing field information. This function can be used to obtain information about fields in the provided query result.',
		signature: '(resource $result [, int $field_offset = 0 ]): object'
	},
	mysql_field_seek: {
		description: 'Seeks to the specified field offset. If the next call to mysql_fetch_field() doesn\'t include a field offset, the field offset specified in mysql_field_seek() will be returned.',
		signature: '(resource $result , int $field_offset): bool'
	},
	mysql_free_result: {
		description: 'mysql_free_result() will free all memory associated with the result identifier result.',
		signature: '(resource $result): bool'
	},
	mysql_field_name: {
		description: 'mysql_field_name() returns the name of the specified field index.',
		signature: '(resource $result , int $field_offset): string'
	},
	mysql_field_table: {
		description: 'Returns the name of the table that the specified field is in.',
		signature: '(resource $result , int $field_offset): string'
	},
	mysql_field_len: {
		description: 'mysql_field_len() returns the length of the specified field.',
		signature: '(resource $result , int $field_offset): int'
	},
	mysql_field_type: {
		description: 'mysql_field_type() is similar to the mysql_field_name() function. The arguments are identical, but the field type is returned instead.',
		signature: '(resource $result , int $field_offset): string'
	},
	mysql_field_flags: {
		description: 'mysql_field_flags() returns the field flags of the specified field. The flags are reported as a single word per flag separated by a single space, so that you can split the returned value using explode().',
		signature: '(resource $result , int $field_offset): string'
	},
	mysql_escape_string: {
		description: 'This function will escape the unescaped_string, so that it is safe to place it in a mysql_query(). This function is deprecated.',
		signature: '(string $unescaped_string): string'
	},
	mysql_real_escape_string: {
		description: 'Escapes special characters in the unescaped_string, taking into account the current character set of the connection so that it is safe to place it in a mysql_query(). If binary data is to be inserted, this function must be used.',
		signature: '(string $unescaped_string [, resource $link_identifier ]): string'
	},
	mysql_stat: {
		description: 'mysql_stat() returns the current server status.',
		signature: '([ resource $link_identifier ]): string'
	},
	mysql_thread_id: {
		description: 'Retrieves the current thread ID. If the connection is lost, and a reconnect with mysql_ping() is executed, the thread ID will change. This means only retrieve the thread ID when needed.',
		signature: '([ resource $link_identifier ]): int'
	},
	mysql_client_encoding: {
		description: 'Retrieves the character_set variable from MySQL.',
		signature: '([ resource $link_identifier ]): string'
	},
	mysql_ping: {
		description: 'Checks whether or not the connection to the server is working. If it has gone down, an automatic reconnection is attempted. This function can be used by scripts that remain idle for a long while, to check whether or not the server has closed the connection and reconnect if necessary.',
		signature: '([ resource $link_identifier ]): bool'
	},
	mysql_get_client_info: {
		description: 'mysql_get_client_info() returns a string that represents the client library version.',
		signature: '(void): string'
	},
	mysql_get_host_info: {
		description: 'Describes the type of connection in use for the connection, including the server host name.',
		signature: '([ resource $link_identifier ]): string'
	},
	mysql_get_proto_info: {
		description: 'Retrieves the MySQL protocol.',
		signature: '([ resource $link_identifier ]): int'
	},
	mysql_get_server_info: {
		description: 'Retrieves the MySQL server version.',
		signature: '([ resource $link_identifier ]): string'
	},
	mysql_info: {
		description: 'Returns detailed information about the last query.',
		signature: '([ resource $link_identifier ]): string'
	},
	mysql_set_charset: {
		description: 'Sets the default character set for the current connection.',
		signature: '(string $charset [, resource $link_identifier ]): bool'
	},
	mysql_db_name: {
		description: 'Retrieve the database name from a call to mysql_list_dbs().',
		signature: '(resource $result , int $row [, mixed $field ]): string'
	},
	mysql_tablename: {
		description: 'Retrieves the table name from a result.',
		signature: '(resource $result , int $i): string'
	},
	mysqli_connect: {
		description: 'Alias of mysqli::__construct mysqli_client_encoding mysqli_disable_reads_from_master Aliases and deprecated Mysqli Functions PHP Manual mysqli_connect (PHP 5)',
	},
	mysqli_execute: {
		description: 'Alias for mysqli_stmt_execute mysqli_escape_string mysqli_fetch Aliases and deprecated Mysqli Functions PHP Manual mysqli_execute (PHP 5)',
	},
	mysqli_report: {
		description: 'mysqli_report() is a powerful function to improve your queries and code during development and testing phase. Depending on the flags it reports errors from mysqli function calls or queries which don\'t use an index (or use a bad index).',
		signature: '(int $flags): bool'
	},
	mysqli_bind_param: {
		description: 'Alias for mysqli_stmt_bind_param Aliases and deprecated Mysqli Functions mysqli_bind_result Aliases and deprecated Mysqli Functions PHP Manual mysqli_bind_param (PHP 5)',
	},
	mysqli_bind_result: {
		description: 'Alias for mysqli_stmt_bind_result mysqli_bind_param mysqli_client_encoding Aliases and deprecated Mysqli Functions PHP Manual mysqli_bind_result (PHP 5)',
	},
	mysqli_client_encoding: {
		description: 'Alias of mysqli_character_set_name mysqli_bind_result mysqli_connect Aliases and deprecated Mysqli Functions PHP Manual mysqli_client_encoding (PHP 5)',
	},
	mysqli_escape_string: {
		description: 'Alias of mysqli_real_escape_string mysqli_enable_rpl_parse mysqli_execute Aliases and deprecated Mysqli Functions PHP Manual mysqli_escape_string (PHP 5)',
	},
	mysqli_fetch: {
		description: 'Alias for mysqli_stmt_fetch mysqli_execute mysqli_get_cache_stats Aliases and deprecated Mysqli Functions PHP Manual mysqli_fetch (PHP 5)',
	},
	mysqli_param_count: {
		description: 'Alias for mysqli_stmt_param_count mysqli_master_query mysqli_report Aliases and deprecated Mysqli Functions PHP Manual mysqli_param_count (PHP 5)',
	},
	mysqli_get_metadata: {
		description: 'Alias for mysqli_stmt_result_metadata mysqli_get_cache_stats mysqli_master_query Aliases and deprecated Mysqli Functions PHP Manual mysqli_get_metadata (PHP 5)',
	},
	mysqli_send_long_data: {
		description: 'Alias for mysqli_stmt_send_long_data mysqli_rpl_query_type mysqli_send_query Aliases and deprecated Mysqli Functions PHP Manual mysqli_send_long_data (PHP 5)',
	},
	mysqli_set_opt: {
		description: 'Alias of mysqli_options mysqli_send_query mysqli_slave_query Aliases and deprecated Mysqli Functions PHP Manual mysqli_set_opt (PHP 5)',
	},
	mb_convert_case: {
		description: 'Performs case folding on a string, converted in the way specified by mode.',
		signature: '(string $str , int $mode = MB_CASE_UPPER [, string $encoding = mb_internal_encoding() ]): string'
	},
	mb_strtoupper: {
		description: 'Returns str with all alphabetic characters converted to uppercase.',
		signature: '(string $str [, string $encoding = mb_internal_encoding() ]): string'
	},
	mb_strtolower: {
		description: 'Returns str with all alphabetic characters converted to lowercase.',
		signature: '(string $str [, string $encoding = mb_internal_encoding() ]): string'
	},
	mb_language: {
		description: 'Set/Get the current language.',
		signature: '([ string $language ]): mixed'
	},
	mb_internal_encoding: {
		description: 'Set/Get the internal character encoding',
		signature: '([ string $encoding = mb_internal_encoding() ]): mixed'
	},
	mb_http_input: {
		description: 'Detects the HTTP input character encoding.',
		signature: '([ string $type = \"\" ]): mixed'
	},
	mb_http_output: {
		description: 'Set/Get the HTTP output character encoding. Output after this function is converted to encoding.',
		signature: '([ string $encoding ]): mixed'
	},
	mb_detect_order: {
		description: 'Sets the automatic character encoding detection order to encoding_list.',
		signature: '([ mixed $encoding_list ]): mixed'
	},
	mb_substitute_character: {
		description: 'Specifies a substitution character when input character encoding is invalid or character code does not exist in output character encoding. Invalid characters may be substituted NULL (no output), string or integer value (Unicode character code value).',
		signature: '([ mixed $substrchar ]): mixed'
	},
	mb_parse_str: {
		description: 'Parses GET/POST/COOKIE data and sets global variables. Since PHP does not provide raw POST/COOKIE data, it can only be used for GET data for now. It parses URL encoded data, detects encoding, converts coding to internal encoding and set values to the result array or global variables.',
		signature: '(string $encoded_string [, array &$result ]): bool'
	},
	mb_output_handler: {
		description: 'mb_output_handler() is ob_start() callback function. mb_output_handler() converts characters in the output buffer from internal character encoding to HTTP output character encoding.',
		signature: '(string $contents , int $status): string'
	},
	mb_preferred_mime_name: {
		description: 'Get a MIME charset string for a specific encoding.',
		signature: '(string $encoding): string'
	},
	mb_strlen: {
		description: 'Gets the length of a string.',
		signature: '(string $str [, string $encoding ]): int'
	},
	mb_strpos: {
		description: 'Finds position of the first occurrence of a string in a string.',
		signature: '(string $haystack , string $needle [, int $offset = 0 [, string $encoding ]]): int'
	},
	mb_strrpos: {
		description: 'Performs a multibyte safe strrpos() operation based on the number of characters. needle position is counted from the beginning of haystack. First character\'s position is 0. Second character position is 1.',
		signature: '(string $haystack , string $needle [, int $offset = 0 [, string $encoding ]]): int'
	},
	mb_stripos: {
		description: 'mb_stripos() returns the numeric position of the first occurrence of needle in the haystack string. Unlike mb_strpos(), mb_stripos() is case-insensitive. If needle is not found, it returns FALSE.',
		signature: '(string $haystack , string $needle [, int $offset [, string $encoding ]]): int'
	},
	mb_strripos: {
		description: 'mb_strripos() performs multi-byte safe strripos() operation based on number of characters. needle position is counted from the beginning of haystack. First character\'s position is 0. Second character position is 1. Unlike mb_strrpos(), mb_strripos() is case-insensitive.',
		signature: '(string $haystack , string $needle [, int $offset = 0 [, string $encoding ]]): int'
	},
	mb_strstr: {
		description: 'mb_strstr() finds the first occurrence of needle in haystack and returns the portion of haystack. If needle is not found, it returns FALSE.',
		signature: '(string $haystack , string $needle [, bool $part = false [, string $encoding ]]): string'
	},
	mb_strrchr: {
		description: 'mb_strrchr() finds the last occurrence of needle in haystack and returns the portion of haystack. If needle is not found, it returns FALSE.',
		signature: '(string $haystack , string $needle [, bool $part = false [, string $encoding ]]): string'
	},
	mb_stristr: {
		description: 'mb_stristr() finds the first occurrence of needle in haystack and returns the portion of haystack. Unlike mb_strstr(), mb_stristr() is case-insensitive. If needle is not found, it returns FALSE.',
		signature: '(string $haystack , string $needle [, bool $part = false [, string $encoding ]]): string'
	},
	mb_strrichr: {
		description: 'mb_strrichr() finds the last occurrence of needle in haystack and returns the portion of haystack. Unlike mb_strrchr(), mb_strrichr() is case-insensitive. If needle is not found, it returns FALSE.',
		signature: '(string $haystack , string $needle [, bool $part = false [, string $encoding ]]): string'
	},
	mb_substr_count: {
		description: 'Counts the number of times the needle substring occurs in the haystack string.',
		signature: '(string $haystack , string $needle [, string $encoding ]): int'
	},
	mb_substr: {
		description: 'Performs a multi-byte safe substr() operation based on number of characters. Position is counted from the beginning of str. First character\'s position is 0. Second character position is 1, and so on.',
		signature: '(string $str , int $start [, int $length [, string $encoding ]]): string'
	},
	mb_strcut: {
		description: 'mb_strcut() performs equivalent operation as mb_substr() with different method. If start position is multi-byte character\'s second byte or larger, it starts from first byte of multi-byte character.',
		signature: '(string $str , int $start [, int $length [, string $encoding ]]): string'
	},
	mb_strwidth: {
		description: 'Returns the width of string str.',
		signature: '(string $str [, string $encoding ]): int'
	},
	mb_strimwidth: {
		description: 'Truncates string str to specified width.',
		signature: '(string $str , int $start , int $width [, string $trimmarker [, string $encoding ]]): string'
	},
	mb_convert_encoding: {
		description: 'Converts the character encoding of string str to to_encoding from optionally from_encoding.',
		signature: '(string $str , string $to_encoding [, mixed $from_encoding ]): string'
	},
	mb_detect_encoding: {
		description: 'Detects character encoding in string str.',
		signature: '(string $str [, mixed $encoding_list = mb_detect_order() [, bool $strict = false ]]): string'
	},
	mb_list_encodings: {
		description: 'Returns an array containing all supported encodings.',
		signature: '(void): array'
	},
	mb_encoding_aliases: {
		description: 'Returns an array of aliases for a known encoding type.',
		signature: '(string $encoding): array'
	},
	mb_convert_kana: {
		description: 'Performs a \"han-kaku\" - \"zen-kaku\" conversion for string str. This function is only useful for Japanese.',
		signature: '(string $str [, string $option = \"KV\" [, string $encoding ]]): string'
	},
	mb_encode_mimeheader: {
		description: 'Encodes a given string str by the MIME header encoding scheme.',
		signature: '(string $str [, string $charset [, string $transfer_encoding [, string $linefeed = \"\\r\\n\" [, int $indent = 0 ]]]]): string'
	},
	mb_decode_mimeheader: {
		description: 'Decodes encoded-word string str in MIME header.',
		signature: '(string $str): string'
	},
	mb_convert_variables: {
		description: 'Converts character encoding of variables vars in encoding from_encoding to encoding to_encoding.',
		signature: '(string $to_encoding , mixed $from_encoding , mixed &$vars [, mixed &$... ]): string'
	},
	mb_encode_numericentity: {
		description: 'Converts specified character codes in string str from HTML numeric character reference to character code.',
		signature: '(string $str , array $convmap , string $encoding): string'
	},
	mb_decode_numericentity: {
		description: 'Convert numeric string reference of string str in a specified block to character.',
		signature: '(string $str , array $convmap , string $encoding): string'
	},
	mb_send_mail: {
		description: 'Sends email. Headers and messages are converted and encoded according to the mb_language() setting. It\'s a wrapper function for mail(), so see also mail() for details.',
		signature: '(string $to , string $subject , string $message [, string $additional_headers = NULL [, string $additional_parameter = NULL ]]): bool'
	},
	mb_get_info: {
		description: 'mb_get_info() returns the internal setting parameters of mbstring.',
		signature: '([ string $type = \"all\" ]): mixed'
	},
	mb_check_encoding: {
		description: 'Checks if the specified byte stream is valid for the specified encoding. It is useful to prevent so-called \"Invalid Encoding Attack\".',
		signature: '([ string $var = NULL [, string $encoding = mb_internal_encoding() ]]): bool'
	},
	mb_regex_encoding: {
		description: 'Returns the current encoding for a multibyte regex as a string.',
		signature: '([ string $encoding ]): mixed'
	},
	mb_regex_set_options: {
		description: 'Sets the default options described by options for multibyte regex functions.',
		signature: '([ string $options = \"msr\" ]): string'
	},
	mb_ereg: {
		description: 'Executes the regular expression match with multibyte support.',
		signature: '(string $pattern , string $string [, array $regs ]): int'
	},
	mb_eregi: {
		description: 'Executes the case insensitive regular expression match with multibyte support.',
		signature: '(string $pattern , string $string [, array $regs ]): int'
	},
	mb_ereg_replace: {
		description: 'Scans string for matches to pattern, then replaces the matched text with replacement',
		signature: '(string $pattern , string $replacement , string $string [, string $option = \"msr\" ]): string'
	},
	mb_eregi_replace: {
		description: 'Scans string for matches to pattern, then replaces the matched text with replacement.',
		signature: '(string $pattern , string $replace , string $string [, string $option = \"msri\" ]): string'
	},
	mb_split: {
		description: 'Split a multibyte string using regular expression pattern and returns the result as an array.',
		signature: '(string $pattern , string $string [, int $limit = -1 ]): array'
	},
	mb_ereg_match: {
		description: 'A regular expression match for a multibyte string',
		signature: '(string $pattern , string $string [, string $option = \"msr\" ]): bool'
	},
	mb_ereg_search: {
		description: 'Performs a multibyte regular expression match for a predefined multibyte string.',
		signature: '([ string $pattern [, string $option = \"ms\" ]]): bool'
	},
	mb_ereg_search_pos: {
		description: 'Returns position and length of a matched part of the multibyte regular expression for a predefined multibyte string',
		signature: '([ string $pattern [, string $option = \"ms\" ]]): array'
	},
	mb_ereg_search_regs: {
		description: 'Returns the matched part of a multibyte regular expression.',
		signature: '([ string $pattern [, string $option = \"ms\" ]]): array'
	},
	mb_ereg_search_init: {
		description: 'mb_ereg_search_init() sets string and pattern for a multibyte regular expression. These values are used for mb_ereg_search(), mb_ereg_search_pos(), and mb_ereg_search_regs().',
		signature: '(string $string [, string $pattern [, string $option = \"msr\" ]]): bool'
	},
	mb_ereg_search_getregs: {
		description: 'Retrieve the result from the last multibyte regular expression match',
		signature: '(void): array'
	},
	mb_ereg_search_getpos: {
		description: 'Returns the start point for the next regular expression match.',
		signature: '(void): int'
	},
	mb_ereg_search_setpos: {
		description: 'mb_ereg_search_setpos() sets the starting point of a match for mb_ereg_search().',
		signature: '(int $position): bool'
	},
	gd_info: {
		description: 'Gets information about the version and capabilities of the installed GD library.',
		signature: '(void): array'
	},
	imagearc: {
		description: 'imagearc() draws an arc of circle centered at the given coordinates.',
		signature: '(resource $image , int $cx , int $cy , int $width , int $height , int $start , int $end , int $color): bool'
	},
	imageellipse: {
		description: 'Draws an ellipse centered at the specified coordinates.',
		signature: '(resource $image , int $cx , int $cy , int $width , int $height , int $color): bool'
	},
	imagechar: {
		description: 'imagechar() draws the first character of c in the image identified by image with its upper-left at x,y (top left is 0, 0) with the color color.',
		signature: '(resource $image , int $font , int $x , int $y , string $c , int $color): bool'
	},
	imagecharup: {
		description: 'Draws the character c vertically at the specified coordinate on the given image.',
		signature: '(resource $image , int $font , int $x , int $y , string $c , int $color): bool'
	},
	imagecolorat: {
		description: 'Returns the index of the color of the pixel at the specified location in the image specified by image.',
		signature: '(resource $image , int $x , int $y): int'
	},
	imagecolorallocate: {
		description: 'Returns a color identifier representing the color composed of the given RGB components.',
		signature: '(resource $image , int $red , int $green , int $blue): int'
	},
	imagepalettecopy: {
		description: 'imagepalettecopy() copies the palette from the source image to the destination image.',
		signature: '(resource $destination , resource $source): void'
	},
	imagecreatefromstring: {
		description: 'imagecreatefromstring() returns an image identifier representing the image obtained from the given data. These types will be automatically detected if your build of PHP supports them: JPEG, PNG, GIF, WBMP, and GD2.',
		signature: '(string $data): resource'
	},
	imagecolorclosest: {
		description: 'Returns the index of the color in the palette of the image which is \"closest\" to the specified RGB value.',
		signature: '(resource $image , int $red , int $green , int $blue): int'
	},
	imagecolorclosesthwb: {
		description: 'Get the index of the color which has the hue, white and blackness nearest the given color.',
		signature: '(resource $image , int $red , int $green , int $blue): int'
	},
	imagecolordeallocate: {
		description: 'De-allocates a color previously allocated with imagecolorallocate() or imagecolorallocatealpha().',
		signature: '(resource $image , int $color): bool'
	},
	imagecolorresolve: {
		description: 'This function is guaranteed to return a color index for a requested color, either the exact color or the closest possible alternative.',
		signature: '(resource $image , int $red , int $green , int $blue): int'
	},
	imagecolorexact: {
		description: 'Returns the index of the specified color in the palette of the image.',
		signature: '(resource $image , int $red , int $green , int $blue): int'
	},
	imagecolorset: {
		description: 'This sets the specified index in the palette to the specified color. This is useful for creating flood-fill-like effects in palleted images without the overhead of performing the actual flood-fill.',
		signature: '(resource $image , int $index , int $red , int $green , int $blue [, int $alpha = 0 ]): void'
	},
	imagecolortransparent: {
		description: 'Sets the transparent color in the given image.',
		signature: '(resource $image [, int $color ]): int'
	},
	imagecolorstotal: {
		description: 'Returns the number of colors in an image palette.',
		signature: '(resource $image): int'
	},
	imagecolorsforindex: {
		description: 'Gets the color for a specified index.',
		signature: '(resource $image , int $index): array'
	},
	imagecopy: {
		description: 'Copy a part of src_im onto dst_im starting at the x,y coordinates src_x, src_y with a width of src_w and a height of src_h. The portion defined will be copied onto the x,y coordinates, dst_x and dst_y.',
		signature: '(resource $dst_im , resource $src_im , int $dst_x , int $dst_y , int $src_x , int $src_y , int $src_w , int $src_h): bool'
	},
	imagecopymerge: {
		description: 'Copy a part of src_im onto dst_im starting at the x,y coordinates src_x, src_y with a width of src_w and a height of src_h. The portion defined will be copied onto the x,y coordinates, dst_x and dst_y.',
		signature: '(resource $dst_im , resource $src_im , int $dst_x , int $dst_y , int $src_x , int $src_y , int $src_w , int $src_h , int $pct): bool'
	},
	imagecopymergegray: {
		description: 'imagecopymergegray() copy a part of src_im onto dst_im starting at the x,y coordinates src_x, src_y with a width of src_w and a height of src_h. The portion defined will be copied onto the x,y coordinates, dst_x and dst_y.',
		signature: '(resource $dst_im , resource $src_im , int $dst_x , int $dst_y , int $src_x , int $src_y , int $src_w , int $src_h , int $pct): bool'
	},
	imagecopyresized: {
		description: 'imagecopyresized() copies a rectangular portion of one image to another image. dst_image is the destination image, src_image is the source image identifier.',
		signature: '(resource $dst_image , resource $src_image , int $dst_x , int $dst_y , int $src_x , int $src_y , int $dst_w , int $dst_h , int $src_w , int $src_h): bool'
	},
	imagecreate: {
		description: 'imagecreate() returns an image identifier representing a blank image of specified size.',
		signature: '(int $width , int $height): resource'
	},
	imagecreatetruecolor: {
		description: 'imagecreatetruecolor() returns an image identifier representing a black image of the specified size.',
		signature: '(int $width , int $height): resource'
	},
	imageistruecolor: {
		description: 'imageistruecolor() finds whether the image image is a truecolor image.',
		signature: '(resource $image): bool'
	},
	imagetruecolortopalette: {
		description: 'imagetruecolortopalette() converts a truecolor image to a palette image. The code for this function was originally drawn from the Independent JPEG Group library code, which is excellent. The code has been modified to preserve as much alpha channel information as possible in the resulting palette, in addition to preserving colors as well as possible. This does not work as well as might be hoped. It is usually best to simply produce a truecolor output image instead, which guarantees the highest output quality.',
		signature: '(resource $image , bool $dither , int $ncolors): bool'
	},
	imagesetthickness: {
		description: 'imagesetthickness() sets the thickness of the lines drawn when drawing rectangles, polygons, ellipses etc. etc. to thickness pixels.',
		signature: '(resource $image , int $thickness): bool'
	},
	imagefilledarc: {
		description: 'Draws a partial arc centered at the specified coordinate in the given image.',
		signature: '(resource $image , int $cx , int $cy , int $width , int $height , int $start , int $end , int $color , int $style): bool'
	},
	imagefilledellipse: {
		description: 'Draws an ellipse centered at the specified coordinate on the given image.',
		signature: '(resource $image , int $cx , int $cy , int $width , int $height , int $color): bool'
	},
	imagealphablending: {
		description: 'imagealphablending() allows for two different modes of drawing on truecolor images. In blending mode, the alpha channel component of the color supplied to all drawing function, such as imagesetpixel() determines how much of the underlying color should be allowed to shine through. As a result, gd automatically blends the existing color at that point with the drawing color, and stores the result in the image. The resulting pixel is opaque. In non-blending mode, the drawing color is copied literally with its alpha channel information, replacing the destination pixel. Blending mode is not available when drawing on palette images.',
		signature: '(resource $image , bool $blendmode): bool'
	},
	imagesavealpha: {
		description: 'imagesavealpha() sets the flag to attempt to save full alpha channel information (as opposed to single-color transparency) when saving PNG images.',
		signature: '(resource $image , bool $saveflag): bool'
	},
	imagecolorallocatealpha: {
		description: 'imagecolorallocatealpha() behaves identically to imagecolorallocate() with the addition of the transparency parameter alpha.',
		signature: '(resource $image , int $red , int $green , int $blue , int $alpha): int'
	},
	imagecolorresolvealpha: {
		description: 'This function is guaranteed to return a color index for a requested color, either the exact color or the closest possible alternative.',
		signature: '(resource $image , int $red , int $green , int $blue , int $alpha): int'
	},
	imagecolorclosestalpha: {
		description: 'Returns the index of the color in the palette of the image which is \"closest\" to the specified RGB value and alpha level.',
		signature: '(resource $image , int $red , int $green , int $blue , int $alpha): int'
	},
	imagecolorexactalpha: {
		description: 'Returns the index of the specified color+alpha in the palette of the image.',
		signature: '(resource $image , int $red , int $green , int $blue , int $alpha): int'
	},
	imagecopyresampled: {
		description: 'imagecopyresampled() copies a rectangular portion of one image to another image, smoothly interpolating pixel values so that, in particular, reducing the size of an image still retains a great deal of clarity.',
		signature: '(resource $dst_image , resource $src_image , int $dst_x , int $dst_y , int $src_x , int $src_y , int $dst_w , int $dst_h , int $src_w , int $src_h): bool'
	},
	imagegrabwindow: {
		description: 'Grabs a window or its client area using a windows handle (HWND property in COM instance)',
		signature: '(int $window_handle [, int $client_area = 0 ]): resource'
	},
	imagegrabscreen: {
		description: 'Grabs a screenshot of the whole screen.',
		signature: '(void): resource'
	},
	imagerotate: {
		description: 'Rotates the image image using the given angle in degrees.',
		signature: '(resource $image , float $angle , int $bgd_color [, int $ignore_transparent = 0 ]): resource'
	},
	imageantialias: {
		description: 'Activate the fast drawing antialiased methods for lines and wired polygons. It does not support alpha components. It works using a direct blend operation. It works only with truecolor images.',
		signature: '(resource $image , bool $enabled): bool'
	},
	imagesettile: {
		description: 'imagesettile() sets the tile image to be used by all region filling functions (such as imagefill() and imagefilledpolygon()) when filling with the special color IMG_COLOR_TILED.',
		signature: '(resource $image , resource $tile): bool'
	},
	imagesetbrush: {
		description: 'imagesetbrush() sets the brush image to be used by all line drawing functions (such as imageline() and imagepolygon()) when drawing with the special colors IMG_COLOR_BRUSHED or IMG_COLOR_STYLEDBRUSHED.',
		signature: '(resource $image , resource $brush): bool'
	},
	imagesetstyle: {
		description: 'imagesetstyle() sets the style to be used by all line drawing functions (such as imageline() and imagepolygon()) when drawing with the special color IMG_COLOR_STYLED or lines of images with color IMG_COLOR_STYLEDBRUSHED.',
		signature: '(resource $image , array $style): bool'
	},
	imagecreatefrompng: {
		description: 'imagecreatefrompng() returns an image identifier representing the image obtained from the given filename.',
		signature: '(string $filename): resource'
	},
	imagecreatefromgif: {
		description: 'imagecreatefromgif() returns an image identifier representing the image obtained from the given filename.',
		signature: '(string $filename): resource'
	},
	imagecreatefromjpeg: {
		description: 'imagecreatefromjpeg() returns an image identifier representing the image obtained from the given filename.',
		signature: '(string $filename): resource'
	},
	imagecreatefromwbmp: {
		description: 'imagecreatefromwbmp() returns an image identifier representing the image obtained from the given filename.',
		signature: '(string $filename): resource'
	},
	imagecreatefromxbm: {
		description: 'imagecreatefromxbm() returns an image identifier representing the image obtained from the given filename.',
		signature: '(string $filename): resource'
	},
	imagecreatefromgd: {
		description: 'Create a new image from GD file or URL.',
		signature: '(string $filename): resource'
	},
	imagecreatefromgd2: {
		description: 'Create a new image from GD2 file or URL.',
		signature: '(string $filename): resource'
	},
	imagecreatefromgd2part: {
		description: 'Create a new image from a given part of GD2 file or URL.',
		signature: '(string $filename , int $srcX , int $srcY , int $width , int $height): resource'
	},
	imagepng: {
		description: 'Outputs or saves a PNG image from the given image.',
		signature: '(resource $image [, string $filename [, int $quality [, int $filters ]]]): bool'
	},
	imagegif: {
		description: 'imagegif() creates the GIF file in filename from the image image. The image argument is the return from the imagecreate() or imagecreatefrom* function.',
		signature: '(resource $image [, string $filename ]): bool'
	},
	imagejpeg: {
		description: 'imagejpeg() creates a JPEG file from the given image.',
		signature: '(resource $image [, string $filename [, int $quality ]]): bool'
	},
	imagewbmp: {
		description: 'imagewbmp() outputs or save a WBMP version of the given image.',
		signature: '(resource $image [, string $filename [, int $foreground ]]): bool'
	},
	imagegd: {
		description: 'Outputs a GD image to the given filename.',
		signature: '(resource $image [, string $filename ]): bool'
	},
	imagegd2: {
		description: 'Outputs a GD2 image to the given filename.',
		signature: '(resource $image [, string $filename [, int $chunk_size [, int $type = IMG_GD2_RAW ]]]): bool'
	},
	imagedestroy: {
		description: 'imagedestroy() frees any memory associated with image image.',
		signature: '(resource $image): bool'
	},
	imagegammacorrect: {
		description: 'Applies gamma correction to the given gd image given an input and an output gamma.',
		signature: '(resource $image , float $inputgamma , float $outputgamma): bool'
	},
	imagefill: {
		description: 'Performs a flood fill starting at the given coordinate (top left is 0, 0) with the given color in the image.',
		signature: '(resource $image , int $x , int $y , int $color): bool'
	},
	imagefilledpolygon: {
		description: 'imagefilledpolygon() creates a filled polygon in the given image.',
		signature: '(resource $image , array $points , int $num_points , int $color): bool'
	},
	imagefilledrectangle: {
		description: 'Creates a rectangle filled with color in the given image starting at point 1 and ending at point 2. 0, 0 is the top left corner of the image.',
		signature: '(resource $image , int $x1 , int $y1 , int $x2 , int $y2 , int $color): bool'
	},
	imagefilltoborder: {
		description: 'imagefilltoborder() performs a flood fill whose border color is defined by border. The starting point for the fill is x, y (top left is 0, 0) and the region is filled with color color.',
		signature: '(resource $image , int $x , int $y , int $border , int $color): bool'
	},
	imagefontwidth: {
		description: 'Returns the pixel width of a character in font.',
		signature: '(int $font): int'
	},
	imagefontheight: {
		description: 'Returns the pixel height of a character in the specified font.',
		signature: '(int $font): int'
	},
	imageinterlace: {
		description: 'imageinterlace() turns the interlace bit on or off.',
		signature: '(resource $image [, int $interlace = 0 ]): int'
	},
	imageline: {
		description: 'Draws a line between the two given points.',
		signature: '(resource $image , int $x1 , int $y1 , int $x2 , int $y2 , int $color): bool'
	},
	imageloadfont: {
		description: 'imageloadfont() loads a user-defined bitmap and returns its identifier.',
		signature: '(string $file): int'
	},
	imagepolygon: {
		description: 'imagepolygon() creates a polygon in the given image.',
		signature: '(resource $image , array $points , int $num_points , int $color): bool'
	},
	imagerectangle: {
		description: 'imagerectangle() creates a rectangle starting at the specified coordinates.',
		signature: '(resource $image , int $x1 , int $y1 , int $x2 , int $y2 , int $color): bool'
	},
	imagesetpixel: {
		description: 'imagesetpixel() draws a pixel at the specified coordinate.',
		signature: '(resource $image , int $x , int $y , int $color): bool'
	},
	imagestring: {
		description: 'Draws a string at the given coordinates.',
		signature: '(resource $image , int $font , int $x , int $y , string $string , int $color): bool'
	},
	imagestringup: {
		description: 'Draws a string vertically at the given coordinates.',
		signature: '(resource $image , int $font , int $x , int $y , string $string , int $color): bool'
	},
	imagesx: {
		description: 'Returns the width of the given image resource.',
		signature: '(resource $image): int'
	},
	imagesy: {
		description: 'Returns the height of the given image resource.',
		signature: '(resource $image): int'
	},
	imagedashedline: {
		description: 'This function is deprecated. Use combination of imagesetstyle() and imageline() instead.',
		signature: '(resource $image , int $x1 , int $y1 , int $x2 , int $y2 , int $color): bool'
	},
	imagettfbbox: {
		description: 'This function calculates and returns the bounding box in pixels for a TrueType text.',
		signature: '(float $size , float $angle , string $fontfile , string $text): array'
	},
	imagettftext: {
		description: 'Writes the given text into the image using TrueType fonts.',
		signature: '(resource $image , float $size , float $angle , int $x , int $y , int $color , string $fontfile , string $text): array'
	},
	imageftbbox: {
		description: 'This function calculates and returns the bounding box in pixels for a FreeType text.',
		signature: '(float $size , float $angle , string $fontfile , string $text [, array $extrainfo ]): array'
	},
	imagefttext: {
		description: 'Parameters imageAn image resource, returned by one of the image creation functions,such as imagecreatetruecolor().',
		signature: '(resource $image , float $size , float $angle , int $x , int $y , int $color , string $fontfile , string $text [, array $extrainfo ]): array'
	},
	imagetypes: {
		description: 'Returns the image types supported by the current PHP installation.',
		signature: '(void): int'
	},
	jpeg2wbmp: {
		description: 'Converts a JPEG file into a WBMP file.',
		signature: '(string $jpegname , string $wbmpname , int $dest_height , int $dest_width , int $threshold): bool'
	},
	png2wbmp: {
		description: 'Converts a PNG file into a WBMP file.',
		signature: '(string $pngname , string $wbmpname , int $dest_height , int $dest_width , int $threshold): bool'
	},
	image2wbmp: {
		description: 'image2wbmp() outputs or save a WBMP version of the given image.',
		signature: '(resource $image [, string $filename [, int $threshold ]]): bool'
	},
	imagelayereffect: {
		description: 'Set the alpha blending flag to use the bundled libgd layering effects.',
		signature: '(resource $image , int $effect): bool'
	},
	imagexbm: {
		description: 'Outputs or save an XBM version of the given image.',
		signature: '(resource $image , string $filename [, int $foreground ]): bool'
	},
	imagecolormatch: {
		description: 'Makes the colors of the palette version of an image more closely match the true color version.',
		signature: '(resource $image1 , resource $image2): bool'
	},
	imagefilter: {
		description: 'imagefilter() applies the given filter filtertype on the image.',
		signature: '(resource $image , int $filtertype [, int $arg1 [, int $arg2 [, int $arg3 [, int $arg4 ]]]]): bool'
	},
	imageconvolution: {
		description: 'Applies a convolution matrix on the image, using the given coefficient and offset.',
		signature: '(resource $image , array $matrix , float $div , float $offset): bool'
	},
	textdomain: {
		description: 'This function sets the domain to search within when calls are made to gettext(), usually the named after an application.',
		signature: '(string $text_domain): string'
	},
	gettext: {
		description: 'Looks up a message in the current domain.',
		signature: '(string $message): string'
	},
	dgettext: {
		description: 'The dgettext() function allows you to override the current domain for a single message lookup.',
		signature: '(string $domain , string $message): string'
	},
	dcgettext: {
		description: 'This function allows you to override the current domain for a single message lookup.',
		signature: '(string $domain , string $message , int $category): string'
	},
	bindtextdomain: {
		description: 'The bindtextdomain() function sets the path for a domain.',
		signature: '(string $domain , string $directory): string'
	},
	ngettext: {
		description: 'The plural version of gettext(). Some languages have more than one form for plural messages dependent on the count.',
		signature: '(string $msgid1 , string $msgid2 , int $n): string'
	},
	dngettext: {
		description: 'The dngettext() function allows you to override the current domain for a single plural message lookup.',
		signature: '(string $domain , string $msgid1 , string $msgid2 , int $n): string'
	},
	dcngettext: {
		description: 'This function allows you to override the current domain for a single plural message lookup.',
		signature: '(string $domain , string $msgid1 , string $msgid2 , int $n , int $category): string'
	},
	bind_textdomain_codeset: {
		description: 'With bind_textdomain_codeset(), you can set in which encoding will be messages from domain returned by gettext() and similar functions.',
		signature: '(string $domain , string $codeset): string'
	},
	curl_init: {
		description: 'Initializes a new session and return a cURL handle for use with the curl_setopt(), curl_exec(), and curl_close() functions.',
		signature: '([ string $url = NULL ]): resource'
	},
	curl_copy_handle: {
		description: 'Copies a cURL handle keeping the same preferences.',
		signature: '(resource $ch): resource'
	},
	curl_version: {
		description: 'Returns information about the cURL version.',
		signature: '([ int $age = CURLVERSION_NOW ]): array'
	},
	curl_setopt: {
		description: 'Sets an option on the given cURL session handle.',
		signature: '(resource $ch , int $option , mixed $value): bool'
	},
	curl_setopt_array: {
		description: 'Sets multiple options for a cURL session. This function is useful for setting a large amount of cURL options without repetitively calling curl_setopt().',
		signature: '(resource $ch , array $options): bool'
	},
	curl_exec: {
		description: 'Execute the given cURL session.',
		signature: '(resource $ch): mixed'
	},
	curl_getinfo: {
		description: 'Gets information about the last transfer.',
		signature: '(resource $ch [, int $opt = 0 ]): mixed'
	},
	curl_error: {
		description: 'Returns a clear text error message for the last cURL operation.',
		signature: '(resource $ch): string'
	},
	curl_errno: {
		description: 'Returns the error number for the last cURL operation.',
		signature: '(resource $ch): int'
	},
	curl_close: {
		description: 'Closes a cURL session and frees all resources. The cURL handle, ch, is also deleted.',
		signature: '(resource $ch): void'
	},
	curl_multi_init: {
		description: 'Allows the processing of multiple cURL handles in parallel.',
		signature: '(void): resource'
	},
	curl_multi_add_handle: {
		description: 'Adds the ch handle to the multi handle mh',
		signature: '(resource $mh , resource $ch): int'
	},
	curl_multi_remove_handle: {
		description: 'Removes a given ch handle from the given mh handle. When the ch handle has been removed, it is again perfectly legal to run curl_exec() on this handle. Removing the ch handle while being used, will effectively halt the transfer in progress involving that handle.',
		signature: '(resource $mh , resource $ch): int'
	},
	curl_multi_select: {
		description: 'Blocks until there is activity on any of the curl_multi connections.',
		signature: '(resource $mh [, float $timeout = 1.0 ]): int'
	},
	curl_multi_exec: {
		description: 'Processes each of the handles in the stack. This method can be called whether or not a handle needs to read or write data.',
		signature: '(resource $mh , int &$still_running): int'
	},
	curl_multi_getcontent: {
		description: 'If CURLOPT_RETURNTRANSFER is an option that is set for a specific handle, then this function will return the content of that cURL handle in the form of a string.',
		signature: '(resource $ch): string'
	},
	curl_multi_info_read: {
		description: 'Ask the multi handle if there are any messages or information from the individual transfers. Messages may include information such as an error code from the transfer or just the fact that a transfer is completed.',
		signature: '(resource $mh [, int &$msgs_in_queue = NULL ]): array'
	},
	curl_multi_close: {
		description: 'Closes a set of cURL handles.',
		signature: '(resource $mh): void'
	},
	exif_read_data: {
		description: 'exif_read_data() reads the EXIF headers from a JPEG or TIFF image file. This way you can read meta data generated by digital cameras.',
		signature: '(string $filename [, string $sections = NULL [, bool $arrays = false [, bool $thumbnail = false ]]]): array'
	},
	read_exif_data: {
		description: 'Alias of exif_read_data exif_thumbnail GD Exif Functions PHP Manual read_exif_data (PHP 4 >= 4.0.1, PHP 5)',
	},
	exif_tagname: {
		description: 'Parameters index The Tag ID for which a Tag Name will be looked up.',
		signature: '(int $index): string'
	},
	exif_thumbnail: {
		description: 'exif_thumbnail() reads the embedded thumbnail of a TIFF or JPEG image.',
		signature: '(string $filename [, int &$width [, int &$height [, int &$imagetype ]]]): string'
	},
	exif_imagetype: {
		description: 'exif_imagetype() reads the first bytes of an image and checks its signature.',
		signature: '(string $filename): int'
	},
	xmlrpc_encode: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(mixed $value): string'
	},
	xmlrpc_decode: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(string $xml [, string $encoding = \"iso-8859-1\" ]): mixed'
	},
	xmlrpc_decode_request: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(string $xml , string &$method [, string $encoding ]): mixed'
	},
	xmlrpc_encode_request: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(string $method , mixed $params [, array $output_options ]): string'
	},
	xmlrpc_get_type: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(mixed $value): string'
	},
	xmlrpc_set_type: {
		description: 'Sets xmlrpc type, base64 or datetime, for a PHP string value.',
		signature: '(string &$value , string $type): bool'
	},
	xmlrpc_is_fault: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(array $arg): bool'
	},
	xmlrpc_server_create: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(void): resource'
	},
	xmlrpc_server_destroy: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(resource $server): int'
	},
	xmlrpc_server_register_method: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(resource $server , string $method_name , string $function): bool'
	},
	xmlrpc_server_call_method: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(resource $server , string $xml , mixed $user_data [, array $output_options ]): string'
	},
	xmlrpc_parse_method_descriptions: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(string $xml): array'
	},
	xmlrpc_server_add_introspection_data: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(resource $server , array $desc): int'
	},
	xmlrpc_server_register_introspection_callback: {
		description: 'This function is EXPERIMENTAL. The behaviour of this function, its name, and surrounding documentation may change without notice in a future release of PHP. This function should be used at your own risk.',
		signature: '(resource $server , string $function): bool'
	},
	openssl_pkey_free: {
		description: 'This function frees a private key created by openssl_pkey_new().',
		signature: '(resource $key): void'
	},
	openssl_pkey_new: {
		description: 'openssl_pkey_new() generates a new private and public key pair. The public component of the key can be obtained using openssl_pkey_get_public().',
		signature: '([ array $configargs ]): resource'
	},
	openssl_pkey_export: {
		description: 'openssl_pkey_export() exports key as a PEM encoded string and stores it into out (which is passed by reference).',
		signature: '(mixed $key , string &$out [, string $passphrase [, array $configargs ]]): bool'
	},
	openssl_pkey_export_to_file: {
		description: 'openssl_pkey_export_to_file() saves an ascii-armoured (PEM encoded) rendition of key into the file named by outfilename.',
		signature: '(mixed $key , string $outfilename [, string $passphrase [, array $configargs ]]): bool'
	},
	openssl_pkey_get_private: {
		description: 'openssl_get_privatekey() parses key and prepares it for use by other functions.',
		signature: '(mixed $key [, string $passphrase = \"\" ]): resource'
	},
	openssl_pkey_get_public: {
		description: 'openssl_get_publickey() extracts the public key from certificate and prepares it for use by other functions.',
		signature: '(mixed $certificate): resource'
	},
	openssl_pkey_get_details: {
		description: 'This function returns the key details (bits, key, type).',
		signature: '(resource $key): array'
	},
	openssl_free_key: {
		description: 'openssl_free_key() frees the key associated with the specified key_identifier from memory.',
		signature: '(resource $key_identifier): void'
	},
	openssl_get_privatekey: {
		description: 'Alias of openssl_pkey_get_private openssl_get_md_methods openssl_get_publickey OpenSSL Functions PHP Manual openssl_get_privatekey (PHP 4 >= 4.0.4, PHP 5)',
	},
	openssl_get_publickey: {
		description: 'Alias of openssl_pkey_get_public openssl_get_privatekey openssl_open OpenSSL Functions PHP Manual openssl_get_publickey (PHP 4 >= 4.0.4, PHP 5)',
	},
	openssl_x509_read: {
		description: 'openssl_x509_read() parses the certificate supplied by x509certdata and returns a resource identifier for it.',
		signature: '(mixed $x509certdata): resource'
	},
	openssl_x509_free: {
		description: 'openssl_x509_free() frees the certificate associated with the specified x509cert resource from memory.',
		signature: '(resource $x509cert): void'
	},
	openssl_x509_parse: {
		description: 'openssl_x509_parse() returns information about the supplied x509cert, including fields such as subject name, issuer name, purposes, valid from and valid to dates etc.',
		signature: '(mixed $x509cert [, bool $shortnames = true ]): array'
	},
	openssl_x509_checkpurpose: {
		description: 'openssl_x509_checkpurpose() examines a certificate to see if it can be used for the specified purpose.',
		signature: '(mixed $x509cert , int $purpose [, array $cainfo = array() [, string $untrustedfile ]]): int'
	},
	openssl_x509_check_private_key: {
		description: 'Checks whether the given key is the private key that corresponds to cert.',
		signature: '(mixed $cert , mixed $key): bool'
	},
	openssl_x509_export: {
		description: 'openssl_x509_export() stores x509 into a string named by output in a PEM encoded format.',
		signature: '(mixed $x509 , string &$output [, bool $notext = TRUE ]): bool'
	},
	openssl_x509_export_to_file: {
		description: 'openssl_x509_export_to_file() stores x509 into a file named by outfilename in a PEM encoded format.',
		signature: '(mixed $x509 , string $outfilename [, bool $notext = TRUE ]): bool'
	},
	openssl_pkcs12_export: {
		description: 'openssl_pkcs12_export() stores x509 into a string named by out in a PKCS#12 file format.',
		signature: '(mixed $x509 , string &$out , mixed $priv_key , string $pass [, array $args ]): bool'
	},
	openssl_pkcs12_export_to_file: {
		description: 'openssl_pkcs12_export_to_file() stores x509 into a file named by filename in a PKCS#12 file format.',
		signature: '(mixed $x509 , string $filename , mixed $priv_key , string $pass [, array $args ]): bool'
	},
	openssl_pkcs12_read: {
		description: 'openssl_pkcs12_read() parses the PKCS#12 certificate store supplied by pkcs12 into a array named certs.',
		signature: '(string $pkcs12 , array &$certs , string $pass): bool'
	},
	openssl_csr_new: {
		description: 'openssl_csr_new() generates a new CSR (Certificate Signing Request) based on the information provided by dn, which represents the Distinguished Name to be used in the certificate.',
		signature: '(array $dn , resource &$privkey [, array $configargs [, array $extraattribs ]]): mixed'
	},
	openssl_csr_export: {
		description: 'openssl_csr_export() takes the Certificate Signing Request represented by csr and stores it as ascii-armoured text into out, which is passed by reference.',
		signature: '(resource $csr , string &$out [, bool $notext = true ]): bool'
	},
	openssl_csr_export_to_file: {
		description: 'openssl_csr_export_to_file() takes the Certificate Signing Request represented by csr and saves it as ascii-armoured text into the file named by outfilename.',
		signature: '(resource $csr , string $outfilename [, bool $notext = true ]): bool'
	},
	openssl_csr_sign: {
		description: 'openssl_csr_sign() generates an x509 certificate resource from the given CSR.',
		signature: '(mixed $csr , mixed $cacert , mixed $priv_key , int $days [, array $configargs [, int $serial = 0 ]]): resource'
	},
	openssl_csr_get_subject: {
		description: 'This function is currently not documented; only its argument list is available.',
		signature: '(mixed $csr [, bool $use_shortnames = true ]): array'
	},
	openssl_csr_get_public_key: {
		description: 'This function is currently not documented; only its argument list is available.',
		signature: '(mixed $csr [, bool $use_shortnames = true ]): resource'
	},
	openssl_digest: {
		description: 'Computes a digest hash value for the given data using a given method, and returns a raw or binhex encoded string.',
		signature: '(string $data , string $method [, bool $raw_output = false ]): string'
	},
	openssl_encrypt: {
		description: 'Encrypts given data with given method and key, returns a raw or base64 encoded string',
		signature: '(string $data , string $method , string $password [, bool $raw_output = false [, string $iv = \"\" ]]): string'
	},
	openssl_decrypt: {
		description: 'Takes a raw or base64 encoded string and decrypts it using a given method and key.',
		signature: '(string $data , string $method , string $password [, bool $raw_input = false [, string $iv = \"\" ]]): string'
	},
	openssl_cipher_iv_length: {
		description: 'Gets the cipher iv length.',
		signature: '(string $method): integer'
	},
	openssl_sign: {
		description: 'openssl_sign() computes a signature for the specified data by using SHA1 for hashing followed by encryption using the private key associated with priv_key_id. Note that the data itself is not encrypted.',
		signature: '(string $data , string &$signature , mixed $priv_key_id [, int $signature_alg = OPENSSL_ALGO_SHA1 ]): bool'
	},
	openssl_verify: {
		description: 'openssl_verify() verifies that the signature is correct for the specified data using the public key associated with pub_key_id. This must be the public key corresponding to the private key used for signing.',
		signature: '(string $data , string $signature , mixed $pub_key_id [, int $signature_alg = OPENSSL_ALGO_SHA1 ]): int'
	},
	openssl_seal: {
		description: 'openssl_seal() seals (encrypts) data by using RC4 with a randomly generated secret key. The key is encrypted with each of the public keys associated with the identifiers in pub_key_ids and each encrypted key is returned in env_keys. This means that one can send sealed data to multiple recipients (provided one has obtained their public keys). Each recipient must receive both the sealed data and the envelope key that was encrypted with the recipient\'s public key.',
		signature: '(string $data , string &$sealed_data , array &$env_keys , array $pub_key_ids [, string $method ]): int'
	},
	openssl_open: {
		description: 'openssl_open() opens (decrypts) sealed_data using the private key associated with the key identifier priv_key_id and the envelope key env_key, and fills open_data with the decrypted data. The envelope key is generated when the data are sealed and can only be used by one specific private key. See openssl_seal() for more information.',
		signature: '(string $sealed_data , string &$open_data , string $env_key , mixed $priv_key_id [, string $method ]): bool'
	},
	openssl_pkcs7_verify: {
		description: 'openssl_pkcs7_verify() reads the S/MIME message contained in the given file and examines the digital signature.',
		signature: '(string $filename , int $flags [, string $outfilename [, array $cainfo [, string $extracerts [, string $content ]]]]): mixed'
	},
	openssl_pkcs7_decrypt: {
		description: 'Decrypts the S/MIME encrypted message contained in the file specified by infilename using the certificate and its associated private key specified by recipcert and recipkey.',
		signature: '(string $infilename , string $outfilename , mixed $recipcert [, mixed $recipkey ]): bool'
	},
	openssl_pkcs7_sign: {
		description: 'openssl_pkcs7_sign() takes the contents of the file named infilename and signs them using the certificate and its matching private key specified by signcert and privkey parameters.',
		signature: '(string $infilename , string $outfilename , mixed $signcert , mixed $privkey , array $headers [, int $flags = PKCS7_DETACHED [, string $extracerts ]]): bool'
	},
	openssl_pkcs7_encrypt: {
		description: 'openssl_pkcs7_encrypt() takes the contents of the file named infile and encrypts them using an RC2 40-bit cipher so that they can only be read by the intended recipients specified by recipcerts.',
		signature: '(string $infile , string $outfile , mixed $recipcerts , array $headers [, int $flags = 0 [, int $cipherid = OPENSSL_CIPHER_RC2_40 ]]): bool'
	},
	openssl_private_encrypt: {
		description: 'openssl_private_encrypt() encrypts data with private key and stores the result into crypted. Encrypted data can be decrypted via openssl_public_decrypt().',
		signature: '(string $data , string &$crypted , mixed $key [, int $padding = OPENSSL_PKCS1_PADDING ]): bool'
	},
	openssl_private_decrypt: {
		description: 'openssl_private_decrypt() decrypts data that was previous encrypted via openssl_public_encrypt() and stores the result into decrypted.',
		signature: '(string $data , string &$decrypted , mixed $key [, int $padding = OPENSSL_PKCS1_PADDING ]): bool'
	},
	openssl_public_encrypt: {
		description: 'openssl_public_encrypt() encrypts data with public key and stores the result into crypted. Encrypted data can be decrypted via openssl_private_decrypt().',
		signature: '(string $data , string &$crypted , mixed $key [, int $padding = OPENSSL_PKCS1_PADDING ]): bool'
	},
	openssl_public_decrypt: {
		description: 'openssl_public_decrypt() decrypts data that was previous encrypted via openssl_private_encrypt() and stores the result into decrypted.',
		signature: '(string $data , string &$decrypted , mixed $key [, int $padding = OPENSSL_PKCS1_PADDING ]): bool'
	},
	openssl_get_md_methods: {
		description: 'Gets a list of available digest methods.',
		signature: '([ bool $aliases = false ]): array'
	},
	openssl_get_cipher_methods: {
		description: 'Gets a list of available cipher methods.',
		signature: '([ bool $aliases = false ]): array'
	},
	openssl_dh_compute_key: {
		description: 'This function is currently not documented; only its argument list is available.',
		signature: '(string $pub_key , resource $dh_key): string'
	},
	openssl_random_pseudo_bytes: {
		description: 'Generates a string of pseudo-random bytes, with the number of bytes determined by the length parameter.',
		signature: '(int $length [, bool &$crypto_strong ]): string'
	},
	openssl_error_string: {
		description: 'openssl_error_string() returns the last error from the openSSL library. Error messages are stacked, so this function should be called multiple times to collect all of the information.',
		signature: '(void): string'
	},
	use_soap_error_handler: {
		description: 'This function sets whether or not to use the SOAP error handler in the SOAP server. It will return the previous value. If set to TRUE, details of errors in a SoapServer application will be sent to the clients. If FALSE, no information will be sent.',
		signature: '([ bool $handler = true ]): bool'
	},
	is_soap_fault: {
		description: 'This function is useful to check if the SOAP call failed, but without using exceptions. To use it, create a SoapClient object with the exceptions option set to zero or FALSE. In this case, the SOAP method will return a special SoapFault object which encapsulates the fault details (faultcode, faultstring, faultactor and faultdetails).',
		signature: '(mixed $object): bool'
	},
	imap_open: {
		description: 'Opens an IMAP stream to a mailbox.',
		signature: '(string $mailbox , string $username , string $password [, int $options = NIL [, int $n_retries = 0 [, array $params = NULL ]]]): resource'
	},
	imap_reopen: {
		description: 'Reopens the specified stream to a new mailbox on an IMAP or NNTP server.',
		signature: '(resource $imap_stream , string $mailbox [, int $options = 0 [, int $n_retries = 0 ]]): bool'
	},
	imap_close: {
		description: 'Closes the imap stream.',
		signature: '(resource $imap_stream [, int $flag = 0 ]): bool'
	},
	imap_num_msg: {
		description: 'Gets the number of messages in the current mailbox.',
		signature: '(resource $imap_stream): int'
	},
	imap_num_recent: {
		description: 'Gets the number of recent messages in the current mailbox.',
		signature: '(resource $imap_stream): int'
	},
	imap_headers: {
		description: 'Returns headers for all messages in a mailbox.',
		signature: '(resource $imap_stream): array'
	},
	imap_headerinfo: {
		description: 'Gets information about the given message number by reading its headers.',
		signature: '(resource $imap_stream , int $msg_number [, int $fromlength = 0 [, int $subjectlength = 0 [, string $defaulthost = NULL ]]]): object'
	},
	imap_rfc822_parse_headers: {
		description: 'Gets an object of various header elements, similar to imap_header().',
		signature: '(string $headers [, string $defaulthost = \"UNKNOWN\" ]): object'
	},
	imap_rfc822_write_address: {
		description: 'Returns a properly formatted email address as defined in RFC2822 given the needed information.',
		signature: '(string $mailbox , string $host , string $personal): string'
	},
	imap_rfc822_parse_adrlist: {
		description: 'Parses the address string as defined in RFC2822 and for each address.',
		signature: '(string $address , string $default_host): array'
	},
	imap_body: {
		description: 'imap_body() returns the body of the message, numbered msg_number in the current mailbox.',
		signature: '(resource $imap_stream , int $msg_number [, int $options = 0 ]): string'
	},
	imap_bodystruct: {
		description: 'Read the structure of a specified body section of a specific message.',
		signature: '(resource $imap_stream , int $msg_number , string $section): object'
	},
	imap_fetchbody: {
		description: 'Fetch of a particular section of the body of the specified messages. Body parts are not decoded by this function.',
		signature: '(resource $imap_stream , int $msg_number , string $section [, int $options = 0 ]): string'
	},
	imap_fetchmime: {
		description: 'Fetch the MIME headers of a particular section of the body of the specified messages.',
		signature: '(resource $imap_stream , int $msg_number , string $section [, int $options = 0 ]): string'
	},
	imap_savebody: {
		description: 'Saves a part or the whole body of the specified message.',
		signature: '(resource $imap_stream , mixed $file , int $msg_number [, string $part_number = \"\" [, int $options = 0 ]]): bool'
	},
	imap_fetchheader: {
		description: 'This function causes a fetch of the complete, unfiltered RFC2822 format header of the specified message.',
		signature: '(resource $imap_stream , int $msg_number [, int $options = 0 ]): string'
	},
	imap_fetchstructure: {
		description: 'Fetches all the structured information for a given message.',
		signature: '(resource $imap_stream , int $msg_number [, int $options = 0 ]): object'
	},
	imap_gc: {
		description: 'Purges the cache of entries of a specific type.',
		signature: '(resource $imap_stream , int $caches): bool'
	},
	imap_expunge: {
		description: 'Deletes all the messages marked for deletion by imap_delete(), imap_mail_move(), or imap_setflag_full().',
		signature: '(resource $imap_stream): bool'
	},
	imap_delete: {
		description: 'Marks messages listed in msg_number for deletion. Messages marked for deletion will stay in the mailbox until either imap_expunge() is called or imap_close() is called with the optional parameter CL_EXPUNGE.',
		signature: '(resource $imap_stream , int $msg_number [, int $options = 0 ]): bool'
	},
	imap_undelete: {
		description: 'Removes the deletion flag for a specified message, which is set by imap_delete() or imap_mail_move().',
		signature: '(resource $imap_stream , int $msg_number [, int $flags = 0 ]): bool'
	},
	imap_check: {
		description: 'Checks information about the current mailbox.',
		signature: '(resource $imap_stream): object'
	},
	imap_listscan: {
		description: 'Returns an array containing the names of the mailboxes that have content in the text of the mailbox.',
		signature: '(resource $imap_stream , string $ref , string $pattern , string $content): array'
	},
	imap_mail_copy: {
		description: 'Copies mail messages specified by msglist to specified mailbox.',
		signature: '(resource $imap_stream , string $msglist , string $mailbox [, int $options = 0 ]): bool'
	},
	imap_mail_move: {
		description: 'Moves mail messages specified by msglist to the specified mailbox.',
		signature: '(resource $imap_stream , string $msglist , string $mailbox [, int $options = 0 ]): bool'
	},
	imap_mail_compose: {
		description: 'Create a MIME message based on the given envelope and body sections.',
		signature: '(array $envelope , array $body): string'
	},
	imap_createmailbox: {
		description: 'Creates a new mailbox specified by mailbox.',
		signature: '(resource $imap_stream , string $mailbox): bool'
	},
	imap_renamemailbox: {
		description: 'This function renames on old mailbox to new mailbox (see imap_open() for the format of mbox names).',
		signature: '(resource $imap_stream , string $old_mbox , string $new_mbox): bool'
	},
	imap_deletemailbox: {
		description: 'Deletes the specified mailbox.',
		signature: '(resource $imap_stream , string $mailbox): bool'
	},
	imap_subscribe: {
		description: 'Subscribe to a new mailbox.',
		signature: '(resource $imap_stream , string $mailbox): bool'
	},
	imap_unsubscribe: {
		description: 'Unsubscribe from the specified mailbox.',
		signature: '(resource $imap_stream , string $mailbox): bool'
	},
	imap_append: {
		description: 'Appends a string message to the specified mailbox.',
		signature: '(resource $imap_stream , string $mailbox , string $message [, string $options = NULL [, string $internal_date = NULL ]]): bool'
	},
	imap_ping: {
		description: 'imap_ping() pings the stream to see if it\'s still active. It may discover new mail; this is the preferred method for a periodic \"new mail check\" as well as a \"keep alive\" for servers which have inactivity timeout.',
		signature: '(resource $imap_stream): bool'
	},
	imap_base64: {
		description: 'Decodes the given BASE-64 encoded text.',
		signature: '(string $text): string'
	},
	imap_qprint: {
		description: 'Convert a quoted-printable string to an 8 bit string according to RFC2045, section 6.7.',
		signature: '(string $string): string'
	},
	imap_8bit: {
		description: 'Convert an 8bit string to a quoted-printable string (according to RFC2045, section 6.7).',
		signature: '(string $string): string'
	},
	imap_binary: {
		description: 'Convert an 8bit string to a base64 string according to RFC2045, Section 6.8.',
		signature: '(string $string): string'
	},
	imap_utf8: {
		description: 'Converts the given mime_encoded_text to UTF-8.',
		signature: '(string $mime_encoded_text): string'
	},
	imap_status: {
		description: 'Gets status information about the given mailbox.',
		signature: '(resource $imap_stream , string $mailbox , int $options): object'
	},
	imap_mailboxmsginfo: {
		description: 'Checks the current mailbox status on the server. It is similar to imap_status(), but will additionally sum up the size of all messages in the mailbox, which will take some additional time to execute.',
		signature: '(resource $imap_stream): object'
	},
	imap_setflag_full: {
		description: 'Causes a store to add the specified flag to the flags set for the messages in the specified sequence.',
		signature: '(resource $imap_stream , string $sequence , string $flag [, int $options = NIL ]): bool'
	},
	imap_clearflag_full: {
		description: 'This function causes a store to delete the specified flag to the flags set for the messages in the specified sequence.',
		signature: '(resource $imap_stream , string $sequence , string $flag [, int $options = 0 ]): bool'
	},
	imap_sort: {
		description: 'Gets and sorts message numbers by the given parameters.',
		signature: '(resource $imap_stream , int $criteria , int $reverse [, int $options = 0 [, string $search_criteria = NULL [, string $charset = NIL ]]]): array'
	},
	imap_uid: {
		description: 'This function returns the UID for the given message sequence number. An UID is a unique identifier that will not change over time while a message sequence number may change whenever the content of the mailbox changes.',
		signature: '(resource $imap_stream , int $msg_number): int'
	},
	imap_msgno: {
		description: 'Returns the message sequence number for the given uid.',
		signature: '(resource $imap_stream , int $uid): int'
	},
	imap_list: {
		description: 'Read the list of mailboxes.',
		signature: '(resource $imap_stream , string $ref , string $pattern): array'
	},
	imap_lsub: {
		description: 'Gets an array of all the mailboxes that you have subscribed.',
		signature: '(resource $imap_stream , string $ref , string $pattern): array'
	},
	imap_fetch_overview: {
		description: 'This function fetches mail headers for the given sequence and returns an overview of their contents.',
		signature: '(resource $imap_stream , string $sequence [, int $options = 0 ]): array'
	},
	imap_alerts: {
		description: 'Returns all of the IMAP alert messages generated since the last imap_alerts() call, or the beginning of the page.',
		signature: '(void): array'
	},
	imap_errors: {
		description: 'Gets all of the IMAP errors (if any) that have occurred during this page request or since the error stack was reset.',
		signature: '(void): array'
	},
	imap_last_error: {
		description: 'Gets the full text of the last IMAP error message that occurred on the current page. The error stack is untouched; calling imap_last_error() subsequently, with no intervening errors, will return the same error.',
		signature: '(void): string'
	},
	imap_search: {
		description: 'This function performs a search on the mailbox currently opened in the given IMAP stream.',
		signature: '(resource $imap_stream , string $criteria [, int $options = SE_FREE [, string $charset = NIL ]]): array'
	},
	imap_utf7_decode: {
		description: 'Decodes modified UTF-7 text into ISO-8859-1 string.',
		signature: '(string $text): string'
	},
	imap_utf7_encode: {
		description: 'Converts data to modified UTF-7 text.',
		signature: '(string $data): string'
	},
	imap_mime_header_decode: {
		description: 'Decodes MIME message header extensions that are non ASCII text (see RFC2047).',
		signature: '(string $text): array'
	},
	imap_thread: {
		description: 'Gets a tree of a threaded message.',
		signature: '(resource $imap_stream [, int $options = SE_FREE ]): array'
	},
	imap_timeout: {
		description: 'Sets or fetches the imap timeout.',
		signature: '(int $timeout_type [, int $timeout = -1 ]): mixed'
	},
	imap_get_quota: {
		description: 'Retrieve the quota level settings, and usage statics per mailbox.',
		signature: '(resource $imap_stream , string $quota_root): array'
	},
	imap_get_quotaroot: {
		description: 'Retrieve the quota settings per user. The limit value represents the total amount of space allowed for this user\'s total mailbox usage. The usage value represents the user\'s current total mailbox capacity.',
		signature: '(resource $imap_stream , string $quota_root): array'
	},
	imap_set_quota: {
		description: 'Sets an upper limit quota on a per mailbox basis.',
		signature: '(resource $imap_stream , string $quota_root , int $quota_limit): bool'
	},
	imap_setacl: {
		description: 'Sets the ACL for a giving mailbox.',
		signature: '(resource $imap_stream , string $mailbox , string $id , string $rights): bool'
	},
	imap_getacl: {
		description: 'Gets the ACL for a given mailbox.',
		signature: '(resource $imap_stream , string $mailbox): array'
	},
	imap_mail: {
		description: 'This function allows sending of emails with correct handling of Cc and Bcc receivers.',
		signature: '(string $to , string $subject , string $message [, string $additional_headers = NULL [, string $cc = NULL [, string $bcc = NULL [, string $rpath = NULL ]]]]): bool'
	},
	imap_header: {
		description: 'Alias of imap_headerinfo imap_getsubscribed imap_headerinfo IMAP Functions PHP Manual imap_header (PHP 4, PHP 5)',
	},
	imap_listmailbox: {
		description: 'Alias of imap_list imap_list imap_listscan IMAP Functions PHP Manual imap_listmailbox (PHP 4, PHP 5)',
	},
	imap_getmailboxes: {
		description: 'Gets information on the mailboxes.',
		signature: '(resource $imap_stream , string $ref , string $pattern): array'
	},
	imap_scanmailbox: {
		description: 'Alias of imap_listscan imap_scan imap_search IMAP Functions PHP Manual imap_scanmailbox (PHP 4, PHP 5)',
	},
	imap_listsubscribed: {
		description: 'Alias of imap_lsub imap_listscan imap_lsub IMAP Functions PHP Manual imap_listsubscribed (PHP 4, PHP 5)',
	},
	imap_getsubscribed: {
		description: 'Gets information about the subscribed mailboxes.',
		signature: '(resource $imap_stream , string $ref , string $pattern): array'
	},
	imap_fetchtext: {
		description: 'Alias of imap_body imap_fetchstructure imap_gc IMAP Functions PHP Manual imap_fetchtext (PHP 4, PHP 5)',
	},
	imap_scan: {
		description: 'Alias of imap_listscan imap_savebody imap_scanmailbox IMAP Functions PHP Manual imap_scan (PHP 4, PHP 5)',
	},
	imap_create: {
		description: 'Alias of imap_createmailbox imap_close imap_createmailbox IMAP Functions PHP Manual imap_create (PHP 4, PHP 5)',
	},
	imap_rename: {
		description: 'Alias of imap_renamemailbox imap_qprint imap_renamemailbox IMAP Functions PHP Manual imap_rename (PHP 4, PHP 5)',
	},
	tidy_get_output: {
		description: 'Gets a string with the repaired html.',
		signature: '(tidy $object): string'
	},
	tidy_get_error_buffer: {
		description: 'Object oriented style (property):',
		signature: '(tidy $object): string'
	},
	tidy_diagnose: {
		description: 'Procedural style',
	},
	tidy_error_count: {
		description: 'Returns the number of Tidy errors encountered for the specified document.',
		signature: '(tidy $object): int'
	},
	tidy_warning_count: {
		description: 'Returns the number of Tidy warnings encountered for the specified document.',
		signature: '(tidy $object): int'
	},
	tidy_access_count: {
		description: 'tidy_access_count() returns the number of accessibility warnings found for the specified document.',
		signature: '(tidy $object): int'
	},
	tidy_config_count: {
		description: 'Returns the number of errors encountered in the configuration of the specified tidy object.',
		signature: '(tidy $object): int'
	},
	ob_tidyhandler: {
		description: 'Callback function for ob_start() to repair the buffer.',
		signature: '(string $input [, int $mode ]): string'
	},
};
export var globalvariables: IEntries = {
	$GLOBALS: {
		description: 'An associative array containing references to all variables which are currently defined in the global scope of the script. The variable names are the keys of the array.',
	},
	$_SERVER: {
		description: '$_SERVER is an array containing information such as headers, paths, and script locations. The entries in this array are created by the web server. There is no guarantee that every web server will provide any of these; servers may omit some, or provide others not listed here. That said, a large number of these variables are accounted for in the CGI/1.1 specification, so you should be able to expect those.',
	},
	$_GET: {
		description: 'An associative array of variables passed to the current script via the URL parameters.',
	},
	$_POST: {
		description: 'An associative array of variables passed to the current script via the HTTP POST method.',
	},
	$_FILES: {
		description: 'An associative array of items uploaded to the current script via the HTTP POST method.',
	},
	$_REQUEST: {
		description: 'An associative array that by default contains the contents of $_GET, $_POST and $_COOKIE.',
	},
	$_SESSION: {
		description: 'An associative array containing session variables available to the current script. See the Session functions documentation for more information on how this is used.',
	},
	$_ENV: {
		description: 'An associative array of variables passed to the current script via the environment method. \r\n\r\nThese variables are imported into PHP\'s global namespace from the environment under which the PHP parser is running. Many are provided by the shell under which PHP is running and different systems are likely running different kinds of shells, a definitive list is impossible. Please see your shell\'s documentation for a list of defined environment variables. \r\n\r\nOther environment variables include the CGI variables, placed there regardless of whether PHP is running as a server module or CGI processor.',
	},
	$_COOKIE: {
		description: 'An associative array of variables passed to the current script via HTTP Cookies.',
	},
	$php_errormsg: {
		description: '$php_errormsg is a variable containing the text of the last error message generated by PHP. This variable will only be available within the scope in which the error occurred, and only if the track_errors configuration option is turned on (it defaults to off).',
	},
	$HTTP_RAW_POST_DATA: {
		description: '$HTTP_RAW_POST_DATA contains the raw POST data. See always_populate_raw_post_data',
	},
	$http_response_header: {
		description: 'The $http_response_header array is similar to the get_headers() function. When using the HTTP wrapper, $http_response_header will be populated with the HTTP response headers. $http_response_header will be created in the local scope.',
	},
	$argc: {
		description: 'Contains the number of arguments passed to the current script when running from the command line.',
	},
	$argv: {
		description: 'Contains an array of all the arguments passed to the script when running from the command line.',
	},
	$this: {
		description: 'Refers to the current object',
	},
};
export var compiletimeconstants: IEntries = {
	__CLASS__: {
		description: 'The class name. (Added in PHP 4.3.0) As of PHP 5 this constant returns the class name as it was declared (case-sensitive). In PHP 4 its value is always lowercased.',
	},
	__DIR__: {
		description: 'The directory of the file. If used inside an include, the directory of the included file is returned. This is equivalent to dirname(__FILE__). This directory name does not have a trailing slash unless it is the root directory. (Added in PHP 5.3.0.)',
	},
	__FILE__: {
		description: 'The full path and filename of the file. If used inside an include, the name of the included file is returned. Since PHP 4.0.2, __FILE__ always contains an absolute path with symlinks resolved whereas in older versions it contained relative path under some circumstances.',
	},
	__FUNCTION__: {
		description: 'The function name. (Added in PHP 4.3.0) As of PHP 5 this constant returns the function name as it was declared (case-sensitive). In PHP 4 its value is always lowercased.',
	},
	__LINE__: {
		description: 'The current line number of the file.',
	},
	__METHOD__: {
		description: 'The class method name. (Added in PHP 5.0.0) The method name is returned as it was declared (case-sensitive).',
	},
	__NAMESPACE__: {
		description: 'The name of the current namespace (case-sensitive). This constant is defined in compile-time (Added in PHP 5.3.0).',
	},
	TRUE: {
	},
	FALSE: {
	},
	NULL: {
	},
	M_PI: {
		description: 'The constant Pi: 3.14159265358979323846',
	},
	M_E: {
		description: 'The constant e: 2.7182818284590452354',
	},
	M_LOG2E: {
		description: 'The constant log_2 e: 1.4426950408889634074',
	},
	M_LOG10E: {
		description: 'The constant log_10 e: 0.43429448190325182765',
	},
	M_LN2: {
		description: 'The constant log_e 2: 0.69314718055994530942',
	},
	M_LN10: {
		description: 'The constant log_e 10: 2.30258509299404568402',
	},
	M_PI_2: {
		description: 'The constant pi/2: 1.57079632679489661923',
	},
	M_PI_4: {
		description: 'The constant pi/4: 0.78539816339744830962',
	},
	M_1_PI: {
		description: 'The constant 1/pi: 0.31830988618379067154',
	},
	M_2_PI: {
		description: 'The constant 2/pi: 0.63661977236758134308',
	},
	M_SQRTPI: {
		description: 'The constant sqrt(pi): 1.77245385090551602729',
	},
	M_2_SQRTPI: {
		description: 'The constant 2/sqrt(pi): 1.12837916709551257390',
	},
	M_SQRT2: {
		description: 'The constant sqrt(2): 1.41421356237309504880',
	},
	M_SQRT3: {
		description: 'The constant sqrt(3): 1.73205080756887729352',
	},
	M_SQRT1_2: {
		description: 'The constant 1/sqrt(2): 0.7071067811865475244',
	},
	M_LNPI: {
		description: 'The constant log_e(pi): 1.14472988584940017414',
	},
	M_EULER: {
		description: 'Euler constant: 0.57721566490153286061',
	},
	PHP_ROUND_HALF_UP: {
		description: 'Round halves up = 1',
	},
	PHP_ROUND_HALF_DOWN: {
		description: 'Round halves down = 2',
	},
	PHP_ROUND_HALF_EVEN: {
		description: 'Round halves to even numbers = 3',
	},
	PHP_ROUND_HALF_ODD: {
		description: 'Round halvesto odd numbers = 4',
	},
	NAN: {
		description: 'NAN (as a float): Not A Number',
	},
	INF: {
		description: 'INF (as a float): The infinite',
	},
	PASSWORD_BCRYPT: {
		description: 'PASSWORD_BCRYPT is used to create new password hashes using the CRYPT_BLOWFISH algorithm.',
	},
	PASSWORD_DEFAULT: {
		description: 'The default algorithm to use for hashing if no algorithm is provided. This may change in newer PHP releases when newer, stronger hashing algorithms are supported.',
	},
};
export var keywords: IEntries = {
	define: {
		description: 'Defines a named constant at runtime.',
		signature: '( string $name , mixed $value [, bool $case_insensitive = false ] ): bool'
	},
	die: {
		description: 'This language construct is equivalent to exit().',
	},
	echo: {
		description: 'Outputs all parameters. \r\n\r\necho() is not actually a function (it is a language construct), so you are not required to use parentheses with it. echo() (unlike some other language constructs) does not behave like a function, so it cannot always be used in the context of a function. Additionally, if you want to pass more than one parameter to echo(), the parameters must not be enclosed within parentheses.\r\n\r\necho() also has a shortcut syntax, where you can immediately follow the opening tag with an equals sign. This short syntax only works with the short_open_tag configuration setting enabled.',
		signature: '( string $arg1 [, string $... ] ): void'
	},
	empty: {
		description: 'Determine whether a variable is considered to be empty.',
		signature: '( mixed $var ): bool'
	},
	exit: {
		description: 'Terminates execution of the script. Shutdown functions and object destructors will always be executed even if exit() is called.',
		signature: '([ string $status ] )\r\nvoid exit ( int $status ): void'
	},
	eval: {
		description: 'Evaluates the string given in code_str as PHP code. Among other things, this can be useful for storing code in a database text field for later execution.\r\nThere are some factors to keep in mind when using eval(). Remember that the string passed must be valid PHP code, including things like terminating statements with a semicolon so the parser doesn\'t die on the line after the eval(), and properly escaping things in code_str. To mix HTML output and PHP code you can use a closing PHP tag to leave PHP mode.\r\nAlso remember that variables given values under eval() will retain these values in the main script afterwards.',
		signature: '( string $code_str ): mixed'
	},
	include: {
		description: 'The include() statement includes and evaluates the specified file.',
	},
	include_once: {
		description: 'The include_once() statement includes and evaluates the specified file during the execution of the script. This is a behavior similar to the include() statement, with the only difference being that if the code from a file has already been included, it will not be included again. As the name suggests, it will be included just once. \r\n\r\ninclude_once() may be used in cases where the same file might be included and evaluated more than once during a particular execution of a script, so in this case it may help avoid problems such as function redefinitions, variable value reassignments, etc.',
	},
	isset: {
		description: 'Determine if a variable is set and is not NULL. \r\n\r\nIf a variable has been unset with unset(), it will no longer be set. isset() will return FALSE if testing a variable that has been set to NULL. Also note that a NULL byte is not equivalent to the PHP NULL constant. \r\n\r\nIf multiple parameters are supplied then isset() will return TRUE only if all of the parameters are set. Evaluation goes from left to right and stops as soon as an unset variable is encountered.',
		signature: '( mixed $var [, mixed $... ] ): bool'
	},
	list: {
		description: 'Like array(), this is not really a function, but a language construct. list() is used to assign a list of variables in one operation.',
		signature: '( mixed $varname [, mixed $... ] ): array'
	},
	require: {
		description: 'require() is identical to include() except upon failure it will also produce a fatal E_COMPILE_ERROR level error. In other words, it will halt the script whereas include() only emits a warning (E_WARNING) which allows the script to continue.',
	},
	require_once: {
		description: 'The require_once() statement is identical to require() except PHP will check if the file has already been included, and if so, not include (require) it again.',
	},
	return: {
		description: 'If called from within a function, the return() statement immediately ends execution of the current function, and returns its argument as the value of the function call. return() will also end the execution of an eval() statement or script file. \r\n\r\nIf called from the global scope, then execution of the current script file is ended. If the current script file was include()ed or require()ed, then control is passed back to the calling file. Furthermore, if the current script file was include()ed, then the value given to return() will be returned as the value of the include() call. If return() is called from within the main script file, then script execution ends. If the current script file was named by the auto_prepend_file or auto_append_file configuration options in php.ini, then that script file\'s execution is ended.',
	},
	print: {
		description: 'Outputs arg. \r\n\r\nprint() is not actually a real function (it is a language construct) so you are not required to use parentheses with its argument list.',
		signature: '( string $arg ): int'
	},
	unset: {
		description: 'unset() destroys the specified variables. \r\n\r\nThe behavior of unset() inside of a function can vary depending on what type of variable you are attempting to destroy. \r\n\r\nIf a globalized variable is unset() inside of a function, only the local variable is destroyed. The variable in the calling environment will retain the same value as before unset() was called.',
		signature: '( mixed $var [, mixed $... ] ): void'
	},
	yield: {
		description: 'The heart of a generator function is the yield keyword. In its simplest form, a yield statement looks much like a return statement, except that instead of stopping execution of the function and returning, yield instead provides a value to the code looping over the generator and pauses execution of the generator function.',
	},
	abstract: {
	},
	and: {
	},
	array: {
	},
	as: {
	},
	break: {
	},
	case: {
	},
	catch: {
	},
	class: {
	},
	clone: {
	},
	const: {
	},
	continue: {
	},
	declare: {
	},
	default: {
	},
	do: {
	},
	else: {
	},
	elseif: {
	},
	enddeclare: {
	},
	endfor: {
	},
	endforeach: {
	},
	endif: {
	},
	endswitch: {
	},
	endwhile: {
	},
	extends: {
	},
	final: {
	},
	finally: {
	},
	for: {
	},
	foreach: {
	},
	function: {
	},
	global: {
	},
	goto: {
	},
	if: {
	},
	implements: {
	},
	interface: {
	},
	instanceof: {
	},
	insteadOf: {
	},
	namespace: {
	},
	new: {
	},
	or: {
	},
	parent: {
	},
	private: {
	},
	protected: {
	},
	public: {
	},
	self: {
	},
	static: {
	},
	switch: {
	},
	throw: {
	},
	trait: {
	},
	try: {
	},
	use: {
	},
	var: {
	},
	while: {
	},
	xor: {
	},
};