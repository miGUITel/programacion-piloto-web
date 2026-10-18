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

La planificación es de solo lectura. El estado se edita en la sesión; observaciones, mejoras y los campos secundarios de seguimiento se editan en un panel lateral. Aplicar en el panel modifica el borrador en memoria y Guardar cambios guarda ese borrador. Desde Tareas, Guardar tarea conserva únicamente el seguimiento editado, con versión propia y sin guardar las notas pendientes de Unidad. Las sugerencias y mejoras generales tienen también su propio guardado explícito.

Se conserva el documento leído y su SHA. Un guardado utiliza esa versión; no se reemplaza automáticamente por una versión más reciente. Si existe conflicto, el borrador permanece disponible, se bloquea el guardado y se ofrece su descarga como JSON. También se bloquea el reenvío cuando no puede confirmarse el resultado de una escritura. Actualizar exige confirmación si descartaría un borrador y solo lo reemplaza después de una lectura válida. No hay reintentos automáticos.

Las entradas y acciones quedan bloqueadas durante la carga o el guardado. El navegador recibe una advertencia de salida cuando hay cambios pendientes. Los borradores no se guardan sin conexión y se perderán si se cierra la página después de aceptar esa advertencia.

### Plan de comprobación del guardado

Una prueba simulada de la interfaz no acredita que el token personal tenga permiso para escribir. La validación de extremo a extremo requiere guardar y volver a leer desde GitHub con el acceso que utiliza el docente.

1. **Proteger el trabajo pendiente.** Si ya hay un error, descargar el borrador antes de recargar, desconectar o actualizar. Conservar también el texto que aún esté abierto en el editor y sin aplicar. No compartir el token en capturas ni mensajes.
2. **Una observación.** En una porción elegida, añadir al final de las observaciones existentes una marca inequívoca como `PRUEBA GUARDADO A`, sin sustituir el contenido anterior. Pulsar Aplicar al borrador. Debe aparecer Cambios sin guardar.
3. **Guardar realmente.** Pulsar Guardar cambios. Solo se considera correcto si aparece la confirmación de GitHub con una revisión. Ante un error, conservar el borrador y recoger el mensaje y código; no insistir a ciegas ni descartar cambios.
4. **Volver a leer.** Tras la confirmación, pulsar Actualizar, abrir la misma porción y comprobar la marca. Después desconectar, volver a conectar y comprobarla de nuevo. Esto separa la persistencia real de un cambio visible solo en memoria.
5. **Mejoras e independencia.** Añadir una marca distinta en Mejoras de otra porción. Aplicar, guardar y actualizar. Comprobar que permanece en esa porción y que no se ha sustituido la observación anterior. Alternar Unidad, Módulo y Tareas: el borrador y sus anotaciones deben conservarse.
6. **Limpieza.** Eliminar únicamente las marcas de prueba, guardar y volver a leer. Comprobar que se conservan las anotaciones originales.

En el entorno sintético se comprobarán también la lectura válida seguida de escritura denegada, el rechazo de datos, los límites de peticiones, el conflicto con otra versión, la respuesta de escritura incierta y las tildes y saltos de línea. No provocar estos escenarios contra el trabajo real ni introducir pruebas de estados académicos ficticios.

**Criterio de cierre:** pruebas automatizadas y de interfaz satisfactorias, más confirmación del guardado real y su recuperación tras reconectar. Un mensaje más claro no equivale por sí solo a resolver la causa del error.

**Resultado de la prueba del 15/10/2026:** el docente confirma que el rechazo HTTP 403 se debía a los permisos del token y que, tras corregirlos, GitHub confirmó el guardado con una revisión. La existencia de esa revisión también se ha comprobado mediante lectura del repositorio. El docente ha confirmado asimismo que la anotación permanece tras desconectar y volver a conectar. La escritura y la recuperación reales quedan confirmadas.

## Presentación

La vista de UT utiliza una única presentación compacta: la densidad de la antigua Agenda, con hasta dos líneas de descripción como en Bandas. El comparador provisional de tres diseños se ha retirado para liberar su fila. El contexto de módulo y unidad sigue arriba, sin barra lateral; se aprovecha el ancho para el título y lo previsto, dejando las notas detrás de sus dos accesos directos. En ventanas estrechas la distribución se adapta; el contenido completo sigue disponible en el editor.

Unidad y Módulo muestran el borrador de la unidad abierta. Tareas lo consulta, pero utiliza un editor y guardado independientes. Cambiar de vista no guarda ni descarta cambios ni altera el despliegue de sesiones. Abrir una unidad distinta sí requiere leer su versión actual y resolver antes cualquier borrador pendiente.

Hay exactamente dos niveles: las cabeceras de sesión y las filas compactas de sus actividades. Solo las sesiones se despliegan. Las actividades no tienen otro nivel desplegable. Cada cabecera y actividad tiene iconos distintos para **Observaciones** (bocadillo) y **Mejoras** (bombilla): abren el mismo panel con el texto completo, enfocando el campo elegido. Tienen nombres accesibles y ayuda contextual; el punto indica texto en ese campo. En móvil mantienen 44 × 44 píxeles de zona pulsable. Se conservan Realizado y Pendiente como campos secundarios. La primera porción se representa en la cabecera y conserva su propio horario y notas; no se duplica como otra fila. Al desplegar, una línea breve muestra el horario completo, la cantidad de porciones y el horario de la primera. El cálculo del tiempo incluye todas las porciones mediante `summarize`.

El bloque izquierdo tiene dos líneas: número de sesión dentro de la UT y periodos lectivos (`S1 · 2–3`), y día de la semana más día del mes (`J 24 SEP`). El mes aparece en la primera sesión visible y al cambiar de mes o año; al cambiar de año se añade su abreviatura. La zona del título no repite número, horario ni cantidad de porciones. La fecha completa está en la ayuda contextual y en la descripción accesible. La comparación de fecha pasada utiliza `Europe/Madrid`; no expresa impartición.

Los periodos se toman de `catalog.presentation.periods`, referencia de visualización derivada de `/timetable/periods` del JSON común privado enlazado por `catalog.common.path`. Su procedencia conserva ruta, puntero y huella SHA-256 del documento en `catalog.presentation.source`. Ese JSON es la fuente de horario, calendario escolar y límites de evaluación; `26 COMÚN.xlsx` queda como respaldo, sin mantenimiento en paralelo. Al cambiar el documento común, mantener actualizada su huella; si cambian los periodos, revisar y validar también esta referencia derivada en el mismo commit. La app conserva los intervalos reales y respeta recreos y periodos no consecutivos. Si una porción no encaja, muestra únicamente `S1`, sin inventar periodos ni modificar sesiones. La incorporación del JSON común no añade una pantalla para editarlo ni sincronización automática con Excel o Calendar.

