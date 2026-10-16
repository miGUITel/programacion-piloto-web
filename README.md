# Interfaz del piloto

Cliente estático, sin compilación ni dependencias externas, preparado para GitHub Pages. `index.html`, `styles.css`, `app.mjs`, `core.mjs`, `suggestions.mjs`, `suggestions-ui.mjs` y `.nojekyll` forman la aplicación. Este directorio no contiene documentos docentes ni datos de muestra.

## Acceso

La aplicación utiliza exclusivamente el repositorio privado `miGUITel/programacion-piloto-datos`. Tras conectar, lee `catalog.json` para mostrar los módulos y unidades disponibles; sus títulos no se incluyen en el código público. Cada unidad se lee y guarda en su propio archivo `MÓDULO/UNIDAD.json`. La capa `core.mjs` valida catálogo, rutas e identidad del documento. Para leer y guardar se necesita un token con el permiso Contents adecuado para ese repositorio. La interfaz no obtiene credenciales de URL, archivos ni almacenamiento del navegador.

El campo de contraseña se vacía al conectar. La credencial solo se conserva en memoria durante la conexión. Desconectar retira las referencias a la credencial y a los documentos cargados, y limpia el contenido mostrado. Cerrar o recargar termina la conexión. La aplicación no registra tokens ni documentos en consola, `localStorage` o `sessionStorage`.

La interfaz pública no constituye una protección de datos: el control de acceso lo aplica GitHub al repositorio privado. No incluir datos privados ni credenciales en el despliegue o en la configuración pública. No hay integración con Excel ni Calendar.

## Edición y guardado

El selector compacto superior permite elegir módulo y unidad y pulsar **Abrir unidad**. La etiqueta **Abierta** identifica siempre el documento que se está viendo y que recibiría un guardado; cambiar una selección no cambia por sí solo el documento. Un módulo sin unidades se muestra como pendiente, sin generar archivos vacíos ni planificación ficticia. **Actualizar lista** relee el catálogo privado sin recargar ni sustituir la unidad abierta.

Los selectores muestran solo el código del módulo y número más título breve de la unidad: `02 HTML`, por ejemplo. El título breve usa `shortTitle` si existe; en su ausencia, toma hasta tres palabras del primer segmento del título. El código completo y el título original no se modifican y siguen disponibles en la ayuda de la opción y en la cabecera.

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

**La UT de un vistazo** muestra un cuadrado por sesión, ordenado por fecha, con el día del mes. Un cuadro de mes de dos letras aparece al inicio y en cada cambio de mes o año. La línea inferior oscura representa fechas pasadas y el contorno identifica hoy, según `Europe/Madrid`; ninguno expresa impartición. Al pulsar un día se salta a su sesión. En móvil la banda se desplaza horizontalmente sin ensanchar la página. Cambiar de las tres vistas mantiene la misma banda.

Las porciones admiten `eventType: "task"` o `"exam"`; su ausencia significa sin marca. Se configura en **Marca en la banda de la UT** del editor existente y se conserva mediante **Aplicar al borrador → Guardar cambios**. Una sesión con una tarea se muestra azul; con examen, naranja; si reúne ambos, combina los colores. La ayuda y el nombre accesible explican las marcas. No se infieren tipos de títulos o colores, no se cambia el estado académico ni se añaden confirmaciones de presentación o avisos de examen. Los documentos ya guardados siguen siendo válidos sin este campo y no se migran automáticamente.

### Mejoras generales del módulo y de la unidad

El botón **Mejoras** junto al selector se refiere al módulo seleccionado; el botón junto al título de la unidad se refiere a la unidad abierta. El diálogo muestra siempre ese destino antes de escribir. **Guardar mejoras** realiza un guardado independiente, confirmado mediante una nueva lectura de GitHub. Cerrar conserva el borrador en memoria. Mientras haya un borrador de mejoras o el diálogo esté abierto se bloquea el cambio de unidad; guardar, revisar o descartar permite continuar. Las notas de las sesiones y las sugerencias de la app mantienen sus propios guardados.

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
- **Tareas:** destacar en azul más intenso la porción correspondiente y añadir un botón pequeño de confirmación de que la tarea se ha presentado y abierto para que el alumnado la trabaje. No confundir esta confirmación docente con tarea entregada, completada o calificada. Tampoco debe publicar automáticamente en Aula Virtual.
- **Exámenes:** destacar en naranja la porción correspondiente. Tres sesiones antes del examen, mostrar un recordatorio para avisar al alumnado y un botón para marcar que el aviso ya se ha dado. Contar sesiones del módulo, no tres días ni tres porciones. El alcance debe poder cruzar el límite entre UT. Antes de implementarlo, concretar el tratamiento de sesiones canceladas, reprogramaciones y exámenes con menos de tres sesiones anteriores disponibles.
- **Preparación de sesiones:** mostrar de un vistazo qué sesiones están preparadas. Valorar una pequeña marca en cada cabecera de sesión o una vista anual limpia que reúna las sesiones y su preparación. Queda abierto si se adopta una opción o ambas; si hay dos vistas, consultarán el mismo dato, sin registros paralelos. La preparación es distinta de la impartición, del progreso de las actividades y de la confirmación de apertura de una tarea. El control se refiere a la sesión completa, no a una marca repetida en cada porción. Antes de implementarlo, acordar cómo se marca una sesión preparada y qué implica cambiar su planificación después; no deducir preparación automáticamente de la existencia de recursos ni del estado Impartida.
- **Confirmaciones explícitas:** `eventType` ya identifica tareas y exámenes en la banda. Las futuras confirmaciones de presentación y aviso serán datos propios, distintos de ese tipo y del estado de impartición; sus detalles quedan pendientes de aprobación.

