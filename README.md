# HoldingSim: simulador del patrón de espera aeroportuario

Este proyecto representa un aeropuerto con **una sola pista**. Los aviones llegan
de forma aleatoria, esperan si la pista está ocupada y aterrizan cuando el
servidor queda libre. El modelo permite comparar una cola normal (**FIFO**) con
una cola de prioridad para aeronaves en emergencia.

La aplicación no es únicamente una gráfica: calcula las fórmulas del modelo,
ejecuta una simulación estocástica por eventos, compara ambos resultados y
permite observar el sistema mientras avanza.

## 1. Instalación y ejecución

### Requisito

- Node.js 16 o posterior.
- Un navegador moderno: Chrome, Edge o Firefox.

No se necesitan paquetes externos. El proyecto usa únicamente módulos incluidos
en Node.js y JavaScript del navegador.

### Comandos

Abre una terminal en la carpeta del proyecto:

```bash
npm test
npm start
```

`npm test` ejecuta las pruebas matemáticas. `npm start` inicia el servidor local
en el puerto 8080. Después abre:

```text
http://localhost:8080
```

Para usar otro puerto:

```bash
node server.js 3000
```

Luego abre `http://localhost:3000`.

No abras `index.html` con doble clic. El navegador puede mostrar la interfaz,
pero bloqueará los módulos ES y el Web Worker que ejecuta las simulaciones.

## 2. Qué representa el modelo

El modelo es una cola `M/M/1`:

- **M** en llegadas: los aviones llegan según un proceso de Poisson.
- **M** en servicio: el tiempo de aterrizaje sigue una distribución exponencial.
- **1**: existe una sola pista, es decir, un único servidor.

También se pueden probar dos distribuciones alternativas del tiempo de pista:

- **Erlang-k (`M/Ek/1`)**: reduce la variabilidad del servicio.
- **Determinista (`M/D/1`)**: todos los aterrizajes duran lo mismo.

### Parámetros principales

- `λ` (lambda): llegadas de aviones por hora.
- `μ` (mu): aterrizajes que puede atender la pista por hora.
- `ρ = λ / μ`: utilización de la pista.
- `p`: proporción de llegadas que son emergencias.
- `K`: cantidad de aviones usada como umbral de saturación.
- `horizonte`: horas simuladas en total.
- `calentamiento`: horas iniciales que se descartan para evitar el sesgo del
  sistema vacío.
- `réplicas`: cantidad de simulaciones independientes.
- `semilla`: número inicial del generador pseudoaleatorio. La misma semilla,
  junto con los mismos parámetros, produce la misma secuencia de llegadas y
  servicios; por eso permite repetir exactamente un experimento. No representa
  una tasa, tiempo ni cantidad de aviones: cualquier entero, incluido `0`, es
  válido.

### Diccionario de símbolos y unidades

| Símbolo | Nombre | Significado y unidad |
|---|---|---|
| `λ` | lambda | Tasa promedio de llegada: cuántos aviones llegan por hora (`aviones/h`). |
| `μ` | mu | Tasa promedio de servicio: cuántos aterrizajes puede completar la pista por hora (`aterrizajes/h`). |
| `ρ` | rho | Utilización de la pista: `ρ = λ/μ`. Por ejemplo, `ρ = 0,8` significa que la pista está ocupada aproximadamente el 80 % del tiempo. |
| `p` | proporción de emergencias | Fracción de llegadas que son emergencias. `p = 10 %` significa 1 de cada 10 aviones, en promedio. |
| `K` | capacidad segura | Umbral de seguridad en aviones. Si `N ≥ K`, se marca saturación; no es un límite físico de entrada. |
| `N(t)` | aviones en el sistema | Número de aviones en la pista más el patrón de espera en el instante `t`. |
| `Lq` | longitud media de cola | Número promedio de aviones esperando, sin contar el que está aterrizando. |
| `L` | población media | Número promedio de aviones en todo el sistema. |
| `Wq` | espera media | Tiempo promedio que un avión espera antes de comenzar a aterrizar. Se muestra en minutos. |
| `W` | tiempo medio en el sistema | Espera más el tiempo que ocupa la pista. |
| `P(N ≥ K)` | riesgo de saturación | Probabilidad o proporción de tiempo en que hay al menos `K` aviones. |
| `k` | fases de Erlang | Número de fases exponenciales que se suman para representar un servicio. Mayor `k` produce tiempos más regulares. |
| `horizonte` | duración | Horas simuladas que se ejecutan en cada réplica. |
| `calentamiento` | descarte inicial | Horas iniciales que no se usan en las estadísticas para evitar el sesgo de comenzar con la pista vacía. |
| `réplicas` | repeticiones | Corridas independientes del mismo escenario para calcular una media e intervalo de confianza. |