Junto a Unidad · Módulo · Tareas hay un único control global `+` / `−`: si alguna sesión está plegada, `+` despliega todas; cuando todas están abiertas, `−` las pliega. El despliegue parcial también ofrece `+`. Se conserva el control individual, cuyo uso actualiza el botón global. Este no aparece en Módulo o Tareas y queda desactivado sin sesiones o durante una operación. No modifica datos ni genera un borrador pendiente.

### Banda de la unidad

La banda no tiene título visible y muestra una casilla compacta por sesión, ordenada por fecha, con el día del mes. Sus casillas tienen 22 píxeles de alto en escritorio y 32 en móvil. Un cuadro de mes de dos letras aparece al inicio y en cada cambio de mes o año. La línea inferior oscura representa fechas pasadas y el contorno identifica hoy, según `Europe/Madrid`; ninguno expresa impartición. Al pulsar un día se salta a su sesión. En móvil la banda se desplaza horizontalmente sin ensanchar la página.

Las porciones admiten `eventType: "task"` o `"exam"`; su ausencia significa sin marca. Al diseñar una UT se indicará este tipo explícito en cada porción correspondiente. La app genera automáticamente sus colores: azul para tareas, naranja para exámenes, tanto en la porción como en la sesión y la banda. Si una sesión reúne ambos, la banda combina los colores. El editor permite ajustar el tipo previsto mediante **Marca en la banda de la UT → Aplicar al borrador → Guardar cambios**. No se deduce el tipo del título. Los documentos anteriores siguen siendo válidos sin estos campos y no se migran ni reclasifican automáticamente.

Cada sesión tiene casillas **Tarea** y **Examen** para ajustar las marcas directamente. La selección manual se conserva en `session.eventTypes`; una lista vacía suprime las dos marcas y su ausencia usa los tipos previstos de las porciones. Si las casillas vuelven a coincidir con lo previsto, se retira automáticamente la selección manual. **↶** vuelve explícitamente a lo previsto. Cambiar una marca no modifica títulos, textos, horarios, estado de impartición ni progreso. Una selección manual que desactive un tipo también suprime su color de las porciones, sin borrar sus tipos previstos.

### Presentación de tareas y avisos de examen

**Presentada** confirma que el docente ha presentado y abierto la tarea para trabajarla en clase. Las porciones de tarea tienen su propia casilla (`activity.taskPresented`). En la cabecera, la confirmación afecta a todas las tareas previstas de esa sesión y muestra un contador cuando hay más de una; puede estar parcialmente marcada. Si la tarea solo está marcada a nivel de sesión, se conserva en `session.taskPresented`. No expresa entrega, realización, calificación ni publicación automática en Aula Virtual. Desmarcar permite corregir una confirmación. Todo queda en el borrador hasta pulsar **Guardar cambios**.

**Avisado** confirma que se ha informado al alumnado de un examen. Se conserva `session.examAnnouncedFor` con la fecha concreta del examen. Si cambia esa fecha, la confirmación anterior deja de ser válida para la nueva y el aviso reaparece; no se borra la referencia anterior silenciosamente. No se deduce la confirmación del estado Impartida ni se marca automáticamente.

Los recordatorios aparecen tres sesiones del módulo antes del examen. Se consultan las otras UT del mismo módulo del catálogo, con lecturas independientes y sin sobrescribir el borrador abierto. Se ordenan por fecha y hora, se cuentan identificadores de sesión únicos y se excluyen Cancelada y la fecha original de Reprogramada; una nueva sesión reprogramada cuenta en su nueva posición. Una sesión límite compartida por dos UT cuenta una sola vez. Fechas o estados incompatibles para un mismo identificador detienen el cálculo con un aviso. Un examen cancelado o reprogramado no genera un recordatorio para su fecha original.

El recordatorio se muestra en la sesión umbral; cuando el umbral pertenece a otra UT anterior, aparece arriba de la unidad del examen o de las sesiones intermedias. Cada examen aparece una sola vez por vista. Con menos de tres sesiones anteriores disponibles, se ofrece desde la primera y se explica la limitación. El alcance es el de las UT disponibles en la app; no se inventan sesiones no importadas. Si falla la lectura de una UT, se indica que los avisos están incompletos y se ofrece **Revisar avisos**; no se usa un cálculo parcial como si fuera completo.

**Marcar avisado** marca el borrador de la unidad del examen. Si pertenece a otra UT, el botón lo indica y abre esa unidad leyendo su versión actual; exige guardar o revisar cualquier borrador previo. Solo se marca si sigue siendo el mismo examen, con la misma fecha. Después requiere **Guardar cambios**, con la protección habitual de SHA y guardados inciertos. En una sesión de examen compartida por dos UT, la confirmación tiene un único destino determinista: la primera unidad por ruta que contenga una porción de ese examen. Las otras vistas consultan ese mismo dato.

### Vista del módulo y gestor de tareas

Los botones **Unidad**, **Módulo** y **Tareas** cambian la presentación sin guardar o descartar el borrador. Unidad y Módulo se refieren a la unidad abierta y su módulo, no a una selección pendiente. Tareas reúne todos los módulos del catálogo, independientemente de la unidad abierta. Al abrir o actualizar una UT se leen las demás UT incorporadas, sin reemplazar el borrador activo; el alcance y los fallos de lectura quedan visibles. El resumen superior usa ese mismo ámbito.

**Módulo** conserva una fila por UT y alinea sus sesiones por los días lectivos del módulo. Las columnas representan días de la semana, no fechas compartidas entre UT; las fechas aparecen en cada sesión. Las filas se compactan, con los huecos mínimos de alineación, y continúan debajo por ciclos completos de días sin desplazamiento horizontal. Las sesiones en otros días registrados permanecen identificadas aparte. Se conservan azul/naranja, hoy, fecha pasada, cancelación/reprogramación, preparación, filtro mensual y accesos a UT y sesiones. Las lecturas incompletas no se presentan como completas.

**Tareas** reúne las porciones con tipo explícito task y las tareas marcadas solo a nivel de sesión de todos los módulos incorporados, respetando las selecciones manuales. No interpreta títulos ni duplica tareas explícitas como registros de sesión. Filtros independientes: módulo, UT y Planificada (por presentar), Presentada, Por corregir o Corregida. Por corregir se ordena por aviso; Planificada, por sesión; los demás, por entrega o sesión. Las tareas canceladas/reprogramadas siguen accesibles sin borrar su seguimiento. La lista advierte si faltan lecturas y no incluye UT todavía no incorporadas. **Actualizar tareas** vuelve a leer las otras UT, sin descartar el borrador activo.

