Metadata-Version: 2.1
Name: lsprotocol
Version: 2023.0.1
Summary: Python implementation of the Language Server Protocol.
Author-email: Microsoft Corporation <lsprotocol-help@microsoft.com>
Maintainer-email: Brett Cannon <brett@python.org>, Karthik Nadig <kanadig@microsoft.com>
Requires-Python: >=3.7
Description-Content-Type: text/markdown
Classifier: Development Status :: 5 - Production/Stable
Classifier: License :: OSI Approved :: MIT License
Classifier: Programming Language :: Python
Classifier: Programming Language :: Python :: 3.7
Classifier: Programming Language :: Python :: 3.8
Classifier: Programming Language :: Python :: 3.9
Classifier: Programming Language :: Python :: 3.10
Classifier: Programming Language :: Python :: 3.11
Classifier: Programming Language :: Python :: 3.12
Classifier: Programming Language :: Python :: Implementation :: CPython
Classifier: Programming Language :: Python :: Implementation :: PyPy
Requires-Dist: attrs>=21.3.0
Requires-Dist: cattrs!=23.2.1
Project-URL: Issues, https://github.com/microsoft/lsprotocol/issues
Project-URL: Source, https://github.com/microsoft/lsprotocol

# Language Server Protocol Types implementation for Python

`lsprotocol` is a python implementation of object types used in the Language Server Protocol (LSP). This repository contains the code generator and the generated types for LSP.

## Overview

LSP is used by editors to communicate with various tools to enables services like code completion, documentation on hover, formatting, code analysis, etc. The intent of this library is to allow you to build on top of the types used by LSP. This repository will be kept up to date with the latest version of LSP as it is updated.

## Installation

`python -m pip install lsprotocol`

## Usage

### Using LSP types

```python
from lsprotocol import types

position = types.Position(line=10, character=3)
```

### Using built-in type converters

```python
# test.py
import json
from lsprotocol import converters, types

position = types.Position(line=10, character=3)
converter = converters.get_converter()
print(json.dumps(converter.unstructure(position, unstructure_as=types.Position)))
```

Output:

```console
> python test.py
{"line": 10, "character": 3}
```

