const completionSpec: Fig.Spec = {
  name: "less",
  description: "Opposite of more",
  args: {
    isVariadic: true,
    template: "filepaths",
  },
  options: [
    {
      name: ["-?", "--help"],
      description:
        'This option displays a summary of the commands accepted by less (the same as the h command).  (Depending on how your shell interprets the question mark, it may be necessary to quote the question mark, thus: "-?"',
    },
    {
      name: ["-a", "--search-skip-screen"],
      description: `By default, forward searches start at the top of the displayed
screen and backwards searches start at the bottom of the
displayed screen (except for repeated searches invoked by the n
or N commands, which start after or before the "target" line
respectively; see the -j option for more about the target line).
The -a option causes forward searches to instead start at the
bottom of the screen and backward searches to start at the top
of the screen, thus skipping all lines displayed on the screen`,
    },
    {
      name: ["-A", "--SEARCH-SKIP-SCREEN"],
      description: `Causes all forward searches (not just non-repeated searches) to
start just after the target line, and all backward searches to
start just before the target line.  Thus, forward searches will
skip part of the displayed screen (from the first line up to and
including the target line).  Similarly backwards searches will
skip the displayed screen from the last line up to and including
the target line.  This was the default behavior in less versions
prior to 441`,
    },

    {
      name: ["-b", "--buffers"],
      args: { name: "n" },
      description: `Specifies the amount of buffer space less will use for each
file, in units of kilobytes (1024 bytes).  By default 64 KB of
buffer space is used for each file (unless the file is a pipe;
see the -B option).  The -b option specifies instead that n
kilobytes of buffer space should be used for each file.  If n is
-1, buffer space is unlimited; that is, the entire file can be
read into memory`,
    },

    {
      name: ["-B", "--auto-buffers"],
      description: `By default, when data is read from a pipe, buffers are allocated
automatically as needed.  If a large amount of data is read from
the pipe, this can cause a large amount of memory to be
allocated.  The -B option disables this automatic allocation of
buffers for pipes, so that only 64 KB (or the amount of space
specified by the -b option) is used for the pipe.  Warning: use
of -B can result in erroneous display, since only the most
recently viewed part of the piped data is kept in memory; any
earlier data is lost`,
    },

    {
      name: ["-c", "--clear-screen"],
      description: `Causes full screen repaints to be painted from the top line
down.  By default, full screen repaints are done by scrolling
from the bottom of the screen`,
    },

    {
      name: ["-C", "--CLEAR-SCREEN"],
      description: `Same as -c, for compatibility with older versions of less`,
    },

    {
      name: ["-d", "--dumb"],
      description: `The -d option suppresses the error message normally displayed if
the terminal is dumb; that is, lacks some important capability,
such as the ability to clear the screen or scroll backward.  The
-d option does not otherwise change the behavior of less on a
dumb terminal`,
    },

    {
      name: ["-D", "--color"],
      args: { name: "xcolor" },
      description: `Changes the color of different parts of the displayed text.  x
is a single character which selects the type of text whose color
is being set:
B      Binary characters.
C      Control characters.
E      Errors and informational messages.
M      Mark letters in the status column.
N      Line numbers enabled via the -N option.
P      Prompts.
R      The rscroll character.
S      Search results.
W      The highlight enabled via the -w option.
d      Bold text.
k      Blinking text.
s      Standout text.
u      Underlined text.
The uppercase letters can be used only when the --use-color
option is enabled.  When text color is specified by both an
uppercase letter and a lowercase letter, the uppercase letter
takes precedence.  For example, error messages are normally
displayed as standout text.  So if both "s" and "E" are given a
color, the "E" color applies to error messages, and the "s"
color applies to other standout text.  The "d" and "u" letters
refer to bold and underline text formed by overstriking with
backspaces (see the -u option), not to text using ANSI escape
sequences with the -R option.
A lowercase letter may be followed by a + to indicate that both
the normal format change and the specified color should both be
used.  For example, -Dug displays underlined text as green
without underlining; the green color has replaced the usual
underline formatting.  But -Du+g displays underlined text as
both green and in underlined format.
color is either a 4-bit color string or an 8-bit color string:
A 4-bit color string is zero, one or two characters, where the
first character specifies the foreground color and the second
specifies the background color as follows:
b      Blue
c      Cyan
g      Green
k      Black
m      Magenta
r      Red
w      White
y      Yellow
The corresponding upper-case letter denotes a brighter shade of
the color.  For example, -DNGk displays line numbers as bright
green text on a black background, and -DEbR displays error
messages as blue text on a bright red background.  If either
character is a "-" or is omitted, the corresponding color is set
to that of normal text.
An 8-bit color string is one or two decimal integers separated
by a dot, where the first integer specifies the foreground color
and the second specifies the background color.  Each integer is
a value between 0 and 255 inclusive which selects a "CSI 38;5"
color value (see
https://en.wikipedia.org/wiki/ANSI_escape_code#SGR_parameters)
If either integer is a "-" or is omitted, the corresponding
color is set to that of normal text.  On MS-DOS versions of
less, 8-bit color is not supported; instead, decimal values are
interpreted as 4-bit CHAR_INFO.Attributes values (see
https://docs.microsoft.com/en-us/windows/console/char-info-str)`,
    },

    {
      name: ["-e", "--quit-at-eof"],
      description: `Causes less to automatically exit the second time it reaches
end-of-file.  By default, the only way to exit less is via the
"q" command`,
    },

    {
      name: ["-E", "--QUIT-AT-EOF"],
      description: `Causes less to automatically exit the first time it reaches end-
of-file`,
    },

    {
      name: ["-f", "--force"],
      description: `Forces non-regular files to be opened.  (A non-regular file is a
directory or a device special file.)  Also suppresses the
warning message when a binary file is opened.  By default, less
will refuse to open non-regular files.  Note that some operating
systems will not allow directories to be read, even if -f is
set`,
    },

    {
      name: ["-F", "--quit-if-one-screen"],
      description: `Causes less to automatically exit if the entire file can be
displayed on the first screen`,
    },

    {
      name: ["-g", "--hilite-search"],
      description: `Normally, less will highlight ALL strings which match the last
search command.  The -g option changes this behavior to
highlight only the particular string which was found by the last
search command.  This can cause less to run somewhat faster than
the default`,
    },

    {
      name: ["-G", "--HILITE-SEARCH"],
      description: `The -G option suppresses all highlighting of strings found by
search commands`,
    },

    {
      name: ["-h", "--max-back-scroll"],
      args: { name: "n" },
      description: `Specifies a maximum number of lines to scroll backward.  If it
is necessary to scroll backward more than n lines, the screen is
repainted in a forward direction instead.  (If the terminal does
not have the ability to scroll backward, -h0 is implied.)`,
    },

    {
      name: ["-i", "--ignore-case"],
      description: `Causes searches to ignore case; that is, uppercase and lowercase
are considered identical.  This option is ignored if any
uppercase letters appear in the search pattern; in other words,
if a pattern contains uppercase letters, then that search does
not ignore case`,
    },

    {
      name: ["-I", "--IGNORE-CASE"],
      description: `Like -i, but searches ignore case even if the pattern contains
uppercase letters`,
    },

    {
      name: ["-j", "--jump-target"],
      args: { name: "n" },
      description: `Specifies a line on the screen where the "target" line is to be
positioned.  The target line is the line specified by any
command to search for a pattern, jump to a line number, jump to
a file percentage or jump to a tag.  The screen line may be
specified by a number: the top line on the screen is 1, the next
is 2, and so on.  The number may be negative to specify a line
relative to the bottom of the screen: the bottom line on the
screen is -1, the second to the bottom is -2, and so on.
Alternately, the screen line may be specified as a fraction of
the height of the screen, starting with a decimal point: .5 is
in the middle of the screen, .3 is three tenths down from the
first line, and so on.  If the line is specified as a fraction,
the actual line number is recalculated if the terminal window is
resized, so that the target line remains at the specified
fraction of the screen height.  If any form of the -j option is
used, repeated forward searches (invoked with "n" or "N") begin
at the line immediately after the target line, and repeated
backward searches begin at the target line, unless changed by -a
or -A.  For example, if "-j4" is used, the target line is the
fourth line on the screen, so forward searches begin at the
fifth line on the screen.  However nonrepeated searches (invoked
with "/" or "?") always begin at the start or end of the current
screen respectively`,
    },

    {
      name: ["-J", "--status-column"],
      description: `Displays a status column at the left edge of the screen.  The
status column shows the lines that matched the current search,
and any lines that are marked (via the m or M command)`,
    },

    {
      name: ["-k", "--lesskey-file"],
      args: { name: "filename", template: "filepaths" },
      description: `Causes less to open and interpret the named file as a lesskey(1)
file.  Multiple -k options may be specified.  If the LESSKEY or
LESSKEY_SYSTEM environment variable is set, or if a lesskey file
is found in a standard place (see KEY BINDINGS), it is also used
as a lesskey file`,
    },

    {
      name: ["-K", "--quit-on-intr"],
      description: `Causes less to exit immediately (with status 2) when an
interrupt character (usually ^C) is typed.  Normally, an
interrupt character causes less to stop whatever it is doing and
return to its command prompt.  Note that use of this option
makes it impossible to return to the command prompt from the "F"
command`,
    },

    {
      name: ["-L", "--no-lessopen"],
      description: `Ignore the LESSOPEN environment variable (see the INPUT
PREPROCESSOR section below).  This option can be set from within
less, but it will apply only to files opened subsequently, not
to the file which is currently open`,
    },

    {
      name: ["-m", "--long-prompt"],
      description: `Causes less to prompt verbosely (like more), with the percent
into the file.  By default, less prompts with a colon`,
    },

    {
      name: ["-M", "--LONG-PROMPT"],
      description: `Causes less to prompt even more verbosely than more`,
    },

    {
      name: ["-n", "--line-numbers"],
      description: `Suppresses line numbers.  The default (to use line numbers) may
cause less to run more slowly in some cases, especially with a
very large input file.  Suppressing line numbers with the -n
option will avoid this problem.  Using line numbers means: the
line number will be displayed in the verbose prompt and in the =
command, and the v command will pass the current line number to
the editor (see also the discussion of LESSEDIT in PROMPTS
below)`,
    },

    {
      name: ["-N", "--LINE-NUMBERS"],
      description: `Causes a line number to be displayed at the beginning of each
line in the display`,
    },

    {
      name: ["-o", "--log-file"],
      args: { name: "filename", template: "filepaths" },
      description: `Causes less to copy its input to the named file as it is being
viewed.  This applies only when the input file is a pipe, not an
ordinary file.  If the file already exists, less will ask for
confirmation before overwriting it`,
    },

    {
      name: ["-O", "--LOG-FILE"],
      args: { name: "filename", template: "filepaths" },
      description: `The -O option is like -o, but it will overwrite an existing file
without asking for confirmation.
If no log file has been specified, the -o and -O options can be
used from within less to specify a log file.  Without a file
name, they will simply report the name of the log file.  The "s"
command is equivalent to specifying -o from within less`,
    },

    {
      name: ["-p", "--pattern"],
      args: { name: "pattern" },
      description: `The -p option on the command line is equivalent to specifying
+/pattern; that is, it tells less to start at the first
occurrence of pattern in the file`,
    },

    {
      name: ["-P", "--prompt"],
      args: { name: "prompt" },
      description: `Provides a way to tailor the three prompt styles to your own
preference.  This option would normally be put in the LESS
environment variable, rather than being typed in with each less
command.  Such an option must either be the last option in the
LESS variable, or be terminated by a dollar sign.
-Ps followed by a string changes the default (short) prompt to
that string.
-Pm changes the medium (-m) prompt.
-PM changes the long (-M) prompt.
-Ph changes the prompt for the help screen.
-P= changes the message printed by the = command.
-Pw changes the message printed while waiting for data (in the
F command).
All prompt strings consist of a sequence of letters and special
escape sequences.  See the section on PROMPTS for more details`,
    },

    {
      name: ["-q", "--quiet", "--silent"],
      description: `Causes moderately "quiet" operation: the terminal bell is not
rung if an attempt is made to scroll past the end of the file or
before the beginning of the file.  If the terminal has a "visual
bell", it is used instead.  The bell will be rung on certain
other errors, such as typing an invalid character.  The default
is to ring the terminal bell in all such cases`,
    },

    {
      name: ["-Q", "--QUIET", "--SILENT"],
      description: `Causes totally "quiet" operation: the terminal bell is never
rung.  If the terminal has a "visual bell", it is used in all
cases where the terminal bell would have been rung`,
    },

    {
      name: ["-r", "--raw-control-chars"],
      description: `Causes "raw" control characters to be displayed.  The default is
to display control characters using the caret notation; for
example, a control-A (octal 001) is displayed as "^A".  Warning:
when the -r option is used, less cannot keep track of the actual
appearance of the screen (since this depends on how the screen
responds to each type of control character).  Thus, various
display problems may result, such as long lines being split in
the wrong place.
USE OF THE -r OPTION IS NOT RECOMMENDED`,
    },

    {
      name: ["-R", "--RAW-CONTROL-CHARS"],
      description: `Like -r, but only ANSI "color" escape sequences and OSC 8
hyperlink sequences are output in "raw" form.  Unlike -r, the
screen appearance is maintained correctly, provided that there
are no escape sequences in the file other than these types of
escape sequences.  Color escape sequences are only supported
when the color is changed within one line, not across lines.  In
other words, the beginning of each line is assumed to be normal
(non-colored), regardless of any escape sequences in previous
lines.  For the purpose of keeping track of screen appearance,
these escape sequences are assumed to not move the cursor.
OSC 8 hyperlinks are sequences of the form:
ESC ] 8 ; 
ANSI color escape sequences are sequences of the form:
ESC [ ... m
where the "..." is zero or more color specification characters.
You can make less think that characters other than "m" can end
ANSI color escape sequences by setting the environment variable
LESSANSIENDCHARS to the list of characters which can end a color
escape sequence.  And you can make less think that characters
other than the standard ones may appear between the ESC and the
m by setting the environment variable LESSANSIMIDCHARS to the
list of characters which can appear`,
    },

    {
      name: ["-s", "--squeeze-blank-lines"],
      description: `Causes consecutive blank lines to be squeezed into a single
blank line.  This is useful when viewing nroff output`,
    },

    {
      name: ["-S", "--chop-long-lines"],
      description: `Causes lines longer than the screen width to be chopped
(truncated) rather than wrapped.  That is, the portion of a long
line that does not fit in the screen width is not displayed
until you press RIGHT-ARROW.  The default is to wrap long lines;
that is, display the remainder on the next line`,
    },

    {
      name: ["-t", "--tag"],
      args: { name: "tag" },
      description: `The -t option, followed immediately by a TAG, will edit the file
containing that tag.  For this to work, tag information must be
available; for example, there may be a file in the current
directory called "tags", which was previously built by ctags(1)
or an equivalent command.  If the environment variable
LESSGLOBALTAGS is set, it is taken to be the name of a command
compatible with global(1), and that command is executed to find
the tag.  (See http://www.gnu.org/software/global/global.html).
The -t option may also be specified from within less (using the
- command) as a way of examining a new file.  The command ":t"
is equivalent to specifying -t from within less`,
    },

    {
      name: ["-T", "--tag-file"],
      args: { name: "tagsfile" },
      description: `Specifies a tags file to be used instead of "tags"`,
    },

    {
      name: ["-u", "--underline-special"],
      description: `Causes backspaces and carriage returns to be treated as
printable characters; that is, they are sent to the terminal
when they appear in the input`,
    },

    {
      name: ["-U", "--UNDERLINE-SPECIAL"],
      description: `Causes backspaces, tabs, carriage returns and "formatting
characters" (as defined by Unicode) to be treated as control
characters; that is, they are handled as specified by the -r
option.
By default, if neither -u nor -U is given, backspaces which
appear adjacent to an underscore character are treated
specially: the underlined text is displayed using the terminal's
hardware underlining capability.  Also, backspaces which appear
between two identical characters are treated specially: the
overstruck text is printed using the terminal's hardware
boldface capability.  Other backspaces are deleted, along with
the preceding character.  Carriage returns immediately followed
by a newline are deleted.  Other carriage returns are handled as
specified by the -r option.  Unicode formatting characters, such
as the Byte Order Mark, are sent to the terminal.  Text which is
overstruck or underlined can be searched for if neither -u nor
-U is in effect`,
    },

    {
      name: ["-V", "--version"],
      description: `Displays the version number of less`,
    },

    {
      name: ["-w", "--hilite-unread"],
      description: `Temporarily highlights the first "new" line after a forward
movement of a full page.  The first "new" line is the line
immediately following the line previously at the bottom of the
screen.  Also highlights the target line after a g or p command.
The highlight is removed at the next command which causes
movement.  The entire line is highlighted, unless the -J option
is in effect, in which case only the status column is
highlighted`,
    },

    {
      name: ["-W", "--HILITE-UNREAD"],
      description: `Like -w, but temporarily highlights the first new line after any
forward movement command larger than one line`,
    },

    {
      name: ["-x", "--tabs="],
      args: { name: "n,..." },
      description: `Sets tab stops.  If only one n is specified, tab stops are set
at multiples of n.  If multiple values separated by commas are
specified, tab stops are set at those positions, and then
continue with the same spacing as the last two.  For example,
-x9,17 will set tabs at positions 9, 17, 25, 33, etc.  The
default for n is 8`,
    },

    {
      name: ["-X", "--no-init"],
      description: `Disables sending the termcap initialization and deinitialization
strings to the terminal.  This is sometimes desirable if the
deinitialization string does something unnecessary, like
clearing the screen`,
    },

    {
      name: ["-y", "--max-forw-scroll"],
      args: { name: "n" },
      description: `Specifies a maximum number of lines to scroll forward.  If it is
necessary to scroll forward more than n lines, the screen is
repainted instead.  The -c or -C option may be used to repaint
from the top of the screen if desired.  By default, any forward
movement causes scrolling`,
    },

    {
      name: ["-z", "--window"],
      args: { name: "n" },
      description: `Changes the default scrolling window size to n lines.  The
default is one screenful.  The z and w commands can also be used
to change the window size.  The "z" may be omitted for
compatibility with some versions of more.  If the number n is
negative, it indicates n lines less than the current screen
size.  For example, if the screen is 24 lines, -z-4 sets the
scrolling window to 20 lines.  If the screen is resized to 40
lines, the scrolling window automatically changes to 36 lines`,
    },

    {
      name: "--quotes",
      description: `Changes the filename quoting character.  This may be necessary
if you are trying to name a file which contains both spaces and
quote characters.  Followed by a single character, this changes
the quote character to that character.  Filenames containing a
space should then be surrounded by that character rather than by
double quotes.  Followed by two characters, changes the open
quote to the first character, and the close quote to the second
character.  Filenames containing a space should then be preceded
by the open quote character and followed by the close quote
character.  Note that even after the quote characters are
changed, this option remains -" (a dash followed by a double
quote)`,
    },

    {
      name: ["-~", "--tilde"],
      description: `Normally lines after end of file are displayed as a single tilde
(~).  This option causes lines after end of file to be displayed
as blank lines`,
    },

    {
      name: ["-#", "--shift"],
      description: `Specifies the default number of positions to scroll horizontally
in the RIGHTARROW and LEFTARROW commands.  If the number
specified is zero, it sets the default number of positions to
one half of the screen width.  Alternately, the number may be
specified as a fraction of the width of the screen, starting
with a decimal point: .5 is half of the screen width, .3 is
three tenths of the screen width, and so on.  If the number is
specified as a fraction, the actual number of scroll positions
is recalculated if the terminal window is resized, so that the
actual scroll remains at the specified fraction of the screen
width`,
    },

    {
      name: "--follow-name",
      description: `Normally, if the input file is renamed while an F command is
executing, less will continue to display the contents of the
original file despite its name change.  If --follow-name is
specified, during an F command less will periodically attempt to
reopen the file by name.  If the reopen succeeds and the file is
a different file from the original (which means that a new file
has been created with the same name as the original (now
renamed) file), less will display the contents of that new file`,
    },
    {
      name: "--incsearch",
      description: `Subsequent search commands will be "incremental"; that is, less
will advance to the next line containing the search pattern as
each character of the pattern is typed in`,
    },

    {
      name: "--line-num-width",
      description: `Sets the minimum width of the line number field when the -N
option is in effect.  The default is 7 characters`,
    },
    {
      name: "--mouse",
      description: `Enables mouse input: scrolling the mouse wheel down moves
forward in the file, scrolling the mouse wheel up moves
backwards in the file, and clicking the mouse sets the "#" mark
to the line where the mouse is clicked.  The number of lines to
scroll when the wheel is moved can be set by the --wheel-lines
option.  Mouse input works only on terminals which support X11
mouse reporting, and on the Windows version of less`,
    },
    {
      name: "--MOUSE",
      description: `Like --mouse, except the direction scrolled on mouse wheel
movement is reversed`,
    },
    {
      name: "--no-keypad",
      description: `Disables sending the keypad initialization and deinitialization
strings to the terminal.  This is sometimes useful if the keypad
strings make the numeric keypad behave in an undesirable manner`,
    },
    {
      name: "--no-histdups",
      description: `This option changes the behavior so that if a search string or
file name is typed in, and the same string is already in the
history list, the existing copy is removed from the history list
before the new one is added.  Thus, a given string will appear
only once in the history list.  Normally, a string may appear
multiple times`,
    },
    {
      name: "--rscroll",
      description: `This option changes the character used to mark truncated lines.
It may begin with a two-character attribute indicator like
LESSBINFMT does.  If there is no attribute indicator, standout
is used.  If set to "-", truncated lines are not marked`,
    },
    {
      name: "--save-marks",
      description: `Save marks in the history file, so marks are retained across
different invocations of less`,
    },
    {
      name: "--status-col-width",
      description: `Sets the width of the status column when the -J option is in
effect.  The default is 2 characters`,
    },
    {
      name: "--use-backslash",
      description: `This option changes the interpretations of options which follow
this one.  After the --use-backslash option, any backslash in an
option string is removed and the following character is taken
literally.  This allows a dollar sign to be included in option
strings`,
    },
    {
      name: "--use-color",
      description: `Enables the colored text in various places.  The -D option can
be used to change the colors.  Colored text works only if the
terminal supports ANSI color escape sequences (as defined in
ECMA-48 SGR; see
https://www.ecma-international.org/publications-and-
standards/standards/ecma-48)`,
    },
    {
      name: "--wheel-lines",
      args: { name: "n" },
      description: `Set the number of lines to scroll when the mouse wheel is rolled`,
    },
  ],
};

export default completionSpec;
