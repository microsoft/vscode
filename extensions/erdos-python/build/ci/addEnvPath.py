# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

#Adds the virtual environment's executable path to json file

import json
import sys
import os.path
jsonPath = sys.argv[1]
key = sys.argv[2]

if os.path.isfile(jsonPath):
    with open(jsonPath, 'r') as read_file:
        data = json.load(read_file)
else:
    directory = os.path.dirname(jsonPath)
    if not os.path.exists(directory):
        os.makedirs(directory)
        with open(jsonPath, 'w+') as read_file:
            data = {}
    data = {}
with open(jsonPath, 'w') as outfile:
    if key == 'condaExecPath':
        data[key] = sys.argv[3]
    else:
        data[key] = sys.executable
    json.dump(data, outfile, sort_keys=True, indent=4)
