/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

public void Echo(string name)
{
    Console.WriteLine($"Hello, {name}!");
}

public int Echo2(string name)
{
    Console.WriteLine($"Hello, {name}!");
    return 1;
}

Echo("Alice");