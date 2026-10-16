# Interfaz del piloto

Cliente estático, sin compilación ni dependencias externas, preparado para GitHub Pages. `index.html`, `styles.css`, `app.mjs`, `core.mjs`, `teaching.mjs`, `unit-tools.mjs`, `general-notes.mjs`, `general-notes-ui.mjs`, `suggestions.mjs`, `suggestions-ui.mjs` y `.nojekyll` forman la aplicación. Este directorio no contiene documentos docentes ni datos de muestra.

## Acceso

La aplicación utiliza exclusivamente el repositorio privado `miGUITel/programacion-piloto-datos`. Tras conectar, lee `catalog.json` para mostrar los módulos y unidades disponibles; sus títulos no se incluyen en el código público. Cada unidad se lee y guarda en su propio archivo `MÓDULO/UNIDAD.json`. La capa `core.mjs` valida catálogo, rutas e identidad del documento. Para leer y guardar se necesita un token con el permiso Contents adecuado para ese repositorio. La interfaz no obtiene credenciales de URL, archivos ni almacenamiento del navegador.

El campo de contraseña se vacía al conectar. La credencial solo se conserva en memoria durante la conexión. Desconectar retira las referencias a la credencial y a los documentos cargados, y limpia el contenido mostrado. Cerrar o recargar termina la conexión. La aplicación no registra tokens ni documentos en consola, `localStorage` o `sessionStorage`.

La interfaz pública no constituye una protección de datos: el control de acceso lo aplica GitHub al repositorio privado. No incluir datos privados ni credenciales en el despliegue o en la configuración pública. No hay integración con Excel ni Calendar.

## Edición y guardado

El selector compacto superior permite elegir módulo y unidad y pulsar **Abrir unidad**. Los selectores, sus botones de mejoras y el resumen de sesiones, impartidas y tiempo previsto comparten una única cabecera. No se repiten el nombre completo del módulo, el título de la UT ni la etiqueta «Abierta» en otra fila. Cambiar una selección no cambia por sí solo el documento: solo en ese caso se muestra un aviso indicando qué unidad continúa en pantalla y se desactiva el botón de mejoras de UT hasta abrir la selección. Un módulo sin unidades se muestra como pendiente, sin generar archivos vacíos ni planificación ficticia. **Actualizar lista** relee el catálogo privado sin recargar ni sustituir la unidad abierta. Cuando la selección coincide con lo abierto, la ayuda de estado queda oculta sin reservar espacio.

Los selectores muestran solo el código del módulo y número más título breve de la unidad: `02 HTML`, por ejemplo. El título breve usa `shortTitle` si existe; en su ausencia, toma hasta tres palabras del primer segmento del título. El código completo y el título original no se modifican y siguen disponibles en la ayuda de la opción y en el encabezado accesible de la unidad.

Si hay cambios sin guardar, un editor abierto o un guardado incierto, se bloquean el selector y la apertura de otra unidad. Primero se guardan o se revisan los cambios en la unidad actual. No se descartan borradores al navegar. Cada documento conserva su destino y control de versión independientes; una carga fallida deja intacto el documento anterior. Los nombres de los borradores descargados y los mensajes de commit identifican el módulo y la unidad correspondientes.

La planificación es de solo lectura. El estado se edita en la sesión; observaciones, mejoras y los campos secundarios de seguimiento se editan en un panel lateral. Aplicar en el panel modifica el borrador en memoria. El botón Guardar cambios inicia la única operación explícita de escritura del documento académico. Las sugerencias de la app tienen su propio formulario y guardado independiente.

Se conserva el documento leído y su SHA. Un guardado utiliza esa versión; no se reemplaza automáticamente por una versión más reciente. Si existe conflicto, el borrador permanece disponible, se bloquea el guardado y se ofrece su descarga como JSON. También se bloquea el reenvío cuando no puede confirmarse el resultado de una escritura. Actualizar exige confirmación si descartaría un borrador y solo lo reemplaza después de una lectura válida. No hay reintentos automáticos.

