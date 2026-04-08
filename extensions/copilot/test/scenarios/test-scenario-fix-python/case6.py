# Copyright (c) Microsoft Corporation and GitHub. All rights reserved.

def palindrome(s, inner = False):
    # given a string of lowercase letters return a palindrome obtained by removing at most one character
    # if imposible return None
    n = len(s)
    i = 0
    j = n
    while i<=j:
        if s[i] == s[j]:
            i += 1
            j += -1
        elif inner == False:
            if s[i+1:j+1] == palindrome(s[i+1:j+1],inner = True):
                return s[0:i]+s[i+1:j+1]+s[j+1:]
            elif s[i:j] == palindrome(s[i:j],inner = True):
                return s[0:i]+s[i:j]+s[j+1:]
            else:
                return None
        else:
            return None
    return s