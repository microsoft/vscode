#include <iostream>
#include <string>

int main()
{
    std::string name = getName();
    std::cout << "Hello, " << name << "!" << std::endl;
}

std::string getName()
{
    std::string name;
    std::cout << "Enter your name: ";
    std::cin >> name;
    return name;
}