Las entradas y acciones quedan bloqueadas durante la carga o el guardado. El navegador recibe una advertencia de salida cuando hay cambios pendientes. Los borradores no se guardan sin conexión y se perderán si se cierra la página después de aceptar esa advertencia.

### Plan de comprobación del guardado

Una prueba simulada de la interfaz no acredita que el token personal tenga permiso para escribir. La validación de extremo a extremo requiere guardar y volver a leer desde GitHub con el acceso que utiliza el docente.

1. **Proteger el trabajo pendiente.** Si ya hay un error, descargar el borrador antes de recargar, desconectar o actualizar. Conservar también el texto que aún esté abierto en el editor y sin aplicar. No compartir el token en capturas ni mensajes.
2. **Una observación.** En una porción elegida, añadir al final de las observaciones existentes una marca inequívoca como `PRUEBA GUARDADO A`, sin sustituir el contenido anterior. Pulsar Aplicar al borrador. Debe aparecer Cambios sin guardar.
3. **Guardar realmente.** Pulsar Guardar cambios. Solo se considera correcto si aparece la confirmación de GitHub con una revisión. Ante un error, conservar el borrador y recoger el mensaje y código; no insistir a ciegas ni descartar cambios.
4. **Volver a leer.** Tras la confirmación, pulsar Actualizar, abrir la misma porción y comprobar la marca. Después desconectar, volver a conectar y comprobarla de nuevo. Esto separa la persistencia real de un cambio visible solo en memoria.
5. **Mejoras e independencia.** Añadir una marca distinta en Mejoras de otra porción. Aplicar, guardar y actualizar. Comprobar que permanece en esa porción y que no se ha sustituido la observación anterior. Alternar Tabla, Bandas y Agenda: el documento debe ser el mismo.
6. **Limpieza.** Eliminar únicamente las marcas de prueba, guardar y volver a leer. Comprobar que se conservan las anotaciones originales.

En el entorno sintético se comprobarán también la lectura válida seguida de escritura denegada, el rechazo de datos, los límites de peticiones, el conflicto con otra versión, la respuesta de escritura incierta y las tildes y saltos de línea. No provocar estos escenarios contra el trabajo real ni introducir pruebas de estados académicos ficticios.

**Criterio de cierre:** pruebas automatizadas y de interfaz satisfactorias, más confirmación del guardado real y su recuperación tras reconectar. Un mensaje más claro no equivale por sí solo a resolver la causa del error.

**Resultado de la prueba del 15/10/2026:** el docente confirma que el rechazo HTTP 403 se debía a los permisos del token y que, tras corregirlos, GitHub confirmó el guardado con una revisión. La existencia de esa revisión también se ha comprobado mediante lectura del repositorio. El docente ha confirmado asimismo que la anotación permanece tras desconectar y volver a conectar. La escritura y la recuperación reales quedan confirmadas.

## Presentación

Hay tres propuestas provisionales seleccionables arriba: **Tabla**, con columnas alineadas y previsualizaciones de una línea; **Bandas**, con hasta dos líneas de descripción y separación entre sesiones; y **Agenda**, con filas más densas y más anchura para lo previsto, dejando las notas tras sus accesos directos. El contexto de módulo y unidad está siempre arriba, sin barra lateral. En ventanas estrechas la distribución se adapta y las previsualizaciones secundarias se ocultan; el contenido completo sigue disponible en el editor.

Las tres vistas comparten el mismo documento y borrador. Cambiar de vista solo modifica la presentación: no hace peticiones a GitHub, no guarda ni descarta cambios, y mantiene las sesiones desplegadas. La preferencia es temporal y no se añade al JSON.

Hay exactamente dos niveles: las cabeceras de sesión y las filas compactas de sus actividades. Solo las sesiones se despliegan. Las actividades no tienen otro nivel desplegable. Cada cabecera y actividad tiene **Observaciones** y **Mejoras**: ambos abren el mismo panel con el texto completo, enfocando directamente el campo elegido. Se conservan también Realizado y Pendiente como campos secundarios. El punto junto a un botón indica que ese campo contiene texto. La primera porción se representa en la cabecera y conserva su propio horario y notas. No se duplica como otra fila. El horario total de la sesión va del inicio de su primera porción al fin de la última. El cálculo del tiempo incluye todas las porciones mediante `summarize`.