La fila de escritorio es compacta: módulo/UT, título conservado, **P** con fecha de presentación, **C** con fecha prevista de aviso/corrección y lápiz para editar. Verde: corregida; rojo: Por corregir; amarillo: presentada antes de la fecha Corregir. El día de Corregir ya corresponde a Por corregir y su banda se muestra roja. El borde permanece azul en tareas y naranja en exámenes, independiente del estado. En móvil son dos líneas compactas con controles de 44 píxeles. El estado también está disponible mediante texto accesible, filtros y ayuda, no solo mediante el color. Presentada, Entrega y Corregir aparecen en el editor; Entrega también figura en la ayuda de la fila. Publicación se conserva solo como metadato histórico. Fechas ausentes: —, nunca estimaciones.

**P, C y Editar tarea** abren el mismo diálogo independiente, tanto para tareas de UT como históricas. Lee su documento y SHA actuales y localiza la tarea por identificadores, nunca por posición ni título. **Guardar tarea** modifica solo los campos de seguimiento editados y confirma mediante relectura. No cambia la UT abierta, sus selectores, filtros ni sesiones desplegadas. Si comparte archivo con Unidad, actualiza la base confirmada y conserva los cambios locales pendientes sin enviarlos. Dos valores distintos para el mismo campo provocan un conflicto explícito; una versión remota distinta bloquea el guardado del archivo afectado hasta revisarlo. No hay reintentos ni guardados automáticos.

Metadatos opcionales: `activity.task: { publishedOn?, presentedOn?, dueOn?, correctBy?, corrected? }`. Fechas ISO `YYYY-MM-DD` válidas; `corrected` booleano. `presentedOn` es la fecha real de la confirmación en Madrid, distinta de publicación; se registra al presentar y puede corregirse desde el editor. Para marcas solo de sesión se usa `session.task`. La presentación sigue usando `taskPresented`, no una segunda copia. Se conservan extensiones, notas, IDs y progreso; no se inventa fecha de presentación para confirmaciones antiguas. No hay migración automática ni cambios de datos al cargar.

Presentar desde la UT o mediante **P** exige confirmar entrega y aviso de corrección. Se proponen las fechas existentes; cancelar o dejar una fecha sin completar no presenta ninguna tarea. La cabecera pide una pareja independiente por cada tarea aún no presentada. El editor también exige ambas fechas en una nueva presentación; permite conservar confirmaciones antiguas incompletas, señaladas con `!`. **C** abre el diálogo independiente y confirma o revoca la corrección al pulsar Guardar tarea. Los cuatro estados se derivan de las confirmaciones y la fecha de Madrid, sin guardar un estado duplicado. El botón Tareas muestra cuántas están Por corregir; no hay notificaciones externas ni publicación en Aula Virtual. La fecha de entrega no activa el aviso ni acredita entregas del alumnado. No se infiere presentación o corrección de Impartida, preparación o progreso.

#### Prueba de usuario del bloque 2

1. Guarda borradores pendientes, recarga y conecta. En **Módulo**, comprueba las UT disponibles, sus fechas alineadas y sus marcas; filtra un mes y pulsa una sesión para abrirla. Solo aparecen las UT ya incorporadas al piloto.
2. En **Tareas**, prueba Todos los módulos, un módulo, una UT y los cuatro estados. Solo se muestran tareas explícitas del piloto; no se extraen de sus títulos ni se importan UT adicionales.
3. Edita una tarea real: introduce únicamente fechas que conozcas y ajusta Presentada y Corregida a su estado real. Aplica y comprueba que la fila refleja los datos y avisa de cambios sin guardar. Cambia entre las tres vistas: no debe perderse nada. Si intentas abrir otra UT con cambios pendientes, debe pedir guardarlos.
4. Pulsa **Guardar cambios**, espera la confirmación y **Actualizar**. Desconecta y vuelve a conectar: fechas, confirmaciones, observaciones y mejoras deben seguir presentes, sin mezclarse con otras UT o módulos. Restaura y guarda cualquier marca usada solo como prueba.
5. En el teléfono, comprueba que la cuadrícula se desliza dentro de su zona sin ensanchar la página y que puedes leer una tarea, editar sus fechas y guardarla cómodamente.

Las pruebas sintéticas cubren varias UT, varios años/meses, fechas compartidas, múltiples sesiones en un día, módulos ajenos, tareas múltiples, marcas manuales, fechas inválidas, notas Unicode/HTML literal, conservación de extensiones y guardado contra SHA. No se crean tareas ficticias en los datos reales.

#### Prueba de usuario: interfaz compacta 1–4

1. Guarda cualquier borrador pendiente, recarga con Ctrl+F5 y conecta. Comprueba que ya no aparece el comparador provisional y que las descripciones admiten dos líneas sin ensanchar la página.
2. En Unidad, revisa el bloque izquierdo: sesión dentro de la UT y periodos, con la fecha debajo. El mes debe aparecer al comienzo y al cambiar de mes; los horarios completos deben seguir al desplegar, incluido el de la primera porción.
3. Pulsa el `+` junto a Unidad · Módulo · Tareas: deben abrirse todas las sesiones y aparecer `−`. Pliega una individualmente: debe volver `+`; púlsalo para abrir todas y luego `−` para plegarlas. Estas acciones no deben activar Guardar cambios.
4. Prueba el bocadillo de Observaciones y la bombilla de Mejoras en una cabecera y una actividad. Cada uno debe enfocar su campo, mostrar su texto completo y conservar las anotaciones anteriores. Si haces una anotación real, aplica, guarda y Actualiza para comprobar persistencia. Restaura cualquier texto usado solo como prueba.
5. Cambia a Módulo y Tareas: el control global no debe aparecer allí; al volver a Unidad, debe conservarse el despliegue y el borrador. Comprueba que las funciones de esas vistas siguen presentes.
6. Repite el despliegue y la apertura de notas desde el teléfono: los botones deben ser fáciles de pulsar, las descripciones legibles y la página no debe desplazarse horizontalmente; la banda de sesiones sí puede deslizarse dentro de su zona.

Verificación técnica: 105 pruebas automatizadas satisfactorias, comprobación visual en escritorio y a 390/320 píxeles, prueba sintética de guardado/relectura, controles globales en estado parcial y accesos directos a ambos campos. No se han introducido anotaciones ficticias en GitHub ni modificado Excel o los documentos de UT reales.

### Mejoras generales: almacenamiento

#### Prueba de usuario: ciclo global de tareas