#### ¿Qué significan las distribuciones?

- **Exponencial (`M/M/1`)**: el tiempo entre llegadas y el tiempo de servicio son aleatorios. Es el caso base y puede producir aterrizajes muy cortos o largos, aunque su media sea `1/μ` horas.
- **Erlang-k (`M/Ek/1`)**: cada aterrizaje se modela como la suma de `k` fases aleatorias. Conserva la media `1/μ`, pero reduce la variación; con `k = 2` es una opción intermedia.
- **Determinista (`M/D/1`)**: todos los aterrizajes duran exactamente `1/μ` horas. Sirve para estudiar una pista con tiempos muy regulares.

Estas opciones no cambian la media del servicio cuando se mantiene `μ`; cambian la variabilidad y, por tanto, la espera. La letra final `1` de `M/M/1` indica que existe una sola pista.

La condición más importante es:

```text
ρ < 1  -> sistema estable
ρ >= 1 -> llegan aviones tan rápido como, o más rápido que, la pista
```

Cuando `ρ` se acerca a 1, la espera aumenta rápidamente. Por eso una pista
puede estar técnicamente estable y aun así ser operacionalmente riesgosa.

## 3. Cómo está organizado el código

### Entrada y servidor

- `index.html`: contiene todas las pantallas, formularios, tablas y canvas.
- `server.js`: es necesario para servir los archivos por HTTP y bloquear rutas
  que intenten salir de la carpeta del proyecto. No se debe eliminar.
- `package.json`: es necesario aunque no haya paquetes externos: declara que el
  proyecto usa módulos ES y define los comandos `npm start` y `npm test`. No se
  debe eliminar.
- `assets/favicon.svg`: icono de la aplicación.

### Núcleo matemático

- `js/core/theory.js`: fórmulas de `ρ`, `Lq`, `L`, `Wq`, saturación,
  prioridad de Cobham y umbrales de colapso.
- `js/core/simulator.js`: simulador por eventos discretos. Procesa llegadas,
  aterrizajes, colas, tiempos de espera y estadísticas.
- `js/core/queues.js`: implementa FIFO, montículo binario y cola de prioridad.
- `js/core/random.js`: genera números pseudoaleatorios reproducibles y tiempos
  entre llegadas y de servicio.
- `js/core/statistics.js`: calcula medias, desviaciones e intervalos de
  confianza del 95 %.
- `js/core/experiments.js`: ejecuta réplicas, barridos de parámetros y los
  planes de experimentos del informe.

### Interfaz

- `js/main.js`: punto de entrada; crea el router, el Worker y todas las vistas.
- `js/ui/router.js`: cambia entre las secciones usando el hash de la URL.
- `js/ui/dom.js`: lectura de formularios, formato numérico, tablas y mensajes.
- `js/ui/widgets.js`: tarjetas, barra de progreso y controles compartidos.
- `js/ui/workerClient.js`: comunica la interfaz con el Web Worker.
- `js/ui/views/theoryView.js`: pantalla del modelo teórico.
- `js/ui/views/simulationView.js`: simulación por lotes y comparación teoría vs.
  simulación.
- `js/ui/views/realtimeView.js`: animación paso a paso.
- `js/ui/views/experimentsView.js`: Tablas 2, 3 y 4 del informe.
- `js/ui/views/collapseView.js`: umbrales, gráficas y sensibilidad.