La fecha se muestra una vez en la cabecera, con abreviatura del día de la semana. Su texto completo está disponible en la ayuda contextual y en la descripción accesible. La comparación de fecha pasada utiliza la zona `Europe/Madrid`; la marca no expresa estado de impartición.

### Banda de la unidad

La banda no tiene título visible y muestra una casilla compacta por sesión, ordenada por fecha, con el día del mes. Sus casillas tienen 22 píxeles de alto en escritorio y 32 en móvil. Un cuadro de mes de dos letras aparece al inicio y en cada cambio de mes o año. La línea inferior oscura representa fechas pasadas y el contorno identifica hoy, según `Europe/Madrid`; ninguno expresa impartición. Al pulsar un día se salta a su sesión. En móvil la banda se desplaza horizontalmente sin ensanchar la página. Cambiar de las tres vistas mantiene la misma banda.

Las porciones admiten `eventType: "task"` o `"exam"`; su ausencia significa sin marca. Al diseñar una UT se indicará este tipo explícito en cada porción correspondiente. La app genera automáticamente sus colores: azul para tareas, naranja para exámenes, tanto en la porción como en la sesión y la banda. Si una sesión reúne ambos, la banda combina los colores. El editor permite ajustar el tipo previsto mediante **Marca en la banda de la UT → Aplicar al borrador → Guardar cambios**. No se deduce el tipo del título. Los documentos anteriores siguen siendo válidos sin estos campos y no se migran ni reclasifican automáticamente.

Cada sesión tiene casillas **Tarea** y **Examen** para ajustar las marcas directamente. La selección manual se conserva en `session.eventTypes`; una lista vacía suprime las dos marcas y su ausencia usa los tipos previstos de las porciones. Si las casillas vuelven a coincidir con lo previsto, se retira automáticamente la selección manual. **↶** vuelve explícitamente a lo previsto. Cambiar una marca no modifica títulos, textos, horarios, estado de impartición ni progreso. Una selección manual que desactive un tipo también suprime su color de las porciones, sin borrar sus tipos previstos.

### Presentación de tareas y avisos de examen

**Presentada** confirma que el docente ha presentado y abierto la tarea para trabajarla en clase. Las porciones de tarea tienen su propia casilla (`activity.taskPresented`). En la cabecera, la confirmación afecta a todas las tareas previstas de esa sesión y muestra un contador cuando hay más de una; puede estar parcialmente marcada. Si la tarea solo está marcada a nivel de sesión, se conserva en `session.taskPresented`. No expresa entrega, realización, calificación ni publicación automática en Aula Virtual. Desmarcar permite corregir una confirmación. Todo queda en el borrador hasta pulsar **Guardar cambios**.

**Avisado** confirma que se ha informado al alumnado de un examen. Se conserva `session.examAnnouncedFor` con la fecha concreta del examen. Si cambia esa fecha, la confirmación anterior deja de ser válida para la nueva y el aviso reaparece; no se borra la referencia anterior silenciosamente. No se deduce la confirmación del estado Impartida ni se marca automáticamente.

Los recordatorios aparecen tres sesiones del módulo antes del examen. Se consultan las otras UT del mismo módulo del catálogo, con lecturas independientes y sin sobrescribir el borrador abierto. Se ordenan por fecha y hora, se cuentan identificadores de sesión únicos y se excluyen Cancelada y la fecha original de Reprogramada; una nueva sesión reprogramada cuenta en su nueva posición. Una sesión límite compartida por dos UT cuenta una sola vez. Fechas o estados incompatibles para un mismo identificador detienen el cálculo con un aviso. Un examen cancelado o reprogramado no genera un recordatorio para su fecha original.

El recordatorio se muestra en la sesión umbral; cuando el umbral pertenece a otra UT anterior, aparece arriba de la unidad del examen o de las sesiones intermedias. Cada examen aparece una sola vez por vista. Con menos de tres sesiones anteriores disponibles, se ofrece desde la primera y se explica la limitación. El alcance es el de las UT disponibles en la app; no se inventan sesiones no importadas. Si falla la lectura de una UT, se indica que los avisos están incompletos y se ofrece **Revisar avisos**; no se usa un cálculo parcial como si fuera completo.