1. Guarda lo pendiente antes de recargar y conecta. Abre **Tareas**: comprueba Todos los módulos y los filtros por módulo, UT y los cuatro estados. El ámbito solo incluye UT del piloto y debe advertir cualquier lectura fallida.
2. En una tarea aún no presentada, pulsa **P** (o Presentada en la UT). Verifica las dos fechas propuestas y cancela: no debe marcarse ni activarse Guardar por esa acción. Repite, confirma entrega y aviso futuros: debe quedar amarilla, con P y fecha de hoy, como Presentada.
3. Guarda, espera la confirmación y Actualiza: las fechas, P y las notas anteriores deben persistir. Una tarea solo planificada con fecha pasada no debe aparecer Por corregir.
4. Para comprobar el aviso con una prueba que después restaurarás, usa el lápiz y fija el aviso en hoy: debe salir Por corregir y aumentar el contador. Con aviso de ayer debe verse roja. La entrega no determina ese aviso.
5. Marca **C**: debe quedar verde, salir de Por corregir y aparecer en Corregidas. Guarda y comprueba al actualizar o reconectar. Desmarcar C recupera el estado correspondiente a su aviso. Restaura y guarda las marcas/fechas que solo fueran de prueba.
6. Prueba una tarea de otro módulo: la acción debe abrir su UT real. Con un borrador pendiente en otra UT no debe permitir cambiarla ni marcar la casilla. Al guardar, solo cambia la UT abierta. En el móvil verifica P, C, lápiz y el diálogo sin desbordamiento horizontal.

Una sesión con varias tareas pide fechas independientes para las todavía no presentadas; cancelar no aplica parcialmente. Las confirmaciones antiguas sin fechas se conservan, con `!` para completar sus datos y `—` para fechas desconocidas. Ante un error de guardado debe permanecer el borrador, sin anuncio de éxito ni reintento automático.

Verificación técnica del ciclo: 111 pruebas automatizadas satisfactorias. Pruebas de navegador con transporte ficticio: cancelar, fecha obligatoria, dos tareas con fechas independientes, P/C, cuatro estados y colores, filtros globales, cambio entre módulos con y sin borrador, guardado/relectura, lectura parcial y rechazo HTTP 403. Escritorio: filas de 46 píxeles en el entorno probado; móvil a 390/320 píxeles sin desbordamiento y controles de 44 píxeles. No se escribieron tareas, fechas ni notas de prueba en GitHub ni se modificaron Excel.

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

## Requisitos y estado de implantación

Lista consolidada y ordenada el 17/10/2026, contrastada con la conversación y las sugerencias guardadas en GitHub. Primero se sitúan el aspecto de la interfaz y el aprovechamiento del espacio vertical; después, el seguimiento de tareas y los conceptos todavía por definir. Las propuestas relacionadas se agrupan sin borrar los registros originales. Este orden no autoriza su implementación ni convierte en resueltas las decisiones pendientes. La escritura en GitHub y su recuperación tras reconectar ya están confirmadas.

### Interfaz compacta: requisitos 1–4 implantados el 17/10/2026

Los cuatro requisitos prioritarios ya tienen implementación y pruebas técnicas; queda la revisión visual del docente. El detalle vigente está en «Presentación»: vista Agenda con descripciones de dos líneas, cabecera de dos líneas sin metadatos repetidos, control global único y accesos por iconos. No se han modificado los documentos académicos de las UT ni los Excel. Las propuestas «elegir vista» y «Mejor aprovechamiento del espacio» quedan atendidas en este alcance, sin borrar sus registros originales ni dar por resueltos futuros retoques.

### Prioridad pendiente de interfaz: vista ampliada de sesión

Abrir una vista dedicada de la sesión al hacer clic o tocar cualquier zona de su representación que no tenga otra funcionalidad. Los botones, desplegables, enlaces y demás controles conservarán su acción propia sin abrir además esta vista. Quedan pendientes de definir su contenido, distribución, edición y navegación, así como su relación con el despliegue actual de actividades; no implementar todavía. No obliga a desplegar más información en la lista principal.

### Selectores superiores — implantado

Petición del 17/10/2026: retirar las etiquetas visibles «Módulo» y «Unidad» de los dos selectores superiores y sustituir sus dos botones «Mejoras» por el icono de bombilla. Conservar etiquetas accesibles, ayudas y destinos diferenciados (módulo seleccionado y UT abierta). Implantado: se conservan los nombres accesibles y el indicador de borrador junto al icono.

### Tareas oficiales, fechas al presentar y ciclo de corrección

#### Independencia entre Tareas y Unidad — implantado, pendiente de validación de uso

Implantado como paso 2 el 17/10/2026: editar, presentar o corregir una tarea de cualquier módulo o UT sin cambiar la unidad abierta ni perder sus borradores, filtros o posición. Un único diálogo y Guardar tarea para tareas oficiales, antiguas por sesión/porción e históricas. Cada operación conserva su documento de origen y SHA. Solo se envían los campos de seguimiento cambiados; las notas locales de Unidad permanecen pendientes. Se mantienen títulos, identificadores, planificación y campos adicionales. Los conflictos entre dos cambios locales del mismo campo, cambios remotos y resultados inciertos se muestran sin sobrescribir ni descartar borradores. Cerrar permite cancelar; Revisar GitHub requiere confirmar el descarte y una lectura fallida conserva el formulario anterior.

Verificación del paso 2: 137 pruebas automatizadas satisfactorias, incluidos formularios, cancelación, escrituras con SHA, relectura, respuestas perdidas y conservación exacta de campos ajenos. Comprobaciones de navegador con datos ficticios: P de otra UT manteniendo LM abierta y su filtro, P de la misma UT con notas pendientes, C de un examen histórico con notas pendientes, guardado posterior de las notas y relectura. La confirmación nativa del navegador de pruebas bloqueó la automatización posterior de errores; esos casos se verificaron con los manejadores reales del formulario en pruebas aisladas. No se modificaron Excel ni JSON académicos reales.

Prueba del docente: guardar borradores antes de recargar; abrir LM; editar una tarea de SR y comprobar que LM sigue abierta; repetir dejando una nota aplicada pero sin guardar en LM; guardar una tarea de esa misma LM y comprobar que la nota continúa pendiente; guardar después la nota y actualizar; revisar P, C, lápiz, filtros y una cancelación. Usar cambios reales o revertir los de prueba. Comprobar persistencia después de desconectar y conectar solo cuando no queden borradores pendientes. La prueba docente de fechas por defecto con una tarea real sin fechas sigue pendiente.

#### Barra de filtros de Tareas — implantado

Petición del docente del 17/10/2026, implantada: retirar las etiquetas visibles «Módulo», «Unidad» y «Mostrar» de los tres selectores de la vista Tareas, igual que se ha solicitado para los selectores superiores de Unidad. Mantener nombres accesibles diferenciados para módulo, UT y estado. Las opciones generales predeterminadas serán, respectivamente, **Todos**, **Todas** y **Todos**. Quitar el título visible «Todas las tareas» situado antes de los filtros y abreviar el contador como **visibles/total**, por ejemplo `6/6`, sin «de» ni «tareas»; conservar su significado mediante texto accesible. El objetivo es compactar la barra y aprovechar mejor el espacio sin cambiar el filtrado, su ámbito global o el botón Actualizar tareas. El ajuste no cambia por sí mismo los datos académicos.

