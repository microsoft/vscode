 <!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kevin & Priscila - Invitación de Casamiento</title>

  <!-- FORMA EXTERNA de CSS: se enlaza el archivo estilos.css -->
  <link rel="stylesheet" href="estilos.css">

  <!-- FORMA INTERNA de CSS: bloque <style> dentro del <head> -->
  <style>
    .fecha-hora {
      font-size: 1.3rem;
      font-weight: bold;
      letter-spacing: 1px;
    }
    .lugar {
      font-style: italic;
    }
  </style>
</head>
<body>

  <!-- DIV Nº1 (padre): contenedor principal de toda la invitación.
       Aquí se aplica la HERENCIA CSS: el color y la tipografía
       definidos en #invitacion se heredan por todos sus hijos. -->
  <div id="invitacion" class="contenedor-principal">

    <header>
      <h1>Kevin <span class="ampersand">&</span> Priscila</h1>
      <p class="subtitulo">¡Nos casamos y queremos celebrarlo con vos!</p>
    </header>

    <!-- DIV Nº2 (hijo): sección de fotos de los novios -->
    <div class="seccion fotos">
      <div class="foto-placeholder" id="foto-novio">
        <p>Foto de Kevin</p>
      </div>
      <div class="foto-placeholder" id="foto-novia">
        <p>Foto de Priscila</p>
      </div>
    </div>

    <!-- DIV Nº3 (hijo): datos del evento -->
    <div class="seccion detalles">
      <p class="fecha-hora">Sábado 14 de noviembre de 2026 · 18:30 hs</p>
      <p class="lugar">Salón "Jardines del Sol" — Av. Los Aromos 1234, Córdoba</p>
      <p>
        Código de vestimenta:
        <!-- ETIQUETA <span>: elemento en línea usado para resaltar
             una palabra clave DENTRO del mismo párrafo -->
        <!-- FORMA INLINE de CSS: estilo puesto directo en el atributo style -->
        <span class="vestimenta" style="font-weight: bold; color: #8b0000;">
          Clásico - Formal
        </span>
      </p>
    </div>

    <!-- DIV Nº4 (hijo): frase emotiva -->
    <div class="seccion frase">
      <p>"El amor no se mira, se siente; y hoy elegimos sentirlo juntos, para siempre."</p>
    </div>

  </div>

</body>
</html>
