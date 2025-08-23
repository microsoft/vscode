def is_same_tree(tree1, tree2, test_key_arr, path="root") -> bool:
    """Helper function to test if two test trees are the same with detailed error logs.

    `is_same_tree` starts by comparing the root attributes, and then checks if all children are the same.
    """
    # Compare the root.
    for key in ["path", "name", "type_", "id_"]:
        if tree1.get(key) != tree2.get(key):
            print(
                f"Difference found at {path}: '{key}' is '{tree1.get(key)}' in tree1 and '{tree2.get(key)}' in tree2."
            )
            return False

    # Compare child test nodes if they exist, otherwise compare test items.
    if "children" in tree1 and "children" in tree2:
        # Sort children by path before comparing since order doesn't matter of children
        children1 = sorted(tree1["children"], key=lambda x: x["path"])
        children2 = sorted(tree2["children"], key=lambda x: x["path"])

        # Compare test nodes.
        if len(children1) != len(children2):
            print(
                f"Difference in number of children at {path}: {len(children1)} in tree1 and {len(children2)} in tree2."
            )
            return False
        else:
            for i, (child1, child2) in enumerate(zip(children1, children2)):
                if not is_same_tree(child1, child2, test_key_arr, path=f"{path} -> child {i}"):
                    return False
    elif "id_" in tree1 and "id_" in tree2:
        # Compare test items.
        for key in test_key_arr:
            if tree1.get(key) != tree2.get(key):
                print(
                    f"Difference found at {path}: '{key}' is '{tree1.get(key)}' in tree1 and '{tree2.get(key)}' in tree2."
                )
                return False

    return True