**Modelo oficial, ciclo y fechas implantados el 17/10/2026; pendiente de revisión del docente.** Cada tarea oficial tiene una identidad única y una presentación prevista. Los datos nuevos se cierran en el proyecto del módulo, sin deducir códigos de las porciones. Los documentos antiguos siguen siendo compatibles.

- **Títulos oficiales:** el gestor debe identificar cada tarea por el título cerrado con el docente al diseñar la UT, no por el título genérico de su sesión o porción. Normalmente tendrá código `UTTT` y unas palabras clave: `0102` corresponde a la tarea 2 de la UT01. La numeración de tareas se reinicia en cada UT. Conservar las excepciones acordadas y los identificadores existentes; no inferir ni renombrar automáticamente tareas anteriores. Una misma tarea puede desarrollarse en varias actividades sin convertirse por ello en varias tareas oficiales. El ajuste del modelo deberá mantener esa identidad y sus referencias sin duplicar los datos de seguimiento.
- **Presentar desde la vista UT:** al marcar la casilla Presentada, solicitar la fecha máxima de entrega y la fecha de aviso de corrección. Si hay fechas ya previstas, mostrarlas para confirmar o ajustar; no sustituirlas silenciosamente. Confirmar la presentación junto con las fechas; cancelar el diálogo debe conservar la situación anterior. Si una acción afecta a varias tareas, permitir confirmar las fechas de cada una, sin aplicar una pareja de fechas a todas de forma implícita. Mantener el guardado explícito del borrador y las protecciones de versión.
- **Planificada:** incluida en el diseño aprobado de la UT, todavía no presentada. La existencia de materiales, una fecha de publicación o el estado Impartida no confirma presentación.
- **Presentada:** el docente ha marcado su presentación y apertura para trabajarla; todavía no ha llegado la fecha de aviso/corrección y no está corregida.
- **Por corregir:** tarea presentada y no corregida cuya fecha de aviso/corrección ha llegado, incluido ese mismo día, según `Europe/Madrid`. Mostrar el aviso en la app. La fecha máxima de entrega y la fecha de aviso/corrección son distintas; una no sustituye a la otra. No generar avisos de corrección para tareas que solo están planificadas.
- **Corregida:** confirmada expresamente por el docente mediante una casilla Corregida en la vista Tareas. Tiene prioridad sobre el aviso: la llegada de una fecha nunca la marca automáticamente como corregida. No confundir esta confirmación con progreso importado, entrega del alumnado o calificaciones individuales.
- **Compatibilidad:** conservar las fechas y confirmaciones ya registradas; si una tarea anterior está presentada pero le faltan fechas, señalar el dato pendiente y permitir completarlo, sin inventarlas ni retirar su presentación. Derivar los estados a partir de la planificación, las confirmaciones y la fecha, sin introducir un segundo registro de estados que pueda contradecirlos. No activar notificaciones externas ni publicar en Aula Virtual por este requisito.

El acuerdo docente exige revisar y cerrar la lista de tareas y sus nombres como paso del diseño de cada UT. Los procedimientos generales detallan esa aprobación; la lista concreta y sus fechas permanecen únicamente en su fuente académica vigente. Este registro de requisitos no autoriza por sí mismo a migrar otras UT, reimportar Excel ni reescribir los títulos o estados actuales.

### Inicio de fila de tarea — implantado

Petición del docente del 17/10/2026: comenzar cada fila del gestor con **MÓDULO · UUTT · Título oficial**, por ejemplo visual `LM · 0201 · Ficha válida`: `LM` es el módulo, `02` la UT y `01` el número de tarea dentro de esa UT, conservando los ceros iniciales. No repetir `UT02` como etiqueta separada ni utilizar en lugar del título oficial el encabezado de la sesión, su numeración romana o la fase «inicio/cierre/continuación». Conservar los identificadores internos y utilizar los códigos oficiales acordados, sin deducirlos de la posición de una fila o porción. El formato utiliza el título y el código oficiales de la lista de tareas. En documentos antiguos aún no conciliados se muestra «Sin código» sin inventar una equivalencia.

### Simplificación de fechas y aparición de tareas — implantado

Aclaración del docente del 17/10/2026, implantada en la interfaz y en el modelo:

- Las únicas fechas necesarias en el seguimiento de tareas son **Presentada**, **Entrega** y **Corregir**. Retirar «Publicación» de la interfaz; no sustituirla por la fecha de diseño de la UT ni de creación de la tarea. «Presentada» significa presentación real al alumnado; «Entrega», su fecha máxima; «Corregir», la fecha prevista que activa el aviso y el estado Por corregir.
- El diseño de la UT y el cierre de su lista de tareas siguen realizándose con el docente en el proyecto del módulo, no desde la aplicación web. Cuando la UT se dé por preparada, sus tareas deben aparecer en el gestor como Planificadas, sin exigir que hayan sido presentadas al alumnado ni publicadas en Aula Virtual. No inferir preparación de la mera existencia del documento o de sus recursos.
- Preparar una UT no presenta ni corrige automáticamente sus tareas. RF 3 calcula su estado desde materiales y sesiones; la aprobación de la lista oficial se confirma por separado y se conserva al reabrir la UT.

### Fechas iniciales al presentar — implantado

Petición del docente del 17/10/2026: al marcar una tarea como Presentada, si no tiene ninguna fecha de seguimiento previamente configurada, proponer por defecto **Presentada**, **Entrega** y **Corregir** en la fecha de hoy según `Europe/Madrid`. Sirve como base editable y permite reflejar tareas presentadas, realizadas y entregadas durante la misma sesión. Si existen fechas previas, no sobrescribirlas por esta regla; el caso de fechas parcialmente configuradas no queda ampliado por este requisito. Mantener la confirmación del formulario, la cancelación sin cambios y el guardado explícito. Corregir hoy habilita el aviso/estado Por corregir, pero no confirma Corregida automáticamente. Implantado: los valores solo son propuestas hasta confirmar y guardar; no se rellenan fechas históricas al cargar.

**Prueba de usuario pendiente, 17/10/2026:** el docente indica que no dispone de ninguna tarea sin fechas, por lo que aún no ha podido comprobar la propuesta automática de hoy. Mantener pendiente hasta disponer de una tarea real nueva sin fechas o de una prueba aislada. Las pruebas sintéticas existentes no sustituyen esa validación; no borrar fechas reales ni inventar tareas académicas para provocarla.

### Marca de presentación prevista de tareas — implantado

