import getopt
import sys
import os

optlist, args = getopt.getopt(sys.argv, '')

# If the caller has not specified the output file, create one for them with
# the same name as the caller script, but with a .log extension.
log_file = os.path.splitext(sys.argv[0])[0] + '.log'

# If the output file is given, use that instead.
if len(args) == 2:
    log_file = args[1]

with open(log_file, "a") as f:
    f.write(sys.executable)
