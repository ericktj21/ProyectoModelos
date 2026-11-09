# HoldingSim: simulador del patrón de espera aeroportuario

Este proyecto representa un aeropuerto con **una sola pista**. Los aviones llegan
de forma aleatoria, esperan si la pista está ocupada y aterrizan cuando el
servidor queda libre. El modelo permite comparar una cola normal (**FIFO**) con
una cola de prioridad para aeronaves en emergencia.

La aplicación calcula las fórmulas del modelo, ejecuta experimentos
reproducibles y permite observar el sistema mientras avanza. Las secciones
disponibles son **Modelo teórico**, **Tiempo real** y **Experimentos**.

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
- `js/ui/views/realtimeView.js`: animación paso a paso.
- `js/ui/views/experimentsView.js`: Tablas 2, 3 y 4 del informe.

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

### B. Tiempo real

1. Entra en **Tiempo real**.
2. Ajusta los parámetros del panel derecho.
3. Usa **Pausar/Reanudar** para controlar el reloj.
4. Usa **Reiniciar** para empezar otra corrida.
5. Usa **Declarar emergencia** para insertar manualmente un avión prioritario.

La animación utiliza la clase `LandingSimulator`, por lo que la cola visual y
las métricas siguen las mismas reglas matemáticas que los experimentos.

La **Velocidad** está expresada en minutos simulados por segundo real. No es
un porcentaje ni la tasa `μ`: `0,20 min/s` significa que un aterrizaje medio de
2 minutos tarda unos 10 segundos en verse. Para una demostración lenta usa
`0,10–0,20 min/s`; para una demostración rápida usa `1,00 min/s`.

**Datos de prueba recomendados:** `λ = 24`, `μ = 30`, `p = 10 %`, `K = 10`,
disciplina Prioridad y velocidad `0,20 min/s`. Pulsa **Reiniciar**, observa la
cola y usa **Declarar emergencia** para insertar un avión prioritario.

Para mostrar que el sistema se satura, prueba `λ = 29`, `μ = 30`, `p = 20 %`,
`K = 5` y velocidad `0,50 min/s`. Para llevarlo al límite usa `λ = 35`,
`μ = 30`: como `ρ > 1`, la cola crecerá continuamente. Si la animación parece
vacía, aumenta la velocidad o pulsa **Reiniciar** después de cambiar los
parámetros.

### C. Experimentos del informe

En **Experimentos**:

- **Experimento 1** cambia `ρ` y valida FIFO contra la fórmula `M/M/1`.
- **Experimento 2** compara FIFO, emergencias y vuelos normales.
- **Tabla 4** calcula el aumento teórico de espera normal:

```text
1 / (1 - pρ) - 1
```

El botón **Configuración del informe** coloca un horizonte largo y 8 réplicas.
Para una demostración rápida usa un horizonte menor; para resultados del informe
conviene usar el preset. Se requieren al menos 2 réplicas.

En esta pantalla `λ` no aparece como campo porque se genera automáticamente
para cada carga: `λ = ρ × μ`. Con `μ = 30`, por ejemplo, `ρ = 0,80` equivale
a `λ = 24 aviones/h`. `μ` sigue siendo la capacidad de servicio de la pista.

**Datos de prueba rápidos:** `μ = 30`, `K = 10`, `p = 10 %`, horizonte
`2.000 h`, calentamiento `100 h`, `4 réplicas`, semilla `2024`. Ejecuta ambos
experimentos para generar las tablas y gráficas.

Para un resultado más estable usa `μ = 30`, `K = 10`, horizonte `40.000 h`,
calentamiento `1.000 h`, `8 réplicas` y semilla `2024`. Es la configuración del
botón **Configuración del informe**.

#### Por qué la línea verde de emergencias queda baja

La línea verde es la espera de **emergencias**, no la espera total. La
disciplina de prioridad las coloca delante de los vuelos normales que todavía
no comenzaron a aterrizar. No interrumpe el aterrizaje que ya está en curso,
por eso se llama prioridad **sin expropiación**.

La espera que se ahorran las emergencias la absorben los vuelos normales, que
aparecen en rojo. La espera global no desaparece: solo se redistribuye.
Además, en el experimento se comparan las emergencias con una cola FIFO
completa, por lo que es normal que la verde quede por debajo de la línea gris.

Con `μ = 30` y `p = 10 %`, los valores teóricos aproximados son:

| ρ | FIFO gris | Emergencias verdes | Normales rojos |
|---:|---:|---:|---:|
| 0,50 | 2,0 min | 2,1 min | 4,2 min |
| 0,80 | 8,0 min | 3,5 min | 17,4 min |
| 0,90 | 18,0 min | 4,0 min | 40,0 min |
| 0,95 | 38,0 min | 4,2 min | 84,2 min |

Para que la diferencia se vea claramente usa `μ = 30`, `p = 20 %`,
`K = 10`, horizonte `40.000 h`, calentamiento `1.000 h`, `8 réplicas` y
semilla `2024`. En `ρ = 0,95`, la emergencia sigue cerca de 4,7 minutos,
mientras el vuelo normal puede superar 90 minutos. Si `p = 0 %`, la línea
verde no representa una clase con llegadas y la comparación pierde sentido.

#### Escenarios para demostrar la funcionalidad

| Objetivo | μ | p | Cargas observadas | Horizonte | Calentamiento | Réplicas | Semilla |
|---|---:|---:|---|---:|---:|---:|---:|
| Operación estable | 30 | 5 % | ρ = 0,50–0,80 | 2.000 h | 100 h | 4 | 2024 |
| Prioridad visible | 30 | 20 % | ρ = 0,80–0,95 | 40.000 h | 1.000 h | 8 | 2024 |
| Alta congestión | 30 | 20 % | ρ = 0,90–0,95 | 40.000 h | 1.000 h | 8 | 2024 |

En los dos últimos casos la diferencia se observa sobre todo en `ρ = 0,90`
y `ρ = 0,95`. La carga `ρ` no se escribe en el formulario: el programa la
genera internamente como `λ = ρ × μ`.

## 5. Cómo explicar el proyecto

Una explicación breve y correcta es:

> El proyecto modela una pista como un sistema de colas `M/M/1`. Las llegadas
> son aleatorias, la pista atiende un avión a la vez y las emergencias tienen
> prioridad sin interrumpir un aterrizaje que ya comenzó. El modelo teórico
> calcula las métricas, Tiempo real muestra la dinámica y Experimentos ejecuta
> réplicas para comparar FIFO, emergencias y vuelos normales.

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
