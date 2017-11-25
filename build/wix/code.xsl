<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" 
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:wi="http://schemas.microsoft.com/wix/2006/wi">

  <xsl:template match="@*|node()">
    <xsl:copy>
      <xsl:apply-templates select="@*|node()" />
    </xsl:copy>
  </xsl:template>

  <xsl:key name="vId1ToReplace"
    match="wi:Component[wi:File[contains(@Source,'Code.exe')]]"
    use="@Id"/>
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

  <xsl:key name="vId2ToReplace"
    match="wi:Component[wi:File[contains(@Source,'resources\app\resources\win32\code_file.ico')]]"
    use="@Id"/>
  <xsl:template match="node()[key('vId2ToReplace', @Id)]">
    <xsl:copy>
      <xsl:attribute name="Id">CODE_FILE.ICO</xsl:attribute>
      <xsl:copy-of select="@*[name()!='Id']"/>
      <xsl:apply-templates />
    </xsl:copy>
  </xsl:template>
  <xsl:template match="wi:Component/wi:File[contains(@Source,'resources\app\resources\win32\code_file.ico')]">
     <xsl:copy>
        <xsl:attribute name="Id">CODE_FILE.ICO</xsl:attribute>
        <xsl:copy-of select="@*[name()!='Id']"/>
        <xsl:apply-templates />
     </xsl:copy>
  </xsl:template>
  
</xsl:stylesheet>