**Marcar avisado** marca el borrador de la unidad del examen. Si pertenece a otra UT, el botón lo indica y abre esa unidad leyendo su versión actual; exige guardar o revisar cualquier borrador previo. Solo se marca si sigue siendo el mismo examen, con la misma fecha. Después requiere **Guardar cambios**, con la protección habitual de SHA y guardados inciertos. En una sesión de examen compartida por dos UT, la confirmación tiene un único destino determinista: la primera unidad por ruta que contenga una porción de ese examen. Las otras vistas consultan ese mismo dato.

### Mejoras generales del módulo y de la unidad

El botón **Mejoras** junto al selector de módulo se refiere al módulo seleccionado; el botón junto al selector de unidad se refiere a la unidad abierta y solo se habilita cuando coincide con la selección. El diálogo muestra siempre ese destino antes de escribir. **Guardar mejoras** realiza un guardado independiente, confirmado mediante una nueva lectura de GitHub. Cerrar conserva el borrador en memoria. Mientras haya un borrador de mejoras o el diálogo esté abierto se bloquea el cambio de unidad; guardar, revisar o descartar permite continuar. Las notas de las sesiones y las sugerencias de la app mantienen sus propios guardados.

`general-notes.mjs` conserva un único archivo privado por módulo en `APP/mejoras/MÓDULO.json`: `{schemaVersion: 1, moduleCode, improvements, units: {UNIDAD: {id, improvements}}}`. `improvements` recoge las mejoras generales del módulo; cada entrada de `units` recoge las de esa unidad. No se copian fechas, sesiones, recursos ni estados de preparación. Los textos y campos desconocidos se conservan al editar otro ámbito. El archivo se crea en el primer guardado real del docente, sin rellenar registros ficticios.

La primera lectura de un archivo inexistente confirma también acceso al catálogo del módulo antes de habilitar la creación. Las actualizaciones utilizan el SHA leído y no se reintentan automáticamente. Si el guardado queda incierto o hay conflicto, se conserva el borrador y se bloquea el reenvío. **Revisar GitHub** permite confirmar un envío recibido, recuperar una versión sin perder el borrador o comparar textos en conflicto. **Usar texto de GitHub** o **Conservar mi borrador** son elecciones explícitas; esta última requiere después un guardado manual. No hay almacenamiento local persistente ni trabajo sin conexión.

Cuando una actividad contiene `progress` con valor 0, 1 o 2, se muestra su progreso importado como Pendiente, En proceso o Completada. Es información de solo lectura y se conserva sin convertirla en el estado de la sesión.

## Sugerencias sobre la aplicación

El botón **Sugerencias**, junto a **Piloto**, abre un formulario después de conectar con GitHub. Recoge tipo (mejora, error o idea), título y descripción sobre la propia app, nunca notas académicas de la UT abierta. Reutiliza el permiso Contents de lectura y escritura en `miGUITel/programacion-piloto-datos`; no necesita habilitar Issues ni conceder permisos nuevos.

Cada envío crea exclusivamente `APP/sugerencias/<uuid>.json`, con formato 1, identificador, fecha de creación UTC, tipo, título, descripción y estado inicial `pendiente`. No incorpora automáticamente módulo, UT, URL, datos de sesión ni credenciales. La app no modifica ni elimina propuestas existentes; el historial Git conserva cada creación. El enlace **Ver registro privado en GitHub** permite consultar los archivos con la sesión de GitHub correspondiente.

**Guardar sugerencia** crea el archivo y vuelve a leerlo para confirmar el contenido antes de anunciar éxito. La confirmación incluye un enlace al registro. Una respuesta incierta bloquea el reenvío y muestra **Comprobar guardado**; esa acción solo lee y conserva el mismo identificador. Un registro distinto no se sobrescribe. Un resultado 404 no prueba por sí solo que el acceso al repositorio siga vigente: la comprobación exige leer correctamente `APP/sugerencias/README.md` antes de habilitar el reenvío con el mismo identificador. Si falla esa lectura se mantiene el bloqueo. Cualquier nuevo intento sigue siendo de creación y no puede sustituir el archivo existente.

