# Single-line comment
=begin
Multi-line comment
=end

module MyModule
    class Person
      include Enumerable
      attr_accessor :name

      @@class_var = 10

      def initialize(name)
        @name = name
        @counter = 0
      end

      def each(&block)
        [1,2,3].each(&block)
      end

      def self.create
        new("default")
      end
    end
  end

  lambda = ->(x) { x ** 2 }
  hash = { key: :value, 'old' => 1 }
  symbol = :test
  string = "Interpolation: #{name}"
  %w[array of words]