## Formato del JSON

El catálogo usa `schemaVersion: 1` y una lista `modules`. Cada módulo contiene `code`, `name` y `units`; cada unidad contiene `code`, `id`, `title` y `path`. Los módulos sin unidades usan `units: []`. Solo se admiten rutas relativas coherentes con la identidad del documento dentro del repositorio privado, nunca URLs ni otros repositorios. La app lee el catálogo pero no lo modifica. Los cambios del catálogo tampoco escriben en los documentos de las unidades.

La interfaz admite `schemaVersion` 1 y 2. El formato 2 mantiene módulo, unidad, sesiones y porciones con campos semánticos e identificadores estables. La primera porción sigue siendo `Cabecera`: tiene duración y seguimiento propios, y no es una fila meramente decorativa.

La instantánea original del Excel, sus fórmulas y coordenadas, las referencias de filas y los metadatos de importación redundantes se conservan en un histórico del repositorio privado. El documento operativo contiene únicamente su referencia `provenance.archivePath` y la huella SHA-256 de sus bytes. La interfaz no descarga ni interpreta ese histórico. Los identificadores de Calendar se conservan en `calendar.uid`; esto no activa ninguna sincronización con Calendar.

La conversión parte de la última versión confirmada de GitHub y verifica que puede reconstruirse exactamente el documento anterior, incluidos textos, estados, horarios, identificadores, campos desconocidos y progreso con valor cero. No reimporta Excel ni reinterpreta las notas. El histórico se publica y comprueba antes de actualizar el documento mediante su SHA, sin forzar cambios concurrentes.

Para futuros cambios, conservar la estructura semántica y los campos desconocidos; separar explícitamente nuevos conceptos sin redistribuir notas automáticamente. Los recordatorios calculables no deben duplicarse como fechas fijas. Los nuevos tipos y confirmaciones se incorporarán después de aprobar su significado. No existe sincronización con Excel; la autoridad de cada documento se rige por las instrucciones privadas acordadas con el docente, no por la mera presencia del módulo en el selector.

## Comprobaciones de navegación

Las pruebas automatizadas comprueban catálogo, rutas, identidad, aislamiento de versiones y destinos, fallos de acceso y guardados inciertos. En el entorno sintético se comprueban también: bloqueo del selector con un borrador pendiente; guardar en una unidad, abrir otra y volver sin mezclar notas; cambio entre dos UT del mismo módulo; módulo sin unidades; fallo de carga conservando la unidad anterior; y limpieza de la conexión. No introducir unidades ni anotaciones ficticias en el repositorio privado real para estas pruebas.

## Seguridad y ejecución

La política CSP permite código y estilos únicamente del mismo origen y conexiones únicamente a `https://api.github.com`. No se utilizan CDN ni scripts externos. El contenido del documento se representa con `textContent` y nodos de texto, sin interpretar HTML. Los únicos enlaces de descarga creados por la interfaz son archivos JSON del borrador, iniciados por el usuario.

Para una comprobación local se necesita servir este directorio por HTTP; abrir el HTML como `file:` puede impedir los módulos ES. No hace falta instalar paquetes ni ejecutar un proceso de compilación. El archivo `.nojekyll` evita el procesamiento de Jekyll. Los cambios del documento privado no requieren volver a publicar esta interfaz.

Las comprobaciones automatizadas de esquema y persistencia corresponden a los tests de `core.mjs`. Las pruebas de interfaz deben usar datos sintéticos fuera del directorio publicable y no deben grabar credenciales reales en capturas, trazas o fixtures.