Petición del docente del 17/10/2026: al programar las sesiones durante el diseño de una UT en el proyecto del módulo, identificar explícitamente en qué sesión se presentará cada tarea. La marca azul de esa sesión debe generarse automáticamente a partir de esa presentación prevista, sin exigir marcarla manualmente en la app ni esperar a confirmar Presentada. No deducirla solo del título ni confundir cualquier sesión de trabajo sobre una tarea con su presentación. La marca expresa planificación; no confirma que la tarea ya se haya presentado o abierto al alumnado. Conservar la confirmación real de Presentada y su fecha como datos independientes. Implantado mediante `tasks[].presentation`; se mantiene la selección manual de tipos como excepción reversible.

### RF 3 y preparación individual de tareas — implantado el 18/10/2026

La etiqueta se muestra en **Unidad** y **Módulo**. La vista **Preparación** reúne las UT del catálogo, con filtros por módulo y estado. Pulsar la etiqueta abre el editor; pulsar el código de una UT abre sus sesiones. Si otra unidad tiene notas pendientes, se ofrece guardarlas antes de cambiar o cancelar conservándolas.

| Estado | Regla |
|---|---|
| Preparada | PPT y Web están Listo, todas las tareas y exámenes de sus listas están preparados y todas las sesiones están listas. Requiere listas no vacías y al menos una sesión. |
| En preparación | Hay algún material, tarea, examen o sesión listo, pero falta completar el conjunto. |
| Pendiente | No hay ninguno listo. |

El editor muestra las tareas y exámenes oficiales con código, título y una casilla de preparación individual. Tareas y Examen son resúmenes automáticos —por ejemplo, 3/5 preparadas—: todos listos equivale a Listo; alguno, En proceso; ninguno, Pendiente. Una lista vacía no se completa automáticamente. Las marcas globales anteriores no se distribuyen por inferencia entre tareas. Presentada, Corregida, aprobación y preparación siguen siendo conceptos independientes.

**Añadir tarea** y **Añadir examen** solicitan código oficial, título, tipo y sesión prevista opcional. **Añadir al borrador** todavía no escribe; **Guardar preparación** incorpora el elemento a la lista oficial como Planificado. Empieza con preparación pendiente, sin fechas reales ni confirmaciones, y se puede marcar preparado antes de guardar. Los códigos duplicados y las referencias inválidas se rechazan. Se mantiene el formato de cada UT, admitiendo tareas nuevas sin sesión prevista también en formatos anteriores.

**Eliminar** retira una tarea o examen de la lista al pulsar **Guardar preparación**. La selección se confirma y se puede **Deshacer** antes de guardar; un alta todavía sin guardar se puede retirar sin escribir. Se conserva la lista oficial vacía si se elimina su último elemento, sin reactivar marcas históricas. Se recalculan los contadores y la preparación de la UT, y desaparece su presentación prevista derivada; las sesiones, notas y selecciones manuales se conservan. La eliminación incluye el seguimiento del elemento elegido y queda recuperable en el historial privado. Si ese elemento tiene cambios pendientes en Unidad, referencias de trabajo desde porciones o duplicados sin conciliar, se pide revisarlos antes de eliminar. Los conflictos de versión y resultados inciertos conservan el borrador y bloquean reenvíos.

El guardado independiente utiliza la versión leída y una relectura de confirmación. Guarda marcas, altas y eliminaciones explícitas sin enviar las notas pendientes de Unidad; conserva también el seguimiento y las aprobaciones de los elementos restantes. Un conflicto o resultado incierto conserva ambos borradores y bloquea el reenvío. Las tareas históricas aún sin conciliar no se convierten automáticamente en lista oficial para permitir nuevas altas.

Las ventanas de preparación, seguimiento, tareas, información y mejoras aprovechan casi todo el ancho disponible. En escritorio, tareas y exámenes aparecen en columnas; en móvil se apilan y los controles de cierre y guardado permanecen accesibles.

Pruebas de usuario:

1. Pulsar el código de una UT desde Preparación: debe abrir sus sesiones. Repetir con una nota pendiente en otra UT y cancelar el cambio: la nota debe seguir intacta.
2. Marcar una tarea preparada y un examen preparado. Comprobar sus contadores, el estado automático y que Presentada/Corregida no cambian.
3. Añadir una tarea sin sesión prevista y un examen con sesión elegida. Antes de Guardar preparación son borradores; después deben aparecer una vez en Tareas como Planificados.
4. Intentar repetir un código: debe mostrar el problema sin crear otro elemento. Cancelar una incorporación a medio escribir no cambia la lista.
5. Dejar una observación aplicada al borrador de Unidad sin guardar, guardar preparación o una nueva tarea y comprobar que la observación sigue pendiente e intacta.
6. Retirar una marca de preparado y comprobar que baja el estado correspondiente sin ocultar las tareas aprobadas. Cerrar, volver a abrir y comprobar persistencia.
7. Comprobar anchura de las ventanas en escritorio y su adaptación en móvil. Guardar únicamente marcas y elementos académicos reales; las pruebas técnicas usan datos ficticios fuera del repositorio de datos.

### Preparación de sesiones — ampliaciones pendientes

RF 3 incorpora ya la marca individual de sesión lista y las acciones conjuntas en su editor. RF 4 mantiene pendientes la marca en cada cabecera y/o una vista anual específica de sesiones, y concretar qué cambios de planificación invalidan una revisión. Todas las vistas usarán `session.preparation`; no hay marcas por porción ni inferencias desde Impartida o recursos existentes.

### Requisitos pendientes, parciales o pendientes de validación — 18/10/2026

Los números RF son estables. Se conservan las prioridades acordadas (1 es la máxima); no se renumeran al completar un requisito. «Validación pendiente» significa que la función está implementada y probada técnicamente, pero falta la comprobación de uso del docente. La prueba 6 de conservación de observaciones al guardar preparación está confirmada.

