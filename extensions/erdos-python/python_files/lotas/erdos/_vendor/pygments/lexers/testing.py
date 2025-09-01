"""
    pygments.lexers.testing
    ~~~~~~~~~~~~~~~~~~~~~~~

    Lexers for testing languages.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from erdos._vendor.pygments.lexer import RegexLexer, include, bygroups
from erdos._vendor.pygments.token import Comment, Keyword, Name, String, Number, Generic, Text

__all__ = ['GherkinLexer', 'TAPLexer']


class GherkinLexer(RegexLexer):
    """
    For Gherkin syntax.
    """
    name = 'Gherkin'
    aliases = ['gherkin', 'cucumber']
    filenames = ['*.feature']
    mimetypes = ['text/x-gherkin']
    url = 'https://cucumber.io/docs/gherkin'
    version_added = '1.2'

    feature_keywords = '^(기능|機能|功能|フィーチャ|خاصية|תכונה|Функціонал|Функционалност|Функционал|Фича|Особина|Могућност|Özellik|Właściwość|Tính năng|Trajto|Savybė|Požiadavka|Požadavek|Osobina|Ominaisuus|Omadus|OH HAI|Mogućnost|Mogucnost|Jellemző|Fīča|Funzionalità|Funktionalität|Funkcionalnost|Funkcionalitāte|Funcționalitate|Functionaliteit|Functionalitate|Funcionalitat|Funcionalidade|Fonctionnalité|Fitur|Feature|Egenskap|Egenskab|Crikey|Característica|Arwedd)(:)(.*)$'
    feature_element_keywords = '^(\\s*)(시나리오 개요|시나리오|배경|背景|場景大綱|場景|场景大纲|场景|劇本大綱|劇本|剧本大纲|剧本|テンプレ|シナリオテンプレート|シナリオテンプレ|シナリオアウトライン|シナリオ|سيناريو مخطط|سيناريو|الخلفية|תרחיש|תבנית תרחיש|רקע|Тарих|Сценарій|Сценарио|Сценарий структураси|Сценарий|Структура сценарію|Структура сценарија|Структура сценария|Скица|Рамка на сценарий|Пример|Предыстория|Предистория|Позадина|Передумова|Основа|Концепт|Контекст|Założenia|Wharrimean is|Tình huống|The thing of it is|Tausta|Taust|Tapausaihio|Tapaus|Szenariogrundriss|Szenario|Szablon scenariusza|Stsenaarium|Struktura scenarija|Skica|Skenario konsep|Skenario|Situācija|Senaryo taslağı|Senaryo|Scénář|Scénario|Schema dello scenario|Scenārijs pēc parauga|Scenārijs|Scenár|Scenaro|Scenariusz|Scenariul de şablon|Scenariul de sablon|Scenariu|Scenario Outline|Scenario Amlinellol|Scenario|Scenarijus|Scenarijaus šablonas|Scenarij|Scenarie|Rerefons|Raamstsenaarium|Primer|Pozadí|Pozadina|Pozadie|Plan du scénario|Plan du Scénario|Osnova scénáře|Osnova|Náčrt Scénáře|Náčrt Scenáru|Mate|MISHUN SRSLY|MISHUN|Kịch bản|Konturo de la scenaro|Kontext|Konteksts|Kontekstas|Kontekst|Koncept|Khung tình huống|Khung kịch bản|Háttér|Grundlage|Geçmiş|Forgatókönyv vázlat|Forgatókönyv|Fono|Esquema do Cenário|Esquema do Cenario|Esquema del escenario|Esquema de l\'escenari|Escenario|Escenari|Dis is what went down|Dasar|Contexto|Contexte|Contesto|Condiţii|Conditii|Cenário|Cenario|Cefndir|Bối cảnh|Blokes|Bakgrunn|Bakgrund|Baggrund|Background|B4|Antecedents|Antecedentes|All y\'all|Achtergrond|Abstrakt Scenario|Abstract Scenario)(:)(.*)$'
    examples_keywords = '^(\\s*)(예|例子|例|サンプル|امثلة|דוגמאות|Сценарији|Примери|Приклади|Мисоллар|Значения|Örnekler|Voorbeelden|Variantai|Tapaukset|Scenarios|Scenariji|Scenarijai|Příklady|Példák|Príklady|Przykłady|Primjeri|Primeri|Piemēri|Pavyzdžiai|Paraugs|Juhtumid|Exemplos|Exemples|Exemplele|Exempel|Examples|Esempi|Enghreifftiau|Ekzemploj|Eksempler|Ejemplos|EXAMPLZ|Dữ liệu|Contoh|Cobber|Beispiele)(:)(.*)$'
    step_keywords = '^(\\s*)(하지만|조건|먼저|만일|만약|단|그리고|그러면|那麼|那么|而且|當|当|前提|假設|假设|假如|假定|但是|但し|並且|并且|同時|同时|もし|ならば|ただし|しかし|かつ|و |متى |لكن |عندما |ثم |بفرض |اذاً |כאשר |וגם |בהינתן |אזי |אז |אבל |Якщо |Унда |То |Припустимо, що |Припустимо |Онда |Но |Нехай |Лекин |Когато |Када |Кад |К тому же |И |Задато |Задати |Задате |Если |Допустим |Дадено |Ва |Бирок |Аммо |Али |Але |Агар |А |І |Și |És |Zatati |Zakładając |Zadato |Zadate |Zadano |Zadani |Zadan |Youse know when youse got |Youse know like when |Yna |Ya know how |Ya gotta |Y |Wun |Wtedy |When y\'all |When |Wenn |WEN |Và |Ve |Und |Un |Thì |Then y\'all |Then |Tapi |Tak |Tada |Tad |Så |Stel |Soit |Siis |Si |Sed |Se |Quando |Quand |Quan |Pryd |Pokud |Pokiaľ |Però |Pero |Pak |Oraz |Onda |Ond |Oletetaan |Og |Och |O zaman |Når |När |Niin |Nhưng |N |Mutta |Men |Mas |Maka |Majd |Mais |Maar |Ma |Lorsque |Lorsqu\'|Kun |Kuid |Kui |Khi |Keď |Ketika |Když |Kaj |Kai |Kada |Kad |Jeżeli |Ja |Ir |I CAN HAZ |I |Ha |Givun |Givet |Given y\'all |Given |Gitt |Gegeven |Gegeben sei |Fakat |Eğer ki |Etant donné |Et |Então |Entonces |Entao |En |Eeldades |E |Duota |Dun |Donitaĵo |Donat |Donada |Do |Diyelim ki |Dengan |Den youse gotta |De |Dato |Dar |Dann |Dan |Dado |Dacă |Daca |DEN |Când |Cuando |Cho |Cept |Cand |Cal |But y\'all |But |Buh |Biết |Bet |BUT |Atès |Atunci |Atesa |Anrhegedig a |Angenommen |And y\'all |And |An |Ama |Als |Alors |Allora |Ali |Aleshores |Ale |Akkor |Aber |AN |A také |A |\\* )'

    tokens = {
        'comments': [
            (r'^\s*#.*$', Comment),
        ],
        'feature_elements': [
            (step_keywords, Keyword, "step_content_stack"),
            include('comments'),
            (r"(\s|.)", Name.Function),
        ],
        'feature_elements_on_stack': [
            (step_keywords, Keyword, "#pop:2"),
            include('comments'),
            (r"(\s|.)", Name.Function),
        ],
        'examples_table': [
            (r"\s+\|", Keyword, 'examples_table_header'),
            include('comments'),
            (r"(\s|.)", Name.Function),
        ],
        'examples_table_header': [
            (r"\s+\|\s*$", Keyword, "#pop:2"),
            include('comments'),
            (r"\\\|", Name.Variable),
            (r"\s*\|", Keyword),
            (r"[^|]", Name.Variable),
        ],
        'scenario_sections_on_stack': [
            (feature_element_keywords,
             bygroups(Name.Function, Keyword, Keyword, Name.Function),
             "feature_elements_on_stack"),
        ],
        'narrative': [
            include('scenario_sections_on_stack'),
            include('comments'),
            (r"(\s|.)", Name.Function),
        ],
        'table_vars': [
            (r'(<[^>]+>)', Name.Variable),
        ],
        'numbers': [
            (r'(\d+\.?\d*|\d*\.\d+)([eE][+-]?[0-9]+)?', String),
        ],
        'string': [
            include('table_vars'),
            (r'(\s|.)', String),
        ],
        'py_string': [
            (r'"""', Keyword, "#pop"),
            include('string'),
        ],
        'step_content_root': [
            (r"$", Keyword, "#pop"),
            include('step_content'),
        ],
        'step_content_stack': [
            (r"$", Keyword, "#pop:2"),
            include('step_content'),
        ],
        'step_content': [
            (r'"', Name.Function, "double_string"),
            include('table_vars'),
            include('numbers'),
            include('comments'),
            (r'(\s|.)', Name.Function),
        ],
        'table_content': [
            (r"\s+\|\s*$", Keyword, "#pop"),
            include('comments'),
            (r"\\\|", String),
            (r"\s*\|", Keyword),
            include('string'),
        ],
        'double_string': [
            (r'"', Name.Function, "#pop"),
            include('string'),
        ],
        'root': [
            (r'\n', Name.Function),
            include('comments'),
            (r'"""', Keyword, "py_string"),
            (r'\s+\|', Keyword, 'table_content'),
            (r'"', Name.Function, "double_string"),
            include('table_vars'),
            include('numbers'),
            (r'(\s*)(@[^@\r\n\t ]+)', bygroups(Name.Function, Name.Tag)),
            (step_keywords, bygroups(Name.Function, Keyword),
             'step_content_root'),
            (feature_keywords, bygroups(Keyword, Keyword, Name.Function),
             'narrative'),
            (feature_element_keywords,
             bygroups(Name.Function, Keyword, Keyword, Name.Function),
             'feature_elements'),
            (examples_keywords,
             bygroups(Name.Function, Keyword, Keyword, Name.Function),
             'examples_table'),
            (r'(\s|.)', Name.Function),
        ]
    }

    def analyse_text(self, text):
        return


