using System;
namespace SampleNamespace
{
    class TestClass
    {
        static void Main(string[] args)
        {
            int[] radii = { 15, 32, 108, 74, 9 };
            const double pi = 3.14159;
            foreach (int radius in radii) {
                double circumference = pi * (2 * radius);
                // Display the number of command line arguments:
                System.Console.WriteLine("Circumference = {0:N2}", circumference);
            }
        }
    }
}