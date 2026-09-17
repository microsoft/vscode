#include <iostream>
#include <string>

int main()
{
    std::string name = getName();
    std::cout << "Hello, " << name << "!" << std::endl;
}

std::string getName(bool getLastName)
{
    std::string name;
    std::cout << "Enter your name: ";
    std::cin >> name;

    if (getLastName)
    {
        std::string lastName;
        std::cout << "Enter your last name: ";
        std::cin >> lastName;
        name += " " + lastName;
    }

    return name;
}
