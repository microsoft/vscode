#  Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

import ast
import os
import sys

my_dictionary = {
	'foo': 23,  # this should be colorized as comment
	'bar': "foobar"  # this should be colorized as comment
}

my_car = {
	'brand': 'Ford',
	'model': 'Mustang',
	'year': 1964
}

def my_rando_pylance_function():
	"""This is a docstring"""
	# This is a comment
	# This is
	# a comment
	# This is a comment
	print("yo")