Cerrar el formulario conserva su borrador en memoria sin guardar ni descartar el borrador académico. El punto junto a Sugerencias indica una propuesta pendiente. Ante un error se conserva el texto y se ofrece descargarlo. Desconectar o salir advierte si hay cambios pendientes; no hay recuperación automática después de cerrar o recargar. Una propuesta guardada permite iniciar otra mediante **Nueva sugerencia**.

La verificación usa pruebas automatizadas y una interfaz con transporte ficticio para éxito, permisos insuficientes, límites, rechazo, respuesta perdida y colisión. No se envían sugerencias ficticias al registro real. El docente envió propuestas reales el 16/10/2026; sus archivos y textos se comprobaron directamente en GitHub.

## Requisitos futuros pendientes

Estos requisitos están anotados para desarrollo posterior; no están implementados. La escritura en GitHub y su recuperación tras reconectar ya están confirmadas. El refinamiento visual continuará después, manteniendo la densidad y el aprovechamiento de la anchura.

- **Accesos de seguimiento más estrechos:** reducir la anchura de los botones Observaciones y Mejoras. Valorar sustituir sus textos por iconos distinguibles, con nombres accesibles y ayuda para identificar su función. Conservar ambos accesos y una zona de pulsación cómoda, especialmente en móvil; ahorrar anchura no debe dificultar su uso táctil. La elección de iconos o texto abreviado queda pendiente de validar.
- **Vista ampliada de sesión:** abrir una vista dedicada de la sesión al hacer clic o tocar cualquier zona de su representación que no tenga otra funcionalidad. Los botones, desplegables, enlaces y demás controles conservarán su acción propia sin abrir además esta vista. Quedan pendientes de definir su contenido, distribución, edición y navegación, así como su relación con el despliegue actual de actividades; no implementar todavía.
- **Preparación de sesiones:** mostrar de un vistazo qué sesiones están preparadas. Valorar una pequeña marca en cada cabecera de sesión o una vista anual limpia que reúna las sesiones y su preparación. Queda abierto si se adopta una opción o ambas; si hay dos vistas, consultarán el mismo dato, sin registros paralelos. La preparación es distinta de la impartición, del progreso de las actividades y de la confirmación de apertura de una tarea. El control se refiere a la sesión completa, no a una marca repetida en cada porción. Antes de implementarlo, acordar cómo se marca una sesión preparada y qué implica cambiar su planificación después; no deducir preparación automáticamente de la existencia de recursos ni del estado Impartida.

## Formato del JSON

El catálogo usa `schemaVersion: 1` y una lista `modules`. Cada módulo contiene `code`, `name` y `units`; cada unidad contiene `code`, `id`, `title` y `path`. Los módulos sin unidades usan `units: []`. Solo se admiten rutas relativas coherentes con la identidad del documento dentro del repositorio privado, nunca URLs ni otros repositorios. La app lee el catálogo pero no lo modifica. Los cambios del catálogo tampoco escriben en los documentos de las unidades.

La interfaz admite `schemaVersion` 1 y 2. El formato 2 mantiene módulo, unidad, sesiones y porciones con campos semánticos e identificadores estables. La primera porción sigue siendo `Cabecera`: tiene duración y seguimiento propios, y no es una fila meramente decorativa.

La instantánea original del Excel, sus fórmulas y coordenadas, las referencias de filas y los metadatos de importación redundantes se conservan en un histórico del repositorio privado. El documento operativo contiene únicamente su referencia `provenance.archivePath` y la huella SHA-256 de sus bytes. La interfaz no descarga ni interpreta ese histórico. Los identificadores de Calendar se conservan en `calendar.uid`; esto no activa ninguna sincronización con Calendar.

La conversión parte de la última versión confirmada de GitHub y verifica que puede reconstruirse exactamente el documento anterior, incluidos textos, estados, horarios, identificadores, campos desconocidos y progreso con valor cero. No reimporta Excel ni reinterpreta las notas. El histórico se publica y comprueba antes de actualizar el documento mediante su SHA, sin forzar cambios concurrentes.

