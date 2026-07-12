def check_skipped_condition(item):
    """A helper function that checks if a item has a skip or a true skip condition.

    Keyword arguments:
    item -- the pytest item object.
    """

    for marker in item.own_markers:
        # If the test is marked with skip then it will not hit the pytest_report_teststatus hook,
        # therefore we need to handle it as skipped here.
        skip_condition = False
        if marker.name == "skipif":
            skip_condition = any(marker.args)
        if marker.name == "skip" or skip_condition:
            return True
    return False
