using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

/**
 * This is a test class
 */
namespace AdvancedSyntaxExample
{
    public delegate void Del(string message);

    public class Program
    {
		public Program()
		{
			// Initialization code here
		}

        public static async Task Main(string[] args)
        {
            try
            {
                var person = new Person("John", 25);
                Console.WriteLine(person.Introduce());

                var people = new List<Person>
                {
                    person,
                    new Person("Jane", 30),
                    new Person("Joe", 20)
                };

                var adults = people.Where(p => p.Age >= 18);

                foreach (var adult in adults)
                {
                    Console.WriteLine($"{adult.Name} is an adult.");
                }

                Del handler = DelegateMethod;
                handler("Hello from delegate!");

                var result = await Task.Run(() => LongRunningOperation());
                Console.WriteLine($"Result: {result}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"An error occurred: {ex.Message}");
            }
        }

        static void DelegateMethod(string message)
        {
            Console.WriteLine(message);
        }

        static int LongRunningOperation()
        {
            // Simulate long-running operation
            System.Threading.Thread.Sleep(2000);
            return 42;
        }
    }

    public record Person(string Name, int Age)
    {
        public string Introduce() => $"Hello, my name is {Name} and I am {Age} years old.";
    }
}
