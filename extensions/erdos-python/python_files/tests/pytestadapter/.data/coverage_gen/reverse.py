# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

def reverse_string(s):
    if s is None or s == "":
        return "Error: Input is None"
    return s[::-1]

def reverse_sentence(sentence):
    if sentence is None or sentence == "":
        return "Error: Input is None"
    words = sentence.split()
    reversed_words = [reverse_string(word) for word in words]
    return " ".join(reversed_words)

# Example usage
if __name__ == "__main__":
    sample_string = "hello"
    print(reverse_string(sample_string))  # Output: "olleh"
