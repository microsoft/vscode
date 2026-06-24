
namespace ConsoleApplication1{
    class Program
    {
        static async Task CallingMethodAsync(int millisecondsDelay) {
            Console.WriteLine("  Entering calling method.");
            CalledMethodAsync(millisecondsDelay);
        }

        static async Task CalledMethodAsync(int millisecondsDelay){
            Console.WriteLine("    Entering called method, starting and awaiting Task.Delay.");
            await Task.Delay(millisecondsDelay);
            Console.WriteLine("    Task.Delay is finished--returning from called method.");
        }
    }
}