### Gráficas y procesamiento paralelo

- `js/graphics/charts.js`: gráficas de líneas y barras usando Canvas.
- `js/graphics/airportRenderer.js`: dibuja la pista y los aviones.
- `js/graphics/aircraftShape.js`: dibuja la forma visual de cada avión.
- `js/workers/simulation.worker.js`: ejecuta simulaciones pesadas en un hilo
  separado para que la página no se congele.

## 4. Manual de uso

### A. Modelo teórico

1. Entra en **Modelo teórico**.
2. Escribe `λ`, `μ`, `p` y `K`.
3. Selecciona exponencial, Erlang-k o determinista.
4. Lee el aviso de estabilidad.
5. Revisa las tarjetas y la Tabla 1.

Esta pantalla no usa aleatoriedad. Cambiar un parámetro recalcula de inmediato
las fórmulas. La tabla muestra:

- `Lq`: aviones promedio esperando.
- `L`: aviones promedio en todo el sistema.
- `Wq`: espera promedio antes de aterrizar.
- `W`: espera más el tiempo de aterrizaje.
- `P(N >= K)`: riesgo de alcanzar el umbral de saturación.

**Datos de prueba recomendados:** usa `λ = 24`, `μ = 30`, `p = 10 %`,
`K = 10`, distribución **Exponencial**. El sistema queda con `ρ = 0,80`,
por lo que debe aparecer estable. Para comparar distribuciones, conserva esos
valores y prueba Erlang con `k = 2` y luego Determinista.

La sección de prioridad muestra por qué las emergencias esperan menos y los
vuelos normales esperan más. La espera global se conserva: la prioridad
redistribuye el tiempo, pero no crea capacidad adicional.

### B. Simulación por eventos discretos

1. Entra en **Simulación**.
2. Elige la disciplina FIFO o prioridad.
3. Configura el horizonte y el calentamiento.
4. Usa al menos 4 u 8 réplicas para obtener un intervalo más confiable.
5. Presiona **Ejecutar**.
6. Espera a que termine la barra de progreso.

Cada réplica:

1. Genera el siguiente tiempo de llegada.
2. Inserta una llegada en la agenda de eventos.
3. Atiende la llegada si la pista está libre o la agrega a la cola.
4. Programa el fin del aterrizaje.
5. Selecciona el siguiente avión según FIFO o prioridad.
6. Actualiza tiempos, ocupación, cola y saturación.

El resultado combina las réplicas y muestra media e intervalo de confianza del
95 %. La semilla fija hace que el resultado sea repetible: mismos parámetros y
misma semilla producen los mismos valores.

**Datos de prueba rápidos:** `λ = 24`, `μ = 30`, `p = 10 %`, `K = 10`,
disciplina **Prioridad**, tiempo **Exponencial**, horizonte `2.000 h`,
calentamiento `100 h`, `4 réplicas`, semilla `2024`. Para un resultado más
estable usa `8 réplicas`, horizonte `10.000 h` y calentamiento `500 h`.
Para comprobar inestabilidad prueba `λ = 32`, `μ = 30`.

### C. Tiempo real

1. Entra en **Tiempo real**.
2. Ajusta los parámetros del panel derecho.
3. Usa **Pausar/Reanudar** para controlar el reloj.
4. Usa **Reiniciar** para empezar otra corrida.
5. Usa **Declarar emergencia** para insertar manualmente un avión prioritario.

La animación utiliza la misma clase `LandingSimulator` que la simulación por
lotes. Por eso la cola visual y las métricas siguen las mismas reglas
matemáticas.

La **Velocidad** está expresada en minutos simulados por segundo real. No es
un porcentaje ni la tasa `μ`: `0,20 min/s` significa que un aterrizaje medio de
2 minutos tarda unos 10 segundos en verse. Para una demostración lenta usa
`0,10–0,20 min/s`; para una demostración rápida usa `1,00 min/s`.

