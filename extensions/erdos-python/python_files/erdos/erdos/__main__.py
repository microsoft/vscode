#!/usr/bin/env python3

import sys
from erdos.erdos.erdos_ipkernel import ErdosIPKernelApp

if __name__ == "__main__":
    app = ErdosIPKernelApp.instance()
    app.initialize(sys.argv)
    app.start()




















