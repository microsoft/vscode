from typing import Optional, List

def initialize_list(list: Optional[List[int]] = None):
    if list is None:
        list = [None for _ in range(4)]