| RF | Prioridad | Requisito | Estado y trabajo restante |
|---:|---:|---|---|
| 3 | 1 | Preparación automática de las UT | Implementado; cierre de validación. Etiquetas, vista global, enlace a sesiones, cálculo automático y guardado independiente disponibles. Comprobar el recálculo tras eliminar tareas o exámenes. |
| 5 | 2 | Preparación de PPT, web, tareas y examen | Implementado; cierre de validación. Edición de PPT/Web, preparación individual, altas y eliminación de tareas/exámenes disponibles. Comprobar Eliminar, Deshacer y persistencia tras guardar. |
| 13 | 3 | Editar información general y configuración del módulo | Pendiente. La información validada se consulta; falta definir e implementar su edición. |
| 1 | 4 | Completar incorporación de UT y bloques | Parcial. El catálogo se ha ampliado; falta cerrar las carencias y conciliaciones de las incorporaciones. Una entrada no acredita migración completa ni preparación. |
| 2 | 5 | Validar edición independiente de tareas | Implementado; validación de uso pendiente del editor Guardar tarea. La prueba de Guardar preparación no sustituye esta comprobación. |
| 4 | 6 | Preparación de sesiones | Parcial. Marcas individuales y acciones conjuntas disponibles en Preparación. Faltan el acceso desde cada cabecera y/o vista anual de sesiones y acordar cuándo revisar su preparación. |
| 6 | 7 | Fecha prevista de exámenes en Tareas | Parcial. Existe en la referencia de sesión y la ayuda; falta mostrarla claramente en la fila, separada de las fechas reales. |
| 7 | 8 | Reprogramar exámenes | Pendiente. Acción que conserve identidad y seguimiento, actualice marcas y requiera aviso para la nueva fecha. |
| 8 | 9 | Totales de duración con reprogramaciones | Decisión pendiente. Distinguir carga inicial, planificación vigente e historial antes de cambiar el cálculo. |
| 9 | 10 | Vista ampliada de sesión | Pendiente de definición e implementación. Las ventanas más anchas no completan esta vista. |
| 10 | 11 | Avance por porción | Definido; pendiente de implementar. Pendiente/Parcial/Completada y nota opcional; marcar Impartida completa por defecto las porciones y permite retocarlas. |
| 11 | 12 | Fechas por defecto al presentar | Implementado; validación pendiente con tarea sin fechas, comprobando propuesta de hoy y cancelación sin cambios. |
| 12 | 13 | Acceso a recursos de cada UT | Pendiente. Definir selección de recursos, enlaces y presentación desde la app. |

RF 3 y RF 5 no tienen funciones pendientes dentro del alcance aprobado después de esta ampliación. Queda la validación de uso del borrado y sus efectos. La vista de sesiones de RF 4, los enlaces a recursos de RF 12 y la reprogramación de RF 7 conservan sus propios alcances y prioridades.

### Fuera de la lista pendiente: funciones ya implantadas

Las sugerencias sobre selectores compactos de módulo y UT, mejoras generales, banda de sesiones, vista del módulo, gestor global de tareas y ciclo de presentación/corrección tienen implementación descrita arriba. Sus ampliaciones concretas siguen en los requisitos pendientes y la implantación no sustituye la revisión del docente. Se conservan las sugerencias originales aunque su estado inicial figure como `pendiente`; esta lista consolidada determina el trabajo restante.

### Transición al uso diario y ampliación — propuesta en análisis

