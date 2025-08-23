# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import logging
import sys


def test_logging2(caplog):
    logger = logging.getLogger(__name__)
    caplog.set_level(logging.DEBUG)  # Set minimum log level to capture

    logger.debug("This is a debug message.")
    logger.info("This is an info message.")
    logger.warning("This is a warning message.")
    logger.error("This is an error message.")
    logger.critical("This is a critical message.")

    # Printing to stdout and stderr
    print("This is a stdout message.")
    print("This is a stderr message.", file=sys.stderr)
    assert False


def test_logging(caplog):
    logger = logging.getLogger(__name__)
    caplog.set_level(logging.DEBUG)  # Set minimum log level to capture

    logger.debug("This is a debug message.")
    logger.info("This is an info message.")
    logger.warning("This is a warning message.")
    logger.error("This is an error message.")
    logger.critical("This is a critical message.")

    # Printing to stdout and stderr
    print("This is a stdout message.")
    print("This is a stderr message.", file=sys.stderr)
