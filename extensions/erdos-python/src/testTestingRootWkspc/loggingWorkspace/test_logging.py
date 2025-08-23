# Copyright (c) Microsoft Corporation. All rights reserved.
import logging


def test_logging(caplog):
    logger = logging.getLogger(__name__)
    caplog.set_level(logging.DEBUG)  # Set minimum log level to capture

    logger.debug("This is a debug message.")
    logger.info("This is an info message.")
    logger.warning("This is a warning message.")
    logger.error("This is an error message.")
    logger.critical("This is a critical message.")
