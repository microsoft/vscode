# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import runpy
import sys

# Sometimes executing scripts can print out stuff before the actual output is
# printed. For eg. when activating conda. Hence, printing out markers to make
# it more resilient to pull the output.
print(">>>PYTHON-EXEC-OUTPUT")

module = sys.argv[1]
try:
    if module == "-c":
        ns = {}
        code = sys.argv[2]
        del sys.argv[2]
        del sys.argv[0]
        exec(code, ns, ns)
    elif module.startswith("-m"):
        module_name = sys.argv[2]
        sys.argv = sys.argv[2:]  # It should begin with the module name.
        runpy.run_module(module_name, run_name="__main__", alter_sys=True)
    elif module.endswith(".py"):
        sys.argv = sys.argv[1:]
        runpy.run_path(module, run_name="__main__")
    elif module.startswith("-"):
        raise NotImplementedError(sys.argv)
    else:
        runpy.run_module(module, run_name="__main__", alter_sys=True)
finally:
    print("<<<PYTHON-EXEC-OUTPUT")
