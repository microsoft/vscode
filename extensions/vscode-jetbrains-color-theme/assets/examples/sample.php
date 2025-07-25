<?php
$heredoc = <<< HEREDOC_ID
some $contents
HEREDOC_ID;

function foo() {
   $a = [0, 1, 2];
   return SomeClass::$shared;
}

// Sample comment

use AnotherClass as SomeAlias;
#[Attribute] class SomeClass extends One implements Another {
   #[Attribute(1, 2)] public $my;
   protected $myProtected;
   private $myPrivate;
   public static $shared;
   const CONSTANT = 0987654321;
   /**
    * Description by <a href="mailto:">user@host.dom</a>
    * Semantic highlighting:
    * @param $abc
    * @param TValue $def
    * @property $magic
    * @method m()
    * @return SomeType
    */
   function doSmth($abc, $def, int $foo, SomeClass $bar) {
      /** @var SomeAlias $b */
      $b = new SomeAlias();
      foo();
      $def .=  self::magic;
      $def .=  self::CONSTANT;
      $v = Helper::convert(namedArgument: $abc . "\n {$def}" . $$def);
      $q = new Query( $this->invent(abs(0x80)) );
      $q = new Query( $this->protectedInvent(abs(0x80)) );
      $q = new Query( $this->privateInvent(abs(0x80)) );
      $q = $this->createQueryBuilder()
          ->where("p.id <= :id")
          ->setParameter("id", 1);
      return array($v => $q->result);
   }
}

interface Another {
}

include (dirname(__FILE__) . "inc.php");
`rm -r`;

goto Label;

?>
<p><?php echo "Hello, world!"?></p>

<?php
// Single-line comment
# Another comment
/* Multi-line
   comment */

declare(strict_types=1);

namespace MyApp;

interface Logger {
    public function log(string $message): void;
}

trait Loggable {
    abstract public function save();
}

public function log(string $message): void {
    echo <<<HTML
    <div>$message</div>
    HTML;
}