class TAPLexer(RegexLexer):
    """
    For Test Anything Protocol (TAP) output.
    """
    name = 'TAP'
    url = 'https://testanything.org/'
    aliases = ['tap']
    filenames = ['*.tap']
    version_added = '2.1'

    tokens = {
        'root': [
            # A TAP version may be specified.
            (r'^TAP version \d+\n', Name.Namespace),

            # Specify a plan with a plan line.
            (r'^1\.\.\d+', Keyword.Declaration, 'plan'),

            # A test failure
            (r'^(not ok)([^\S\n]*)(\d*)',
             bygroups(Generic.Error, Text, Number.Integer), 'test'),

            # A test success
            (r'^(ok)([^\S\n]*)(\d*)',
             bygroups(Keyword.Reserved, Text, Number.Integer), 'test'),

            # Diagnostics start with a hash.
            (r'^#.*\n', Comment),

            # TAP's version of an abort statement.
            (r'^Bail out!.*\n', Generic.Error),

            # TAP ignores any unrecognized lines.
            (r'^.*\n', Text),
        ],
        'plan': [
            # Consume whitespace (but not newline).
            (r'[^\S\n]+', Text),

            # A plan may have a directive with it.
            (r'#', Comment, 'directive'),

            # Or it could just end.
            (r'\n', Comment, '#pop'),

            # Anything else is wrong.
            (r'.*\n', Generic.Error, '#pop'),
        ],
        'test': [
            # Consume whitespace (but not newline).
            (r'[^\S\n]+', Text),

            # A test may have a directive with it.
            (r'#', Comment, 'directive'),

            (r'\S+', Text),

            (r'\n', Text, '#pop'),
        ],
        'directive': [
            # Consume whitespace (but not newline).
            (r'[^\S\n]+', Comment),

            # Extract todo items.
            (r'(?i)\bTODO\b', Comment.Preproc),

            # Extract skip items.
            (r'(?i)\bSKIP\S*', Comment.Preproc),

            (r'\S+', Comment),

            (r'\n', Comment, '#pop:2'),
        ],
    }