El paso 1 dispone de una [especificación de destino en el repositorio privado de datos](https://github.com/miGUITel/programacion-piloto-datos/blob/main/docs/MODELO_DATOS_UT.md). El paso 2 independiza Tareas y Unidad. El paso 3 añade compatibilidad con unidades v3 y registros de tareas v2, conservando la lectura y guardado de los formatos anteriores. Abrir un documento no cambia su versión. La importación y activación de una primera UT corresponden al paso 4.

El 17/10/2026 el docente propone incorporar las UT preparadas de todos los módulos y utilizar la app para su seguimiento diario. Solicita únicamente análisis y anotación: no se autoriza una importación ni un cambio de fuente de verdad mediante este registro.

Tras validar el paso 2 de independencia de Tareas, preparar la compatibilidad del modelo y ampliar por lotes verificables. En cada incorporación, contrastar el Excel vigente con el JSON actual y conciliar las tareas históricas con la lista oficial, conservando sus identificadores, fechas y seguimiento ya confirmados. No sobrescribir datos recientes de la app con el Excel ni eliminar registros históricos cuya UT no se incorpore. La consolidación de los registros es explícita; el editor unificado no traslada tareas entre archivos automáticamente.

Para cada alcance migrado y validado, acordar una fuente única de trabajo diario y conservar el Excel anterior como referencia; no mantener dos seguimientos editables. La planificación general, metodología, criterios y datos comunes continúan en sus fuentes vigentes hasta una migración expresamente acordada. En la app se consulta y registra el día a día; en los proyectos se diseña y revisa la planificación, se preparan recursos y se cierran las tareas oficiales.

Ampliaciones de visión global propuestas: configuración de módulos, metodología, planificación anual y acceso a recursos por UT. Mantener pendientes las ampliaciones de preparación de sesiones de RF 4 y la vista ampliada de sesión. Calendar y Aula Virtual siguen siendo servicios separados; no hay sincronización o publicación automática. La app requiere conexión y guardado explícito; la recuperación de borradores tras cerrar o recargar no está implementada.

## Formato del JSON

### Compatibilidad preparada para la ampliación

Se admiten unidades 1/2/3 y registros históricos 1/2. En unidad v3, `type` es explícito y el código oficial es texto, conservando excepciones y ceros. `presentation` puede faltar: la tarea aprobada aparece en Tareas con la indicación accesible «Sin sesión de presentación asignada» y puede presentar/corregir su seguimiento sin crear una sesión ficticia. El aviso del examen requiere una sesión prevista conocida.

En v3 la visibilidad depende de `approved: true` o de seguimiento real presentado/corregido. Reabrir `unit.preparation` no oculta la lista ya aprobada y una nueva tarea no se aprueba al leerla. Las versiones anteriores conservan su regla compatible hasta editar preparación; ese guardado fija la aprobación implícita anterior para no ocultar tareas ya incorporadas ni aprobar nuevas. La identidad global de una tarea oficial es módulo e ID, independiente de su archivo para permitir un traslado explícito sin duplicarla. Los duplicados y referencias de trabajo pendientes se señalan; un duplicado no se puede editar desde Tareas hasta conciliarlo.

Se validan y conservan objetivos, contenidos, notas particulares, carga con unidad de medida, referencias curriculares y a recursos, preparación de materiales y sesiones. No se infieren estos datos al leer. RF 3 añade el editor de preparación de materiales y sesiones. Cada examen v3 conserva su aviso en `announcement.examDate`; varios exámenes de una sesión tienen confirmaciones independientes. Al desmarcar se retira solo la fecha de confirmación y se conservan extensiones desconocidas. Los avisos antiguos de sesión permanecen compatibles, sin asignarlos automáticamente a varios exámenes. Las porciones de sesiones compartidas v3 se comprueban también entre UT.

La preparación de importación es una herramienta separada de la app: exige inventario de las celdas y dependencias relevantes, correspondencias explícitas de tareas y evidencia de actualidad para cada lote. Genera una propuesta con versiones esperadas y archivos de procedencia; no publica por sí sola ni reemplaza un JSON operativo por el Excel. El procedimiento técnico y las herramientas se mantienen junto al proyecto local.

Verificación del paso 3: 156 pruebas de JavaScript y cuatro pruebas del lector Excel satisfactorias, incluido un recorrido completo con OOXML ficticio. La lectura de compatibilidad de los seis documentos académicos actuales conserva sus 19 tareas únicas y todos sus objetos sin mutarlos. Prueba de navegador aislada: tarea v3 aprobada sin sesión, propuesta de hoy en las tres fechas, guardado/relectura, y confirmación de uno de dos exámenes de la misma sesión sin confirmar el otro. Esta evidencia acredita preparación técnica; los Excel reales no se han auditado ni migrado en este paso.

### Lista oficial de tareas y preparación

El modelo actual añade una lista opcional `tasks` al JSON de la UT. Cada entrada contiene `id` estable, `code` oficial como texto (conserva ceros), `title`, `type: "task" | "exam"`, `presentation: { sessionId, activityId? }`, `taskPresented?` y `task: { presentedOn?, dueOn?, correctBy?, corrected? }`. Las referencias de presentación deben pertenecer a la UT. Hay una sola entrada por tarea; sus distintas fases o porciones no generan tareas nuevas. El código de tarea utiliza cuatro cifras; el examen también admite el código de unidad de dos cifras, sin inventar un número de tarea.

En el proyecto del módulo se cierra y aprueba la lista. Las tareas aprobadas aparecen como Planificadas y conservan su visibilidad al reabrir el diseño. RF 3 calcula automáticamente la preparación desde sus marcas de materiales y sesiones, sin aprobar nuevas tareas ni cambiar el seguimiento. Los documentos antiguos sin `tasks` mantienen su comportamiento hasta una conciliación explícita. No se migra ni se asignan códigos al abrir un documento.

`presentation` genera las marcas de sesión, porción, banda y vista del módulo, aunque todavía no se haya presentado al alumnado. No colorea otras sesiones solo por trabajar sobre esa tarea. Se conservan las selecciones manuales `eventTypes`; restablecer recupera las previstas. La lista de tareas no desaparece por ocultar manualmente una marca de color. El seguimiento se modifica en la entrada oficial, no en una segunda copia de la porción. `publishedOn` anterior se conserva como histórico compatible, pero no se muestra ni se modifica desde los formularios.

### Tareas históricas sin sesiones importadas

`catalog.modules[].taskRegistry` admite únicamente `MÓDULO/tasks.json`. Cada registro privado contiene `{ schemaVersion: 1, moduleCode, tasks }`; sus tareas tienen `id`, `unitCode`, `type`, `code`, `title` y el mismo seguimiento anterior, sin sesiones inventadas ni cambios de autoridad de PD/MET. El gestor combina estas entradas con las listas de las UT sin mantener una misma tarea en ambas fuentes. Al incorporar posteriormente una UT completa se conciliará el registro histórico, conservando IDs y seguimiento; no reimportar por encima de cambios del docente.

Desde el gestor, todas las tareas utilizan **P, C o lápiz → Guardar tarea**, incluidas las históricas. No hay escritura automática por pulsar una casilla. El guardado conserva las otras tareas y campos adicionales, utiliza el SHA leído y vuelve a leer para confirmar. Un conflicto o resultado incierto bloquea el reenvío; permite descargar el borrador y revisar GitHub explícitamente, sin reintentos automáticos. Las lecturas fallidas se señalan como lista incompleta. La vista global filtra también UT históricas que no tienen sesiones en el piloto. Las anotaciones y confirmaciones realizadas directamente en Unidad mantienen su borrador y Guardar cambios; la coordinación con Tareas impide guardar notas ajenas o perderlas.

### Prueba de usuario de los retoques

1. Guarda borradores antes de recargar. Comprueba las bombillas superiores, los selectores sin etiquetas visibles, los filtros Todos/Todas/Todos y el contador visibles/total.
2. Revisa una tarea y un examen: su borde siempre debe ser azul/naranja, tanto con fondo blanco como verde, amarillo o rojo. Comprueba el comienzo MÓDULO · código · título oficial.
3. En una tarea sin fechas, pulsa P: Presentada, Entrega y Corregir deben proponer hoy. Cancela sin cambios. Repite ajustando fechas y confirma; no debe quedar corregida. Una fecha previa no debe sobrescribirse; si faltan algunas, permite completarlas.
4. Prueba filtro global, un módulo y una UT histórica. En una tarea con UT y en una histórica, pulsa Guardar tarea en su diálogo. Actualiza/reconecta para verificar persistencia; no deben mezclarse otras tareas ni perderse notas. Restaura cualquier dato usado solo para probar.
5. En una UT de prueba cerrada en el proyecto, comprueba una sola fila por tarea y la marca automática en su presentación prevista. Una UT en diseño no debe incorporar tareas nuevas al gestor ni perder su seguimiento anterior. No modificar la preparación real solo para hacer esta prueba.
6. Repite filtros, bombillas, P/C y edición en móvil: controles cómodos y sin desbordamiento. Si falla el guardado, debe conservar el borrador y no anunciar éxito.

Verificación técnica: 119 pruebas automatizadas satisfactorias, validación de identidad y preparación, fechas por defecto/parciales, archivo histórico con SHA, guardado confirmado y conflictos sin reintentos. Pruebas visuales sintéticas a 390/320 píxeles y escritorio; no se envían datos ficticios al repositorio de datos.

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


### Vista compacta de Módulo y datos comunes

La vista de Módulo utiliza de forma fija **solo la fecha** en cada sesión. El número de sesión y su descripción completa permanecen en la ayuda accesible y al abrirla. El mes aparece al comenzar la fila y al cambiar de mes; el cambio de año se identifica. Se mantiene la alineación por días y el ajuste al ancho disponible.

Decisión del docente: conservar solo fecha, retirar el selector provisional y su recordatorio, y eliminar los comentarios «Sin sesiones» de la columna UT. Los avisos de lectura incompleta, preparación, colores y accesos permanecen.

Dentro de Módulo, **Sesiones · Horario · Calendario escolar · Evaluaciones** comparten la misma zona. Las tres consultas comunes leen exclusivamente el JSON privado enlazado por `catalog.common.path`, con validación del contrato y sin métodos de escritura. Horario y Evaluaciones permiten consultar este módulo o todos; las evaluaciones se filtran por el grupo confirmado, separando carácter orientativo, límite ordinario y recuperación. Calendario muestra el comienzo/final de clases y los intervalos no lectivos originales. Las excepciones históricas de horario se conservan en su ámbito.

Actualizar consulta vuelve a leer los datos comunes sin cambiar la UT abierta ni guardar sus borradores. Una lectura fallida retira el contenido común anterior y permite reintentar; las sesiones y sus notas siguen intactas. Desconectar limpia también los datos comunes y descarta resultados de peticiones anteriores. No se añaden datos docentes al código público ni sincronización con Excel o Calendar.