**Datos de prueba recomendados:** `λ = 24`, `μ = 30`, `p = 10 %`, `K = 10`,
disciplina Prioridad y velocidad `0,20 min/s`. Pulsa **Reiniciar**, observa la
cola y usa **Declarar emergencia** para insertar un avión prioritario.

### D. Experimentos del informe

En **Experimentos**:

- **Experimento 1** cambia `ρ` y valida FIFO contra la fórmula `M/M/1`.
- **Experimento 2** compara FIFO, emergencias y vuelos normales.
- **Tabla 4** calcula el aumento teórico de espera normal:

```text
1 / (1 - pρ) - 1
```

El botón **Configuración del informe** coloca un horizonte largo y 8 réplicas.
Para una demostración rápida se puede usar un horizonte menor; para resultados
del informe conviene usar el preset.

En esta pantalla `λ` no aparece como campo porque se genera automáticamente
para cada carga: `λ = ρ × μ`. Con `μ = 30`, por ejemplo, `ρ = 0,80` equivale
a `λ = 24 aviones/h`. `μ` sigue siendo la capacidad de servicio de la pista.

**Datos de prueba rápidos:** `μ = 30`, `K = 10`, `p = 10 %`, horizonte
`2.000 h`, calentamiento `100 h`, `4 réplicas`, semilla `2024`. Ejecuta ambos
experimentos y deben aparecer la Tabla 2, la Tabla 3 y sus dos gráficas.
Para el informe final pulsa **Configuración del informe** y vuelve a ejecutar.

### E. Umbral de colapso

1. Entra en **Umbral de colapso**.
2. Define `μ`, `K`, el porcentaje de alerta y la espera máxima aceptable.
3. Selecciona espera global o espera de vuelos normales.
4. Escribe un `λ` para evaluar un escenario.

La pantalla calcula:

- el `λ` donde el riesgo supera el porcentaje de alerta;
- el `λ` donde la espera supera el máximo permitido;
- la clasificación del escenario actual;
- curvas de espera y saturación;
- sensibilidad ante diferentes capacidades y velocidades de servicio.

**Datos de prueba recomendados:** `μ = 30`, `K = 10`, alerta `5 %`,
espera máxima `10 min`, espera global, `λ` evaluada `24 aviones/h` y
`p = 10 %`. El caso debe quedar cerca de la zona de alerta; prueba luego
`λ = 27 aviones/h` para observar una espera mayor.

## 5. Cómo explicar el proyecto

Una explicación breve y correcta es:

> El proyecto modela una pista como un sistema de colas `M/M/1`. Las llegadas
> son aleatorias, la pista atiende un avión a la vez y las emergencias tienen
> prioridad sin interrumpir un aterrizaje que ya comenzó. Primero se calculan
> resultados teóricos y después se ejecutan réplicas mediante simulación por
> eventos discretos. Finalmente se comparan las medias simuladas con la teoría
> y se identifica cuándo la utilización o la espera vuelven inseguro el
> sistema.

Si preguntan por qué se usan réplicas, la respuesta es que una simulación
aleatoria individual puede desviarse del valor esperado. Varias réplicas
permiten calcular una media y un intervalo de confianza.

Si preguntan por `K`, aclara que `K` es un **umbral de seguridad**, no un límite
físico que impida que entren más aviones. El sistema continúa funcionando,
pero se marca como saturado cuando `N >= K`.

## 6. Pruebas y solución de problemas

Ejecuta:

```bash
npm test
```

Las pruebas validan las estructuras de cola, las fórmulas, los umbrales, la
reproducibilidad y la convergencia aproximada de la simulación.

Problemas comunes:

- **Pantalla vacía o botones sin respuesta:** confirma que ejecutaste
  `npm start` y abriste la dirección HTTP.
- **La simulación tarda:** reduce el horizonte o las réplicas para probar; usa
  el preset largo únicamente para resultados finales.
- **La simulación no coincide exactamente con la teoría:** es normal por la
  aleatoriedad; revisa el intervalo de confianza y aumenta el horizonte.
- **`ρ >= 1`:** reduce `λ` o aumenta `μ`; en ese régimen no existe una espera
  estacionaria finita.
