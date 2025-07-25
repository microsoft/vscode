# Pattern matching and pipes
defmodule Math do
  @moduledoc """
  Math operations
  """

  def factorial(0), do: 1
  def factorial(n) when n > 0, do: n * factorial(n - 1)

  def process_list(list) do
    list
    |> Enum.filter(&(&1 > 0))
    |> Enum.map(& &1 * 2)
  end
end

case File.read("path") do
  {:ok, content} -> IO.puts(content)
  {:error, reason} -> IO.puts("Error: #{reason}")
end

spawn(fn -> Process.sleep(1000) end)
