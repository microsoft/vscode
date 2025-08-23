# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import unittest
import logging
import sys


def test_a(caplog):
    logger = logging.getLogger(__name__)
    # caplog.set_level(logging.ERROR)  # Set minimum log level to capture
    logger.setLevel(logging.WARN)

    logger.debug("This is a debug message.")
    logger.info("This is an info message.")
    logger.warning("This is a warning message.")
    logger.error("This is an error message.")
    logger.critical("This is a critical message.")
    assert False


class SimpleClass(unittest.TestCase):
    def test_simple_unit(self):
        print("expected printed output, stdout")
        print("expected printed output, stderr", file=sys.stderr)
        assert True
