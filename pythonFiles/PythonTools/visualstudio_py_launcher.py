# Python Tools for Visual Studio
# Copyright(c) Microsoft Corporation
# All rights reserved.
# 
# Licensed under the Apache License, Version 2.0 (the License); you may not use
# this file except in compliance with the License. You may obtain a copy of the
# License at http://www.apache.org/licenses/LICENSE-2.0
# 
# THIS CODE IS PROVIDED ON AN  *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS
# OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY
# IMPLIED WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
# MERCHANTABLITY OR NON-INFRINGEMENT.
# 
# See the Apache Version 2.0 License for specific language governing
# permissions and limitations under the License.

"""
Starts Debugging, expected to start with normal program
to start as first argument and directory to run from as
the second argument.
"""

__author__ = "Microsoft Corporation <ptvshelp@microsoft.com>"
__version__ = "3.0.0.0"

import os
import os.path
import sys
import traceback
try:
    import visualstudio_py_debugger as vspd
except:
    traceback.print_exc()
    print('''
Internal error detected. Please copy the above traceback and report at
http://go.microsoft.com/fwlink/?LinkId=293415

Press Enter to close. . .''')
    try:
        raw_input()
    except NameError:
        input()
    sys.exit(1)

# Arguments are:
# 1. Working directory.
# 2. VS debugger port to connect to.
# 3. GUID for the debug session.
# 4. Debug options (as integer - see enum PythonDebugOptions).
# 5. '-m' or '-c' to override the default run-as mode. [optional]
# 6. Startup script name.
# 7. Script arguments.

# change to directory we expected to start from
os.chdir(sys.argv[1])

port_num = int(sys.argv[2])
debug_id = sys.argv[3]
debug_options = vspd.parse_debug_options(sys.argv[4])
del sys.argv[0:5]

# set run_as mode appropriately
run_as = 'script'
if sys.argv and sys.argv[0] == '-m':
    run_as = 'module'
    del sys.argv[0]
if sys.argv and sys.argv[0] == '-c':
    run_as = 'code'
    del sys.argv[0]

# preserve filename before we del sys
filename = sys.argv[0]

# fix sys.path to be the script file dir
sys.path[0] = ''

# exclude ourselves from being debugged
vspd.DONT_DEBUG.append(os.path.normcase(__file__))

## Begin modification by Don Jayamanne
# Get current Process id to pass back to debugger
currentPid = os.getpid()
## End Modification by Don Jayamanne

# remove all state we imported
del sys, os

# and start debugging
## Begin modification by Don Jayamanne
# Pass current Process id to pass back to debugger
vspd.debug(filename, port_num, debug_id, debug_options, currentPid, run_as)
## End Modification by Don Jayamanne
