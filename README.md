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
- `semilla`: número que permite repetir exactamente el mismo experimento.

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
- `server.js`: sirve los archivos por HTTP y bloquea rutas que intenten salir
  de la carpeta del proyecto.
- `package.json`: define los comandos `npm start` y `npm test`.
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

### C. Tiempo real

1. Entra en **Tiempo real**.
2. Ajusta los parámetros del panel derecho.
3. Usa **Pausar/Reanudar** para controlar el reloj.
4. Usa **Reiniciar** para empezar otra corrida.
5. Usa **Declarar emergencia** para insertar manualmente un avión prioritario.

La animación utiliza la misma clase `LandingSimulator` que la simulación por
lotes. Por eso la cola visual y las métricas siguen las mismas reglas
matemáticas.

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