Para futuros cambios, conservar la estructura semántica y los campos desconocidos; separar explícitamente nuevos conceptos sin redistribuir notas automáticamente. Los recordatorios calculables no deben duplicarse como fechas fijas. Los nuevos tipos y confirmaciones se incorporarán después de aprobar su significado. No existe sincronización con Excel; la autoridad de cada documento se rige por las instrucciones privadas acordadas con el docente, no por la mera presencia del módulo en el selector.

## Comprobaciones de navegación

### Prueba de usuario: tareas y avisos

1. Guardar cualquier borrador pendiente, recargar y conectar. Elegir una UT conocida; comprobar que sus observaciones, mejoras y estados anteriores siguen presentes.
2. En una porción que corresponda realmente a una tarea o examen, ajustar su tipo previsto desde el editor, aplicar y comprobar el color de la porción, de la sesión y de la banda. Azul corresponde a tarea y naranja a examen.
3. Probar las casillas Tarea y Examen directamente en una sesión, incluida la combinación de ambas. Comprobar que no cambian sus textos ni su estado. Usar ↶ para recuperar las marcas previstas.
4. Marcar y desmarcar Presentada en una tarea, dejándola al final en su estado real. Si hay varias, comprobar las casillas individuales y el contador de la cabecera. No debe cambiar Impartida ni el progreso importado.
5. En un examen previsto, localizar el recordatorio tres sesiones lectivas antes, contar sesiones y no porciones ni días. Si faltan sesiones disponibles, comprobar la advertencia. Marcar Avisado, comprobar que desaparece el recordatorio y desmarcar para verlo reaparecer; dejar al final la confirmación real.
6. Guardar, esperar la confirmación y pulsar Actualizar. Desconectar, volver a conectar y comprobar marcas y confirmaciones. Cambiar de módulo o UT y volver para verificar que no se mezclan datos. Las observaciones y mejoras deben conservarse.
7. Repetir una casilla en el teléfono y comprobar legibilidad, pulsación, color y guardado. Restaurar cualquier marca usada solo para la prueba y guardar.

El cruce entre UT, las sesiones compartidas, cancelaciones, reprogramaciones, cambio de fecha de examen, datos insuficientes, falta de permisos y conflictos se verifican también con datos sintéticos. No cambiar planificación real ni provocar fallos contra GitHub solo para reproducir esos casos. En un recordatorio de otra UT, guardar primero cualquier borrador; el botón indica y abre la unidad del examen para marcarlo y guardarlo allí.

Las pruebas automatizadas comprueban catálogo, rutas, identidad, aislamiento de versiones y destinos, fallos de acceso y guardados inciertos. En el entorno sintético se comprueban también: bloqueo del selector con un borrador pendiente; guardar en una unidad, abrir otra y volver sin mezclar notas; cambio entre dos UT del mismo módulo; módulo sin unidades; fallo de carga conservando la unidad anterior; y limpieza de la conexión. No introducir unidades ni anotaciones ficticias en el repositorio privado real para estas pruebas.

## Seguridad y ejecución

La política CSP permite código y estilos únicamente del mismo origen y conexiones únicamente a `https://api.github.com`. No se utilizan CDN ni scripts externos. El contenido del documento se representa con `textContent` y nodos de texto, sin interpretar HTML. Los únicos enlaces de descarga creados por la interfaz son archivos JSON del borrador, iniciados por el usuario.

Para una comprobación local se necesita servir este directorio por HTTP; abrir el HTML como `file:` puede impedir los módulos ES. No hace falta instalar paquetes ni ejecutar un proceso de compilación. El archivo `.nojekyll` evita el procesamiento de Jekyll. Los cambios del documento privado no requieren volver a publicar esta interfaz.

Las comprobaciones automatizadas de esquema y persistencia corresponden a los tests de `core.mjs`. Las pruebas de interfaz deben usar datos sintéticos fuera del directorio publicable y no deben grabar credenciales reales en capturas, trazas o fixtures.
