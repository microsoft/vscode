<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" 
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:wi="http://schemas.microsoft.com/wix/2006/wi">

  <xsl:strip-space elements="*"/>
 
  <xsl:template match="@*|node()">
    <xsl:copy>
      <xsl:apply-templates select="@*|node()" />
    </xsl:copy>
  </xsl:template>

  <xsl:key name="vId1ToReplace" match="wi:Component[wi:File[contains(@Source,'Code.exe')]]" use="@Id"/>
  <xsl:template match="node()[key('vId1ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">CODE.EXE</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'Code.exe')]">
     <xsl:copy>
        <xsl:attribute name="Id">CODE.EXE</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId2ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\bower.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId2ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">BOWER.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\bower.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">BOWER.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId3ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\c.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId3ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">C.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\c.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">C.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId4ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\config.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId4ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">CONFIG.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\config.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">CONFIG.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId5ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\cpp.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId5ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">CPP.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\cpp.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">CPP.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId7ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\csharp.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId7ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">CSHARP.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\csharp.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">CSHARP.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId8ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\css.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId8ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">CSS.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\css.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">CSS.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId9ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\default.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId9ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">DEFAULT.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\default.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">DEFAULT.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId10ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\go.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId10ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">GO.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\go.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">GO.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId11ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\html.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId11ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">HTML.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\html.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">HTML.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId12ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\jade.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId12ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">JADE.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\jade.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">JADE.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId13ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\java.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId13ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">JAVA.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\java.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">JAVA.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId14ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\javascript.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId14ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">JAVASCRIPT.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\javascript.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">JAVASCRIPT.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId15ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\json.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId15ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">JSON.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\json.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">JSON.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId16ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\less.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId16ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">LESS.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\less.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">LESS.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId17ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\markdown.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId17ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">MARKDOWN.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\markdown.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">MARKDOWN.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId18ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\php.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId18ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">PHP.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\php.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">PHP.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId19ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\powershell.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId19ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">POWERSHELL.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\powershell.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">POWERSHELL.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId20ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\python.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId20ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">PYTHON.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\python.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">PYTHON.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId21ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\react.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId21ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">REACT.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\react.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">REACT.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId22ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\ruby.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId22ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">RUBY.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\ruby.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">RUBY.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId23ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\sass.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId23ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">SASS.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\sass.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">SASS.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId24ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\shell.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId24ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">SHELL.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\shell.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">SHELL.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId25ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\sql.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId25ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">SQL.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\sql.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">SQL.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId26ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\typescript.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId26ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">TYPESCRIPT.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\typescript.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">TYPESCRIPT.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId27ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\vue.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId27ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">VUE.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\vue.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">VUE.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId28ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\xml.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId28ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">XML.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\xml.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">XML.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <xsl:key name="vId29ToReplace" match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\yaml.ico')]]" use="@Id"/>
  <xsl:template match="node()[key('vId29ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">YAML.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\yaml.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">YAML.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>

  <!-- Remove conflicting non-MSI updater -->
  <xsl:key name="FileToRemove" match="wi:Component[wi:File[contains(@Source,'tools\inno_updater.exe')]]" use="@Id" />
  <xsl:template match="*[self::wi:Component or self::wi:ComponentRef][key('FileToRemove', @Id)]" />

  <xsl:key name="FileToRemove" match="wi:Component[wi:File[contains(@Source,'tools\vcruntime140.dll')]]" use="@Id" />
  <xsl:template match="*[self::wi:Component or self::wi:ComponentRef][key('FileToRemove', @Id)]" />
</xsl:stylesheet>
